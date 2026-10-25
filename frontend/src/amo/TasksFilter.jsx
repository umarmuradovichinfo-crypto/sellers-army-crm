// amoCRM vazifalar filtri (.filter-search /todo): chapda presetlar, o'ngda ixcham qatorlar.
// Filtr mijoz tomonida qo'llanadi (vazifalar ro'yxati to'liq yuklanadi).
import React, { useEffect, useMemo, useState } from 'react'
import MultiSelect from './MultiSelect'
import { useT } from './i18n'
import { DATE_PRESETS, stageToken } from './filterState'
import { TASK_TYPES } from './pages/TasksModals'

export const TASK_PRESETS = [
  { key: 'mine', label: 'Faqat mening vazifalarim' },
  { key: 'overdue', label: "Muddati o'tgan vazifalar" },
  { key: 'done', label: 'Bajarilgan vazifalar' },
  { key: 'all', label: 'Barcha vazifalar' },
  { key: 'deleted', label: "O'chirilganlar" },
]

// Preset -> boshlang'ich filtr (amoCRM: "Только мои задачи" — mas'ul = men, holat = tugallanmagan)
export function presetFilter(key, me) {
  const base = { preset: key, datePreset: '', from: '', to: '', types: [], stages: [], status: 'open', assignees: [], authors: [] }
  if (key === 'mine') return { ...base, assignees: me ? [me] : [] }
  if (key === 'overdue') return { ...base, status: 'overdue' }
  if (key === 'done') return { ...base, status: 'done' }
  return base
}

function presetRange(key, now = new Date()) {
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const add = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
  const mon = add(d0, -((d0.getDay() + 6) % 7))
  switch (key) {
    case 'today': return [d0, add(d0, 1)]
    case 'yesterday': return [add(d0, -1), d0]
    case 'this_week': return [mon, add(mon, 7)]
    case 'last_week': return [add(mon, -7), mon]
    case 'this_month': return [new Date(d0.getFullYear(), d0.getMonth(), 1), new Date(d0.getFullYear(), d0.getMonth() + 1, 1)]
    case 'last_month': return [new Date(d0.getFullYear(), d0.getMonth() - 1, 1), new Date(d0.getFullYear(), d0.getMonth(), 1)]
    case 'quarter': { const q = Math.floor(d0.getMonth() / 3) * 3; return [new Date(d0.getFullYear(), q, 1), new Date(d0.getFullYear(), q + 3, 1)] }
    case 'this_year': return [new Date(d0.getFullYear(), 0, 1), new Date(d0.getFullYear() + 1, 0, 1)]
    default: return null
  }
}

/** Vazifa filtrga mos keladimi. */
export function matchTask(x, f) {
  const now = Date.now()
  const overdue = !x.done && x.dueDate && new Date(x.dueDate).getTime() < now
  if (f.status === 'open' && x.done) return false
  if (f.status === 'done' && !x.done) return false
  if (f.status === 'overdue' && !overdue) return false
  if (f.types.length && !f.types.includes(x.type)) return false
  if (f.assignees.length && !f.assignees.includes(x.assigneeId || 'none')) return false
  if (f.authors.length && !f.authors.includes(x.createdById || '')) return false
  if (f.stages.length && !f.stages.includes(`${x.pipelineId || 'main'}:${x.stage}`)) return false
  const r = f.datePreset ? presetRange(f.datePreset) : (f.from || f.to) ? [f.from ? new Date(f.from) : null, f.to ? new Date(new Date(f.to).getTime() + 86400000) : null] : null
  if (r) {
    if (!x.dueDate) return false
    const t = new Date(x.dueDate).getTime()
    if (r[0] && t < r[0].getTime()) return false
    if (r[1] && t >= r[1].getTime()) return false
  }
  return true
}

/** Qo'llangan shartlar uchun chiplar. */
export function taskChips(f, meta, t) {
  const chips = []
  // amoCRM: standart «Только мои задачи» filtr maydonida ko'rsatilmaydi (bo'sh "Фильтр")
  const pr = TASK_PRESETS.find((p) => p.key === f.preset && p.key !== 'mine')
  if (pr) chips.push({ id: 'preset', label: t(pr.label) })
  const dp = DATE_PRESETS.find((d) => d.key === f.datePreset && d.key)
  if (dp) chips.push({ id: 'date', label: t(dp.label) })
  if (f.types.length) chips.push({ id: 'types', label: f.types.map((k) => t(TASK_TYPES.find((x) => x.key === k)?.label || k)).join(', ') })
  return chips
}

export default function TasksFilter({ value, meta, onApply }) {
  const t = useT()
  const [f, setF] = useState(value)
  useEffect(() => setF(value), [value])
  const set = (k, v) => setF((p) => ({ ...p, preset: '', [k]: v }))
  const mem = [{ value: 'none', label: t("Mas'ulsiz") }, ...(meta.members || []).map((m) => ({ value: m.id, label: m.name }))]
  const authors = (meta.members || []).map((m) => ({ value: m.id, label: m.name }))
  const stageOpts = useMemo(() => (meta.stages || []).map((s) => ({ value: stageToken(s), label: s.name, color: s.color })), [meta.stages])
  const statusOpts = [
    { value: '', label: t('Barcha holatlar') },
    { value: 'open', label: t('Tugallanmagan') },
    { value: 'done', label: t('Bajarilgan') },
    { value: 'overdue', label: t("Muddati o'tgan") },
  ]
  const me = meta.me
  return (
    <>
      <div className="ac-filter__presets">
        {TASK_PRESETS.map((p) => (
          <div key={p.key} className={`ac-filter__preset ${f.preset === p.key ? 'on' : ''}`} onClick={() => onApply(presetFilter(p.key, me))}>
            <span className="lbl">{t(p.label)}</span>
          </div>
        ))}
      </div>
      <div className="ac-filter__col ac-filter__col--fields">
        <MultiSelect single search={false} chevron label="" emptyText="Butun vaqt uchun"
          options={DATE_PRESETS.map((d) => ({ value: d.key, label: t(d.label) }))} value={f.datePreset} onChange={(v) => setF((p) => ({ ...p, preset: '', datePreset: v, from: '', to: '' }))} />
        <div className="ac-filter__range">
          <input className="ac-input" type="date" value={f.from} onChange={(e) => setF((p) => ({ ...p, preset: '', from: e.target.value, datePreset: '' }))} />
          <span>-</span>
          <input className="ac-input" type="date" value={f.to} onChange={(e) => setF((p) => ({ ...p, preset: '', to: e.target.value, datePreset: '' }))} />
        </div>
        <MultiSelect search={false} options={TASK_TYPES.map((x) => ({ value: x.key, label: t(x.label) }))} value={f.types} onChange={(v) => set('types', v)} label="" emptyText="Barcha turlar" />
        <MultiSelect options={stageOpts} value={f.stages} onChange={(v) => set('stages', v)} label="" emptyText="Voronkalar, bosqichlar" />
        <MultiSelect single search={false} chevron options={statusOpts} value={f.status} onChange={(v) => set('status', v)} label="" emptyText="Barcha holatlar" />
        <MultiSelect options={mem} value={f.assignees} onChange={(v) => set('assignees', v)} label="" emptyText="Mas'ullar" />
        <MultiSelect options={authors} value={f.authors} onChange={(v) => set('authors', v)} label="" emptyText="Mualliflar" />
        <div className="ac-filter__foot">
          <button className="ac-btn ac-btn--blue ac-btn--sm" onClick={() => onApply(f)}>{t("Qo'llash")}</button>
          <button className="ac-btn ac-btn--sm ac-btn--plain" onClick={() => onApply(presetFilter('mine', me))}>{t('Tozalash')}</button>
        </div>
      </div>
    </>
  )
}
