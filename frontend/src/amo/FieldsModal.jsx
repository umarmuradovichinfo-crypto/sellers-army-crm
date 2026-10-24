// Maydonlarni tanlash modali: voronka kartasi ko'rinishi va ro'yxat ustunlari uchun (tartibni o'zgartirish mumkin).
import React, { useState } from 'react'
import { Ico } from './AmoIcons'
import { useT } from './i18n'

export default function FieldsModal({ title, options, value, defaults, onSave, onClose }) {
  const t = useT()
  const [sel, setSel] = useState(value)
  const [busy, setBusy] = useState(false)
  const toggle = (k) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))
  const move = (k, d) => setSel((s) => {
    const i = s.indexOf(k), j = i + d
    if (i < 0 || j < 0 || j >= s.length) return s
    const n = [...s]; [n[i], n[j]] = [n[j], n[i]]
    return n
  })
  // tanlanganlar tartibi bilan birinchi, qolganlar ro'yxat tartibida
  const rows = [...sel.map((k) => options.find((o) => o.key === k)).filter(Boolean), ...options.filter((o) => !sel.includes(o.key))]
  const save = async () => { setBusy(true); try { await onSave(sel) } finally { setBusy(false) } }
  return (
    <div className="ac-modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ac-modal">
        <button className="ac-modal__close" onClick={onClose}><Ico name="close" size={14} /></button>
        <h3 className="ac-modal__title">{t(title)}</h3>
        <div className="ac-fieldsmodal__list">
          {rows.map((o) => {
            const on = sel.includes(o.key)
            return (
              <div key={o.key} className="ac-fieldsmodal__row" onClick={() => toggle(o.key)}>
                <input type="checkbox" className="ac-check" readOnly checked={on} />
                <span className="grow">{t(o.label)}</span>
                {on && (
                  <span className="mv" onClick={(e) => e.stopPropagation()}>
                    <button title="↑" onClick={() => move(o.key, -1)}><Ico name="chevronDown" size={10} style={{ transform: 'rotate(180deg)' }} /></button>
                    <button title="↓" onClick={() => move(o.key, 1)}><Ico name="chevronDown" size={10} /></button>
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <div className="ac-modal__foot">
          <button className="ac-btn ac-btn--blue" disabled={busy} onClick={save}>{t('Saqlash')}</button>
          <button className="ac-btn ac-btn--plain" onClick={() => setSel(defaults)}>{t('Standart')}</button>
          <button className="ac-btn ac-btn--plain" onClick={onClose}>{t('Bekor qilish')}</button>
        </div>
      </div>
    </div>
  )
}
