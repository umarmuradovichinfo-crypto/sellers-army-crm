// Digital Pipeline — trigger qo'shish/tahrirlash oynasi va amallar katalogi.
import React, { useState } from 'react'
import { Ico } from '../AmoIcons'
import { useT } from '../i18n'

export const ACTIONS = [
  { v: 'create_task', l: "Vazifa qo'yish", icon: 'calendar' },
  { v: 'add_tag', l: "Teg qo'shish", icon: 'tag' },
  { v: 'remove_tag', l: 'Tegni olib tashlash', icon: 'tag' },
  { v: 'set_assignee', l: "Mas'ulni o'zgartirish", icon: 'user' },
  { v: 'set_field', l: "Maydonni o'zgartirish", icon: 'edit' },
  { v: 'add_note', l: "Izoh qo'shish", icon: 'note' },
  { v: 'notify', l: 'Xabar yuborish', icon: 'bell' },
  { v: 'webhook', l: 'Webhook yuborish', icon: 'link' },
]
const TASK_TYPES = [{ v: 'call', l: "Qo'ng'iroq" }, { v: 'meeting', l: 'Uchrashuv' }, { v: 'message', l: 'Xabar' }, { v: 'task', l: 'Vazifa' }]

export const actionMeta = (type) => ACTIONS.find((a) => a.v === type) || ACTIONS[0]

// Karta ichidagi qisqa matn: [sarlavha, qiymat]
export function actionSummary(a) {
  const m = actionMeta(a.type)
  let val = ''
  if (a.type === 'create_task') val = a.title || ''
  else if (a.type === 'add_tag' || a.type === 'remove_tag') val = a.tag || ''
  else if (a.type === 'set_assignee') val = a.assigneeName || (a.assignee === 'round_robin' ? 'round-robin' : '')
  else if (a.type === 'set_field') val = [a.field, a.value].filter((x) => x !== undefined && x !== '').join(' = ')
  else if (a.type === 'add_note' || a.type === 'notify') val = a.text || ''
  else if (a.type === 'webhook') val = a.url || ''
  return [m.l, val]
}

export default function TriggerModal({ initial, trigger, members, onSave, onDelete, onClose }) {
  const t = useT()
  const first = initial?.actions?.[0]
  const [a, setA] = useState(first || { type: 'create_task', title: '', taskType: 'call', dueInDays: 1 })
  const [active, setActive] = useState(initial ? initial.active !== false : true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (patch) => setA((p) => ({ ...p, ...patch }))
  const pick = (type) => {
    const base = { type }
    if (type === 'create_task') Object.assign(base, { title: '', taskType: 'call', dueInDays: 1, assignee: 'lead' })
    if (type === 'set_assignee') base.assignee = 'round_robin'
    setA(base)
  }
  const problem = () => {
    const has = (v) => String(v ?? '').trim() !== ''
    if (a.type === 'create_task' && !has(a.title)) return 'Vazifa matnini kiriting'
    if ((a.type === 'add_tag' || a.type === 'remove_tag') && !has(a.tag)) return 'Tegni kiriting'
    if (a.type === 'set_field' && !has(a.field)) return 'Maydon nomini kiriting'
    if ((a.type === 'add_note' || a.type === 'notify') && !has(a.text)) return 'Matnni kiriting'
    if (a.type === 'webhook' && !/^https?:\/\/\S+$/i.test(String(a.url || '').trim())) return "To'g'ri URL kiriting (http:// yoki https://)"
    return ''
  }
  const submit = async () => {
    if (saving) return
    const pr = problem()
    if (pr) { setErr(pr); return }
    setSaving(true); setErr('')
    const act = { ...a }
    if (a.type === 'webhook') act.url = String(a.url).trim()
    if (a.type === 'set_assignee') act.assigneeName = a.assignee === 'round_robin' ? '' : members.find((m) => m.id === a.assignee)?.name || ''
    try { await onSave([act, ...(initial?.actions?.slice(1) || [])], active, actionMeta(a.type).l) }
    catch (e) { setErr(e?.message || t('Saqlanmadi')) }
    finally { setSaving(false) }
  }
  return (
    <div className="ac-modal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ac-modal">
        <button className="ac-modal__close" onClick={onClose}><Ico name="close" size={14} /></button>
        <h3 className="ac-modal__title">{t(trigger === 'lead_created' ? 'Yaratilganda' : "Bosqichga o'tgandan keyin")}</h3>
        <div className="ac-ps-acts">
          {ACTIONS.map((x) => (
            <button key={x.v} className={`ac-ps-act ${a.type === x.v ? 'on' : ''}`} onClick={() => pick(x.v)}>
              <Ico name={x.icon} size={15} />{t(x.l)}
            </button>
          ))}
        </div>

        {a.type === 'create_task' && (
          <>
            <label className="ac-ps-lbl">{t('Vazifa matni')}</label>
            <input className="ac-input" value={a.title || ''} onChange={(e) => set({ title: e.target.value })} placeholder={t("Mijozga qo'ng'iroq")} />
            <div className="ac-ps-row2">
              <div><label className="ac-ps-lbl">{t('Turi')}</label>
                <select className="ac-select" value={a.taskType || 'call'} onChange={(e) => set({ taskType: e.target.value })}>{TASK_TYPES.map((x) => <option key={x.v} value={x.v}>{t(x.l)}</option>)}</select></div>
              <div><label className="ac-ps-lbl">{t('Muddat (kun)')}</label>
                <input className="ac-input" type="number" value={a.dueInDays ?? 1} onChange={(e) => set({ dueInDays: Number(e.target.value) })} /></div>
            </div>
            <label className="ac-ps-lbl">{t('Kimga')}</label>
            <select className="ac-select" value={a.assignee || 'lead'} onChange={(e) => set({ assignee: e.target.value })}>
              <option value="lead">{t("Bitim mas'uli")}</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </>
        )}
        {(a.type === 'add_tag' || a.type === 'remove_tag') && (
          <><label className="ac-ps-lbl">{t('Teg')}</label><input className="ac-input" value={a.tag || ''} onChange={(e) => set({ tag: e.target.value })} /></>
        )}
        {a.type === 'set_assignee' && (
          <><label className="ac-ps-lbl">{t("Mas'ul")}</label>
            <select className="ac-select" value={a.assignee || 'round_robin'} onChange={(e) => set({ assignee: e.target.value })}>
              <option value="round_robin">{t('Navbat bilan (round-robin)')}</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select></>
        )}
        {a.type === 'set_field' && (
          <div className="ac-ps-row2">
            <div><label className="ac-ps-lbl">{t('Maydon')}</label><input className="ac-input" value={a.field || ''} onChange={(e) => set({ field: e.target.value })} placeholder="hot / source / value" /></div>
            <div><label className="ac-ps-lbl">{t('Qiymat')}</label><input className="ac-input" value={a.value ?? ''} onChange={(e) => set({ value: e.target.value })} /></div>
          </div>
        )}
        {(a.type === 'add_note' || a.type === 'notify') && (
          <><label className="ac-ps-lbl">{t('Matn')}</label><input className="ac-input" value={a.text || ''} onChange={(e) => set({ text: e.target.value })} /></>
        )}
        {a.type === 'webhook' && (
          <><label className="ac-ps-lbl">Webhook URL</label><input className="ac-input" value={a.url || ''} onChange={(e) => set({ url: e.target.value })} placeholder="https://..." /></>
        )}

        {err && <div style={{ color: 'var(--amo-danger)', fontSize: 13, marginTop: 10 }}>{t(err)}</div>}
        <div className="ac-ps-modal-foot">
          <button className="ac-btn ac-btn--blue" disabled={saving} onClick={submit}>{t('Saqlash')}</button>
          <button className="ac-btn" onClick={onClose}>{t('Bekor qilish')}</button>
          <span className="grow" />
          {initial && (
            <>
              <button className={`ac-switch ${active ? 'on' : ''}`} style={{ border: 0, background: 'none', padding: 0 }} title={t('Faol')} onClick={() => setActive((v) => !v)} />
              <button className="ac-btn ac-btn--plain" style={{ color: 'var(--amo-danger)' }} onClick={async () => { try { await onDelete() } catch (e) { setErr(e?.message || t('Xatolik')) } }}>{t("O'chirish")}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
