// Analitika: umumiy qismlar — filtr holati, "Фильтр ›" paneli, yuqori panel, sarlavhalar.
import React, { useMemo, useRef, useState } from 'react'
import { Ico } from '../AmoIcons'
import { useOutside } from '../TopBar'
import { useT } from '../i18n'
import { dmy } from '../format'
import '../i18n/stats.ru'
import '../stats.css'

export const ASIDE_ITEMS = [
  { to: '/stats/pipeline', label: 'Sotuv tahlili' },
  { to: '/stats/consolidated', label: 'Umumiy hisobot' },
  { to: '/stats/by_activities', label: "Xodimlar bo'yicha hisobot" },
  { to: '/events/list', label: "Voqealar ro'yxati" },
  { to: '/stats/calls', label: "Qo'ng'iroqlar" },
  { to: '/stats/goals', label: 'Maqsadlar' },
]

export const SERIES = ['var(--ac-stats-c1)', 'var(--ac-stats-c2)', 'var(--ac-stats-c3)', 'var(--ac-stats-c4)', 'var(--ac-stats-c5)', 'var(--ac-stats-c6)', 'var(--ac-stats-c7)', 'var(--ac-stats-c8)']

const pad = (n) => String(n).padStart(2, '0')
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function presetRange(preset, custom) {
  const now = new Date()
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (preset === 'today') return { from: iso(d0), to: iso(d0) }
  if (preset === 'yesterday') { const y = new Date(d0); y.setDate(y.getDate() - 1); return { from: iso(y), to: iso(y) } }
  if (preset === 'week') {
    const s = new Date(d0); s.setDate(s.getDate() - ((s.getDay() + 6) % 7))
    const e = new Date(s); e.setDate(e.getDate() + 6)
    return { from: iso(s), to: iso(e) }
  }
  if (preset === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }
  if (preset === 'range') return { from: custom?.from || undefined, to: custom?.to || undefined }
  return {}
}

export function defaultFilter(preset = 'month') { return { preset, from: '', to: '', pipelineId: '', userIds: [] } }

// filter → API params
export function useParams(filter, withPipeline = true) {
  return useMemo(() => {
    const r = presetRange(filter.preset, filter)
    const p = { from: r.from, to: r.to }
    if (withPipeline && filter.pipelineId) p.pipelineId = filter.pipelineId
    return p
  }, [filter, withPipeline])
}

export const byUsers = (rows, filter) => (filter.userIds.length ? rows.filter((r) => filter.userIds.includes(String(r.id))) : rows)

export function Spin() { return <div className="ac-stats-spin"><div className="ac-spinner" /></div> }

const PRESETS = [['all', 'Hammasi'], ['today', 'Bugun'], ['yesterday', 'Kecha'], ['week', 'Bu hafta'], ['month', 'Bu oy'], ['range', 'Oraliq']]

// fields: 'period' | 'pipeline' | 'users'
function FilterPanel({ open, filter, setFilter, fields, pipelines, members }) {
  const t = useT()
  const set = (patch) => setFilter({ ...filter, ...patch })
  const toggleUser = (id) => set({ userIds: filter.userIds.includes(id) ? filter.userIds.filter((x) => x !== id) : [...filter.userIds, id] })
  return (
    <div className={`ac-stats-fpanel ${open ? 'open' : ''}`}>
      {fields.includes('period') && (
        <>
          <div className="ac-stats-fpanel__label">{t('Davr')}</div>
          {PRESETS.map(([k, l]) => (
            <div key={k} className={`ac-stats-fpanel__opt ${filter.preset === k ? 'on' : ''}`} onClick={() => set({ preset: k })}>
              {filter.preset === k ? <Ico name="check" size={12} /> : <span style={{ width: 12 }} />}{t(l)}
            </div>
          ))}
          {filter.preset === 'range' && (
            <div className="ac-stats-fpanel__range">
              <input type="date" className="ac-input" value={filter.from} onChange={(e) => set({ from: e.target.value })} />
              <span>—</span>
              <input type="date" className="ac-input" value={filter.to} onChange={(e) => set({ to: e.target.value })} />
            </div>
          )}
        </>
      )}
      {(fields.includes('pipeline') || fields.includes('pipeline1')) && (
        <>
          <div className="ac-stats-fpanel__label">{t('Voronka')}</div>
          <select className="ac-select" value={filter.pipelineId || (fields.includes('pipeline1') ? 'main' : '')} onChange={(e) => set({ pipelineId: e.target.value })}>
            {fields.includes('pipeline') && <option value="">{t('Barcha voronkalar')}</option>}
            <option value="main">{t('Asosiy voronka')}</option>
            {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </>
      )}
      {fields.includes('users') && (
        <>
          <div className="ac-stats-fpanel__label">{t('Menejerlar')}</div>
          {members.map((m) => (
            <label key={m.id} className="ac-stats-fpanel__opt">
              <input type="checkbox" className="ac-check" checked={filter.userIds.includes(String(m.id))} onChange={() => toggleUser(String(m.id))} />
              {m.name}
            </label>
          ))}
        </>
      )}
      <div className="ac-stats-fpanel__foot">
        <button className="ac-btn ac-btn--sm" onClick={() => setFilter({ ...defaultFilter(filter.preset === 'range' ? 'month' : filter.preset) })}>{t('Tozalash')}</button>
      </div>
    </div>
  )
}

export function periodLabel(filter) {
  const r = presetRange(filter.preset, filter)
  return r.from && r.to ? `${dmy(r.from)} — ${dmy(r.to)}` : ''
}

// Yuqori panel: "Фильтр ›" + sarlavha (+ o'ngda tugmalar)
export function StatsHead({ title, plain, filter, setFilter, fields, pipelines = [], members = [], right, children }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useOutside(ref, () => setOpen(false), open)
  return (
    <div className="ac-top ac-stats-head" ref={ref}>
      {fields.length > 0 && (
        <button className={`ac-stats-fbtn ${open ? 'open' : ''}`} onClick={() => setOpen((v) => !v)}>
          <Ico name="filter" size={14} />{t('Filtr')}<Ico name="chevronRight" size={10} className="ico-chev" />
        </button>
      )}
      {title && <span className={`ac-stats-head__title ${plain ? 'plain' : ''}`}>{children || t(title)}</span>}
      {right && <div className="ac-stats-head__right">{right}</div>}
      {fields.length > 0 && <FilterPanel open={open} filter={filter} setFilter={setFilter} fields={fields} pipelines={pipelines} members={members} />}
    </div>
  )
}

export function Seg({ value, onChange, options }) {
  const t = useT()
  return (
    <div className="ac-stats-seg">
      {options.map(([k, l]) => <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{t(l)}</button>)}
    </div>
  )
}

export function Tabs({ value, onChange, options, center }) {
  const t = useT()
  return (
    <div className={`ac-stats-tabs ${center ? 'center' : ''}`}>
      {options.map(([k, l]) => <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{t(l)}</button>)}
    </div>
  )
}

export const num = (v) => (Number(v) || 0).toLocaleString('en-US').replace(/,/g, ' ')
export function hms(sec) {
  sec = Math.round(Number(sec) || 0)
  return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`
}
