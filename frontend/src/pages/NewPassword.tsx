import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { KeyRound } from 'lucide-react'
import { Alert, Button, LangSwitch, Screen, TopBar } from '../components/ui'
import { useI18n, tErr } from '../lib/i18n'
import { supabase, errorCode, recovery } from '../lib/supabase'

const field = 'w-full min-h-14 rounded-xl border border-line-strong bg-surface px-4 text-base en'

/** Shown after the user opens the password-reset LINK from the email (they are signed in for this one purpose). */
export default function NewPassword() {
  const { t } = useI18n()
  const nav = useNavigate()
  const [password, setPassword] = useState(''); const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)

  const save = async (e: FormEvent) => {
    e.preventDefault(); setError(null)
    if (password !== again) { setError(t('passwordsDontMatch')); return }
    setBusy(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (err) { setError(tErr(t, errorCode(err))); return }
    recovery.clear()
    nav('/', { replace: true })
  }

  return (
    <Screen>
      <TopBar title={t('setNewPasswordTitle')} back={false} end={<LangSwitch />} />
      <div className="flex flex-col items-center text-center gap-3 pt-4">
        <span className="size-20 rounded-full bg-brand-subtle text-brand grid place-items-center"><KeyRound className="size-10" aria-hidden /></span>
        <h1 className="text-2xl font-extrabold">{t('setNewPasswordTitle')}</h1>
        <p className="text-ink-2">{t('setNewPasswordSub')}</p>
      </div>
      <form onSubmit={save} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 font-semibold">{t('newPassword')}
          <input className={field} dir="ltr" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <label className="flex flex-col gap-2 font-semibold">{t('confirmPassword')}
          <input className={field} dir="ltr" type="password" required minLength={8} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} /></label>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy}>{t('savePassword')}</Button>
      </form>
      <Button variant="tertiary" onClick={async () => { await supabase.auth.signOut(); recovery.clear(); nav('/auth', { replace: true }) }}>{t('cancelEdit')}</Button>
    </Screen>
  )
}
