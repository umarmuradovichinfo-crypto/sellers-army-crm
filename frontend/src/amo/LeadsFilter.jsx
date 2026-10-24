// amoCRM filtr paneli (.filter-search): chapda tayyor presetlar, o'rtada bitim xususiyatlari, o'ngda teglar.
import React, { useEffect, useState } from 'react'
import { Ico } from './AmoIcons'
import { useT } from './i18n'

export const EMPTY_FILTER = { preset: 'open', name: '', period: '', assigneeId: '', budgetFrom: '', budgetTo: '', task: '', tags: [] }

export const PRESETS = [
  { key: 'open', label: 'Ochiq bitimlar' },
  { key: 'mine', label: 'Faqat mening bitimlarim' },
  { key: 'won', label: 'Muvaffaqiyatli yakunlangan' },
  { key: 'lost', label: 'Amalga oshmagan bitimlar' },
  { key: 'notask', label: 'Vazifasiz bitimlar', dot: '#e4b248' },
  { key: 'overdue', label: "Vazifasi muddati o'tgan bitimlar", dot: '#f37575' },
]

const DAY = 86400000
function inPeriod(iso, period) {
  if (!period || !iso) return true
  const t = new Date(iso).getTime()
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (period === 'today') return t >= start
  if (period === 'yesterday') return t >= start - DAY && t < start
  if (period === 'week') return t >= start - 6 * DAY
  if (period === 'month') return t >= start - 29 * DAY
  return true
}

// Mijoz tomonida filtrlash (voronka va ro'yxat uchun bir xil)
export function applyLeadFilter(leads, f, user) {
  const q = (f.search || '').trim().toLowerCase()
  return (leads || []).filter((l) => {
    if (q && !`${l.n} ${l.contactName || ''} ${l.phone || ''} ${l.email || ''} ${l.company || ''} ${(l.tags || []).join(' ')}`.toLowerCase().includes(q)) return false
    if (f.preset === 'mine' && user && l.assigneeId !== user.id) return false
    if (f.preset === 'won' && !l.won) return false
    if (f.preset === 'lost' && !l.lost) return false
    if (f.preset === 'notask' && l.taskStatus && l.taskStatus.kind !== 'none') return false
    if (f.preset === 'overdue' && l.taskStatus?.kind !== 'overdue') return false
    if (f.name && !l.n.toLowerCase().includes(f.name.toLowerCase())) return false
    if (!inPeriod(l.createdAt, f.period)) return false
    if (f.assigneeId && l.assigneeId !== f.assigneeId) return false
    if (f.budgetFrom && (l.value || 0) < Number(f.budgetFrom)) return false
    if (f.budgetTo && (l.value || 0) > Number(f.budgetTo)) return false
    if (f.task && (l.taskStatus?.kind || 'none') !== f.task) return false
    if (f.tags?.length && !f.tags.every((t) => (l.tags || []).includes(t))) return false
    return true
  })
}

export default function LeadsFilter({ value, tags = [], members = [], onApply }) {
  const [f, setF] = useState(value)
  const [tagQ, setTagQ] = useState('')
  const t = useT()
  useEffect(() => setF(value), [value])
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const toggleTag = (name) => set('tags', f.tags.includes(name) ? f.tags.filter((t) => t !== name) : [...f.tags, name])

  return (
    <>
      <div className="ac-filter__presets">
        {PRESETS.map((p) => (
          <div key={p.key} className={`ac-filter__preset ${f.preset === p.key ? 'on' : ''}`} onClick={() => onApply({ ...EMPTY_FILTER, preset: p.key })}>
            {p.dot && <span className="dot" style={{ background: p.dot }} />}
            {t(p.label)}
            {f.preset === p.key && <span className="edit"><Ico name="edit" size={13} /></span>}
          </div>
        ))}
      </div>
      <div className="ac-filter__col ac-filter__col--fields">
        <div className="ac-filter__label">{t('Bitim xususiyatlari')}</div>
        <input className="ac-input" placeholder={t('Bitim nomi')} value={f.name} onChange={(e) => set('name', e.target.value)} />
        <select className="ac-select" value={f.period} onChange={(e) => set('period', e.target.value)}>
          <option value="">{t('Butun vaqt uchun')}</option>
          <option value="today">{t('Bugun')}</option>
          <option value="yesterday">{t('Kecha')}</option>
          <option value="week">{t('Oxirgi 7 kun')}</option>
          <option value="month">{t('Oxirgi 30 kun')}</option>
        </select>
        <select className="ac-select" value={f.assigneeId} onChange={(e) => set('assigneeId', e.target.value)}>
          <option value="">{t('Menejerlar')}</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select className="ac-select" value={f.task} onChange={(e) => set('task', e.target.value)}>
          <option value="">{t('Vazifalar: barcha qiymatlar')}</option>
          <option value="none">{t('Vazifasiz')}</option>
          <option value="today">{t('Bugungi')}</option>
          <option value="overdue">{t("Muddati o'tgan")}</option>
          <option value="future">{t('Kelajakdagi')}</option>
        </select>
        <div className="ac-filter__range">
          <input className="ac-input" placeholder={t('Byudjet')} value={f.budgetFrom} onChange={(e) => set('budgetFrom', e.target.value.replace(/\D/g, ''))} />
          <span>-</span>
          <input className="ac-input" value={f.budgetTo} onChange={(e) => set('budgetTo', e.target.value.replace(/\D/g, ''))} />
        </div>
        <div className="ac-filter__foot">
          <button className="ac-btn ac-btn--blue ac-btn--sm" onClick={() => onApply({ ...f, preset: '' })}>{t("Qo'llash")}</button>
          <button className="ac-btn ac-btn--sm ac-btn--plain" onClick={() => onApply(EMPTY_FILTER)}>{t('Tozalash')}</button>
        </div>
      </div>
      <div className="ac-filter__col">
        <div className="ac-filter__label">{t('Teglar')} <a href="/settings/tags" onClick={(e) => e.stopPropagation()}>{t('Boshqarish')}</a></div>
        <input className="ac-input" style={{ width: 235 }} placeholder={t('Teg topish')} value={tagQ} onChange={(e) => setTagQ(e.target.value)} />
        <div className="ac-filter__tags">
          {tags.filter((t) => !tagQ || t.name.toLowerCase().includes(tagQ.toLowerCase())).map((t) => (
            <span key={t.id || t.name} className="ac-filter__tagrow">
              <span className={`ac-tag ${f.tags.includes(t.name) ? 'on' : ''}`} style={t.color ? { borderColor: t.color } : undefined} onClick={() => toggleTag(t.name)}>{t.name}</span>
              {t.count != null && t.count}
            </span>
          ))}
        </div>
      </div>
    </>
  )
}
