// amoCRM "Настроить" — maydonlar sozlash (/settings/fields/leads|contacts|companies).
// Yuqori panel: "BITIM MAYDONLARI" + entity tablari; guruhlar bo'yicha maydonlar, drag bilan tartiblash, qo'shish/tahrirlash/o'chirish.
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { crmService } from '../../services/crm.service'
import { Ico } from '../AmoIcons'
import { useT } from '../i18n'
import MultiSelect from '../MultiSelect'
import { useFilterMeta } from '../filterState'
import '../i18n/pipesetup.ru'
import '../pipesetup.css'

const ENTITIES = [
  { slug: 'leads', entity: 'lead', title: 'BITIM MAYDONLARI', tab: 'Bitimlar' },
  { slug: 'contacts', entity: 'contact', title: 'KONTAKT MAYDONLARI', tab: 'Kontaktlar' },
  { slug: 'companies', entity: 'company', title: 'KOMPANIYA MAYDONLARI', tab: 'Kompaniyalar' },
]
const TYPES = [
  { v: 'text', l: 'Matn' }, { v: 'number', l: 'Raqam' }, { v: 'select', l: "Ro'yxat" }, { v: 'multiselect', l: 'Multiro\'yxat' },
  { v: 'date', l: 'Sana' }, { v: 'url', l: 'Havola' }, { v: 'checkbox', l: 'Checkbox' }, { v: 'phone', l: 'Telefon' }, { v: 'email', l: 'Email' },
]
export const typeLabel = (v) => TYPES.find((x) => x.v === v)?.l || (v === 'textarea' ? 'Matn (ko\'p qatorli)' : v)
const DEFAULT_GROUP = ''

export function FieldModal({ initial, defaultGroup, groups, onSave, onClose, entity, stageOpts }) {
  const t = useT()
  const [f, setF] = useState({ label: initial?.label || '', type: initial?.type || 'text', options: initial?.options?.length ? initial.options : [''], group: initial?.group ?? defaultGroup ?? groups[0] ?? DEFAULT_GROUP, required: !!initial?.required, requiredStages: initial?.requiredStages || [] })
  const [newGroup, setNewGroup] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (p) => setF((x) => ({ ...x, ...p }))
  const hasOpts = f.type === 'select' || f.type === 'multiselect'
  const submit = async () => {
    if (!f.label.trim() || busy) return
    const opts = hasOpts ? [...new Set(f.options.map((o) => o.trim()).filter(Boolean))] : []
    if (hasOpts && opts.length === 0) { setErr(t("Kamida bitta variant kiriting")); return }
    if (f.group === '__new' && !newGroup.trim()) { setErr(t('Guruh nomini kiriting')); return }
    setBusy(true); setErr('')
    const group = f.group === '__new' ? newGroup.trim() : f.group
    try { await onSave({ label: f.label.trim(), type: f.type, options: opts, group, required: f.required, requiredStages: f.requiredStages }) }
    catch (e) { setErr(e?.message || t('Saqlanmadi')) }
    finally { setBusy(false) }
  }
  return (
    <div className="ac-modal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ac-modal">
        <button className="ac-modal__close" onClick={onClose}><Ico name="close" size={14} /></button>
        <h3 className="ac-modal__title">{t(initial ? 'Maydonni tahrirlash' : "Maydon qo'shish")}</h3>
        <label className="ac-ps-lbl">{t('Maydon nomi')}</label>
        <input className="ac-input" autoFocus value={f.label} onChange={(e) => set({ label: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && !hasOpts && submit()} />
        <div className="ac-ps-row2">
          <div><label className="ac-ps-lbl">{t('Maydon turi')}</label>
            <select className="ac-select" value={f.type} onChange={(e) => set({ type: e.target.value })}>
              {TYPES.map((x) => <option key={x.v} value={x.v}>{t(x.l)}</option>)}
              {f.type === 'textarea' && <option value="textarea">{t("Matn (ko'p qatorli)")}</option>}
            </select></div>
          <div><label className="ac-ps-lbl">{t('Guruh')}</label>
            <select className="ac-select" value={f.group} onChange={(e) => set({ group: e.target.value })}>
              {groups.map((g) => <option key={g} value={g}>{g || t('Asosiy')}</option>)}
              <option value="__new">{t('+ Yangi guruh')}</option>
            </select></div>
        </div>
        {f.group === '__new' && <><label className="ac-ps-lbl">{t('Guruh nomi')}</label><input className="ac-input" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} /></>}
        {hasOpts && (
          <>
            <label className="ac-ps-lbl">{t('Variantlar')}</label>
            <div className="ac-fs-opts">
              {f.options.map((o, i) => (
                <div key={i} className="ac-fs-opt">
                  <input className="ac-input" value={o} onChange={(e) => set({ options: f.options.map((x, j) => j === i ? e.target.value : x) })} />
                  <button onClick={() => set({ options: f.options.length > 1 ? f.options.filter((_, j) => j !== i) : [''] })}><Ico name="close" size={11} /></button>
                </div>
              ))}
              <button className="ac-btn ac-btn--sm ac-btn--plain" style={{ alignSelf: 'flex-start' }} onClick={() => set({ options: [...f.options, ''] })}>+ {t("Variant qo'shish")}</button>
            </div>
          </>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 14, cursor: 'pointer' }}>
          <input type="checkbox" className="ac-check" checked={f.required} onChange={(e) => set({ required: e.target.checked })} />{t('Majburiy maydon')}
        </label>
        {entity === 'lead' && (
          <>
            <label className="ac-ps-lbl" style={{ marginTop: 14 }}>{t("Qaysi bosqichlarga o'tishda majburiy")}</label>
            <MultiSelect options={stageOpts} groups value={f.requiredStages} onChange={(v) => set({ requiredStages: v })} placeholder={t('Bosqichlarni tanlang')} />
            <div className="ac-muted" style={{ fontSize: 12, marginTop: 4 }}>{t("Bitim shu bosqichlarga o'tkazilganda maydon bo'sh bo'lsa, o'tkazilmaydi")}</div>
          </>
        )}
        {err && <div style={{ color: 'var(--amo-danger)', fontSize: 13, marginTop: 10 }}>{err}</div>}
        <div className="ac-modal__foot">
          <button className="ac-btn ac-btn--blue" disabled={busy || !f.label.trim()} onClick={submit}>{t('Saqlash')}</button>
          <button className="ac-btn" onClick={onClose}>{t('Bekor qilish')}</button>
        </div>
      </div>
    </div>
  )
}

export default function FieldsSetupPage() {
  const t = useT()
  const navigate = useNavigate()
  const { entity: slug = 'leads' } = useParams()
  const cur = ENTITIES.find((e) => e.slug === slug) || ENTITIES[0]
  const [fields, setFields] = useState(null)
  // "Обязательно N": barcha voronkalar bosqichlari (ochiq va yutilgan), voronka bo'yicha guruhlangan
  const meta = useFilterMeta()
  const stageOpts = useMemo(() => {
    const pname = (pid) => (pid ? (meta.pipelines || []).find((p) => p.id === pid)?.name || '' : t('Asosiy voronka'))
    return (meta.stages || []).filter((x) => x.kind !== 'lost').map((x) => ({ value: x.key, label: x.name, group: pname(x.pipelineId), color: x.color }))
  }, [meta.stages, meta.pipelines]) // eslint-disable-line
  const [extraGroups, setExtraGroups] = useState([])
  const [modal, setModal] = useState(null) // {initial?}
  const [drag, setDrag] = useState(null)
  const [over, setOver] = useState(null) // {id} | {group}

  const load = () => crmService.listFields(cur.entity).then((r) => setFields((r.fields || []).map((f) => ({ ...f, group: f.group || '' })))).catch(() => setFields([]))
  useEffect(() => { setFields(null); setExtraGroups([]); load() }, [cur.entity]) // eslint-disable-line

  const groups = useMemo(() => {
    const g = []
    ;(fields || []).forEach((f) => { if (!g.includes(f.group)) g.push(f.group) })
    extraGroups.forEach((x) => { if (!g.includes(x)) g.push(x) })
    if (!g.length) g.push(DEFAULT_GROUP)
    return g
  }, [fields, extraGroups])

  const persist = async (list, moved) => {
    // list: yangi tartibdagi to'liq maydonlar (guruhlar ketma-ketligida)
    setFields(list)
    try {
      if (moved) await crmService.updateField(moved.id, { group: moved.group })
      await crmService.reorderFields(list.map((f) => f.id))
    } catch { load() }
  }

  const flat = (byGroup) => groups.flatMap((g) => byGroup[g] || [])
  const groupMap = () => { const m = {}; groups.forEach((g) => { m[g] = [] }); (fields || []).forEach((f) => m[f.group].push(f)); return m }

  const drop = (target) => {
    if (!drag) return
    const m = groupMap()
    const src = fields.find((f) => f.id === drag)
    if (!src) return
    groups.forEach((g) => { m[g] = m[g].filter((f) => f.id !== drag) })
    if (target.group !== undefined) { m[target.group] = [...m[target.group], { ...src, group: target.group }] }
    else {
      const tf = fields.find((f) => f.id === target.id)
      if (!tf || tf.id === drag) return
      const idx = m[tf.group].findIndex((f) => f.id === tf.id)
      m[tf.group].splice(idx, 0, { ...src, group: tf.group })
    }
    const moved = (target.group ?? fields.find((f) => f.id === target.id)?.group) !== src.group ? { id: src.id, group: target.group ?? fields.find((f) => f.id === target.id).group } : null
    persist(flat(m), moved)
  }

  const save = async (v) => {
    const initial = modal.initial
    if (initial) await crmService.updateField(initial.id, v)
    else await crmService.createField({ ...v, entity: cur.entity })
    setModal(null); load()
  }
  const remove = async (f) => {
    if (!window.confirm(`"${f.label}": ${t("maydon o'chirilsinmi?")}`)) return
    setFields((x) => x.filter((y) => y.id !== f.id))
    try { await crmService.deleteField(f.id) } catch (e) { window.alert(e?.message || t('Xatolik')); load() }
  }
  const addGroup = () => {
    const name = window.prompt(t('Guruh nomi'))
    if (name && name.trim() && !groups.includes(name.trim())) setExtraGroups((x) => [...x, name.trim()])
  }

  const m = groupMap()
  return (
    <div className="ac-fs">
      <div className="ac-fs-top">
        <span className="ac-fs-title">{t(cur.title)}</span>
        <div className="ac-fs-tabs">
          {ENTITIES.map((e) => <button key={e.slug} className={`ac-fs-tab ${e.slug === cur.slug ? 'on' : ''}`} onClick={() => navigate(`/settings/fields/${e.slug}`)}>{t(e.tab)}</button>)}
        </div>
      </div>
      <div className="ac-fs-wrap">
        {fields === null ? <div className="ac-spinner" /> : (
          <>
            {groups.map((g) => (
              <div key={g || '_'} className="ac-fs-group"
                onDragOver={(e) => { if (drag) { e.preventDefault(); setOver({ group: g }) } }}
                onDrop={(e) => { e.preventDefault(); drop({ group: g }); setDrag(null); setOver(null) }}>
                <div className="ac-fs-group__head">
                  <span>{g || t('Asosiy')}</span>
                  <button title={t("Maydon qo'shish")} onClick={() => setModal({ initial: null, group: g })}><Ico name="plus" size={13} /></button>
                </div>
                {m[g].length === 0 && <div className="ac-fs-empty">{t("Maydonlar yo'q")}</div>}
                {m[g].map((f) => (
                  <div key={f.id} className={`ac-fs-row ${drag === f.id ? 'dragging' : ''} ${over?.id === f.id && drag !== f.id ? 'over' : ''} ${f.active === false ? 'off' : ''}`}
                    onDragOver={(e) => { if (drag) { e.preventDefault(); e.stopPropagation(); setOver({ id: f.id }) } }}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop({ id: f.id }); setDrag(null); setOver(null) }}>
                    <span className="ac-fs-row__grip" draggable onDragStart={(e) => { setDrag(f.id); const r = e.currentTarget.closest('.ac-fs-row'); if (r) e.dataTransfer.setDragImage(r, 10, 10) }} onDragEnd={() => { setDrag(null); setOver(null) }}><Ico name="dragDots" size={14} /></span>
                    <span className="ac-fs-row__name">{f.label}{f.required ? ' *' : ''}</span>
                    <span className="ac-fs-row__type">{t(typeLabel(f.type))}</span>
                    {(f.requiredStages || []).length > 0 && <span className="ac-fs-req" title={(f.requiredStages || []).map((k) => stageOpts.find((o) => o.value === k)?.label || k).join(', ')}>{t('Majburiy')} {f.requiredStages.length}</span>}
                    <span className="ac-fs-row__act">
                      <button title={t('Tahrirlash')} onClick={() => setModal({ initial: f })}><Ico name="edit" size={14} /></button>
                      <button className="danger" title={t("O'chirish")} onClick={() => remove(f)}><Ico name="trash" size={14} /></button>
                    </span>
                  </div>
                ))}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="ac-btn ac-fs-add" onClick={() => setModal({ initial: null, group: groups[0] })}><span className="ac-btn__plus">+</span> {t("Maydon qo'shish")}</button>
              <button className="ac-btn ac-btn--plain ac-fs-add" onClick={addGroup}>{t("+ Guruh qo'shish")}</button>
            </div>
          </>
        )}
      </div>
      {modal && <FieldModal initial={modal.initial} defaultGroup={modal.group} groups={groups} onSave={save} onClose={() => setModal(null)} entity={cur.entity} stageOpts={stageOpts} />}
    </div>
  )
}
