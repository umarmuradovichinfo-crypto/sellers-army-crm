// amoCRM yuqori panel (.list__body-right__top): sarlavha/preset, qidiruv+filtr, hisoblagich, "…" menyu, tugmalar.
import React, { useEffect, useRef, useState } from 'react'
import { Ico } from './AmoIcons'
import { useT } from './i18n'

export function useOutside(ref, onOut, active = true) {
  useEffect(() => {
    if (!active) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onOut() }
    const k = (e) => { if (e.key === 'Escape') onOut() }
    document.addEventListener('mousedown', h)
    document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [active]) // eslint-disable-line
}

// "…" tugmasi bilan ochiladigan menyu
export function DotsMenu({ items, align = 'right', className = 'ac-top__dots', icon = 'dots' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useOutside(ref, () => setOpen(false), open)
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button className={className} onClick={() => setOpen((v) => !v)}><Ico name={icon} /></button>
      {open && (
        <div className="ac-menu" style={{ top: '100%', [align]: 0, marginTop: 4 }}>
          {items.filter(Boolean).map((it, i) => (
            <button key={i} className="ac-menu__item" onClick={() => { setOpen(false); it.onClick?.() }}>
              {it.icon && <Ico name={it.icon} className={it.danger ? 'ico-danger' : ''} />}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}

export default function TopBar({ title, switcher, search, onSearch, searchPlaceholder = 'Qidiruv va filtr', filterPanel, count, menu, actions, children }) {
  const [filterOpen, setFilterOpen] = useState(false)
  const ref = useRef(null)
  const t = useT()
  useOutside(ref, () => setFilterOpen(false), filterOpen)
  return (
    <div className="ac-top">
      {title && (
        <div className="ac-top__preset">
          <span className="ac-top__title">{title}</span>
          {switcher}
        </div>
      )}
      <div className="ac-top__search" ref={ref}>
        <Ico name="search" />
        <input
          placeholder={t(searchPlaceholder)}
          value={search ?? ''}
          onChange={(e) => onSearch?.(e.target.value)}
          onFocus={() => filterPanel && setFilterOpen(true)}
        />
        {search ? <button className="ac-top__dots" style={{ width: 24, height: 24 }} onClick={() => onSearch?.('')}><Ico name="close" size={12} /></button> : null}
        {filterPanel && (
          <div className={`ac-filter ${filterOpen ? 'open' : ''}`}>
            {typeof filterPanel === 'function' ? filterPanel(() => setFilterOpen(false)) : filterPanel}
          </div>
        )}
      </div>
      {children}
      {count != null && <div className="ac-top__count">{count}</div>}
      {(menu || actions) && (
        <div className="ac-top__actions">
          {menu && <DotsMenu items={menu} />}
          {actions}
        </div>
      )}
    </div>
  )
}
