import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, LogOut, MailWarning, Pencil, ShieldCheck } from 'lucide-react'
import { Alert, Button, Card, LangSwitch, Spinner, Stars } from '../components/ui'
import { AppShell, Avatar, Page, useTimeAgo } from '../components/shell'
import { useI18n, tErr } from '../lib/i18n'
import { supabase, errorCode } from '../lib/supabase'
import { useAuth, useProfile } from '../lib/auth'
import { nameOf, useRefData, yearsLabel } from '../lib/data'

export default function Profile() {
  const { t, lang } = useI18n()
  const ago = useTimeAgo()
  const { session } = useAuth()
  const profile = useProfile()
  const { categories, areas } = useRefData()
  const uid = session!.user.id
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false); const [draft, setDraft] = useState(''); const [saving, setSaving] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const isWorker = profile.data?.role === 'worker'
  const w = useQuery({ queryKey: ['workerFull', uid], enabled: isWorker, queryFn: async () => {
    const [wp, s, a, r] = await Promise.all([
      supabase.from('worker_profiles').select('years_experience, visit_fee_from').eq('user_id', uid).single(),
      supabase.from('worker_services').select('category_id').eq('worker_id', uid),
      supabase.from('worker_areas').select('area_id').eq('worker_id', uid),
      supabase.from('reviews').select('rating, comment, created_at').eq('worker_id', uid).order('created_at', { ascending: false }).limit(20),
    ])
    return { ...wp.data, cats: (s.data ?? []).map((x) => x.category_id), areas: (a.data ?? []).map((x) => x.area_id), reviews: r.data ?? [] }
  } })
  if (profile.isLoading) return <AppShell><Spinner /></AppShell>
  const name = profile.data?.display_name ?? ''
  const reviews = w.data?.reviews ?? []
  const avg = reviews.length ? reviews.reduce((s, x) => s + x.rating, 0) / reviews.length : 0
  const pill = 'rounded-full bg-subtle px-3 py-1 text-sm font-semibold'
  const confirmed = !!session?.user.email_confirmed_at
  const saveName = async () => {
    const v = draft.trim(); if (!v) return
    setSaving(true); setMsg(null)
    const { error } = await supabase.from('profiles').update({ display_name: v }).eq('id', uid)
    setSaving(false)
    if (error) setMsg({ ok: false, text: tErr(t, errorCode(error)) })
    else { setEditing(false); setMsg({ ok: true, text: t('saved') }); qc.invalidateQueries({ queryKey: ['profile'] }); qc.invalidateQueries({ queryKey: ['names'] }) }
  }
  const counts = [5, 4, 3, 2, 1].map((n) => [n, reviews.filter((r) => r.rating === n).length] as const)

  return (
    <AppShell>
      <Page>
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-4">
            <Avatar name={name} size="size-20" text="text-2xl" />
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-extrabold truncate">{name}</h1>
              <div className="text-ink-2">{isWorker ? t('roleWorker') : t('roleCustomer')}</div>
              <div className="text-sm text-ink-3 truncate en" dir="ltr">{session?.user.email}</div>
              <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-xs font-bold ${confirmed ? 'bg-brand-subtle text-brand-hover' : 'bg-accent-subtle text-accent-text'}`}>
                {confirmed ? <BadgeCheck className="size-4" aria-hidden /> : <MailWarning className="size-4" aria-hidden />}{confirmed ? t('emailConfirmed') : t('emailNotConfirmed')}
              </span>
            </div>
          </div>
          {editing ? (
            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); saveName() }}>
              <label className="flex flex-col gap-2 font-semibold">{t('name')}
                <input autoFocus className="w-full min-h-14 rounded-xl border border-line-strong bg-surface px-4 font-normal" maxLength={80} value={draft} onChange={(e) => setDraft(e.target.value)} /></label>
              <div className="grid grid-cols-2 gap-3"><Button variant="secondary" type="button" onClick={() => setEditing(false)}>{t('cancelEdit')}</Button><Button type="submit" loading={saving} disabled={!draft.trim()}>{t('save')}</Button></div>
            </form>
          ) : (
            <button onClick={() => { setDraft(name); setEditing(true); setMsg(null) }} className="self-start min-h-11 px-4 rounded-full border-2 border-brand text-brand font-semibold inline-flex items-center gap-2"><Pencil className="size-4" aria-hidden />{t('editName')}</button>
          )}
          {msg && <Alert kind={msg.ok ? 'success' : 'error'}>{msg.text}</Alert>}
        </Card>

        {isWorker && w.data && (
          <Card className="flex flex-col gap-4 p-5">
            <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-bold">{t('nav_profile')}</h2>
              <Link to="/w/onboarding?edit=1" className="min-h-11 px-4 rounded-full border-2 border-brand text-brand font-semibold inline-flex items-center gap-2"><Pencil className="size-4" aria-hidden />{t('editProfile')}</Link></div>
            <div><div className="text-sm text-ink-2 mb-1">{t('trades')}</div><div className="flex flex-wrap gap-2">{w.data.cats.map((c) => <span key={c} className={pill}>{nameOf(categories.find((x) => x.id === c), lang)}</span>)}</div></div>
            <div><div className="text-sm text-ink-2 mb-1">{t('areasLabel')}</div><div className="flex flex-wrap gap-2">{w.data.areas.map((a) => <span key={a} className={pill}>{nameOf(areas.find((x) => x.id === a), lang)}</span>)}</div></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-subtle p-3"><div className="text-sm text-ink-2">{t('expLabel')}</div><div className="font-bold"><span className="num">{yearsLabel(w.data.years_experience ?? 0)}</span> {t('yrs')}</div></div>
              <div className="rounded-xl bg-subtle p-3"><div className="text-sm text-ink-2">{t('stat_fee')}</div><div className="font-bold en">{w.data.visit_fee_from ? `Rs ${w.data.visit_fee_from}` : '—'}</div></div>
            </div>
          </Card>
        )}

        {isWorker && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">{t('reviewsTitle')}</h2>
            {reviews.length > 0 && (
              <Card className="flex items-center gap-5 p-5">
                <div className="text-center"><div className="text-4xl font-extrabold en">{avg.toFixed(1)}</div><Stars value={avg} /><div className="text-xs text-ink-2"><span className="num">{reviews.length}</span> {t('reviewsTitle')}</div></div>
                <div className="flex-1 flex flex-col gap-1" dir="ltr">{counts.map(([n, c]) => (
                  <div key={n} className="flex items-center gap-2 text-sm"><span className="w-6 en">{n}★</span><span className="flex-1 h-2 rounded-full bg-muted overflow-hidden"><span className="block h-full bg-brand rounded-full" style={{ width: `${(c / reviews.length) * 100}%` }} /></span><span className="w-6 text-end en">{c}</span></div>
                ))}</div>
              </Card>
            )}
            <div className="rounded-xl bg-brand-subtle text-brand-hover px-4 py-3 flex gap-2 items-center text-sm font-semibold"><ShieldCheck className="size-5 shrink-0" aria-hidden />{t('reviewsOnlyAfter')}</div>
            {!reviews.length && <Card className="text-ink-2 text-center">{t('noReviews')}</Card>}
            <div className="grid gap-3 md:grid-cols-2">{reviews.map((r, i) => (
              <Card key={i} className="flex flex-col gap-1"><div className="flex items-center justify-between"><Stars value={r.rating} /><span className="text-xs text-ink-3">{ago(r.created_at)}</span></div>{r.comment && <p>{r.comment}</p>}</Card>
            ))}</div>
          </section>
        )}

        <Card className="flex items-center justify-between gap-3 p-5"><span className="font-bold">{t('language')}</span><LangSwitch /></Card>
        <button onClick={() => supabase.auth.signOut()} className="min-h-14 rounded-xl border-2 border-danger text-danger font-bold inline-flex items-center justify-center gap-2 hover:bg-danger-subtle"><LogOut className="size-5" aria-hidden />{t('logout')}</button>
      </Page>
    </AppShell>
  )
}
