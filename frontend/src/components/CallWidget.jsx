import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from './Icon'
import { useAuth } from '../context/AuthContext'
import { crmService } from '../services/crm.service'
import { phone } from '../lib/webrtcPhone'

// Brauzer WebRTC-telefoni (JsSIP orqali OnlinePBX'ga). Operator SIP paroli bilan
// ro'yxatdan o'tadi; kiruvchi qo'ng'iroqni SHU YERDAN ko'taradi/rad qiladi (ovoz brauzerда).
// SIP parol sozlanmagan bo'lsa — kichik sozlash paneli chiqadi.
function fmtTimer(s) { const m = Math.floor(s / 60); return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') }

export default function CallWidget() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [cfg, setCfg] = useState(null) // {enabled, domain, wss, uri, extension, sipPasswordSet, ...}
  const [reg, setReg] = useState('offline') // offline | connecting | registered | failed
  const [incoming, setIncoming] = useState(null) // {phone, leadName, leadId}
  const [active, setActive] = useState(null) // {phone, name, at}
  const [tick, setTick] = useState(0)
  const [setupOpen, setSetupOpen] = useState(false)
  const [mini, setMini] = useState(true) // status dumaloq holatда

  const allowed = can && can('crm.view')

  const loadCfg = () => crmService.getWebrtcConfig().then(setCfg).catch(() => {})
  useEffect(() => { if (allowed) loadCfg() }, [allowed])

  // Ro'yxatdan o'tish (SIP parol bor bo'lsa)
  useEffect(() => {
    if (!cfg || !cfg.enabled) return
    phone.start({ wss: cfg.wss, uri: cfg.uri, password: cfg.password, displayName: cfg.displayName })
    return () => phone.stop()
  }, [cfg && cfg.enabled, cfg && cfg.uri])

  // WebRTC hodisalari
  useEffect(() => {
    const offs = [
      phone.on('state', setReg),
      phone.on('incoming', async ({ peer }) => {
        setActive(null); setMini(false)
        let leadName = null, leadId = null
        try { const r = await crmService.leadByPhone(peer); leadName = r.leadName; leadId = r.leadId } catch { /* */ }
        setIncoming({ phone: peer, leadName, leadId })
      }),
      phone.on('outgoing', ({ peer }) => { setIncoming(null); setMini(false); setActive({ phone: peer, at: Date.now() }) }),
      phone.on('active', ({ peer }) => { setIncoming(null); setActive((a) => a || { phone: peer, at: Date.now() }) }),
      phone.on('ended', () => { setIncoming(null); setActive(null); setTick(0); setMini(true) }),
    ]
    return () => offs.forEach((off) => off())
  }, [])

  useEffect(() => { if (!active) return; const iv = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(iv) }, [active])

  // Chiquvchi (lid kartasidan): WebRTC yoqilmagan bo'lsa — eski pbx:outgoing (MicroSIP) ko'rsatish
  useEffect(() => {
    const onOut = (e) => { if (cfg && cfg.enabled) return; setIncoming(null); setActive({ phone: (e.detail && e.detail.phone) || '', name: (e.detail && e.detail.name) || null, at: Date.now() }) }
    window.addEventListener('pbx:outgoing', onOut)
    return () => window.removeEventListener('pbx:outgoing', onOut)
  }, [cfg && cfg.enabled])

  if (!allowed || !cfg || !cfg.domain) return null // PBX umuman sozlanmagan

  const openLead = (id) => {
    const inCrmApp = window.location.hostname.startsWith('crm.') || new URLSearchParams(window.location.search).get('app') === 'crm'
    if (inCrmApp) navigate(id ? `/?lead=${id}` : '/')
    else window.location.href = id ? `/?app=crm&lead=${id}` : '/?app=crm'
  }

  // ── Kiruvchi qo'ng'iroq — ko'tarish / rad qilish ──
  if (incoming) {
    return (
      <Panel>
        <Head title="Kiruvchi qo'ng'iroq" dot="var(--ok)" onClose={() => { phone.hangup(); setIncoming(null) }} />
        <div style={{ padding: '18px 16px', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, margin: '0 auto 12px', borderRadius: '50%', background: 'rgba(70,177,123,.15)', display: 'grid', placeItems: 'center', animation: 'pbxring 1s ease-in-out infinite' }}>
            <span style={{ fontSize: 30 }}>📞</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, margin: '2px 0 4px' }}>{incoming.phone}</div>
          <div style={{ fontSize: 13.5, marginBottom: 14 }}>{incoming.leadName ? <>Mijoz: <b>{incoming.leadName}</b></> : <span className="sub2">Noma'lum raqam</span>}</div>
          <div className="fx ac gap8">
            <button className="btn f1" style={{ background: 'var(--ok)', color: '#fff', borderColor: 'var(--ok)', fontWeight: 700 }} onClick={() => phone.answer()}>
              <Icon name="phone" size={15} /> Ko'tarish
            </button>
            <button className="btn f1" style={{ background: 'var(--dang)', color: '#fff', borderColor: 'var(--dang)', fontWeight: 700 }} onClick={() => { phone.hangup(); setIncoming(null) }}>
              Rad qilish
            </button>
          </div>
          {incoming.leadId && <button className="btn sm" style={{ marginTop: 10 }} onClick={() => openLead(incoming.leadId)}><Icon name="crm" size={13} /> Kartani ochish</button>}
        </div>
      </Panel>
    )
  }

  // ── Aktiv qo'ng'iroq ──
  if (active) {
    return (
      <Panel>
        <Head title="Qo'ng'iroq" dot="var(--ok)" onClose={() => phone.hangup()} />
        <div style={{ padding: '18px 16px', textAlign: 'center' }}>
          <div style={{ width: 60, height: 60, margin: '0 auto 12px', borderRadius: '50%', background: 'rgba(70,177,123,.15)', display: 'grid', placeItems: 'center' }}><span style={{ fontSize: 26 }}>📲</span></div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{active.name || active.phone}</div>
          {active.name && <div className="sub2" style={{ fontSize: 12.5 }}>{active.phone}</div>}
          <div className="tnum" style={{ fontSize: 22, fontWeight: 800, color: 'var(--ok)', margin: '10px 0 14px' }}>{fmtTimer(tick)}</div>
          <button className="btn" style={{ width: '100%', background: 'var(--dang)', color: '#fff', borderColor: 'var(--dang)', fontWeight: 700 }} onClick={() => phone.hangup()}>
            Yakunlash
          </button>
        </div>
      </Panel>
    )
  }

  // ── SIP parol sozlanmagan — sozlash paneli ──
  if (!cfg.enabled) {
    if (!setupOpen) {
      return <Launcher color="var(--mut)" title="Brauzer telefonini sozlash" onClick={() => setSetupOpen(true)} />
    }
    return <SetupPanel cfg={cfg} onClose={() => setSetupOpen(false)} onSaved={(c) => { setCfg(c); setSetupOpen(false) }} />
  }

  // ── Ro'yxatdan o'tgan (idle) — status ──
  const dot = reg === 'registered' ? 'var(--ok)' : reg === 'failed' ? 'var(--dang)' : 'var(--warn)'
  const label = reg === 'registered' ? 'Telefon tayyor' : reg === 'failed' ? 'Ulanmadi' : 'Ulanmoqda…'
  if (mini) return <Launcher color={dot} title={label} onClick={() => setMini(false)} />
  return (
    <Panel>
      <Head title="Telefoniya" dot={dot} onClose={() => setMini(true)} />
      <div style={{ padding: '16px', textAlign: 'center' }}>
        <div className="sub2" style={{ fontSize: 12.5, marginBottom: 4 }}>Holat</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: dot }}>{label}</div>
        <div className="sub2" style={{ fontSize: 11.5, marginTop: 8 }}>Kiruvchi qo'ng'iroqni shu yerдан ko'tarasiz. Chiquvchi — lid kartasидан «Qo'ng'iroq».</div>
        {reg === 'failed' && <div className="sub2" style={{ fontSize: 11, marginTop: 8, color: 'var(--dang)' }}>Ulanib bo'lmadi. OnlinePBX'da 7443 port yoqilganini va SIP parol to'g'riligini tekshiring.</div>}
      </div>
    </Panel>
  )
}

// ── Kichik yordamchi komponentlar ──
function Panel({ children }) {
  return <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 250, width: 300, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,.28)', overflow: 'hidden', animation: 'pbxslide .18s ease' }}>{children}</div>
}
function Head({ title, dot, onClose }) {
  return (
    <div className="fx ac gap8" style={{ padding: '11px 14px', borderBottom: '1px solid var(--bd)', background: 'var(--canvas)' }}>
      <span style={{ width: 9, height: 9, borderRadius: 99, background: dot, flex: 'none' }} />
      <b style={{ fontSize: 13.5, flex: 1 }}>{title}</b>
      <button className="hr-x" onClick={onClose} title="Yig'ish">×</button>
    </div>
  )
}
function Launcher({ color, title, onClick }) {
  return (
    <button onClick={onClick} title={title}
      style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 250, width: 52, height: 52, borderRadius: '50%', border: '1px solid var(--bd)', cursor: 'pointer', background: 'var(--card)', boxShadow: '0 8px 24px rgba(0,0,0,.22)', display: 'grid', placeItems: 'center' }}>
      <span style={{ position: 'relative' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.9.36 1.78.7 2.6a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.48-1.27a2 2 0 0 1 2.11-.45c.82.34 1.7.57 2.6.7A2 2 0 0 1 22 16.92z" /></svg>
        <span style={{ position: 'absolute', right: -3, top: -3, width: 11, height: 11, borderRadius: 99, background: color, border: '2px solid var(--card)' }} />
      </span>
    </button>
  )
}
function SetupPanel({ cfg, onClose, onSaved }) {
  const [ext, setExt] = useState(cfg.extension || '')
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const save = async () => {
    if (!ext.trim() || !pass.trim()) { setErr('Ichki raqam va SIP parol kerak'); return }
    setBusy(true); setErr(null)
    try { const c = await crmService.saveWebrtcConfig({ extension: ext.trim(), sipPassword: pass.trim() }); onSaved(c) }
    catch (e) { setErr(e.message || 'Saqlanmadi'); setBusy(false) }
  }
  return (
    <Panel>
      <Head title="Brauzer telefonini yoqish" dot="var(--warn)" onClose={onClose} />
      <div style={{ padding: 16, display: 'grid', gap: 10 }}>
        <div className="sub2" style={{ fontSize: 12 }}>OnlinePBX ichki raqamingiz va SIP parolingizni kiriting — brauzerда qo'ng'iroq qabul qilasiz (MicroSIP kerak emas).</div>
        <div className="hr-field"><label>Ichki raqam</label><input className="hr-input" value={ext} onChange={(e) => setExt(e.target.value)} placeholder="masalan 100" /></div>
        <div className="hr-field"><label>SIP parol</label><input className="hr-input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="OnlinePBX SIP paroli" /></div>
        {err && <div style={{ fontSize: 12, color: 'var(--dang)', fontWeight: 600 }}>{err}</div>}
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saqlanmoqda…' : 'Yoqish'}</button>
      </div>
    </Panel>
  )
}
