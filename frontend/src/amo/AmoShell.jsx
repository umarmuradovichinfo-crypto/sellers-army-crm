// amoCRM qobig'i: chap menyu (65px), Сделки flyout, akkaunt paneli, bildirishnomalar paneli.
// Bo'limlar amoCRM URL tuzilmasida: /dashboard, /leads/..., /imbox, /todo/..., /contacts/..., /stats/..., /settings/...
import React, { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { crmService, notifService as notificationsApi } from '../services/crm.service'
import { NavIcon, Ico } from './AmoIcons'
import { applyTheme, getTheme } from './theme'
import { useI18n, useT } from './i18n'
import { setFormatPrefs } from './format'
import { settingsService } from '../services/settings.service'
import NetworkBar from './NetworkBar'

export const NAV = [
  { key: 'dashboard', to: '/dashboard', title: 'Ish stoli', icon: 'dashboard' },
  { key: 'leads', to: '/leads/pipeline', title: 'Bitimlar', icon: 'leads', flyout: true },
  { key: 'imbox', to: '/imbox', title: 'imBox', icon: 'imbox' },
  { key: 'todo', to: '/todo/line', title: 'Vazifalar', icon: 'tasks' },
  { key: 'lists', to: '/contacts/list', title: "Ro'yxatlar", icon: 'lists', match: ['/contacts', '/companies'] },
  { key: 'stats', to: '/stats/pipeline', title: 'Analitika', icon: 'stats', match: ['/stats', '/events'] },
  { key: 'market', to: '/amo-market', title: 'Market', icon: 'market' },
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

const NOTIF_TITLE = { task: 'Vazifa', lead: 'Bitim', mention: 'Eslatma', automation: 'Avtomatlashtirish', info: 'Xabar' }

function NotificationsPanel({ open, onClose, onCount }) {
  const [items, setItems] = useState([])
  const [shown, setShown] = useState(false)
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const t = useT()

  const load = () => crmService_notifications().then((r) => { setItems(r.items || []); onCount(r.unread || 0) }).catch(() => {})
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t) }, []) // eslint-disable-line
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
              <div className="ac-notif__avatar"><Ico name={n.type === 'task' ? 'check' : n.type === 'call' ? 'phone' : 'user'} size={18} /></div>
              <div className="ac-notif__body">
                <div className="ac-notif__head">
                  <span className="ac-notif__title">{t(NOTIF_TITLE[n.type] || 'Xabar')}</span>
                  <span className="ac-notif__time">{timeLabel(n.at || n.createdAt, t)}</span>
                </div>
                {n.text && <div className="ac-notif__text">{n.text}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

const crmService_notifications = () => notificationsApi.list()

function UserBar({ open, onClose }) {
  const { user, logout } = useAuth()
  const { t, lang, setLang } = useI18n()
  const [theme, setTheme] = useState(getTheme())
  const pick = (t) => { setTheme(t); applyTheme(t) }
  return (
    <>
      {open && <div className="ac-overlay" onClick={onClose} />}
      <div className={`ac-userbar ${open ? 'open' : ''}`}>
        <div className="ac-userbar__head">
          <div className="ac-userbar__pic"><NavIcon name="account" size={34} /></div>
          <div>
            <div className="ac-userbar__name">{user?.name || t('Foydalanuvchi')}</div>
            <div className="ac-userbar__role">{user?.email || user?.login}</div>
          </div>
        </div>
        <div className="ac-themes">
          <button className={theme === 'dark' ? 'on' : ''} style={{ background: '#0f2231', color: '#f2f2f2' }} onClick={() => pick('dark')}>{t("Qorong'i")}</button>
          <button className={theme === 'light' ? 'on' : ''} style={{ background: '#f5f5f5', color: '#363b44' }} onClick={() => pick('light')}>{t("Yorug'")}</button>
        </div>
        <div className="ac-themes">
          <button className={lang === 'uz' ? 'on' : ''} onClick={() => setLang('uz')}>O'zbekcha</button>
          <button className={lang === 'ru' ? 'on' : ''} onClick={() => setLang('ru')}>Русский</button>
        </div>
        <button className="ac-userbar__item" onClick={logout}><Ico name="external" /> {t('Chiqish')}</button>
      </div>
    </>
  )
}

function LeadsFlyout({ open, onEnter, onLeave, onPick }) {
  const [pipes, setPipes] = useState([])
  const loc = useLocation()
  const t = useT()
  useEffect(() => {
    if (!open || pipes.length) return
    crmService.getPipeline().then((r) => setPipes(r.pipelines || [])).catch(() => {})
  }, [open]) // eslint-disable-line
  const current = new URLSearchParams(loc.search).get('pipeline') || loc.pathname.split('/')[3] || ''
  return (
    <div className={`ac-aside ac-flyout ${open ? 'open' : ''}`} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="ac-aside__head">{t('Bitimlar')}</div>
      <div className="ac-aside__list">
        {(pipes.length ? pipes : [{ id: '', name: t('Asosiy voronka') }]).map((p) => (
          <NavLink key={p.id || 'main'} to={`/leads/pipeline/${p.id || ''}`} className={`ac-aside__item ${String(current) === String(p.id || '') && loc.pathname.startsWith('/leads/pipeline') ? 'selected' : ''}`} onClick={onPick}>
            {p.name}
          </NavLink>
        ))}
      </div>
      <div className="ac-aside__foot">
        <NavLink to="/leads/list" className="ac-aside__item" onClick={onPick}>{t('Barcha bitimlar')} <span style={{ marginLeft: 'auto' }}><Ico name="list" /></span></NavLink>
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
  const hideTimer = useRef(null)
  const t = useT()

  const [, setPrefsTick] = useState(0)
  useEffect(() => {
    settingsService.getGeneral?.().then((r) => { setFormatPrefs(r?.general || {}); setPrefsTick((n) => n + 1) }).catch(() => {})
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
          {NAV.map((item) => {
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
      <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} onCount={setUnread} />
      <UserBar open={userOpen} onClose={() => setUserOpen(false)} />
      <NetworkBar />
      {children}
    </div>
  )
}
