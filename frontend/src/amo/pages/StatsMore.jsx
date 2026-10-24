// Analitika: Voqealar ro'yxati, Qo'ng'iroqlar, Maqsadlar.
import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { crmService } from '../../services/crm.service'
import { useApi } from '../../lib/useApi'
import TopBar from '../TopBar'
import { Ico } from '../AmoIcons'
import { cardDate, money } from '../format'
import { useT, usePlural } from '../i18n'
import { Seg, Spin, SERIES, byUsers, num, hms } from './StatsCommon'
import { trActivity } from '../activityText'

/* ── Voqealar ro'yxati ── */
const EV = {
  created: ['Bitim', 'stats§Bitim yaratildi'],
  updated: ['Bitim', 'Bitim yangilandi'],
  stage: ['Bitim', "Bosqich o'zgardi"],
  note: ['Bitim', "Izoh qo'shildi"],
  task_created: ['Vazifa', 'Yangi vazifa'],
  task_done: ['Bitim', 'Vazifa yakunlandi'],
  call: ['Bitim', "Chiquvchi qo'ng'iroq"],
  field: ['Bitim', "Maydon o'zgardi"],
  won: ['Bitim', 'Muvaffaqiyatli yopildi'],
  lost: ['Bitim', "Yopilgan va yo'qotilgan"],
  assignee: ['Bitim', "Mas'ul o'zgardi"],
  tag: ['Bitim', "Teg o'zgardi"],
  automation: ['Bitim', 'Avtomatika'],
  email: ['Bitim', 'stats§Email'],
}

export function StatsEvents({ members }) {
  const t = useT()
  const plural = usePlural()
  const [sp] = useSearchParams()
  const userId = sp.get('user') || undefined
  const [q, setQ] = useState('')
  const { data } = useApi(() => crmService.analyticsEvents({ limit: 300, userId }), [userId], null)
  const items = useMemo(() => {
    const all = data?.items || []
    const s = q.trim().toLowerCase()
    if (!s) return all
    return all.filter((e) => `${e.actorName} ${e.leadName || ''} ${e.text}`.toLowerCase().includes(s))
  }, [data, q])
  return (
    <>
      <TopBar searchPlaceholder="Filtr" search={q} onSearch={setQ} count={plural(items.length, 'voqea')} />
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
                    <td>{cardDate(e.createdAt, t)}</td>
                    <td>{e.actorName || '—'}</td>
                    <td className="obj">{t(obj)}</td>
                    <td>{e.leadName || '—'}</td>
                    <td>{t(label)}{e.fieldLabel ? <span className="ac-muted"> «{t(e.fieldLabel)}»</span> : null}</td>
                    <td title={e.from || ''}>{e.fieldLabel ? (e.from || '—') : ''}</td>
                    <td title={e.text}>
                      {e.type === 'call'
                        ? <span className="ac-stats-ev__play">{e.text}<Ico name="play" size={16} className="ico" /><Ico name="download" size={16} className="ico" /></span>
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

/* ── Qo'ng'iroqlar ── */
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
