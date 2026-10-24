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
const BGS = ['sea', 'forest', 'dusk', 'graphite']
const BG_NAMES = { sea: 'Dengiz', forest: "O'rmon", dusk: 'Shom', graphite: 'Grafit' }
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
  if (preset === 'range') return { from: custom.from || undefined, to: custom.to || undefined }
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

function SourceArcs({ items }) {
  const R0 = 118
  const colors = ['#c8a2e8', '#3d8fe0', '#2f7fd0', '#4a9be8']
  const cx = 130, cy = 130
  const max = Math.max(1, ...items.map((i) => i.count))
  return (
    <svg className="ac-dash-arcs" viewBox="0 0 260 140">
      {items.slice(0, 4).map((it, i) => {
        const r = R0 - i * 20
        const a = Math.PI * Math.max(0.12, it.count / max)
        const x2 = cx - r * Math.cos(a), y2 = cy - r * Math.sin(a)
        return <path key={i} d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`} fill="none" stroke={colors[i]} strokeWidth="11" strokeLinecap="round" />
      })}
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
  const range = useMemo(() => rangeOf(preset, custom), [preset, custom])

  const { data: general } = useApi(() => settingsService.getGeneral(), [])
  const accountName = general?.general?.accountName || 'Sellers Army'

  const { data: pipe, loading } = useApi(() => crmService.getPipeline(pipelineId || undefined), [pipelineId])
  const { data: an } = useApi(() => crmService.analytics({ ...range, pipelineId: pipelineId || undefined }), [range.from, range.to, pipelineId])
  const { data: calls } = useApi(() => crmService.analyticsCalls(range), [range.from, range.to])
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

  return (
    <div className={`ac-content ac-dash ac-dash--${bg}`}>
      <div className="ac-dash__pattern" />
      <button className="ac-dash-evbtn" onClick={() => setEventsOpen(true)}><Ico name="burger" size={16} /><span>{t('Voqealar')}</span></button>
      <EventsPanel open={eventsOpen} onClose={() => setEventsOpen(false)} />

      <h1 className="ac-dash__title">{accountName}</h1>

      <div className="ac-dash-bar">
        <div className="ac-dash-pill">
          {PERIODS.map(([k, l]) => periodBtn(k, l))}
          <span className="ac-dash-pill__wrap" ref={dateRef}>
            <button className={preset === 'range' ? 'on' : ''} onClick={() => setDateOpen((v) => !v)}><Ico name="calendar" size={13} /> {t('Davr')}</button>
            {dateOpen && (
              <div className="ac-dash-date">
                <input type="date" className="ac-input" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
                <input type="date" className="ac-input" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
                <button className="ac-btn ac-btn--blue ac-btn--sm" onClick={() => { setPreset('range'); setDateOpen(false) }}>{t('Qo\'llash')}</button>
              </div>
            )}
          </span>
        </div>
        <div className="ac-dash-pill ac-dash-pill--scope">
          <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>{t('Hammasi')}</button>
          <button className={scope === 'mine' ? 'on' : ''} onClick={() => setScope('mine')}>{t('Meniki')} <Ico name="chevronDown" size={10} /></button>
        </div>
        <div className="ac-dash-setup" ref={bgRef}>
          <button className="ac-dash-setup__btn" onClick={() => setBgOpen((v) => !v)}><Ico name="gear" size={14} /> {t('Sozlash')}</button>
          {bgOpen && (
            <div className="ac-dash-bgpick">
              <div className="ac-dash-bgpick__cap">{t('Fon')}</div>
              <div className="ac-dash-bgpick__row">
                {BGS.map((k) => (
                  <button key={k} title={t(BG_NAMES[k])} className={`ac-dash-bgpick__sw ac-dash--${k} ${bg === k ? 'on' : ''}`} onClick={() => pickBg(k)} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Voronkalar + bosqich kartalari */}
      <section className="ac-dash-funnel">
        <ul className="ac-dash-pipes">
          {pipelines.map((p) => (
            <li key={p.id || 'main'} className={p.id === pipelineId ? 'on' : ''} onClick={() => setPipelineId(p.id)}>{p.name}</li>
          ))}
        </ul>
        <div className="ac-dash-new">
          <b>+{newLeads.length}</b>
          <span>{t('YANGI')}</span>
          <div className="ac-dash-lost ac-dash-lost--new">{t('Yo\'qotilganlar')}<br />{plural(lostLeads.length, 'bitim')}, {money(sumOf(lostLeads))}</div>
        </div>
        {loading && !pipe && <div className="ac-spinner" />}
        {openStages.map((s) => {
          const f = fresh(s)
          return (
            <div className="ac-dash-stage" key={s.id}>
              <div className="ac-dash-stage__head" title={s.name}>
                <div className="ac-dash-stage__name">{s.name}</div>
                <div className="ac-dash-stage__cnt">{plural(s.leads.length, 'bitim')}, {money(sumOf(s.leads))}</div>
              </div>
              <i className="ac-dash-line" style={{ background: s.color || '#fff' }} />
              <div className="ac-dash-card">
                <b>{f.length ? `+${f.length}` : 0}</b>
                <span>{money(sumOf(f))}</span>
              </div>
            </div>
          )
        })}
        <div className="ac-dash-stage ac-dash-stage--won">
          <div className="ac-dash-stage__head">
            <div className="ac-dash-stage__name">{wonStages[0]?.name || t('Yutilgan')}</div>
          </div>
          <i className="ac-dash-line" style={{ background: '#2fb05d' }} />
          <div className="ac-dash-card ac-dash-card--won">
            <b>{wonLeads.length ? `+${wonLeads.length}` : 0}</b>
            <span>{money(sumOf(wonLeads))}</span>
          </div>
        </div>
      </section>

      {/* Vidjetlar */}
      <section className="ac-dash-grid">
        <div className="ac-dash-w">
          <div className="ac-dash-w__cap">{t('Jami bitimlar')} ({pipeName})</div>
          <div className="ac-dash-big-row">
            <div>
              <div className="ac-dash-big">{totalAll}</div>
              <div className="ac-dash-sum">{money(sumOf(allLeads))}</div>
            </div>
            <div className="ac-dash-delta"><b>+{newLeads.length}</b><span>{t(PERIOD_WORD[preset] || 'oy uchun')}</span></div>
          </div>
          <hr className="ac-dash-hr" />
          {stages.map((s) => {
            const f = fresh(s)
            return (
              <div className="ac-dash-st" key={s.id}>
                <div className="ac-dash-st__row">
                  <span className="ac-dash-tag" style={{ background: s.color ? `${s.color}` : '#ddd' }}>{s.name}</span>
                  <span className="ac-dash-st__n">{plural(s.leads.length, 'bitim')} <em>({money(sumOf(s.leads))})</em></span>
                  <span className={`ac-dash-st__d ${f.length ? 'pos' : ''}`}>{f.length ? `+${f.length}` : 0}</span>
                </div>
                <div className="ac-dash-prog"><i style={{ width: `${totalAll ? Math.max(s.leads.length ? 3 : 0, (s.leads.length / totalAll) * 100) : 0}%` }} /></div>
              </div>
            )
          })}
        </div>

        <div className="ac-dash-w">
          <div className="ac-dash-w__cap">{t('Oy bo\'yicha bitimlar')} ({pipeName})</div>
          <div className="ac-dash-big">{monthNew.length}</div>
          <hr className="ac-dash-hr" />
          {stages.map((s) => {
            const f = s.leads.filter((l) => inRange(l.createdAt, monthRange))
            if (!f.length) return null
            return (
              <div className="ac-dash-st" key={s.id}>
                <div className="ac-dash-st__row">
                  <span className="ac-dash-tag" style={{ background: s.color || '#ddd' }}>{s.name}</span>
                  <span className="ac-dash-st__n">{plural(f.length, 'bitim')} <em>({money(sumOf(f))})</em></span>
                </div>
                <div className="ac-dash-prog"><i style={{ width: `${(f.length / Math.max(1, monthNew.length)) * 100}%` }} /></div>
              </div>
            )
          })}
        </div>

        <div className="ac-dash-w">
          <div className="ac-dash-w__cap">{t('Bitim manbalari')}</div>
          {sources.length === 0 ? <div className="ac-dash-empty">{t("Ma'lumot yo'q")}</div> : (
            <div className="ac-dash-src">
              <SourceArcs items={sources} />
              <ul className="ac-dash-legend">
                {sources.map((s, i) => <li key={s.source + i} className={`c${i}`} title={s.source}>{s.source === '—' ? t('Boshqa') : s.source} <em>{s.count}</em></li>)}
              </ul>
            </div>
          )}
        </div>

        <div className="ac-dash-w ac-dash-w--tasks">
          <div className="ac-dash-w__cap">{t('Vazifalar')}</div>
          <div className="ac-dash-pair">
            <div className="bad"><b>{overdue.length}</b><span>{t("Muddati o'tgan")}</span></div>
            <div className="ok"><b>{todays.length}</b><span>{t('Bugun')}</span></div>
            <div><b>{tasks.length}</b><span>{t('Hammasi')}</span></div>
          </div>
          <div className="ac-dash-tl">
            {[...overdue, ...todays].slice(0, 5).map((x) => (
              <div key={x.id} className={`ac-dash-tl__i ${dueDay(x) < today ? 'bad' : ''}`}>
                <span>{x.title}</span>{x.leadName && <em>{x.leadName}</em>}
              </div>
            ))}
          </div>
        </div>

        <div className="ac-dash-w ac-dash-w--calls">
          <div className="ac-dash-w__cap">{t("Qo'ng'iroqlar")}</div>
          <div className="ac-dash-big">{calls?.total || 0}</div>
          <hr className="ac-dash-hr" />
          <div className="ac-dash-calls">
            <div><Ico name="phone" size={14} /> {t('Kiruvchi')} <b>{calls?.inbound || 0}</b></div>
            <div><Ico name="phoneOut" size={14} /> {t('Chiquvchi')} <b>{calls?.outbound || 0}</b></div>
            <div className="bad">{t("O'tkazib yuborilgan")} <b>{calls?.missed || 0}</b></div>
            <div>{t("O'rtacha davomiylik")} <b>{Math.floor((calls?.avgDuration || 0) / 60)}:{pad((calls?.avgDuration || 0) % 60)}</b></div>
          </div>
          {memberCount > 0 && <div className="ac-dash-foot">{t('Xodimlar')}: {memberCount}</div>}
        </div>
      </section>
    </div>
  )
}
