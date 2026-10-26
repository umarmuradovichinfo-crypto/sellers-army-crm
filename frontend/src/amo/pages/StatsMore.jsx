// Analitika: Voqealar ro'yxati, Qo'ng'iroqlar, Maqsadlar.
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { crmService } from '../../services/crm.service'
import { useApi } from '../../lib/useApi'
import TopBar from '../TopBar'
import MultiSelect from '../MultiSelect'
import { DATE_PRESETS } from '../filterState'
import { Ico } from '../AmoIcons'
import { cardDate, money, feedDate } from '../format'
import { useT, usePlural } from '../i18n'
import { Seg, Spin, SERIES, byUsers, num, hms } from './StatsCommon'
import { trActivity } from '../activityText'

/* ── Voqealar ro'yxati (amoCRM «Аналитика → Список событий») ── */
// tur → [obyekt, voqea nomi]; qo'ng'iroqlar, xabarlar va yopilgan suhbatlar ham shu ro'yxatda (amoCRM kabi)
const EV = {
  created: ['Bitim', 'stats§Bitim yaratildi'],
  updated: ['Bitim', 'Bitim yangilandi'],
  stage: ['Bitim', "Bosqich o'zgardi"],
  won: ['Bitim', 'Muvaffaqiyatli yopildi'],
  team_chat: ['Bitim', 'Ichki chat xabari'],
  link: ['Bitim', 'Mijoz havolani ochdi'],
  lost: ['Bitim', "Yopilgan va yo'qotilgan"],
  field: ['Bitim', "Maydon o'zgardi"],
  assignee: ['Bitim', "Mas'ul o'zgardi"],
  tag: ['Bitim', "Teg o'zgardi"],
  note: ['Bitim', "Izoh qo'shildi"],
  task_created: ['Vazifa', 'Yangi vazifa'],
  task_done: ['Vazifa', 'Vazifa yakunlandi'],
  call_in: ['Bitim', "Kiruvchi qo'ng'iroq"],
  call_out: ['Bitim', "Chiquvchi qo'ng'iroq"],
  call: ['Bitim', "Chiquvchi qo'ng'iroq"],
  message_in: ['Bitim', 'ev§Kiruvchi xabar'],
  message_out: ['Bitim', 'ev§Chiquvchi xabar'],
  conv_closed: ['Bitim', 'ev§Suhbat yopildi'],
  automation: ['Bitim', 'Avtomatika'],
  email: ['Bitim', 'stats§Email'],
}
const EV_TYPES = Object.keys(EV).filter((k) => k !== 'call' && k !== 'email') // email — chat jurnali, xabarlar alohida
const EV_PRESETS = [['all', 'ev§Barcha voqealar'], ['mine', 'ev§Mening voqealarim'], ['today', 'ev§Bugungi voqealar'], ['yesterday', 'ev§Kechagi voqealar'], ['month', 'ev§Oylik voqealar']]
const EV_EMPTY = { preset: 'all', datePreset: '', from: '', to: '', users: [], entity: '', types: [], before: '', after: '' }

function EventsFilter({ value, members, onApply }) {
  const t = useT()
  const [f, setF] = useState(value)
  useEffect(() => setF(value), [value])
  const set = (k, v) => setF((p) => ({ ...p, preset: '', [k]: v }))
  return (
    <>
      <div className="ac-filter__presets">
        {EV_PRESETS.map(([k, label]) => (
          <div key={k} className={`ac-filter__preset ${f.preset === k ? 'on' : ''}`} onClick={() => onApply({ ...EV_EMPTY, preset: k })}>
            <span className="lbl">{t(label)}</span>
          </div>
        ))}
      </div>
      <div className="ac-filter__col ac-filter__col--fields">
        <MultiSelect single search={false} chevron label="" emptyText="Butun vaqt uchun"
          options={DATE_PRESETS.map((d) => ({ value: d.key, label: t(d.label) }))} value={f.datePreset} onChange={(v) => setF((p) => ({ ...p, preset: '', datePreset: v, from: '', to: '' }))} />
        <div className="ac-filter__range">
          <input className="ac-input" type="date" value={f.from} onChange={(e) => setF((p) => ({ ...p, preset: '', from: e.target.value, datePreset: '' }))} />
          <span>-</span>
          <input className="ac-input" type="date" value={f.to} onChange={(e) => setF((p) => ({ ...p, preset: '', to: e.target.value, datePreset: '' }))} />
        </div>
        <MultiSelect options={(members || []).map((m) => ({ value: m.id, label: m.name }))} value={f.users} onChange={(v) => set('users', v)} label="" emptyText="ev§Menejerlar" />
        <MultiSelect single search={false} chevron label="" emptyText="ev§Barcha obyektlar" value={f.entity} onChange={(v) => set('entity', v)}
          options={[{ value: '', label: t('ev§Barcha obyektlar') }, { value: 'lead', label: t('Bitimlar') }, { value: 'task', label: t('Vazifalar') }]} />
        <MultiSelect options={EV_TYPES.map((k) => ({ value: k, label: t(EV[k][1]) }))} value={f.types} onChange={(v) => set('types', v)} label="" emptyText="ev§Voqea turlari" />
        <input className="ac-input" placeholder={t('Oldingi qiymat')} value={f.before} onChange={(e) => set('before', e.target.value)} />
        <input className="ac-input" placeholder={t('Keyingi qiymat')} value={f.after} onChange={(e) => set('after', e.target.value)} />
        <div className="ac-filter__foot">
          <button className="ac-btn ac-btn--blue ac-btn--sm" onClick={() => onApply(f)}>{t("Qo'llash")}</button>
          <button className="ac-btn ac-btn--sm ac-btn--plain" onClick={() => onApply(EV_EMPTY)}>{t('Tozalash')}</button>
        </div>
      </div>
    </>
  )
}

// qo'ng'iroq yozuvi: tinglash (server orqali) va yuklab olish
function CallRec({ call }) {
  const t = useT()
  const [url, setUrl] = useState(null)
  const [err, setErr] = useState(false)
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  if (!call.hasRecording) return null
  const load = async () => { if (url) return url; try { const u = URL.createObjectURL(await crmService.recordingBlob(call.id)); setUrl(u); return u } catch { setErr(true); return null } }
  if (url) return <audio className="ac-stats-ev__audio" src={url} controls autoPlay />
  return (
    <span className="ac-stats-ev__rec">
      <button className="ac-stats-ev__btn" title={t('Tinglash')} onClick={load}><Ico name="play" size={16} className="ico" /></button>
      <button className="ac-stats-ev__btn" title={t('Yuklab olish')} onClick={async () => { const u = await load(); if (u) { const a = document.createElement('a'); a.href = u; a.download = `call-${call.id}.mp3`; a.click() } }}><Ico name="download" size={16} className="ico" /></button>
      {err && <span className="ac-muted">!</span>}
    </span>
  )
}

const evQuery = (f, userParam) => {
  const q = { limit: 300 }
  if (f.preset && f.preset !== 'all') q.preset = f.preset
  if (f.datePreset) q.datePreset = f.datePreset
  if (f.from) q.from = f.from
  if (f.to) q.to = f.to
  const users = f.users?.length ? f.users : userParam ? [userParam] : []
  if (users.length) q.userIds = users.join(',')
  if (f.entity) q.entity = f.entity
  if (f.types?.length) q.types = f.types.join(',')
  if (f.before) q.before = f.before
  if (f.after) q.after = f.after
  return q
}

export function StatsEvents({ members }) {
  const t = useT()
  const plural = usePlural()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const userParam = sp.get('user') || undefined
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState(EV_EMPTY)
  const query = evQuery(filter, userParam)
  const { data } = useApi(() => crmService.analyticsEvents(query), [JSON.stringify(query)], null)
  const items = useMemo(() => {
    const all = data?.items || []
    const s = q.trim().toLowerCase()
    if (!s) return all
    return all.filter((e) => `${e.actorName} ${e.leadName || ''} ${e.text}`.toLowerCase().includes(s))
  }, [data, q])
  const preset = EV_PRESETS.find(([k]) => k === filter.preset)
  return (
    <>
      <TopBar searchPlaceholder="Filtr" search={q} onSearch={setQ}
        chips={filter !== EV_EMPTY ? [{ id: 'f', label: preset && filter.preset !== 'all' ? t(preset[1]) : t('ev§Filtr'), onRemove: () => setFilter(EV_EMPTY) }] : undefined}
        filterPanel={(close) => <EventsFilter value={filter} members={members} onApply={(f) => { setFilter(f); close() }} />}
        count={plural(data?.total ?? items.length, 'voqea')} />
      {!data ? <Spin /> : (
        <div className="ac-stats-ev">
          <table className="ac-table">
            <thead><tr>
              <th>{t('Sana')}</th><th>{t('Muallif')}</th><th>{t("Ob'ekt")}</th><th>{t('Nomi')}</th><th>{t('Voqea')}</th><th>{t('Oldingi qiymat')}</th><th>{t('Keyingi qiymat')}</th>
            </tr></thead>
            <tbody>
              {items.map((e) => {
                const [obj, label] = EV[e.type] || ['Bitim', e.type]
                return (
                  <tr key={e.id}>
                    <td>{feedDate(e.createdAt, t)}</td>
                    <td>{e.actorName || '—'}</td>
                    <td className="obj">{t(obj)}</td>
                    <td>{e.leadId ? <a className="ac-stats-ev__lead" onClick={() => navigate(`/leads/detail/${e.leadId}`)}>{e.leadName || '—'}</a> : '—'}</td>
                    <td>{t(label)}{e.fieldLabel ? <span className="ac-muted"> «{t(e.fieldLabel)}»</span> : null}</td>
                    <td title={e.from || ''}>{e.fieldLabel ? (e.from || '—') : ''}</td>
                    <td title={e.text}>
                      {e.call
                        ? <span className="ac-stats-ev__play">{e.text}<CallRec call={e.call} /></span>
                        : e.fieldLabel ? (e.to || '—') : trActivity(e.text, t)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {items.length === 0 && <div className="ac-stats-empty">{t("Ma'lumot yo'q")}</div>}
        </div>
      )}
    </>
  )
}

export function StatsCalls({ filter, params }) {
  const t = useT()
  const [mode, setMode] = useState('count')
  const { data } = useApi(() => crmService.analyticsCalls({ from: params.from, to: params.to }), [params.from, params.to], null)
  if (!data) return <Spin />
  const rows = byUsers(data.byEmployee || [], filter).map((r) => {
    const inV = mode === 'count' ? (r.inCount ?? 0) : (r.inDur ?? 0)
    const outV = mode === 'count' ? (r.outCount ?? r.count) : (r.outDur ?? r.totalDur)
    return { ...r, inV, outV, tot: inV + outV }
  })
  const max = Math.max(1, ...rows.map((r) => r.tot))
  const fmt = (v) => (mode === 'count' ? num(v) : hms(v))
  return (
    <div className="ac-stats-body">
      <div className="ac-stats-note">{t("Hisobotda qo'ng'iroqlar grafigi ko'rsatilgan: u butun sotuv bo'limi va har bir menejerning samaradorligini tez baholashga, qo'ng'iroqlar soni va davomiyligini boshqa menejerlar va kompaniya o'rtacha ko'rsatkichlari bilan solishtirishga imkon beradi. Hisobot sahifasidan voqealar ro'yxatiga osongina o'tib, akkauntdagi harakatlar haqida to'liq ma'lumot ko'rish mumkin.")}</div>
      <div className="ac-stats-toolbar">
        <label className="ac-stats-check"><input type="checkbox" className="ac-check" checked readOnly />{t('Barcha foydalanuvchi guruhlari')}</label>
        <Seg value={mode} onChange={setMode} options={[['count', "Soni bo'yicha"], ['dur', 'Davomiylik bo\'yicha']]} />
      </div>
      <div className="ac-stats-calls__legend">{t('Kiruvchi/Chiquvchi')}</div>
      {rows.map((r, i) => (
        <div className="ac-stats-call" key={r.id}>
          <div className="ac-stats-call__who">{r.name}<small>{t('Davomiyligi')}: {hms(r.totalDur)}</small></div>
          <div className="ac-stats-call__track">
            <div className="ac-stats-call__bar" style={{ width: `${(r.tot / max) * 80}%`, '--c': SERIES[i % SERIES.length] }}>
              <div className="ac-stats-call__in" style={{ flex: r.inV || 0.0001 }}>{r.inV ? fmt(r.inV) : 0}</div>
              <div className="ac-stats-call__out" style={{ flex: r.outV || 0.0001 }}>{r.outV ? fmt(r.outV) : 0}</div>
            </div>
            <span className="ac-stats-call__total">{fmt(r.tot)}</span>
          </div>
        </div>
      ))}
      {rows.length === 0 && <div className="ac-stats-empty">{t("Ma'lumot yo'q")}</div>}
    </div>
  )
}

/* ── Maqsadlar ── */
const localMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

function GoalsModal({ rows, metric, period, onClose, onSaved }) {
  const t = useT()
  const [vals, setVals] = useState(() => Object.fromEntries(rows.map((r) => [r.key, r.goal ? String(r.goal.target) : ''])))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const save = async () => {
    if (busy) return
    setBusy(true); setErr('')
    try {
      for (const r of rows) {
        const v = Number(String(vals[r.key] || '').replace(/\D/g, '')) || 0
        const old = r.goal ? r.goal.target : 0
        if (v === old) continue
        if (!v && r.goal) await crmService.deleteGoal(r.goal.id)
        else if (v) await crmService.upsertGoal({ userId: r.userId || undefined, period, metric, target: v })
      }
      onSaved()
    } catch (e) { setErr(e?.message || t('Saqlanmadi')) }
    finally { setBusy(false) }
  }
  return (
    <div className="ac-modal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ac-modal ac-stats-gm">
        <button className="ac-modal__close" onClick={onClose}><Ico name="close" /></button>
        <h3 className="ac-modal__title">{t('Maqsadlar sozlamalari')}</h3>
        <div className="ac-stats-gm__list">
          {rows.map((r) => (
            <div className="ac-stats-gm__row" key={r.key}>
              <span>{r.name}</span>
              <input className="ac-input" placeholder={t('Maqsadni kiriting')} value={vals[r.key]} inputMode="numeric" onChange={(e) => setVals({ ...vals, [r.key]: e.target.value.replace(/[^\d\s]/g, '') })} />
            </div>
          ))}
        </div>
        {err && <div style={{ margin: '8px 0', color: 'var(--amo-danger)', fontSize: 13 }}>{err}</div>}
        <div className="ac-modal__foot">
          <button className="ac-btn ac-btn--blue" disabled={busy} onClick={save}>{t('Saqlash')}</button>
          <button className="ac-btn ac-btn--plain" onClick={onClose}>{t('Bekor qilish')}</button>
        </div>
      </div>
    </div>
  )
}

export function StatsGoals({ filter, members, settingsOpen, onCloseSettings }) {
  const t = useT()
  const [mode, setMode] = useState('sum')
  const metric = mode === 'sum' ? 'revenue' : 'count'
  const period = localMonth()
  const { data, reload } = useApi(() => crmService.listGoals(period), [period], null)
  if (!data) return <Spin />
  const goals = (data.goals || []).filter((g) => g.metric === metric)
  const mem = byUsers(members.length ? members : (data.members || []), filter)
  const rows = [{ key: 'team', userId: null, name: t('Butun jamoa'), goal: goals.find((g) => !g.userId) },
    ...mem.map((m) => ({ key: String(m.id), userId: m.id, name: m.name, goal: goals.find((g) => g.userId === m.id) }))]
  const fmt = (v) => (mode === 'sum' ? money(v) : num(v))
  const now = new Date()
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const frac = now.getDate() / days
  const d2 = (n) => String(n).padStart(2, '0')
  return (
    <div className="ac-stats-body">
      <div className="ac-stats-note">{t("Maqsadlarni belgilang: jamoangizni yo'naltirish va biznesni o'stirish uchun. Aniq ko'rsatkichlar jamoaga maqsadlarni samarali bajarishga yordam beradi. amoCRM sotuvlar holatini ko'rishga va maqsadlar bajarilishini kuzatishga yordam beradi.")}</div>
      <div className="ac-stats-toolbar">
        <label className="ac-stats-check"><input type="checkbox" className="ac-check" checked readOnly />{t('Barcha guruhlar')}</label>
        <Seg value={mode} onChange={setMode} options={[['sum', "Byudjet bo'yicha"], ['count', "Soni bo'yicha"]]} />
      </div>
      <div className="ac-stats-goals">
        <div className="ac-stats-goals__head" />
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 173, right: 150, pointerEvents: 'none' }}>
          <div className="ac-stats-goals__today" style={{ left: `${frac * 100}%` }} />
          <div className="ac-stats-goals__todaylab" style={{ left: `${frac * 100}%`, right: 'auto', transform: 'translateX(-100%)', marginLeft: -8 }}>
            {d2(now.getDate())}.{d2(now.getMonth() + 1)}.{now.getFullYear()}<br />{now.getDate()} {t('stats§kun')} {t('stats§dan')} {days}
          </div>
          <div className="ac-stats-goals__goallab" style={{ left: '100%', marginLeft: 12, top: 4 }}>{t('Maqsad')}</div>
        </div>
        {rows.map((r, i) => {
          const g = r.goal
          return (
            <div className={`ac-stats-goals__row ${i === 0 ? 'total' : ''}`} key={r.key}>
              <div className="ac-stats-goals__name">{i === 0 ? t('Jami') : r.name}</div>
              <div className="ac-stats-goals__cell">
                {g ? (
                  <>
                    <div className="ac-stats-goals__fill" style={{ width: `${Math.min(100, g.pct)}%` }} />
                    <span className="ac-stats-goals__val">{fmt(g.actual)} / {fmt(g.target)} · {g.pct}%</span>
                  </>
                ) : (
                  <>
                    <div className="ac-stats-goals__hatch" />
                    <span className="ac-stats-goals__none">{t('Maqsad belgilanmagan')}</span>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {settingsOpen && <GoalsModal rows={rows} metric={metric} period={period} onClose={onCloseSettings} onSaved={() => { onCloseSettings(); reload() }} />}
    </div>
  )
}
