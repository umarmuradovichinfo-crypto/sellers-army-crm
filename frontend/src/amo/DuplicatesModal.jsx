// amoCRM "Поиск дублей" → "Найти и объединить дубли · 1 из N": guruhlar birma-bir ko'rsatiladi,
// har maydon uchun qaysi bitim qiymati qolishi tanlanadi (radio), o'ngda natija; "Не дубль" / "Объединить".
import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../lib/apiClient'
import { crmService } from '../services/crm.service'
import { useApi } from '../lib/useApi'
import { money } from './format'
import { useT } from './i18n'
import { tagStyle, useTagColors } from './tagColors'
import './i18n/leadsfilter.ru.js'
import './leads.css'

const BY = ['phone', 'email', 'name']
const ROWS = [
  { key: 'name', label: 'dup§Nomi', show: (l) => l.name },
  { key: 'assignee', label: "dup§Mas'ul", show: (l) => l.assigneeName || '—' },
  { key: 'created', label: 'Yaratilgan sana', show: (l) => l.createdAt.slice(0, 19).replace('T', ' ') },
  { key: 'value', label: 'Byudjet', show: (l) => money(l.value || 0) },
  { key: 'stage', label: 'dup§Bosqich', show: (l) => <StageChip l={l} /> },
]
const empty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)
const fmtCustom = (v) => (Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v))

// amoCRM: «Статус» — voronka nomi + rangli bosqich chipi
function StageChip({ l }) {
  const t = useT()
  return (
    <span className="ac-dupm__stage">
      <span className="ac-dupm__pipe">{l.pipelineName || t('Asosiy voronka')}</span>
      <span className="ac-dupm__st" style={l.stageColor ? { background: l.stageColor } : undefined}>{l.stageName}</span>
    </span>
  )
}

export default function DuplicatesModal({ onClose, onMerged }) {
  const t = useT()
  const colors = useTagColors()
  const [groups, setGroups] = useState(null)
  const { data: fieldsRes } = useApi(() => crmService.listFields('lead').catch(() => null), [], 'fields:lead')
  const fields = useMemo(() => (fieldsRes?.fields || []).filter((f) => f.active !== false), [fieldsRes])
  const [pick, setPick] = useState({})
  const [tags, setTags] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = async () => {
    // telefon, email va nom bo'yicha — bir xil a'zoli guruhlar bir marta
    const res = await Promise.all(BY.map((by) => crmService.leadDuplicates(by).catch(() => ({ groups: [] }))))
    const seen = new Set()
    const out = []
    for (const r of res) for (const g of r.groups || []) {
      const sig = g.leads.map((l) => l.id).sort().join(',')
      if (!seen.has(sig)) { seen.add(sig); out.push(g) }
    }
    setGroups(out)
  }
  useEffect(() => {
    load()
    const h = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const g = groups?.[0] // birlashtirilgan/«dublikat emas» guruh ro'yxatdan chiqadi — navbatdagisi doim birinchi
  const leads = g?.leads || []
  const cfRows = useMemo(() => fields.filter((f) => leads.some((l) => !empty(l.custom?.[f.key]))), [fields, leads])
  const allTags = useMemo(() => [...new Set(leads.flatMap((l) => l.tags || []))], [leads])
  const allKeys = [...ROWS.map((r) => r.key), ...cfRows.map((f) => `cf:${f.key}`)]
  const firstWith = (k) => (k.startsWith('cf:') ? (leads.find((l) => !empty(l.custom?.[k.slice(3)])) || leads[0])?.id : leads[0]?.id)
  const reset = () => { setPick(Object.fromEntries(allKeys.map((k) => [k, firstWith(k)]))); setTags(allTags); setErr('') }
  useEffect(() => { if (leads.length) reset() }, [g]) // eslint-disable-line react-hooks/exhaustive-deps

  const byId = (id) => leads.find((l) => l.id === id)
  const selectAll = (id) => setPick(Object.fromEntries(allKeys.map((k) => [k, id])))
  const next = async () => { setBusy(false); await load(); onMerged?.() }
  const merge = async () => {
    const keepId = pick.created || leads[0].id
    const custom = Object.fromEntries(cfRows.map((f) => [f.key, pick[`cf:${f.key}`]]))
    setBusy(true); setErr('')
    try {
      await crmService.mergeLeads(keepId, leads.filter((l) => l.id !== keepId).map((l) => l.id), { name: pick.name, assignee: pick.assignee, value: pick.value, stage: pick.stage, tags, custom })
      await next()
    } catch (e) { setBusy(false); setErr(e?.data?.message || e?.message || t('Xatolik yuz berdi')) }
  }
  const notDup = async () => {
    setBusy(true)
    try { await api.post('/crm/leads-duplicates/ignore', { ids: leads.map((l) => l.id) }); await next() } catch (e) { setBusy(false); setErr(e?.message || t('Xatolik yuz berdi')) }
  }

  const cell = (k, l, content) => (
    <label className="ac-dupm__cell">
      <input type="radio" className="ac-radio" checked={pick[k] === l.id} onChange={() => setPick((p) => ({ ...p, [k]: l.id }))} />
      <span>{content}</span>
    </label>
  )
  const resultRow = (label, v) => (empty(v) ? null : <div className="ac-dupm__res-row"><div className="ac-dupm__res-cap">{t(label)}</div><div>{v}</div></div>)

  return createPortal(
    <div className="ac-modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ac-modal ac-dupm">
        <div className="ac-dupm__head">
          <h2 className="ac-modal__title">{t('Dublikatlarni topish va birlashtirish')}{groups?.length ? ` · 1 ${t('dup§dan')} ${groups.length}` : ''}</h2>
          <span className="grow" />
          <button className="ac-dupm__cancel" onClick={onClose}>{t('Bekor qilish')}</button>
          {g && <button className="ac-btn ac-dupm__btn" disabled={busy} onClick={notDup}>{t('Dublikat emas')}</button>}
          {g && <button className="ac-btn ac-btn--blue ac-dupm__btn" disabled={busy} onClick={merge}>{t('Birlashtirish')}</button>}
        </div>
        {!groups && <div className="ac-spinner" style={{ margin: 40 }} />}
        {groups && !g && <div className="ac-dupm__empty">{t('Dublikatlar topilmadi')}</div>}
        {g && (
          <>
            <p className="ac-dupm__hint">{t("Ehtimoliy dublikatlarni tekshiring va saqlamoqchi bo'lgan ma'lumotlarni tanlang. Birlashtirish natijasini o'ngda ko'rishingiz mumkin.")}</p>
            {err && <div className="ac-import-err" style={{ margin: '0 0 10px' }}>{err}</div>}
            <div className="ac-dupm__body">
              <div className="ac-dupm__cols">
                {leads.map((l) => (
                  <div key={l.id} className="ac-dupm__col">
                    <div className="ac-dupm__links">
                      <a onClick={() => selectAll(l.id)}>{t('Hammasini tanlash')}</a>
                      <a href={`/leads/${l.id}`} target="_blank" rel="noreferrer">{t("Kartochkaga o'tish")}</a>
                    </div>
                    {ROWS.map((r) => <div key={r.key} className="ac-dupm__row">{cell(r.key, l, r.key === 'name' ? <b>{r.show(l)}</b> : r.show(l))}</div>)}
                    <div className="ac-dupm__row ac-dupm__row--tags">
                      {(l.tags || []).map((x) => (
                        <label key={x} className="ac-dupm__tag">
                          <input type="checkbox" className="ac-check" checked={tags.includes(x)} onChange={() => setTags((s) => (s.includes(x) ? s.filter((y) => y !== x) : [...s, x]))} />
                          <span className={`ac-tag ${colors[x] ? 'ac-tag--c' : ''}`} style={tagStyle(colors[x])}>{x}</span>
                        </label>
                      ))}
                    </div>
                    {cfRows.map((f) => <div key={f.key} className="ac-dupm__row">{cell(`cf:${f.key}`, l, empty(l.custom?.[f.key]) ? <span className="ac-muted">{f.label}: —</span> : <><span className="ac-muted">{f.label}: </span>{fmtCustom(l.custom[f.key])}</>)}</div>)}
                  </div>
                ))}
              </div>
              <div className="ac-dupm__res">
                <a className="ac-dupm__links" onClick={reset}>{t('Hammasini bekor qilish')}</a>
                {resultRow('dup§Nomi', <b>{byId(pick.name)?.name}</b>)}
                {resultRow("dup§Mas'ul", byId(pick.assignee)?.assigneeName)}
                {resultRow('Yaratilgan sana', byId(pick.created) && ROWS[2].show(byId(pick.created)))}
                {resultRow('Byudjet', byId(pick.value) && money(byId(pick.value).value || 0))}
                {resultRow('dup§Bosqich', byId(pick.stage) ? <StageChip l={byId(pick.stage)} /> : null)}
                {resultRow('Teglar', tags.length ? <div className="ac-dupm__tags">{tags.map((x) => <span key={x} className={`ac-tag ${colors[x] ? 'ac-tag--c' : ''}`} style={tagStyle(colors[x])}>{x}</span>)}</div> : null)}
                {cfRows.map((f) => <React.Fragment key={f.key}>{resultRow(f.label, (() => { const v = byId(pick[`cf:${f.key}`])?.custom?.[f.key]; return empty(v) ? null : fmtCustom(v) })())}</React.Fragment>)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
