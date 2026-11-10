import { useCallback, useEffect, useRef, useState } from 'react'
import type { Lang } from './i18n'

type SRResult = { isFinal: boolean; 0: { transcript: string } }
type SR = {
  lang: string; interimResults: boolean; continuous: boolean
  onresult: (e: { resultIndex: number; results: ArrayLike<SRResult> }) => void
  onend: () => void; onerror: (e: { error: string }) => void; start: () => void; stop: () => void; abort: () => void
}
const SRCtor = () => (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition

export type CaptureError = 'unsupported' | 'denied' | 'no-speech' | 'failed'

/**
 * Continuous speech capture with live text (Figma W3). Uses the browser's speech service
 * (Chrome / Android); returns 'unsupported' elsewhere so the UI can offer the tap flow.
 */
export function useSpeechCapture(lang: Lang) {
  const [listening, setListening] = useState(false)
  const [finalText, setFinalText] = useState('')
  const [interim, setInterim] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<CaptureError | null>(null)
  const rec = useRef<SR | null>(null)
  const timer = useRef<number | null>(null)
  const finalRef = useRef('')

  const clearTimer = () => { if (timer.current) window.clearInterval(timer.current); timer.current = null }
  useEffect(() => () => { clearTimer(); rec.current?.abort() }, [])

  const start = useCallback(() => {
    const Ctor = SRCtor()
    if (!Ctor) { setError('unsupported'); return }
    const r = new Ctor(); rec.current = r
    r.lang = lang === 'ur' ? 'ur-PK' : 'en-IN'
    r.continuous = true; r.interimResults = true
    finalRef.current = ''; setFinalText(''); setInterim(''); setError(null); setSeconds(0)
    r.onresult = (e) => {
      let live = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) finalRef.current = `${finalRef.current} ${res[0].transcript}`.trim()
        else live += res[0].transcript
      }
      setFinalText(finalRef.current); setInterim(live)
    }
    r.onerror = (e) => setError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : e.error === 'no-speech' ? 'no-speech' : 'failed')
    r.onend = () => { setListening(false); setInterim(''); clearTimer() }
    setListening(true)
    timer.current = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    try { r.start() } catch { setError('failed'); setListening(false); clearTimer() }
  }, [lang])

  const stop = useCallback(() => rec.current?.stop(), [])
  return { supported: !!SRCtor(), listening, text: `${finalText} ${interim}`.trim(), finalText, seconds, error, start, stop }
}

/** Picks a voice for the language; null when the device has none (e.g. no Urdu voice on Windows). */
function pickVoice(lang: Lang): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? []
  const want = lang === 'ur' ? ['ur-PK', 'ur'] : ['en-PK', 'en-IN', 'en-GB', 'en-US', 'en']
  for (const w of want) { const v = voices.find((x) => x.lang.replace('_', '-').toLowerCase().startsWith(w.toLowerCase())); if (v) return v }
  return null
}

export type SpeakResult = 'ok' | 'no-voice' | 'unsupported'

/** Read text aloud with the device's text-to-speech (Figma "Listen" button). */
export function speak(text: string, lang: Lang, onEnd?: () => void): SpeakResult {
  const synth = window.speechSynthesis
  if (!synth) return 'unsupported'
  const voice = pickVoice(lang)
  if (!voice) return 'no-voice'
  synth.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.voice = voice; u.lang = voice.lang; u.rate = 0.9
  u.onend = () => onEnd?.(); u.onerror = () => onEnd?.()
  synth.speak(u)
  return 'ok'
}

export function stopSpeaking() { window.speechSynthesis?.cancel() }

/** Voices load asynchronously in Chrome; call once early so the first Listen tap works. */
export function warmVoices() {
  try { window.speechSynthesis?.getVoices() } catch { /* unsupported */ }
}
