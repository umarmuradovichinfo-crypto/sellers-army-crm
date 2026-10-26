// «Telefoniya» qobig'i: OnlinePBX paneli ko'rinishi (yuqori menyu, ranglar, tipografiya) — CRM chap menyusidagi «Telefoniya» bo'limi ichida.
import React, { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useT } from '../i18n'
import { useAuth } from '../../context/AuthContext'
import { useApi } from '../../lib/useApi'
import { billingService } from '../../services/billing.service'
import '../i18n/pbx.ru'
import '../pbx.css'
import '../calls.css'
import './pbxTheme.css'

export const PBX_MENU = [
  { key: 'home', to: '/pbx/home', label: 'pbx§Bosh sahifa' },
  { key: 'ats', label: 'pbx§ATS sozlamalari', match: '/pbx/ats', children: [
    ['/pbx/ats/incoming', 'pbx§Kiruvchi'], ['/pbx/ats/outgoing', 'pbx§Chiquvchi'], ['/pbx/ats/diagnostic', 'pbx§Diagnostika'],
    ['/pbx/ats/configurator', 'pbx§Konfigurator'], ['/pbx/ats/blacklist', "pbx§Qora ro'yxat"], ['/pbx/ats/music', 'pbx§Musiqa'],
  ] },
  { key: 'calls', to: '/pbx/calls', label: "pbx§Qo'ng'iroqlar" },
  { key: 'chats', to: '/pbx/chats', label: 'pbx§Chatlar' },
  { key: 'analytics', label: 'pbx§Analitika', match: ['/pbx/statistic', '/pbx/reports'], children: [['/pbx/statistic', 'pbx§Statistika'], ['/pbx/reports', 'pbx§Hisobotlar']] },
  { key: 'services', label: 'pbx§Servislar', match: ['/pbx/services', '/pbx/integration'], children: [
    ['/pbx/services/ai', 'pbx§AI-menejer'], ['/pbx/services/record', "pbx§Suhbatlarni yozib olish"], ['/pbx/services/quality', 'pbx§Sifat bahosi'], ['/pbx/services/autorecall', "pbx§Avto-qayta qo'ng'iroq"],
    ['/pbx/services/informer', 'pbx§Avtoinformator'], ['/pbx/services/callback', 'pbx§Callback vidjeti'], ['/pbx/integration', 'pbx§Integratsiya'], ['/pbx/services/tts', 'pbx§Ovoz sintezi va audio fayllar'],
  ] },
]

function Dropdown({ item }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const { pathname } = useLocation()
  const active = [].concat(item.match || []).some((m) => pathname.startsWith(m))
  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    if (!open) return undefined
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div className="pbxx__nav" ref={ref} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className={`pbxx__link ${active ? 'on' : ''}`} onClick={() => setOpen((o) => !o)}>{t(item.label)}<svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg></button>
      {open && (
        <div className="pbxx__modal">
          {item.children.map(([to, l]) => <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'on' : '')}>{t(l)}</NavLink>)}
        </div>
      )}
    </div>
  )
}

export default function PbxShell({ children, tone = 'white' }) {
  const t = useT()
  const { user } = useAuth()
  const { data: bill } = useApi(() => billingService.status().catch(() => null), [], 'billing:status', 600000)
  const initial = (user?.name || 'U').trim()[0]?.toUpperCase() || 'U'
  const status = bill?.status
  const statusText = !status || status === 'active' ? t('pbx§Faol') : status === 'trial' ? t('pbx§Sinov') : status === 'grace' ? t('pbx§Muddat tugayapti') : t('pbx§Tugagan')
  return (
    <div className="pbxx">
      <header className="pbxx__header">
        <Link to="/pbx/home" className="pbxx__logo" aria-label="Telefoniya"><span>pbx</span></Link>
        <nav className="pbxx__menu">
          {PBX_MENU.map((m) => (m.children
            ? <Dropdown key={m.key} item={m} />
            : <NavLink key={m.key} to={m.to} className={({ isActive }) => `pbxx__link ${isActive ? 'on' : ''}`}>{t(m.label)}</NavLink>))}
        </nav>
        <div className="pbxx__right">
          <Link to="/pbx/license" className={`pbxx__status ${status && status !== 'active' && status !== 'trial' ? 'bad' : ''}`}><b>{statusText}</b><small>{t('pbx§Batafsil')}</small></Link>
          <span className="pbxx__avatar" title={user?.name || ''}>{initial}</span>
        </div>
      </header>
      <main className={`pbxx__content pbxx__content--${tone}`}>{children}</main>
    </div>
  )
}

// «ATS sozlamalari» sahifalari uchun chap ro'yxat (OnlinePBX: Исходящие, Диагностика, Конфигуратор, Чёрный список, Музыка)
export function AtsLayout({ children }) {
  const t = useT()
  const links = [['/pbx/ats/outgoing', 'pbx§Chiquvchi'], ['/pbx/ats/diagnostic', 'pbx§Diagnostika'], ['/pbx/ats/configurator', 'pbx§Konfigurator'], ['/pbx/ats/blacklist', "pbx§Qora ro'yxat"], ['/pbx/ats/music', 'pbx§Musiqa']]
  return (
    <div className="pbxx__ats">
      <aside className="pbxx__aside">
        {links.map(([to, l]) => <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'on' : '')}>{t(l)}</NavLink>)}
      </aside>
      <div className="pbxx__atsmain">{children}</div>
    </div>
  )
}
