import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Briefcase, CalendarDays, Home, Inbox, User } from 'lucide-react'
import { useI18n, type Key } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { useAuth, useProfile } from '../lib/auth'
import type { Job } from '../lib/data'
import { Logo } from './ui'

export const ACTIVE_STATUSES = ['confirmed', 'in_progress', 'awaiting_confirmation']

/** All of my jobs (as worker or customer), shared by the shell badges and the pages. */
export function useMyJobs() {
  const { session } = useAuth()
  const profile = useProfile()
  const role = profile.data?.role
  const uid = session?.user.id
  return useQuery({
    queryKey: ['jobs', role, uid], enabled: !!uid && !!role, refetchInterval: 5000,
    queryFn: async () => {
      const col = role === 'worker' ? 'worker_id' : 'customer_id'
      const { data, error } = await supabase.from('jobs').select('*').eq(col, uid!).order('updated_at', { ascending: false }).limit(50)
      if (error) throw error
      return data as Job[]
    },
  })
}

/** Display names for a set of user ids (profiles are readable by signed-in users). */
export function useNames(ids: string[]) {
  const key = [...new Set(ids)].sort()
  return useQuery({
    queryKey: ['names', key], enabled: key.length > 0, staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, display_name').in('id', key)
      return Object.fromEntries((data ?? []).map((p) => [p.id, p.display_name])) as Record<string, string>
    },
  }).data ?? {}
}

export function Avatar({ name, size = 'size-12', text = 'text-base' }: { name: string; size?: string; text?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
  return <span className={`${size} ${text} shrink-0 rounded-full bg-brand-subtle text-brand font-bold grid place-items-center`} aria-hidden>{initials}</span>
}

export function useTimeAgo() {
  const { t } = useI18n()
  return (iso: string) => {
    const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
    if (m < 1) return t('justNow')
    if (m < 60) return `${m} ${t('minAgo')}`
    if (m < 60 * 24) return `${Math.round(m / 60)} ${t('hrAgo')}`
    return `${Math.round(m / 1440)} ${t('dayAgo')}`
  }
}

type Item = { to: string; key: Key; Icon: typeof Home; badge?: number; end?: boolean }

/**
 * Signed-in layout from Figma: bottom tab bar on phones, side navigation on laptops/desktops.
 * Badges show how many items need the user's attention.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const profile = useProfile()
  const jobs = useMyJobs().data ?? []
  const isWorker = profile.data?.role === 'worker'
  const items: Item[] = isWorker
    ? [
        { to: '/w', key: 'nav_home', Icon: Home, end: true },
        { to: '/w/requests', key: 'nav_requests', Icon: Inbox, badge: jobs.filter((j) => j.status === 'requested').length },
        { to: '/w/jobs', key: 'nav_myJobs', Icon: Briefcase, badge: jobs.filter((j) => ACTIVE_STATUSES.includes(j.status)).length },
        { to: '/w/profile', key: 'nav_profile', Icon: User },
      ]
    : [
        { to: '/c', key: 'nav_home', Icon: Home, end: true },
        { to: '/c/bookings', key: 'nav_bookings', Icon: CalendarDays, badge: jobs.filter((j) => ['quoted', 'awaiting_confirmation'].includes(j.status)).length },
        { to: '/c/profile', key: 'nav_profile', Icon: User },
      ]

  const link = (it: Item, side: boolean) => (
    <NavLink key={it.to} to={it.to} end={it.end}
      className={({ isActive }) => side
        ? `relative flex items-center gap-3 rounded-xl px-4 min-h-12 font-semibold ${isActive ? 'bg-brand-subtle text-brand-hover' : 'text-ink-2 hover:bg-subtle'}`
        : `relative flex-1 flex flex-col items-center justify-center gap-0.5 pt-2 pb-2.5 text-xs font-semibold ${isActive ? 'text-brand-hover' : 'text-ink-2'}`}>
      {({ isActive }) => (
        <>
          <span className={side ? 'relative' : `relative px-5 py-1 rounded-full ${isActive ? 'bg-brand-subtle' : ''}`}>
            <it.Icon className="size-6" aria-hidden />
            {!!it.badge && <span className="absolute -top-1.5 -end-2 min-w-5 h-5 px-1 rounded-full bg-danger text-white text-[11px] font-bold grid place-items-center en" aria-label={`${it.badge}`}>{it.badge}</span>}
          </span>
          <span>{t(it.key)}</span>
        </>
      )}
    </NavLink>
  )

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_minmax(0,1fr)]">
      <nav aria-label="Main" className="hidden md:flex flex-col gap-1 sticky top-0 h-dvh border-e border-muted bg-surface p-4">
        <div className="flex items-center gap-2 px-2 pb-6 pt-2"><Logo size={36} /><span className="font-extrabold text-lg">{t('appName')}</span></div>
        {items.map((it) => link(it, true))}
      </nav>
      <div className="pb-28 md:pb-0 min-w-0">{children}</div>
      <nav aria-label="Main" className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-surface/95 backdrop-blur border-t border-muted flex pb-[env(safe-area-inset-bottom)]">
        {items.map((it) => link(it, false))}
      </nav>
    </div>
  )
}

/** Page body inside the shell. */
export function Page({ children, wide = true }: { children: ReactNode; wide?: boolean }) {
  return <main className={`${wide ? 'max-w-5xl' : 'max-w-xl'} mx-auto w-full px-4 md:px-8 py-5 md:py-8 flex flex-col gap-5`}>{children}</main>
}
