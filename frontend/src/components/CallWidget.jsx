import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ico } from '../amo/AmoIcons'
import { useT } from '../amo/i18n'
import '../amo/i18n/callwidget.ru.js'
import '../amo/callwidget.css'
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
  const t = useT()
  const [cfg, setCfg] = useState(null) // {enabled, domain, wss, uri, extension, sipPasswordSet, ...}
  const [reg, setReg] = useState('offline') // offline | connecting | registered | failed
  const [incoming, setIncoming] = useState(null) // {phone, leadName, leadId}
  const [active, setActive] = useState(null) // {phone, name, at}
  const [tick, setTick] = useState(0)
  const [setupOpen, setSetupOpen] = useState(false)
  const [mini, setMini] = useState(true) // status dumaloq holatда
  const [num, setNum] = useState('') // dial-pad raqami
  const [dialErr, setDialErr] = useState('')

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

  const openLead = (id) => navigate(id ? `/leads/detail/${id}` : '/dashboard')

  const doDial = async () => {
    const to = num.trim()
    if (!to) return
    setDialErr('')
    if (phone.call(to)) { setNum(''); return }
    try { await crmService.dial(to); setNum('') } catch (e) { setDialErr(e.message || t('Telefon ulanmagan')) }
  }

  // ── Kiruvchi qo'ng'iroq — qabul qilish / rad etish ──
  if (incoming) {
    const reject = () => { phone.hangup(); setIncoming(null) }
    return (
      <Panel>
        <Head title={t("Kiruvchi qo'ng'iroq")} dot="#3fa66b" onClose={reject} />
        <div className="ac-cw__body">
          <div className="ac-cw__ring ac-cw__ring--pulse"><Ico name="phone" size={26} /></div>
          <div className="ac-cw__num">{incoming.phone}</div>
          <div className="ac-cw__name">
            {incoming.leadName
              ? (incoming.leadId ? <a onClick={() => openLead(incoming.leadId)}>{incoming.leadName}</a> : <b>{incoming.leadName}</b>)
              : <span className="ac-cw__sub">{t("Noma'lum raqam")}</span>}
          </div>
          <div className="ac-cw__row">
            <button className="ac-btn ac-cw__green" onClick={() => phone.answer()}>{t('Qabul qilish')}</button>
            <button className="ac-btn ac-cw__red" onClick={reject}>{t('Rad etish')}</button>
          </div>
          {incoming.leadId && <button className="ac-cw__open" onClick={() => openLead(incoming.leadId)}>{t('Bitim kartochkasini ochish')}</button>}
        </div>
      </Panel>
    )
  }

  // ── Aktiv qo'ng'iroq ──
  if (active) {
    return (
      <Panel>
        <Head title={t("Qo'ng'iroq")} dot="#3fa66b" onClose={() => phone.hangup()} />
        <div className="ac-cw__body">
          <div className="ac-cw__ring"><Ico name="phoneOut" size={26} /></div>
          <div className="ac-cw__num">{active.name || active.phone}</div>
          {active.name && <div className="ac-cw__sub">{active.phone}</div>}
          <div className="ac-cw__timer">{fmtTimer(tick)}</div>
          <button className="ac-btn ac-cw__red" style={{ width: '100%', color: '#fff' }} onClick={() => phone.hangup()}>{t('Yakunlash')}</button>
        </div>
      </Panel>
    )
  }

  // ── SIP parol sozlanmagan — sozlash paneli ──
  if (!cfg.enabled) {
    if (!setupOpen) {
      return <Launcher color="var(--palette-text-secondary-light)" idle title={t('Brauzer telefonini sozlash')} onClick={() => setSetupOpen(true)} />
    }
    return <SetupPanel cfg={cfg} onClose={() => setSetupOpen(false)} onSaved={(c) => { setCfg(c); setSetupOpen(false) }} />
  }

  // ── Ro'yxatdan o'tgan (idle) — status + raqam terish ──
  const dot = reg === 'registered' ? '#3fa66b' : reg === 'failed' ? '#e0524f' : '#f5a623'
  const label = reg === 'registered' ? t('Telefon tayyor') : reg === 'failed' ? t('Ulanmadi') : t('Ulanmoqda…')
  if (mini) return <Launcher color={dot} title={label} onClick={() => setMini(false)} />
  return (
    <Panel>
      <Head title={t('Telefoniya')} dot={dot} onClose={() => setMini(true)} />
      <div className="ac-cw__body" style={{ paddingTop: 12 }}>
        <div className="ac-cw__sub">{label}</div>
        {reg === 'failed' && <div className="ac-cw__err">{t("Ulanib bo'lmadi. OnlinePBX'da 7443 port yoqilganini va SIP parol to'g'riligini tekshiring.")}</div>}
        <div className="ac-cw__dial">
          <input className="ac-input" value={num} inputMode="tel" placeholder={t('Raqamni kiriting')}
            onChange={(e) => setNum(e.target.value.replace(/[^\d+*#]/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') doDial() }} />
          <button className="ac-btn ac-btn--sm" style={{ height: 38 }} onClick={() => setNum((n) => n.slice(0, -1))}><Ico name="close" size={12} /></button>
        </div>
        <div className="ac-cw__pad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((k) => (
            <button key={k} className="ac-cw__key" onClick={() => setNum((n) => n + k)}>{k}</button>
          ))}
        </div>
        <button className="ac-btn ac-cw__green ac-cw__call" disabled={reg !== 'registered' || !num.trim()} onClick={doDial}>
          <Ico name="phone" size={14} /> {t("Qo'ng'iroq qilish")}
        </button>
        {dialErr && <div className="ac-cw__err">{dialErr}</div>}
      </div>
    </Panel>
  )
}

// ── Kichik yordamchi komponentlar ──
function Panel({ children }) {
  return <div className="ac-cw">{children}</div>
}
function Head({ title, dot, onClose }) {
  const t = useT()
  return (
    <div className="ac-cw__head">
      <span className="ac-cw__dot" style={{ background: dot }} />
      <b className="ac-cw__title">{title}</b>
      <button className="ac-cw__x" onClick={onClose} title={t("Yig'ish")}><Ico name="close" size={12} /></button>
    </div>
  )
}
function Launcher({ color, title, onClick, idle }) {
  return (
    <button className={'ac-cw-fab' + (idle ? ' ac-cw-fab--idle' : '')} onClick={onClick} title={title}>
      <Ico name="phone" size={24} />
      <span className="ac-cw-fab__dot" style={{ background: color }} />
    </button>
  )
}
function SetupPanel({ cfg, onClose, onSaved }) {
  const t = useT()
  const [ext, setExt] = useState(cfg.extension || '')
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const save = async () => {
    if (!ext.trim() || !pass.trim()) { setErr(t('Ichki raqam va SIP parol kerak')); return }
    setBusy(true); setErr(null)
    try { const c = await crmService.saveWebrtcConfig({ extension: ext.trim(), sipPassword: pass.trim() }); onSaved(c) }
    catch (e) { setErr(e.message || t('Saqlanmadi')); setBusy(false) }
  }
  return (
    <Panel>
      <Head title={t('Brauzer telefonini yoqish')} dot="#f5a623" onClose={onClose} />
      <div className="ac-cw__form">
        <div className="ac-cw__sub" style={{ fontSize: 12 }}>{t("OnlinePBX ichki raqamingiz va SIP parolingizni kiriting — brauzerda qo'ng'iroq qabul qilasiz (MicroSIP kerak emas).")}</div>
        <div><label>{t('Ichki raqam')}</label><input className="ac-input" value={ext} onChange={(e) => setExt(e.target.value)} placeholder={t('masalan 100')} /></div>
        <div><label>{t('SIP parol')}</label><input className="ac-input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={t('OnlinePBX SIP paroli')} /></div>
        {err && <div className="ac-cw__err">{err}</div>}
        <button className="ac-btn ac-btn--blue" disabled={busy} onClick={save}>{busy ? t('Saqlanmoqda…') : t('Yoqish')}</button>
      </div>
    </Panel>
  )
}
