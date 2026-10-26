// amoCRM "Рабочий стол" — /dashboard. Fon + voronka kartalari + vidjetlar to'ri + voqealar paneli.
import { useSearchParams } from 'react-router-dom'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { DonoDashBox } from '../Dono'
import { crmService } from '../../services/crm.service'
import { settingsService } from '../../services/settings.service'
import { useAuth } from '../../context/AuthContext'
import { useApi } from '../../lib/useApi'
import { Ico } from '../AmoIcons'
import { useOutside } from '../TopBar'
import { money, feedDate } from '../format'
import { useT, usePlural } from '../i18n'
import '../i18n/dashboard.ru.js'
import { DEFAULT_LAYOUT, SYSTEM_WIDGETS, FilterWidget, WidgetModal, loadLayout, saveLayout, sizeOf } from '../dashboardWidgets'
import '../dashboard.css'

const BG_KEY = 'ac-dash-bg'
const BGS = ['sea', 'forest', 'dusk', 'graphite', 'custom']
const BG_NAMES = { sea: 'Dengiz', forest: "O'rmon", dusk: 'Shom', graphite: 'Grafit', custom: 'Mening rasmim' }
const BG_IMG_KEY = 'ac-dash-bg-img'
const PERIODS = [['today', 'Bugun'], ['yesterday', 'Kecha'], ['week', 'Hafta'], ['month', 'Oy']]
const PERIOD_WORD = { today: 'bugun uchun', yesterday: 'kecha uchun', week: 'hafta uchun', month: 'oy uchun', range: 'davr uchun', all: 'hammasi' }

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function rangeOf(preset, custom) {
  const now = new Date()
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (preset === 'today') return { from: iso(d0), to: iso(d0) }
  if (preset === 'yesterday') { const y = new Date(d0); y.setDate(y.getDate() - 1); return { from: iso(y), to: iso(y) } }
  if (preset === 'week') {
    const s = new Date(d0); s.setDate(s.getDate() - ((s.getDay() + 6) % 7))
    const e = new Date(s); e.setDate(e.getDate() + 6)
    return { from: iso(s), to: iso(e) }
  }
  if (preset === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }
  if (preset === 'range') {
    let from = custom.from || undefined, to = custom.to || undefined
    if (from && to && from > to) [from, to] = [to, from] // teskari kiritilgan davr
    return { from, to }
  }
  return {}
}

const inRange = (dt, r) => {
  if (!dt) return false
  if (!r.from && !r.to) return true
  const d = iso(new Date(dt))
  return (!r.from || d >= r.from) && (!r.to || d <= r.to)
}

function EventsPanel({ open, onClose }) {
  const t = useT()
  const ref = useRef(null)
  useOutside(ref, onClose, open)
  const { data, loading } = useApi(() => (open ? crmService.analyticsEvents({ limit: 60 }) : Promise.resolve(null)), [open])
  const items = data?.items || []
  return (
    <aside ref={ref} className={`ac-dash-events ${open ? 'open' : ''}`}>
      <div className="ac-dash-events__head">
        <span>{t('Voqealar')}</span>
        <button className="ac-dash-events__x" onClick={onClose}><Ico name="close" size={14} /></button>
      </div>
      <div className="ac-dash-events__list">
        {loading && !data && <div className="ac-spinner" style={{ margin: '30px auto' }} />}
        {data && items.length === 0 && <div className="ac-dash-events__empty">{t("Voqealar yo'q")}</div>}
        {items.map((e) => (
          <div className="ac-dash-ev" key={e.id}>
            <div className="ac-dash-ev__date">{feedDate(e.createdAt, t)}</div>
            <div className="ac-dash-ev__text">{e.text || e.type}</div>
            <div className="ac-dash-ev__sub">{[e.actorName, e.leadName].filter(Boolean).join(' · ')}</div>
          </div>
        ))}
      </div>
    </aside>
  )
}

// amoCRM "Источники сделок": ochiq konsentrik halqalar (270°), tepada o'ngda rangli legenda
const SRC_COLORS = ['#c8a2e8', '#3d8fe0', '#2f7fd0', '#4a9be8']
function SourceRings({ items }) {
  const cx = 150, cy = 150
  const max = Math.max(1, ...items.map((i) => i.count))
  const arc = (r, frac) => {
    const start = -Math.PI / 2
    const end = start - Math.max(0.04, frac) * 1.5 * Math.PI
    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start)
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end)
    const large = Math.max(0.04, frac) * 1.5 > 1 ? 1 : 0
    return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 0 ${x2.toFixed(1)} ${y2.toFixed(1)}`
  }
  return (
    <svg className="ac-dash-rings" viewBox="0 0 300 300">
      {items.slice(0, 4).map((it, i) => (
        <path key={i} d={arc(118 - i * 18, it.count / max)} fill="none" stroke={SRC_COLORS[i]} strokeWidth="9" strokeLinecap="round" />
      ))}
    </svg>
  )
}

// Javob vaqti: "45 с", "12 мин", "3 ч 5 мин"
function fmtWait(sec, t) {
  if (!sec) return '0'
  if (sec < 60) return `${sec} ${t('son.')}`
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} ${t('daq.')}`
  return `${Math.floor(m / 60)} ${t('soat')} ${m % 60} ${t('daq.')}`
}

// amoCRM «Мои ▾»: qidiruvli ro'yxat — bo'limlar (rangli sarlavha, «Butun bo'lim») va ulardagi xodimlar
const GROUP_COLORS = ['#cfd8e3', '#f7c6c6', '#c5dcf7', '#d6f0c6', '#f2e0b8', '#e2d1f5']
function ScopePicker({ scope, setScope, members, groups }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)
  useOutside(ref, () => setOpen(false), open)
  const pick = (v) => { setScope(v); setOpen(false); setQ('') }
  const label = scope.startsWith('u:') ? members.find((m) => m.id === scope.slice(2))?.name
    : scope.startsWith('g:') ? groups.find((g) => g.id === scope.slice(2))?.name : null
  const s = q.trim().toLowerCase()
  const sections = [...groups.map((g) => ({ ...g, users: members.filter((m) => m.groupId === g.id) })), { id: '', name: t('Guruhsiz'), users: members.filter((m) => !m.groupId || !groups.some((g) => g.id === m.groupId)) }]
    .map((g) => ({ ...g, users: g.users.filter((u) => !s || u.name.toLowerCase().includes(s) || g.name.toLowerCase().includes(s)) }))
    .filter((g) => g.users.length)
  const on = scope !== 'all'
  return (
    <span ref={ref} className="ac-dash-scope">
      <button className={on ? 'on' : ''} onClick={() => (scope === 'all' ? pick('my') : setOpen((v) => !v))}>
        {label || t('Meniki')} <span className="ac-dash-scope__chev" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}><Ico name="chevronDown" size={10} /></span>
      </button>
      {open && (
        <div className="ac-dash-scope__menu">
          <input className="ac-dash-scope__q" autoFocus placeholder={t('Qidirish')} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="ac-dash-scope__list">
            <div className={`ac-dash-scope__user ${scope === 'my' || scope === 'mine' ? 'sel' : ''}`} onClick={() => pick('my')}>{t('Meniki')}</div>
            {sections.map((g, i) => (
              <React.Fragment key={g.id || 'none'}>
                <div className="ac-dash-scope__group" style={{ background: GROUP_COLORS[i % GROUP_COLORS.length] }}>
                  <span>{g.name}</span>
                  {g.id && <button onClick={() => pick(`g:${g.id}`)}>{t("Butun bo'lim")}</button>}
                </div>
                {g.users.map((u) => <div key={u.id} className={`ac-dash-scope__user ${scope === `u:${u.id}` ? 'sel' : ''}`} onClick={() => pick(`u:${u.id}`)}>{u.name}</div>)}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </span>
  )
}

export default function DashboardPage() {
  const t = useT()
  const plural = usePlural()
  const { user, can } = useAuth()
  // amoCRM: filtr holati manzilda (?sel=all&period=month&pipeline_id=…) — havola bilan ulashish, orqaga qaytish
  const [sp, setSp] = useSearchParams()
  const [preset, setPreset] = useState(() => (['today', 'yesterday', 'week', 'month', 'range'].includes(sp.get('period')) ? sp.get('period') : 'month'))
  const [custom, setCustom] = useState(() => ({ from: sp.get('from') || '', to: sp.get('to') || '' }))
  const [dateOpen, setDateOpen] = useState(false)
  const [scope, setScope] = useState(() => sp.get('sel') || 'all')
  const [pipelineId, setPipelineId] = useState(() => sp.get('pipeline_id') || '')
  useEffect(() => {
    const next = new URLSearchParams()
    next.set('sel', scope); next.set('period', preset)
    if (preset === 'range') { if (custom.from) next.set('from', custom.from); if (custom.to) next.set('to', custom.to) }
    if (pipelineId) next.set('pipeline_id', pipelineId)
    if (next.toString() !== sp.toString()) setSp(next, { replace: true })
  }, [scope, preset, custom.from, custom.to, pipelineId]) // eslint-disable-line
  const [eventsOpen, setEventsOpen] = useState(false)
  const dateRef = useRef(null)
  useOutside(dateRef, () => setDateOpen(false), dateOpen)

  // amoCRM: joylashuv serverda (vidjetlar, mavzu, shrift, fon); «Настроить» — tahrirlash rejimi (draft)
  const [layout, setLayout] = useState(null)
  const [draft, setDraft] = useState(null)
  const [applyAll, setApplyAll] = useState(false)
  const [modal, setModal] = useState(null) // { index, widget }
  const [catalog, setCatalog] = useState(false)
  const [dragId, setDragId] = useState(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { loadLayout().then(setLayout) }, [])
  const L = draft || layout || DEFAULT_LAYOUT
  const editing = !!draft
  const patch = (p) => setDraft((d) => ({ ...d, ...p }))
  const startEdit = () => { setDraft(JSON.parse(JSON.stringify(layout || DEFAULT_LAYOUT))); setApplyAll(false) }
  const cancelEdit = () => { setDraft(null); setCatalog(false) }
  const saveEdit = async () => {
    setSaving(true)
    try { await saveLayout(draft, applyAll); setLayout(draft); setDraft(null); setCatalog(false) } catch (e) { window.alert(e?.message || t('Xatolik yuz berdi')) } finally { setSaving(false) }
  }
  const removeWidget = (id) => {
    const w = draft.widgets.find((x) => x.id === id)
    patch({ widgets: draft.widgets.filter((x) => x.id !== id), library: w?.type === 'filter' ? [...(draft.library || []), w] : draft.library })
  }
  const addWidget = (w) => {
    setCatalog(false)
    patch({ widgets: [...draft.widgets, w.type === 'filter' ? w : { id: w.type, type: w.type }], library: (draft.library || []).filter((x) => x.id !== w.id) })
  }
  const moveWidget = (fromId, toId) => {
    if (!fromId || fromId === toId) return
    const list = [...draft.widgets]
    const a = list.findIndex((x) => x.id === fromId)
    const [w] = list.splice(a, 1)
    const b = list.findIndex((x) => x.id === toId)
    list.splice(b < 0 ? list.length : b, 0, w)
    patch({ widgets: list })
  }

  // Fon: tayyor sahnalar yoki o'z rasmingiz (rasm brauzerda, tanlov joylashuvda)
  const bg = L.bg || (() => { try { return localStorage.getItem(BG_KEY) || 'sea' } catch { return 'sea' } })()
  const [bgImg, setBgImg] = useState(() => { try { return localStorage.getItem(BG_IMG_KEY) || '' } catch { return '' } })
  const fileRef = useRef(null)
  const uploadBg = (file) => {
    if (!file) return
    const img = new Image()
    img.onload = () => {
      // localStorage chegarasi uchun 1920px gacha kichraytirib JPEG qilamiz
      const k = Math.min(1, 1920 / img.width)
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      const url = c.toDataURL('image/jpeg', 0.82)
      try { localStorage.setItem(BG_IMG_KEY, url) } catch { /* juda katta */ }
      setBgImg(url); patch({ bg: 'custom' })
      URL.revokeObjectURL(img.src)
    }
    img.src = URL.createObjectURL(file)
  }
  const range = useMemo(() => rangeOf(preset, custom), [preset, custom])

  const { data: general } = useApi(() => settingsService.getGeneral(), [])
  const accountName = general?.general?.accountName || 'Sellers Army'

  const { data: pipe, loading } = useApi(() => crmService.getPipeline(pipelineId || undefined), [pipelineId])
  const { data: memberData } = useApi(() => crmService.listMembers(), [])
  // amoCRM «Все / Мои ▾»: my — o'zim, u:<id> — xodim, g:<id> — butun bo'lim (guruh)
  const selIds = useMemo(() => {
    if (scope === 'my' || scope === 'mine') return user?.id ? [user.id] : []
    if (scope.startsWith('u:')) return [scope.slice(2)]
    if (scope.startsWith('g:')) return (memberData?.members || []).filter((m) => m.groupId === scope.slice(2)).map((m) => m.id)
    return null
  }, [scope, user?.id, memberData])
  const mineId = selIds ? selIds.join(',') || '__none__' : undefined
  const { data: an } = useApi(() => crmService.analytics({ ...range, pipelineId: pipelineId || 'main', userIds: mineId }), [range.from, range.to, pipelineId, mineId])
  const { data: callsAll } = useApi(() => crmService.analyticsCalls(range), [range.from, range.to])
  const calls = useMemo(() => {
    if (!selIds || !callsAll) return callsAll
    const rs = (callsAll.byEmployee || []).filter((e) => selIds.includes(e.id))
    if (!rs.length) return { total: 0, inbound: 0, outbound: 0, missed: 0, avgDuration: 0 }
    const sum = (k) => rs.reduce((a, r) => a + (Number(r[k]) || 0), 0)
    const total = sum('count')
    return { total, inbound: sum('inCount'), outbound: sum('outCount'), missed: sum('missed'), avgDuration: (() => { const ans = sum('answered'); return ans ? Math.round(rs.reduce((a, r) => a + (r.avgDur || 0) * (r.answered || 0), 0) / ans) : 0 })() }
  }, [callsAll, selIds])
  const { data: chatSt } = useApi(() => crmService.chatStats(range).catch(() => null), [range.from, range.to])
  const { data: taskData } = useApi(() => crmService.listTasks({ status: 'open' }), [])
  const hasForecast = L.widgets.some((w) => w.type === 'forecast')
  const { data: flowData } = useApi(() => (hasForecast ? crmService.analyticsFlow({ pipelineId: pipelineId || 'main' }).catch(() => null) : Promise.resolve(null)), [hasForecast, pipelineId])

  const pipelines = [{ id: '', name: t('Asosiy voronka') }, ...((pipe?.pipelines || []).map((p) => ({ id: p.id, name: p.name })))]
  const inSel = (id) => !selIds || selIds.includes(id)

  const stages = (pipe?.stages || []).map((s) => ({
    ...s,
    leads: (s.leads || []).filter((l) => inSel(l.assigneeId)),
  }))
  const sumOf = (ls) => ls.reduce((a, l) => a + (Number(l.value) || 0), 0)
  const fresh = (s) => s.leads.filter((l) => inRange(l.createdAt, range))
  const openStages = stages.filter((s) => s.kind === 'open' || (!s.kind))
  const wonStages = stages.filter((s) => s.kind === 'won')
  const lostStages = stages.filter((s) => s.kind === 'lost')
  const allLeads = stages.flatMap((s) => s.leads)
  const newLeads = allLeads.filter((l) => inRange(l.createdAt, range))
  const lostLeads = lostStages.flatMap(fresh)
  const wonLeads = wonStages.flatMap(fresh)

  // Vazifalar
  const tasks = (taskData?.tasks || []).filter((x) => !x.done && inSel(x.assigneeId))
  const today = iso(new Date())
  const dueDay = (x) => (x.dueDate ? iso(new Date(x.dueDate)) : null)
  const overdue = tasks.filter((x) => dueDay(x) && dueDay(x) < today)
  const todays = tasks.filter((x) => dueDay(x) === today)

  const totalAll = allLeads.length
  const monthRange = rangeOf('month')
  const monthNew = allLeads.filter((l) => inRange(l.createdAt, monthRange))
  const pipeName = pipelines.find((p) => p.id === pipelineId)?.name || t('Asosiy voronka')
  const sources = (an?.bySource || []).slice(0, 4)
  const memberCount = (memberData?.members || []).length
  const periodWord = PERIOD_WORD[preset] || 'oy uchun'

  const periodBtn = (k, label) => (
    <button key={k} className={preset === k ? 'on' : ''} onClick={() => { setPreset(k); setDateOpen(false) }}>{t(label)}</button>
  )
  const stageRows = (list, total, withDelta) => (
    <div className="ac-dash-chart">
      {list.map((s) => (
        <div className="ac-dash-chart__item" key={s.id}>
          <div className="ac-dash-chart__row">
            <span className="ac-dash-status" style={{ background: s.color || '#d5d8db' }}>{s.name}</span>
            <span className="ac-dash-chart__count">{s.n}</span>
            <span className="ac-dash-chart__sum">({money(s.sum)})</span>
            {withDelta && <span className={`ac-dash-chart__delta ${s.d > 0 ? 'pos' : ''}`}>{s.d > 0 ? `+${s.d}` : s.d}</span>}
          </div>
          <div className="ac-dash-chart__track"><i style={{ width: `${total ? Math.max(s.n ? 1.5 : 0, (s.n / total) * 100) : 0}%` }} /></div>
        </div>
      ))}
    </div>
  )
  const allRows = stages.map((s) => ({ id: s.id, name: s.name, color: s.color, n: s.leads.length, sum: sumOf(s.leads), d: fresh(s).length })).sort((a, b) => b.n - a.n)
  const monthRows = stages.map((s) => { const f = s.leads.filter((l) => inRange(l.createdAt, monthRange)); return { id: s.id, name: s.name, color: s.color, n: f.length, sum: sumOf(f) } }).filter((r) => r.n).sort((a, b) => b.n - a.n)
  const bgStyle = bg === 'custom' && bgImg ? { backgroundImage: `url(${bgImg})` } : undefined
  const small = (n, cap, cls = '') => <><div className={`ac-dash-big ac-dash-big--sm ${cls}`}>{n}</div>{cap}</>

  // Tizim vidjetlari mazmuni
  const content = (w) => {
    switch (w.type) {
      case 'total': return (<>
        <div className="ac-dash-tile__top">
          <div><div className="ac-dash-big">{totalAll}</div><div className="ac-dash-sum">{money(sumOf(allLeads))}</div></div>
          <div className="ac-dash-delta"><b>+{newLeads.length}</b><span>{t(periodWord)}</span></div>
        </div>
        <hr className="ac-dash-hr" />{stageRows(allRows, totalAll, true)}</>)
      case 'month': return (<><div className="ac-dash-tile__top"><div className="ac-dash-big">{monthNew.length}</div></div><hr className="ac-dash-hr" />{stageRows(monthRows, monthNew.length, false)}</>)
      case 'sources': return sources.length === 0 ? <div className="ac-dash-empty">{t("Ma'lumot yo'q")}</div> : (
        <div className="ac-dash-src">
          <SourceRings items={sources} />
          <ul className="ac-dash-legend">{sources.map((s, i) => <li key={s.source + i} style={{ color: SRC_COLORS[i] }} title={`${s.count}`}>{s.source === '—' ? t('Boshqa') : s.source}</li>)}</ul>
        </div>)
      case 'forecast': { const f = flowData?.forecast; return small(f ? f.d30.count : 0, <div className="ac-dash-cap">{money(f?.d30.sum || 0)} · {t('30 kun')}</div>) }
      case 'overdue': return small(overdue.length, <div className="ac-dash-cap">{t('Hammasi')}: {tasks.length}</div>)
      case 'today_tasks': return small(todays.length, <><hr className="ac-dash-hr" /><div className="ac-dash-mini">{todays.slice(0, 3).map((x) => <div key={x.id} title={x.leadName || ''}>{x.title}</div>)}</div></>)
      case 'calls': return small(calls?.total || 0, <div className="ac-dash-cap">{t('Kiruvchi')} {calls?.inbound || 0} · {t('Chiquvchi')} {calls?.outbound || 0}</div>)
      case 'missed': return small(calls?.missed || 0, <div className="ac-dash-cap">{t("O'rtacha davomiylik")} {Math.floor((calls?.avgDuration || 0) / 60)}:{pad((calls?.avgDuration || 0) % 60)}</div>)
      case 'processed': return small(chatSt?.processed || 0, <div className="ac-dash-cap">{t(periodWord)}</div>)
      case 'incoming': return small(chatSt?.incoming || 0, <div className="ac-dash-cap">{t(periodWord)}</div>)
      case 'outgoing': return small(chatSt?.outgoing || 0, <div className="ac-dash-cap">{t(periodWord)}</div>)
      case 'avg_resp': return small(fmtWait(chatSt?.avgResponseSec || 0, t), <div className="ac-dash-cap">{t('davr uchun')}</div>, 'ac-dash-big--green')
      case 'median_resp': return small(fmtWait(chatSt?.medianResponseSec || 0, t), <div className="ac-dash-cap">{t('davr uchun')}</div>, 'ac-dash-big--green')
      case 'long_wait': return small(chatSt?.waiting || 0, <hr className="ac-dash-hr" />)
      case 'members': return small(memberCount)
      case 'filter': return <FilterWidget w={w} range={range} mineId={mineId} periodWord={periodWord} />
      default: return null
    }
  }
  const titleOf = (w) => {
    if (w.type === 'filter') return w.title || t('Filtr')
    if (w.type === 'total') return `${t('Jami bitimlar')} (${pipeName})`
    if (w.type === 'month') return `${t("Oy bo'yicha bitimlar")} (${pipeName})`
    return t(SYSTEM_WIDGETS[w.type]?.title || '')
  }

  // amoCRM «Анализ продаж» — voronka bloki (butun qator)
  const flow = (
    <>
      <ul className="ac-dash-pipes">
        {pipelines.map((p) => <li key={p.id || 'main'} className={p.id === pipelineId ? 'on' : ''} onClick={() => setPipelineId(p.id)} title={p.name}>{p.name}</li>)}
      </ul>
      <div className="ac-dash-sausages">
        <div className="ac-dash-new">
          <b><small>+</small>{newLeads.length}</b>
          <span>{t('YANGI')}</span>
          <div className="ac-dash-new__lost">{t("Yo'qotilganlar")}</div>
        </div>
        {loading && !pipe && <div className="ac-spinner" />}
        {openStages.map((s) => {
          const f = fresh(s)
          return (
            <div className="ac-dash-sausage" key={s.id}>
              <div className="ac-dash-sausage__head" title={s.name}>
                <div className="ac-dash-sausage__title">{s.name}</div>
                <div className="ac-dash-sausage__count">{plural(s.leads.length, 'bitim')}, {money(sumOf(s.leads))}</div>
                <i className="ac-dash-sausage__color" style={{ background: s.color || '#fff' }} />
              </div>
              <div className="ac-dash-sausage__body"><b>{f.length ? <><small>+</small>{f.length}</> : 0}</b><span>{money(sumOf(f))}</span></div>
              <div className="ac-dash-sausage__foot"><i style={{ background: '#fff' }} /><span>{plural(0, 'bitim')}, {money(0)}</span></div>
            </div>
          )
        })}
        <div className="ac-dash-sausage ac-dash-sausage--won">
          <div className="ac-dash-sausage__head" />
          <div className="ac-dash-sausage__body"><b>{wonLeads.length ? <><small>+</small>{wonLeads.length}</> : 0}</b><span>{money(sumOf(wonLeads))}</span></div>
          <div className="ac-dash-sausage__foot"><i style={{ background: '#e2453c' }} /><span>{plural(lostLeads.length, 'bitim')}, {money(sumOf(lostLeads))}</span></div>
        </div>
      </div>
    </>
  )

  // Tahrirlash rejimidagi boshqaruvlar (amoCRM: o'chirish, ⚙, surish)
  const controls = (w, i) => editing && (
    <>
      {w.type === 'filter' && <button className="ac-dash-wgear" title={t('Sozlash')} onClick={() => setModal({ index: i, widget: w })}><Ico name="gear" size={15} /></button>}
      <button className="ac-dash-wdel" title={t("O'chirish")} onClick={() => removeWidget(w.id)}><Ico name="trash" size={14} /></button>
    </>
  )
  const dragProps = (w) => (editing ? {
    draggable: true,
    onDragStart: (e) => { setDragId(w.id); e.dataTransfer.effectAllowed = 'move' },
    onDragOver: (e) => e.preventDefault(),
    onDrop: (e) => { e.preventDefault(); moveWidget(dragId, w.id); setDragId(null) },
    onDragEnd: () => setDragId(null),
  } : {})
  const used = new Set(L.widgets.map((w) => w.type))
  const catalogItems = [
    ...Object.keys(SYSTEM_WIDGETS).filter((k) => !used.has(k)).map((k) => ({ id: k, type: k, label: t(SYSTEM_WIDGETS[k].title) })),
    ...(L.library || []).map((w) => ({ ...w, label: w.title || t('Filtr') })),
  ]

  return (
    <div className={`ac-content ac-dash ac-dash--${bg} ac-dash--font-${L.font || 'light'} ac-dash--theme-${L.theme || 'navy'} ${editing ? 'ac-dash--editing' : ''}`} style={bgStyle}>
      {bg !== 'custom' && <div className="ac-dash__scene" />}
      {editing ? (
        <div className="ac-dash-editbar">
          {can?.('crm.settings') !== false && <label><input type="checkbox" className="ac-check" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} /> {t("Ish stoli sozlamalarini barcha foydalanuvchilarga qo'llash")}</label>}
          <span className="grow" />
          <button className="ac-dash-editbar__cancel" onClick={cancelEdit}>{t('Bekor qilish')}</button>
          <button className="ac-btn ac-btn--blue" disabled={saving} onClick={saveEdit}>{t('Saqlash')}</button>
        </div>
      ) : (
        <>
          <button className="ac-dash-evbtn" onClick={() => setEventsOpen(true)}><Ico name="burger" size={16} /><span>{t('Voqealar')}</span></button>
          <EventsPanel open={eventsOpen} onClose={() => setEventsOpen(false)} />
        </>
      )}

      <h1 className="ac-dash__title">{accountName}</h1>
      {!editing && <DonoDashBox />}

      {editing ? (
        <div className="ac-dash-setup-panel">
          <div className="ac-dash-font">
            <span className={L.font !== 'dark' ? 'on' : ''}>{t("Och rangli shrift")}</span>
            <span className={`ac-switch ${L.font === 'dark' ? 'on' : ''}`} onClick={() => patch({ font: L.font === 'dark' ? 'light' : 'dark' })} />
            <span className={L.font === 'dark' ? 'on' : ''}>{t("To'q rangli shrift")}</span>
          </div>
          <div className="ac-dash-setup-panel__cap">{t('Vidjetlar mavzusi')}</div>
          <div className="ac-dash-themes">
            {['navy', 'white', 'black', 'blue'].map((k) => (
              <button key={k} className={`ac-dash-themes__sw ac-dash-themes__sw--${k} ${L.theme === k ? 'on' : ''}`} onClick={() => patch({ theme: k })}><i /><i /><i /></button>
            ))}
          </div>
          <div className="ac-dash-setup-panel__cap">{t('Fon rasmi')}</div>
          <div className="ac-dash-bgs">
            {BGS.filter((k) => k !== 'custom').map((k) => (
              <button key={k} title={t(BG_NAMES[k])} className={`ac-dash-bgs__sw ac-dash--${k} ${bg === k ? 'on' : ''}`} onClick={() => patch({ bg: k })}><span className="ac-dash__scene" /></button>
            ))}
            {bgImg && <button title={t(BG_NAMES.custom)} className={`ac-dash-bgs__sw ${bg === 'custom' ? 'on' : ''}`} style={{ backgroundImage: `url(${bgImg})` }} onClick={() => patch({ bg: 'custom' })} />}
            <button className="ac-dash-bgs__sw ac-dash-bgs__add" title={t('Rasm yuklash')} onClick={() => fileRef.current?.click()}><Ico name="plus" size={18} /></button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => uploadBg(e.target.files?.[0])} />
          </div>
        </div>
      ) : (
        <div className="ac-dash-bar">
          <div className="ac-dash-toggler">
            {PERIODS.map(([k, l]) => periodBtn(k, l))}
            <span className="ac-dash-toggler__wrap" ref={dateRef}>
              <button className={preset === 'range' ? 'on' : ''} onClick={() => setDateOpen((v) => !v)}><Ico name="calendar" size={13} /> {t('Davr')}</button>
              {dateOpen && (
                <div className="ac-dash-date">
                  <input type="date" className="ac-input" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
                  <input type="date" className="ac-input" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
                  <button className="ac-btn ac-btn--blue ac-btn--sm" onClick={() => { setPreset('range'); setDateOpen(false) }}>{t('Qo\'llash')}</button>
                </div>
              )}
            </span>
            <span className="ac-dash-toggler__sep" />
            <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>{t('Hammasi')}</button>
            <ScopePicker scope={scope} setScope={setScope} members={memberData?.members || []} groups={memberData?.groups || []} />
          </div>
          <div className="ac-dash-setup">
            <button className="ac-dash-setup__btn" onClick={startEdit}><Ico name="gear" size={14} /> {t('Sozlash')}</button>
          </div>
        </div>
      )}

      <div className="ac-dash-gridwrap"><div className="ac-dash-grid">
        {L.widgets.map((w, i) => {
          if (w.type === 'members' && !memberCount && !editing) return null
          const size = sizeOf(w)
          if (size === 'wide') return <section key={w.id} className={`ac-dash-top ${dragId === w.id ? 'dragging' : ''}`} {...dragProps(w)}>{flow}{controls(w, i)}</section>
          return (
            <div key={w.id} className={`ac-dash-tile ${size === 'big' ? 'ac-dash-tile--big' : ''} ${dragId === w.id ? 'dragging' : ''}`} {...dragProps(w)}>
              <div className="ac-dash-tile__title">{titleOf(w)}</div>
              {content(w)}
              {controls(w, i)}
            </div>
          )
        })}
        {editing && (
          <div className="ac-dash-tile ac-dash-addtile">
            <button className="ac-dash-addtile__plus" onClick={() => setCatalog((v) => !v)}><Ico name="plus" size={22} /></button>
            {catalog && (
              <div className="ac-dash-catalog">
                {catalogItems.length === 0 && <div className="ac-dash-catalog__empty">{t("Barcha vidjetlar qo'shilgan")}</div>}
                {catalogItems.map((c) => <div key={c.id} className="ac-dash-catalog__item" onClick={() => addWidget(c)}>{c.label}</div>)}
                <div className="ac-dash-catalog__hint">{t("Filtr vidjeti: Bitimlar → filtr natijasi soni ustiga bosing")}</div>
              </div>
            )}
          </div>
        )}
      </div></div>

      {modal && (
        <WidgetModal value={modal.widget} onCancel={() => setModal(null)}
          onApply={(w) => { patch({ widgets: draft.widgets.map((x, j) => (j === modal.index ? { ...x, ...w } : x)) }); setModal(null) }}
          onDelete={() => { removeWidget(modal.widget.id); setModal(null) }} />
      )}
    </div>
  )
}
