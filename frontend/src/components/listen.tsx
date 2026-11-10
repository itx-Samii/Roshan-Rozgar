import { useEffect, useState } from 'react'
import { Square, Volume2 } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { speak, stopSpeaking, warmVoices } from '../lib/voice'

/**
 * Figma "Listen Button": reads the given text aloud with the device's voice.
 * If the device has no voice for the language it says so instead of failing silently.
 */
export function ListenButton({ text, compact, className = '' }: { text: string; compact?: boolean; className?: string }) {
  const { t, lang } = useI18n()
  const [speaking, setSpeaking] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => { warmVoices(); return () => stopSpeaking() }, [])

  const onClick = () => {
    if (speaking) { stopSpeaking(); setSpeaking(false); return }
    const r = speak(text, lang, () => setSpeaking(false))
    if (r === 'ok') { setSpeaking(true); setNote(null) }
    else setNote(r === 'no-voice' ? t('noUrduVoice') : t('noVoiceAtAll'))
  }
  return (
    <span className={`inline-flex flex-col items-start gap-1 ${className}`}>
      <button type="button" onClick={onClick} aria-pressed={speaking} aria-label={compact ? (speaking ? t('stopListen') : t('listen')) : undefined}
        className={`inline-flex items-center gap-2 rounded-full font-bold ${compact ? 'size-11 justify-center' : 'min-h-11 px-4'} ${speaking ? 'bg-brand text-white border-2 border-brand' : 'bg-surface text-brand-hover border-2 border-brand/40 hover:border-brand'}`}>
        {speaking ? <Square className="size-4" aria-hidden /> : <Volume2 className="size-5" aria-hidden />}
        {!compact && (speaking ? t('stopListen') : t('listen'))}
      </button>
      {note && <span role="status" className="text-xs text-ink-2 max-w-64">{note}</span>}
    </span>
  )
}
