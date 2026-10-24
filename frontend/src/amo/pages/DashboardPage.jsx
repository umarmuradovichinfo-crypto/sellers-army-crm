// amoCRM "Рабочий стол" — /dashboard. Fon + voronka kartalari + vidjetlar to'ri + voqealar paneli.
import React, { useMemo, useRef, useState } from 'react'
import { crmService } from '../../services/crm.service'
import { settingsService } from '../../services/settings.service'
import { useAuth } from '../../context/AuthContext'
import { useApi } from '../../lib/useApi'
import { Ico } from '../AmoIcons'
import { useOutside } from '../TopBar'
import { money, feedDate } from '../format'
import { useT, usePlural } from '../i18n'
import '../i18n/dashboard.ru.js'
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

export default function DashboardPage() {
  const t = useT()
  const plural = usePlural()
  const { user } = useAuth()
  const [preset, setPreset] = useState('month')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [dateOpen, setDateOpen] = useState(false)
  const [scope, setScope] = useState('all')
  const [pipelineId, setPipelineId] = useState('')
  const [bg, setBg] = useState(() => { try { return localStorage.getItem(BG_KEY) || 'sea' } catch { return 'sea' } })
  const [bgOpen, setBgOpen] = useState(false)
  const [eventsOpen, setEventsOpen] = useState(false)
  const bgRef = useRef(null)
  const dateRef = useRef(null)
  useOutside(bgRef, () => setBgOpen(false), bgOpen)
  useOutside(dateRef, () => setDateOpen(false), dateOpen)

  const pickBg = (k) => { setBg(k); try { localStorage.setItem(BG_KEY, k) } catch { /* */ } }
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
      setBgImg(url); pickBg('custom')
      URL.revokeObjectURL(img.src)
    }
    img.src = URL.createObjectURL(file)
  }
  const range = useMemo(() => rangeOf(preset, custom), [preset, custom])

  const { data: general } = useApi(() => settingsService.getGeneral(), [])
  const accountName = general?.general?.accountName || 'Sellers Army'

  const { data: pipe, loading } = useApi(() => crmService.getPipeline(pipelineId || undefined), [pipelineId])
  const mineId = scope === 'mine' ? user?.id : undefined
  const { data: an } = useApi(() => crmService.analytics({ ...range, pipelineId: pipelineId || 'main', userIds: mineId }), [range.from, range.to, pipelineId, mineId])
  const { data: callsAll } = useApi(() => crmService.analyticsCalls(range), [range.from, range.to])
  const calls = useMemo(() => {
    if (!mineId || !callsAll) return callsAll
    const r = (callsAll.byEmployee || []).find((e) => e.id === mineId)
    if (!r) return { total: 0, inbound: 0, outbound: 0, missed: 0, avgDuration: 0 }
    return { total: r.count, inbound: r.inCount, outbound: r.outCount, missed: r.missed, avgDuration: r.avgDur }
  }, [callsAll, mineId])
  const { data: taskData } = useApi(() => crmService.listTasks({ status: 'open' }), [])
  const { data: memberData } = useApi(() => crmService.listMembers(), [])

  const pipelines = [{ id: '', name: t('Asosiy voronka') }, ...((pipe?.pipelines || []).map((p) => ({ id: p.id, name: p.name })))]
  const mine = scope === 'mine'
  const uid = user?.id

  const stages = (pipe?.stages || []).map((s) => ({
    ...s,
    leads: (s.leads || []).filter((l) => !mine || !uid || l.assigneeId === uid),
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
  const tasks = (taskData?.tasks || []).filter((x) => !x.done && (!mine || !uid || x.assigneeId === uid))
  const today = iso(new Date())
  const dueDay = (x) => (x.dueDate ? iso(new Date(x.dueDate)) : null)
  const overdue = tasks.filter((x) => dueDay(x) && dueDay(x) < today)
  const todays = tasks.filter((x) => dueDay(x) === today)

  // Widget 1/2
  const totalAll = allLeads.length
  const monthRange = rangeOf('month')
  const monthNew = allLeads.filter((l) => inRange(l.createdAt, monthRange))
  const pipeName = pipelines.find((p) => p.id === pipelineId)?.name || t('Asosiy voronka')
  const sources = (an?.bySource || []).slice(0, 4)
  const memberCount = (memberData?.members || []).length

  const periodBtn = (k, label) => (
    <button key={k} className={preset === k ? 'on' : ''} onClick={() => { setPreset(k); setDateOpen(false) }}>{t(label)}</button>
  )

  const tile = (cap, children, cls = '') => (
    <div className={`ac-dash-tile ${cls}`}>
      <div className="ac-dash-tile__title">{cap}</div>
      {children}
    </div>
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

  return (
    <div className={`ac-content ac-dash ac-dash--${bg}`} style={bgStyle}>
      {bg !== 'custom' && <div className="ac-dash__scene" />}
      <button className="ac-dash-evbtn" onClick={() => setEventsOpen(true)}><Ico name="burger" size={16} /><span>{t('Voqealar')}</span></button>
      <EventsPanel open={eventsOpen} onClose={() => setEventsOpen(false)} />

      <h1 className="ac-dash__title">{accountName}</h1>

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
          <button className={scope === 'mine' ? 'on' : ''} onClick={() => setScope('mine')}>{t('Meniki')} <Ico name="chevronDown" size={10} /></button>
        </div>
        <div className="ac-dash-setup" ref={bgRef}>
          <button className="ac-dash-setup__btn" onClick={() => setBgOpen((v) => !v)}><Ico name="gear" size={14} /> {t('Sozlash')}</button>
          {bgOpen && (
            <div className="ac-dash-bgpick">
              <div className="ac-dash-bgpick__cap">{t('Fon')}</div>
              <div className="ac-dash-bgpick__row">
                {BGS.filter((k) => k !== 'custom').map((k) => (
                  <button key={k} title={t(BG_NAMES[k])} className={`ac-dash-bgpick__sw ac-dash--${k} ${bg === k ? 'on' : ''}`} onClick={() => pickBg(k)}><span className="ac-dash__scene" /></button>
                ))}
                {bgImg && <button title={t(BG_NAMES.custom)} className={`ac-dash-bgpick__sw ${bg === 'custom' ? 'on' : ''}`} style={{ backgroundImage: `url(${bgImg})` }} onClick={() => pickBg('custom')} />}
              </div>
              <button className="ac-btn ac-btn--sm ac-btn--plain" style={{ marginTop: 10, width: '100%' }} onClick={() => fileRef.current?.click()}><Ico name="attach" size={13} /> {t('Rasm yuklash')}</button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => uploadBg(e.target.files?.[0])} />
            </div>
          )}
        </div>
      </div>

      <div className="ac-dash-grid">
        {/* Voronka (top-chart) */}
        <section className="ac-dash-top">
          <ul className="ac-dash-pipes">
            {pipelines.map((p) => (
              <li key={p.id || 'main'} className={p.id === pipelineId ? 'on' : ''} onClick={() => setPipelineId(p.id)} title={p.name}>{p.name}</li>
            ))}
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
                  <div className="ac-dash-sausage__body">
                    <b>{f.length ? <><small>+</small>{f.length}</> : 0}</b>
                    <span>{money(sumOf(f))}</span>
                  </div>
                  <div className="ac-dash-sausage__foot">
                    <i style={{ background: '#fff' }} />
                    <span>{plural(0, 'bitim')}, {money(0)}</span>
                  </div>
                </div>
              )
            })}
            <div className="ac-dash-sausage ac-dash-sausage--won">
              <div className="ac-dash-sausage__head" />
              <div className="ac-dash-sausage__body">
                <b>{wonLeads.length ? <><small>+</small>{wonLeads.length}</> : 0}</b>
                <span>{money(sumOf(wonLeads))}</span>
              </div>
              <div className="ac-dash-sausage__foot">
                <i style={{ background: '#e2453c' }} />
                <span>{plural(lostLeads.length, 'bitim')}, {money(sumOf(lostLeads))}</span>
              </div>
            </div>
          </div>
        </section>

        {tile(`${t('Jami bitimlar')} (${pipeName})`, (
          <>
            <div className="ac-dash-tile__top">
              <div>
                <div className="ac-dash-big">{totalAll}</div>
                <div className="ac-dash-sum">{money(sumOf(allLeads))}</div>
              </div>
              <div className="ac-dash-delta"><b>+{newLeads.length}</b><span>{t(PERIOD_WORD[preset] || 'oy uchun')}</span></div>
            </div>
            <hr className="ac-dash-hr" />
            {stageRows(allRows, totalAll, true)}
          </>
        ), 'ac-dash-tile--big')}

        {tile(`${t("Oy bo'yicha bitimlar")} (${pipeName})`, (
          <>
            <div className="ac-dash-tile__top"><div className="ac-dash-big">{monthNew.length}</div></div>
            <hr className="ac-dash-hr" />
            {stageRows(monthRows, monthNew.length, false)}
          </>
        ), 'ac-dash-tile--big')}

        {tile(t('Bitim manbalari'), sources.length === 0 ? <div className="ac-dash-empty">{t("Ma'lumot yo'q")}</div> : (
          <div className="ac-dash-src">
            <SourceRings items={sources} />
            <ul className="ac-dash-legend">
              {sources.map((s, i) => <li key={s.source + i} style={{ color: SRC_COLORS[i] }} title={`${s.count}`}>{s.source === '—' ? t('Boshqa') : s.source}</li>)}
            </ul>
          </div>
        ), 'ac-dash-tile--big')}

        {tile(t("Muddati o'tgan vazifalar"), (<><div className="ac-dash-big ac-dash-big--sm">{overdue.length}</div><div className="ac-dash-cap">{t('Hammasi')}: {tasks.length}</div></>))}
        {tile(t('Bugungi vazifalar'), (<><div className="ac-dash-big ac-dash-big--sm">{todays.length}</div><hr className="ac-dash-hr" />
          <div className="ac-dash-mini">{todays.slice(0, 3).map((x) => <div key={x.id} title={x.leadName || ''}>{x.title}</div>)}</div></>))}
        {tile(t("Qo'ng'iroqlar"), (<><div className="ac-dash-big ac-dash-big--sm">{calls?.total || 0}</div>
          <div className="ac-dash-cap">{t('Kiruvchi')} {calls?.inbound || 0} · {t('Chiquvchi')} {calls?.outbound || 0}</div></>))}
        {tile(t("O'tkazib yuborilgan qo'ng'iroqlar"), (<><div className="ac-dash-big ac-dash-big--sm">{calls?.missed || 0}</div>
          <div className="ac-dash-cap">{t("O'rtacha davomiylik")} {Math.floor((calls?.avgDuration || 0) / 60)}:{pad((calls?.avgDuration || 0) % 60)}</div></>))}
        {memberCount > 0 && tile(t('Xodimlar'), (<div className="ac-dash-big ac-dash-big--sm">{memberCount}</div>))}
      </div>
    </div>
  )
}
