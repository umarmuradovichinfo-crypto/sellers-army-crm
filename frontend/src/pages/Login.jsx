import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
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
