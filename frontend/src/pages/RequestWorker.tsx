import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Mic, Square } from 'lucide-react'
import { Alert, Button, Card, Screen, Spinner, Stars, TopBar } from '../components/ui'
import { useI18n, tErr } from '../lib/i18n'
import { supabase, rpc, errorCode } from '../lib/supabase'
import { nameOf, useDictation, useRefData } from '../lib/data'

const field = 'w-full rounded-xl border border-line-strong bg-surface px-4 py-3'

export default function RequestWorker() {
  const { t, lang } = useI18n()
  const { id } = useParams(); const [p] = useSearchParams()
  const cat = Number(p.get('cat')); const area = Number(p.get('area'))
  const nav = useNavigate()
  const { categories, areas } = useRefData()
  const dict = useDictation(lang)
  const [problem, setProblem] = useState(() => sessionStorage.getItem('rr-draft-problem') ?? '')
  const [address, setAddress] = useState(() => sessionStorage.getItem('rr-draft-address') ?? '')
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)
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
  if (worker.isLoading) return <Spinner />
  const w = worker.data!
  return (
    <Screen footer={<Button loading={busy} disabled={problem.trim().length < 3 || address.trim().length < 5} onClick={send}>{t('request')}</Button>}>
      <TopBar title={w.name} />
      <Card className="flex flex-col gap-2">
        <div className="text-lg font-bold">{w.name}</div>
        <div className="text-ink-2">{nameOf(categories.find((c) => c.id === cat), lang)} · <span className="num">{w.years_experience}</span> {t('yrs')}{w.visit_fee_from ? <> · {t('visitFrom')} <span className="num">Rs {w.visit_fee_from}</span></> : null}</div>
        <Alert kind="info">{t('notVerified')}</Alert>
        {w.reviews.map((r, i) => <div key={i} className="border-t border-muted pt-2"><Stars value={r.rating} /> <span className="text-ink-2">{r.comment}</span></div>)}
      </Card>
      {error && <Alert>{error}</Alert>}
      <label className="flex flex-col gap-2 font-semibold">{t('describe')}
        <div className="flex gap-2 items-start">
          <textarea className={`${field} min-h-28 flex-1`} maxLength={500} value={problem} onChange={(e) => { setProblem(e.target.value); keep('rr-draft-problem', e.target.value) }} />
          <button type="button" aria-label={t('speak')} onClick={() => (dict.listening ? dict.stop() : dict.start((txt) => { const v = (problem + ' ' + txt).trim().slice(0, 500); setProblem(v); keep('rr-draft-problem', v) }))}
            className={`size-14 shrink-0 rounded-full grid place-items-center text-white ${dict.listening ? 'bg-danger' : 'bg-brand'}`}>{dict.listening ? <Square className="size-5" /> : <Mic className="size-6" />}</button>
        </div>
      </label>
      {dict.listening && <Alert kind="info">{t('listening')}</Alert>}
      {dict.error && <Alert kind="warning">{t('voiceUnavailable')}</Alert>}
      <label className="flex flex-col gap-2 font-semibold">{t('address')}
        <input className={`${field} min-h-14`} maxLength={200} value={address} onChange={(e) => { setAddress(e.target.value); keep('rr-draft-address', e.target.value) }} placeholder={nameOf(areas.find((a) => a.id === area), lang)} />
      </label>
    </Screen>
  )
}
