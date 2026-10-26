// amoCRM qobig'i: chap menyu (65px), Сделки flyout, akkaunt paneli, bildirishnomalar paneli.
// Bo'limlar amoCRM URL tuzilmasida: /dashboard, /leads/..., /inbox, /tasks/..., /contacts/..., /stats/..., /settings/...
import React, { useEffect, useRef, useState } from 'react'
import DonoWidget from './Dono'
import IncomingCall from './IncomingCall'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { crmService, notifService as notificationsApi } from '../services/crm.service'
import { NavIcon, Ico } from './AmoIcons'
import { applyTheme, getTheme } from './theme'
import { useI18n, useT } from './i18n'
import { setFormatPrefs, setChatPrefs } from './format'
// barcha bo'lim lug'atlarini oldindan yuklaymiz: umumiy iboralar (Saqlash, Bekor, Topilmadi…) lazy chunk tartibiga bog'liq bo'lmasin (RU rejim)
import.meta.glob('./i18n/*.ru.js', { eager: true })
import { settingsService } from '../services/settings.service'
import NetworkBar from './NetworkBar'
import { loadTaskTypes } from './taskTypes'
import { trActivity } from './activityText'
import { playPing } from './sound'

export const NAV = [
  { key: 'dashboard', to: '/dashboard', title: 'Ish stoli', icon: 'dashboard' },
  { key: 'leads', to: '/leads/pipeline', title: 'Bitimlar', icon: 'leads', flyout: true },
  { key: 'imbox', to: '/inbox', title: 'imBox', icon: 'imbox' },
  { key: 'todo', to: '/tasks/line', title: 'Vazifalar', icon: 'tasks' },
  { key: 'bots', to: '/bots', title: 'AI-agentlar va botlar', icon: 'bots' },
  { key: 'lists', to: '/contacts', title: "Ro'yxatlar", icon: 'lists', match: ['/contacts', '/companies', '/products'] },
  { key: 'stats', to: '/stats', title: 'Analitika', icon: 'stats', match: ['/stats', '/events'] },
  { key: 'market', to: '/integrations', title: 'Market', icon: 'market' },
  { key: 'settings', to: '/settings/general', title: 'Sozlamalar', icon: 'settings' },
]

function isActive(item, path) {
  const prefixes = item.match || [item.to.split('/').slice(0, 2).join('/')]
  return prefixes.some((p) => path === p || path.startsWith(p + '/'))
}

function timeLabel(d, tr) {
  if (!d) return ''
  const t = new Date(d)
  const now = new Date()
  const hm = t.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  if (t.toDateString() === now.toDateString()) return hm
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (t.toDateString() === y.toDateString()) return tr('Kecha') + ' ' + hm
  return t.toLocaleDateString('ru-RU') + ' ' + hm
}

const NOTIF_TITLE = { task: 'Vazifa', task_due: 'Vazifa', lead: 'Bitim', mention: 'notif§Eslatma', automation: 'Avtomatlashtirish', info: 'Xabar' }

// amoCRM: sarlavha — voqea turi («Новая заявка», «Просроченная задача»), pastida — bitim/vazifa nomi
const NOTIF_PREFIX = ['Bugungi vazifa', 'Kechikkan vazifa', 'Yangi vazifa', 'Avtomatik vazifa', 'Dublikat', 'Yangi lid biriktirildi',
  'Sizga lid biriktirildi', 'Yangi bitim biriktirildi', 'Mijoz havolani ochdi', 'Formadan yangi lid', "Formadan dublikat so'rov", 'Telegram xabar']
function notifSplit(n, t) {
  const text = String(n.text || '')
  const i = text.indexOf(': ')
  if (i > 0) {
    const head = text.slice(0, i)
    if (NOTIF_PREFIX.includes(head) || /'dan (yangi lid|dublikat so'rov)$/.test(head)) return [t(head), text.slice(i + 2)]
  }
  return [t(NOTIF_TITLE[n.type] || 'Xabar'), trActivity(text, t)]
}

function NotificationsPanel({ open, onClose, onCount }) {
  const [items, setItems] = useState([])
  const [shown, setShown] = useState(false)
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const t = useT()

  // «Браузер» kanali: yangi bildirishnoma brauzer oynasi bo'lib chiqadi (ruxsat berilgan bo'lsa, har biri bir marta)
  const pushBrowser = (list) => {
    if (!list?.length || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    let seen = []
    try { seen = JSON.parse(sessionStorage.getItem('amo_notif_pushed') || '[]') } catch { /* */ }
    for (const n of list) {
      if (seen.includes(n.id)) continue
      seen.push(n.id)
      try {
        const w = new Notification(t(NOTIF_TITLE[n.type] || 'Xabar'), { body: trActivity(n.text || '', t), tag: n.id })
        w.onclick = () => { window.focus(); if (n.link) navigate(n.link); w.close() }
      } catch { /* */ }
    }
    try { sessionStorage.setItem('amo_notif_pushed', JSON.stringify(seen.slice(-200))) } catch { /* */ }
  }
  const load = () => crmService_notifications().then((r) => { setItems(r.items || []); onCount(r.unread || 0); pushBrowser(r.push) }).catch(() => {})
  // interval eng so'nggi load'ni chaqiradi (til almashganda eskirgan `t` bilan bildirishnoma matni chiqmasin)
  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => { loadRef.current(); const iv = setInterval(() => loadRef.current(), 20000); return () => clearInterval(iv) }, []) // eslint-disable-line
  useEffect(() => {
    if (!open) { setShown(false); return }
    load()
    const t = setTimeout(() => setShown(true), 60) // .swing .notification__item -> .show
    return () => clearTimeout(t)
  }, [open]) // eslint-disable-line

  const list = items.filter((n) => !q || (n.text || '').toLowerCase().includes(q.toLowerCase()))
  const openItem = async (n) => {
    if (!n.read) { try { await notificationsApi.read(n.id) } catch { /* */ } load() }
    if (n.link) { onClose(); navigate(n.link) }
  }
  return (
    <>
      {open && <div className="ac-overlay" onClick={onClose} />}
      <div className={`ac-notif ${open ? 'open' : ''}`}>
        <div className="ac-notif__search">
          <Ico name="search" />
          <input placeholder={t('Topish')} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="ac-top__dots" title={t("Hammasini o'qilgan qilish")} onClick={async () => { try { await notificationsApi.readAll() } catch { /* */ } load() }}>
            <Ico name="dots" />
          </button>
        </div>
        <div className="ac-notif__list">
          {list.length === 0 && <div className="ac-notif__empty">{t("Bildirishnomalar yo'q")}</div>}
          {list.map((n, i) => (
            <div key={n.id} className={`ac-notif__item ${shown ? 'show' : ''} ${n.read ? '' : 'unread'}`} style={{ transitionDelay: `${Math.min(i, 12) * 40}ms` }} onClick={() => openItem(n)}>
              <div className="ac-notif__avatar"><Ico name={n.type === 'task' || n.type === 'task_due' ? 'check' : n.type === 'call' ? 'phone' : 'user'} size={18} /></div>
              <div className="ac-notif__body">
                <div className="ac-notif__head">
                  <span className="ac-notif__title">{notifSplit(n, t)[0]}</span>
                  <span className="ac-notif__time">{timeLabel(n.at || n.createdAt, t)}</span>
                </div>
                {n.text && <div className="ac-notif__text">{notifSplit(n, t)[1]}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

const crmService_notifications = () => notificationsApi.list()

// amoCRM akkaunt paneli: yuqoridan tushadigan chiziq — ism/email, "профиль", "выйти", til, mavzu (auto / light / dark)
function UserBar({ open, onClose }) {
  const { user, logout } = useAuth()
  const { t, lang, setLang } = useI18n()
  const navigate = useNavigate()
  const [theme, setTheme] = useState(getTheme())
  const pick = (v) => { setTheme(v); applyTheme(v) }
  return (
    <>
      {open && <div className="ac-overlay" onClick={onClose} />}
      <div className={`ac-userbar ${open ? 'open' : ''}`}>
        <div className="ac-userbar__who">
          <div className="ac-userbar__name">{user?.name || t('Foydalanuvchi')}</div>
          <div className="ac-userbar__role">{user?.email || user?.login}
            <button className="ac-userbar__copy" title={t('Nusxalash')} onClick={() => navigator.clipboard?.writeText(user?.email || '')}><Ico name="list" size={12} /></button>
          </div>
        </div>
        <button className="ac-userbar__btn" onClick={() => { navigate('/settings/profile'); onClose() }}><Ico name="edit" size={18} /><span>{t('profil')}</span></button>
        <button className="ac-userbar__btn" onClick={logout}><Ico name="external" size={18} /><span>{t('chiqish')}</span></button>
        <div className="ac-userbar__grow" />
        <div className="ac-userbar__seg">
          <button className={lang === 'uz' ? 'on' : ''} onClick={() => setLang('uz')}><b>UZ</b><span>o'zbek</span></button>
          <button className={lang === 'ru' ? 'on' : ''} onClick={() => setLang('ru')}><b>RU</b><span>русский</span></button>
        </div>
        <div className="ac-userbar__seg">
          {[['auto', 'auto', '◐'], ['light', 'light', '☼'], ['dark', 'dark', '☾']].map(([k, l, ic]) => (
            <button key={k} className={theme === k ? 'on' : ''} onClick={() => pick(k)}><b>{ic}</b><span>{l}</span></button>
          ))}
        </div>
      </div>
    </>
  )
}

function LeadsFlyout({ open, onEnter, onLeave, onPick }) {
  const [pipes, setPipes] = useState([])
  const [archived, setArchived] = useState([])
  const [showArch, setShowArch] = useState(false)
  const loc = useLocation()
  const t = useT()
  useEffect(() => {
    if (!open) { setShowArch(false); return }
    crmService.getPipeline().then((r) => { setPipes(r.pipelines || []); setArchived(r.archivedPipelines || []) }).catch(() => {})
  }, [open]) // eslint-disable-line
  const current = new URLSearchParams(loc.search).get('pipeline') || loc.pathname.split('/')[3] || ''
  const item = (p) => (
    <NavLink key={p.id || 'main'} to={`/leads/pipeline/${p.id || ''}`} className={`ac-aside__item ${String(current) === String(p.id || '') && loc.pathname.startsWith('/leads/pipeline') ? 'selected' : ''}`} onClick={onPick}>
      {p.name}
    </NavLink>
  )
  // amoCRM: "Архивные воронки ›" — ichki ro'yxat, sarlavhada "‹" bilan qaytish
  if (showArch) {
    return (
      <div className={`ac-aside ac-flyout ${open ? 'open' : ''}`} onMouseEnter={onEnter} onMouseLeave={onLeave}>
        <div className="ac-aside__head ac-flyout__back" onClick={() => setShowArch(false)}><Ico name="chevronLeft" size={14} />{t('Arxivdagi voronkalar')}</div>
        <div className="ac-aside__list">{archived.map(item)}</div>
      </div>
    )
  }
  return (
    <div className={`ac-aside ac-flyout ${open ? 'open' : ''}`} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="ac-aside__head">{t('Bitimlar')}</div>
      <div className="ac-aside__list">
        {/* getPipeline().pipelines — faqat qo'shimcha voronkalar; asosiy voronka birinchi */}
        {[{ id: '', name: t('Asosiy voronka') }, ...pipes.filter((p) => p.id)].map(item)}
      </div>
      <div className="ac-aside__foot">
        <NavLink to="/leads/list" className="ac-aside__item" onClick={onPick}>{t('Barcha bitimlar')} <span style={{ marginLeft: 'auto' }}><Ico name="list" /></span></NavLink>
        {archived.length > 0 && <a className="ac-aside__item ac-aside__item--muted" onClick={() => setShowArch(true)}>{t('Arxivdagi voronkalar')} <span style={{ marginLeft: 'auto' }}><Ico name="chevronRight" size={12} /></span></a>}
      </div>
    </div>
  )
}

export default function AmoShell({ children }) {
  const loc = useLocation()
  const [notifOpen, setNotifOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [flyout, setFlyout] = useState(false)
  const [unread, setUnread] = useState(0)
  const prevUnread = useRef(null) // birinchi yuklashda ovoz chiqmasin
  const hideTimer = useRef(null)
  const t = useT()

  const [, setPrefsTick] = useState(0)
  // Sozlamalar → "Chap menyuni rolga qarab sozlash": barcha uchun ('*') + joriy rol uchun yashirilgan bo'limlar
  const { user: me } = useAuth()
  const [navHidden, setNavHidden] = useState({})
  // Chatlar sozlamasi: «Bildirishnomalar markazi» tanlansa imBox bosh menyuda ko'rinmaydi (amoCRM)
  const [imboxMenu, setImboxMenu] = useState(true)
  const hiddenNav = new Set([...(navHidden['*'] || []), ...(navHidden[me?.role] || []), ...(imboxMenu ? [] : ['imbox'])])
  useEffect(() => {
    const h = (e) => setNavHidden(e.detail || {})
    const c = (e) => { setImboxMenu(e.detail?.imboxMenu !== false); setChatPrefs(e.detail || {}) }
    window.addEventListener('amo:nav-hidden', h)
    window.addEventListener('amo:chat-settings', c)
    crmService.chatSettings().then((r) => { setImboxMenu(r?.imboxMenu !== false); setChatPrefs(r || {}) }).catch(() => {})
    return () => { window.removeEventListener('amo:nav-hidden', h); window.removeEventListener('amo:chat-settings', c) }
  }, [])
  useEffect(() => { loadTaskTypes() }, [])
  useEffect(() => {
    settingsService.getGeneral?.().then((r) => { setFormatPrefs(r?.general || {}); setNavHidden(r?.general?.navHidden || {}); setPrefsTick((n) => n + 1) }).catch(() => {})
  }, [])
  useEffect(() => {
    document.body.classList.add('ac-body')
    applyTheme(getTheme())
    return () => document.body.classList.remove('ac-body')
  }, [])
  useEffect(() => { setNotifOpen(false); setUserOpen(false); setFlyout(false) }, [loc.pathname])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setNotifOpen(false); setUserOpen(false); setFlyout(false) } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const showFly = () => { clearTimeout(hideTimer.current); setFlyout(true) }
  const hideFly = () => { clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => setFlyout(false), 180) }

  return (
    <div className="ac-page">
      <nav className="ac-nav">
        <div className="ac-nav__top" onClick={() => { setUserOpen((v) => !v); setNotifOpen(false) }}>
          <div className="ac-nav__top-pic"><NavIcon name="account" size={26} /></div>
          <div className="ac-nav__top-title">{t('Akkaunt')}</div>
        </div>
        <div className="ac-nav__menu">
          {NAV.filter((item) => !hiddenNav.has(item.key)).map((item) => {
            const on = isActive(item, loc.pathname)
            return (
              <div
                key={item.key}
                className={`ac-nav__item ${on ? 'selected' : ''}`}
                onMouseEnter={item.flyout ? showFly : undefined}
                onMouseLeave={item.flyout ? hideFly : undefined}
              >
                <NavLink to={item.to} className="ac-nav__link">
                  <span className="ac-nav__icon"><NavIcon name={item.icon} on={on} /></span>
                  <div className="ac-nav__title">{t(item.title)}</div>
                </NavLink>
              </div>
            )
          })}
        </div>
        <div className="ac-nav__bottom">
          <span className="ac-nav__bell" onClick={() => { setNotifOpen((v) => !v); setUserOpen(false) }}>
            <NavIcon name="bell" size={30} />
            {unread > 0 && <span className="ac-nav__badge">{unread > 999 ? '999+' : unread}</span>}
          </span>
        </div>
      </nav>
      <LeadsFlyout open={flyout} onEnter={showFly} onLeave={hideFly} onPick={() => setFlyout(false)} />
      <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} onCount={(n) => setUnread((prev) => { if (prevUnread.current !== null && n > prev) playPing(); prevUnread.current = n; return n })} />
      <UserBar open={userOpen} onClose={() => setUserOpen(false)} />
      <NetworkBar />
      {children}
      <DonoWidget />
      <IncomingCall />
    </div>
  )
}
