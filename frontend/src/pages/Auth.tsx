import { useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { MailCheck } from 'lucide-react'
import { Alert, Button, LangSwitch, Logo, Screen, TopBar } from '../components/ui'
import { useI18n, tErr } from '../lib/i18n'
import { supabase, rpc, errorCode } from '../lib/supabase'
import { useAuth, useProfile } from '../lib/auth'

const field = 'w-full min-h-14 rounded-xl border border-line-strong bg-surface px-4 text-base'

export default function Auth() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const wantRole = params.get('role') as 'worker' | 'customer' | null
  const { session } = useAuth()
  const profile = useProfile()
  const qc = useQueryClient()
  const [mode, setMode] = useState<'in' | 'up'>(wantRole ? 'up' : 'in')
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState('')
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null); const [unconfirmed, setUnconfirmed] = useState(false); const [resent, setResent] = useState(false)

  // Signed in: pick role once, then route by role
  if (session && profile.data) {
    if (profile.data.role === 'worker') return <Navigate to="/w" replace />
    if (profile.data.role === 'customer') return <Navigate to="/c" replace />
    const choose = async (role: 'worker' | 'customer') => {
      setBusy(true); setError(null)
      try { await rpc('choose_role', { p_role: role }); await qc.invalidateQueries({ queryKey: ['profile'] }) }
      catch (e) { setError(tErr(t, errorCode(e))) } finally { setBusy(false) }
    }
    return (
      <Screen>
        <h1 className="text-2xl font-bold">{t('appName')}</h1>
        {error && <Alert>{error}</Alert>}
        <Button loading={busy} onClick={() => choose(wantRole ?? 'customer')}>{wantRole === 'worker' ? t('needWork') : t('needWorker')}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => choose(wantRole === 'worker' ? 'customer' : 'worker')}>{wantRole === 'worker' ? t('needWorker') : t('needWork')}</Button>
      </Screen>
    )
  }

  const redirect = `${window.location.origin}/auth`
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null); setUnconfirmed(false); setResent(false)
    const res = mode === 'up'
      ? await supabase.auth.signUp({ email, password, options: { data: { display_name: name }, emailRedirectTo: redirect } })
      : await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (res.error) { const code = errorCode(res.error); setUnconfirmed(code === 'EMAIL_NOT_CONFIRMED'); setError(tErr(t, code)) }
    else if (mode === 'up' && !res.data.session) setSentTo(email) // confirmation required: wait for the email link
  }
  const resend = async (to: string) => {
    setBusy(true); setError(null)
    const { error: e2 } = await supabase.auth.resend({ type: 'signup', email: to, options: { emailRedirectTo: redirect } })
    setBusy(false)
    if (e2) setError(tErr(t, errorCode(e2))); else setResent(true)
  }

  if (sentTo) return (
    <Screen>
      <TopBar title={t('checkEmailTitle')} end={<LangSwitch />} />
      <div className="flex flex-col items-center text-center gap-4 py-6">
        <span className="size-20 rounded-full bg-brand-subtle text-brand grid place-items-center"><MailCheck className="size-10" aria-hidden /></span>
        <h1 className="text-2xl font-extrabold">{t('checkEmailTitle')}</h1>
        <p className="text-ink-2">{t('checkEmailBody')}</p>
        <p className="font-bold en" dir="ltr">{sentTo}</p>
      </div>
      {error && <Alert>{error}</Alert>}
      {resent && <Alert kind="success">{t('resent')}</Alert>}
      <Button variant="secondary" loading={busy} onClick={() => resend(sentTo)}>{t('resend')}</Button>
      <Button variant="tertiary" onClick={() => { setSentTo(null); setMode('in') }}>{t('signIn')}</Button>
    </Screen>
  )

  return (
    <Screen>
      <TopBar title={mode === 'up' ? t('signUp') : t('signIn')} end={<LangSwitch />} />
      <div className="flex justify-center"><Logo size={64} /></div>
      {error && <Alert>{error}{unconfirmed && <button type="button" className="block mt-2 underline font-bold" onClick={() => resend(email)}>{t('resend')}</button>}</Alert>}
      {resent && <Alert kind="success">{t('resent')}</Alert>}
      <form onSubmit={submit} className="flex flex-col gap-4">
        {mode === 'up' && <label className="flex flex-col gap-2 font-semibold">{t('name')}<input className={field} required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>}
        <label className="flex flex-col gap-2 font-semibold">{t('email')}<input className={`${field} en`} dir="ltr" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label className="flex flex-col gap-2 font-semibold">{t('password')}<input className={`${field} en`} dir="ltr" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} /></label>
        <Button type="submit" loading={busy}>{mode === 'up' ? t('signUp') : t('signIn')}</Button>
      </form>
      <Button variant="tertiary" onClick={() => setMode(mode === 'up' ? 'in' : 'up')}>{mode === 'up' ? t('haveAccount') : t('noAccount')}</Button>
    </Screen>
  )
}
