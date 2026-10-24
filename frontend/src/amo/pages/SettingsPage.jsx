// amoCRM "Настройки": chap panel (SectionAside) + bo'limlar — umumiy / foydalanuvchilar / chatlar / xavfsizlik.
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import SectionAside from '../SectionAside'
import { Ico } from '../AmoIcons'
import { useI18n, useT } from '../i18n'
import { useApi } from '../../lib/useApi'
import { useAuth } from '../../context/AuthContext'
import { crmService } from '../../services/crm.service'
import { settingsService } from '../../services/settings.service'
import SettingsUsers from './SettingsUsers'
import '../i18n/settings.ru'
import '../settings.css'

const ITEMS = [
  { to: '/settings/general', label: 'Umumiy sozlamalar' },
  { to: '/settings/users', label: 'Foydalanuvchilar' },
  { to: '/settings/chats', label: 'Chatlar va messenjerlar' },
  { to: '/settings/security', label: 'Xavfsizlik' },
]

export default function SettingsPage({ section = 'general' }) {
  return (
    <>
      <SectionAside title="Sozlamalar" items={ITEMS} />
      <div className="ac-content">
        {section === 'users' && <SettingsUsers />}
        {section === 'chats' && <ChatsSection />}
        {section === 'security' && <SecuritySection />}
        {section !== 'users' && section !== 'chats' && section !== 'security' && <GeneralSection />}
      </div>
    </>
  )
}

// Ixtiyoriy sarlavhali yuqori panel (65px): o'ngda amallar
function Head({ children }) {
  return <div className="ac-top" style={{ justifyContent: 'flex-end' }}><div className="ac-top__actions" style={{ border: 0 }}>{children}</div></div>
}

const TIMEZONES = ['-12:00', '+00:00', '+01:00', '+02:00', '+03:00', '+04:00', '+05:00', '+06:00', '+07:00', '+08:00', '+09:00']
const TZ_CITY = { '+03:00': 'Moskva', '+04:00': 'Samara', '+05:00': 'Toshkent', '+06:00': 'Almati', '+07:00': 'Novosibirsk', '+00:00': 'London', '+01:00': 'Berlin', '+02:00': 'Kiyev', '-12:00': 'Baker oroli', '+08:00': 'Pekin', '+09:00': 'Tokio' }
const COUNTRIES = ["O'zbekiston", 'Rossiya', "Qozog'iston", "Qirg'iziston", 'Tojikiston', 'Ukraina', 'Turkiya']
const DATE_FORMATS = ['31.12.2026', '12/31/2026', '2026-12-31']
const TIME_FORMATS = ['24 soat', '12 soat (AM/PM)']
const CURRENCIES = ["O'zbek so'mi", 'Rossiya rubli', 'AQSh dollari', 'Yevro']
const NAME_ORDERS = ['Ism, Familiya', 'Familiya, Ism']
const DEFAULTS = {
  accountName: '', address: '', timezone: '+05:00', country: COUNTRIES[0], dateFormat: DATE_FORMATS[0],
  timeFormat: TIME_FORMATS[0], currency: CURRENCIES[0], nameOrder: NAME_ORDERS[0],
}

function Row({ label, children }) {
  return <div className="ac-set-row"><div className="ac-set-row__label">{label}</div>{children}</div>
}

function GeneralSection() {
  const t = useT()
  const { lang, setLang } = useI18n()
  const { can } = useAuth()
  const canManage = can('settings.roles.manage')
  const [form, setForm] = useState({ ...DEFAULTS })
  const [uiLang, setUiLang] = useState(lang)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const { data } = useApi(() => (can('settings.view') ? settingsService.getGeneral() : Promise.resolve({ general: {} })), [], 'settings:general')

  useEffect(() => { if (data?.general) setForm((f) => ({ ...DEFAULTS, ...f, ...data.general })) }, [data])
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      if (canManage) await settingsService.saveGeneral(form)
      if (uiLang !== lang) setLang(uiLang)
      setMsg({ ok: true, m: t('Saqlandi') })
      setTimeout(() => setMsg(null), 2500)
    } catch (e) { setMsg({ ok: false, m: e.message || t('Xatolik') }) }
    finally { setBusy(false) }
  }
  const sel = (k, opts, render = (o) => o) => (
    <select className="ac-select" value={form[k]} onChange={set(k)} disabled={!canManage}>{opts.map((o) => <option key={o} value={o}>{render(o)}</option>)}</select>
  )

  return (
    <>
      <Head>
        {msg && <span className={msg.ok ? 'ac-set-saved' : 'ac-set-err'} style={msg.ok ? undefined : { margin: '0 14px 0 0' }}>{msg.m}</span>}
        <button className="ac-btn" disabled={busy} onClick={save}>{t('Saqlash')}</button>
      </Head>
      <div className="ac-set-body">
        <div className="ac-set-block">
          <h2 className="ac-set-block__title">{t('Asosiy sozlamalar')}</h2>
          <div className="ac-set-block__desc">{t("Akkaunt nomi va manzilini o'zgartirishingiz mumkin. Faqat harf va raqamlardan foydalaning, maxsus belgilar va bo'sh joylar mumkin emas.")}</div>
          <Row label={t('Akkaunt nomi')}><input className="ac-input" value={form.accountName} onChange={set('accountName')} disabled={!canManage} /></Row>
          <Row label={t('Manzil')}><input className="ac-input" value={form.address} onChange={set('address')} disabled={!canManage} /></Row>
          <Row label={t('Til')}>
            <select className="ac-select" value={uiLang} onChange={(e) => setUiLang(e.target.value)}>
              <option value="uz">{"O'zbekcha"}</option>
              <option value="ru">Русский</option>
            </select>
          </Row>
          <Row label={t('Vaqt mintaqasi')}>{sel('timezone', TIMEZONES, (z) => `(GMT ${z}) ${t(TZ_CITY[z] || z)}`)}</Row>
          <Row label={t('Mamlakat')}>{sel('country', COUNTRIES, t)}</Row>
          <Row label={t('Sana formati')}>{sel('dateFormat', DATE_FORMATS)}</Row>
          <Row label={t('Vaqt formati')}>{sel('timeFormat', TIME_FORMATS, t)}</Row>
          <Row label={t('Valyuta')}>{sel('currency', CURRENCIES, t)}</Row>
          <Row label={t('Kontakt ismlari tartibi')}>{sel('nameOrder', NAME_ORDERS, t)}</Row>
        </div>
      </div>
    </>
  )
}

// ── Chatlar va messenjerlar: ulanish holati ──
function ChatsSection() {
  const t = useT()
  const { data, loading } = useApi(() => crmService.chatStatus(), [], 'settings:chat-status', 60000)
  const on = !!data?.telegram
  return (
    <>
      <Head />
      <div className="ac-set-body">
        <div className="ac-set-block">
          <h2 className="ac-set-block__title">{t('Chatlar va messenjerlar')}</h2>
          <div className="ac-set-block__desc">{t("Mijozlar yozishmalari shu kanallar orqali imBox'ga tushadi. Sozlash uchun Integratsiyalar bo'limini oching.")}</div>
          {loading && !data ? <div className="ac-spinner" /> : (
            <div className="ac-set-chat">
              <div className="ac-set-chat__ico"><Ico name="telegram" size={20} /></div>
              <div style={{ flex: 1 }}>
                <div className="ac-set-chat__name">Telegram</div>
                <span className={`ac-set-status ${on ? 'ok' : ''}`}>{on ? t('Ulangan') : t('Ulanmagan')}</span>
              </div>
              <Link to="/amo-market">{t('Integratsiyalar')}</Link>
            </div>
          )}
          {!on && !loading && <div className="ac-set-note" style={{ marginTop: 6 }}>{t("Telegram sozlanmagan: serverda TELEGRAM_BOT_TOKEN qo'shilgach mijozlar bilan yozishasiz.")}</div>}
        </div>
      </div>
    </>
  )
}

// ── Xavfsizlik: parolni o'zgartirish ──
function SecuritySection() {
  const t = useT()
  const { user } = useAuth()
  const [cur, setCur] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const bad = !cur || pw.length < 6 || pw !== pw2

  const save = async () => {
    if (bad || busy || !user?.id) return
    setBusy(true); setMsg(null)
    try {
      await settingsService.changeOwnPassword(cur, pw)
      setCur(''); setPw(''); setPw2(''); setMsg({ ok: true, m: t('Parol o\'zgartirildi') })
    } catch (e) { setMsg({ ok: false, m: e.message || t('Xatolik') }) }
    finally { setBusy(false) }
  }
  return (
    <>
      <Head>
        {msg && <span className={msg.ok ? 'ac-set-saved' : 'ac-set-err'} style={msg.ok ? undefined : { margin: '0 14px 0 0' }}>{msg.m}</span>}
        <button className="ac-btn" disabled={busy || bad} onClick={save}>{t('Saqlash')}</button>
      </Head>
      <div className="ac-set-body">
        <div className="ac-set-block">
          <h2 className="ac-set-block__title">{t("Parolni o'zgartirish")}</h2>
          <div className="ac-set-block__desc">{t('Yangi parol kamida 6 belgidan iborat bo\'lsin.')}</div>
          <Row label={t('Joriy parol')}><input className="ac-input" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></Row>
          <Row label={t('Yangi parol')}><input className="ac-input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Row>
          <Row label={t('Parolni takrorlang')}><input className="ac-input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Row>
          {pw2 && pw !== pw2 && <div className="ac-set-err">{t('Parollar mos kelmadi')}</div>}
        </div>
      </div>
    </>
  )
}
