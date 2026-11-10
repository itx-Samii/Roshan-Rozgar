import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { Alert, Button, Card, Spinner, TopBar } from '../components/ui'
import { AppShell } from '../components/shell'
import { VoiceField } from '../components/inputs'
import { WorkerProfileBody, useWorkerDetail, type WorkerRow } from '../components/workerProfile'
import { useI18n, tErr } from '../lib/i18n'
import { rpc, errorCode } from '../lib/supabase'
import { nameOf, useRefData } from '../lib/data'

export default function RequestWorker() {
  const { t, lang } = useI18n()
  const { id } = useParams(); const [p] = useSearchParams()
  const cat = Number(p.get('cat')); const area = Number(p.get('area'))
  const nav = useNavigate()
  const { areas } = useRefData()
  const [problem, setProblem] = useState(() => sessionStorage.getItem('rr-draft-problem') ?? '')
  const [address, setAddress] = useState(() => sessionStorage.getItem('rr-draft-address') ?? '')
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)
  const search = useQuery({ queryKey: ['search', cat, area], queryFn: () => rpc<WorkerRow[]>('search_workers', { p_category: cat, p_area: area }) })
  const worker = useWorkerDetail(id)
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
  const name = worker.data?.name ?? ''
  const row = search.data?.find((x) => x.worker_id === id)
  const ready = problem.trim().length >= 3 && address.trim().length >= 5

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto"><TopBar title={t('viewProfile')} /></div>
      <main className="max-w-[1200px] mx-auto w-full px-4 md:px-8 py-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] items-start">
        <section><WorkerProfileBody id={id!} cat={cat} row={row} /></section>
        <aside id="request" className="flex flex-col gap-4 lg:sticky lg:top-24 scroll-mt-20">
          <Card className="flex flex-col gap-4 p-5 border-2 border-brand">
            <h2 className="text-lg font-bold">{t('yourRequest')}</h2>
            <VoiceField label={t('describe')} value={problem} onChange={(v) => { setProblem(v); keep('rr-draft-problem', v) }} maxLength={500} />
            <label className="flex flex-col gap-2 font-semibold">{t('address')}
              <input className="w-full rounded-xl border border-line-strong bg-surface px-4 py-3 min-h-14 font-normal" maxLength={200} value={address}
                onChange={(e) => { setAddress(e.target.value); keep('rr-draft-address', e.target.value) }} placeholder={nameOf(areas.find((a) => a.id === area), lang)} />
            </label>
            {error && <Alert>{error}</Alert>}
            <Button loading={busy} disabled={!ready} onClick={send}><Send className="size-5" aria-hidden />{t('request')} · {name}</Button>
            <p className="text-sm text-ink-2 text-center">{t('freeToRequest')}</p>
          </Card>
        </aside>
      </main>
      <div className="lg:hidden fixed inset-x-0 bottom-[68px] z-10 bg-surface/95 backdrop-blur border-t border-muted px-4 py-3">
        <button onClick={() => { document.getElementById('request')?.scrollIntoView({ behavior: 'smooth' }); setTimeout(() => document.querySelector<HTMLTextAreaElement>('#request textarea')?.focus(), 400) }}
          className="w-full min-h-14 rounded-xl bg-brand text-white font-bold inline-flex items-center justify-center gap-2"><Send className="size-5" aria-hidden />{t('request')} · {name}</button>
      </div>
      <div className="h-24 lg:hidden" />
    </AppShell>
  )
}
