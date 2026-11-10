import { Link, Navigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, LogOut, Power } from 'lucide-react'
import { Alert, Card, LangSwitch, Screen, Spinner, StatusBadge, TopBar } from '../components/ui'
import { useI18n, tErr } from '../lib/i18n'
import { supabase, rpc, errorCode } from '../lib/supabase'
import { useAuth, useProfile } from '../lib/auth'
import { nameOf, useRefData, type Job } from '../lib/data'

const ACTIVE = ['confirmed', 'in_progress', 'awaiting_confirmation']

export default function WorkerHome() {
  const { t, lang } = useI18n()
  const { session } = useAuth()
  const profile = useProfile()
  const qc = useQueryClient()
  const { categories } = useRefData()
  const uid = session!.user.id
  const wp = useQuery({ queryKey: ['worker', uid], queryFn: async () => {
    const { data, error } = await supabase.from('worker_profiles').select('manual_availability, onboarded_at').eq('user_id', uid).single(); if (error) throw error; return data } })
  const jobs = useQuery({ queryKey: ['jobs', 'worker', uid], refetchInterval: 5000, queryFn: async () => {
    const { data, error } = await supabase.from('jobs').select('*').eq('worker_id', uid).order('updated_at', { ascending: false }).limit(30); if (error) throw error; return data as Job[] } })
  const setAvail = useMutation({ mutationFn: (s: 'available' | 'offline') => rpc('set_availability', { p_status: s }), onSuccess: () => qc.invalidateQueries({ queryKey: ['worker', uid] }) })

  if (wp.isLoading || jobs.isLoading) return <Spinner />
  if (wp.data && !wp.data.onboarded_at && !wp.isFetching) return <Navigate to="/w/onboarding" replace />
  const busy = (jobs.data ?? []).some((j) => ACTIVE.includes(j.status))
  const manual = wp.data?.manual_availability as 'available' | 'offline'
  const open = (jobs.data ?? []).filter((j) => !['completed', 'cancelled'].includes(j.status))
  const closed = (jobs.data ?? []).filter((j) => ['completed', 'cancelled'].includes(j.status)).slice(0, 5)

  const tile = (v: 'available' | 'offline', Icon: typeof Power, on: string) => {
    const selected = !busy && manual === v
    return (
      <button role="radio" aria-checked={selected} aria-label={t(v)} disabled={busy || setAvail.isPending} onClick={() => setAvail.mutate(v)}
        className={`flex-1 rounded-2xl p-4 flex flex-col items-center gap-2 border-2 min-h-28 ${selected ? `${on} border-transparent text-white` : 'bg-surface border-muted'} disabled:opacity-60`}>
        <Icon className="size-8" aria-hidden /><span className="font-bold">{t(v)}</span>
      </button>
    )
  }

  return (
    <Screen>
      <TopBar title={profile.data?.display_name ?? ''} back={false} end={<><LangSwitch /><button aria-label={t('logout')} onClick={() => supabase.auth.signOut()} className="size-12 grid place-items-center"><LogOut className="size-5" /></button></>} />
      <section aria-labelledby="st" className="flex flex-col gap-3">
        <h2 id="st" className="text-xl font-bold">{t('yourStatus')}</h2>
        <div className="flex gap-3" role="radiogroup">{tile('available', CheckCircle2, 'bg-brand')}{tile('offline', Power, 'bg-ink')}</div>
        {busy ? <Alert kind="warning">{t('busyHint')}</Alert> : <Alert kind={manual === 'available' ? 'success' : 'info'}>{manual === 'available' ? t('availableHint') : t('offlineHint')}</Alert>}
        {setAvail.error && <Alert>{tErr(t, errorCode(setAvail.error))}</Alert>}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">{t('requests')}</h2>
        {!open.length && <Card className="text-center text-ink-2">{t('noRequests')}</Card>}
        {[...open, ...closed].map((j) => (
          <Link key={j.id} to={`/job/${j.id}`}>
            <Card className="flex flex-col gap-2 hover:border-brand border-2">
              <div className="flex items-center justify-between gap-2"><span className="font-bold">{nameOf(categories.find((c) => c.id === j.category_id), lang)}</span><StatusBadge status={j.status} /></div>
              <p className="text-ink-2 line-clamp-2">{j.problem}</p>
            </Card>
          </Link>
        ))}
      </section>
    </Screen>
  )
}
