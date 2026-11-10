import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Check, MapPin, Send, Tag, Zap } from 'lucide-react'
import { Alert, Card, Spinner, StatusBadge, tradeIcons } from '../components/ui'
import { AppShell, Avatar, Page, useMyJobs, useNames, useTimeAgo } from '../components/shell'
import { useNotify } from '../components/notify'
import { useI18n, tErr, type Key } from '../lib/i18n'
import { rpc, errorCode } from '../lib/supabase'
import { nameOf, useRefData, type Job } from '../lib/data'

type Tab = 'new' | 'quoted' | 'old'
const inTab: Record<Tab, (j: Job) => boolean> = {
  new: (j) => j.status === 'requested',
  quoted: (j) => j.status === 'quoted',
  old: (j) => ['completed', 'cancelled', 'disputed'].includes(j.status),
}

export default function WorkerRequests() {
  const { t, lang } = useI18n()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { markSelf } = useNotify()
  const ago = useTimeAgo()
  const { categories, areas } = useRefData()
  const q = useMyJobs()
  const jobs = q.data ?? []
  const names = useNames(jobs.map((j) => j.customer_id))
  const [tab, setTab] = useState<Tab>('new')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const list = jobs.filter(inTab[tab])

  const decline = async (id: string) => {
    setBusyId(id); setError(null); markSelf(id)
    try { await rpc('job_action', { p_job: id, p_action: 'decline' }) } catch (e) { setError(tErr(t, errorCode(e))) }
    finally { setBusyId(null); qc.invalidateQueries({ queryKey: ['jobs'] }) }
  }

  const tabs: { v: Tab; k: Key }[] = [{ v: 'new', k: 'tab_new' }, { v: 'quoted', k: 'tab_quoted' }, { v: 'old', k: 'tab_old' }]
  return (
    <AppShell>
      <Page>
        <header><h1 className="text-2xl font-extrabold">{t('nav_requests')}</h1><p className="text-ink-2">{t('requestsSub')}</p></header>
        <div className="flex flex-wrap gap-2" role="tablist">
          {tabs.map(({ v, k }) => {
            const n = jobs.filter(inTab[v]).length; const sel = tab === v
            return (
              <button key={v} role="tab" aria-selected={sel} onClick={() => setTab(v)}
                className={`min-h-11 rounded-full px-5 font-semibold inline-flex items-center gap-2 border-2 ${sel ? 'bg-brand-subtle border-brand text-brand-hover' : 'bg-surface border-line text-ink'}`}>
                {sel && <Check className="size-4" aria-hidden />}{t(k)}{v !== 'old' && <span className="num">({n})</span>}
              </button>
            )
          })}
        </div>
        {error && <Alert>{error}</Alert>}
        {q.isLoading && <Spinner />}
        {!q.isLoading && !list.length && <Card className="text-center text-ink-2 py-10">{tab === 'new' ? t('noNewRequests') : t('nothingHere')}</Card>}
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((j) => {
            const cat = categories.find((c) => c.id === j.category_id); const Icon = (cat && tradeIcons[cat.slug]) || Zap
            const who = names[j.customer_id] ?? ''
            return (
              <Card key={j.id} className={`flex flex-col gap-4 p-5 ${j.status === 'requested' ? 'border-2 border-brand' : ''}`}>
                <div className="flex items-center gap-3">
                  <Avatar name={who} />
                  <div className="flex-1 min-w-0"><div className="font-bold truncate">{who}</div><div className="text-sm text-ink-2">{ago(j.created_at)}</div></div>
                  {j.status === 'requested'
                    ? <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold inline-flex items-center gap-1"><Send className="size-4" aria-hidden />{t('newRequestPill')}</span>
                    : <StatusBadge status={j.status} />}
                </div>
                <p className="text-lg font-semibold flex gap-2 items-start"><Icon className="size-5 text-accent-text shrink-0 mt-1" aria-hidden />{j.problem}</p>
                <p className="text-ink-2 flex items-center gap-2"><MapPin className="size-4 shrink-0" aria-hidden />{nameOf(areas.find((a) => a.id === j.area_id), lang)} · {nameOf(cat, lang)}</p>
                {j.status === 'requested' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <button disabled={busyId === j.id} onClick={() => decline(j.id)} className="min-h-14 rounded-xl border-2 border-brand text-brand font-bold hover:bg-brand-subtle disabled:opacity-50">{t('decline')}</button>
                    <button onClick={() => nav(`/job/${j.id}`)} className="min-h-14 rounded-xl bg-brand text-white font-bold inline-flex items-center justify-center gap-2 hover:bg-brand-hover"><Tag className="size-5" aria-hidden />{t('givePrice')}</button>
                  </div>
                ) : (
                  <Link to={`/job/${j.id}`} className="min-h-12 rounded-xl border-2 border-line text-ink font-bold inline-flex items-center justify-center hover:border-brand">{t('open')}</Link>
                )}
              </Card>
            )
          })}
        </div>
      </Page>
    </AppShell>
  )
}
