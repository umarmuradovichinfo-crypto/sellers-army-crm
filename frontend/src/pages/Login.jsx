import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api, USE_MOCKS } from '../lib/apiClient'
import { applyTheme, getTheme } from '../amo/theme'
import { useI18n } from '../amo/i18n'
import '../amo/i18n/login.ru.js'
import '../amo/login.css'

const REMEMBER_KEY = 'amo_login_email'

function Shell({ children }) {
  const { lang, setLang } = useI18n()
  useEffect(() => { applyTheme(getTheme()) }, [])
  return (
    <div className="ac-login">
      {children}
      <div className="ac-login__lang">
        <button type="button" className={lang === 'uz' ? 'is-active' : ''} onClick={() => setLang('uz')}>O'zbekcha</button>
        <button type="button" className={lang === 'ru' ? 'is-active' : ''} onClick={() => setLang('ru')}>Русский</button>
      </div>
    </div>
  )
}

function Brand() {
  return (
    <div className="ac-login__brand">
      <img className="ac-login__logo" src="/logo-lockup.png" alt="" />
      <div className="ac-login__name">Sellers Army</div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className="ac-login__field">
      <label className="ac-login__lbl">{label}</label>
      {children}
    </div>
  )
}

function SetupForm({ tokenRequired }) {
  const { setup } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [setupToken, setSetupToken] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (!name.trim()) return setErr(t('Ismni kiriting'))
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr(t("Email noto'g'ri"))
    if (password.length < 8) return setErr(t("Parol kamida 8 ta belgi bo'lishi kerak"))
    if (password !== password2) return setErr(t('Parollar bir xil emas'))
    setBusy(true)
    try {
      await setup({ name: name.trim(), email: email.trim(), password, ...(tokenRequired ? { setupToken } : {}) })
      navigate('/')
    } catch (e) {
      setErr(e?.message || t('Sozlashda xatolik'))
    } finally { setBusy(false) }
  }

  return (
    <Shell>
      <form className="ac-login__card" onSubmit={submit}>
        <Brand />
        <h1 className="ac-login__title">{t('Birinchi sozlash')}</h1>
        <div className="ac-login__sub">{t("O'zingizning admin login va parolingizni yarating")}</div>

        <Field label={t('Ism')}>
          <input className="ac-input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Ismingiz')} />
        </Field>
        <Field label={t('Email')}>
          <input className="ac-input" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
        </Field>
        <Field label={t('Parol')}>
          <input className="ac-input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('Kamida 8 ta belgi')} />
        </Field>
        <Field label={t('Parolni takrorlang')}>
          <input className="ac-input" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} placeholder="••••••••" />
        </Field>
        {tokenRequired && (
          <Field label={t('Sozlash kodi')}>
            <input className="ac-input" autoComplete="off" value={setupToken} onChange={(e) => setSetupToken(e.target.value)} placeholder={t('Sozlash kodi')} />
          </Field>
        )}

        {err && <div className="ac-login__err">{err}</div>}

        <button className="ac-btn ac-btn--blue ac-login__submit" disabled={busy}>
          {busy && <span className="ac-spinner" />}
          {t('Sozlash va kirish')}
        </button>
      </form>
    </Shell>
  )
}

export default function Login() {
  // undefined = tekshirilmoqda; null = holat noma'lum (oddiy login); obyekt = { needsSetup, tokenRequired }
  const [setupInfo, setSetupInfo] = useState(USE_MOCKS ? null : undefined)
  useEffect(() => {
    if (USE_MOCKS) return
    let alive = true
    api.get('/auth/setup-status')
      .then((r) => { if (alive) setSetupInfo(r || null) })
      .catch(() => { if (alive) setSetupInfo(null) })
    return () => { alive = false }
  }, [])
  if (setupInfo === undefined) return <Shell />
  if (setupInfo && setupInfo.needsSetup) return <SetupForm tokenRequired={!!setupInfo.tokenRequired} />
  return <LoginForm />
}

function LoginForm() {
  const { login } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const saved = (() => { try { return localStorage.getItem(REMEMBER_KEY) || '' } catch { return '' } })()
  const [email, setEmail] = useState(saved)
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(!!saved)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await login(email, password)
      try { if (remember) localStorage.setItem(REMEMBER_KEY, email); else localStorage.removeItem(REMEMBER_KEY) } catch { /* */ }
      navigate('/dashboard')
    } catch (e) {
      setErr(e?.message || t('Kirishda xatolik'))
    } finally { setBusy(false) }
  }

  return (
    <Shell>
      <form className="ac-login__card" onSubmit={submit}>
        <Brand />
        <h1 className="ac-login__title">{t('Kirish')}</h1>

        <Field label={t('Email')}>
          <input className="ac-input" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
        </Field>
        <Field label={t('Parol')}>
          <input className="ac-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </Field>

        <label className="ac-login__remember">
          <input type="checkbox" className="ac-check" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          {t('Meni eslab qol')}
        </label>

        {err && <div className="ac-login__err">{err}</div>}

        <button className="ac-btn ac-btn--blue ac-login__submit" disabled={busy}>
          {busy && <span className="ac-spinner" />}
          {t('KIRISH')}
        </button>
      </form>
    </Shell>
  )
}
