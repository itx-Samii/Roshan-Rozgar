import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Bell, X } from 'lucide-react'
import { useI18n, type Key } from '../lib/i18n'
import { useAuth, useProfile } from '../lib/auth'
import { supabase, type JobStatus } from '../lib/supabase'

type Toast = { id: number; title: string; body?: string; jobId?: string }
const Ctx = createContext<{ push: (t: Omit<Toast, 'id'>) => void; markSelf: (jobId: string) => void }>({ push: () => {}, markSelf: () => {} })
export const useNotify = () => useContext(Ctx)

/** Status change → popup text, per role. Only changes made by the OTHER person are announced. */
const forWorker: Partial<Record<JobStatus, [Key, Key?]>> = {
  requested: ['n_new_request', 'n_new_request_b'], confirmed: ['n_confirmed', 'n_confirmed_b'],
  completed: ['n_completed'], cancelled: ['n_cancelled'], disputed: ['n_disputed'],
}
const forCustomer: Partial<Record<JobStatus, [Key, Key?]>> = {
  quoted: ['n_quoted', 'n_quoted_b'], in_progress: ['n_in_progress'], awaiting_confirmation: ['n_awaiting', 'n_awaiting_b'], cancelled: ['n_cancelled'],
}

export function NotifyProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const nav = useNavigate()
  const { session } = useAuth()
  const profile = useProfile()
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)
  const selfActs = useRef(new Map<string, number>())
  const prevJobs = useRef<Map<string, string> | null>(null)
  const lastMsgAt = useRef<string | null>(null)

  const push = useCallback((x: Omit<Toast, 'id'>) => {
    const id = ++seq.current
    setToasts((ts) => [...ts.slice(-2), { ...x, id }])
    try { navigator.vibrate?.(120) } catch { /* not supported */ }
    setTimeout(() => setToasts((ts) => ts.filter((y) => y.id !== id)), 9000)
  }, [])
  const markSelf = useCallback((jobId: string) => { selfActs.current.set(jobId, Date.now()) }, [])

  const uid = session?.user.id
  const role = profile.data?.role
  const jobs = useQuery({ queryKey: ['notify-jobs', uid], enabled: !!uid && !!role, refetchInterval: 5000, refetchIntervalInBackground: true, queryFn: async () => {
    const col = role === 'worker' ? 'worker_id' : 'customer_id'
    const { data } = await supabase.from('jobs').select('id, status, updated_at').eq(col, uid!).order('updated_at', { ascending: false }).limit(50)
    return (data ?? []) as { id: string; status: JobStatus; updated_at: string }[]
  } })
  const msgs = useQuery({ queryKey: ['notify-msgs', uid], enabled: !!uid && !!role, refetchInterval: 5000, refetchIntervalInBackground: true, queryFn: async () => {
    const { data } = await supabase.from('job_messages').select('id, job_id, sender_id, body, created_at').neq('sender_id', uid!).order('created_at', { ascending: false }).limit(5)
    return data ?? []
  } })

  useEffect(() => { prevJobs.current = null; lastMsgAt.current = null }, [uid])

  useEffect(() => {
    if (!jobs.data || !role) return
    const map = new Map(jobs.data.map((j) => [j.id, j.status]))
    const prev = prevJobs.current
    prevJobs.current = map
    if (!prev) return // first load: don't announce history
    const table = role === 'worker' ? forWorker : forCustomer
    for (const j of jobs.data) {
      if (prev.get(j.id) === j.status) continue
      const self = selfActs.current.get(j.id)
      if (self && Date.now() - self < 20000) continue
      const msg = table[j.status]
      if (msg) push({ title: t(msg[0]), body: msg[1] ? t(msg[1]) : undefined, jobId: j.id })
    }
  }, [jobs.data, role, push, t])

  useEffect(() => {
    const newest = msgs.data?.[0]
    if (!newest) return
    if (lastMsgAt.current && newest.created_at > lastMsgAt.current && !location.pathname.endsWith(newest.job_id)) {
      push({ title: t('n_message'), body: newest.body.slice(0, 80), jobId: newest.job_id })
    }
    lastMsgAt.current = newest.created_at
  }, [msgs.data, push, t])

  return (
    <Ctx.Provider value={{ push, markSelf }}>
      {children}
      <div aria-live="polite" className="fixed z-[60] top-3 inset-x-3 md:inset-x-auto md:end-4 md:w-96 flex flex-col gap-2 pointer-events-none">
        {toasts.map((x) => (
          <div key={x.id} role="status" className="pointer-events-auto bg-ink text-white rounded-2xl shadow-2xl p-4 flex gap-3 items-start animate-[rr-in_.25s_ease-out]">
            <span className="size-10 rounded-full bg-accent text-ink grid place-items-center shrink-0"><Bell className="size-5" aria-hidden /></span>
            <div className="flex-1 min-w-0">
              <div className="font-bold">{x.title}</div>
              {x.body && <div className="text-sm opacity-90 truncate">{x.body}</div>}
              {x.jobId && <button className="mt-2 min-h-10 px-4 rounded-full bg-white text-ink font-bold" onClick={() => { setToasts((ts) => ts.filter((y) => y.id !== x.id)); nav(`/job/${x.jobId}`) }}>{t('open')}</button>}
            </div>
            <button aria-label={t('close')} className="size-10 grid place-items-center rounded-full hover:bg-white/10" onClick={() => setToasts((ts) => ts.filter((y) => y.id !== x.id))}><X className="size-5" /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
