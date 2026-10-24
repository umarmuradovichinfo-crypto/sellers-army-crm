import React, { useState, useEffect, useRef } from 'react'
import { dialog } from '../Dialog'
import Icon from '../Icon'
import { Loading, Avatar } from '../ui'
import { crmService } from '../../services/crm.service'

const PAL = ['#3F77DD', '#D9952E', '#9b59b6', '#E6A33C', '#46B17B', '#DE5147', '#0EA5E9', '#2A9AF3']
function hashColor(s) { let h = 0; for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return PAL[Math.abs(h) % PAL.length] }

const TASK_TYPES = [
  { v: 'call', l: 'Qo\'ng\'iroq', e: '📞' },
  { v: 'meeting', l: 'Uchrashuv', e: '🤝' },
  { v: 'message', l: 'Xabar', e: '💬' },
  { v: 'task', l: 'Vazifa', e: '📋' },
]
const TM = Object.fromEntries(TASK_TYPES.map((t) => [t.v, t]))
const RESULT_CHIPS = ['Bog\'lanildi', 'Qiziqish bildirdi', 'Javob bermadi', 'Keyinroq qo\'ng\'iroq', 'Sotuv bo\'ldi', 'Rad etdi']
const MM = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr']

function pad(n) { return String(n).padStart(2, '0') }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function fmtWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d)) return ''
  const today = ymd(new Date()); const ds = ymd(d)
  const tm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const M = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek']
  if (ds === today) return `Bugun ${tm}`
  return `${d.getDate()} ${M[d.getMonth()]} ${tm}`
}

export default function TasksBoard({ onOpenLead, members = [] }) {
  const [view, setView] = useState('list') // list | calendar
  const [filters, setFilters] = useState({ status: 'open', assigneeId: '', type: '' })
  const [tasks, setTasks] = useState(null)
  const [editing, setEditing] = useState(null) // task popup
  const [completing, setCompleting] = useState(null) // result popup
  const [cal, setCal] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })

  const load = () => crmService.listTasks(clean(filters)).then((r) => setTasks(r.tasks || [])).catch(() => setTasks([]))
  useEffect(() => { load() }, [filters])

  // optimistik: lokal holatni darhol yangilaymiz, API fonda
  const patch = (id, p) => setTasks((ts) => ts ? ts.map((t) => t.id === id ? { ...t, ...p } : t) : ts)
  const complete = async (t, result) => {
    setCompleting(null)
    patch(t.id, { done: true, result, doneAt: new Date().toISOString() })
    try { await crmService.updateTask(t.id, { done: true, result }) } catch (e) { await dialog.alert(e.message || 'Xatolik'); load() }
  }
  const reopen = async (t) => { patch(t.id, { done: false }); try { await crmService.updateTask(t.id, { done: false }) } catch (e) { await dialog.alert(e.message); load() } }
  const remove = async (t) => { if (!await dialog.confirm('Vazifa o\'chirilsinmi?')) return; setTasks((ts) => ts ? ts.filter((x) => x.id !== t.id) : ts); try { await crmService.deleteTask(t.id) } catch (e) { await dialog.alert(e.message); load() } }
  // Kanbanda ustunga sudrab tashlaganda — muddatni o'sha guruhga moslash (optimistik)
  const reschedule = async (t, colKey) => {
    if (!t || colKey === 'overdue') return
    if (colKey === 'done') { setCompleting(t); return }
    let due = null
    if (colKey === 'today') due = atTime(0, 18)
    else if (colKey === 'tomorrow') due = atTime(1, 10)
    else if (colKey === 'week') due = weekEndDate()
    else if (colKey === 'next') { due = weekEndDate(); due.setDate(due.getDate() + 7) }
    else if (colKey === 'later') { due = new Date(); due.setMonth(due.getMonth() + 1); due.setHours(18, 0, 0, 0) }
    // 'none' -> due = null
    const iso = due ? due.toISOString() : null
    const body = { dueDate: iso }
    if (t.done) body.done = false
    patch(t.id, { dueDate: iso, ...(t.done ? { done: false } : {}) }) // optimistik ko'chirish
    try { await crmService.updateTask(t.id, body) } catch (e) { await dialog.alert(e.message); load() }
  }

  return (
    <div>
      <div className="amo-toolbar">
        <div className="amo-seg">
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} title="Ro'yxat"><Icon name="checklist" size={14} /></button>
          <button className={view === 'calendar' ? 'on' : ''} onClick={() => setView('calendar')} title="Kalendar"><Icon name="calendar" size={14} /></button>
        </div>
        <select className="hr-select" style={{ width: 'auto' }} value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
          <option value="open">Faol vazifalar</option>
          <option value="overdue">Muddati o'tgan</option>
          <option value="done">Bajarilgan</option>
          <option value="">Hammasi</option>
        </select>
        <select className="hr-select" style={{ width: 'auto' }} value={filters.assigneeId} onChange={(e) => setFilters((p) => ({ ...p, assigneeId: e.target.value }))}>
          <option value="">Barcha mas'ul</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select className="hr-select" style={{ width: 'auto' }} value={filters.type} onChange={(e) => setFilters((p) => ({ ...p, type: e.target.value }))}>
          <option value="">Barcha tur</option>
          {TASK_TYPES.map((t) => <option key={t.v} value={t.v}>{t.e} {t.l}</option>)}
        </select>
        <div className="f1" />
        <button className="btn primary" onClick={() => setEditing({ __new: true, type: 'call', assigneeId: '' })}><Icon name="plus" size={15} />Vazifa</button>
      </div>

      {tasks === null ? <Loading /> : view === 'calendar' ? (
        <CalendarView tasks={tasks} cal={cal} setCal={setCal} onOpen={(t) => setEditing(t)} />
      ) : (
        <ListView tasks={tasks} status={filters.status} onComplete={(t) => setCompleting(t)} onReopen={reopen} onEdit={(t) => setEditing(t)} onRemove={remove} onOpenLead={onOpenLead} onReschedule={reschedule} />
      )}

      {editing && <TaskModal initial={editing} members={members} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
      {completing && <ResultModal task={completing} onClose={() => setCompleting(null)} onDone={(res) => complete(completing, res)} />}
    </div>
  )
}

function clean(o) { const r = {}; Object.entries(o).forEach(([k, v]) => { if (v) r[k] = v }); return r }

// ── Kanban ko'rinishi (amoCRM guruhlari gorizontal ustunlar) ──
function ListView({ tasks, status, onComplete, onReopen, onEdit, onRemove, onOpenLead, onReschedule }) {
  const [dragOver, setDragOver] = useState(null)
  const today = ymd(new Date())
  const tom = ymd(new Date(Date.now() + 864e5))
  const now = new Date()
  const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + (7 - (weekEnd.getDay() || 7)))
  const nextWeekEnd = new Date(weekEnd); nextWeekEnd.setDate(nextWeekEnd.getDate() + 7)
  const g = { overdue: [], today: [], tomorrow: [], week: [], next: [], later: [], none: [], done: [] }
  for (const t of tasks) {
    if (t.done) { g.done.push(t); continue }
    if (!t.dueDate) { g.none.push(t); continue }
    const d = new Date(t.dueDate); const ds = ymd(d)
    if (ds < today || (ds === today && d < now)) g.overdue.push(t)
    else if (ds === today) g.today.push(t)
    else if (ds === tom) g.tomorrow.push(t)
    else if (d <= weekEnd) g.week.push(t)
    else if (d <= nextWeekEnd) g.next.push(t)
    else g.later.push(t)
  }
  let cols = [
    { k: 'overdue', t: 'Muddati o\'tgan', c: '#DE5147', items: g.overdue },
    { k: 'today', t: 'Bugun', c: '#E6A33C', items: g.today },
    { k: 'tomorrow', t: 'Ertaga', c: '#3F77DD', items: g.tomorrow },
    { k: 'week', t: 'Shu hafta', c: '#0EA5E9', items: g.week },
    { k: 'next', t: 'Keyingi hafta', c: '#9b59b6', items: g.next },
    { k: 'later', t: 'Keyinroq', c: '#8B8E84', items: g.later },
    { k: 'none', t: 'Sanasiz', c: '#8B8E84', items: g.none },
  ]
  if (status === 'done') cols = [{ k: 'done', t: 'Bajarilgan', c: '#46B17B', items: g.done }]
  else if (g.done.length) cols.push({ k: 'done', t: 'Bajarilgan', c: '#46B17B', items: g.done })

  if (!tasks.length) return <Empty />
  return (
    <div className="kanban">
      {cols.map((col) => (
        <div className={`kcol ${dragOver === col.k ? 'amo-drop' : ''}`} key={col.k}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOver !== col.k) setDragOver(col.k) }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver((p) => (p === col.k ? null : p)) }}
          onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData('text/plain'); const t = tasks.find((x) => x.id === id); if (t) onReschedule(t, col.k) }}>
          <div className="kcolhead" style={{ background: col.c }}>
            <div className="fx ac gap8"><b className="kcoltitle">{col.t}</b><span className="kcolcnt">{col.items.length}</span></div>
          </div>
          <div className="kcards">
            {col.items.map((t) => <TaskCard key={t.id} t={t} onComplete={onComplete} onReopen={onReopen} onEdit={onEdit} onRemove={onRemove} onOpenLead={onOpenLead} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

function Empty() { return <div className="card" style={{ textAlign: 'center', color: 'var(--mut)' }}>Vazifa yo'q</div> }

// Lid kartasi uslubidagi vazifa kartasi — bosganda lid ochiladi
function TaskCard({ t, onComplete, onReopen, onEdit, onRemove, onOpenLead }) {
  const overdue = !t.done && t.dueDate && new Date(t.dueDate) < new Date()
  const stop = (e) => e.stopPropagation()
  const dragged = useRef(false)
  return (
    <div className="kcard" draggable
      onDragStart={(e) => { dragged.current = true; e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move' }}
      onDragEnd={() => { setTimeout(() => { dragged.current = false }, 30) }}
      onClick={() => { if (dragged.current) return; t.leadId && onOpenLead(t.leadId) }} style={{ cursor: 'pointer' }}>
      <div className="fx jb" style={{ gap: 6 }}>
        <b className="kcardname" style={{ textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--mut)' : undefined }}>{(TM[t.type] || TM.task).e} {t.title}</b>
        <span onClick={stop}><input type="checkbox" checked={!!t.done} onChange={() => t.done ? onReopen && onReopen(t) : onComplete(t)} style={{ width: 16, height: 16 }} /></span>
      </div>
      {t.leadName && <div className="sub2" style={{ fontSize: 12, marginTop: 3, color: 'var(--amo-blue,#2A9AF3)', fontWeight: 600 }}>{t.leadName}</div>}
      {t.done && t.result && <div className="sub2" style={{ fontSize: 11.5, marginTop: 3 }}>✅ {t.result}</div>}
      <div className="fx jb ac" style={{ marginTop: 8 }}>
        <Avatar ini={(t.assigneeName || '?').slice(0, 1).toUpperCase()} color={hashColor(t.assigneeName)} size={22} />
        <span className="fx ac gap8">
          {t.dueDate && <span className="kcardtask" style={{ color: overdue ? '#DE5147' : 'var(--amo-mut,#8a8a8a)', fontWeight: overdue ? 700 : 400 }}>{fmtWhen(t.dueDate)}</span>}
          {!t.done && <button className="kcolbtn" style={{ color: 'var(--amo-mut,#8a8a8a)' }} onClick={(e) => { stop(e); onEdit(t) }}><Icon name="edit" size={12} /></button>}
          <button className="kcolbtn" style={{ color: 'var(--amo-mut,#8a8a8a)' }} onClick={(e) => { stop(e); onRemove(t) }}>×</button>
        </span>
      </div>
    </div>
  )
}

// ── Kalendar (oy) ──
function CalendarView({ tasks, cal, setCal, onOpen }) {
  const first = new Date(cal.y, cal.m, 1)
  const startDow = (first.getDay() || 7) - 1 // Mon=0
  const days = new Date(cal.y, cal.m + 1, 0).getDate()
  const byDay = {}
  for (const t of tasks) { if (!t.dueDate) continue; const k = ymd(new Date(t.dueDate)); (byDay[k] ||= []).push(t) }
  const today = ymd(new Date())
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(d)
  const prev = () => setCal((c) => { const m = c.m - 1; return m < 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m } })
  const next = () => setCal((c) => { const m = c.m + 1; return m > 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m } })
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="fx jb ac" style={{ marginBottom: 12 }}>
        <button className="btn sm" onClick={prev}>‹</button>
        <b style={{ fontSize: 15 }}>{MM[cal.m]} {cal.y}</b>
        <button className="btn sm" onClick={next}>›</button>
      </div>
      <div className="amo-cal-head">{['Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sha', 'Ya'].map((d) => <div key={d}>{d}</div>)}</div>
      <div className="amo-cal-grid">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="amo-cal-cell empty" />
          const k = `${cal.y}-${pad(cal.m + 1)}-${pad(d)}`
          const list = byDay[k] || []
          return (
            <div key={i} className={`amo-cal-cell ${k === today ? 'today' : ''}`}>
              <div className="amo-cal-d">{d}</div>
              {list.slice(0, 4).map((t) => (
                <div key={t.id} className={`amo-cal-task ${t.done ? 'done' : ''}`} onClick={() => onOpen(t)} title={t.title}>
                  {(TM[t.type] || TM.task).e} {t.title}
                </div>
              ))}
              {list.length > 4 && <div className="sub2" style={{ fontSize: 10 }}>+{list.length - 4}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Vazifa oynasi (yaratish/tahrirlash) — amoCRM ─-
export function TaskModal({ initial, members, onClose, onSaved }) {
  const isNew = !!initial.__new
  const [title, setTitle] = useState(initial.title || '')
  const [type, setType] = useState(initial.type || 'call')
  const [due, setDue] = useState(initial.dueDate ? toLocal(initial.dueDate) : defaultDue())
  const [assigneeId, setAssigneeId] = useState(initial.assigneeId || '')
  const [leadId, setLeadId] = useState(initial.leadId || '')
  const [leadName, setLeadName] = useState(initial.leadName || '')
  const [leadQ, setLeadQ] = useState('')
  const [leadRes, setLeadRes] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isNew || leadId) return
    const t = setTimeout(() => { if (leadQ.trim()) crmService.listLeads({ search: leadQ.trim() }).then((r) => setLeadRes((r.leads || []).slice(0, 6))).catch(() => {}) }, 250)
    return () => clearTimeout(t)
  }, [leadQ])

  const preset = (fn) => setDue(toLocal(fn().toISOString()))
  const save = async () => {
    if (!title.trim()) { await dialog.alert('Vazifa matnini kiriting'); return }
    if (isNew && !leadId) { await dialog.alert('Lidni tanlang'); return }
    setSaving(true)
    const payload = { title: title.trim(), type, dueDate: due ? new Date(due).toISOString() : undefined, assigneeId: assigneeId || undefined }
    try {
      if (isNew) await crmService.createTask(leadId, payload)
      else await crmService.updateTask(initial.id, payload)
      onSaved()
    } catch (e) { await dialog.alert(e.message || 'Saqlanmadi'); setSaving(false) }
  }

  return (
    <div className="hr-overlay amo-cardov" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="hr-drawer" style={{ maxWidth: 460, height: 'auto', maxHeight: '90vh', borderRadius: 10 }}>
        <div className="hr-dh"><div className="f1"><b style={{ fontSize: 15 }}>{isNew ? 'Yangi vazifa' : 'Vazifani tahrirlash'}</b></div><button className="hr-x" onClick={onClose}>×</button></div>
        <div className="hr-db">
          <div className="hr-field"><label>Vazifa matni</label><input className="hr-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mijozga qo'ng'iroq qilish" /></div>

          {isNew && (
            <div className="hr-field"><label>Lid</label>
              {leadId ? (
                <div className="fx ac gap8"><span className="tag">{leadName || 'tanlandi'}</span><button className="btn sm" onClick={() => { setLeadId(''); setLeadName('') }}>O'zgartirish</button></div>
              ) : (
                <>
                  <input className="hr-input" value={leadQ} onChange={(e) => setLeadQ(e.target.value)} placeholder="Lid qidirish — ism/telefon" />
                  {leadRes.length > 0 && (
                    <div style={{ border: '1px solid var(--bd)', borderRadius: 8, marginTop: 4 }}>
                      {leadRes.map((l) => <div key={l.id} style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid var(--bd2)' }} onClick={() => { setLeadId(l.id); setLeadName(l.n); setLeadRes([]) }}>{l.n}{l.phone ? ` · ${l.phone}` : ''}</div>)}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="hr-field"><label>Muddat</label>
            <input className="hr-input" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
            <div className="fx ac gap8" style={{ flexWrap: 'wrap', marginTop: 8 }}>
              <button className="btn sm" onClick={() => preset(() => atTime(0, 18))}>Bugun</button>
              <button className="btn sm" onClick={() => preset(() => atTime(1, 10))}>Ertaga</button>
              <button className="btn sm" onClick={() => preset(() => new Date(Date.now() + 36e5))}>+1 soat</button>
              <button className="btn sm" onClick={() => preset(() => weekEndDate())}>Hafta oxiri</button>
              <button className="btn sm" onClick={() => preset(() => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d })}>+1 oy</button>
            </div>
          </div>

          <div className="hr-grid2">
            <div className="hr-field"><label>Tur</label>
              <select className="hr-select" value={type} onChange={(e) => setType(e.target.value)}>{TASK_TYPES.map((t) => <option key={t.v} value={t.v}>{t.e} {t.l}</option>)}</select>
            </div>
            <div className="hr-field"><label>Mas'ul</label>
              <select className="hr-select" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}><option value="">— lid mas'uli —</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            </div>
          </div>

          <div className="fx ac gap10" style={{ paddingTop: 8 }}>
            <button className="btn primary f1" disabled={saving} onClick={save}>{saving ? 'Saqlanmoqda…' : 'Saqlash'}</button>
            <button className="btn" onClick={onClose}>Yopish</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Natija bilan yakunlash (natijasiz yopib bo'lmaydi — amoCRM best-practice) ──
export function ResultModal({ task, onClose, onDone }) {
  const [res, setRes] = useState('')
  const ok = res.trim().length > 0
  return (
    <div className="hr-overlay amo-cardov" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="hr-drawer" style={{ maxWidth: 420, height: 'auto', borderRadius: 10 }}>
        <div className="hr-dh"><div className="f1"><b style={{ fontSize: 15 }}>Vazifa natijasi</b><div className="sub2" style={{ fontSize: 12 }}>{task.title}</div></div><button className="hr-x" onClick={onClose}>×</button></div>
        <div className="hr-db">
          <div className="fx ac gap8" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
            {RESULT_CHIPS.map((c) => <button key={c} className={`btn sm ${res === c ? 'primary' : ''}`} onClick={() => setRes(c)}>{c}</button>)}
          </div>
          <textarea className="hr-input" rows={3} autoFocus value={res} onChange={(e) => setRes(e.target.value)} placeholder="Natijani yozing… (majburiy)"
            style={!ok ? { borderColor: '#DE5147' } : undefined} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && ok) onDone(res.trim()) }} />
          {!ok && <div style={{ fontSize: 11.5, color: '#DE5147', marginTop: 4 }}>Natijasiz vazifani yopib bo'lmaydi</div>}
          <div className="fx ac gap10" style={{ paddingTop: 12 }}>
            <button className="btn primary f1" disabled={!ok} onClick={() => ok && onDone(res.trim())}>Bajarildi</button>
            <button className="btn" onClick={onClose}>Bekor</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// helpers
function toLocal(iso) { const d = new Date(iso); if (isNaN(d)) return ''; return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` }
function atTime(addDays, hour) { const d = new Date(); d.setDate(d.getDate() + addDays); d.setHours(hour, 0, 0, 0); return d }
function defaultDue() { return toLocal(atTime(0, 18).toISOString()) }
function weekEndDate() { const d = new Date(); d.setDate(d.getDate() + (7 - (d.getDay() || 7))); d.setHours(18, 0, 0, 0); return d }
