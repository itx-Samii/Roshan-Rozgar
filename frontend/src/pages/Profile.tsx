import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { LogOut, Pencil } from 'lucide-react'
import { Card, LangSwitch, Spinner, Stars } from '../components/ui'
import { AppShell, Avatar, Page, useTimeAgo } from '../components/shell'
import { useI18n } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { useAuth, useProfile } from '../lib/auth'
import { nameOf, useRefData, yearsLabel } from '../lib/data'

export default function Profile() {
  const { t, lang } = useI18n()
  const ago = useTimeAgo()
  const { session } = useAuth()
  const profile = useProfile()
  const { categories, areas } = useRefData()
  const uid = session!.user.id
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

  return (
    <AppShell>
      <Page>
        <Card className="flex items-center gap-4 p-5">
          <Avatar name={name} size="size-20" text="text-2xl" />
          <div className="flex-1 min-w-0"><h1 className="text-2xl font-extrabold truncate">{name}</h1><div className="text-ink-2">{isWorker ? t('roleWorker') : t('roleCustomer')}</div><div className="text-sm text-ink-3 truncate en">{session?.user.email}</div>
            {isWorker && reviews.length > 0 && <div className="flex items-center gap-2 mt-1"><Stars value={avg} /><span className="num font-bold">{avg.toFixed(1)}</span><span className="text-ink-2 num">({reviews.length})</span></div>}
          </div>
        </Card>

        {isWorker && w.data && (
          <Card className="flex flex-col gap-4 p-5">
            <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-bold">{t('nav_profile')}</h2>
              <Link to="/w/onboarding" className="min-h-11 px-4 rounded-full border-2 border-brand text-brand font-semibold inline-flex items-center gap-2"><Pencil className="size-4" aria-hidden />{t('editProfile')}</Link></div>
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
