import { Link } from 'react-router'
import { BadgeCheck, CalendarCheck, ChevronLeft, ChevronRight, Hand, Home, Info, Languages, MapPin, Mic, Power, Search, Tag, Wrench } from 'lucide-react'
import { LangSwitch, Logo, tradeIcons, tradeTint } from '../components/ui'
import { ListenButton } from '../components/listen'
import { useI18n, type Key } from '../lib/i18n'
import { nameOf, useRefData } from '../lib/data'

/** Public landing (Figma G1 on phones; R1-style hero on laptops/desktops). */
export default function Landing() {
  const { t, lang } = useI18n()
  const { categories } = useRefData()
  const Chev = lang === 'ur' ? ChevronLeft : ChevronRight
  const roles = [
    { to: '/auth?role=worker', Icon: Wrench, tint: 'bg-brand-subtle text-brand', title: t('needWork'), sub: t('needWorkSub'), other: lang === 'ur' ? 'I am a worker' : 'میں کاریگر ہوں' },
    { to: '/auth?role=customer', Icon: Home, tint: 'bg-accent-subtle text-accent-text', title: t('needWorker'), sub: t('needWorkerSub'), other: lang === 'ur' ? 'I need a worker' : 'مجھے کاریگر چاہیے' },
  ]
  const listenText = [t('appName'), t('land_title'), t('land_whatNeed'), `${t('needWork')}: ${t('needWorkSub')}`, `${t('needWorker')}: ${t('needWorkerSub')}`].join('. ')

  const roleCards = (
    <div className="w-full flex flex-col gap-4">
      {roles.map(({ to, Icon, tint, title, sub, other }) => (
        <Link key={to} to={to} className="group flex items-center gap-4 rounded-2xl border-2 border-line bg-surface p-5 text-start shadow-sm hover:border-brand hover:shadow-md transition">
          <span className={`size-16 rounded-full grid place-items-center shrink-0 ${tint}`}><Icon className="size-8" aria-hidden /></span>
          <span className="flex-1 min-w-0">
            <span className="block text-xl font-extrabold">{title}</span>
            <span className="block text-ink-2">{sub}</span>
            <span className={`block text-sm text-ink-3 mt-1 ${lang === 'ur' ? 'en' : 'font-[family-name:var(--font-ur)]'}`}>{other}</span>
          </span>
          <Chev className="size-7 text-ink-2 group-hover:text-brand shrink-0" aria-hidden />
        </Link>
      ))}
    </div>
  )

  const steps = (title: Key, Icon: typeof Mic, items: [typeof Mic, Key][], tone: string) => (
    <div className="rounded-2xl border border-muted bg-surface p-6 flex flex-col gap-4 shadow-sm">
      <h3 className="flex items-center gap-2 text-lg font-extrabold"><span className={`size-10 rounded-full grid place-items-center ${tone}`}><Icon className="size-5" aria-hidden /></span>{t(title)}</h3>
      <ol className="flex flex-col gap-3">
        {items.map(([I, k], i) => (
          <li key={k} className="flex items-center gap-3">
            <span className="size-8 rounded-full bg-brand text-white text-sm font-bold grid place-items-center en shrink-0">{i + 1}</span>
            <I className="size-5 text-brand shrink-0" aria-hidden /><span className="font-semibold">{t(k)}</span>
          </li>
        ))}
      </ol>
    </div>
  )

  const features: [typeof Mic, Key, Key][] = [[Mic, 'land_f1', 'land_f1b'], [Languages, 'land_f2', 'land_f2b'], [Hand, 'land_f3', 'land_f3b'], [BadgeCheck, 'land_f4', 'land_f4b']]

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-20 bg-surface/95 backdrop-blur border-b border-muted">
        <div className="max-w-[1200px] mx-auto px-4 md:px-8 h-16 flex items-center gap-3">
          <Logo size={36} />
          <span className="flex-1 flex flex-col leading-tight">
            <span className="font-extrabold text-lg en">Roshan <span className="text-brand">Rozgar</span></span>
            <span className="text-xs text-ink-2 font-[family-name:var(--font-ur)]">روشن روزگار</span>
          </span>
          <span className="hidden sm:inline-flex"><LangSwitch /></span>
          <Link to="/auth" className="min-h-11 px-4 rounded-full border-2 border-brand text-brand font-bold inline-flex items-center">{t('signIn')}</Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero + role choice */}
        <section className="bg-brand-subtle border-b border-muted">
          <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-8 lg:py-16 grid gap-8 lg:grid-cols-[minmax(0,1fr)_460px] lg:gap-14 items-center">
            <div className="flex flex-col gap-5 items-center text-center lg:items-start lg:text-start">
              <span className="lg:hidden size-24 rounded-3xl bg-surface shadow-md grid place-items-center"><Logo size={72} /></span>
              <div>
                <h1 className="text-4xl lg:text-5xl font-extrabold leading-tight">{lang === 'ur' ? t('appName') : t('land_heroTitle')}</h1>
                <p className="text-brand-hover text-xl font-semibold mt-2">{lang === 'ur' ? t('land_title') : t('appName')}</p>
              </div>
              <p className="text-lg text-ink-2 max-w-xl">{t('land_heroSub')}</p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <span className="sm:hidden"><LangSwitch /></span>
                <ListenButton text={listenText} />
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <h2 className="text-2xl font-extrabold text-center lg:text-start">{t('land_whatNeed')}</h2>
              {roleCards}
              <Link to="/auth" className="text-brand font-semibold underline min-h-11 inline-flex items-center justify-center">{t('haveAccount')}</Link>
            </div>
          </div>
        </section>

        {/* How it works for both roles */}
        <section className="max-w-[1200px] mx-auto px-4 md:px-8 py-12 flex flex-col gap-6">
          <h2 className="text-2xl lg:text-3xl font-extrabold text-center">{t('howItWorks')}</h2>
          <div className="grid gap-5 md:grid-cols-2">
            {steps('land_forWorkers', Wrench, [[Mic, 'land_w1'], [Power, 'land_w2'], [Tag, 'land_w3']], 'bg-brand-subtle text-brand')}
            {steps('land_forCustomers', Home, [[Search, 'land_c1'], [MapPin, 'land_c2'], [CalendarCheck, 'land_c3']], 'bg-accent-subtle text-accent-text')}
          </div>
        </section>

        {/* Trades */}
        {!!categories.length && (
          <section className="bg-surface border-y border-muted">
            <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-12 flex flex-col gap-6">
              <h2 className="text-2xl lg:text-3xl font-extrabold text-center">{t('land_trades')}</h2>
              <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
                {categories.map((c) => {
                  const Icon = tradeIcons[c.slug]
                  return (
                    <Link key={c.id} to="/auth?role=customer" className="rounded-2xl border-2 border-line bg-canvas p-4 flex flex-col items-center gap-2 text-center hover:border-brand">
                      <span className={`size-14 rounded-full grid place-items-center ${tradeTint[c.slug]}`}><Icon className="size-7" aria-hidden /></span>
                      <span className="font-bold text-sm md:text-base">{nameOf(c, lang)}</span>
                      <span className={`text-xs text-ink-2 ${lang === 'ur' ? 'en' : 'font-[family-name:var(--font-ur)]'}`}>{lang === 'ur' ? c.name_en : c.name_ur}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {/* Why it works for low-literacy users */}
        <section className="max-w-[1200px] mx-auto px-4 md:px-8 py-12 flex flex-col gap-6">
          <h2 className="text-2xl lg:text-3xl font-extrabold text-center">{t('land_whyTitle')}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(([Icon, a, b]) => (
              <div key={a} className="rounded-2xl border border-muted bg-surface p-5 flex flex-col gap-2 shadow-sm">
                <span className="size-12 rounded-full bg-brand-subtle text-brand grid place-items-center"><Icon className="size-6" aria-hidden /></span>
                <h3 className="text-lg font-extrabold">{t(a)}</h3>
                <p className="text-ink-2">{t(b)}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-center">
            <Link to="/auth?role=worker" className="min-h-14 px-8 rounded-xl bg-brand text-white font-bold inline-flex items-center gap-2 hover:bg-brand-hover">{t('land_start')}<Chev className="size-5" aria-hidden /></Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-muted bg-surface">
        <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-ink-2">
          <span className="inline-flex items-center gap-2"><Info className="size-4" aria-hidden />{t('land_demo')}</span>
          <span className="en">© 2026 Roshan Rozgar</span>
        </div>
      </footer>
    </div>
  )
}
