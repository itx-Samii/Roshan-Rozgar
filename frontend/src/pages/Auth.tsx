import { useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { KeyRound, MailCheck } from 'lucide-react'
import { Alert, Button, LangSwitch, Logo, Screen, TopBar } from '../components/ui'
import { useI18n, tErr } from '../lib/i18n'
import { supabase, rpc, errorCode, recovery } from '../lib/supabase'
import { useAuth, useProfile } from '../lib/auth'

const field = 'w-full min-h-14 rounded-xl border border-line-strong bg-surface px-4 text-base'

export default function Auth() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const wantRole = params.get('role') as 'worker' | 'customer' | null
  const { session } = useAuth()
  const profile = useProfile()
  const qc = useQueryClient()
  const [mode, setMode] = useState<'in' | 'up' | 'forgot'>(wantRole ? 'up' : 'in')
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState('')
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null); const [code, setCode] = useState('');
  const [resetTo, setResetTo] = useState<string | null>(null); const [newPass, setNewPass] = useState(''); const [newPass2, setNewPass2] = useState(''); const [unconfirmed, setUnconfirmed] = useState(false); const [resent, setResent] = useState(false)

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
    else if (mode === 'up' && !res.data.session) {
      // Supabase answers a sign-up for an already-registered email with a user that has no identities
      // and sends NO email (so addresses can't be probed). Tell the user to sign in instead of waiting.
      if (res.data.user && (res.data.user.identities?.length ?? 0) === 0) { setMode('in'); setError(t('err_EMAIL_TAKEN')) }
      else setSentTo(email) // confirmation required: wait for the code or link
    }
  }
  const resend = async (to: string) => {
    setBusy(true); setError(null)
    const { error: e2 } = await supabase.auth.resend({ type: 'signup', email: to, options: { emailRedirectTo: redirect } })
    setBusy(false)
    if (e2) setError(tErr(t, errorCode(e2))); else setResent(true)
  }

  // Confirmation email: the user can type the code from it OR tap its link (both work)
  const verify = async (e: FormEvent) => {
    e.preventDefault(); if (!sentTo) return
    setBusy(true); setError(null)
    const token = code.replace(/\D/g, '')
    let res = await supabase.auth.verifyOtp({ email: sentTo, token, type: 'email' })
    if (res.error) res = await supabase.auth.verifyOtp({ email: sentTo, token, type: 'signup' })
    setBusy(false)
    if (res.error) setError(tErr(t, errorCode(res.error)))
    else { setSentTo(null); setCode(''); await qc.invalidateQueries({ queryKey: ['profile'] }) } // signed in → role choice / home
  }

  // Forgot password: email → 6-digit code (or link) → new password
  const sendReset = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null); setResent(false)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect })
    setBusy(false)
    if (err) setError(tErr(t, errorCode(err)))
    else { setResetTo(email); setCode(''); setNewPass(''); setNewPass2('') } // Supabase doesn't say whether the email exists
  }
  const finishReset = async (e: FormEvent) => {
    e.preventDefault(); if (!resetTo) return
    setError(null)
    if (newPass !== newPass2) { setError(t('passwordsDontMatch')); return }
    setBusy(true)
    const err = await recovery.inline(async () => {
      const v = await supabase.auth.verifyOtp({ email: resetTo, token: code.replace(/\D/g, ''), type: 'recovery' })
      if (v.error) return v.error
      const u = await supabase.auth.updateUser({ password: newPass })
      return u.error
    })
    setBusy(false)
    if (err) { setError(tErr(t, errorCode(err))); return }
    setResetTo(null); setMode('in')
    await qc.invalidateQueries({ queryKey: ['profile'] }) // signed in with the new password → home
  }

  if (resetTo) return (
    <Screen>
      <TopBar title={t('resetTitle')} end={<LangSwitch />} />
      <div className="flex flex-col items-center text-center gap-3 pt-4">
        <span className="size-20 rounded-full bg-brand-subtle text-brand grid place-items-center"><MailCheck className="size-10" aria-hidden /></span>
        <h1 className="text-2xl font-extrabold">{t('checkEmailTitle')}</h1>
        <p className="font-bold en" dir="ltr">{resetTo}</p>
        <p className="text-ink-2">{t('resetSentNote')}</p>
      </div>
      <form onSubmit={finishReset} className="flex flex-col gap-3">
        <label className="flex flex-col gap-2 font-semibold">{t('codeLabel')}
          <input className={`${field} en text-center text-2xl tracking-[0.5em] font-bold`} dir="ltr" inputMode="numeric" autoComplete="one-time-code"
            pattern="[0-9 ]*" maxLength={12} value={code} onChange={(e) => setCode(e.target.value)} placeholder="••••••" /></label>
        <label className="flex flex-col gap-2 font-semibold">{t('newPassword')}
          <input className={`${field} en`} dir="ltr" type="password" required minLength={8} autoComplete="new-password" value={newPass} onChange={(e) => setNewPass(e.target.value)} /></label>
        <label className="flex flex-col gap-2 font-semibold">{t('confirmPassword')}
          <input className={`${field} en`} dir="ltr" type="password" required minLength={8} autoComplete="new-password" value={newPass2} onChange={(e) => setNewPass2(e.target.value)} /></label>
        {error && <Alert>{error}</Alert>}
        {resent && <Alert kind="success">{t('resent')}</Alert>}
        <Button type="submit" loading={busy} disabled={code.replace(/\D/g, '').length < 6 || newPass.length < 8}>{t('savePassword')}</Button>
      </form>
      <p className="text-center text-ink-2">{t('resetOrLink')}</p>
      <Button variant="secondary" disabled={busy} onClick={async () => { setBusy(true); const { error: err } = await supabase.auth.resetPasswordForEmail(resetTo, { redirectTo: redirect }); setBusy(false); if (err) setError(tErr(t, errorCode(err))); else setResent(true) }}>{t('resend')}</Button>
      <Button variant="tertiary" onClick={() => { setResetTo(null); setMode('in'); setError(null) }}>{t('signIn')}</Button>
    </Screen>
  )

  if (mode === 'forgot') return (
    <Screen>
      <TopBar title={t('resetTitle')} end={<LangSwitch />} />
      <div className="flex flex-col items-center text-center gap-3 pt-4">
        <span className="size-20 rounded-full bg-brand-subtle text-brand grid place-items-center"><KeyRound className="size-10" aria-hidden /></span>
        <h1 className="text-2xl font-extrabold">{t('resetTitle')}</h1>
        <p className="text-ink-2">{t('resetSub')}</p>
      </div>
      <form onSubmit={sendReset} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 font-semibold">{t('email')}<input className={`${field} en`} dir="ltr" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy}>{t('sendCode')}</Button>
      </form>
      <Button variant="tertiary" onClick={() => { setMode('in'); setError(null) }}>{t('signIn')}</Button>
    </Screen>
  )

  if (sentTo) return (
    <Screen>
      <TopBar title={t('checkEmailTitle')} end={<LangSwitch />} />
      <div className="flex flex-col items-center text-center gap-3 pt-4">
        <span className="size-20 rounded-full bg-brand-subtle text-brand grid place-items-center"><MailCheck className="size-10" aria-hidden /></span>
        <h1 className="text-2xl font-extrabold">{t('checkEmailTitle')}</h1>
        <p className="font-bold en" dir="ltr">{sentTo}</p>
      </div>
      <form onSubmit={verify} className="flex flex-col gap-3">
        <label className="flex flex-col gap-2 font-semibold">{t('codeLabel')}
          <input className={`${field} en text-center text-2xl tracking-[0.5em] font-bold`} dir="ltr" inputMode="numeric" autoComplete="one-time-code"
            pattern="[0-9 ]*" maxLength={12} value={code} onChange={(e) => setCode(e.target.value)} placeholder="••••••" aria-describedby="code-hint" />
        </label>
        <p id="code-hint" className="text-sm text-ink-2">{t('codeHint')}</p>
        {error && <Alert>{error}</Alert>}
        {resent && <Alert kind="success">{t('resent')}</Alert>}
        <Button type="submit" loading={busy} disabled={code.replace(/\D/g, '').length < 6}>{t('verifyCode')}</Button>
      </form>
      <p className="text-center text-ink-2">{t('orTapLink')}</p>
      <Button variant="secondary" disabled={busy} onClick={() => resend(sentTo)}>{t('resend')}</Button>
      <Button variant="tertiary" onClick={() => { setSentTo(null); setMode('in') }}>{t('signIn')}</Button>
    </Screen>
  )

  return (
    <Screen>
      <TopBar title={mode === 'up' ? t('signUp') : t('signIn')} end={<LangSwitch />} />
      <div className="flex justify-center"><Logo size={64} /></div>
      {error && <Alert>{error}{unconfirmed && <button type="button" className="block mt-2 underline font-bold" onClick={async () => { await resend(email); setSentTo(email) }}>{t('resend')}</button>}</Alert>}
      {resent && <Alert kind="success">{t('resent')}</Alert>}
      <form onSubmit={submit} className="flex flex-col gap-4">
        {mode === 'up' && <label className="flex flex-col gap-2 font-semibold">{t('name')}<input className={field} required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>}
        <label className="flex flex-col gap-2 font-semibold">{t('email')}<input className={`${field} en`} dir="ltr" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label className="flex flex-col gap-2 font-semibold">{t('password')}<input className={`${field} en`} dir="ltr" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} /></label>
        <Button type="submit" loading={busy}>{mode === 'up' ? t('signUp') : t('signIn')}</Button>
      </form>
      {mode === 'in' && <button type="button" onClick={() => { setMode('forgot'); setError(null) }} className="self-center min-h-11 px-3 font-semibold text-brand underline">{t('forgotPassword')}</button>}
      <Button variant="tertiary" onClick={() => setMode(mode === 'up' ? 'in' : 'up')}>{mode === 'up' ? t('haveAccount') : t('noAccount')}</Button>
    </Screen>
  )
}
