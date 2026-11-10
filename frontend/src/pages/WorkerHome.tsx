import { Link, Navigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, Eye, EyeOff, Inbox, Power, Star, Wallet, BadgeCheck } from 'lucide-react'
import { Alert, Card, LangSwitch, Spinner, Stars, StatusBadge } from '../components/ui'
import { ACTIVE_STATUSES, AppShell, Avatar, Page, useMyJobs, useNames } from '../components/shell'
import { ListenButton } from '../components/listen'
import { useI18n, tErr, type Key } from '../lib/i18n'
import { supabase, rpc, errorCode } from '../lib/supabase'
import { useAuth, useProfile } from '../lib/auth'
import { nameOf, useRefData } from '../lib/data'

type Avail = 'available' | 'busy' | 'offline'

export default function WorkerHome() {
  const { t, lang } = useI18n()
  const { session } = useAuth()
  const profile = useProfile()
  const qc = useQueryClient()
  const { categories } = useRefData()
  const uid = session!.user.id
  const wp = useQuery({ queryKey: ['worker', uid], queryFn: async () => {
    const { data, error } = await supabase.from('worker_profiles').select('manual_availability, onboarded_at, visit_fee_from').eq('user_id', uid).single(); if (error) throw error; return data } })
  const rating = useQuery({ queryKey: ['myRating', uid], queryFn: async () => {
    const { data } = await supabase.from('reviews').select('rating, comment, created_at, customer_id').eq('worker_id', uid).order('created_at', { ascending: false }); const r = data ?? []
    return { avg: r.length ? r.reduce((s, x) => s + x.rating, 0) / r.length : null, n: r.length, latest: r[0] } } })
  const jobsQ = useMyJobs()
  const setAvail = useMutation({ mutationFn: (s: 'available' | 'offline') => rpc('set_availability', { p_status: s }), onSuccess: () => qc.invalidateQueries({ queryKey: ['worker', uid] }) })
  const jobs = jobsQ.data ?? []
  const names = useNames([...jobs.map((j) => j.customer_id), ...(rating.data?.latest ? [rating.data.latest.customer_id] : [])])

  if (wp.isLoading || jobsQ.isLoading) return <AppShell><Spinner /></AppShell>
  if (wp.data && !wp.data.onboarded_at && !wp.isFetching) return <Navigate to="/w/onboarding" replace />
  const active = jobs.find((j) => ACTIVE_STATUSES.includes(j.status))
  const current: Avail = active ? 'busy' : (wp.data?.manual_availability as Avail)
  const fresh = jobs.filter((j) => j.status === 'requested')
  const done = jobs.filter((j) => j.status === 'completed').length
  const Go = lang === 'ur' ? ArrowLeft : ArrowRight
  const name = profile.data?.display_name ?? ''

  const tiles: { v: Avail; Icon: typeof Power; sub: Key }[] = [
    { v: 'available', Icon: CheckCircle2, sub: 'avail_sub' },
    { v: 'busy', Icon: Clock, sub: 'busy_sub' },
    { v: 'offline', Icon: Power, sub: 'offline_sub' },
  ]
  const tileCls: Record<Avail, string> = { available: 'bg-brand text-white', busy: 'bg-accent text-ink', offline: 'bg-ink text-white' }
  const iconCls: Record<Avail, string> = { available: 'bg-brand-subtle text-brand', busy: 'bg-accent-subtle text-accent-text', offline: 'bg-muted text-ink-2' }

  return (
    <AppShell>
      <Page>
        <header className="flex items-center gap-3">
          <Avatar name={name} size="size-14" text="text-lg" />
          <div className="flex-1 min-w-0"><div className="text-sm text-ink-2">{t('salaam')}</div><h1 className="text-2xl font-extrabold truncate">{name}</h1></div>
          <ListenButton compact text={[t('salaam'), name, `${t('yourStatus')}: ${t(current)}`, current === 'busy' ? t('busyHint') : current === 'available' ? t('availableHint') : t('offlineHint'), fresh.length ? `${fresh.length} ${t('newRequests')}. ${t('replySoon')}` : t('noNewRequests')].join('. ')} />
          <div className="lg:hidden"><LangSwitch /></div>
        </header>

        <div className="grid gap-5 md:grid-cols-2 items-start">
          <div className="flex flex-col gap-5">
            <Card className="flex flex-col gap-4 p-5">
              <h2 className="text-lg font-bold">{t('yourStatus')}</h2>
              <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label={t('yourStatus')}>
                {tiles.map(({ v, Icon, sub }) => {
                  const sel = current === v
                  const disabled = v === 'busy' || !!active || setAvail.isPending
                  return (
                    <button key={v} role="radio" aria-checked={sel} aria-label={t(v)} disabled={disabled} onClick={() => v !== 'busy' && setAvail.mutate(v)}
                      className={`relative rounded-2xl p-3 min-h-32 flex flex-col items-center justify-center gap-2 text-center border-2 transition-colors ${sel ? `${tileCls[v]} border-transparent shadow-md` : 'bg-surface border-muted hover:border-line-strong'} ${disabled && !sel ? 'opacity-60' : ''}`}>
                      <span className={`size-11 rounded-full grid place-items-center ${sel ? 'bg-white/20' : iconCls[v]}`}><Icon className="size-6" aria-hidden /></span>
                      <span className="font-bold leading-tight">{t(v)}</span>
                      <span className={`text-xs ${sel ? 'opacity-90' : 'text-ink-2'}`}>{t(sub)}</span>
                    </button>
                  )
                })}
              </div>
              <div className={`rounded-xl px-4 py-3 flex gap-3 items-start ${current === 'available' ? 'bg-brand-subtle text-brand-hover' : current === 'busy' ? 'bg-accent-subtle text-accent-text' : 'bg-subtle text-ink-2'}`}>
                {current === 'offline' ? <EyeOff className="size-5 shrink-0 mt-0.5" aria-hidden /> : <Eye className="size-5 shrink-0 mt-0.5" aria-hidden />}
                <span className="font-semibold">{current === 'busy' ? t('busyHint') : current === 'available' ? t('availableHint') : t('offlineHint')}</span>
              </div>
              {setAvail.error && <Alert>{tErr(t, errorCode(setAvail.error))}</Alert>}
            </Card>

            {active && (
              <Link to={`/job/${active.id}`} className="block">
                <Card className="border-2 border-accent flex flex-col gap-3 p-5 hover:shadow-md">
                  <div className="flex items-center justify-between gap-2"><span className="text-sm font-bold text-accent-text">{t('activeJob')}</span><StatusBadge status={active.status} /></div>
                  <div className="flex items-center gap-3"><Avatar name={names[active.customer_id] ?? ''} /><div className="min-w-0"><div className="font-bold">{names[active.customer_id]}</div><div className="text-ink-2 truncate">{active.problem}</div></div></div>
                  <span className="min-h-12 rounded-xl bg-accent text-ink font-bold inline-flex items-center justify-center gap-2">{t('openJob')}<Go className="size-5" aria-hidden /></span>
                </Card>
              </Link>
            )}

            {fresh.length ? (
              <Card className="border-2 border-brand flex flex-col gap-4 p-5">
                <div className="flex items-center gap-3">
                  <span className="size-12 rounded-full bg-brand-subtle text-brand grid place-items-center shrink-0"><Inbox className="size-6" aria-hidden /></span>
                  <div><div className="text-xl font-extrabold"><span className="num">{fresh.length}</span> {t('newRequests')}</div><div className="text-sm text-ink-2">{t('replySoon')}</div></div>
                </div>
                <Link to="/w/requests" className="min-h-14 rounded-xl bg-brand text-white font-bold inline-flex items-center justify-center gap-2 hover:bg-brand-hover">{t('seeRequests')}<Go className="size-5" aria-hidden /></Link>
              </Card>
            ) : !active && (
              <Card className="flex items-center gap-3 p-5">
                <span className="size-12 rounded-full bg-subtle text-ink-2 grid place-items-center shrink-0"><Inbox className="size-6" aria-hidden /></span>
                <div><div className="font-bold">{t('noNewRequests')}</div><div className="text-sm text-ink-2">{t('noNewRequestsSub')}</div></div>
              </Card>
            )}

          </div>

          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 md:grid-cols-1 gap-3">
              {[
                { Icon: Star, v: rating.data?.avg ? rating.data.avg.toFixed(1) : '—', k: 'stat_rating' as Key, extra: rating.data?.n ? `(${rating.data.n})` : '' },
                { Icon: BadgeCheck, v: String(done), k: 'stat_jobs' as Key, extra: '' },
                { Icon: Wallet, v: wp.data?.visit_fee_from ? `Rs ${wp.data.visit_fee_from}` : '—', k: 'stat_fee' as Key, extra: '' },
              ].map(({ Icon, v, k, extra }) => (
                <Card key={k} className="flex flex-col md:flex-row items-center gap-1 md:gap-3 p-3 md:px-5 text-center md:text-start">
                  <Icon className="size-5 text-brand md:order-first" aria-hidden />
                  <span className="text-lg font-extrabold en">{v}</span>
                  <span className="text-xs md:text-sm text-ink-2">{t(k)} {extra && <span className="en">{extra}</span>}</span>
                </Card>
              ))}
            </div>
            {rating.data?.latest && (
              <Card className="flex flex-col gap-2 p-5">
                <div className="text-sm font-bold">{t('latestReview')} · {names[rating.data.latest.customer_id] ?? ''}</div>
                <Stars value={rating.data.latest.rating} />
                {rating.data.latest.comment && <p>{rating.data.latest.comment}</p>}
              </Card>
            )}
          </div>
        </div>

        {!!jobs.length && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">{t('requests')}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {jobs.slice(0, 4).map((j) => (
                <Link key={j.id} to={`/job/${j.id}`}><Card className="flex items-center gap-3 border-2 hover:border-brand">
                  <Avatar name={names[j.customer_id] ?? ''} size="size-10" text="text-sm" />
                  <div className="flex-1 min-w-0"><div className="font-bold truncate">{names[j.customer_id]} · {nameOf(categories.find((c) => c.id === j.category_id), lang)}</div><div className="text-sm text-ink-2 truncate">{j.problem}</div></div>
                  <StatusBadge status={j.status} />
                </Card></Link>
              ))}
            </div>
          </section>
        )}
      </Page>
    </AppShell>
  )
}
