import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, Banknote, CalendarCheck, Check, CheckCircle2, Hash, MapPin, Navigation, Send, User, Wrench } from 'lucide-react'
import { Alert, Button, Card, Dialog, Spinner, StatusBadge, TopBar } from '../components/ui'
import { PricePicker, Segmented, VoiceField } from '../components/inputs'
import { useNotify } from '../components/notify'
import { AppShell, Avatar, useIsDesktop } from '../components/shell'
import { useI18n, tErr, type Key } from '../lib/i18n'
import { supabase, rpc, errorCode, type JobStatus } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { nameOf, useRefData, type Job, type Quote } from '../lib/data'

type Pending = null | { kind: 'accept' | 'done' | 'cancel'; quoteId?: string }
const STEPS: { st: JobStatus; reached: JobStatus[] }[] = [
  { st: 'requested', reached: ['requested', 'quoted', 'confirmed', 'in_progress', 'awaiting_confirmation', 'completed', 'disputed'] },
  { st: 'quoted', reached: ['quoted', 'confirmed', 'in_progress', 'awaiting_confirmation', 'completed', 'disputed'] },
  { st: 'confirmed', reached: ['confirmed', 'in_progress', 'awaiting_confirmation', 'completed', 'disputed'] },
  { st: 'in_progress', reached: ['in_progress', 'awaiting_confirmation', 'completed', 'disputed'] },
  { st: 'completed', reached: ['completed'] },
]

/** Vertical progress timeline (Figma C8): each step shows when it happened. */
function Timeline({ job, history, title }: { job: Job; history: { to_status: JobStatus; created_at: string }[]; title: string }) {
  const { t, lang } = useI18n()
  if (job.status === 'cancelled') return null
  const current = STEPS.findLastIndex((s) => s.reached.includes(job.status))
  const when = (st: JobStatus) => {
    const iso = st === 'requested' ? job.created_at : history.find((h) => h.to_status === st)?.created_at
    return iso ? new Date(iso).toLocaleString(lang === 'ur' ? 'ur-PK' : 'en-PK', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' }) : ''
  }
  return (
    <Card className="p-5">
      <h2 className="text-lg font-bold mb-3">{title}</h2>
      <ol aria-label={title}>
        {STEPS.map((s, i) => {
          const ongoing = s.st === 'in_progress' && ['in_progress', 'awaiting_confirmation'].includes(job.status)
          const here = ongoing; const done = i <= current && !ongoing
          const last = i === STEPS.length - 1
          return (
            <li key={s.st} aria-current={here ? 'step' : undefined} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`size-8 rounded-full grid place-items-center shrink-0 ${done ? 'bg-brand text-white' : here ? 'bg-accent text-ink ring-4 ring-accent-subtle' : 'bg-muted text-ink-3'}`}>
                  {done ? <Check className="size-4" aria-hidden /> : here ? <Wrench className="size-4" aria-hidden /> : <span className="size-2 rounded-full bg-ink-3" />}
                </span>
                {!last && <span className={`w-0.5 flex-1 min-h-6 ${i < current ? 'bg-brand' : 'bg-muted'}`} aria-hidden />}
              </div>
              <div className={`pb-4 ${!done && !here ? 'text-ink-3' : ''}`}>
                <div className={here ? 'font-extrabold' : 'font-semibold'}>{t(`status_${s.st === 'in_progress' && job.status === 'awaiting_confirmation' ? 'awaiting_confirmation' : s.st}` as Key)}</div>
                {(done || here) && <div className="text-sm text-ink-2 en">{when(s.st)}</div>}
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

export default function JobPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { t, lang } = useI18n()
  const { session } = useAuth()
  const { markSelf } = useNotify()
  const desktop = useIsDesktop()
  const uid = session!.user.id
  const qc = useQueryClient()
  const { categories, areas } = useRefData()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<Pending>(null)
  const [price, setPrice] = useState(1000); const [parts, setParts] = useState<'labour' | 'parts'>('labour'); const [note, setNote] = useState('')
  const [rating, setRating] = useState(0); const [comment, setComment] = useState(''); const [tags, setTags] = useState<Key[]>([])
  const [msg, setMsg] = useState('')

  const q = useQuery({ queryKey: ['job', id], refetchInterval: 4000, queryFn: async () => {
    const { data: job, error: e1 } = await supabase.from('jobs').select('*').eq('id', id!).single()
    if (e1) throw e1
    const j = job as Job
    const [quotes, priv, people, messages, review, history] = await Promise.all([
      supabase.from('job_quotes').select('*').eq('job_id', j.id).order('created_at', { ascending: false }),
      supabase.from('job_private').select('address').eq('job_id', j.id).maybeSingle(),
      supabase.from('profiles').select('id, display_name').in('id', [j.customer_id, j.worker_id]),
      supabase.from('job_messages').select('id, sender_id, body, created_at').eq('job_id', j.id).order('created_at'),
      supabase.from('reviews').select('rating, comment').eq('job_id', j.id).maybeSingle(),
      supabase.from('job_status_history').select('to_status, created_at').eq('job_id', j.id).order('created_at'),
    ])
    return { job: j, quotes: (quotes.data ?? []) as Quote[], address: priv.data?.address as string | undefined,
      names: Object.fromEntries((people.data ?? []).map((p) => [p.id, p.display_name])) as Record<string, string>,
      messages: messages.data ?? [], review: review.data, history: (history.data ?? []) as { to_status: JobStatus; created_at: string }[] }
  } })

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null); if (id) markSelf(id)
    try { await fn(); setDialog(null) } catch (e) { setError(tErr(t, errorCode(e))); setDialog(null) }
    finally { setBusy(false); qc.invalidateQueries() }
  }
  const sendMessage = (body: string) => {
    const b = body.trim(); if (!b) return
    setMsg('')
    run(async () => { const { error: e2 } = await supabase.from('job_messages').insert({ job_id: id, body: b }); if (e2) throw e2 })
  }

  if (q.isLoading) return <Spinner />
  if (q.error || !q.data) return <div className="max-w-xl mx-auto p-6 flex flex-col gap-4"><Alert>{tErr(t, errorCode(q.error))}</Alert><Button variant="secondary" onClick={() => nav('/')}>{t('goHome')}</Button></div>
  const { job, quotes, address, names, messages, review, history } = q.data
  const isWorker = job.worker_id === uid
  const other = names[isWorker ? job.customer_id : job.worker_id] ?? ''
  const pending = quotes.find((x) => x.status === 'pending')
  const accepted = quotes.find((x) => x.status === 'accepted')
  const closed = ['completed', 'cancelled'].includes(job.status)
  const canCancel = ['requested', 'quoted', 'confirmed'].includes(job.status)
  const nextKey = `next_${isWorker ? 'w' : 'c'}_${job.status}` as Key
  const bookingNo = `RR-${job.id.slice(0, 6).toUpperCase()}`
  const hasNext = !closed || (!isWorker && job.status === 'completed' && !review)

  // ---- the ONE primary action for this role + status ----
  let action: ReactNode = null
  if (isWorker && ['requested', 'quoted'].includes(job.status)) {
    action = pending
      ? <Alert kind="warning"><b className="en">Rs {pending.amount_pkr.toLocaleString('en-PK')}</b> · {t('waitingCustomer')}</Alert>
      : (
        <Card className="flex flex-col gap-5">
          <h2 className="text-xl font-bold">{t('yourPrice')}</h2>
          <PricePicker value={price} onChange={setPrice} />
          <div className="flex flex-col gap-2"><span className="text-sm font-semibold text-ink-2">{t('whatIncluded')}</span>
            <Segmented label={t('whatIncluded')} value={parts} onChange={setParts} options={[{ value: 'labour', label: t('visitLabour') }, { value: 'parts', label: t('withParts') }]} /></div>
          <VoiceField label={t('noteSpeak')} value={note} onChange={setNote} maxLength={300} />
          <Button loading={busy} onClick={() => run(() => rpc('send_quote', { p_job: job.id, p_amount: price, p_includes_parts: parts === 'parts', p_note: note }))}>
            <Send className="size-5" aria-hidden />{t('sendPrice')} · <span className="en">Rs {price.toLocaleString('en-PK')}</span>
          </Button>
          <Button variant="tertiary" disabled={busy} onClick={() => run(() => rpc('job_action', { p_job: job.id, p_action: 'decline' }))}>{t('decline')}</Button>
        </Card>
      )
  } else if (!isWorker && job.status === 'quoted' && pending) {
    action = (
      <Card className="flex flex-col gap-4 border-2 border-accent">
        <div className="text-ink-2 font-semibold">{t('priceFrom')} · {other}</div>
        <div className="en"><span className="text-ink-2 text-lg font-semibold">Rs </span><span className="text-5xl font-extrabold">{pending.amount_pkr.toLocaleString('en-PK')}</span></div>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-subtle px-3 py-1 font-semibold">{pending.includes_parts ? t('withParts') : t('visitLabour')}</span>
          {pending.note && <span className="rounded-full bg-subtle px-3 py-1">“{pending.note}”</span>}
        </div>
        <Button onClick={() => setDialog({ kind: 'accept', quoteId: pending.id })}><Check className="size-5" aria-hidden />{t('accept')}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => run(() => rpc('respond_quote', { p_quote: pending.id, p_accept: false }))}>{t('decline')}</Button>
      </Card>
    )
  } else if (!isWorker && job.status === 'confirmed' && accepted) {
    const rowsC: [typeof Hash, Key, ReactNode][] = [
      [Hash, 'bookingId', <span className="en">{bookingNo}</span>],
      [User, 'roleWorker', `${other} · ${nameOf(categories.find((c) => c.id === job.category_id), lang)}`],
      [Banknote, 'agreedPrice', <span className="en font-bold">Rs {accepted.amount_pkr.toLocaleString('en-PK')}</span>],
      [CalendarCheck, 'payment', t('payCash')],
      [MapPin, 'addressLabel', <>{address}<div className="text-xs text-ink-2">{t('addressShared')}</div></>],
    ]
    action = (
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-col items-center text-center gap-2">
          <span className="size-16 rounded-full bg-brand-subtle text-brand grid place-items-center"><CheckCircle2 className="size-9" aria-hidden /></span>
          <h2 className="text-2xl font-extrabold">{t('bookingConfirmed')}</h2>
        </div>
        <dl className="flex flex-col gap-3">{rowsC.map(([Icon, k, v]) => (
          <div key={k} className="flex gap-3"><Icon className="size-5 text-ink-2 shrink-0 mt-1" aria-hidden /><div><dt className="text-sm text-ink-2">{t(k)}</dt><dd className="font-semibold">{v}</dd></div></div>
        ))}</dl>
      </Card>
    )
  } else if (isWorker && job.status === 'confirmed') {
    action = <Button loading={busy} onClick={() => run(() => rpc('job_action', { p_job: job.id, p_action: 'start' }))}>{t('startJob')}</Button>
  } else if (isWorker && job.status === 'in_progress') {
    action = <Button onClick={() => setDialog({ kind: 'done' })}><Check className="size-5" aria-hidden />{t('jobDone')}</Button>
  } else if (!isWorker && job.status === 'awaiting_confirmation') {
    action = (
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t('isDone')}</h2>
        <Button loading={busy} onClick={() => run(() => rpc('job_action', { p_job: job.id, p_action: 'confirm' }))}><Check className="size-5" aria-hidden />{t('yesDone')}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => run(() => rpc('job_action', { p_job: job.id, p_action: 'problem' }))}>{t('problem')}</Button>
      </Card>
    )
  } else if (!isWorker && job.status === 'completed' && !review) {
    action = (
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t('rate')}</h2>
        <div className="flex gap-1 justify-center" role="radiogroup" aria-label={t('rate')} dir="ltr">
          {[1, 2, 3, 4, 5].map((i) => <button key={i} role="radio" aria-checked={rating === i} aria-label={`${i} / 5`} onClick={() => setRating(i)} className={`size-14 text-4xl ${i <= rating ? 'text-accent' : 'text-line-strong'}`}>★</button>)}
        </div>
        {!rating && <p className="text-center text-ink-2">{t('chooseStars')}</p>}
        <div className="flex flex-col gap-2"><span className="font-semibold">{t('wentWell')}</span>
          <div className="flex flex-wrap gap-2">{(['tag_ontime', 'tag_price', 'tag_clean', 'tag_polite', 'tag_explained'] as Key[]).map((k) => (
            <button key={k} type="button" role="checkbox" aria-checked={tags.includes(k)} onClick={() => setTags((x) => x.includes(k) ? x.filter((y) => y !== k) : [...x, k])}
              className={`min-h-11 rounded-full px-4 font-semibold inline-flex items-center gap-1 border-2 ${tags.includes(k) ? 'bg-brand-subtle border-brand text-brand-hover' : 'bg-surface border-line text-ink'}`}>{tags.includes(k) && <Check className="size-4" aria-hidden />}{t(k)}</button>
          ))}</div></div>
        <VoiceField label={t('comment')} value={comment} onChange={setComment} maxLength={800} />
        <Button loading={busy} disabled={!rating} onClick={() => run(() => rpc('submit_review', { p_job: job.id, p_rating: rating, p_comment: [tags.map((k) => t(k)).join(' · '), comment.trim()].filter(Boolean).join(' — ') }))}>{t('submitReview')}</Button>
      </Card>
    )
  } else if (review) {
    action = <Alert kind="success">{t('thanksReview')} · {'★'.repeat(review.rating)}</Alert>
  } else if (job.status === 'disputed') {
    action = <Alert kind="warning">{t('disputedNote')}</Alert>
  }

  const quick: Key[] = isWorker ? ['qr_w1', 'qr_w2', 'qr_w3'] : ['qr_c1', 'qr_c2', 'qr_c3']

  const details = (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3"><Avatar name={other} /><div className="flex-1 min-w-0"><div className="text-lg font-bold truncate">{other}</div><div className="text-sm text-ink-2">{isWorker ? t('roleCustomer') : nameOf(categories.find((c) => c.id === job.category_id), lang)}</div></div><StatusBadge status={job.status} /></div>
      <p className="text-lg">{job.problem}</p>
      <p className="text-ink-2 flex items-center gap-2"><MapPin className="size-4 shrink-0" aria-hidden />{nameOf(areas.find((a) => a.id === job.area_id), lang)}</p>
      <p className="text-sm">{address ? <><b>{t('addressLabel')}:</b> {address}</> : <span className="text-ink-2">{t('addressHidden')}</span>}</p>
      {address && isWorker && !closed && (
        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address}, ${nameOf(areas.find((a) => a.id === job.area_id), 'en')}, Lahore`)}`} target="_blank" rel="noreferrer"
          className="min-h-12 rounded-xl border-2 border-brand text-brand font-bold inline-flex items-center justify-center gap-2 hover:bg-brand-subtle"><Navigation className="size-5" aria-hidden />{t('openMap')}</a>
      )}
      {accepted && <div className="rounded-xl bg-brand-subtle px-4 py-3 flex items-center justify-between gap-3"><div><div className="font-bold text-brand-hover">{t('agreedPrice')}</div><div className="text-sm text-ink-2">{t('cashAfter')} · {accepted.includes_parts ? t('withParts') : t('visitLabour')}</div></div><div className="en text-2xl font-extrabold whitespace-nowrap">Rs {accepted.amount_pkr.toLocaleString('en-PK')}</div></div>}
    </Card>
  )

  const chat = (
    <section className="flex flex-col gap-3" aria-labelledby="msgs">
      <h2 id="msgs" className="font-bold text-lg">{t('messages')}</h2>
      <div className="flex flex-col gap-2">
        {messages.map((m) => (
          <div key={m.id} className={`max-w-[85%] rounded-2xl px-4 py-2 ${m.sender_id === uid ? 'self-end bg-brand-subtle' : 'self-start bg-surface border border-muted'}`}>{m.body}</div>
        ))}
      </div>
      {!closed && (
        <>
          <div className="flex flex-wrap gap-2" aria-label={t('quickReplies')}>
            {quick.map((k) => <button key={k} type="button" disabled={busy} onClick={() => sendMessage(t(k))} className="min-h-11 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold hover:border-brand">{t(k)}</button>)}
          </div>
          <form className="flex gap-2 items-start" onSubmit={(e) => { e.preventDefault(); sendMessage(msg) }}>
            <div className="flex-1"><VoiceField compact rows={1} label={t('typeMessage')} value={msg} onChange={setMsg} maxLength={1000} /></div>
            <button className="size-12 shrink-0 rounded-full bg-ink text-white grid place-items-center" aria-label={t('send')}><Send className="size-5" /></button>
          </form>
        </>
      )}
    </section>
  )

  const nextBanner = hasNext && (t(nextKey) !== nextKey) && (
    <div className="rounded-2xl bg-accent-subtle border border-accent px-4 py-3 flex gap-3 items-start" role="status">
      <ArrowDown className="size-5 text-accent-text shrink-0 mt-1" aria-hidden />
      <div><div className="text-xs font-bold uppercase tracking-wide text-accent-text">{t('nextStep')}</div><div className="font-semibold">{t(nextKey)}</div></div>
    </div>
  )
  const cancelBtn = canCancel && <Button variant="tertiary" onClick={() => setDialog({ kind: 'cancel' })}>{job.status === 'confirmed' ? t('cancelBooking') : t('cancelRequest')}</Button>

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto"><TopBar title={`${nameOf(categories.find((c) => c.id === job.category_id), lang)} · ${bookingNo}`} /></div>
      {desktop ? (
        /* Figma R4: conversation + the binding decision on the left, booking status on the right */
        <div className="max-w-[1200px] mx-auto px-6 py-6 grid gap-8 grid-cols-[minmax(0,1fr)_380px] items-start">
          <main className="flex flex-col gap-5">{details}{error && <Alert>{error}</Alert>}{action}{chat}</main>
          <aside className="flex flex-col gap-4 sticky top-24">
            {nextBanner}
            <Timeline job={job} history={history} title={t('bookingStatus')} />
            {!isWorker && ['requested', 'quoted'].includes(job.status) && <Alert kind="info">{t('notBookedUntil')}</Alert>}
            {cancelBtn}
          </aside>
        </div>
      ) : (
        <div className="max-w-xl md:max-w-2xl mx-auto px-4 md:px-6 py-4 flex flex-col gap-5">
          {nextBanner}
          {error && <Alert>{error}</Alert>}
          {action}
          {cancelBtn}
          {details}
          <Timeline job={job} history={history} title={t('progress')} />
          {chat}
        </div>
      )}

      <Dialog open={dialog?.kind === 'accept'} title={t('confirmBookingQ')} body={t('confirmBookingBody')} confirmLabel={t('yesConfirm')} cancelLabel={t('goBack')} loading={busy}
        onConfirm={() => run(() => rpc('respond_quote', { p_quote: dialog!.quoteId, p_accept: true }))} onCancel={() => setDialog(null)} />
      <Dialog open={dialog?.kind === 'done'} title={t('jobDoneQ')} body={t('jobDoneBody')} confirmLabel={t('yesDone')} cancelLabel={t('notYet')} loading={busy}
        onConfirm={() => run(() => rpc('job_action', { p_job: job.id, p_action: 'done' }))} onCancel={() => setDialog(null)} />
      <Dialog open={dialog?.kind === 'cancel'} danger title={t('cancelQ')} body={t('cancelBody')} confirmLabel={t('yesCancel')} cancelLabel={t('keep')} loading={busy}
        onConfirm={() => run(() => rpc('job_action', { p_job: job.id, p_action: 'cancel' }))} onCancel={() => setDialog(null)} />
    </AppShell>
  )
}
