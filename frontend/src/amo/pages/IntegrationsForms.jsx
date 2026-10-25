// Saytga lid formalari — ro'yxat + ixcham tahrirlash (mantiq: eski FormsView / FormBuilder).
import React, { useEffect, useState } from 'react'
import { crmService } from '../../services/crm.service'
import { Ico } from '../AmoIcons'
import { useT } from '../i18n'

const TYPES = [
  ['short_text', 'Qisqa javob'], ['long_text', 'Paragraf'], ['name', 'Ism'], ['phone', 'Telefon'], ['email', 'Email'],
  ['number', 'Raqam'], ['date', 'Sana'], ['single_choice', 'Bitta tanlov'], ['multi_choice', 'Belgilash (checkbox)'], ['dropdown', "Ochiluvchi ro'yxat"],
]
const CHOICE = ['single_choice', 'multi_choice', 'dropdown']
const defaultFields = () => [
  { key: 'name', label: 'Ismingiz', type: 'name', required: true },
  { key: 'phone', label: 'Telefon', type: 'phone', required: true },
]
const slugify = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
let seq = 0
const newField = () => ({ key: 'maydon_' + Date.now().toString(36) + '_' + (seq++), type: 'short_text', label: '', required: false, options: [] })

export default function IntegrationsForms({ stages = [], members = [], onStatus }) {
  const t = useT()
  const [items, setItems] = useState(null)
  const [edit, setEdit] = useState(null)
  const [msg, setMsg] = useState(null)
  const load = () => crmService.listForms().then((r) => { setItems(r.forms || []); onStatus?.((r.forms || []).length > 0) })
    .catch((e) => { setItems([]); setMsg({ ok: false, m: e.message || t('Xatolik') }) })
  useEffect(() => { load() }, []) // eslint-disable-line

  const toggle = async (f) => {
    setItems((xs) => xs.map((x) => (x.id === f.id ? { ...x, active: !x.active } : x)))
    try { await crmService.updateForm(f.id, { active: !f.active }) } catch (e) { setMsg({ ok: false, m: e.message || t('Xatolik') }); load() }
  }
  const remove = async (f) => {
    if (!window.confirm(`"${f.title}" — ${t("o'chirilsinmi?")}`)) return
    setItems((xs) => xs.filter((x) => x.id !== f.id))
    try { await crmService.deleteForm(f.id) } catch (e) { setMsg({ ok: false, m: e.message || t('Xatolik') }) }
    load()
  }
  const copy = async (f) => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/lead/${f.slug}`); setMsg({ ok: true, m: t('Havola nusxalandi') }) } catch { /* */ }
  }

  if (items === null) return <div className="ac-spinner" />
  if (edit) {
    return <Editor initial={edit} stages={stages} members={members} onCancel={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />
  }
  return (
    <>
      <div className="ac-int-lead">{t("Saytingizga joylaydigan formalar — to'ldirilganda CRM'ga lid bo'lib tushadi.")}</div>
      <div className="ac-int-actions" style={{ marginTop: 0, justifyContent: 'space-between' }}>
        {msg ? <span className={`ac-int-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.m}</span> : <span />}
        <button className="ac-btn ac-btn--blue" onClick={() => setEdit({ title: '', description: '', source: 'Sayt formasi', stageKey: '', assigneeId: '', fields: defaultFields() })}>
          <span className="ac-btn__plus">+</span> {t('Forma yaratish')}
        </button>
      </div>
      <div style={{ marginTop: 10 }}>
        {items.length === 0 && <div className="ac-muted" style={{ padding: '20px 0' }}>{t("Hali forma yo'q.")}</div>}
        {items.map((f) => (
          <div key={f.id} className="ac-int-list-item" style={{ opacity: f.active ? 1 : 0.6 }}>
            <div className="grow">
              <div className="nm">{f.title}</div>
              <div className="ac-int-sub">/lead/{f.slug} · {f.submissions || 0} {t('yuborilgan')} · {f.source || '—'}</div>
            </div>
            <button className="ac-btn ac-btn--sm" onClick={() => copy(f)}>{t('Havola')}</button>
            <span className={`ac-switch ${f.active ? 'on' : ''}`} onClick={() => toggle(f)} />
            <button className="ac-int-x" style={{ color: 'inherit' }} title={t('Tahrirlash')} onClick={() => setEdit(f)}><Ico name="edit" /></button>
            <button className="ac-int-x" title={t("O'chirish")} onClick={() => remove(f)}><Ico name="trash" /></button>
          </div>
        ))}
      </div>
    </>
  )
}

function Editor({ initial, stages, members, onCancel, onSaved }) {
  const t = useT()
  const [form, setForm] = useState(() => ({
    title: initial.title || '', description: initial.description || '', source: initial.source || 'Sayt formasi',
    stageKey: initial.stageKey || '', assigneeId: initial.assigneeId || '', settings: initial.settings || {},
    fields: initial.fields?.length ? initial.fields : defaultFields(),
  }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))
  const setField = (i, patch) => setForm((p) => ({ ...p, fields: p.fields.map((x, j) => (j === i ? { ...x, ...patch } : x)) }))
  const move = (i, d) => setForm((p) => { const a = [...p.fields]; const j = i + d; if (j < 0 || j >= a.length) return p; [a[i], a[j]] = [a[j], a[i]]; return { ...p, fields: a } })

  const save = async () => {
    if (busy) return
    if (!form.title.trim()) { setErr(t('Forma nomini kiriting')); return }
    if (form.fields.length === 0) { setErr(t("Kamida bitta maydon qo'shing")); return }
    if (form.fields.some((x) => CHOICE.includes(x.type) && !(x.options || []).length)) { setErr(t('Tanlov maydonlari uchun variantlarni kiriting')); return }
    const fields = form.fields.map((x) => ({ ...x, key: x.key || slugify(x.label) || 'maydon', label: x.label || x.key }))
    setBusy(true); setErr(null)
    try {
      const payload = { ...form, fields, stageKey: form.stageKey || (stages[0]?.id || 'new') }
      if (initial.id) await crmService.updateForm(initial.id, payload)
      else await crmService.createForm(payload)
      onSaved()
    } catch (e) { setErr(e.message || t('Saqlanmadi')); setBusy(false) }
  }

  return (
    <>
      <div className="ac-int-field"><label>{t('Forma nomi')}</label><input className="ac-input" value={form.title} onChange={(e) => set('title', e.target.value)} autoFocus /></div>
      <div className="ac-int-field"><label>{t('Tavsif (ixtiyoriy)')}</label><input className="ac-input" value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
      <div className="ac-int-grid2">
        <div className="ac-int-field"><label>{t('Yuborilgandan keyingi xabar')}</label>
          <input className="ac-input" value={form.settings?.confirmationMessage || ''} placeholder={t("So'rovingiz qabul qilindi. Tez orada siz bilan bog'lanamiz.")} onChange={(e) => set('settings', { ...(form.settings || {}), confirmationMessage: e.target.value })} /></div>
        <div className="ac-int-field"><label>{t('Forma rangi')}</label>
          <input className="ac-input" type="color" style={{ padding: 2, width: 60 }} value={form.settings?.themeColor || '#8cd211'} onChange={(e) => set('settings', { ...(form.settings || {}), themeColor: e.target.value })} /></div>
      </div>
      <div className="ac-int-grid2">
        <div className="ac-int-field"><label>{t('Manba belgisi')}</label><input className="ac-input" value={form.source} onChange={(e) => set('source', e.target.value)} /></div>
        <div className="ac-int-field"><label>{t('Bosqich')}</label>
          <select className="ac-select" value={form.stageKey || stages[0]?.id || ''} onChange={(e) => set('stageKey', e.target.value)}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="ac-int-field"><label>{t("Mas'ul")}</label>
          <select className="ac-select" value={form.assigneeId} onChange={(e) => set('assigneeId', e.target.value)}><option value="">—</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
      </div>
      <div className="ac-set-sub" style={{ marginTop: 10 }}>{t('Maydonlar')}</div>
      {form.fields.map((fd, i) => (
        <div key={fd.key || i} style={{ marginBottom: 12 }}>
          <div className="ac-int-fieldrow">
            <input className="ac-input" value={fd.label || ''} placeholder={t('Savol')} onChange={(e) => setField(i, { label: e.target.value })} />
            <select className="ac-select" value={fd.type} onChange={(e) => setField(i, { type: e.target.value })}>
              {!TYPES.some(([v]) => v === fd.type) && <option value={fd.type}>{fd.type}</option>}
              {TYPES.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
            </select>
            <label className="ac-set-checkrow" style={{ fontSize: 12 }}><input type="checkbox" className="ac-check" checked={!!fd.required} onChange={(e) => setField(i, { required: e.target.checked })} />{t('Majburiy')}</label>
            <button className="ac-int-x" onClick={() => setForm((p) => ({ ...p, fields: p.fields.filter((_, j) => j !== i) }))}><Ico name="close" size={12} /></button>
          </div>
          {CHOICE.includes(fd.type) && (
            <textarea className="ac-input" style={{ height: 70, padding: 8 }} placeholder={t('Variantlar (har biri yangi qatorda)')}
              value={(fd.options || []).map((o) => (typeof o === 'string' ? o : o.label || o.value)).join('\n')}
              onChange={(e) => setField(i, { options: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} />
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button className="ac-btn ac-btn--sm" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button className="ac-btn ac-btn--sm" disabled={i === form.fields.length - 1} onClick={() => move(i, 1)}>↓</button>
          </div>
        </div>
      ))}
      <button className="ac-btn ac-btn--sm" onClick={() => setForm((p) => ({ ...p, fields: [...p.fields, newField()] }))}><span className="ac-btn__plus">+</span> {t("Maydon qo'shish")}</button>
      {err && <div className="ac-int-msg err" style={{ marginTop: 10 }}>{err}</div>}
      <div className="ac-int-actions">
        <button className="ac-btn ac-btn--blue" disabled={busy} onClick={save}>{busy ? t('Saqlanmoqda…') : t('Saqlash')}</button>
        <button className="ac-btn" onClick={onCancel}>{t('Bekor qilish')}</button>
      </div>
    </>
  )
}
