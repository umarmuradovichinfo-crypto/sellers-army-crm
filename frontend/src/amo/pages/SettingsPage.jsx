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
      <SectionAside title="Sozlamalar" items={ITEMS} collapsible="settings" />
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

// Chap menyu bo'limlari (Sozlamalar yashirilmaydi)
const NAV_ITEMS = [['dashboard', 'Ish stoli'], ['leads', 'Bitimlar'], ['imbox', 'imBox'], ['todo', 'Vazifalar'], ['lists', "Ro'yxatlar"], ['stats', 'Analitika'], ['market', 'Market']]

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

  const [base, setBase] = useState({ ...DEFAULTS })
  useEffect(() => { if (data?.general) { const g = { ...DEFAULTS, ...data.general }; setForm(g); setBase(g) } }, [data])
  // amoCRM: "Сохранить" o'zgarish bo'lgandagina faol (ko'k)
  const dirty = JSON.stringify(form) !== JSON.stringify(base) || uiLang !== lang
  const access = useApi(() => (canManage ? settingsService.getAccess() : Promise.resolve({ roles: [] })), [], 'settings:access')
  const [navRole, setNavRole] = useState('*')
  const navHidden = form.navHidden || {}
  const toggleNav = (key) => setForm((f) => {
    const cur = new Set((f.navHidden || {})[navRole] || [])
    cur.has(key) ? cur.delete(key) : cur.add(key)
    return { ...f, navHidden: { ...(f.navHidden || {}), [navRole]: [...cur] } }
  })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      if (canManage) await settingsService.saveGeneral(form)
      if (uiLang !== lang) setLang(uiLang)
      setBase(form)
      window.dispatchEvent(new CustomEvent('amo:nav-hidden', { detail: form.navHidden || {} }))
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
        <button className={`ac-set-save ${dirty ? 'on' : ''}`} disabled={busy || !dirty} onClick={save}>{t('card§Saqlash')}</button>
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
        {canManage && (
          <div className="ac-set-block">
            <h2 className="ac-set-block__title">{t('Chap menyuni foydalanuvchi roliga qarab sozlash')}</h2>
            <div className="ac-set-navroles">
              {[{ key: '*', name: t('Barcha foydalanuvchilar') }, ...((access.data?.roles || []))].map((r) => (
                <button key={r.key} className={navRole === r.key ? 'on' : ''} onClick={() => setNavRole(r.key)}>{r.name}</button>
              ))}
            </div>
            <div className="ac-set-navlist">
              {NAV_ITEMS.map(([k, l]) => {
                const hidden = (navHidden[navRole] || []).includes(k) || (navRole !== '*' && (navHidden['*'] || []).includes(k))
                return (
                  <label key={k} className={`ac-set-navitem ${hidden ? 'off' : ''}`}>
                    <span>{t(l)}</span>
                    <span className={`ac-switch ${hidden ? '' : 'on'}`} onClick={(e) => { e.preventDefault(); toggleNav(k) }} />
                  </label>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ── Chatlar va messenjerlar: ulanish holati ──
function ChatsSection() {
  const t = useT()
  const { can } = useAuth()
  const canManage = can('settings.roles.manage')
  const { data, loading } = useApi(() => crmService.chatStatus(), [], 'settings:chat-status', 60000)
  const cs = useApi(() => crmService.chatSettings(), [], 'settings:chat-settings')
  const [form, setForm] = useState(null)
  const [base, setBase] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [edit, setEdit] = useState(null) // shablon tahrirlash: { id?, name, text, active }
  useEffect(() => { if (cs.data) { setForm(cs.data); setBase(cs.data) } }, [cs.data])
  const on = !!data?.telegram
  const dirty = form && base && JSON.stringify(form) !== JSON.stringify(base)
  const save = async () => {
    setBusy(true); setMsg(null)
    try { const r = await crmService.saveChatSettings(form); setForm(r); setBase(r); setMsg({ ok: true, m: t('Saqlandi') }); setTimeout(() => setMsg(null), 2500) }
    catch (e) { setMsg({ ok: false, m: e.message || t('Xatolik') }) } finally { setBusy(false) }
  }
  const putTpl = () => {
    if (!edit?.name?.trim() || !edit?.text?.trim()) return
    setForm((f) => {
      const list = [...(f.templates || [])]
      const i = list.findIndex((x) => x.id === edit.id)
      const item = { id: edit.id || `t${Date.now()}`, name: edit.name.trim(), text: edit.text, active: edit.active !== false }
      if (i >= 0) list[i] = item; else list.push(item)
      return { ...f, templates: list }
    })
    setEdit(null)
  }
  const RULES = [
    ['always', "Har doim yangi bitimda suhbat yaratish"],
    ['no_active', "Mijozda faol bitim bo'lmasa, yangi bitimda suhbat yaratish"],
    ['no_leads', "Mijozda faol ham, yopilgan ham bitim bo'lmasagina yangi bitimda suhbat yaratish"],
  ]
  return (
    <>
      <Head>
        {msg && <span className={msg.ok ? 'ac-set-saved' : 'ac-set-err'} style={msg.ok ? undefined : { margin: '0 14px 0 0' }}>{msg.m}</span>}
        {canManage && <button className={`ac-set-save ${dirty ? 'on' : ''}`} disabled={busy || !dirty} onClick={save}>{t('card§Saqlash')}</button>}
      </Head>
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

        <div className="ac-set-block">
          <h2 className="ac-set-block__title">{t('Javob shablonlari')}</h2>
          <div className="ac-set-block__desc">{t("Javob shablonlarini oldindan yaratib, mijozlar bilan yozishmada ishlatishingiz mumkin. Qo'shilgach, shablonlar chatlarda tanlash uchun mavjud bo'ladi")}</div>
          <table className="ac-table ac-set-tpl">
            <thead><tr><th>{t('Nomi')}</th><th>{t('Holat')}</th><th>{t('Shablon turi')}</th><th>{t('Javob matni')}</th><th /></tr></thead>
            <tbody>
              {(form?.templates || []).map((x) => (
                <tr key={x.id}>
                  <td><a onClick={() => canManage && setEdit({ ...x })}>{x.name}</a></td>
                  <td><span className={`ac-switch ${x.active !== false ? 'on' : ''}`} onClick={() => canManage && setForm((f) => ({ ...f, templates: f.templates.map((y) => (y.id === x.id ? { ...y, active: y.active === false } : y)) }))} /></td>
                  <td>{t('Matn')}</td>
                  <td className="ac-set-tpl__text" title={x.text}>{x.text}</td>
                  <td>{canManage && <button className="ac-top__dots" title={t("O'chirish")} onClick={() => setForm((f) => ({ ...f, templates: f.templates.filter((y) => y.id !== x.id) }))}><Ico name="trash" size={13} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {canManage && !edit && <a className="ac-set-addlink" onClick={() => setEdit({ name: '', text: '', active: true })}>+ {t("Yangi shablon qo'shish")}</a>}
          {edit && (
            <div className="ac-set-tplform">
              <input className="ac-input" placeholder={t('Nomi')} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              <textarea className="ac-input" rows={3} placeholder={t('Javob matni')} value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="ac-btn ac-btn--blue" disabled={!edit.name.trim() || !edit.text.trim()} onClick={putTpl}>{t('Tayyor')}</button>
                <button className="ac-btn ac-btn--plain" onClick={() => setEdit(null)}>{t('Bekor qilish')}</button>
              </div>
            </div>
          )}
        </div>

        <div className="ac-set-block">
          <h2 className="ac-set-block__title">{t('Suhbatlar')}</h2>
          <div className="ac-set-block__desc">{t("Mijoz chatga yozganda tizim ochiq suhbatni topib, xabarni unga qo'shadi. Yangi suhbat yaratish qoidasini sozlang:")}</div>
          {RULES.map(([k, l]) => (
            <label key={k} className="ac-set-radio">
              <input type="radio" name="conv-rule" checked={form?.conversationRule === k} disabled={!canManage} onChange={() => setForm((f) => ({ ...f, conversationRule: k }))} />
              <span>{t(l)}</span>
            </label>
          ))}
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
