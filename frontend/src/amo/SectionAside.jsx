// Ikkinchi darajali chap panel (Analitika, Sozlamalar): sarlavha + bo'limlar ro'yxati, 238px.
import React from 'react'
import { NavLink } from 'react-router-dom'
import { useT } from './i18n'

export default function SectionAside({ title, items }) {
  const t = useT()
  return (
    <aside className="ac-aside ac-aside--fixed">
      <div className="ac-aside__head">{t(title)}</div>
      <div className="ac-aside__list">
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} className={({ isActive }) => `ac-aside__item ${isActive ? 'selected' : ''}`}>
            {t(it.label)}
            {it.note && <span className="ac-aside__item-note">{it.note}</span>}
          </NavLink>
        ))}
      </div>
    </aside>
  )
}
