import React, { useState, useEffect } from 'react'
import { dialog } from '../Dialog'
import Icon from '../Icon'
import { Loading, Switch } from '../ui'
import { useCachedState } from '../../lib/useApi'
import { crmService } from '../../services/crm.service'

const TRIGGERS = [
  { v: 'stage_enter', l: 'Bosqichga kirganda' },
  { v: 'lead_created', l: 'Lid yaratilganda' },
  { v: 'tag_added', l: 'Teg qo\'shilganda' },
]
const ACTION_TYPES = [
  { v: 'create_task', l: '📋 Vazifa yaratish' },
  { v: 'add_tag', l: '🏷 Teg qo\'shish' },
  { v: 'remove_tag', l: '🏷 Teg olib tashlash' },
  { v: 'set_assignee', l: '👤 Mas\'ul belgilash' },
  { v: 'set_field', l: '✏️ Maydon o\'zgartirish' },
  { v: 'add_note', l: '💬 Izoh qo\'shish' },
  { v: 'notify', l: '🔔 Bildirishnoma' },
  { v: 'webhook', l: '🔗 Webhook' },
]
const COND_FIELDS = [
  { v: 'source', l: 'Manba' },
  { v: 'value', l: 'Byudjet' },
  { v: 'hot', l: 'Issiq (true/false)' },
  { v: 'tag', l: 'Teg' },
  { v: 'assigneeId', l: 'Mas\'ul (id)' },
]
const COND_OPS = [
  { v: 'eq', l: '=' }, { v: 'ne', l: '≠' }, { v: 'gt', l: '>' }, { v: 'lt', l: '<' },
  { v: 'contains', l: 'ichida' }, { v: 'has_tag', l: 'tegi bor' }, { v: 'empty', l: 'bo\'sh' }, { v: 'not_empty', l: 'to\'la' },
]
const TASK_TYPES = [{ v: 'call', l: 'Qo\'ng\'iroq' }, { v: 'meeting', l: 'Uchrashuv' }, { v: 'message', l: 'Xabar' }, { v: 'task', l: 'Vazifa' }]

export default function AutomationsView({ stages = [], members = [] }) {
  const [items, setItems] = useCachedState('crm:automations', null)
  const [edit, setEdit] = useState(null)

  const load = () => crmService.listAutomations().then((r) => setItems(r.automations || []))
  useEffect(() => { load() }, [])

  const toggle = async (a) => {
    setItems((xs) => xs.map((x) => x.id === a.id ? { ...x, active: !x.active } : x))
    try { await crmService.updateAutomation(a.id, { active: !a.active }) } catch { load() }
  }
  const remove = async (a) => {
    if (!await dialog.confirm(`"${a.name}" o'chirilsinmi?`)) return
    setItems((xs) => xs.filter((x) => x.id !== a.id))
    try { await crmService.deleteAutomation(a.id) } catch { load() }
  }

  if (items === null) return <Loading />

  const stageName = (k) => stages.find((s) => s.id === k || s.key === k)?.name || k
  const trigLabel = (t) => TRIGGERS.find((x) => x.v === t)?.l || t

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="fx jb ac mb16">
        <div className="sub2" style={{ fontSize: 13 }}>Bosqich o'zgarganda yoki lid kelganda avtomatik amallar — vazifa, teg, mas'ul, bildirishnoma.</div>
        <button className="btn primary" onClick={() => setEdit({ name: '', trigger: 'stage_enter', stageKey: stages[0]?.id || '', conditions: [], actions: [], active: true })}>
          <Icon name="plus" size={15} />Qoida qo'shish
        </button>
      </div>

      {items.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--mut)' }}>Hali avtomatlashtirish qoidasi yo'q.</div>}

      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((a) => (
          <div className="card" key={a.id} style={{ opacity: a.active ? 1 : 0.55 }}>
            <div className="fx jb ac">
              <div className="f1">
                <div className="fx ac gap8">
                  <b style={{ fontSize: 14 }}>{a.name || 'Qoida'}</b>
                  <span className="pill mut" style={{ padding: '2px 8px' }}>{trigLabel(a.trigger)}</span>
                  {a.trigger === 'stage_enter' && a.stageKey && <span className="tag">{stageName(a.stageKey)}</span>}
                </div>
                <div className="sub2" style={{ fontSize: 12, marginTop: 4 }}>
                  {a.conditions?.length ? `${a.conditions.length} shart · ` : ''}{a.actions?.length || 0} amal
                </div>
              </div>
              <div className="fx ac gap10">
                <Switch checked={a.active} onChange={() => toggle(a)} />
                <button className="btn sm" onClick={() => setEdit(a)}><Icon name="edit" size={13} /></button>
                <button className="hr-x" onClick={() => remove(a)}>×</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {edit && <AutomationEditor initial={edit} stages={stages} members={members}
        onClose={() => setEdit(null)}
        onSaved={() => { setEdit(null); load() }} />}
    </div>
  )
}

function AutomationEditor({ initial, stages, members, onClose, onSaved }) {
  const [f, setF] = useState({
    name: initial.name || '',
    trigger: initial.trigger || 'stage_enter',
    stageKey: initial.stageKey || stages[0]?.id || '',
    conditions: initial.conditions || [],
    actions: initial.actions || [],
    active: initial.active !== false,
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  const addCond = () => set('conditions', [...f.conditions, { field: 'source', op: 'eq', value: '' }])
  const setCond = (i, k, v) => set('conditions', f.conditions.map((c, j) => j === i ? { ...c, [k]: v } : c))
  const rmCond = (i) => set('conditions', f.conditions.filter((_, j) => j !== i))

  const addAction = () => set('actions', [...f.actions, { type: 'create_task', title: '', taskType: 'call', dueInDays: 1 }])
  const setAct = (i, patch) => set('actions', f.actions.map((a, j) => j === i ? { ...a, ...patch } : a))
  const rmAct = (i) => set('actions', f.actions.filter((_, j) => j !== i))

  const save = async () => {
    if (!f.name.trim()) { await dialog.alert('Qoida nomini kiriting'); return }
    setSaving(true)
    const payload = { ...f, name: f.name.trim() }
    try {
      if (initial.id) await crmService.updateAutomation(initial.id, payload)
      else await crmService.createAutomation(payload)
      onSaved()
    } catch (e) { await dialog.alert(e.message || 'Saqlanmadi'); setSaving(false) }
  }

  return (
    <div className="hr-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="hr-drawer">
        <div className="hr-dh">
          <div className="f1"><b style={{ fontSize: 15 }}>{initial.id ? 'Qoidani tahrirlash' : 'Yangi qoida'}</b></div>
          <button className="hr-x" onClick={onClose}>×</button>
        </div>
        <div className="hr-db">
          <div className="hr-field"><label>Qoida nomi</label><input className="hr-input" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Masalan: Yangi lidga qo'ng'iroq vazifasi" /></div>
          <div className="hr-grid2">
            <div className="hr-field"><label>Qachon (trigger)</label>
              <select className="hr-select" value={f.trigger} onChange={(e) => set('trigger', e.target.value)}>
                {TRIGGERS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </div>
            {f.trigger === 'stage_enter' && (
              <div className="hr-field"><label>Bosqich</label>
                <select className="hr-select" value={f.stageKey} onChange={(e) => set('stageKey', e.target.value)}>
                  {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Shartlar */}
          <div className="hr-sec">
            <h4>Shartlar (hammasi bajarilsa)</h4>
            {f.conditions.length === 0 && <div className="sub2" style={{ fontSize: 12, marginBottom: 8 }}>Shartsiz — har doim ishlaydi</div>}
            {f.conditions.map((c, i) => (
              <div className="fx ac gap8" key={i} style={{ marginBottom: 6 }}>
                <select className="hr-select" style={{ flex: 1 }} value={c.field} onChange={(e) => setCond(i, 'field', e.target.value)}>
                  {COND_FIELDS.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
                </select>
                <select className="hr-select" style={{ width: 90, flex: 'none' }} value={c.op} onChange={(e) => setCond(i, 'op', e.target.value)}>
                  {COND_OPS.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
                </select>
                {!['empty', 'not_empty'].includes(c.op) && <input className="hr-input" style={{ flex: 1 }} value={c.value || ''} onChange={(e) => setCond(i, 'value', e.target.value)} placeholder="qiymat" />}
                <button className="hr-x" onClick={() => rmCond(i)}>×</button>
              </div>
            ))}
            <button className="btn sm" onClick={addCond} style={{ marginTop: 4 }}><Icon name="plus" size={12} />Shart</button>
          </div>

          {/* Amallar */}
          <div className="hr-sec">
            <h4>Amallar</h4>
            {f.actions.length === 0 && <div className="sub2" style={{ fontSize: 12, marginBottom: 8 }}>Kamida bitta amal qo'shing</div>}
            {f.actions.map((a, i) => (
              <div key={i} style={{ border: '1px solid var(--bd)', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                <div className="fx ac gap8" style={{ marginBottom: 8 }}>
                  <select className="hr-select" style={{ flex: 1 }} value={a.type} onChange={(e) => setAct(i, { type: e.target.value })}>
                    {ACTION_TYPES.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
                  </select>
                  <button className="hr-x" onClick={() => rmAct(i)}>×</button>
                </div>
                <ActionFields a={a} onChange={(patch) => setAct(i, patch)} members={members} />
              </div>
            ))}
            <button className="btn sm" onClick={addAction}><Icon name="plus" size={12} />Amal</button>
          </div>

          <div className="fx ac gap10" style={{ position: 'sticky', bottom: 0, background: 'var(--card)', padding: '14px 0', borderTop: '1px solid var(--bd)' }}>
            <button className="btn primary f1" disabled={saving} onClick={save}>{saving ? 'Saqlanmoqda…' : 'Saqlash'}</button>
            <button className="btn" onClick={onClose}>Yopish</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ActionFields({ a, onChange, members }) {
  if (a.type === 'create_task') return (
    <div className="hr-grid2">
      <div className="hr-field"><label>Vazifa nomi</label><input className="hr-input" value={a.title || ''} onChange={(e) => onChange({ title: e.target.value })} placeholder="Mijozga qo'ng'iroq" /></div>
      <div className="hr-field"><label>Turi</label><select className="hr-select" value={a.taskType || 'call'} onChange={(e) => onChange({ taskType: e.target.value })}>{TASK_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
      <div className="hr-field"><label>Muddat (kun)</label><input className="hr-input" type="number" value={a.dueInDays ?? 1} onChange={(e) => onChange({ dueInDays: Number(e.target.value) })} /></div>
      <div className="hr-field"><label>Kimga</label><select className="hr-select" value={a.assignee || 'lead'} onChange={(e) => onChange({ assignee: e.target.value })}><option value="lead">Lid mas'uli</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
    </div>
  )
  if (a.type === 'add_tag' || a.type === 'remove_tag') return (
    <div className="hr-field"><label>Teg</label><input className="hr-input" value={a.tag || ''} onChange={(e) => onChange({ tag: e.target.value })} placeholder="vip" /></div>
  )
  if (a.type === 'set_assignee') return (
    <div className="hr-field"><label>Mas'ul</label><select className="hr-select" value={a.assignee || 'round_robin'} onChange={(e) => onChange({ assignee: e.target.value })}><option value="round_robin">Navbat bilan (round-robin)</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
  )
  if (a.type === 'set_field') return (
    <div className="hr-grid2">
      <div className="hr-field"><label>Maydon</label><input className="hr-input" value={a.field || ''} onChange={(e) => onChange({ field: e.target.value })} placeholder="hot / source / value yoki maxsus" /></div>
      <div className="hr-field"><label>Qiymat</label><input className="hr-input" value={a.value ?? ''} onChange={(e) => onChange({ value: e.target.value })} /></div>
    </div>
  )
  if (a.type === 'add_note') return (
    <div className="hr-field"><label>Izoh matni</label><input className="hr-input" value={a.text || ''} onChange={(e) => onChange({ text: e.target.value })} /></div>
  )
  if (a.type === 'notify') return (
    <div className="hr-field"><label>Bildirishnoma matni</label><input className="hr-input" value={a.text || ''} onChange={(e) => onChange({ text: e.target.value })} placeholder="Mas'ulга xabar" /></div>
  )
  if (a.type === 'webhook') return (
    <div className="hr-field"><label>Webhook URL</label><input className="hr-input" value={a.url || ''} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://..." /></div>
  )
  return null
}
