import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, BadgeCheck, Briefcase, Check, Clock, Hand, MapPin, Mic, Pencil, Sparkles, Square, User, Wallet, Wrench } from 'lucide-react'
import { Alert, Button, Card, Chip, Screen, Spinner, TopBar, tradeIcons, tradeTint } from '../components/ui'
import { ListenButton } from '../components/listen'
import { useI18n, tErr, type Key } from '../lib/i18n'
import { nameOf, useDictation, useRefData, YEAR_RANGES as YEARS } from '../lib/data'
import { useSpeechCapture } from '../lib/voice'
import { parseProfile } from '../lib/voiceParse'
import { rpc, errorCode, supabase } from '../lib/supabase'
import { useAuth, useProfile } from '../lib/auth'

const FEES = [300, 500, 800, 1000]
type Field = 'name' | 'years' | 'areas' | 'trades' | 'fee'

export default function WorkerOnboarding() {
  const { t, lang } = useI18n()
  const nav = useNavigate()
  const qc = useQueryClient()
  const profile = useProfile()
  const { categories, areas, loading } = useRefData()
  const dict = useDictation(lang)
  const cap = useSpeechCapture(lang)
  const { session } = useAuth()
  const [params] = useSearchParams()
  const editing = params.get('edit') === '1'
  const [step, setStep] = useState(editing ? 1 : 0)
  // Voice-first unless editing or the browser can't do speech recognition (then tap flow, Figma E2)
  const [mode, setMode] = useState<'voice' | 'tap'>(editing || !cap.supported ? 'tap' : 'voice')
  const [cats, setCats] = useState<number[]>([])
  const [name, setName] = useState('')
  const [years, setYears] = useState<number | null>(null)
  const [fee, setFee] = useState<number | null>(500)
  const [areaIds, setAreaIds] = useState<number[]>([])
  const [fromVoice, setFromVoice] = useState<Set<Field>>(new Set())
  const [heard, setHeard] = useState('')
  const [nothingHeard, setNothingHeard] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toggle = (arr: number[], v: number) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
  const displayName = name || profile.data?.display_name || ''
  const uid = session?.user.id
  // Edit mode: start from what the worker already saved
  const current = useQuery({ queryKey: ['workerFull', uid, 'edit'], enabled: editing && !!uid, queryFn: async () => {
    const [wp, sv, ar] = await Promise.all([
      supabase.from('worker_profiles').select('years_experience, visit_fee_from').eq('user_id', uid!).single(),
      supabase.from('worker_services').select('category_id').eq('worker_id', uid!),
      supabase.from('worker_areas').select('area_id').eq('worker_id', uid!),
    ])
    return { years: wp.data?.years_experience ?? null, fee: wp.data?.visit_fee_from ?? null, cats: (sv.data ?? []).map((x) => x.category_id), areas: (ar.data ?? []).map((x) => x.area_id) }
  } })
  useEffect(() => {
    if (!current.data) return
    setCats(current.data.cats); setAreaIds(current.data.areas); setYears(current.data.years); setFee(current.data.fee)
  }, [current.data])

  // When recording stops: fill fields from what was said, then show "Is this correct?" (W4)
  const wasListening = useRef(false)
  useEffect(() => {
    if (cap.listening) { wasListening.current = true; return }
    if (!wasListening.current) return
    wasListening.current = false
    const said = cap.finalText.trim()
    if (!said) { setNothingHeard(true); return }
    setHeard(said)
    const p = parseProfile(said, { areas, categories })
    const got = new Set<Field>()
    if (p.name) { setName(p.name.slice(0, 80)); got.add('name') }
    if (p.years !== null) { setYears(p.years); got.add('years') }
    if (p.areaIds.length) { setAreaIds(p.areaIds); got.add('areas') }
    if (p.categoryIds.length) { setCats((c) => [...new Set([...c, ...p.categoryIds])]); got.add('trades') }
    if (p.fee) { setFee(p.fee); got.add('fee') }
    setFromVoice(got)
    setStep(3)
  }, [cap.listening, cap.finalText, areas, categories])

  const Go = lang === 'ur' ? ArrowLeft : ArrowRight
  if (loading || (editing && current.isLoading)) return <Spinner />

  const save = async () => {
    setBusy(true); setError(null)
    try {
      await rpc('complete_onboarding', { p_name: displayName, p_years: years ?? 0, p_fee: fee, p_categories: cats, p_areas: areaIds })
      // Drop the cached "not onboarded" worker row so the dashboard doesn't bounce back here
      await qc.resetQueries({ queryKey: ['worker'] }); await qc.invalidateQueries(); nav(editing ? '/w/profile' : '/w', { replace: true })
    } catch (e) { setError(tErr(t, errorCode(e))) } finally { setBusy(false) }
  }

  const progress = (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-ink-2">{t('stepWord')} <span className="num">{step}</span> {t('ofWord')} <span className="num">3</span></span>
      <div className="flex gap-2" aria-hidden>{[1, 2, 3].map((i) => <span key={i} className={`h-2 flex-1 rounded-full ${i <= step ? 'bg-brand' : 'bg-muted'}`} />)}</div>
    </div>
  )

  if (step === 0) return (
    <Screen footer={<><Button onClick={() => setStep(1)}>{t('start')}<Go className="size-5" aria-hidden /></Button><p className="text-center text-sm text-ink-2">{t('takes3min')}</p></>}>
      <TopBar title={t('welcomeTitle')} back={false} />
      <div className="flex items-start justify-between gap-3">
        <div><h1 className="text-3xl font-extrabold">{t('welcomeTitle')}</h1><p className="text-ink-2 mt-1">{t('welcomeSub')}</p></div>
        <ListenButton text={[t('welcomeTitle'), t('welcomeSub'), t('w_step1'), t('w_step2'), t('w_step3'), t('w_step4')].join('. ')} />
      </div>
      <Card className="flex flex-col gap-4 p-5">
        {([[Wrench, 'w_step1'], [Mic, 'w_step2'], [BadgeCheck, 'w_step3'], [Briefcase, 'w_step4']] as const).map(([Icon, k], i) => (
          <div key={k} className="flex items-center gap-3">
            <span className="size-9 rounded-full bg-brand text-white font-bold grid place-items-center en shrink-0">{i + 1}</span>
            <Icon className="size-5 text-brand shrink-0" aria-hidden /><span className="font-semibold text-lg">{t(k)}</span>
          </div>
        ))}
      </Card>
    </Screen>
  )

  if (step === 1) return (
    <Screen footer={<Button disabled={!cats.length} onClick={() => setStep(2)}>{t('continue')}</Button>}>
      <TopBar title={t('chooseTrade')} back={editing} />
      {progress}
      <div className="flex items-start justify-between gap-3"><p className="text-ink-2">{t('chooseTradeSub')}</p><ListenButton compact text={`${t('chooseTrade')}. ${t('chooseTradeSub')}`} /></div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {categories.map((c) => {
          const Icon = tradeIcons[c.slug]; const sel = cats.includes(c.id)
          return (
            <button key={c.id} type="button" role="checkbox" aria-checked={sel} onClick={() => setCats(toggle(cats, c.id))}
              className={`relative rounded-2xl p-4 flex flex-col items-center gap-2 border-2 ${sel ? 'border-brand bg-brand-subtle' : 'border-muted bg-surface'}`}>
              {sel && <Check className="absolute top-2 end-2 size-6 rounded-full bg-brand text-white p-1" aria-hidden />}
              <span className={`size-18 rounded-full grid place-items-center ${tradeTint[c.slug]}`}><Icon className="size-10" aria-hidden /></span>
              <span className="font-bold text-lg">{nameOf(c, lang)}</span>
              <span className="text-sm text-ink-2">{lang === 'ur' ? c.name_en : c.name_ur}</span>
            </button>
          )
        })}
      </div>
    </Screen>
  )

  // Step 2, voice (Figma W3): say name, years and areas in one go
  if (step === 2 && mode === 'voice') {
    const mm = `${Math.floor(cap.seconds / 60)}:${String(cap.seconds % 60).padStart(2, '0')}`
    return (
      <Screen footer={<button onClick={() => { cap.stop(); setMode('tap') }} className="min-h-12 inline-flex items-center justify-center gap-2 font-bold text-brand"><Hand className="size-5" aria-hidden />{t('vo_tapInstead')}</button>}>
        <TopBar title={t('aboutYou')} />
        {progress}
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-extrabold">{t('vo_title')}</h1>
          <ListenButton text={[t('vo_title'), t('vo_name'), t('vo_years'), t('vo_areas'), t('vo_example')].join('. ')} />
        </div>
        <Card className="flex flex-col gap-3 p-5">
          {([[User, 'vo_name'], [Clock, 'vo_years'], [MapPin, 'vo_areas']] as const).map(([Icon, k]) => (
            <div key={k} className="flex items-center gap-3 text-lg font-semibold"><Icon className="size-6 text-brand shrink-0" aria-hidden />{t(k)}</div>
          ))}
          <p className="rounded-xl bg-subtle px-4 py-3 text-ink-2">{t('vo_example')}</p>
        </Card>
        <div className="flex flex-col items-center gap-3 py-2">
          <button type="button" onClick={() => { setNothingHeard(false); if (cap.listening) cap.stop(); else cap.start() }}
            aria-label={cap.listening ? t('stopMic') : t('tapMic')} aria-pressed={cap.listening}
            className={`size-32 rounded-full grid place-items-center text-white shadow-lg transition ${cap.listening ? 'bg-brand ring-8 ring-brand/20 animate-pulse' : 'bg-brand hover:bg-brand-hover'}`}>
            {cap.listening ? <Square className="size-10" aria-hidden /> : <Mic className="size-14" aria-hidden />}
          </button>
          <p className="font-bold text-lg" role="status">{cap.listening ? <>{t('vo_listening')} <span className="en">{mm}</span></> : t('vo_tapStart')}</p>
          {cap.listening && <p className="text-sm text-ink-2">{t('vo_tapStop')}</p>}
        </div>
        {cap.text && <Card className="p-4 border-2 border-brand"><div className="text-sm font-bold text-ink-2 mb-1">{t('vo_heard')}</div><p className="text-lg">{cap.text}</p></Card>}
        {cap.error === 'unsupported' && <Alert kind="warning">{t('vo_unsupported')}</Alert>}
        {cap.error === 'denied' && <Alert kind="warning">{t('vo_denied')}</Alert>}
        {(cap.error === 'no-speech' || nothingHeard) && !cap.listening && <Alert kind="info">{t('vo_nothing')}</Alert>}
        {cap.error === 'failed' && <Alert kind="warning">{t('voiceUnavailable')}</Alert>}
        <p className="text-xs text-ink-2 text-center">{t('vo_privacy')}</p>
      </Screen>
    )
  }

  // Step 2, tap (Figma E2 fallback, also used for "Change")
  if (step === 2) return (
    <Screen footer={<Button disabled={!displayName.trim() || years === null || !areaIds.length} onClick={() => setStep(3)}>{t('continue')}</Button>}>
      <TopBar title={t('aboutYou')} />
      {progress}
      <label className="flex flex-col gap-2 font-semibold">{t('name')}
        <div className="flex gap-2">
          <input className="flex-1 min-h-14 rounded-xl border border-line-strong bg-surface px-4" value={displayName} maxLength={80} onChange={(e) => setName(e.target.value)} />
          <button type="button" aria-label={t('speak')} onClick={() => (dict.listening ? dict.stop() : dict.start((txt) => setName(txt.trim().slice(0, 80))))}
            className={`size-14 rounded-full grid place-items-center ${dict.listening ? 'bg-danger text-white' : 'bg-brand text-white'}`}>
            {dict.listening ? <Square className="size-5" /> : <Mic className="size-6" />}
          </button>
        </div>
      </label>
      {dict.listening && <Alert kind="info">{t('listening')}</Alert>}
      {(dict.error || !dict.supported) && <Alert kind="warning">{t('voiceUnavailable')}</Alert>}
      <fieldset className="flex flex-col gap-2"><legend className="font-semibold mb-2">{t('experience')}</legend>
        <div className="flex flex-wrap gap-2">{YEARS.map(([v, l]) => <Chip single label={l} key={v} selected={years === v} onClick={() => setYears(v)}><span className="en">{l}</span></Chip>)}</div></fieldset>
      <fieldset className="flex flex-col gap-2"><legend className="font-semibold mb-2">{t('areas')}</legend>
        <div className="flex flex-wrap gap-2">{areas.map((a) => <Chip key={a.id} selected={areaIds.includes(a.id)} onClick={() => setAreaIds(toggle(areaIds, a.id))}>{nameOf(a, lang)}</Chip>)}</div></fieldset>
      <fieldset className="flex flex-col gap-2"><legend className="font-semibold mb-2">{t('visitFee')}</legend>
        <div className="flex flex-wrap gap-2">{FEES.map((f) => <Chip single label={`Rs ${f}`} key={f} selected={fee === f} onClick={() => setFee(f)}><span className="en">Rs {f}</span></Chip>)}</div></fieldset>
      {cap.supported && !editing && <button onClick={() => setMode('voice')} className="min-h-12 inline-flex items-center justify-center gap-2 font-bold text-brand"><Mic className="size-5" aria-hidden />{t('vo_speakAgain')}</button>}
    </Screen>
  )

  // Step 3: "Is this correct?" (Figma W4) — nothing is saved until the worker confirms
  const yearsText = YEARS.find(([v]) => v === years)?.[1]
  const rows: { f: Field; Icon: typeof User; label: Key; value: string }[] = [
    { f: 'name', Icon: User, label: 'name', value: displayName },
    { f: 'trades', Icon: Wrench, label: 'trades', value: categories.filter((c) => cats.includes(c.id)).map((c) => nameOf(c, lang)).join('، ') },
    { f: 'years', Icon: Clock, label: 'expLabel', value: yearsText ? `${yearsText} ${t('yrs')}` : '' },
    { f: 'areas', Icon: MapPin, label: 'areasLabel', value: areas.filter((a) => areaIds.includes(a.id)).map((a) => nameOf(a, lang)).join('، ') },
    { f: 'fee', Icon: Wallet, label: 'visitFee', value: fee ? `Rs ${fee}` : '' },
  ]
  const usedVoice = fromVoice.size > 0 || !!heard
  const complete = !!displayName.trim() && years !== null && areaIds.length > 0 && cats.length > 0
  const changeTo = (f: Field) => { setMode('tap'); setStep(f === 'trades' ? 1 : 2) }
  return (
    <Screen footer={<>
      <Button loading={busy} disabled={!complete} onClick={save}><Check className="size-5" aria-hidden />{editing ? t('saveChanges') : t('allCorrect')}</Button>
      {usedVoice && cap.supported && <Button variant="tertiary" onClick={() => { setMode('voice'); setStep(2) }}><Mic className="size-5" aria-hidden />{t('vo_speakAgain')}</Button>}
    </>}>
      <TopBar title={t('checkTitle')} />
      {progress}
      <div className="flex items-start justify-between gap-3">
        <div><h1 className="text-2xl font-extrabold">{t('vo_checkTitle')}</h1><p className="text-ink-2">{t('vo_checkSub')}</p></div>
        <ListenButton text={[t('vo_checkTitle'), ...rows.filter((r) => r.value).map((r) => `${t(r.label)}: ${r.value}`)].join('. ')} />
      </div>
      {usedVoice && <Alert kind="info">{t('vo_matchNote')}</Alert>}
      {heard && <p className="text-sm text-ink-2">{t('vo_heard')}: “{heard}”</p>}
      {error && <Alert>{error}</Alert>}
      {rows.map(({ f, Icon, label, value }) => (
        <Card key={f} className={`flex flex-col gap-2 ${!value ? 'border-2 border-accent' : ''}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-sm text-ink-2"><Icon className="size-4 text-brand" aria-hidden />{t(label)}</span>
            {fromVoice.has(f) && <span className="inline-flex items-center gap-1 rounded-full bg-info-subtle text-info px-2 py-0.5 text-xs font-bold"><Sparkles className="size-3" aria-hidden />{t('vo_fromVoice')}</span>}
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex-1 text-lg font-bold ${!value ? 'text-accent-text text-base font-semibold' : ''}`}>{value || t('vo_notHeard')}</div>
            {value && <ListenButton compact text={`${t(label)}: ${value}`} />}
            <button onClick={() => changeTo(f)} className="min-h-11 px-4 rounded-xl border-2 border-brand text-brand font-bold inline-flex items-center gap-1"><Pencil className="size-4" aria-hidden />{t('vo_change')}</button>
          </div>
        </Card>
      ))}
      <Alert kind="info">{t('notVerified')}</Alert>
    </Screen>
  )
}
