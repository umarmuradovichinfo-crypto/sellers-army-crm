// Analitika: umumiy qismlar — filtr holati, "Фильтр ›" paneli, yuqori panel, sarlavhalar.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Ico } from '../AmoIcons'
import { useOutside } from '../TopBar'
import { useT } from '../i18n'
import { dmy } from '../format'
import MultiSelect from '../MultiSelect'
import { CustomField } from '../LeadsFilter'
import { EMPTY_FILTER, UTM_KEYS, toParams, useFilterMeta } from '../filterState'
import '../i18n/stats.ru'
import '../stats.css'

export const ASIDE_ITEMS = [
  { to: '/stats/pipeline', label: 'Sotuv tahlili' },
  { to: '/stats/consolidated', label: 'Umumiy hisobot' },
  { to: '/stats/activities', label: "Xodimlar bo'yicha hisobot" },
  { to: '/events', label: "Voqealar ro'yxati" },
  { to: '/stats/calls', label: "Qo'ng'iroqlar" },
  { to: '/calls', label: "Qo'ng'iroqlar jurnali" },
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

export function defaultFilter(preset = 'month') { return { preset, from: '', to: '', pipelineId: '', userIds: [], cf: {}, utm: {} } }

// filter → API params
export function useParams(filter, withPipeline = true) {
  return useMemo(() => {
    const r = presetRange(filter.preset, filter)
    const p = { from: r.from, to: r.to }
    if (withPipeline && filter.pipelineId) p.pipelineId = filter.pipelineId
    // qo'shimcha maydonlar va UTM — bitimlar filtri bilan bir xil format (backend leadConds)
    const { cf, utm } = toParams({ ...EMPTY_FILTER, cf: filter.cf || {}, utm: filter.utm || {} })
    if (cf) p.cf = cf
    if (utm) p.utm = utm
    return p
  }, [filter, withPipeline])
}

export const byUsers = (rows, filter) => (filter.userIds.length ? rows.filter((r) => filter.userIds.includes(String(r.id))) : rows)

export function Spin() { return <div className="ac-stats-spin"><div className="ac-spinner" /></div> }

const PRESETS = [['all', 'Hammasi'], ['today', 'Bugun'], ['yesterday', 'Kecha'], ['week', 'Bu hafta'], ['month', 'Bu oy'], ['range', 'Oraliq']]

// fields: 'period' | 'pipeline' | 'users' | 'cf' (qo'shimcha maydonlar + UTM)
// amoCRM (.analytics-sidebar): chapdan chiquvchi panel, "ФИЛЬТР | Применить", ixcham qatorlar; o'zgarishlar "Qo'llash" bilan
function FilterPanel({ open, filter, setFilter, fields, pipelines, members, onClose }) {
  const t = useT()
  const meta = useFilterMeta()
  const [d, setD] = useState(filter)
  useEffect(() => { if (open) setD(filter) }, [open, filter])
  const set = (patch) => setD((p) => ({ ...p, ...patch }))
  const apply = () => { setFilter(d); onClose() }
  const one = fields.includes('pipeline1')
  const pipeOpts = [...(one ? [] : [{ value: '', label: t('Barcha voronkalar') }]), { value: 'main', label: t('Asosiy voronka') }, ...pipelines.map((p) => ({ value: p.id, label: p.name }))]
  const cfList = fields.includes('cf') ? meta.fields : []
  return (
    <div className={`ac-stats-fpanel ${open ? 'open' : ''}`}>
      <div className="ac-stats-fpanel__head">
        <span>{t('Filtr')}</span>
        <button className="ac-btn ac-btn--blue ac-btn--sm" onClick={apply}>{t("Qo'llash")}</button>
      </div>
      {fields.includes('period') && (
        <>
          <MultiSelect single search={false} chevron label="" options={PRESETS.map(([k, l]) => ({ value: k, label: t(l) }))} value={d.preset} onChange={(v) => set({ preset: v || 'all' })} />
          {d.preset === 'range' && (
            <div className="ac-stats-fpanel__range">
              <input type="date" className="ac-input" value={d.from} onChange={(e) => set({ from: e.target.value })} />
              <span>—</span>
              <input type="date" className="ac-input" value={d.to} onChange={(e) => set({ to: e.target.value })} />
            </div>
          )}
        </>
      )}
      {(fields.includes('pipeline') || one) && (
        <MultiSelect single search={false} chevron label="" options={pipeOpts} value={d.pipelineId || (one ? 'main' : '')} onChange={(v) => set({ pipelineId: v })} />
      )}
      {fields.includes('users') && (
        <MultiSelect label="" emptyText="Menejerlar" options={members.map((m) => ({ value: String(m.id), label: m.name }))} value={d.userIds} onChange={(v) => set({ userIds: v })} />
      )}
      {cfList.map((fd) => (
        <div key={fd.key} className="ac-stats-fpanel__cf">
          <div className="ac-stats-fpanel__cap">{fd.label}</div>
          <CustomField field={fd} value={d.cf?.[fd.key]} onChange={(v) => set({ cf: { ...d.cf, [fd.key]: v } })} />
        </div>
      ))}
      {fields.includes('cf') && (
        <>
          <div className="ac-stats-fpanel__cap ac-stats-fpanel__cap--group">{t('Statistika')}</div>
          {UTM_KEYS.map((k) => (
            <input key={k} className="ac-input" placeholder={k} value={d.utm?.[k] || ''}
              onChange={(e) => { const u = { ...d.utm, [k]: e.target.value }; if (!e.target.value) delete u[k]; set({ utm: u }) }} />
          ))}
        </>
      )}
      <div className="ac-stats-fpanel__foot">
        <button className="ac-btn ac-btn--sm ac-btn--plain" onClick={() => { setFilter(defaultFilter(filter.preset === 'range' ? 'month' : filter.preset)); onClose() }}>{t('Tozalash')}</button>
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
      {fields.length > 0 && <FilterPanel open={open} filter={filter} setFilter={setFilter} fields={fields} pipelines={pipelines} members={members} onClose={() => setOpen(false)} />}
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
