// Kartochkadagi telefon raqami (amoCRM kabi): bosilganda menyu — qo'ng'iroq (OnlinePBX / softphone / brauzer WebRTC),
// raqamni nusxalash, Telegram'da ochish. Qo'ng'iroq usuli Sozlamalar → Telefoniya'dagi «callMode» ga qarab tanlanadi.
import React, { useEffect, useRef, useState } from 'react'
import { crmService, dialSoftphone } from '../services/crm.service'
import { phone as webrtcPhone } from '../lib/webrtcPhone'
import { Ico } from './AmoIcons'
import { useT } from './i18n'
import { phoneFmt } from './format'

export async function callNumber(number, leadId, t) {
  const to = String(number || '').replace(/[^\d+]/g, '')
  if (!to) return
  if (webrtcPhone.isOn()) {
    webrtcPhone.call(to.replace(/^\+/, ''))
    crmService.softLogCall({ leadId, to }).catch(() => {})
    return
  }
  const mode = await crmService.loadPbxMode()
  if (mode.callMode === 'softphone') {
    dialSoftphone(mode.dialScheme, to)
    crmService.softLogCall({ leadId, to }).catch(() => {})
    window.dispatchEvent(new CustomEvent('pbx:outgoing', { detail: { phone: to, name: null } }))
    return
  }
  try {
    await crmService.dial(to)
  } catch (e) {
    // operatorning ichki raqami yo'q — bir marta so'rab saqlaymiz va qayta uramiz
    if (e?.data?.error !== 'NO_EXTENSION') throw e
    const ext = window.prompt(t('Ichki raqamingiz (extension):'))
    if (!ext || !ext.trim()) return
    await crmService.setMyExtension(ext.trim())
    await crmService.dial(to)
  }
  window.dispatchEvent(new CustomEvent('pbx:outgoing', { detail: { phone: to, name: null } }))
}

export default function PhoneLink({ value, leadId }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  const digits = String(value || '').replace(/[^\d+]/g, '')
  const call = async () => {
    setOpen(false); setBusy(true)
    try { await callNumber(digits, leadId, t) } catch (e) { window.alert(e?.message || t("Qo'ng'iroq boshlanmadi")) } finally { setBusy(false) }
  }
  return (
    <span ref={ref} className="ac-phone">
      <a className="ac-field__link" href={`tel:${digits}`} onClick={(e) => { e.preventDefault(); setOpen((v) => !v) }}>
        {phoneFmt(value)}{busy ? '…' : ''}
      </a>
      {open && (
        <div className="ac-menu ac-phone__menu">
          <button className="ac-menu__item" onClick={call}><Ico name="phone" size={14} />{t("Qo'ng'iroq qilish")}</button>
          <button className="ac-menu__item" onClick={() => { navigator.clipboard?.writeText(digits); setOpen(false) }}><Ico name="list" size={14} />{t('Nusxalash')}</button>
          <a className="ac-menu__item" href={`tg://resolve?phone=${digits.replace(/^\+/, '')}`} onClick={() => setOpen(false)}><Ico name="telegram" size={14} />{t("Telegram'da ochish")}</a>
        </div>
      )}
    </span>
  )
}
