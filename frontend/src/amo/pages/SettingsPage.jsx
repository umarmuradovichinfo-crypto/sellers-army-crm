// amoCRM "Настройки": chap panel (SectionAside) + bo'limlar — umumiy / foydalanuvchilar / chatlar / xavfsizlik.
import React, { useEffect, useState } from 'react'
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
import { setFormatPrefs } from '../format'

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
  timeFormat: TIME_FORMATS[0], currency: CURRENCIES[0], nameOrder: NAME_ORDERS[0], products: true,
}

// Chap menyu bo'limlari (Sozlamalar yashirilmaydi)
const NAV_ITEMS = [['dashboard', 'Ish stoli'], ['leads', 'Bitimlar'], ['imbox', 'imBox'], ['todo', 'Vazifalar'], ['bots', 'AI-agentlar va botlar'], ['lists', "Ro'yxatlar"], ['stats', 'Analitika'], ['market', 'Market']]

function Row({ label, children }) {
  return <div className="ac-set-row"><div className="ac-set-row__label">{label}</div>{children}</div>
}

function GeneralSection() {
  const t = useT()
  const { can } = useAuth()
  const canManage = can('settings.roles.manage')
  const [form, setForm] = useState({ ...DEFAULTS })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const { data } = useApi(() => (can('settings.view') ? settingsService.getGeneral() : Promise.resolve({ general: {} })), [], 'settings:general')

  const [base, setBase] = useState({ ...DEFAULTS })
  useEffect(() => { if (data?.general) { const g = { ...DEFAULTS, ...data.general }; setForm(g); setBase(g) } }, [data])
  // amoCRM: "Сохранить" o'zgarish bo'lgandagina faol (ko'k)
  const dirty = JSON.stringify(form) !== JSON.stringify(base)
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
      setBase(form)
      setFormatPrefs(form)
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
          <Row label={t('Vaqt mintaqasi')}>{sel('timezone', TIMEZONES, (z) => `(GMT ${z}) ${t(TZ_CITY[z] || z)}`)}</Row>
          <Row label={t('Mamlakat')}>{sel('country', COUNTRIES, t)}</Row>
          <Row label={t('Sana formati')}>{sel('dateFormat', DATE_FORMATS)}</Row>
          <Row label={t('Vaqt formati')}>{sel('timeFormat', TIME_FORMATS, t)}</Row>
          <Row label={t('Valyuta')}>{sel('currency', CURRENCIES, t)}</Row>
          <Row label={t('Kontakt ismlari tartibi')}>{sel('nameOrder', NAME_ORDERS, t)}</Row>
        </div>
        <div className="ac-set-block">
          <label className="ac-set-toggle">
            <span className={`ac-switch ${form.products !== false ? 'on' : ''}`} onClick={(e) => { e.preventDefault(); if (canManage) setForm((f) => ({ ...f, products: f.products === false })) }} />
            <h2 className="ac-set-block__title" style={{ margin: 0 }}>{t('Mahsulotlar')}</h2>
          </label>
          <div className="ac-set-block__desc">{t("Mahsulotlar katalogini yoqing: bitim kartochkasiga mahsulot qo'shish, summani avtomatik hisoblash va «Ro'yxatlar» bo'limidagi katalog. O'chirilsa, katalog va kartochkadagi «Mahsulotlar» bloki yashiriladi (ma'lumotlar saqlanib qoladi).")}</div>
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
  const cs = useApi(() => crmService.chatSettings(), [], 'settings:chat-settings')
  const [form, setForm] = useState(null)
  const [base, setBase] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [edit, setEdit] = useState(null) // shablon tahrirlash: { id?, name, text, active }
  useEffect(() => { if (cs.data) { setForm(cs.data); setBase(cs.data) } }, [cs.data])
  const dirty = form && base && JSON.stringify(form) !== JSON.stringify(base)
  const save = async () => {
    setBusy(true); setMsg(null)
    try { const r = await crmService.saveChatSettings(form); setForm(r); setBase(r); window.dispatchEvent(new CustomEvent('amo:chat-settings', { detail: r })); setMsg({ ok: true, m: t('Saqlandi') }); setTimeout(() => setMsg(null), 2500) }
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
          {[[true, "imBox menyusi + bildirishnomalar markazi", "Bu tanlov yoqilganda bosh menyuda turli manbalardagi mijoz chatlarini birlashtiruvchi «imBox» bo'limi paydo bo'ladi. Qolgan bildirishnomalar, jumladan xodimlar orasidagi ichki xabarlar, «Bildirishnomalar markazi»ga keladi"],
            [false, 'Bildirishnomalar markazi', "Bu tanlov yoqilganda bildirishnomalar, jumladan xodimlar orasidagi ichki xabarlar va mijozlar chatlari «Bildirishnomalar markazi»ga keladi."]].map(([v, title, desc]) => (
            <div key={String(v)} className="ac-set-notifmode">
              <label className="ac-set-toggle">
                <span className={`ac-switch ${(form?.imboxMenu !== false) === v ? 'on' : ''}`} onClick={(e) => { e.preventDefault(); if (canManage) setForm((f) => ({ ...f, imboxMenu: v })) }} />
                <h2 className="ac-set-block__title" style={{ margin: 0 }}>{t(title)}</h2>
              </label>
              <div className="ac-set-block__desc">{t(desc)}</div>
            </div>
          ))}
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
          <label className="ac-set-radio" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={!!form?.replyLimitMin} disabled={!canManage} onChange={(e) => setForm((f) => ({ ...f, replyLimitMin: e.target.checked ? 15 : 0 }))} />
            <span>{t("Xabarga javob berish vaqti oshib ketsa, voqeani belgilash")}</span>
          </label>
          {!!form?.replyLimitMin && (
            <div className="ac-set-row" style={{ paddingLeft: 24 }}>
              <div className="ac-set-row__label">{t('Javob vaqti')}</div>
              <select className="ac-select" value={form.replyLimitMin} disabled={!canManage} onChange={(e) => setForm((f) => ({ ...f, replyLimitMin: Number(e.target.value) }))}>
                {[1, 5, 15, 30, 60, 120, 240, 1440].map((m) => <option key={m} value={m}>{m < 60 ? `${m} ${t('daqiqa')}` : `${m / 60} ${t('soat')}`}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Xavfsizlik → "IP manzillar oq ro'yxati" (amoCRM "Белый список IP-адресов") ──
// amoCRM: IP ro'yxati sahifaning yuqorisidagi «Сохранить» bilan saqlanadi — hook blok va saqlash holatini qaytaradi
function useIpWhitelist(enabled) {
  const t = useT()
  const { data, reload } = useApi(() => (enabled ? settingsService.getSecurity() : Promise.resolve(null)), [enabled], 'settings:security')
  const [list, setList] = useState(null)
  const [ip, setIp] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (data) setList(data.ips || []) }, [data])
  const dirty = list && data && JSON.stringify(list) !== JSON.stringify(data.ips || [])
  const add = () => { const v = ip.trim(); if (v && !list.includes(v)) setList([...list, v]); setIp('') }
  const save = async () => {
    setBusy(true); setMsg(null)
    try { await settingsService.saveSecurity(list); await reload(); setMsg({ ok: true, m: t('Saqlandi') }) }
    catch (e) { setMsg({ ok: false, m: e.message || t('Xatolik') }) } finally { setBusy(false) }
  }
  const block = (
    <div className="ac-set-block">
      <h2 className="ac-set-block__title">{t("IP manzillar oq ro'yxati")}</h2>
      <div className="ac-set-block__desc">{t("Bu ro'yxat akkauntga faqat ko'rsatilgan IP manzillardan kirishga ruxsat beradi, boshqa kompyuterlardan kirish taqiqlanadi.")}</div>
      <div className="ac-set-block__desc">{t("To'liq bloklanib qolmaslik uchun ro'yxatda joriy IP manzilingiz bo'lishi shart")}: <b>{data?.currentIp || '…'}</b></div>
      <div className="ac-set-iplist">
        {(list || []).map((x) => (
          <span key={x} className="ac-set-ip">{x}<button onClick={() => setList(list.filter((y) => y !== x))}><Ico name="close" size={10} /></button></span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, maxWidth: 420, marginTop: 8 }}>
        <input className="ac-input" style={{ flex: 1 }} placeholder="213.230.78.60" value={ip} onChange={(e) => setIp(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="ac-btn" onClick={add} disabled={!ip.trim()}>{t("set§Qo'shish")}</button>
        {data?.currentIp && !(list || []).includes(data.currentIp) && <button className="ac-btn ac-btn--plain" onClick={() => setList([...(list || []), data.currentIp])}>{t('Joriy IP')}</button>}
      </div>
    </div>
  )
  return { block, dirty, busy, save, msg }
}

// amoCRM «Безопасность»: «Белый список IP-адресов» + «Резервное копирование» (parol — profilda)
function SecuritySection() {
  const t = useT()
  const { can } = useAuth()
  const canIp = can('settings.roles.manage')
  const ipw = useIpWhitelist(canIp)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const backup = async () => {
    setBusy(true); setMsg(null)
    try {
      const blob = await settingsService.backup()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `crm-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    } catch (e) { setMsg(e.message || t('Xatolik')) } finally { setBusy(false) }
  }
  return (
    <>
      <Head>
        {ipw.msg && <span className={ipw.msg.ok ? 'ac-set-saved' : 'ac-set-err'} style={ipw.msg.ok ? undefined : { margin: '0 14px 0 0' }}>{ipw.msg.m}</span>}
        <button className={`ac-set-save ${ipw.dirty ? 'on' : ''}`} disabled={ipw.busy || !ipw.dirty} onClick={ipw.save}>{t('card§Saqlash')}</button>
      </Head>
      <div className="ac-set-body">
        {canIp && ipw.block}
        {canIp && (
          <div className="ac-set-block">
            <h2 className="ac-set-block__title">{t('Zaxira nusxa')}</h2>
            <div className="ac-set-block__desc">{t("Zaxira nusxa yordamida istalgan vaqtda akkauntdagi barcha ma'lumotlarni (bitimlar, kontaktlar, kompaniyalar, vazifalar, qo'ng'iroqlar, xabarlar, voqealar, sozlamalar) bitta fayl qilib yuklab olishingiz mumkin. Parollar va integratsiya kalitlari faylga kirmaydi.")}</div>
            <button className="ac-btn ac-btn--blue" disabled={busy} onClick={backup}>{busy ? t('Tayyorlanmoqda…') : t('Zaxira nusxa yaratish')}</button>
            {msg && <div className="ac-set-err">{msg}</div>}
          </div>
        )}
      </div>
    </>
  )
}
