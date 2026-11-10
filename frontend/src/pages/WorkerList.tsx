import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, MapPin, Search, Wallet } from 'lucide-react'
import { Alert, Availability, Button, Card, Chip, Spinner, TopBar } from '../components/ui'
import { AppShell, Avatar } from '../components/shell'
import { useI18n, tErr } from '../lib/i18n'
import { rpc, supabase, errorCode } from '../lib/supabase'
import { nameOf, useRefData, yearsLabel } from '../lib/data'

export type WorkerRow = { worker_id: string; display_name: string; years_experience: number; visit_fee_from: number | null; availability: 'available' | 'busy' | 'offline'; rating: number | null; review_count: number; completed_jobs: number }

export default function WorkerList() {
  const { t, lang } = useI18n()
  const [p] = useSearchParams()
  const nav = useNavigate()
  const cat = Number(p.get('cat')); const area = Number(p.get('area'))
  const { categories, areas } = useRefData()
  const [onlyAvail, setOnlyAvail] = useState(false)
  const [best, setBest] = useState(false)
  const q = useQuery({ queryKey: ['search', cat, area], refetchInterval: 15000, queryFn: () => rpc<WorkerRow[]>('search_workers', { p_category: cat, p_area: area }) })
  const all = (q.data ?? []).filter((w) => w.availability !== 'offline')
  const served = useQuery({ queryKey: ['servedAreas', all.map((w) => w.worker_id).join()], enabled: all.length > 0, queryFn: async () => {
    const { data } = await supabase.from('worker_areas').select('worker_id, area_id').in('worker_id', all.map((w) => w.worker_id))
    const m: Record<string, number[]> = {}; for (const r of data ?? []) (m[r.worker_id] ??= []).push(r.area_id); return m } })
  const catName = nameOf(categories.find((c) => c.id === cat), lang)
  const title = `${catName} · ${nameOf(areas.find((a) => a.id === area), lang)}`
  let rows = onlyAvail ? all.filter((w) => w.availability === 'available') : all
  if (best) rows = [...rows].sort((a, b) => Number(b.rating ?? 0) - Number(a.rating ?? 0))
  const nAvail = all.filter((w) => w.availability === 'available').length
  const Chev = lang === 'ur' ? ChevronLeft : ChevronRight

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto"><TopBar title={title} /></div>
      <main className="max-w-5xl mx-auto w-full px-4 md:px-8 py-4 flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Chip selected={onlyAvail} onClick={() => setOnlyAvail((v) => !v)}>{t('filterAvailable')}</Chip>
          <Chip selected={best} onClick={() => setBest((v) => !v)}>{t('filterBest')}</Chip>
        </div>
        {q.data && <p className="font-semibold"><span className="num">{nAvail}</span> {t('availableNow')} · <span className="num">{all.length - nAvail}</span> {t('busy')}</p>}
        {q.isLoading && <Spinner />}
        {q.error && <Alert>{tErr(t, errorCode(q.error))}<Button variant="tertiary" onClick={() => q.refetch()}>↻</Button></Alert>}
        {q.data && !rows.length && (
          <Card className="text-center flex flex-col items-center gap-3 py-8">
            <span className="size-20 rounded-full bg-muted grid place-items-center"><Search className="size-10 text-ink-2" aria-hidden /></span>
            <h2 className="text-xl font-bold">{t('noWorkers')}</h2><p className="text-ink-2">{t('noWorkersSub')}</p>
          </Card>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((w) => {
            const open = () => nav(`/c/worker/${w.worker_id}?cat=${cat}&area=${area}`)
            const areaNames = (served.data?.[w.worker_id] ?? []).map((a) => nameOf(areas.find((x) => x.id === a), lang)).join('، ')
            return (
              <Card key={w.worker_id} className="flex flex-col gap-3 p-5">
                <div className="flex items-start gap-3">
                  <Avatar name={w.display_name} size="size-14" text="text-lg" />
                  <div className="flex-1 min-w-0"><div className="text-lg font-bold truncate">{w.display_name}</div><div className="text-sm text-ink-2">{catName} · <span className="num">{yearsLabel(w.years_experience)}</span> {t('yrs')}</div></div>
                  <Availability value={w.availability} />
                </div>
                <div className="flex flex-wrap items-start gap-x-4 gap-y-1 text-sm">
                  {w.review_count
                    ? <span className="inline-flex items-center gap-1"><span className="text-accent" aria-hidden>★</span><span className="num font-bold">{Number(w.rating).toFixed(1)}</span><span className="text-ink-2"><span className="num">({w.completed_jobs}</span> {t('jobsDone')})</span></span>
                    : <span className="text-ink-2">{t('newWorker')}</span>}
                  {areaNames && <span className="inline-flex items-start gap-1 text-ink-2"><MapPin className="size-4 shrink-0 mt-0.5" aria-hidden />{t('serves')} {areaNames}</span>}
                </div>
                {w.visit_fee_from ? <span className="self-start rounded-full bg-subtle px-3 py-1 text-sm font-semibold inline-flex items-center gap-1"><Wallet className="size-4" aria-hidden />{t('visitFrom')} <span className="en">Rs {w.visit_fee_from}</span></span> : null}
                {w.availability === 'busy'
                  ? <Alert kind="warning">{t('busyReason')}</Alert>
                  : <button onClick={open} className="min-h-14 rounded-xl border-2 border-brand text-brand font-bold inline-flex items-center justify-center gap-2 hover:bg-brand-subtle">{t('viewProfile')}<Chev className="size-5" aria-hidden /></button>}
              </Card>
            )
          })}
        </div>
      </main>
    </AppShell>
  )
}
