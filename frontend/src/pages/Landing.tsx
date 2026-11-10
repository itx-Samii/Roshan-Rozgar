import { Link } from 'react-router'
import { Home, Wrench, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, LangSwitch, Logo } from '../components/ui'
import { useI18n } from '../lib/i18n'

export default function Landing() {
  const { t, lang } = useI18n()
  const Chev = lang === 'ur' ? ChevronLeft : ChevronRight
  const roles = [
    { to: '/auth?role=worker', Icon: Wrench, tint: 'bg-brand-subtle text-brand', title: t('needWork'), sub: t('needWorkSub') },
    { to: '/auth?role=customer', Icon: Home, tint: 'bg-accent-subtle text-accent-text', title: t('needWorker'), sub: t('needWorkerSub') },
  ]
  return (
    <div className="min-h-dvh max-w-xl mx-auto px-6 py-10 flex flex-col items-center gap-6 text-center">
      <Logo size={88} />
      <div>
        <h1 className="text-3xl font-extrabold">{t('appName')}</h1>
        <p className="text-brand text-lg">{t('tagline')}</p>
      </div>
      <LangSwitch />
      <div className="w-full flex flex-col gap-4">
        {roles.map(({ to, Icon, tint, title, sub }) => (
          <Link key={to} to={to} className="block text-start">
            <Card className="flex items-center gap-4 border-2 hover:border-brand">
              <span className={`size-14 rounded-full grid place-items-center shrink-0 ${tint}`}><Icon className="size-7" aria-hidden /></span>
              <span className="flex-1"><span className="block text-xl font-bold">{title}</span><span className="block text-ink-2 text-sm">{sub}</span></span>
              <Chev className="size-6 text-ink-2" aria-hidden />
            </Card>
          </Link>
        ))}
      </div>
      <Link to="/auth" className="text-brand underline min-h-11 inline-flex items-center">{t('haveAccount')}</Link>
    </div>
  )
}
