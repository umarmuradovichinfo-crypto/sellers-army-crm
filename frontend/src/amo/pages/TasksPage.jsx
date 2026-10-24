// amoCRM "Задачи" — /todo/line, /todo/list, /todo/calendar/{day,week,month}.
// Yuqori panel → (line: ustunlar | list: jadval | calendar: kun/hafta/oy to'ri). Kartalar kunlar orasida drag-and-drop qilinadi.
import React, { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { crmService } from '../../services/crm.service'
import { useApi } from '../../lib/useApi'
import TopBar from '../TopBar'
import { Ico } from '../AmoIcons'
import { dmy, hm } from '../format'
import { useT, usePlural } from '../i18n'
import { AddTaskModal, CompleteModal, TASK_TYPES } from './TasksModals'
import '../i18n/todo.ru'
import '../todo.css'

const MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek']
const WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya']

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const sameDay = (a, b) => a.toDateString() === b.toDateString()
const mondayOf = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7))
const typeLabel = (k) => (TASK_TYPES.find((x) => x.key === k) || TASK_TYPES[2]).label

function viewFromPath(path) {
  if (path.startsWith('/todo/list')) return { mode: 'list' }
  const m = path.match(/^\/todo\/calendar\/(day|week|month)/)
  if (m) return { mode: 'calendar', cal: m[1] }
  return { mode: 'line' }
}

function TopSwitch({ mode, cal }) {
  const navigate = useNavigate()
  const t = useT()
  return (
    <span className="ac-todo-top">
      <div className="ac-top__switch">
        <button className={mode === 'line' ? 'on' : ''} onClick={() => navigate('/todo/line')}><Ico name="pipeline" /></button>
        <button className={mode === 'list' ? 'on' : ''} onClick={() => navigate('/todo/list')}><Ico name="burger" /></button>
      </div>
      <span className="ac-todo-modes">
        {[['day', 'Kun'], ['week', 'Hafta'], ['month', 'Oy']].map(([k, l]) => (
          <button key={k} className={mode === 'calendar' && cal === k ? 'on' : ''} onClick={() => navigate(`/todo/calendar/${k}`)}>{t(l)}</button>
        ))}
      </span>
    </span>
  )
}

function TaskCard({ task, dragging, onDragStart, onDragEnd, onComplete, onDelete, onOpen, compact }) {
  const t = useT()
  const due = task.dueDate ? new Date(task.dueDate) : null
  const overdue = !task.done && due && due < new Date()
  return (
    <div
      className={`ac-todo-card ${compact ? 'compact' : ''} ${dragging ? 'dragging' : ''} ${task.done ? 'done' : ''}`}
      draggable={!task.done}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', task.id); e.dataTransfer.effectAllowed = 'move'; onDragStart(task) }}
      onDragEnd={onDragEnd}
    >
      <div className="ac-todo-card__head">
        <input type="checkbox" className="ac-check" checked={!!task.done} disabled={task.done} onChange={() => onComplete(task)} />
        <span className={`ac-todo-card__time ${overdue ? 'overdue' : ''}`}>{due ? hm(due) : '—'}</span>
        <span className="ac-todo-card__type">{t(typeLabel(task.type))}</span>
        <button className="ac-todo-card__del" title={t("O'chirish")} onClick={() => onDelete(task)}><Ico name="trash" size={13} /></button>
      </div>
      {!compact && task.assigneeName && <div className="ac-todo-card__sub">{task.assigneeName}</div>}
      <a className="ac-todo-card__lead" onClick={() => onOpen(task)}>{task.leadName || '—'}</a>
      <div className="ac-todo-card__text">{task.title}</div>
      {task.done && task.result && <div className="ac-todo-card__sub">{task.result}</div>}
    </div>
  )
}

export default function TasksPage({ mode: modeProp, cal: calProp }) {
  const t = useT()
  const plural = usePlural()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const v = viewFromPath(pathname)
  const mode = modeProp || v.mode
  const cal = calProp || v.cal || 'month'

  const { data, error, reload, setData } = useApi(async () => {
    const [tk, mem] = await Promise.all([crmService.listTasks({}), crmService.listMembers()])
    return { tasks: tk.tasks || [], members: mem.members || [] }
  }, [], 'ac-todo-tasks', 60000)

  const [search, setSearch] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [cursor, setCursor] = useState(() => startOfDay(new Date()))
  const [dragTask, setDragTask] = useState(null)
  const [overKey, setOverKey] = useState(null)
  const [adding, setAdding] = useState(null)
  const [completing, setCompleting] = useState(null)
  const [err, setErr] = useState('')
  const fail = (e) => { setErr(e?.message || t('Xatolik yuz berdi')); reload() }

  const today = startOfDay(new Date())
  const tasks = useMemo(() => {
    const s = search.trim().toLowerCase()
    return (data?.tasks || []).filter((x) => (showDone || !x.done) && (!s || `${x.title} ${x.leadName || ''} ${x.assigneeName || ''}`.toLowerCase().includes(s)))
  }, [data, search, showDone])

  const openLead = (task) => navigate(`/leads/detail/${task.leadId}`)
  // Xato bo'lsa CompleteModal ochiq qoladi va xatoni ko'rsatadi (throw qaytariladi)
  const complete = async (task, result) => {
    await crmService.updateTask(task.id, { done: true, ...(result ? { result } : {}) })
    setErr('')
    reload()
  }
  const remove = async (task) => {
    if (!window.confirm(t("Vazifani o'chirishni tasdiqlaysizmi?"))) return
    setData({ ...data, tasks: data.tasks.filter((x) => x.id !== task.id) })
    try { await crmService.deleteTask(task.id); setErr(''); reload() } catch (e) { fail(e) }
  }
  // Vazifani boshqa kunga ko'chirish — vaqt saqlanadi
  const moveTo = async (task, day) => {
    const old = task.dueDate ? new Date(task.dueDate) : null
    if (old && sameDay(old, day)) return // o'sha kunga tashlansa — o'zgarish yo'q
    const nd = startOfDay(day)
    nd.setHours(old ? old.getHours() : 9, old ? old.getMinutes() : 0, 0, 0)
    const iso = nd.toISOString()
    setData({ ...data, tasks: data.tasks.map((x) => (x.id === task.id ? { ...x, dueDate: iso } : x)) })
    try { await crmService.updateTask(task.id, { dueDate: iso }); setErr(''); reload() } catch (e) { fail(e) }
  }
  const dropOn = (e, day, key) => {
    e.preventDefault()
    const task = dragTask
    setDragTask(null); setOverKey(null)
    if (task && day) moveTo(task, day)
  }
  const dropProps = (day, key) => ({
    onDragOver: (e) => { if (dragTask) { e.preventDefault(); if (overKey !== key) setOverKey(key) } },
    onDragLeave: () => setOverKey((k) => (k === key ? null : k)),
    onDrop: (e) => dropOn(e, day, key),
  })
  const card = (task, compact) => (
    <TaskCard key={task.id} task={task} compact={compact} dragging={dragTask?.id === task.id} onDragStart={setDragTask} onDragEnd={() => { setDragTask(null); setOverKey(null) }} onComplete={setCompleting} onDelete={remove} onOpen={openLead} />
  )

  // ── Line ──
  const renderLine = () => {
    const tomorrow = addDays(today, 1)
    const groups = { overdue: [], today: [], tomorrow: [], later: [] }
    for (const x of tasks) {
      const d = x.dueDate ? new Date(x.dueDate) : null
      if (!d) groups.later.push(x)
      else if (d < today) groups.overdue.push(x)
      else if (sameDay(d, today)) groups.today.push(x)
      else if (sameDay(d, tomorrow)) groups.tomorrow.push(x)
      else groups.later.push(x)
    }
    const cols = [
      { key: 'overdue', title: "Muddati o'tgan vazifalar", color: 'red', drop: null },
      { key: 'today', title: 'Bugungi vazifalar', color: 'green', drop: today, always: true },
      { key: 'tomorrow', title: 'Ertangi vazifalar', color: 'grey', drop: tomorrow, always: true },
      { key: 'later', title: 'Keyingi vazifalar', color: 'grey', drop: addDays(today, 2) },
    ].filter((c) => c.always || groups[c.key].length)
    return (
      <div className="ac-todo-line">
        <div className="ac-todo-line__cols">
          {cols.map((c) => (
            <div key={c.key} className={`ac-todo-col ${overKey === c.key && c.drop ? 'drop-target' : ''}`} {...(c.drop ? dropProps(c.drop, c.key) : {})}>
              <div className="ac-todo-col__head">
                <div className="ac-todo-col__title">{t(c.title)}</div>
                <div className="ac-todo-col__count">{plural(groups[c.key].length, 'vazifa')}</div>
                <div className={`ac-todo-col__line ${c.color}`} />
              </div>
              <div className="ac-todo-col__body">{groups[c.key].map((x) => card(x))}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── List ──
  const renderList = () => (
    <div className="ac-table-wrap">
      <table className="ac-table ac-todo-table">
        <thead>
          <tr>
            <th className="chk"><input type="checkbox" className="ac-check" disabled /></th>
            <th>{t('Bajarilish sanasi')}</th>
            <th>{t("Mas'ul")}</th>
            <th>{t("Ob'ekt")}</th>
            <th>{t('Vazifa turi')}</th>
            <th>{t('Vazifa matni')}</th>
          </tr>
        </thead>
        <tbody>
          {tasks.length === 0 && (
            <tr><td colSpan={6} className="ac-todo-empty">{t("Afsuski, tanlangan shartlar bo'yicha vazifalar topilmadi.")} <a onClick={() => { setSearch(''); setShowDone(true) }}>{t("Hammasini ko'rsatish")}</a></td></tr>
          )}
          {tasks.map((x) => {
            const d = x.dueDate ? new Date(x.dueDate) : null
            return (
              <tr key={x.id} className={x.done ? 'ac-todo-row--done' : ''}>
                <td className="chk"><input type="checkbox" className="ac-check" checked={!!x.done} disabled={x.done} onChange={() => setCompleting(x)} /></td>
                <td className={!x.done && d && d < new Date() ? 'ac-todo-overdue' : ''}>{d ? `${dmy(d)} ${hm(d)}` : '—'}</td>
                <td>{x.assigneeName || '—'}</td>
                <td><a className="u" onClick={() => openLead(x)}>{x.leadName || '—'}</a></td>
                <td>{t(typeLabel(x.type))}</td>
                <td>{x.title}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  // ── Calendar ──
  const step = (dir) => {
    const d = new Date(cursor)
    if (cal === 'month') { d.setDate(1); d.setMonth(d.getMonth() + dir) } else d.setDate(d.getDate() + dir * (cal === 'week' ? 7 : 1))
    setCursor(d)
  }
  const byDay = (day) => tasks.filter((x) => x.dueDate && sameDay(new Date(x.dueDate), day)).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
  const dayLabel = (d, withMonth) => (withMonth ? `${d.getDate()} ${t(MONTHS[d.getMonth()])} ${d.getFullYear()}` : String(d.getDate()))

  const renderCalendar = () => {
    let days
    if (cal === 'month') {
      const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
      const start = mondayOf(first)
      const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
      const n = Math.ceil(((mondayOf(last) - start) / 86400000 + 7) / 7) * 7
      days = Array.from({ length: n }, (_, i) => addDays(start, i))
    } else if (cal === 'week') {
      const start = mondayOf(cursor)
      days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
    } else days = [cursor]
    const heads = cal === 'day' ? [WEEKDAYS[(cursor.getDay() + 6) % 7]] : WEEKDAYS
    return (
      <div className={`ac-todo-cal ac-todo-cal--${cal}`}>
        <div className="ac-todo-cal__heads">
          <button className="ac-todo-cal__nav" onClick={() => step(-1)}><Ico name="chevronLeft" size={14} /></button>
          {heads.map((w) => <div key={w}>{t(w)}</div>)}
          <button className="ac-todo-cal__nav" onClick={() => step(1)}><Ico name="chevronRight" size={14} /></button>
        </div>
        <div className="ac-todo-cal__grid" style={{ gridTemplateRows: cal === 'month' ? `repeat(${days.length / 7}, 1fr)` : undefined }}>
          {days.map((d, i) => {
            const key = `d${d.getTime()}`
            const out = cal === 'month' && d.getMonth() !== cursor.getMonth()
            const edge = cal === 'month' && (d.getDate() === 1)
            const list = byDay(d)
            return (
              <div key={key} className={`ac-todo-cell ${sameDay(d, today) ? 'today' : ''} ${out ? 'out' : ''} ${overKey === key ? 'drop-target' : ''}`} {...dropProps(d, key)}>
                {cal !== 'day' && <div className="ac-todo-cell__num">{dayLabel(d, edge || (cal === 'month' && (i === 0 || i === days.length - 1) && out) )}</div>}
                <div className="ac-todo-cell__tasks">{list.map((x) => card(x, cal === 'month'))}</div>
              </div>
            )
          })}
        </div>
        <div className="ac-todo-cal__foot">
          <button className="ac-btn ac-btn--sm" onClick={() => setCursor(startOfDay(new Date()))}>{t('Bugun')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="ac-todo">
      <TopBar
        title={<TopSwitch mode={mode} cal={cal} />}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Filtr"
        count={plural(tasks.length, 'vazifa')}
        menu={[{ label: t(showDone ? 'Bajarilgan vazifalarni yashirish' : "Bajarilgan vazifalarni ko'rsatish"), icon: 'check', onClick: () => setShowDone((x) => !x) }]}
        actions={<button className="ac-btn ac-btn--blue" onClick={() => setAdding({})}><span className="ac-btn__plus">+</span>{t("Vazifa qo'shish")}</button>}
      />
      {err && <div className="ac-todo-banner" onClick={() => setErr('')}>{err}</div>}
      {!data && error && <div className="ac-todo-banner">{error?.message || t('Xatolik yuz berdi')}</div>}
      {!data && !error && <div className="ac-todo-loading"><span className="ac-spinner" /></div>}
      {mode === 'list' ? renderList() : mode === 'calendar' ? renderCalendar() : renderLine()}
      {adding && <AddTaskModal members={data?.members} defaultDate={adding.date} onClose={() => setAdding(null)} onCreated={reload} />}
      {completing && <CompleteModal task={completing} onClose={() => setCompleting(null)} onDone={complete} />}
    </div>
  )
}
