import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { supabase, type JobStatus } from './supabase'
import type { Lang } from './i18n'

export type Category = { id: number; slug: string; name_en: string; name_ur: string }
export type Area = { id: number; city: string; name_en: string; name_ur: string }
export type Job = { id: string; customer_id: string; worker_id: string; category_id: number; area_id: number; status: JobStatus; problem: string; agreed_price: number | null; version: number; created_at: string; updated_at: string }
export type Quote = { id: string; job_id: string; amount_pkr: number; includes_parts: boolean; note: string | null; status: 'pending' | 'accepted' | 'declined' | 'expired'; expires_at: string; created_at: string }

/** Experience is chosen as a range; we store a representative number but always display the range the worker picked. */
export const YEAR_RANGES = [[1, '1-2'], [4, '3-5'], [8, '6-10'], [12, '10+']] as const
export const yearsLabel = (n: number) => YEAR_RANGES.find(([v]) => v === n)?.[1] ?? String(n)

export const nameOf = (x: { name_en: string; name_ur: string } | undefined, lang: Lang) => (x ? (lang === 'ur' ? x.name_ur : x.name_en) : '')

export function useRefData() {
  const cats = useQuery({ queryKey: ['categories'], staleTime: Infinity, queryFn: async () => {
    const { data, error } = await supabase.from('service_categories').select('id, slug, name_en, name_ur').order('sort'); if (error) throw error; return data as Category[] } })
  const areas = useQuery({ queryKey: ['areas'], staleTime: Infinity, queryFn: async () => {
    const { data, error } = await supabase.from('service_areas').select('id, city, name_en, name_ur').order('id'); if (error) throw error; return data as Area[] } })
  return { categories: cats.data ?? [], areas: areas.data ?? [], loading: cats.isLoading || areas.isLoading }
}

/** Browser speech recognition (Chrome/Android). Progressive enhancement only — every field also works by typing/tapping. */
type SR = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: (e: { error: string }) => void; start: () => void; stop: () => void }
export function useDictation(lang: Lang) {
  const Ctor = (window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<SR | null>(null)
  const start = (onText: (text: string) => void) => {
    if (!Ctor) { setError('unsupported'); return }
    const r = new Ctor(); ref.current = r
    r.lang = lang === 'ur' ? 'ur-PK' : 'en-US'; r.interimResults = false
    r.onresult = (e) => onText(Array.from(e.results).map((x) => x[0].transcript).join(' '))
    r.onend = () => setListening(false)
    r.onerror = (e) => { setError(e.error === 'not-allowed' ? 'denied' : 'failed'); setListening(false) }
    setError(null); setListening(true); r.start()
  }
  const stop = () => ref.current?.stop()
  return { supported: !!Ctor, listening, error, start, stop }
}
