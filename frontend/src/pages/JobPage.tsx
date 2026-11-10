import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, Send } from 'lucide-react'
import { Alert, Button, Card, Chip, Dialog, Screen, Spinner, StatusBadge, TopBar } from '../components/ui'
import { useI18n, tErr } from '../lib/i18n'
import { supabase, rpc, errorCode } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { nameOf, useRefData, type Job, type Quote } from '../lib/data'

const PRICES = [500, 800, 1000, 1200, 1500]
type Pending = null | { kind: 'accept' | 'done' | 'cancel'; quoteId?: string }

export default function JobPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { t, lang } = useI18n()
  const { session } = useAuth()
  const uid = session!.user.id
  const qc = useQueryClient()
  const { categories, areas } = useRefData()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<Pending>(null)
  const [price, setPrice] = useState<number | ''>(''); const [parts, setParts] = useState(false); const [note, setNote] = useState('')
  const [rating, setRating] = useState(0); const [comment, setComment] = useState('')
  const [msg, setMsg] = useState('')

  const q = useQuery({ queryKey: ['job', id], refetchInterval: 4000, queryFn: async () => {
    const { data: job, error: e1 } = await supabase.from('jobs').select('*').eq('id', id!).single()
    if (e1) throw e1
    const j = job as Job
    const [quotes, priv, people, messages, review] = await Promise.all([
      supabase.from('job_quotes').select('*').eq('job_id', j.id).order('created_at', { ascending: false }),
      supabase.from('job_private').select('address').eq('job_id', j.id).maybeSingle(),
      supabase.from('profiles').select('id, display_name').in('id', [j.customer_id, j.worker_id]),
      supabase.from('job_messages').select('id, sender_id, body, created_at').eq('job_id', j.id).order('created_at'),
      supabase.from('reviews').select('rating, comment').eq('job_id', j.id).maybeSingle(),
    ])
    return { job: j, quotes: (quotes.data ?? []) as Quote[], address: priv.data?.address as string | undefined,
      names: Object.fromEntries((people.data ?? []).map((p) => [p.id, p.display_name])) as Record<string, string>,
      messages: messages.data ?? [], review: review.data }
  } })

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null)
    try { await fn(); setDialog(null) } catch (e) { setError(tErr(t, errorCode(e))); setDialog(null) }
    finally { setBusy(false); qc.invalidateQueries() }
  }

  if (q.isLoading) return <Spinner />
  if (q.error || !q.data) return <Screen><TopBar title="" /><Alert>{tErr(t, errorCode(q.error))}</Alert><Button variant="secondary" onClick={() => nav('/')}>{t('goHome')}</Button></Screen>
  const { job, quotes, address, names, messages, review } = q.data
  const isWorker = job.worker_id === uid
  const other = names[isWorker ? job.customer_id : job.worker_id] ?? ''
  const pending = quotes.find((x) => x.status === 'pending')
  const accepted = quotes.find((x) => x.status === 'accepted')
  const closed = ['completed', 'cancelled'].includes(job.status)
  const canCancel = ['requested', 'quoted', 'confirmed'].includes(job.status)

  // ---- role- and status-specific primary area (one primary action at a time) ----
  let action: React.ReactNode = null
  if (isWorker && ['requested', 'quoted'].includes(job.status)) {
    action = pending
      ? <Alert kind="warning">{t('waitingCustomer')} · <span className="num">Rs {pending.amount_pkr}</span></Alert>
      : (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">{t('yourPrice')}</h2>
          <div className="flex flex-wrap gap-2">{PRICES.map((v) => <Chip single label={`Rs ${v}`} key={v} selected={price === v} onClick={() => setPrice(v)}><span className="en">Rs {v}</span></Chip>)}</div>
          <input className="min-h-14 rounded-xl border border-line-strong px-4 en" dir="ltr" inputMode="numeric" value={price} aria-label={t('yourPrice')}
            onChange={(e) => setPrice(e.target.value === '' ? '' : Math.max(0, Math.min(1000000, Number(e.target.value.replace(/\D/g, '')))))} />
          <Chip selected={parts} onClick={() => setParts(!parts)}>{t('partsIncluded')}</Chip>
          <input className="min-h-14 rounded-xl border border-line-strong px-4" maxLength={300} placeholder={t('note')} value={note} onChange={(e) => setNote(e.target.value)} />
          <Button loading={busy} disabled={!price || Number(price) < 100} onClick={() => run(() => rpc('send_quote', { p_job: job.id, p_amount: Number(price), p_includes_parts: parts, p_note: note }))}>{t('sendPrice')}</Button>
          <Button variant="tertiary" disabled={busy} onClick={() => run(() => rpc('job_action', { p_job: job.id, p_action: 'decline' }))}>{t('decline')}</Button>
        </Card>
      )
  } else if (!isWorker && job.status === 'quoted' && pending) {
    action = (
      <Card className="flex flex-col gap-3 border-2 border-accent">
        <div className="text-ink-2">{t('priceFrom')}</div>
        <div className="text-4xl font-extrabold en">Rs {pending.amount_pkr.toLocaleString()}</div>
        <div className="text-ink-2">{[pending.includes_parts ? t('partsIncluded') : null, pending.note].filter(Boolean).join(' · ')}</div>
        <Button onClick={() => setDialog({ kind: 'accept', quoteId: pending.id })}>{t('accept')}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => run(() => rpc('respond_quote', { p_quote: pending.id, p_accept: false }))}>{t('decline')}</Button>
      </Card>
    )
  } else if (!isWorker && job.status === 'requested') {
    action = <Alert kind="info">{t('waitingWorker')}</Alert>
  } else if (!isWorker && job.status === 'confirmed') {
    action = <Alert kind="success">{t('confirmedCustomer')}</Alert>
  } else if (!isWorker && job.status === 'in_progress') {
    action = <Alert kind="info">{t('inProgressCustomer')}</Alert>
  } else if (job.status === 'disputed') {
    action = <Alert kind="warning">{t('disputedNote')}</Alert>
  } else if (isWorker && job.status === 'confirmed') {
    action = <Button loading={busy} onClick={() => run(() => rpc('job_action', { p_job: job.id, p_action: 'start' }))}>{t('startJob')}</Button>
  } else if (isWorker && job.status === 'in_progress') {
    action = <Button onClick={() => setDialog({ kind: 'done' })}>{t('jobDone')}</Button>
  } else if (isWorker && job.status === 'awaiting_confirmation') {
    action = <Alert kind="warning">{t('waitingConfirm')} — {t('busyHint')}</Alert>
  } else if (!isWorker && job.status === 'awaiting_confirmation') {
    action = (
      <Card className="flex flex-col gap-3">
        <Alert kind="success">{t('workerSaysDone')}</Alert>
        <h2 className="text-lg font-bold">{t('isDone')}</h2>
        <Button loading={busy} onClick={() => run(() => rpc('job_action', { p_job: job.id, p_action: 'confirm' }))}>{t('yesDone')}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => run(() => rpc('job_action', { p_job: job.id, p_action: 'problem' }))}>{t('problem')}</Button>
      </Card>
    )
  } else if (!isWorker && job.status === 'completed' && !review) {
    action = (
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t('rate')}</h2>
        <div className="flex gap-2 justify-center" role="radiogroup" aria-label={t('rate')}>
          {[1, 2, 3, 4, 5].map((i) => <button key={i} role="radio" aria-checked={rating === i} aria-label={`${i}`} onClick={() => setRating(i)} className={`size-12 text-3xl ${i <= rating ? 'text-accent' : 'text-line-strong'}`}>★</button>)}
        </div>
        {!rating && <p className="text-center text-ink-2">{t('chooseStars')}</p>}
        <textarea className="rounded-xl border border-line-strong p-3 min-h-20" maxLength={1000} placeholder={t('comment')} value={comment} onChange={(e) => setComment(e.target.value)} />
        <Button loading={busy} disabled={!rating} onClick={() => run(() => rpc('submit_review', { p_job: job.id, p_rating: rating, p_comment: comment }))}>{t('submitReview')}</Button>
      </Card>
    )
  } else if (review) {
    action = <Alert kind="success">{t('thanksReview')} · {'★'.repeat(review.rating)}</Alert>
  }

  return (
    <Screen>
      <TopBar title={nameOf(categories.find((c) => c.id === job.category_id), lang)} />
      <div className="flex items-center justify-between gap-2"><span className="text-lg font-bold">{other}</span><StatusBadge status={job.status} /></div>
      <Card className="flex flex-col gap-2">
        <p>{job.problem}</p>
        <p className="text-ink-2 flex items-center gap-2"><MapPin className="size-4" aria-hidden />{nameOf(areas.find((a) => a.id === job.area_id), lang)}</p>
        <p className="text-sm">{address ? <><b>{t('addressLabel')}:</b> {address}</> : <span className="text-ink-2">{t('addressHidden')}</span>}</p>
        {accepted && <p><b>{t('agreedPrice')}:</b> <span className="en">Rs {accepted.amount_pkr}</span> · {t('cashAfter')}</p>}
      </Card>
      {error && <Alert>{error}</Alert>}
      {action}

      <section className="flex flex-col gap-2" aria-labelledby="msgs">
        <h2 id="msgs" className="font-bold">{t('messages')}</h2>
        {messages.map((m) => (
          <div key={m.id} className={`max-w-[85%] rounded-2xl px-4 py-2 ${m.sender_id === uid ? 'self-end bg-brand-subtle' : 'self-start bg-surface border border-muted'}`}>{m.body}</div>
        ))}
        {!closed && (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const body = msg.trim(); if (!body) return; setMsg('')
            run(async () => { const { error: e2 } = await supabase.from('job_messages').insert({ job_id: job.id, body }); if (e2) throw e2 }) }}>
            <input className="flex-1 min-h-12 rounded-full border border-line-strong px-4" maxLength={1000} placeholder={t('typeMessage')} value={msg} onChange={(e) => setMsg(e.target.value)} />
            <button className="size-12 rounded-full bg-brand text-white grid place-items-center" aria-label={t('send')}><Send className="size-5" /></button>
          </form>
        )}
      </section>

      {canCancel && <Button variant="tertiary" onClick={() => setDialog({ kind: 'cancel' })}>{job.status === 'confirmed' ? t('cancelBooking') : t('cancelRequest')}</Button>}

      <Dialog open={dialog?.kind === 'accept'} title={t('confirmBookingQ')} body={t('confirmBookingBody')} confirmLabel={t('yesConfirm')} cancelLabel={t('goBack')} loading={busy}
        onConfirm={() => run(() => rpc('respond_quote', { p_quote: dialog!.quoteId, p_accept: true }))} onCancel={() => setDialog(null)} />
      <Dialog open={dialog?.kind === 'done'} title={t('jobDoneQ')} body={t('jobDoneBody')} confirmLabel={t('yesDone')} cancelLabel={t('notYet')} loading={busy}
        onConfirm={() => run(() => rpc('job_action', { p_job: job.id, p_action: 'done' }))} onCancel={() => setDialog(null)} />
      <Dialog open={dialog?.kind === 'cancel'} danger title={t('cancelQ')} body={t('cancelBody')} confirmLabel={t('yesCancel')} cancelLabel={t('keep')} loading={busy}
        onConfirm={() => run(() => rpc('job_action', { p_job: job.id, p_action: 'cancel' }))} onCancel={() => setDialog(null)} />
    </Screen>
  )
}
