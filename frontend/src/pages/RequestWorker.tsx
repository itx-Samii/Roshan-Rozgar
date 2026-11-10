import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { CreditCard, Info, Phone, Send } from 'lucide-react'
import { Alert, Availability, Button, Card, Spinner, Stars, TopBar } from '../components/ui'
import { AppShell, Avatar, useTimeAgo } from '../components/shell'
import { VoiceField } from '../components/inputs'
import { useI18n, tErr, type Key } from '../lib/i18n'
import { supabase, rpc, errorCode } from '../lib/supabase'
import { nameOf, useRefData, yearsLabel } from '../lib/data'
import type { WorkerRow } from './WorkerList'

export default function RequestWorker() {
  const { t, lang } = useI18n()
  const ago = useTimeAgo()
  const { id } = useParams(); const [p] = useSearchParams()
  const cat = Number(p.get('cat')); const area = Number(p.get('area'))
  const nav = useNavigate()
  const { categories, areas } = useRefData()
  const [problem, setProblem] = useState(() => sessionStorage.getItem('rr-draft-problem') ?? '')
  const [address, setAddress] = useState(() => sessionStorage.getItem('rr-draft-address') ?? '')
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)
  const search = useQuery({ queryKey: ['search', cat, area], queryFn: () => rpc<WorkerRow[]>('search_workers', { p_category: cat, p_area: area }) })
  const worker = useQuery({ queryKey: ['workerDetail', id], queryFn: async () => {
    const [{ data: prof }, { data: wp }, { data: reviews }] = await Promise.all([
      supabase.from('profiles').select('display_name').eq('id', id!).single(),
      supabase.from('worker_profiles').select('years_experience, visit_fee_from').eq('user_id', id!).single(),
      supabase.from('reviews').select('rating, comment, created_at').eq('worker_id', id!).order('created_at', { ascending: false }).limit(5),
    ])
    return { name: prof?.display_name ?? '', ...wp, reviews: reviews ?? [] }
  } })
  const keep = (k: string, v: string) => { try { sessionStorage.setItem(k, v) } catch { /* ignore */ } }

  const send = async () => {
    setBusy(true); setError(null)
    try {
      const jobId = await rpc<string>('create_job_request', { p_worker: id, p_category: cat, p_area: area, p_problem: problem, p_address: address })
      sessionStorage.removeItem('rr-draft-problem'); sessionStorage.removeItem('rr-draft-address')
      nav(`/job/${jobId}`, { replace: true })
    } catch (e) { setError(tErr(t, errorCode(e))) } finally { setBusy(false) }
  }
  if (worker.isLoading) return <AppShell><Spinner /></AppShell>
  const w = worker.data!
  const row = search.data?.find((x) => x.worker_id === id)
  const ready = problem.trim().length >= 3 && address.trim().length >= 5
  const checks: { Icon: typeof Phone; k: Key; b: Key }[] = [
    { Icon: Phone, k: 'chk_phone', b: 'chk_phone_b' }, { Icon: CreditCard, k: 'chk_cnic', b: 'chk_cnic_b' }, { Icon: Info, k: 'chk_bg', b: 'chk_bg_b' },
  ]

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto"><TopBar title={t('viewProfile')} /></div>
      <main className="max-w-5xl mx-auto w-full px-4 md:px-8 py-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px] items-start">
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={w.name} size="size-20" text="text-2xl" />
            <div className="min-w-0"><h1 className="text-2xl font-extrabold">{w.name}</h1><div className="text-ink-2">{nameOf(categories.find((c) => c.id === cat), lang)} · Lahore</div>
              <div className="flex flex-wrap items-center gap-2 mt-1">{row && <Availability value={row.availability} />}{row?.review_count ? <span className="inline-flex items-center gap-1"><span className="text-accent">★</span><span className="num font-bold">{Number(row.rating).toFixed(1)}</span></span> : null}</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Card className="text-center p-3"><div className="font-extrabold text-lg"><span className="num">{yearsLabel(w.years_experience ?? 0)}</span> <span className="text-sm">{lang === 'ur' ? 'سال' : 'yrs'}</span></div><div className="text-xs text-ink-2">{t('expLabel')}</div></Card>
            <Card className="text-center p-3"><div className="font-extrabold text-lg num">{row?.completed_jobs ?? 0}</div><div className="text-xs text-ink-2">{t('stat_jobs')}</div></Card>
            <Card className="text-center p-3"><div className="font-extrabold text-lg en">{w.visit_fee_from ? `Rs ${w.visit_fee_from}` : '—'}</div><div className="text-xs text-ink-2">{t('stat_fee')}</div></Card>
          </div>
          <Card className="flex flex-col gap-4 p-5">
            <h2 className="text-lg font-bold">{t('whatChecked')}</h2>
            {checks.map(({ Icon, k, b }) => (
              <div key={k} className="flex gap-3 items-start"><span className="size-10 rounded-full bg-subtle text-ink-2 grid place-items-center shrink-0"><Icon className="size-5" aria-hidden /></span><div><div className="font-semibold">{t(k)}</div><div className="text-sm text-ink-2">{t(b)}</div></div></div>
            ))}
          </Card>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">{t('reviewsTitle')}</h2>
            {!w.reviews.length && <Card className="text-ink-2">{t('noReviews')}</Card>}
            {w.reviews.map((r, i) => <Card key={i} className="flex flex-col gap-1"><div className="flex justify-between"><Stars value={r.rating} /><span className="text-xs text-ink-3">{ago(r.created_at)}</span></div>{r.comment && <p>{r.comment}</p>}</Card>)}
          </section>
        </section>

        <aside id="request" className="flex flex-col gap-4 lg:sticky lg:top-20 scroll-mt-20">
          <Card className="flex flex-col gap-4 p-5 border-2 border-brand">
            <h2 className="text-lg font-bold">{t('yourRequest')}</h2>
            <VoiceField label={t('describe')} value={problem} onChange={(v) => { setProblem(v); keep('rr-draft-problem', v) }} maxLength={500} />
            <label className="flex flex-col gap-2 font-semibold">{t('address')}
              <input className="w-full rounded-xl border border-line-strong bg-surface px-4 py-3 min-h-14 font-normal" maxLength={200} value={address}
                onChange={(e) => { setAddress(e.target.value); keep('rr-draft-address', e.target.value) }} placeholder={nameOf(areas.find((a) => a.id === area), lang)} />
            </label>
            {error && <Alert>{error}</Alert>}
            <Button loading={busy} disabled={!ready} onClick={send}><Send className="size-5" aria-hidden />{t('request')} · {w.name}</Button>
            <p className="text-sm text-ink-2 text-center">{t('freeToRequest')}</p>
          </Card>
        </aside>
      </main>
      <div className="lg:hidden fixed inset-x-0 bottom-[68px] md:bottom-0 z-10 bg-surface/95 backdrop-blur border-t border-muted px-4 py-3">
        <button onClick={() => { document.getElementById('request')?.scrollIntoView({ behavior: 'smooth' }); setTimeout(() => document.querySelector<HTMLTextAreaElement>('#request textarea')?.focus(), 400) }}
          className="w-full min-h-14 rounded-xl bg-brand text-white font-bold inline-flex items-center justify-center gap-2"><Send className="size-5" aria-hidden />{t('request')} · {w.name}</button>
      </div>
      <div className="h-24 lg:hidden" />
    </AppShell>
  )
}
