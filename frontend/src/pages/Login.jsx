import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api, USE_MOCKS } from '../lib/apiClient'

function SetupForm({ tokenRequired }) {
  const { setup } = useAuth()
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
    if (!name.trim()) return setErr('Ismni kiriting')
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr("Email noto'g'ri")
    if (password.length < 8) return setErr("Parol kamida 8 ta belgi bo'lishi kerak")
    if (password !== password2) return setErr('Parollar bir xil emas')
    setBusy(true)
    try {
      await setup({ name: name.trim(), email: email.trim(), password, ...(tokenRequired ? { setupToken } : {}) })
      navigate('/')
    } catch (e) {
      setErr(e?.message || 'Sozlashda xatolik')
    } finally { setBusy(false) }
  }

  return (
    <div className="app login-root">
      <form className="card login-card" onSubmit={submit}>
        <img src="/logo-icon.png" alt="" style={{ height: 54, marginBottom: 18 }} />
        <h1 className="pgttl" style={{ marginBottom: 4 }}>Birinchi sozlash</h1>
        <div className="pgsub mb24">O'zingizning admin login va parolingizni yarating</div>

        <label className="sub2 login-lbl">Ism</label>
        <input className="hr-input login-in" autoComplete="name" value={name}
          onChange={(e) => setName(e.target.value)} placeholder="Ismingiz" />

        <label className="sub2 login-lbl">Email</label>
        <input className="hr-input login-in" autoComplete="username" value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />

        <label className="sub2 login-lbl">Parol</label>
        <input className="hr-input login-in" type="password" autoComplete="new-password" value={password}
          onChange={(e) => setPassword(e.target.value)} placeholder="Kamida 8 ta belgi" />

        <label className="sub2 login-lbl">Parolni takrorlang</label>
        <input className="hr-input login-in" type="password" autoComplete="new-password" value={password2}
          onChange={(e) => setPassword2(e.target.value)} placeholder="••••••••" />

        {tokenRequired && (
          <>
            <label className="sub2 login-lbl">Sozlash kodi</label>
            <input className="hr-input login-in" autoComplete="off" value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)} placeholder="Sozlash kodi" />
          </>
        )}

        {err && <div className="login-err">{err}</div>}

        <button className="btn primary login-btn" disabled={busy}>
          {busy ? 'Yaratilmoqda…' : 'Sozlash va kirish'}
        </button>
      </form>
    </div>
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
  if (setupInfo === undefined) return <div className="app login-root" />
  if (setupInfo && setupInfo.needsSetup) return <SetupForm tokenRequired={!!setupInfo.tokenRequired} />
  return <LoginForm />
}

function LoginForm() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (e) {
      setErr(e?.message || 'Kirishda xatolik')
    } finally { setBusy(false) }
  }

  return (
    <div className="app login-root">
      <form className="card login-card" onSubmit={submit}>
        <img src="/logo-icon.png" alt="" style={{ height: 54, marginBottom: 18 }} />
        <h1 className="pgttl" style={{ marginBottom: 4 }}>Tizimga kirish</h1>
        <div className="pgsub mb24">Sellers Army CRM</div>

        <label className="sub2 login-lbl">Email</label>
        <input
          className="hr-input login-in"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com"
        />

        <label className="sub2 login-lbl">Parol</label>
        <input
          className="hr-input login-in"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />

        {err && <div className="login-err">{err}</div>}

        <button className="btn primary login-btn" disabled={busy}>
          {busy ? 'Kirilmoqda…' : 'Kirish'}
        </button>
      </form>
    </div>
  )
}
