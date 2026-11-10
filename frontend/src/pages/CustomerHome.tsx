import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { Button, Card, Chip, LangSwitch, Logo, Screen, Spinner, StatusBadge, tradeIcons, tradeTint } from '../components/ui'
import { useI18n } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { nameOf, useRefData, type Job } from '../lib/data'

export default function CustomerHome() {
  const { t, lang } = useI18n()
  const nav = useNavigate()
  const { session } = useAuth()
  const { categories, areas, loading } = useRefData()
  const [cat, setCat] = useState<number | null>(null)
  const [area, setArea] = useState<number | null>(() => Number(localStorage.getItem('rr-area')) || null)
  const jobs = useQuery({ queryKey: ['jobs', 'customer', session!.user.id], refetchInterval: 5000, queryFn: async () => {
    const { data, error } = await supabase.from('jobs').select('*').eq('customer_id', session!.user.id).order('updated_at', { ascending: false }).limit(20); if (error) throw error; return data as Job[] } })
  if (loading) return <Spinner />
  const go = () => { try { localStorage.setItem('rr-area', String(area)) } catch { /* ignore */ } nav(`/c/workers?cat=${cat}&area=${area}`) }

  return (
    <Screen footer={<Button disabled={!cat || !area} onClick={go}>{t('findWorkers')}</Button>}>
      <header className="flex items-center gap-3 pt-2">
        <Logo size={40} /><span className="flex-1 text-xl font-extrabold">{t('appName')}</span>
        <LangSwitch /><button aria-label={t('logout')} onClick={() => supabase.auth.signOut()} className="size-12 grid place-items-center"><LogOut className="size-5" /></button>
      </header>
      <h1 className="text-2xl font-bold">{t('whatFix')}</h1>
      <div className="grid grid-cols-2 gap-4" role="radiogroup">
        {categories.map((c) => {
          const Icon = tradeIcons[c.slug]; const sel = cat === c.id
          return (
            <button key={c.id} role="radio" aria-checked={sel} onClick={() => setCat(c.id)}
              className={`rounded-2xl p-4 flex flex-col items-center gap-2 border-2 ${sel ? 'border-brand bg-brand-subtle' : 'border-muted bg-surface'}`}>
              <span className={`size-16 rounded-full grid place-items-center ${tradeTint[c.slug]}`}><Icon className="size-8" aria-hidden /></span>
              <span className="font-bold">{nameOf(c, lang)}</span>
            </button>
          )
        })}
      </div>
      <fieldset><legend className="font-semibold mb-2">{t('area')} · Lahore</legend>
        <div className="flex flex-wrap gap-2">{areas.map((a) => <Chip key={a.id} selected={area === a.id} onClick={() => setArea(a.id)}>{nameOf(a, lang)}</Chip>)}</div>
      </fieldset>
      {!!jobs.data?.length && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">{t('myBookings')}</h2>
          {jobs.data.map((j) => (
            <Link key={j.id} to={`/job/${j.id}`}><Card className="flex items-center justify-between gap-2 border-2 hover:border-brand">
              <span className="font-semibold">{nameOf(categories.find((c) => c.id === j.category_id), lang)}</span><StatusBadge status={j.status} />
            </Card></Link>
          ))}
        </section>
      )}
    </Screen>
  )
}
