// Kiruvchi qo'ng'iroq oynasi (amoCRM onlinePBX vidjeti kabi): OnlinePBX webhook qo'ng'iroqni yozgach, oyna mijoz nomi
// bilan chiqadi va kartochkaga tez o'tish mumkin. Yangi raqam bo'lsa kontakt/bitim allaqachon yaratilgan bo'ladi.
// Sozlamalar → Telefoniya'dagi «qalqib chiquvchi oyna» o'chirilgan yoki PBX ulanmagan bo'lsa — so'rov yuborilmaydi.
import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { crmService } from '../services/crm.service'
import { Ico } from './AmoIcons'
import { useT } from './i18n'
import { phoneFmt } from './format'
import { playPing } from './sound'

const POLL_MS = 4000

export default function IncomingCall() {
  const t = useT()
  const navigate = useNavigate()
  const [on, setOn] = useState(false)
  const [call, setCall] = useState(null)
  const seen = useRef(new Set())

  useEffect(() => {
    crmService.getMyExtension().then((r) => setOn(!!r?.pbxEnabled && r?.popups !== false)).catch(() => setOn(false))
  }, [])

  useEffect(() => {
    if (!on) return
    let alive = true
    const poll = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const r = await crmService.incomingCall()
        if (!alive) return
        const c = r?.call || null
        // yangi qo'ng'iroq — bir marta ovoz; tugagan (endi qaytmaydigan) qo'ng'iroq oynasi yopiladi
        if (c && !seen.current.has(c.id)) { seen.current.add(c.id); playPing() }
        setCall(c)
      } catch { /* tarmoq — keyingi so'rovda */ }
    }
    poll()
    const iv = setInterval(poll, POLL_MS)
    return () => { alive = false; clearInterval(iv) }
  }, [on])

  if (!call) return null
  const close = () => { crmService.dismissCall(call.id).catch(() => {}); setCall(null) }
  const open = () => { if (call.leadId) navigate(`/leads/detail/${call.leadId}`); close() }
  return (
    <div className="ac-incall" role="alertdialog" aria-label={t("Kiruvchi qo'ng'iroq")}>
      <div className="ac-incall__icon"><Ico name="phone" size={18} /></div>
      <div className="ac-incall__body">
        <div className="ac-incall__title">{t("Kiruvchi qo'ng'iroq")}</div>
        <div className="ac-incall__name">{call.leadName && call.leadName !== call.phone ? call.leadName : t('Yangi mijoz')}</div>
        <div className="ac-incall__phone">{phoneFmt(call.phone)}</div>
        {call.leadId && <button className="ac-btn ac-btn--blue ac-incall__open" onClick={open}>{t("Kartochkaga o'tish")}</button>}
      </div>
      <button className="ac-incall__x" title={t('Yopish')} onClick={close}><Ico name="close" size={12} /></button>
    </div>
  )
}
