import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft, ArrowRight, MapPin } from 'lucide-react'
import { Card, Chip, LangSwitch, Spinner, StatusBadge, tradeIcons, tradeTint } from '../components/ui'
import { AppShell, Avatar, Page, useMyJobs, useNames } from '../components/shell'
import { useI18n, type Key } from '../lib/i18n'
import { nameOf, useRefData } from '../lib/data'

export default function CustomerHome() {
  const { t, lang } = useI18n()
  const nav = useNavigate()
  const { categories, areas, loading } = useRefData()
  const [area, setArea] = useState<number | null>(() => Number(localStorage.getItem('rr-area')) || null)
  const [picking, setPicking] = useState(false)
  const [pendingCat, setPendingCat] = useState<number | null>(null)
  const jobs = useMyJobs().data ?? []
  const attention = jobs.filter((j) => ['quoted', 'awaiting_confirmation', 'confirmed', 'in_progress'].includes(j.status)).slice(0, 2)
  const names = useNames(attention.map((j) => j.worker_id))
  const Go = lang === 'ur' ? ArrowLeft : ArrowRight
  if (loading) return <AppShell><Spinner /></AppShell>

  const go = (cat: number, a: number) => nav(`/c/workers?cat=${cat}&area=${a}`)
  const chooseArea = (a: number) => {
    setArea(a); setPicking(false)
    try { localStorage.setItem('rr-area', String(a)) } catch { /* ignore */ }
    if (pendingCat) { const c = pendingCat; setPendingCat(null); go(c, a) }
  }
  const chooseCat = (c: number) => { if (area) go(c, area); else { setPendingCat(c); setPicking(true) } }

  return (
    <AppShell>
      <Page>
        <header className="flex items-center gap-3 md:hidden"><span className="flex-1 text-xl font-extrabold">{t('appName')}</span><LangSwitch /></header>
        <header className="hidden md:flex justify-end"><LangSwitch /></header>

        <Card className="flex items-center gap-3 p-4">
          <MapPin className="size-6 text-brand shrink-0" aria-hidden />
          <div className="flex-1 min-w-0"><div className="text-sm text-ink-2">{t('workLocation')}</div><div className="font-bold truncate">{area ? `${nameOf(areas.find((a) => a.id === area), lang)}, Lahore` : t('chooseArea')}</div></div>
          <button onClick={() => setPicking((p) => !p)} aria-expanded={picking} className="min-h-12 px-4 rounded-xl text-brand font-bold hover:bg-brand-subtle">{t('change')}</button>
        </Card>
        {picking && (
          <Card className="flex flex-col gap-3 p-4 border-2 border-brand animate-[rr-in_.2s_ease-out]">
            <div className="font-bold">{pendingCat ? t('pickAreaFirst') : t('chooseArea')}</div>
            <div className="flex flex-wrap gap-2" role="radiogroup">{areas.map((a) => <Chip single key={a.id} selected={area === a.id} onClick={() => chooseArea(a.id)}>{nameOf(a, lang)}</Chip>)}</div>
          </Card>
        )}

        {attention.map((j) => (
          <Link key={j.id} to={`/job/${j.id}`}><Card className="flex items-center gap-3 border-2 border-accent hover:shadow-md">
            <Avatar name={names[j.worker_id] ?? ''} />
            <div className="flex-1 min-w-0 flex flex-col gap-1 items-start"><div className="font-bold truncate max-w-full">{names[j.worker_id]} · {nameOf(categories.find((c) => c.id === j.category_id), lang)}</div><StatusBadge status={j.status} /><div className="text-sm text-accent-text font-semibold">{t(`next_c_${j.status}` as Key)}</div></div>
            <Go className="size-5 text-ink-2" aria-hidden />
          </Card></Link>
        ))}

        <div><h1 className="text-3xl font-extrabold">{t('whatFix')}</h1><p className="text-ink-2 mt-1">{t('pickService')}</p></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {categories.map((c) => {
            const Icon = tradeIcons[c.slug]
            return (
              <button key={c.id} onClick={() => chooseCat(c.id)}
                className="rounded-2xl p-5 min-h-40 flex flex-col items-center justify-center gap-2 border-2 border-line bg-surface hover:border-brand hover:shadow-md transition">
                <span className={`size-16 rounded-full grid place-items-center ${tradeTint[c.slug]}`}><Icon className="size-8" aria-hidden /></span>
                <span className="text-lg font-bold">{nameOf(c, lang)}</span>
                <span className={`text-sm text-ink-2 ${lang === 'ur' ? 'en' : 'font-[family-name:var(--font-ur)]'}`}>{lang === 'ur' ? c.name_en : c.name_ur}</span>
              </button>
            )
          })}
        </div>
      </Page>
    </AppShell>
  )
}
