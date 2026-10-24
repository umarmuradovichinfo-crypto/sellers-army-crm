import React, { useState, useEffect } from 'react'
import { dialog } from '../Dialog'
import Icon from '../Icon'
import { Loading, Pill } from '../ui'
import { crmService } from '../../services/crm.service'

// CRM → Sozlamalar → Telefoniya. OnlinePBX kabinet ma'lumotlarini kiritish (ulash nuqtasi).
// Saqlagach: click-to-call, kiruvchi popup, qo'ng'iroqlar tarixi avtomatik ishlaydi.
export default function PbxSettingsView() {
  const [cfg, setCfg] = useState(null)
  const [domain, setDomain] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [defaultExt, setDefaultExt] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [callMode, setCallMode] = useState('callback')
  const [dialScheme, setDialScheme] = useState('tel')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testRes, setTestRes] = useState(null)

  const load = () => crmService.getPbxConfig().then((c) => {
    setCfg(c); setDomain(c.domain || ''); setDefaultExt(c.defaultExt || ''); setApiKey('')
    setCallMode(c.callMode || 'callback'); setDialScheme(c.dialScheme || 'tel')
  })
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!domain.trim()) { await dialog.alert('Domenni kiriting (masalan: kompaniya.onpbx.ru)'); return }
    setSaving(true); setTestRes(null)
    try {
      const patch = { domain: domain.trim(), defaultExt: defaultExt.trim(), webhookSecret: webhookSecret.trim(), callMode, dialScheme }
      if (apiKey.trim()) patch.apiKey = apiKey.trim() // faqat yangi kalit berilsa
      const c = await crmService.savePbxConfig(patch)
      setCfg(c); setApiKey(''); setWebhookSecret('')
      crmService.refreshPbxMode() // qo'ng'iroq usuli keshini yangilaymiz
    } catch (e) { await dialog.alert(e.message || 'Saqlanmadi') }
    finally { setSaving(false) }
  }
  const test = async () => {
    setTesting(true); setTestRes(null)
    try { setTestRes(await crmService.testPbx()) }
    catch (e) { setTestRes({ ok: false, message: e.message || 'Xatolik' }) }
    finally { setTesting(false) }
  }
  const copyWebhook = async () => {
    try { await navigator.clipboard.writeText(cfg.webhookUrl) } catch { /* */ }
    await dialog.alert(`Webhook havolasi nusxalandi:\n${cfg.webhookUrl}\n\nBuni OnlinePBX kabinetida "Webhook / URL уведомлений" bo'limiga qo'ying.`)
  }

  if (cfg === null) return <Loading />

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="fx ac gap10 mb16">
        <b style={{ fontSize: 15 }}>OnlinePBX telefoniya</b>
        {cfg.enabled
          ? <Pill kind="ok">Ulangan</Pill>
          : <Pill kind="mut">Ulanmagan</Pill>}
      </div>
      <div className="sub2" style={{ fontSize: 13, marginBottom: 14 }}>
        OnlinePBX kabinet ma'lumotlarini kiriting — saqlagach click-to-call, kiruvchi qo'ng'iroq oynasi va qo'ng'iroqlar tarixi avtomatik ishlaydi.
      </div>

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <div className="hr-field">
          <label>Domen (OnlinePBX)</label>
          <input className="hr-input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="kompaniya.onpbx.ru" />
        </div>
        <div className="hr-field">
          <label>API kalit (auth_key)</label>
          <input className="hr-input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder={cfg.apiKeySet ? '•••••••• (saqlangan — o\'zgartirish uchun yangisini yozing)' : 'OnlinePBX API kaliti'} />
        </div>
        <div className="hr-field">
          <label>Standart ichki raqam (extension) — ixtiyoriy</label>
          <input className="hr-input" value={defaultExt} onChange={(e) => setDefaultExt(e.target.value)} placeholder="masalan 101" />
          <div className="sub2" style={{ fontSize: 11.5, marginTop: 3 }}>Operatorda o'z raqami bo'lmasa, shu ishlatiladi.</div>
        </div>
        <div className="fx ac gap10">
          <button className="btn primary" disabled={saving} onClick={save}>{saving ? 'Saqlanmoqda…' : 'Saqlash'}</button>
          <button className="btn" disabled={testing || !cfg.enabled} onClick={test}>{testing ? 'Tekshirilmoqda…' : 'Ulanishni tekshirish'}</button>
          {testRes && <Pill kind={testRes.ok ? 'ok' : 'dang'}>{testRes.ok ? '✓ ' : '✕ '}{testRes.message}</Pill>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12, display: 'grid', gap: 10 }}>
        <b style={{ fontSize: 13.5 }}>Qo'ng'iroq usuli</b>
        <label className="fx as gap8" style={{ cursor: 'pointer', alignItems: 'flex-start' }}>
          <input type="radio" checked={callMode === 'softphone'} onChange={() => setCallMode('softphone')} style={{ marginTop: 3 }} />
          <span>
            <b style={{ fontSize: 13 }}>Softphone (MicroSIP o'zi teradi)</b>
            <div className="sub2" style={{ fontSize: 12 }}>«Qo'ng'iroq» bosilganda kompyuterdagi MicroSIP (yoki boshqa SIP dastur) darhol terib beradi. Qo'ng'iroq va yozuv webhook orqali tarixga tushadi.</div>
          </span>
        </label>
        <label className="fx as gap8" style={{ cursor: 'pointer', alignItems: 'flex-start' }}>
          <input type="radio" checked={callMode === 'callback'} onChange={() => setCallMode('callback')} style={{ marginTop: 3 }} />
          <span>
            <b style={{ fontSize: 13 }}>Server-callback (OnlinePBX jiringlatadi)</b>
            <div className="sub2" style={{ fontSize: 12 }}>OnlinePBX avval ichki raqamingizni jiringlatadi, ko'targach mijozga ulaydi. Ichki raqamga qurilma yoki mobil ilova (push) ulangan bo'lishi shart.</div>
          </span>
        </label>
        {callMode === 'softphone' && (
          <div className="fx ac gap8" style={{ flexWrap: 'wrap' }}>
            <span className="sub2" style={{ fontSize: 12 }}>Protokol:</span>
            <select className="hr-select" style={{ width: 120 }} value={dialScheme} onChange={(e) => setDialScheme(e.target.value)}>
              <option value="tel">tel:</option>
              <option value="sip">sip:</option>
              <option value="callto">callto:</option>
            </select>
            <span className="sub2" style={{ fontSize: 11.5 }}>MicroSIP terilmasa protokolni almashtiring (MicroSIP → Settings → tegishli protokolni yoqing).</span>
          </div>
        )}
        <div style={{ fontSize: 11.5, color: 'var(--mut)', background: 'var(--canvas)', borderRadius: 8, padding: '8px 10px' }}>
          <b>MicroSIP sozlash (bir marta):</b> MicroSIP → Menu → Settings → «tel/callto/sip» protokolini shu dastur bilan bog'lang (yoki Windows → Default apps). Shundan so'ng CRM'dagi «Qo'ng'iroq» MicroSIP'ni ochib teradi.
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <b style={{ fontSize: 13.5 }}>Webhook havolasi</b>
        <div className="sub2" style={{ fontSize: 12, margin: '4px 0 8px' }}>
          Kiruvchi qo'ng'iroqlar CRM'ga tushishi uchun bu havolani OnlinePBX kabinetidagi webhook (уведомления) sozlamasiga qo'ying:
        </div>
        <div className="fx ac gap8">
          <input className="hr-input" readOnly value={cfg.webhookUrl} style={{ flex: 1, fontSize: 12 }} onFocus={(e) => e.target.select()} />
          <button className="btn sm" onClick={copyWebhook}><Icon name="copy" size={13} />Nusxa</button>
        </div>
      </div>
    </div>
  )
}
