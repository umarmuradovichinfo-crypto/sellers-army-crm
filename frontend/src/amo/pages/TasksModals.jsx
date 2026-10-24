// amoCRM "Задачи" — modallar: yangi vazifa qo'shish va vazifani natija bilan bajarish.
import React, { useEffect, useRef, useState } from 'react'
import { crmService } from '../../services/crm.service'
import { useT } from '../i18n'
import { Ico } from '../AmoIcons'

import { TASK_TYPES } from '../taskTypes'
export { TASK_TYPES }

const pad = (n) => String(n).padStart(2, '0')
export const toDateInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, []) // eslint-disable-line
  return (
    <div className="ac-modal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ac-modal ac-todo-modal">
        <button className="ac-modal__close" onClick={onClose}><Ico name="close" size={14} /></button>
        <h3 className="ac-modal__title">{title}</h3>
        {children}
      </div>
    </div>
  )
}

export function CompleteModal({ task, onClose, onDone }) {
  const t = useT()
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  const submit = async () => {
    if (busy) return
    setBusy(true)
    try { await onDone(task, result.trim()) } catch (e) { setErr(e?.message || t('Xatolik yuz berdi')); setBusy(false); return }
    onClose()
  }
  return (
    <Modal title={t('Vazifani bajarish')} onClose={onClose}>
      <div className="ac-todo-modal__text">{task.title}</div>
      <textarea ref={ref} className="ac-input" placeholder={t("Natija qo'shing")} value={result} maxLength={1000} onChange={(e) => setResult(e.target.value)} />
      {err && <div className="ac-todo-form__err">{err}</div>}
      <div className="ac-modal__foot">
        <button className="ac-btn ac-btn--blue" disabled={busy} onClick={submit}>{t('Bajarish')}</button>
        <button className="ac-btn ac-btn--plain" onClick={onClose}>{t('Bekor qilish')}</button>
      </div>
    </Modal>
  )
}

export function AddTaskModal({ members, defaultDate, defaultAssignee, onClose, onCreated }) {
  const t = useT()
  const base = defaultDate ? new Date(defaultDate) : new Date()
  const [lead, setLead] = useState(null)
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(toDateInput(base))
  const [time, setTime] = useState('09:00')
  const [assigneeId, setAssigneeId] = useState(defaultAssignee || '')
  const [type, setType] = useState('call')
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let dead = false
    const h = setTimeout(async () => {
      try {
        const r = await crmService.listLeads(q.trim() ? { search: q.trim() } : {})
        if (!dead) setFound((r.leads || []).slice(0, 8))
      } catch { if (!dead) setFound([]) }
    }, 250)
    return () => { dead = true; clearTimeout(h) }
  }, [q, open])

  const quick = (k) => {
    const d = new Date()
    if (k === 'tomorrow') d.setDate(d.getDate() + 1)
    if (k === 'week') d.setDate(d.getDate() + ((7 - d.getDay()) % 7))
    setDate(toDateInput(d))
  }

  const save = async () => {
    if (!lead) return setErr(t('Bitimni tanlang'))
    if (!text.trim()) return setErr(t('Vazifa matnini kiriting'))
    if (!date) return setErr(t('Muddatni kiriting'))
    const due = new Date(`${date}T${time || '09:00'}`)
    if (Number.isNaN(due.getTime())) return setErr(t('Muddat noto\'g\'ri'))
    if (busy) return
    setBusy(true)
    try {
      await crmService.createTask(lead.id, { title: text.trim(), type, dueDate: due.toISOString(), assigneeId: assigneeId || undefined })
      onCreated()
      onClose()
    } catch (e) {
      setErr(e?.message || t('Xatolik yuz berdi'))
      setBusy(false)
    }
  }

  return (
    <Modal title={t('Yangi vazifa')} onClose={onClose}>
      <div className="ac-todo-form">
        <label className="ac-todo-form__label ac-caption">{t('Bitim')}</label>
        <div className="ac-todo-lead">
          {lead ? (
            <div className="ac-todo-lead__picked">
              <span>{lead.contactName || lead.n}</span>
              <button onClick={() => { setLead(null); setQ('') }}><Ico name="close" size={11} /></button>
            </div>
          ) : (
            <>
              <input className="ac-input" placeholder={t('Bitim qidirish')} value={q} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => { setQ(e.target.value); setOpen(true) }} />
              {open && (
                <div className="ac-menu ac-todo-lead__list">
                  {found.length === 0 && <div className="ac-todo-lead__empty">{t('Bitim topilmadi')}</div>}
                  {found.map((l) => (
                    <button key={l.id} className="ac-menu__item" onMouseDown={(e) => e.preventDefault()} onClick={() => { setLead(l); setOpen(false); setErr('') }}>{l.contactName && l.contactName !== l.n ? `${l.n} — ${l.contactName}` : l.n}</button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <label className="ac-todo-form__label ac-caption">{t('Muddat')}</label>
        <div className="ac-todo-form__row">
          <input type="date" className="ac-input" value={date} onChange={(e) => setDate(e.target.value)} />
          <input type="time" className="ac-input" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="ac-todo-form__quick">
          <button onClick={() => quick('today')}>{t('Bugun')}</button>
          <button onClick={() => quick('tomorrow')}>{t('Ertaga')}</button>
          <button onClick={() => quick('week')}>{t('Hafta oxiri')}</button>
        </div>

        <div className="ac-todo-form__row">
          <div>
            <label className="ac-todo-form__label ac-caption">{t("Mas'ul")}</label>
            <select className="ac-select" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">—</option>
              {(members || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="ac-todo-form__label ac-caption">{t('Vazifa turi')}</label>
            <select className="ac-select" value={type} onChange={(e) => setType(e.target.value)}>
              {TASK_TYPES.map((x) => <option key={x.key} value={x.key}>{t(x.label)}</option>)}
            </select>
          </div>
        </div>

        <label className="ac-todo-form__label ac-caption">{t('Vazifa matni')}</label>
        <textarea className="ac-input" placeholder={t('Vazifa matni...')} maxLength={1000} value={text} onChange={(e) => { setText(e.target.value); setErr('') }} />
        {err && <div className="ac-todo-form__err">{err}</div>}
      </div>
      <div className="ac-modal__foot">
        <button className="ac-btn ac-btn--blue" disabled={busy} onClick={save}>{t('Saqlash')}</button>
        <button className="ac-btn ac-btn--plain" onClick={onClose}>{t('Bekor qilish')}</button>
      </div>
    </Modal>
  )
}
