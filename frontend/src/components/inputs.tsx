import { useState } from 'react'
import { Mic, Minus, Plus, Square, Check } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { useDictation } from '../lib/data'
import { Alert } from './ui'

/** Price chosen entirely by tapping: big readout, −/+ in Rs 100 steps, quick chips; typing is optional. */
export function PricePicker({ value, onChange, presets = [500, 800, 1000, 1200, 1500, 2000] }: { value: number; onChange: (v: number) => void; presets?: number[] }) {
  const { t } = useI18n()
  const [typing, setTyping] = useState(false)
  const clamp = (v: number) => Math.max(100, Math.min(100000, v))
  const round = 'size-14 shrink-0 rounded-full grid place-items-center border-2 border-brand text-brand bg-surface hover:bg-brand-subtle disabled:opacity-40'
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3" dir="ltr">
        <button type="button" className={round} aria-label={t('lessBy100')} disabled={value <= 100} onClick={() => onChange(clamp(value - 100))}><Minus className="size-6" /></button>
        <output aria-live="polite" className="flex-1 text-center en">
          <span className="text-ink-2 text-lg font-semibold">Rs </span>
          <span className="text-5xl font-extrabold tracking-tight">{value.toLocaleString('en-PK')}</span>
        </output>
        <button type="button" className={round} aria-label={t('moreBy100')} disabled={value >= 100000} onClick={() => onChange(clamp(value + 100))}><Plus className="size-6" /></button>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-ink-2">{t('quickPrices')}</span>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('quickPrices')}>
          {presets.map((p) => {
            const on = value === p
            return (
              <button key={p} type="button" role="radio" aria-checked={on} onClick={() => onChange(p)}
                className={`min-h-12 rounded-xl font-bold en inline-flex items-center justify-center gap-1 transition-colors ${on ? 'bg-brand text-white shadow-md' : 'bg-surface border border-line-strong text-ink hover:border-brand'}`}>
                {on && <Check className="size-4" aria-hidden />}Rs {p.toLocaleString('en-PK')}
              </button>
            )
          })}
        </div>
      </div>
      {typing
        ? <input autoFocus className="min-h-12 rounded-xl border border-line-strong px-4 en text-lg" dir="ltr" inputMode="numeric" aria-label={t('otherAmount')} value={value}
            onChange={(e) => onChange(clamp(Number(e.target.value.replace(/\D/g, '')) || 100))} />
        : <button type="button" className="text-brand underline text-sm self-center min-h-11" onClick={() => setTyping(true)}>{t('otherAmount')}</button>}
    </div>
  )
}

/** Two-or-more big options, one selected (radio group). */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }} role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={`min-h-12 rounded-xl px-3 font-semibold inline-flex items-center justify-center gap-2 border-2 ${on ? 'border-brand bg-brand-subtle text-brand-hover' : 'border-muted bg-surface text-ink'}`}>
            {on && <Check className="size-4" aria-hidden />}{o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Text field with a microphone: speak (Urdu or English) or type. Voice text is appended and stays editable. */
export function VoiceField({ value, onChange, label, maxLength = 500, rows = 2, compact }: { value: string; onChange: (v: string) => void; label: string; maxLength?: number; rows?: number; compact?: boolean }) {
  const { t, lang } = useI18n()
  const dict = useDictation(lang)
  const toggle = () => (dict.listening ? dict.stop() : dict.start((txt) => onChange(`${value} ${txt}`.trim().slice(0, maxLength))))
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-2 font-semibold">
        {!compact && label}
        <div className="flex gap-2 items-start">
          {rows > 1
            ? <textarea rows={rows} aria-label={label} className="flex-1 rounded-xl border border-line-strong bg-surface px-4 py-3" maxLength={maxLength} value={value} placeholder={compact ? label : undefined} onChange={(e) => onChange(e.target.value)} />
            : <input aria-label={label} className="flex-1 min-h-12 rounded-full border border-line-strong bg-surface px-4" maxLength={maxLength} value={value} placeholder={label} onChange={(e) => onChange(e.target.value)} />}
          <button type="button" onClick={toggle} aria-pressed={dict.listening} aria-label={dict.listening ? t('stopMic') : t('tapMic')}
            className={`size-12 shrink-0 rounded-full grid place-items-center text-white ${dict.listening ? 'bg-danger animate-pulse' : 'bg-brand'}`}>
            {dict.listening ? <Square className="size-5" /> : <Mic className="size-6" />}
          </button>
        </div>
      </label>
      {dict.listening && <Alert kind="info">{t('listening')}</Alert>}
      {dict.error && <Alert kind="warning">{t('voiceUnavailable')}</Alert>}
    </div>
  )
}
