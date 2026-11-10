import { useQuery } from '@tanstack/react-query'
import { CreditCard, Info, Phone } from 'lucide-react'
import { Availability, Card, Spinner, Stars } from './ui'
import { Avatar, useTimeAgo } from './shell'
import { useI18n, type Key } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { nameOf, useRefData, yearsLabel } from '../lib/data'

export type WorkerRow = { worker_id: string; display_name: string; years_experience: number; visit_fee_from: number | null; availability: 'available' | 'busy' | 'offline'; rating: number | null; review_count: number; completed_jobs: number }

export function useWorkerDetail(id: string | undefined) {
  return useQuery({ queryKey: ['workerDetail', id], enabled: !!id, queryFn: async () => {
    const [{ data: prof }, { data: wp }, { data: reviews }] = await Promise.all([
      supabase.from('profiles').select('display_name').eq('id', id!).single(),
      supabase.from('worker_profiles').select('years_experience, visit_fee_from').eq('user_id', id!).single(),
      supabase.from('reviews').select('rating, comment, created_at').eq('worker_id', id!).order('created_at', { ascending: false }).limit(5),
    ])
    return { name: prof?.display_name ?? '', ...wp, reviews: reviews ?? [] }
  } })
}

const CHECKS: { Icon: typeof Phone; k: Key; b: Key }[] = [
  { Icon: Phone, k: 'chk_phone', b: 'chk_phone_b' }, { Icon: CreditCard, k: 'chk_cnic', b: 'chk_cnic_b' }, { Icon: Info, k: 'chk_bg', b: 'chk_bg_b' },
]

/** Worker profile (Figma C4 / R3 side panel): header, stats, honest checks, recent reviews. */
export function WorkerProfileBody({ id, cat, row }: { id: string; cat: number; row?: WorkerRow }) {
  const { t, lang } = useI18n()
  const ago = useTimeAgo()
  const { categories } = useRefData()
  const q = useWorkerDetail(id)
  if (q.isLoading || !q.data) return <Spinner />
  const w = q.data
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Avatar name={w.name} size="size-20" text="text-2xl" />
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold truncate">{w.name}</h2>
          <div className="text-ink-2">{nameOf(categories.find((c) => c.id === cat), lang)} · Lahore</div>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {row && <Availability value={row.availability} />}
            {row?.review_count ? <span className="inline-flex items-center gap-1"><span className="text-accent">★</span><span className="num font-bold">{Number(row.rating).toFixed(1)}</span><span className="text-ink-2 text-sm">(<span className="num">{row.completed_jobs}</span> {t('jobsDone')})</span></span> : null}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-muted bg-surface text-center p-3"><div className="font-extrabold text-lg"><span className="num">{yearsLabel(w.years_experience ?? 0)}</span> <span className="text-sm">{lang === 'ur' ? 'سال' : 'yrs'}</span></div><div className="text-xs text-ink-2">{t('expLabel')}</div></div>
        <div className="rounded-xl border border-muted bg-surface text-center p-3"><div className="font-extrabold text-lg num">{row?.completed_jobs ?? 0}</div><div className="text-xs text-ink-2">{t('stat_jobs')}</div></div>
        <div className="rounded-xl border border-muted bg-surface text-center p-3"><div className="font-extrabold text-lg en">{w.visit_fee_from ? `Rs ${w.visit_fee_from}` : '—'}</div><div className="text-xs text-ink-2">{t('stat_fee')}</div></div>
      </div>
      <Card className="flex flex-col gap-4 p-5">
        <h3 className="text-lg font-bold">{t('whatChecked')}</h3>
        {CHECKS.map(({ Icon, k, b }) => (
          <div key={k} className="flex gap-3 items-start"><span className="size-10 rounded-full bg-subtle text-ink-2 grid place-items-center shrink-0"><Icon className="size-5" aria-hidden /></span><div><div className="font-semibold">{t(k)}</div><div className="text-sm text-ink-2">{t(b)}</div></div></div>
        ))}
      </Card>
      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-bold">{t('reviewsTitle')}</h3>
        {!w.reviews.length && <div className="rounded-xl bg-subtle p-4 text-ink-2">{t('noReviews')}</div>}
        {w.reviews.map((r, i) => <div key={i} className="rounded-xl bg-subtle p-4 flex flex-col gap-1"><div className="flex justify-between"><Stars value={r.rating} /><span className="text-xs text-ink-3">{ago(r.created_at)}</span></div>{r.comment && <p>{r.comment}</p>}</div>)}
      </section>
    </div>
  )
}
