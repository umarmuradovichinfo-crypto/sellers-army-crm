import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/apiClient'
import { applyTheme, getTheme } from '../amo/theme'
import { useI18n } from '../amo/i18n'
import '../amo/i18n/login.ru.js'
import '../amo/login.css'

// /login?next=/leads/12 — kirgach shu manzilga qaytadi (faqat ichki yo'l: '//evil.com' kabilar rad etiladi)
function nextPath(sp) {
  const n = sp.get('next') || ''
  return /^\/(?!\/|login)/.test(n) ? n : '/dashboard'
}

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
  const [searchParams] = useSearchParams()
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
      navigate(nextPath(searchParams), { replace: true })
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
  const [setupInfo, setSetupInfo] = useState(undefined)
  useEffect(() => {
    let alive = true
    api.get('/auth/setup-status')
      .then((r) => { if (alive) setSetupInfo(r || null) })
      .catch(() => { if (alive) setSetupInfo(null) })
    return () => { alive = false }
  }, [])
  if (setupInfo === undefined) return <Shell />
  if (setupInfo && setupInfo.needsSetup) return <SetupForm tokenRequired={!!setupInfo.tokenRequired} />
  return <LoginOrForgot />
}

function LoginOrForgot() {
  const [forgot, setForgot] = useState(null) // null — login; string — «Parolni unutdim» (boshlang'ich email)
  if (forgot !== null) return <ForgotForm initialEmail={forgot} onBack={() => setForgot(null)} />
  return <LoginForm onForgot={(email) => setForgot(email || '')} />
}

// «Parolni unutdim»: 1) email → 2) Telegram'dan kelgan kod + yangi parol (2 marta) → 3) tayyor, login'ga qaytish
function ForgotForm({ initialEmail, onBack }) {
  const { t } = useI18n()
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [info, setInfo] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  function errText(e) {
    const c = e?.data?.error
    if (c === 'CODE_INVALID') {
      const left = e?.data?.details?.attemptsLeft
      return left != null ? `${t("Kod noto'g'ri")}. ${t('Qolgan urinishlar')}: ${left}` : t("Kod noto'g'ri yoki eskirgan. Yangi kod so'rang")
    }
    if (c === 'CODE_EXPIRED') return t("Kodning muddati o'tgan (15 daqiqa). Yangi kod so'rang")
    if (c === 'CODE_ATTEMPTS') return t("Noto'g'ri urinishlar soni tugadi. Yangi kod so'rang")
    if (e?.status === 429) return t("Juda ko'p so'rov. Birozdan so'ng qayta urining")
    if (c === 'VALIDATION_ERROR' && /email/i.test(e?.message || '')) return t("Email noto'g'ri")
    return e?.message || t('Xatolik yuz berdi')
  }

  async function sendCode(e) {
    e?.preventDefault()
    setErr('')
    const em = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(em)) return setErr(t("Email noto'g'ri"))
    setBusy(true)
    try {
      await api.post('/auth/forgot', { email: em })
      setInfo(t("Agar akkauntingizga Telegram ulangan bo'lsa, kod yuborildi. Aks holda administratorga murojaat qiling"))
      setCode(''); setStep(2)
    } catch (e2) { setErr(errText(e2)) } finally { setBusy(false) }
  }

  async function doReset(e) {
    e.preventDefault()
    setErr('')
    const c = code.replace(/\s+/g, '')
    if (!/^\d{6}$/.test(c)) return setErr(t('Kod 6 ta raqamdan iborat'))
    if (password.length < 6) return setErr(t("Parol kamida 6 ta belgi bo'lishi kerak"))
    if (password !== password2) return setErr(t('Parollar bir xil emas'))
    setBusy(true)
    try {
      await api.post('/auth/reset', { email: email.trim().toLowerCase(), code: c, newPassword: password })
      setPassword(''); setPassword2(''); setStep(3)
    } catch (e2) { setErr(errText(e2)) } finally { setBusy(false) }
  }

  return (
    <Shell>
      {step === 1 && (
        <form className="ac-login__card" onSubmit={sendCode}>
          <Brand />
          <h1 className="ac-login__title">{t('Parolni tiklash')}</h1>
          <div className="ac-login__sub">{t("Emailingizni kiriting — Telegram'ga bir martalik kod yuboramiz")}</div>
          <Field label={t('Email')}>
            <input className="ac-input" type="email" autoComplete="username" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" autoFocus />
          </Field>
          {err && <div className="ac-login__err">{err}</div>}
          <button className="ac-btn ac-btn--blue ac-login__submit" disabled={busy}>
            {busy && <span className="ac-spinner" />}
            {t('Kod olish')}
          </button>
          <button type="button" className="ac-login__link" onClick={onBack}>{t("Kirish sahifasiga qaytish")}</button>
        </form>
      )}
      {step === 2 && (
        <form className="ac-login__card" onSubmit={doReset}>
          <Brand />
          <h1 className="ac-login__title">{t('Parolni tiklash')}</h1>
          {info && <div className="ac-login__note">{info}</div>}
          <Field label={t('Tasdiqlash kodi')}>
            <input className="ac-input ac-login__code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" autoFocus />
          </Field>
          <Field label={t('Yangi parol')}>
            <input className="ac-input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('Kamida 6 ta belgi')} />
          </Field>
          <Field label={t('Parolni takrorlang')}>
            <input className="ac-input" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} placeholder="••••••••" />
          </Field>
          {err && <div className="ac-login__err">{err}</div>}
          <button className="ac-btn ac-btn--blue ac-login__submit" disabled={busy}>
            {busy && <span className="ac-spinner" />}
            {t('Parolni yangilash')}
          </button>
          <div className="ac-login__links">
            <button type="button" className="ac-login__link" onClick={() => { setErr(''); setStep(1) }}>{t('Kodni qayta yuborish')}</button>
            <button type="button" className="ac-login__link" onClick={onBack}>{t("Kirish sahifasiga qaytish")}</button>
          </div>
        </form>
      )}
      {step === 3 && (
        <div className="ac-login__card">
          <Brand />
          <h1 className="ac-login__title">{t('Parol yangilandi')}</h1>
          <div className="ac-login__sub">{t('Barcha qurilmalardagi seanslar yopildi. Endi yangi parol bilan kiring')}</div>
          <button type="button" className="ac-btn ac-btn--blue ac-login__submit" onClick={onBack}>{t('KIRISH')}</button>
        </div>
      )}
    </Shell>
  )
}

function LoginForm({ onForgot }) {
  const { login } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
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
      navigate(nextPath(searchParams), { replace: true })
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

        <div className="ac-login__row">
          <label className="ac-login__remember">
            <input type="checkbox" className="ac-check" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            {t('Meni eslab qol')}
          </label>
          <button type="button" className="ac-login__link ac-login__forgot" onClick={() => onForgot(email.trim())}>{t('Parolni unutdingizmi?')}</button>
        </div>

        {err && <div className="ac-login__err">{err}</div>}

        <button className="ac-btn ac-btn--blue ac-login__submit" disabled={busy}>
          {busy && <span className="ac-spinner" />}
          {t('KIRISH')}
        </button>
      </form>
    </Shell>
  )
}
