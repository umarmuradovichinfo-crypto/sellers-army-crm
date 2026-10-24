// Ikkinchi darajali chap panel (Analitika, Sozlamalar): sarlavha + bo'limlar ro'yxati, 238px.
// collapsible: amoCRM kabi ☰ bilan yig'iladi (holat localStorage'da); yig'ilganda ☰ bosilsa kontent ustida ochiladi.
import React, { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Ico } from './AmoIcons'
import { useOutside } from './TopBar'
import { useT } from './i18n'

export default function SectionAside({ title, items, collapsible }) {
  const t = useT()
  const key = collapsible ? `amo_aside_${collapsible}` : null
  const [collapsed, setCollapsed] = useState(() => { try { return !!key && localStorage.getItem(key) === '1' } catch { return false } })
  const [peek, setPeek] = useState(false)
  // amoCRM (.aside-toggleable): ekran ≤1279px bo'lsa panel har doim yig'iladi va ☰ bilan ustidan ochiladi
  const narrowQ = '(max-width: 1279px)'
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(narrowQ).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(narrowQ)
    if (!mq) return
    const h = () => setNarrow(mq.matches)
    mq.addEventListener?.('change', h)
    return () => mq.removeEventListener?.('change', h)
  }, [])
  const isCollapsed = collapsed || (!!collapsible && narrow)
  const ref = useRef(null)
  useOutside(ref, () => setPeek(false), peek)
  const toggle = () => {
    const v = !collapsed
    setCollapsed(v); setPeek(false)
    try { localStorage.setItem(key, v ? '1' : '0') } catch { /* */ }
  }
  return (
    <>
      <aside ref={ref} className={`ac-aside ac-aside--fixed ${isCollapsed ? 'ac-aside--collapsed' : ''} ${peek ? 'peek' : ''}`}>
        <div className="ac-aside__head">
          {t(title)}
          {collapsible && !narrow && <button className="ac-aside__pin" title={t(collapsed ? 'Mahkamlash' : "Yig'ish")} onClick={toggle}><Ico name="burger" size={16} /></button>}
        </div>
        <div className="ac-aside__list">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} onClick={() => setPeek(false)} className={({ isActive }) => `ac-aside__item ${isActive ? 'selected' : ''}`}>
              {t(it.label)}
              {it.note && <span className="ac-aside__item-note">{it.note}</span>}
            </NavLink>
          ))}
        </div>
      </aside>
      {isCollapsed && !peek && <button className="ac-aside-burger" onClick={() => setPeek(true)}><Ico name="burger" size={20} /></button>}
    </>
  )
}
