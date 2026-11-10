import { Link } from 'react-router'
import { Card, Spinner, StatusBadge } from '../components/ui'
import { ACTIVE_STATUSES, AppShell, Avatar, Page, useMyJobs, useNames, useTimeAgo } from '../components/shell'
import { useI18n } from '../lib/i18n'
import { useProfile } from '../lib/auth'
import { nameOf, useRefData, type Job } from '../lib/data'

/** Worker "My jobs" and customer "Bookings": what needs attention first, then history. */
export default function JobsList() {
  const { t, lang } = useI18n()
  const ago = useTimeAgo()
  const isWorker = useProfile().data?.role === 'worker'
  const { categories } = useRefData()
  const q = useMyJobs()
  const jobs = q.data ?? []
  const otherId = (j: Job) => (isWorker ? j.customer_id : j.worker_id)
  const names = useNames(jobs.map(otherId))
  const needsMe = (j: Job) => (isWorker ? j.status === 'requested' : ['quoted', 'awaiting_confirmation'].includes(j.status))
  const activeSet = isWorker ? ACTIVE_STATUSES : ['requested', 'quoted', ...ACTIVE_STATUSES]
  const active = jobs.filter((j) => activeSet.includes(j.status))
  const past = jobs.filter((j) => ['completed', 'cancelled', 'disputed'].includes(j.status))

  const row = (j: Job) => (
    <Link key={j.id} to={`/job/${j.id}`}>
      <Card className={`flex items-center gap-3 border-2 hover:border-brand ${needsMe(j) ? 'border-accent' : ''}`}>
        <Avatar name={names[otherId(j)] ?? ''} />
        <div className="flex-1 min-w-0">
          <div className="font-bold truncate">{names[otherId(j)]} · {nameOf(categories.find((c) => c.id === j.category_id), lang)}</div>
          <div className="text-sm text-ink-2 truncate">{j.problem}</div>
          <div className="text-xs text-ink-3">{ago(j.updated_at)}{j.agreed_price ? <> · <span className="en font-semibold">Rs {j.agreed_price.toLocaleString('en-PK')}</span></> : null}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={j.status} />
          {needsMe(j) && <span className="text-xs font-bold text-accent-text">{t('needsYou')}</span>}
        </div>
      </Card>
    </Link>
  )

  return (
    <AppShell>
      <Page>
        <h1 className="text-2xl font-extrabold">{isWorker ? t('nav_myJobs') : t('nav_bookings')}</h1>
        {q.isLoading && <Spinner />}
        {!q.isLoading && !jobs.length && <Card className="text-center text-ink-2 py-10">{isWorker ? t('nothingHere') : t('noBookings')}</Card>}
        {!!active.length && <section className="flex flex-col gap-3"><h2 className="text-lg font-bold">{isWorker ? t('activeJobs') : t('activeBookings')}</h2><div className="grid gap-3 lg:grid-cols-2">{active.map(row)}</div></section>}
        {!!past.length && <section className="flex flex-col gap-3"><h2 className="text-lg font-bold">{isWorker ? t('pastJobs') : t('pastBookings')}</h2><div className="grid gap-3 lg:grid-cols-2">{past.map(row)}</div></section>}
      </Page>
    </AppShell>
  )
}
