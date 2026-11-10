import { useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { Alert, Availability, Button, Card, Screen, Spinner, Stars, TopBar } from '../components/ui'
import { useI18n, tErr } from '../lib/i18n'
import { rpc, errorCode } from '../lib/supabase'
import { nameOf, useRefData, yearsLabel } from '../lib/data'

export type WorkerRow = { worker_id: string; display_name: string; years_experience: number; visit_fee_from: number | null; availability: 'available' | 'busy' | 'offline'; rating: number | null; review_count: number; completed_jobs: number }

export default function WorkerList() {
  const { t, lang } = useI18n()
  const [p] = useSearchParams()
  const nav = useNavigate()
  const cat = Number(p.get('cat')); const area = Number(p.get('area'))
  const { categories, areas } = useRefData()
  const q = useQuery({ queryKey: ['search', cat, area], refetchInterval: 15000, queryFn: () => rpc<WorkerRow[]>('search_workers', { p_category: cat, p_area: area }) })
  const title = `${nameOf(categories.find((c) => c.id === cat), lang)} · ${nameOf(areas.find((a) => a.id === area), lang)}`
  const rows = (q.data ?? []).filter((w) => w.availability !== 'offline')
  return (
    <Screen>
      <TopBar title={title} />
      {q.isLoading && <Spinner />}
      {q.error && <Alert>{tErr(t, errorCode(q.error))}<Button variant="tertiary" onClick={() => q.refetch()}>↻</Button></Alert>}
      {q.data && !rows.length && (
        <Card className="text-center flex flex-col items-center gap-3 py-8">
          <span className="size-20 rounded-full bg-muted grid place-items-center"><Search className="size-10 text-ink-2" aria-hidden /></span>
          <h2 className="text-xl font-bold">{t('noWorkers')}</h2><p className="text-ink-2">{t('noWorkersSub')}</p>
        </Card>
      )}
      {rows.map((w) => (
        <Card key={w.worker_id} className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="size-14 rounded-full bg-brand-subtle text-brand font-bold grid place-items-center en">{w.display_name.slice(0, 2).toUpperCase()}</span>
            <div className="flex-1"><div className="text-lg font-bold">{w.display_name}</div><div className="text-sm text-ink-2"><span className="num">{yearsLabel(w.years_experience)}</span> {t('yrs')} · <span className="num">{w.completed_jobs}</span> {t('jobsDone')}</div></div>
            <Availability value={w.availability} />
          </div>
          <div className="text-sm">{w.review_count ? <span className="inline-flex items-center gap-2"><Stars value={Number(w.rating)} /><span className="num font-bold">{Number(w.rating).toFixed(1)}</span><span className="text-ink-2 num">({w.review_count})</span></span> : <span className="text-ink-2">{t('newWorker')}</span>}
            {w.visit_fee_from ? <span className="text-ink-2"> · {t('visitFrom')} <span className="num">Rs {w.visit_fee_from}</span></span> : null}</div>
          {w.availability === 'busy' ? <Alert kind="warning">{t('busyReason')}</Alert>
            : <Button variant="secondary" onClick={() => nav(`/c/worker/${w.worker_id}?cat=${cat}&area=${area}`)}>{t('request')}</Button>}
        </Card>
      ))}
    </Screen>
  )
}
