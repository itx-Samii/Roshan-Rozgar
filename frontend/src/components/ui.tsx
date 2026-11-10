import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, ArrowRight, Check, Clock, Loader2, Power, CheckCircle2, AlertTriangle, Info, Zap, Droplets, Snowflake, Car, Hammer, PaintRoller } from 'lucide-react'
import { useI18n, type Key } from '../lib/i18n'
import type { JobStatus } from '../lib/supabase'

type Variant = 'primary' | 'secondary' | 'tertiary' | 'danger'
const variantCls: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover disabled:bg-muted disabled:text-ink-3',
  secondary: 'bg-surface text-brand border-2 border-brand hover:bg-brand-subtle disabled:border-line disabled:text-ink-3',
  tertiary: 'text-brand hover:bg-brand-subtle disabled:text-ink-3',
  danger: 'bg-danger text-white hover:opacity-90 disabled:bg-muted disabled:text-ink-3',
}

export function Button({ variant = 'primary', loading, children, className = '', ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  const { t } = useI18n()
  return (
    <button {...rest} disabled={rest.disabled || loading} aria-busy={loading || undefined}
      className={`min-h-14 w-full rounded-xl px-6 font-semibold inline-flex items-center justify-center gap-2 transition-colors ${variantCls[variant]} ${className}`}>
      {loading ? <><Loader2 className="size-5 animate-spin" aria-hidden />{t('pleaseWait')}</> : children}
    </button>
  )
}

export function Chip({ selected, children, onClick }: { selected?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={!!selected} onClick={onClick}
      className={`min-h-11 rounded-full px-4 inline-flex items-center gap-2 font-semibold ${selected ? 'bg-brand-subtle border-2 border-brand text-brand-hover' : 'bg-surface border border-line-strong text-ink'}`}>
      {selected && <Check className="size-4" aria-hidden />}{children}
    </button>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-surface rounded-2xl border border-muted p-4 shadow-[0_1px_3px_rgba(24,50,74,0.08)] ${className}`}>{children}</div>
}

export function TopBar({ title, back = true, end }: { title: string; back?: boolean; end?: ReactNode }) {
  const nav = useNavigate()
  const { lang, t } = useI18n()
  const Arrow = lang === 'ur' ? ArrowRight : ArrowLeft
  return (
    <header className="sticky top-0 z-10 bg-canvas/95 backdrop-blur flex items-center gap-2 px-2 h-16 border-b border-muted">
      {back && <button onClick={() => nav(-1)} aria-label={t('back')} className="size-12 rounded-full grid place-items-center hover:bg-subtle"><Arrow className="size-6" /></button>}
      <h1 className="flex-1 text-lg font-bold px-2 truncate">{title}</h1>
      {end}
    </header>
  )
}

export function Screen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col max-w-xl mx-auto">
      <main className="flex-1 px-6 py-4 flex flex-col gap-5">{children}</main>
      {footer && <footer className="sticky bottom-0 bg-surface border-t border-muted px-6 py-4 flex flex-col gap-2">{footer}</footer>}
    </div>
  )
}

const statusStyle: Record<JobStatus, { cls: string; Icon: typeof Clock }> = {
  requested: { cls: 'bg-muted text-ink', Icon: Info },
  quoted: { cls: 'bg-accent-subtle text-accent-text', Icon: Clock },
  confirmed: { cls: 'bg-brand-subtle text-brand-hover', Icon: Check },
  in_progress: { cls: 'bg-info-subtle text-info', Icon: Clock },
  awaiting_confirmation: { cls: 'bg-info-subtle text-info', Icon: Clock },
  completed: { cls: 'bg-brand text-white', Icon: CheckCircle2 },
  cancelled: { cls: 'bg-danger-subtle text-danger', Icon: AlertTriangle },
  disputed: { cls: 'bg-danger-subtle text-danger', Icon: AlertTriangle },
}
export function StatusBadge({ status }: { status: JobStatus }) {
  const { t } = useI18n()
  const { cls, Icon } = statusStyle[status]
  return <span role="status" className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ${cls}`}><Icon className="size-4" aria-hidden />{t(`status_${status}` as Key)}</span>
}

export function Availability({ value }: { value: 'available' | 'busy' | 'offline' }) {
  const { t } = useI18n()
  const m = { available: ['bg-brand-subtle text-brand-hover', CheckCircle2], busy: ['bg-accent-subtle text-accent-text', Clock], offline: ['bg-muted text-ink-2', Power] } as const
  const [cls, Icon] = m[value]
  return <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ${cls}`}><Icon className="size-4" aria-hidden />{t(value)}</span>
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'info' | 'success' | 'warning'; children: ReactNode }) {
  const m = { error: ['bg-danger-subtle border-danger text-danger', AlertTriangle], info: ['bg-info-subtle border-info text-info', Info], success: ['bg-brand-subtle border-brand text-brand-hover', CheckCircle2], warning: ['bg-accent-subtle border-accent text-accent-text', Clock] } as const
  const [cls, Icon] = m[kind]
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`flex gap-3 items-start rounded-xl border p-4 ${cls}`}><Icon className="size-5 shrink-0 mt-1" aria-hidden /><div className="flex-1">{children}</div></div>
}

export function Dialog({ open, title, body, confirmLabel, cancelLabel, danger, loading, onConfirm, onCancel }: {
  open: boolean; title: string; body: string; confirmLabel: string; cancelLabel: string; danger?: boolean; loading?: boolean; onConfirm: () => void; onCancel: () => void }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6 bg-ink/60" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-labelledby="dlg-title" className="bg-surface rounded-3xl p-6 w-full max-w-sm flex flex-col gap-4 text-center" onClick={(e) => e.stopPropagation()}>
        <h2 id="dlg-title" className="text-xl font-bold">{title}</h2>
        <p className="text-ink-2">{body}</p>
        <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        <Button variant="secondary" autoFocus onClick={onCancel}>{cancelLabel}</Button>
      </div>
    </div>
  )
}

export const tradeIcons: Record<string, typeof Zap> = { electrician: Zap, plumber: Droplets, 'ac-technician': Snowflake, mechanic: Car, carpenter: Hammer, painter: PaintRoller }
export const tradeTint: Record<string, string> = { electrician: 'bg-accent-subtle', plumber: 'bg-info-subtle', 'ac-technician': 'bg-info-subtle', mechanic: 'bg-muted', carpenter: 'bg-accent-subtle', painter: 'bg-brand-subtle' }

export function Stars({ value, size = 'size-4' }: { value: number; size?: string }) {
  return <span className="inline-flex text-accent" aria-label={`${value} / 5`}>{[1,2,3,4,5].map((i) => <span key={i} className={size} aria-hidden>{i <= Math.round(value) ? '★' : '☆'}</span>)}</span>
}

export function Spinner() { return <div className="grid place-items-center py-10"><Loader2 className="size-8 animate-spin text-brand" aria-label="Loading" /></div> }

export function Logo({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Roshan Rozgar">
      <path d="M32 3.5C19.6 3.5 9.5 13.3 9.5 25.4c0 16.6 18.7 33 21 35a2.3 2.3 0 0 0 3 0c2.3-2 21-18.4 21-35C54.5 13.3 44.4 3.5 32 3.5z" fill="#087F65" />
      <circle cx="32" cy="25" r="14.5" fill="#fff" />
      <g transform="translate(20.6 13.6) scale(0.95)"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="#087F65" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></g>
      <path d="M21.5 45.5c3.3 2.9 7.2 2.9 10.5 0c3.3 2.9 7.2 2.9 10.5 0" stroke="#F5B942" strokeWidth="3.4" fill="none" strokeLinecap="round" />
    </svg>
  )
}

export function LangSwitch() {
  const { lang, setLang } = useI18n()
  return (
    <div className="inline-flex rounded-full bg-muted p-1" role="radiogroup" aria-label="Language">
      {(['ur', 'en'] as const).map((l) => (
        <button key={l} role="radio" aria-checked={lang === l} onClick={() => setLang(l)}
          className={`min-h-11 px-5 rounded-full font-semibold ${lang === l ? 'bg-surface shadow' : 'text-ink-2'} ${l === 'ur' ? 'font-[family-name:var(--font-ur)]' : 'en'}`}>
          {l === 'ur' ? 'اردو' : 'English'}
        </button>
      ))}
    </div>
  )
}
