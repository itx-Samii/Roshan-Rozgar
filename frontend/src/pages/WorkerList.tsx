import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, MapPin, Search, Send, Wallet } from 'lucide-react'
import { Alert, Availability, Button, Card, Chip, Spinner, TopBar } from '../components/ui'
import { AppShell, Avatar, useIsDesktop } from '../components/shell'
import { WorkerProfileBody, type WorkerRow } from '../components/workerProfile'
import { useI18n, tErr } from '../lib/i18n'
import { rpc, supabase, errorCode } from '../lib/supabase'
import { nameOf, useRefData, yearsLabel } from '../lib/data'

export type { WorkerRow }

export default function WorkerList() {
  const { t, lang } = useI18n()
  const [p] = useSearchParams()
  const nav = useNavigate()
  const desktop = useIsDesktop()
  const cat = Number(p.get('cat')); const area = Number(p.get('area'))
  const { categories, areas } = useRefData()
  const [onlyAvail, setOnlyAvail] = useState(false)
  const [min4, setMin4] = useState(false)
  const [best, setBest] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['search', cat, area], refetchInterval: 15000, queryFn: () => rpc<WorkerRow[]>('search_workers', { p_category: cat, p_area: area }) })
  const all = (q.data ?? []).filter((w) => w.availability !== 'offline')
  const served = useQuery({ queryKey: ['servedAreas', all.map((w) => w.worker_id).join()], enabled: all.length > 0, queryFn: async () => {
    const { data } = await supabase.from('worker_areas').select('worker_id, area_id').in('worker_id', all.map((w) => w.worker_id))
    const m: Record<string, number[]> = {}; for (const r of data ?? []) (m[r.worker_id] ??= []).push(r.area_id); return m } })
  const catName = nameOf(categories.find((c) => c.id === cat), lang)
  const areaName = nameOf(areas.find((a) => a.id === area), lang)
  let rows = all.filter((w) => (!onlyAvail || w.availability === 'available') && (!min4 || Number(w.rating ?? 0) >= 4))
  rows = best ? [...rows].sort((a, b) => Number(b.rating ?? 0) - Number(a.rating ?? 0)) : rows
  const nAvail = all.filter((w) => w.availability === 'available').length
  const Chev = lang === 'ur' ? ChevronLeft : ChevronRight
  const current = rows.find((w) => w.worker_id === selected) ?? rows.find((w) => w.availability === 'available')
  const go = (id: string) => nav(`/c/worker/${id}?cat=${cat}&area=${area}`)
  const open = (id: string) => (desktop ? setSelected(id) : go(id))

  const pair = (on: boolean, set: (v: boolean) => void, a: string, b: string) => (
    <div className="flex flex-wrap gap-2"><Chip single selected={on} onClick={() => set(true)}>{a}</Chip><Chip single selected={!on} onClick={() => set(false)}>{b}</Chip></div>
  )

  const card = (w: WorkerRow) => {
    const areaNames = (served.data?.[w.worker_id] ?? []).map((a) => nameOf(areas.find((x) => x.id === a), lang)).join('، ')
    const sel = desktop && current?.worker_id === w.worker_id
    return (
      <Card key={w.worker_id} className={`flex flex-col gap-3 p-5 ${sel ? 'border-2 border-brand shadow-md' : ''}`}>
        <div className="flex items-start gap-3">
          <Avatar name={w.display_name} size="size-14" text="text-lg" />
          <div className="flex-1 min-w-0"><div className="text-lg font-bold truncate">{w.display_name}</div><div className="text-sm text-ink-2">{catName} · <span className="num">{yearsLabel(w.years_experience)}</span> {t('yrs')}</div></div>
          <Availability value={w.availability} />
        </div>
        <div className="flex flex-wrap items-start gap-x-4 gap-y-1 text-sm">
          {w.review_count
            ? <span className="inline-flex items-center gap-1"><span className="text-accent" aria-hidden>★</span><span className="num font-bold">{Number(w.rating).toFixed(1)}</span><span className="text-ink-2">(<span className="num">{w.completed_jobs}</span> {t('jobsDone')})</span></span>
            : <span className="text-ink-2">{t('newWorker')}</span>}
          {areaNames && <span className="inline-flex items-start gap-1 text-ink-2"><MapPin className="size-4 shrink-0 mt-0.5" aria-hidden />{t('serves')} {areaNames}</span>}
        </div>
        {w.visit_fee_from ? <span className="self-start rounded-full bg-subtle px-3 py-1 text-sm font-semibold inline-flex items-center gap-1"><Wallet className="size-4" aria-hidden />{t('visitFrom')} <span className="en">Rs {w.visit_fee_from}</span></span> : null}
        {w.availability === 'busy'
          ? <Alert kind="warning">{t('busyReason')}</Alert>
          : <button onClick={() => open(w.worker_id)} aria-pressed={sel || undefined} className="min-h-14 rounded-xl border-2 border-brand text-brand font-bold inline-flex items-center justify-center gap-2 hover:bg-brand-subtle">{t('viewProfile')}<Chev className="size-5" aria-hidden /></button>}
      </Card>
    )
  }

  const empty = q.data && !rows.length && (
    <Card className="text-center flex flex-col items-center gap-3 py-8">
      <span className="size-20 rounded-full bg-muted grid place-items-center"><Search className="size-10 text-ink-2" aria-hidden /></span>
      <h2 className="text-xl font-bold">{t('noWorkers')}</h2><p className="text-ink-2">{t('noWorkersSub')}</p>
    </Card>
  )
  const count = q.data && <p className="font-semibold"><span className="num">{nAvail}</span> {t('availableNow')} · <span className="num">{all.length - nAvail}</span> {t('busy')}</p>

  if (desktop) return (
    <AppShell>
      <main className="max-w-[1200px] mx-auto w-full px-6 py-8 grid grid-cols-[220px_minmax(0,1fr)_minmax(0,460px)] gap-6 items-start">
        <Card className="flex flex-col gap-5 p-5 sticky top-24">
          <h2 className="text-lg font-bold">{t('filters')}</h2>
          <div className="flex flex-col gap-2"><span className="font-semibold">{t('area')}</span><span className="inline-flex items-center gap-2 text-ink-2"><MapPin className="size-4" aria-hidden />{areaName}, Lahore</span></div>
          <div className="flex flex-col gap-2"><span className="font-semibold">{t('availability')}</span>{pair(onlyAvail, setOnlyAvail, t('filterAvailable'), t('includeBusy'))}</div>
          <div className="flex flex-col gap-2"><span className="font-semibold">{t('ratingLabel')}</span>{pair(!min4, (v) => setMin4(!v), t('anyRating'), t('fourUp'))}</div>
          <div className="flex flex-col gap-2"><span className="font-semibold">{t('sortBy')}</span>{pair(!best, (v) => setBest(!v), t('availableFirst'), t('filterBest'))}</div>
        </Card>
        <section className="flex flex-col gap-4">
          <div><h1 className="text-2xl font-extrabold">{catName} · {t('nearYou')}</h1>{count}</div>
          {q.isLoading && <Spinner />}
          {q.error && <Alert>{tErr(t, errorCode(q.error))}</Alert>}
          {empty}
          {rows.map(card)}
        </section>
        <aside className="sticky top-24">
          <Card className="p-6 flex flex-col gap-5 max-h-[calc(100dvh-8rem)] overflow-y-auto overflow-x-hidden">
            {current ? (
              <>
                <WorkerProfileBody id={current.worker_id} cat={cat} row={current} />
                <div className="flex flex-col gap-2 border-t border-muted pt-4">
                  <Button onClick={() => go(current.worker_id)}><Send className="size-5" aria-hidden />{t('request')} · {current.display_name}</Button>
                  <p className="text-sm text-ink-2 text-center">{t('freeToRequest')}</p>
                </div>
              </>
            ) : <p className="text-ink-2 text-center py-10">{t('selectWorker')}</p>}
          </Card>
        </aside>
      </main>
    </AppShell>
  )

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto"><TopBar title={`${catName} · ${areaName}`} /></div>
      <main className="max-w-[1200px] mx-auto w-full px-4 md:px-8 py-4 flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Chip selected={onlyAvail} onClick={() => setOnlyAvail((v) => !v)}>{t('filterAvailable')}</Chip>
          <Chip selected={min4} onClick={() => setMin4((v) => !v)}>{t('fourUp')}</Chip>
          <Chip selected={best} onClick={() => setBest((v) => !v)}>{t('filterBest')}</Chip>
        </div>
        {count}
        {q.isLoading && <Spinner />}
        {q.error && <Alert>{tErr(t, errorCode(q.error))}<Button variant="tertiary" onClick={() => q.refetch()}>↻</Button></Alert>}
        {empty}
        <div className="grid gap-4 md:grid-cols-2">{rows.map(card)}</div>
      </main>
    </AppShell>
  )
}
