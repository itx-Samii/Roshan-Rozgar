import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, BadgeCheck, Briefcase, Check, Mic, Square, Wrench } from 'lucide-react'
import { Alert, Button, Card, Chip, Screen, Spinner, TopBar, tradeIcons, tradeTint } from '../components/ui'
import { useI18n, tErr } from '../lib/i18n'
import { nameOf, useDictation, useRefData, YEAR_RANGES as YEARS } from '../lib/data'
import { rpc, errorCode, supabase } from '../lib/supabase'
import { useAuth, useProfile } from '../lib/auth'

const FEES = [300, 500, 800, 1000]

export default function WorkerOnboarding() {
  const { t, lang } = useI18n()
  const nav = useNavigate()
  const qc = useQueryClient()
  const profile = useProfile()
  const { categories, areas, loading } = useRefData()
  const dict = useDictation(lang)
  const { session } = useAuth()
  const [params] = useSearchParams()
  const editing = params.get('edit') === '1'
  const [step, setStep] = useState(editing ? 1 : 0)
  const [cats, setCats] = useState<number[]>([])
  const [name, setName] = useState('')
  const [years, setYears] = useState<number | null>(null)
  const [fee, setFee] = useState<number | null>(500)
  const [areaIds, setAreaIds] = useState<number[]>([])
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
      <div><h1 className="text-3xl font-extrabold">{t('welcomeTitle')}</h1><p className="text-ink-2 mt-1">{t('welcomeSub')}</p></div>
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
      <p className="text-ink-2">{t('chooseTradeSub')}</p>
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
    </Screen>
  )

  // Step 3: nothing is saved until the worker confirms (W4)
  const rows: [string, string][] = [
    [t('name'), displayName],
    [t('chooseTrade'), categories.filter((c) => cats.includes(c.id)).map((c) => nameOf(c, lang)).join('، ')],
    [t('experience'), YEARS.find(([v]) => v === years)?.[1] ?? ''],
    [t('areas'), areas.filter((a) => areaIds.includes(a.id)).map((a) => nameOf(a, lang)).join('، ')],
    [t('visitFee'), fee ? `Rs ${fee}` : '—'],
  ]
  return (
    <Screen footer={<><Button loading={busy} onClick={save}>{editing ? t('saveChanges') : t('allCorrect')}</Button><Button variant="tertiary" onClick={() => setStep(2)}>{t('change')}</Button></>}>
      <TopBar title={t('checkTitle')} />
      {progress}
      {error && <Alert>{error}</Alert>}
      {rows.map(([k, v]) => <Card key={k}><div className="text-sm text-ink-2">{k}</div><div className="text-lg font-bold">{v}</div></Card>)}
      <Alert kind="info">{t('notVerified')}</Alert>
    </Screen>
  )
}
