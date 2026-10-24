// amoCRM uslubidagi ko'p tanlovli ro'yxat (checkbox + qidiruv); ro'yxat tugma ostida joyida ochiladi (panel scroll'ida kesilmaydi).
// options: [{ value, label, group?, color?, note? }]; value: tanlangan qiymatlar massivi (single bo'lsa — bitta qiymat).
import React, { useMemo, useRef, useState } from 'react'
import { Ico } from './AmoIcons'
import { useOutside } from './TopBar'
import { useT } from './i18n'

// label berilsa — amoCRM filtr uslubi: "Label: Все значения" / "Label: tanlangan", chapda kvadrat belgi, o'q yo'q
export default function MultiSelect({ options, value, onChange, placeholder, search = true, single = false, quick = null, groups = null, label = null, emptyText = 'Barcha qiymatlar', chevron = false }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)
  useOutside(ref, () => setOpen(false), open)
  const sel = single ? new Set(value === '' || value == null ? [] : [value]) : new Set(value || [])
  const list = useMemo(() => options.filter((o) => !q || String(o.label).toLowerCase().includes(q.toLowerCase())), [options, q])
  const toggle = (v) => {
    if (single) { onChange(v); setOpen(false); return }
    const n = new Set(sel)
    n.has(v) ? n.delete(v) : n.add(v)
    onChange([...n])
  }
  const labelOf = (v) => options.find((o) => o.value === v)?.label ?? v
  const shown = [...sel]
  const text = !shown.length ? '' : shown.length <= 2 ? shown.map(labelOf).join(', ') : `${t('Tanlandi')}: ${shown.length}`
  // guruhlar (masalan voronka bo'yicha): ketma-ket bir xil group qiymatlari sarlavha bilan
  let lastGroup = null
  return (
    <div className={`ac-ms ${open ? 'open' : ''}`} ref={ref}>
      <button type="button" className={`ac-ms__btn ${label != null ? 'ac-ms__btn--amo' : ''}`} onClick={() => setOpen((v) => !v)}>
        {label != null && !single && <span className={`ac-ms__box ${shown.length ? (shown.length === options.length ? 'all' : 'some') : ''}`} />}
        {label != null
          ? <span className={`ac-ms__txt ${text ? '' : 'ph'}`}>{label ? `${label}: ` : ''}{text || t(emptyText)}</span>
          : <span className={text ? '' : 'ph'}>{text || placeholder}</span>}
        {!single && shown.length > 0 && <span className="ac-ms__x" title={t('Bekor')} onClick={(e) => { e.stopPropagation(); onChange([]) }}><Ico name="close" size={9} /></span>}
        {(label == null || chevron) && <Ico name="chevronDown" size={10} />}
      </button>
      {open && (
        <div className="ac-ms__pop">
          {search && options.length > 7 && <input className="ac-input" autoFocus placeholder={t('Qidiruv')} value={q} onChange={(e) => setQ(e.target.value)} />}
          {!single && (quick || options.length > 1) && (
            <div className="ac-ms__quick">
              {quick?.map((a) => <a key={a.label} onClick={() => onChange(a.pick(options))}>{t(a.label)}</a>)}
              <a onClick={() => onChange(options.map((o) => o.value))}>{t('Hammasini tanlash')}</a>
              <a onClick={() => onChange([])}>{t('Bekor')}</a>
            </div>
          )}
          <div className="ac-ms__list">
            {list.length === 0 && <div className="ac-ms__empty">{t('Topilmadi')}</div>}
            {list.map((o) => {
              const head = groups && o.group !== lastGroup ? o.group : null
              lastGroup = o.group
              return (
                <React.Fragment key={String(o.value)}>
                  {head != null && <div className="ac-ms__group">{head}</div>}
                  <label className={`ac-ms__item ${sel.has(o.value) ? 'on' : ''}`} onClick={(e) => { e.preventDefault(); toggle(o.value) }}>
                    {single ? <span className={`ac-ms__radio ${sel.has(o.value) ? 'on' : ''}`} /> : <input type="checkbox" className="ac-check" readOnly checked={sel.has(o.value)} />}
                    {o.color && <span className="ac-dot" style={{ background: o.color }} />}
                    <span className="lbl">{o.label}</span>
                    {o.note != null && <span className="note">{o.note}</span>}
                  </label>
                </React.Fragment>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
