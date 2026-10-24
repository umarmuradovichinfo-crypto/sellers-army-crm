import React, { useState, useEffect } from 'react'
import { dialog } from '../Dialog'
import Icon from '../Icon'
import { Loading, Switch } from '../ui'
import { useCachedState } from '../../lib/useApi'
import { crmService } from '../../services/crm.service'
import FormBuilder from '../forms/FormBuilder'

function slugify(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') }
let _crmSeq = 0
function crmMakeField() { return { key: 'maydon_' + Date.now().toString(36) + '_' + (_crmSeq++), type: 'short_text', label: '', required: false, options: [] } }

export default function FormsView({ stages = [], members = [] }) {
  const [items, setItems] = useCachedState('crm:forms', null)
  const [edit, setEdit] = useState(null)
  const load = () => crmService.listForms().then((r) => setItems(r.forms || []))
  useEffect(() => { load() }, [])

  const toggle = async (f) => {
    setItems((xs) => xs.map((x) => x.id === f.id ? { ...x, active: !x.active } : x))
    try { await crmService.updateForm(f.id, { active: !f.active }) } catch { load() }
  }
  const remove = async (f) => {
    if (!await dialog.confirm(`"${f.title}" formasi o'chirilsinmi?`)) return
    setItems((xs) => xs.filter((x) => x.id !== f.id))
    try { await crmService.deleteForm(f.id) } catch { load() }
  }
  const copyLink = async (f) => {
    const url = `${window.location.origin}/lead/${f.slug}`
    try { await navigator.clipboard.writeText(url) } catch { /* */ }
    await dialog.alert(`Havola nusxalandi:\n${url}`)
  }

  if (items === null) return <Loading />

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="fx jb ac mb16">
        <div className="sub2" style={{ fontSize: 13 }}>Saytga joylaydigan formalar — to'ldirilganda CRM'ga lid bo'lib tushadi.</div>
        <button className="btn primary" onClick={() => setEdit({ title: '', description: '', source: 'Sayt formasi', stageKey: stages[0]?.id || 'new', assigneeId: '', fields: defaultFields() })}>
          <Icon name="plus" size={15} />Forma yaratish
        </button>
      </div>
      {items.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--mut)' }}>Hali forma yo'q.</div>}
      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((f) => (
          <div className="card" key={f.id} style={{ opacity: f.active ? 1 : 0.6 }}>
            <div className="fx jb ac">
              <div className="f1">
                <b style={{ fontSize: 14 }}>{f.title}</b>
                <div className="sub2" style={{ fontSize: 12, marginTop: 3 }}>/lead/{f.slug} · {f.submissions || 0} ta yuborilgan · {f.source || '—'}</div>
              </div>
              <div className="fx ac gap10">
                <button className="btn sm" onClick={() => copyLink(f)} title="Havolani nusxalash"><Icon name="download" size={13} style={{ transform: 'rotate(-90deg)' }} />Havola</button>
                <Switch checked={f.active} onChange={() => toggle(f)} />
                <button className="btn sm" onClick={() => setEdit(f)}><Icon name="edit" size={13} /></button>
                <button className="hr-x" onClick={() => remove(f)}>×</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {edit && <FormEditor initial={edit} stages={stages} members={members} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </div>
  )
}

function defaultFields() {
  return [
    { key: 'name', label: 'Ismingiz', type: 'name', required: true },
    { key: 'phone', label: 'Telefon', type: 'phone', required: true },
  ]
}

function FormEditor({ initial, stages, members, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    title: initial.title || '', description: initial.description || '',
    source: initial.source || 'Sayt formasi',
    stageKey: initial.stageKey || stages[0]?.id || 'new', assigneeId: initial.assigneeId || '',
    settings: initial.settings || {},
    fields: initial.fields?.length ? initial.fields : defaultFields(),
  }))
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))

  const save = async () => {
    if (!form.title.trim()) { await dialog.alert('Forma nomini kiriting'); return }
    const fields = form.fields.map((x) => ({ ...x, key: x.key || slugify(x.label) || 'maydon', label: x.label || x.key }))
    const payload = { title: form.title, description: form.description, source: form.source, stageKey: form.stageKey, assigneeId: form.assigneeId, settings: form.settings, fields }
    setSaving(true)
    try {
      if (initial.id) await crmService.updateForm(initial.id, payload)
      else await crmService.createForm(payload)
      onSaved()
    } catch (e) { await dialog.alert(e.message || 'Saqlanmadi'); setSaving(false) }
  }

  const copyLink = async () => {
    const url = `${window.location.origin}/lead/${initial.slug}`
    try { await navigator.clipboard.writeText(url) } catch { /* */ }
    await dialog.alert(`Havola nusxalandi:\n${url}`)
  }

  const extraHeader = (
    <div className="hr-grid2" style={{ marginTop: 10 }}>
      <div className="hr-field" style={{ margin: 0 }}><label>Manba belgisi</label><input className="hr-input" value={form.source} onChange={(e) => set('source', e.target.value)} /></div>
      <div className="hr-field" style={{ margin: 0 }}><label>Boshlang'ich bosqich</label><select className="hr-select" value={form.stageKey} onChange={(e) => set('stageKey', e.target.value)}>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <div className="hr-field" style={{ margin: 0 }}><label>Avto mas'ul</label><select className="hr-select" value={form.assigneeId} onChange={(e) => set('assigneeId', e.target.value)}><option value="">— yo'q —</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
    </div>
  )

  return (
    <div className="hr-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="hr-drawer gf-drawer">
        <div className="hr-dh">
          <div className="f1"><b style={{ fontSize: 15 }}>{initial.id ? 'Formani tahrirlash' : 'Yangi forma'}</b></div>
          {initial.slug && <button className="btn sm" onClick={copyLink} title="Ommaviy havola"><Icon name="download" size={13} style={{ transform: 'rotate(-90deg)' }} />Havola</button>}
          <button className="hr-x" onClick={onClose}>×</button>
        </div>
        <div className="hr-db">
          <FormBuilder value={form} onChange={setForm} makeField={crmMakeField} idKey="key" extraHeader={extraHeader} />
          <div className="fx ac gap10" style={{ position: 'sticky', bottom: 0, background: 'var(--card)', padding: '14px 0', borderTop: '1px solid var(--bd)' }}>
            <button className="btn primary f1" disabled={saving} onClick={save}>{saving ? 'Saqlanmoqda…' : 'Saqlash'}</button>
            <button className="btn" onClick={onClose}>Yopish</button>
          </div>
        </div>
      </div>
    </div>
  )
}
