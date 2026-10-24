import React, { useState, useEffect, useMemo } from 'react'
import { dialog } from '../Dialog'
import Icon from '../Icon'
import { Stat, Loading } from '../ui'
import { crmService } from '../../services/crm.service'

/* ── Formatlar ── */
function fmtSum(v) {
  v = Number(v) || 0
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, '') + ' mlrd'
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + ' mln'
  if (v >= 1e3) return Math.round(v / 1e3) + ' ming'
  return String(v)
}
function fmtDur(sec) { sec = Number(sec) || 0; const m = Math.floor(sec / 60); return m + ':' + String(sec % 60).padStart(2, '0') }
const MON = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek']
function fmtDay(d) { const x = new Date(d); return x.getDate() + ' ' + MON[x.getMonth()] }
function fmtDT(iso) { const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return d.getDate() + ' ' + MON[d.getMonth()] + ', ' + p(d.getHours()) + ':' + p(d.getMinutes()) }

const PRESETS = [
  { k: '7', l: '7 kun' }, { k: '30', l: '30 kun' }, { k: '90', l: '3 oy' }, { k: 'all', l: 'Hammasi' },
]
const TABS = [
  { k: 'funnel', l: 'Voronka' },
  { k: 'employees', l: 'Sotuvchilar' },
  { k: 'calls', l: "Qo'ng'iroqlar" },
  { k: 'events', l: 'Hodisalar' },
  { k: 'timeline', l: 'Dinamika' },
  { k: 'goals', l: 'Maqsad' },
]
const EVENT_ICON = { created: '✨', updated: '✏️', stage: '➡️', note: '💬', task_created: '📋', task_done: '✅', call: '📞', field: '✏️', won: '🏆', lost: '❌', assignee: '👤', tag: '🏷', automation: '⚙️', email: '✉️' }
const EVENT_LABEL = { created: 'Yaratildi', updated: 'Yangilandi', stage: 'Bosqich', note: 'Izoh', task_created: 'Vazifa', task_done: 'Bajarildi', call: "Qo'ng'iroq", field: 'Maydon', won: 'Yutildi', lost: "Yo'qotildi", assignee: "Mas'ul", tag: 'Teg', automation: 'Avtomatika', email: 'Email' }

/* Har hisobot uchun yuklovchi hook (params o'zgarganda qayta yuklaydi) */
function useReport(fetcher, params) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const key = JSON.stringify(params)
  useEffect(() => {
    let alive = true
    setLoading(true)
    fetcher(params).then((d) => { if (alive) { setData(d); setLoading(false) } }).catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [key]) // eslint-disable-line
  return { data, loading }
}

/* Vertikal bar grafik */
function VBars({ bars, height = 120 }) {
  const max = Math.max(1, ...bars.map((b) => b.v))
  return (
    <div className="fx" style={{ alignItems: 'flex-end', gap: 6, height, overflowX: 'auto' }}>
      {bars.map((b, i) => (
        <div key={i} className="fx" style={{ flexDirection: 'column', alignItems: 'center', flex: '1 0 22px', minWidth: 22 }}>
          <div style={{ width: '100%', maxWidth: 30, position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: height - 22 }}>
            <div title={b.title || String(b.v)} style={{ width: '100%', height: `${Math.round((b.v / max) * 100)}%`, minHeight: b.v ? 3 : 0, background: b.color || 'var(--info)', borderRadius: '4px 4px 0 0' }}>
              {b.v2 != null && <div title={b.title2} style={{ width: '100%', height: `${Math.round((b.v2 / (b.v || 1)) * 100)}%`, background: b.color2 || 'var(--ok)', borderRadius: '4px 4px 0 0' }} />}
            </div>
          </div>
          <span className="sub2" style={{ fontSize: 10, marginTop: 4, whiteSpace: 'nowrap' }}>{b.label}</span>
        </div>
      ))}
    </div>
  )
}

export default function AnalyticsView({ pipelineId }) {
  const [tab, setTab] = useState('funnel')
  const [period, setPeriod] = useState('30')
  const params = useMemo(() => {
    const p = { pipelineId: pipelineId || undefined }
    if (period !== 'all') p.from = new Date(Date.now() - Number(period) * 86400000).toISOString().slice(0, 10)
    return p
  }, [period, pipelineId])

  return (
    <div>
      <div className="fx ac gap8" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.k} className={`btn sm ${tab === t.k ? 'primary' : ''}`} onClick={() => setTab(t.k)}>{t.l}</button>
        ))}
      </div>

      {tab !== 'goals' && (
        <div className="fx ac gap8" style={{ marginBottom: 16 }}>
          <span className="sub2" style={{ fontWeight: 700 }}>Davr:</span>
          <div className="fx ac gap8" style={{ background: 'var(--canvas)', borderRadius: 10, padding: 3 }}>
            {PRESETS.map((p) => (
              <button key={p.k} className={`btn sm ${period === p.k ? 'primary' : ''}`} onClick={() => setPeriod(p.k)}>{p.l}</button>
            ))}
          </div>
        </div>
      )}

      {tab === 'funnel' && <FunnelReport params={params} />}
      {tab === 'employees' && <EmployeesReport params={params} />}
      {tab === 'calls' && <CallsReport params={params} />}
      {tab === 'events' && <EventsReport params={params} />}
      {tab === 'timeline' && <TimelineReport params={params} />}
      {tab === 'goals' && <GoalsSection />}
    </div>
  )
}

/* ── Voronka hisoboti ── */
function FunnelReport({ params }) {
  const { data, loading } = useReport(crmService.analytics, params)
  if (loading || !data) return <Loading />
  const c = data.cards || {}
  const funnel = data.funnel || []
  const maxFunnel = Math.max(1, ...funnel.map((f) => f.count))
  return (
    <>
      <div className="grid g4 mb16">
        <Stat lab="Jami lidlar" val={String(c.total ?? 0)} />
        <Stat lab="Faol voronka" val={`${c.open ?? 0} · ${fmtSum(c.openSum)}`} />
        <Stat lab="Sotuv (won)" val={`${c.won ?? 0} · ${fmtSum(c.wonSum)}`} variant="lime" />
        <Stat lab="Konversiya" val={`${c.winRate ?? 0}%`} />
      </div>
      <div className="grid g4 mb16">
        <Stat lab="Yo'qotilgan" val={String(c.lost ?? 0)} />
        <Stat lab="O'rtacha chek" val={fmtSum(c.avgCheck)} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <div className="card">
          <h4 style={{ margin: '0 0 14px' }}>Voronka konversiyasi</h4>
          {funnel.length === 0 && <div className="sub2">Ma'lumot yo'q</div>}
          {funnel.map((f, i) => (
            <div key={f.key} style={{ marginBottom: 12 }}>
              <div className="fx jb ac" style={{ marginBottom: 4, fontSize: 13 }}>
                <span className="fx ac gap8"><span style={{ width: 8, height: 8, borderRadius: '50%', background: f.color }} />{f.name}</span>
                <span><b>{f.count}</b> <span className="sub2">· {fmtSum(f.sum)} · {f.pct}%</span>{i > 0 && <span style={{ color: 'var(--info)', fontWeight: 700, marginLeft: 6 }}>↳ {f.convFromPrev}%</span>}</span>
              </div>
              <div style={{ height: 8, background: 'var(--canvas)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ width: `${Math.round((f.count / maxFunnel) * 100)}%`, height: '100%', background: f.color }} />
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <h4 style={{ margin: '0 0 14px' }}>Manba bo'yicha</h4>
          {(data.bySource || []).length === 0 && <div className="sub2">Ma'lumot yo'q</div>}
          {(data.bySource || []).map((s) => (
            <div key={s.source} className="fx jb ac" style={{ padding: '7px 0', borderBottom: '1px dashed var(--bd)', fontSize: 13 }}>
              <span className="tag">{s.source}</span>
              <span><b>{s.count}</b> lid · <span className="sub2">{s.won} won ({s.conv}%)</span> · {fmtSum(s.sum)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h4 style={{ margin: '0 0 14px' }}>Yo'qotish sabablari</h4>
        {(data.lostReasons || []).length === 0 && <div className="sub2">Yo'qotilgan lid yo'q</div>}
        {(data.lostReasons || []).map((r) => (
          <div key={r.reason} className="fx jb ac" style={{ padding: '7px 0', borderBottom: '1px dashed var(--bd)', fontSize: 13 }}>
            <span>{r.reason}</span><b style={{ color: 'var(--dang)' }}>{r.count}</b>
          </div>
        ))}
      </div>
    </>
  )
}

/* ── Sotuvchilar hisoboti ── */
function EmployeesReport({ params }) {
  const { data, loading } = useReport(crmService.analyticsEmployees, params)
  if (loading || !data) return <Loading />
  const rows = Array.isArray(data) ? data : (data.rows || [])
  return (
    <div className="card">
      <h4 style={{ margin: '0 0 14px' }}>Sotuvchilar samaradorligi</h4>
      {rows.length === 0 && <div className="sub2">Ma'lumot yo'q</div>}
      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', minWidth: 620 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--mut)', fontSize: 12 }}>
              <th style={{ padding: '4px 0' }}>Sotuvchi</th><th>Lid</th><th>Won</th><th>Lost</th><th>Konv.</th><th>Summa</th><th>O'rt. chek</th><th>Qo'ng'iroq</th><th>Vazifa</th>
            </tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} style={{ borderTop: '1px solid var(--bd)' }}>
                  <td style={{ padding: '7px 0', fontWeight: 600 }}>{e.name}</td>
                  <td>{e.leads}</td>
                  <td style={{ color: 'var(--ok)', fontWeight: 700 }}>{e.won}</td>
                  <td style={{ color: 'var(--dang)' }}>{e.lost}</td>
                  <td>{e.conv}%</td>
                  <td className="num">{fmtSum(e.sum)}</td>
                  <td className="num">{fmtSum(e.avgCheck)}</td>
                  <td>{e.calls}</td>
                  <td>{e.tasksDone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ── Qo'ng'iroqlar hisoboti ── */
function CallsReport({ params }) {
  const { data, loading } = useReport(crmService.analyticsCalls, params)
  if (loading || !data) return <Loading />
  const byDay = data.byDay || []
  return (
    <>
      <div className="grid g4 mb16">
        <Stat lab="Jami qo'ng'iroq" val={String(data.total ?? 0)} />
        <Stat lab="Kiruvchi / Chiquvchi" val={`${data.inbound ?? 0} / ${data.outbound ?? 0}`} />
        <Stat lab="O'tkazib yuborilgan" val={String(data.missed ?? 0)} />
        <Stat lab="O'rtacha davomiylik" val={fmtDur(data.avgDuration)} />
      </div>

      <div className="card mb16">
        <h4 style={{ margin: '0 0 14px' }}>Kunlik qo'ng'iroqlar</h4>
        {byDay.length === 0 ? <div className="sub2">Ma'lumot yo'q</div> : (
          <VBars bars={byDay.map((d) => ({ label: fmtDay(d.date).split(' ')[0], v: d.in + d.out, v2: d.missed, color: 'var(--info)', color2: 'var(--dang)', title: `${fmtDay(d.date)}: ${d.in + d.out} qo'ng'iroq`, title2: `${d.missed} o'tkazib yuborilgan` }))} />
        )}
      </div>

      <div className="card">
        <h4 style={{ margin: '0 0 14px' }}>Sotuvchilar bo'yicha</h4>
        {(data.byEmployee || []).length === 0 && <div className="sub2">Ma'lumot yo'q</div>}
        {(data.byEmployee || []).length > 0 && (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--mut)', fontSize: 12 }}>
              <th style={{ padding: '4px 0' }}>Sotuvchi</th><th>Jami</th><th>Javob berilgan</th><th>O'tkazib yub.</th><th>Umumiy</th><th>O'rtacha</th>
            </tr></thead>
            <tbody>
              {data.byEmployee.map((e) => (
                <tr key={e.id} style={{ borderTop: '1px solid var(--bd)' }}>
                  <td style={{ padding: '7px 0', fontWeight: 600 }}>{e.name}</td>
                  <td>{e.count}</td>
                  <td style={{ color: 'var(--ok)', fontWeight: 700 }}>{e.answered}</td>
                  <td style={{ color: 'var(--dang)' }}>{e.missed}</td>
                  <td>{fmtDur(e.totalDur)}</td>
                  <td>{fmtDur(e.avgDur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

/* ── Hodisalar hisoboti ── */
function EventsReport({ params }) {
  const [type, setType] = useState('')
  const merged = useMemo(() => ({ ...params, type: type || undefined }), [params, type])
  const { data, loading } = useReport(crmService.analyticsEvents, merged)
  const byType = data?.byType || []
  return (
    <div>
      <div className="fx ac gap8" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <button className={`btn sm ${type === '' ? 'primary' : ''}`} onClick={() => setType('')}>Barchasi</button>
        {byType.map((t) => (
          <button key={t.type} className={`btn sm ${type === t.type ? 'primary' : ''}`} onClick={() => setType(t.type)}>
            {EVENT_ICON[t.type] || '•'} {EVENT_LABEL[t.type] || t.type} <span className="sub2">({t.count})</span>
          </button>
        ))}
      </div>
      <div className="card">
        {loading || !data ? <Loading /> : (
          <>
            {(data.items || []).length === 0 && <div className="sub2">Hodisa yo'q</div>}
            {(data.items || []).map((e) => (
              <div key={e.id} className="fx ac gap10" style={{ padding: '9px 0', borderBottom: '1px solid var(--bd)', fontSize: 13 }}>
                <span style={{ fontSize: 17, width: 22, textAlign: 'center', flex: 'none' }}>{EVENT_ICON[e.type] || '•'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{e.text || EVENT_LABEL[e.type] || e.type}</div>
                  <div className="sub2" style={{ fontSize: 11.5 }}>
                    {e.actorName || '—'}{e.leadName ? ` · ${e.leadName}` : ''}
                  </div>
                </div>
                <span className="sub2" style={{ fontSize: 11.5, whiteSpace: 'nowrap', flex: 'none' }}>{fmtDT(e.createdAt)}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

/* ── Sotuv dinamikasi ── */
function TimelineReport({ params }) {
  const { data, loading } = useReport(crmService.analyticsTimeline, params)
  if (loading || !data) return <Loading />
  const buckets = data.buckets || []
  const totCreated = buckets.reduce((a, b) => a + b.created, 0)
  const totWon = buckets.reduce((a, b) => a + b.won, 0)
  const totWonSum = buckets.reduce((a, b) => a + b.wonSum, 0)
  return (
    <>
      <div className="grid g4 mb16">
        <Stat lab="Yaratilgan lidlar" val={String(totCreated)} />
        <Stat lab="Yutilgan sotuvlar" val={String(totWon)} variant="lime" />
        <Stat lab="Yutilgan summa" val={fmtSum(totWonSum)} />
      </div>
      <div className="card mb16">
        <h4 style={{ margin: '0 0 14px' }}>Yaratilgan lidlar (yashil = yutilgan)</h4>
        {buckets.length === 0 ? <div className="sub2">Ma'lumot yo'q</div> : (
          <VBars height={150} bars={buckets.map((b) => ({ label: fmtDay(b.date).split(' ')[0], v: b.created, v2: b.won, color: 'var(--info)', color2: 'var(--ok)', title: `${fmtDay(b.date)}: ${b.created} lid`, title2: `${b.won} yutilgan` }))} />
        )}
      </div>
      <div className="card">
        <h4 style={{ margin: '0 0 14px' }}>Yutilgan summa (kun bo'yicha)</h4>
        {buckets.length === 0 ? <div className="sub2">Ma'lumot yo'q</div> : (
          <VBars height={140} bars={buckets.map((b) => ({ label: fmtDay(b.date).split(' ')[0], v: b.wonSum, color: 'var(--lime)', title: `${fmtDay(b.date)}: ${fmtSum(b.wonSum)}` }))} />
        )}
      </div>
    </>
  )
}

/* ── Sotuv rejasi / maqsadlar ── */
function GoalsSection() {
  const [data, setData] = useState(null)
  const period = new Date().toISOString().slice(0, 7)
  const load = () => crmService.listGoals(period).then(setData).catch(() => setData({ goals: [], members: [] }))
  useEffect(() => { load() }, [])

  const addGoal = async () => {
    const members = data?.members || []
    const who = await dialog.prompt(`Reja kimga? (bo'sh = butun jamoa)\nSotuvchilar: ${members.map((m) => m.name).join(', ')}`, '')
    if (who === null) return
    const target = await dialog.prompt("Oylik sotuv maqsadi (so'm):", '')
    if (!target) return
    const m = members.find((x) => x.name === (who || '').trim())
    try { await crmService.upsertGoal({ userId: m?.id, period, metric: 'revenue', target: Number(target) || 0 }); load() }
    catch (e) { await dialog.alert(e.message) }
  }
  const remove = async (g) => { try { await crmService.deleteGoal(g.id); load() } catch (e) { await dialog.alert(e.message) } }

  if (!data) return <div className="card"><h4 style={{ margin: '0 0 14px' }}>Sotuv rejasi</h4><Loading /></div>
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <div className="fx jb ac" style={{ marginBottom: 14 }}>
        <h4 style={{ margin: 0 }}>Sotuv rejasi ({period})</h4>
        <button className="btn sm primary" onClick={addGoal}><Icon name="plus" size={12} />Reja</button>
      </div>
      {(data.goals || []).length === 0 && <div className="sub2">Reja belgilanmagan</div>}
      {(data.goals || []).map((g) => (
        <div key={g.id} style={{ marginBottom: 12 }}>
          <div className="fx jb ac" style={{ marginBottom: 4, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>{g.name}</span>
            <span className="fx ac gap8"><span className="sub2">{fmtSum(g.actual)} / {fmtSum(g.target)} · {g.pct}%</span><button className="hr-x" onClick={() => remove(g)}>×</button></span>
          </div>
          <div style={{ height: 8, background: 'var(--canvas)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, g.pct)}%`, height: '100%', background: g.pct >= 100 ? 'var(--ok)' : 'var(--lime)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}
