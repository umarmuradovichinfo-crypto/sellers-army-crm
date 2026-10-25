// OnlinePBX telefoniya — vidjet oynasi ichidagi sozlamalar (mantiq: eski PbxSettingsView).
import React, { useEffect, useState } from 'react'
import { crmService } from '../../services/crm.service'
import { useT } from '../i18n'

export default function IntegrationsPbx({ onStatus }) {
  const t = useT()
  const [cfg, setCfg] = useState(null)
  const [domain, setDomain] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [defaultExt, setDefaultExt] = useState('')
  const [callMode, setCallMode] = useState('callback')
  const [dialScheme, setDialScheme] = useState('tel')
  const [popups, setPopups] = useState(true)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState(null)

  const load = () => crmService.getPbxConfig().then((c) => {
    setCfg(c); setDomain(c.domain || ''); setDefaultExt(c.defaultExt || ''); setApiKey('')
    setCallMode(c.callMode || 'callback'); setDialScheme(c.dialScheme || 'tel'); setPopups(c.popups !== false)
  }).catch((e) => setMsg({ ok: false, m: e.message || t('Xatolik') }))
  useEffect(() => { load() }, []) // eslint-disable-line

  const save = async () => {
    if (!domain.trim()) { setMsg({ ok: false, m: t('Domenni kiriting (masalan: kompaniya.onpbx.ru)') }); return }
    setBusy(true); setMsg(null)
    try {
      const patch = { domain: domain.trim(), defaultExt: defaultExt.trim(), callMode, dialScheme, popups }
      if (apiKey.trim()) patch.apiKey = apiKey.trim()
      const c = await crmService.savePbxConfig(patch)
      setCfg(c); setApiKey('')
      crmService.refreshPbxMode()
      onStatus?.(!!c.enabled)
      setMsg({ ok: true, m: t('Saqlandi') })
    } catch (e) { setMsg({ ok: false, m: e.message || t('Saqlanmadi') }) }
    finally { setBusy(false) }
  }
  const test = async () => {
    setTesting(true); setMsg(null)
    try { const r = await crmService.testPbx(); setMsg({ ok: !!r.ok, m: r.message }) }
    catch (e) { setMsg({ ok: false, m: e.message || t('Xatolik') }) }
    finally { setTesting(false) }
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(cfg.webhookUrl); setMsg({ ok: true, m: t('Havola nusxalandi') }) } catch { /* */ }
  }

  if (cfg === null) return <div className="ac-spinner" />
  return (
    <>
      <div className="ac-int-lead">{t("OnlinePBX kabinet ma'lumotlarini kiriting — saqlagach click-to-call, kiruvchi qo'ng'iroq oynasi va qo'ng'iroqlar tarixi avtomatik ishlaydi.")}</div>
      <div className="ac-int-field"><label>{t('Domen (OnlinePBX)')}</label>
        <input className="ac-input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="company.onpbx.ru" />
      </div>
      <div className="ac-int-field"><label>{t('API kalit (auth_key)')}</label>
        <input className="ac-input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
          placeholder={cfg.apiKeySet ? t("•••••••• (saqlangan — o'zgartirish uchun yangisini yozing)") : t('OnlinePBX API kaliti')} />
      </div>
      <div className="ac-int-field"><label>{t('Standart ichki raqam (ixtiyoriy)')}</label>
        <input className="ac-input" value={defaultExt} onChange={(e) => setDefaultExt(e.target.value)} placeholder="101" />
        <div className="ac-int-hint">{t("Operatorda o'z raqami bo'lmasa, shu ishlatiladi.")}</div>
      </div>

      <div className="ac-int-field"><label>{t("Qo'ng'iroq usuli")}</label>
        <div className={`ac-int-radio ${callMode === 'softphone' ? 'on' : ''}`} onClick={() => setCallMode('softphone')}>
          <input type="radio" readOnly checked={callMode === 'softphone'} />
          <div><b>{t("Softphone (MicroSIP o'zi teradi)")}</b>
            <div className="sub">{t("«Qo'ng'iroq» bosilganda kompyuterdagi SIP dastur darhol terib beradi. Qo'ng'iroq va yozuv webhook orqali tarixga tushadi.")}</div></div>
        </div>
        <div className={`ac-int-radio ${callMode === 'callback' ? 'on' : ''}`} onClick={() => setCallMode('callback')}>
          <input type="radio" readOnly checked={callMode === 'callback'} />
          <div><b>{t('Server-callback (OnlinePBX jiringlatadi)')}</b>
            <div className="sub">{t("OnlinePBX avval ichki raqamingizni jiringlatadi, ko'targach mijozga ulaydi.")}</div></div>
        </div>
        {callMode === 'softphone' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <span className="ac-muted" style={{ fontSize: 13 }}>{t('Protokol')}:</span>
            <select className="ac-select" style={{ width: 120 }} value={dialScheme} onChange={(e) => setDialScheme(e.target.value)}>
              <option value="tel">tel:</option><option value="sip">sip:</option><option value="callto">callto:</option>
            </select>
          </div>
        )}
      </div>

      {/* amoCRM onlinePBX vidjeti: «Показывать всплывающие уведомления?» */}
      <label className="ac-set-checkrow" style={{ margin: '4px 0 14px' }}>
        <input type="checkbox" className="ac-check" checked={popups} onChange={(e) => setPopups(e.target.checked)} />
        {t("Kiruvchi qo'ng'iroqda qalqib chiquvchi oyna ko'rsatilsin")}
      </label>

      {cfg.webhookUrl && (
        <div className="ac-int-field"><label>{t('Webhook havolasi')}</label>
          <div className="ac-int-copy">
            <input className="ac-input" readOnly value={cfg.webhookUrl} onFocus={(e) => e.target.select()} />
            <button className="ac-btn" onClick={copy}>{t('Nusxa')}</button>
          </div>
          <div className="ac-int-hint">{t("Kiruvchi qo'ng'iroqlar CRM'ga tushishi uchun bu havolani OnlinePBX kabinetidagi webhook sozlamasiga qo'ying.")}</div>
        </div>
      )}

      <div className="ac-int-actions">
        <button className="ac-btn ac-btn--blue" disabled={busy} onClick={save}>{busy ? t('Saqlanmoqda…') : t('Saqlash')}</button>
        <button className="ac-btn" disabled={testing || !cfg.enabled} onClick={test}>{testing ? t('Tekshirilmoqda…') : t('Ulanishni tekshirish')}</button>
        {msg && <span className={`ac-int-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.m}</span>}
      </div>
    </>
  )
}
