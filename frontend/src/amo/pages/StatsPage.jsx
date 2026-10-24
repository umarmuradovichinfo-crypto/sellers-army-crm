// amoCRM "Аналитика" — /stats/pipeline | /stats/consolidated | /stats/by_activities | /events/list | /stats/calls | /stats/goals
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { crmService } from '../../services/crm.service'
import { useApi } from '../../lib/useApi'
import SectionAside from '../SectionAside'
import { Ico } from '../AmoIcons'
import { money } from '../format'
import { useT, usePlural } from '../i18n'
import {
  ASIDE_ITEMS, SERIES, StatsHead, Tabs, Spin, useParams, defaultFilter, byUsers, periodLabel, num, iso,
} from './StatsCommon'
import { StatsEvents, StatsCalls, StatsGoals } from './StatsMore'

const stageColor = (s, i) => s.color || SERIES[i % SERIES.length]

/* ── Sotuv tahlili ── */
function Arrow({ fill, stroke }) {
  return (
    <svg viewBox="0 0 167 82" preserveAspectRatio="none">
      <polygon points="1,1 150,1 166,41 150,81 1,81" fill={fill || 'none'} stroke={stroke || 'var(--palette-border-primary)'} strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// amoCRM sotuv tahlili pastki voronkasi: har qator — bosqichga yetganlar % (jami ichida), chapda bosqichda o'rtacha turgan vaqt (Gantt)
function FlowFunnel({ rows, mode }) {
  const plural = usePlural()
  const t = useT()
  const W = 320
  const maxSum = Math.max(1, ...rows.map((r) => r.sum))
  const totalDays = Math.max(1, rows.reduce((a, r) => a + (r.avgDays || 0), 0))
  let acc = 0
  return (
    <div className="ac-flow">
      {rows.map((r, i) => {
        const pct = mode === 'sum' ? Math.round((r.sum / maxSum) * 100) : r.pct
        const w = Math.max(4, (pct / 100) * W)
        const left = (acc / totalDays) * 100
        const width = ((r.avgDays || 0) / totalDays) * 100
        acc += r.avgDays || 0
        return (
          <div className="ac-flow__row" key={r.key}>
            <div className="ac-flow__gantt">
              {r.avgDays != null && <div className="ac-flow__span" style={{ left: `${left}%`, width: `${Math.max(0.5, width)}%`, '--c': r.color }}><i>{Math.round(r.avgDays)}{t(' kun')}</i></div>}
            </div>
            <div className="ac-stats-bar__pct">{pct}%</div>
            <svg viewBox={`0 0 ${W} 30`} preserveAspectRatio="none" className="ac-flow__svg">
              <polygon points={`${W - w},0 ${W},0 ${W},30 ${W - w + Math.min(10, w / 3)},30`} fill={r.color} style={{ transition: 'all .4s' }} />
            </svg>
            <div className="ac-stats-bar__info">
              <div>{r.name}</div>
              <div><u>{plural(r.count, 'bitim')}</u> {money(r.sum)}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// "НЕРАЗОБРАННОЕ": o'rtacha ishlov vaqti, kelgan arizalar (kanal bo'yicha) va bitimga o'tganlar
function UnsortedBox({ u }) {
  const t = useT()
  const max = Math.max(1, u.incoming)
  const ch = Object.entries(u.byChannel || {})
  const CH = { chat: 'Chat', form: 'Forma', phone: "Qo'ng'iroq", other: 'Boshqa' }
  return (
    <div className="ac-stats-box ac-unsbox">
      <div className="ac-unsbox__left">
        <div className="ac-stats-box__title">{t('Saralanmagan')}</div>
        <div className="ac-unsbox__days"><b>{Math.round(u.avgDays)}</b> {t('kun')}</div>
        <div className="ac-unsbox__line" style={{ width: `${Math.min(100, 10 + u.avgDays * 4)}%` }} />
        <div className="ac-unsbox__cap">{t("Arizaga ishlov berishning o'rtacha vaqti")}</div>
      </div>
      <div className="ac-unsbox__right">
        <div className="ac-unsbox__row">
          <span className="num">{num(u.incoming)}</span>
          <div className="ac-unsbox__bar in" style={{ width: '100%' }}>
            {ch.map(([k, v]) => <span key={k} style={{ flex: v }} title={`${t(CH[k] || k)}: ${v}`}><em>{t(CH[k] || k)}</em>{v}</span>)}
          </div>
          <span className="lbl">{t('Kiruvchi arizalar')}</span>
        </div>
        <div className="ac-unsbox__row">
          <span className="num">{num(u.converted)}</span>
          <div className="ac-unsbox__bar out" style={{ width: `${Math.max(3, (u.converted / max) * 100)}%` }} />
          <span className="lbl">{t("Bitimga o'tdi")}</span>
        </div>
      </div>
    </div>
  )
}

// "ПРОГНОЗ ПРОДАЖ": hozirgi faol bitimlar va 30/60/90 kunlik prognoz; kam ma'lumotda — amoCRM kabi parda
function ForecastBox({ f }) {
  const t = useT()
  const plural = usePlural()
  const cols = [['now', 'Hozir faol bitimlarda', f.active], ['d30', 'Sotuv prognozi 30 kundan keyin', f.d30], ['d60', '60 kundan keyin', f.d60], ['d90', '90 kundan keyin', f.d90]]
  return (
    <div className={`ac-stats-box ac-fcbox ${f.enough ? '' : 'thin'}`}>
      <div className="ac-stats-box__title">{t('Sotuv prognozi')}</div>
      <div className="ac-fcbox__grid">
        {cols.map(([k, l, v]) => (
          <div key={k} className="ac-fcbox__col">
            <div className="ac-fcbox__lbl">{t(l)}</div>
            <div className="ac-fcbox__val">{plural(v.count, 'bitim')}</div>
            <div className="ac-fcbox__sum">{money(v.sum)}</div>
          </div>
        ))}
        <div className="ac-fcbox__ring"><small>{t('Sotuv sikli')}</small><b>{f.cycleDays}</b><small>{t('kun')}</small></div>
      </div>
      {!f.enough && <div className="ac-fcbox__veil"><Ico name="list" size={30} /><span>{t("Grafik qurish uchun ma'lumot kam")}</span></div>}
    </div>
  )
}

function SalesPipeline({ filter, params }) {
  const t = useT()
  const [tab, setTab] = useState('closed')
  const [mode, setMode] = useState('count')
  const pipelineId = params.pipelineId || 'main' // sotuv tahlili bitta voronka bo'yicha (aralash bosqichlar bo'lmasin)
  // "Сейчас" — davrsiz joriy holat, lekin maydon/UTM filtrlari qo'llanadi
  const { from: _f, to: _t, ...nowParams } = params
  const cur = useApi(() => crmService.analytics({ ...nowParams, pipelineId }), [JSON.stringify(nowParams), pipelineId], null)
  const per = useApi(() => crmService.analytics({ ...params, pipelineId }), [JSON.stringify(params), pipelineId], null)
  const flow = useApi(() => crmService.analyticsFlow({ ...params, pipelineId }), [JSON.stringify(params), pipelineId], null)
  if (!cur.data || !per.data) return <Spin />
  const funnel = cur.data.funnel || []
  const pf = per.data.funnel || []
  const pfBy = new Map(pf.map((f) => [f.key, f]))
  const open = funnel.filter((f) => f.kind !== 'won' && f.kind !== 'lost')
  const wonF = per.data.cards || {}
  const fl = flow.data?.flow?.[tab]
  const colorOf = new Map((flow.data?.stages || []).map((x, i) => [x.key, stageColor(x, i)]))
  const nameOf = new Map((flow.data?.stages || []).map((x) => [x.key, x.name]))
  const rows = fl ? [
    ...(fl.unsorted.count > 0 ? [{ key: '_uns', name: t('Saralanmagan'), color: '#c1c1c1', ...fl.unsorted }] : []),
    ...fl.stages.map((x) => ({ ...x, name: nameOf.get(x.key), color: colorOf.get(x.key) })),
    ...(tab !== 'active' ? [
      { key: '_won', name: t('Muvaffaqiyatli yopildi'), color: '#ccff66', ...fl.won, avgDays: null },
      { key: '_lost', name: t('Yopildi va amalga oshmadi'), color: '#d5d8db', ...fl.lost, avgDays: null },
    ] : []),
  ] : []
  const avg = Math.round(fl?.avgDays || 0)
  return (
    <div className="ac-stats-body">
      <div className="ac-stats-box">
        <div className="ac-stats-box__title">{t('Bitimlar')}</div>
        <div className="ac-stats-deals">
          <div className="ac-stats-deals__new"><small>{t('Yangi')}</small><b>{num(per.data.cards?.total)}</b></div>
          <div className="ac-stats-deals__rows">
            <div className="ac-stats-rowlab r1">{t('Hozir')}</div>
            <div className="ac-stats-rowlab r2">{t("Bosqichga o'tdi")}</div>
            <div className="ac-stats-rowlab r3">{t("Yo'qotilgan")}</div>
          </div>
          <div className="ac-stats-cols">
            {open.map((f, i) => {
              const p = pfBy.get(f.key) || { count: 0, sum: 0 }
              return (
                <div className="ac-stats-col" key={f.key}>
                  <div className="ac-stats-col__top" style={{ '--c': stageColor(f, i) }}>
                    <div className="ac-stats-col__name">{f.name}</div>
                    <div className="ac-stats-col__val">{num(f.count)}</div>
                    <div className="ac-stats-col__val">{money(f.sum)}</div>
                  </div>
                  <div className="ac-stats-col__arrow"><Arrow /><span><b>{num(p.count)}</b>{money(p.sum)}</span></div>
                  <div className="ac-stats-col__lost">0 , 0 {t("so'm")}</div>
                </div>
              )
            })}
            <div className="ac-stats-col won">
              <div className="ac-stats-col__top" style={{ '--c': 'var(--ac-stats-c2)' }}>
                <div className="ac-stats-col__name">{t('stats§Yutilgan')}</div>
              </div>
              <div className="ac-stats-col__arrow"><Arrow fill="var(--ac-stats-c2)" stroke="transparent" /><span><b>{num(wonF.won)}</b>{money(wonF.wonSum)}</span></div>
              <div className="ac-stats-col__lost">{t('Yutqazilgan')}{wonF.lost ? ` · ${num(wonF.lost)}` : ''}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="ac-stats-box">
        <div className="ac-stats-toolbar">
          <Tabs value={tab} onChange={setTab} options={[['all', 'Barchasi'], ['active', 'stats§Faol'], ['closed', 'stats§Yopilgan']]} />
          <Tabs value={mode} onChange={setMode} options={[['sum', "Byudjet bo'yicha"], ['count', "Soni bo'yicha"]]} />
        </div>
        <div className="ac-flow__wrap">
          {!flow.data ? <Spin /> : rows.length === 0 || !fl?.total ? <div className="ac-stats-empty">{t("Ma'lumot yo'q")}</div> : <FlowFunnel rows={rows} mode={mode} />}
          <div className="ac-stats-fun__avg ac-flow__avg"><b>{avg}{t(' kun')}</b><span>{t("Bitimning o'rtacha davomiyligi")}</span></div>
        </div>
      </div>
      {flow.data && <UnsortedBox u={flow.data.unsorted} />}
      {flow.data && <ForecastBox f={flow.data.forecast} />}
    </div>
  )
}

/* ── Umumiy hisobot ── */
function LineChart({ buckets, labelFmt }) {
  const W = 1200, H = 380, L = 56, R = 18, T = 16, B = 26
  const n = Math.max(1, buckets.length)
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.created, b.won)))
  const x = (i) => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1))
  const y = (v) => T + (1 - v / max) * (H - T - B)
  const ticks = [0, 1, 2, 3, 4, 5, 6].map((k) => (max * k) / 6)
  const line = (key) => buckets.map((b, i) => `${x(i)},${y(b[key])}`)
  const seg = (key, color) => {
    const pts = line(key)
    return (
      <>
        <polyline className="ln" stroke={color} points={pts.slice(0, Math.max(2, pts.length - 1)).join(' ')} />
        {pts.length > 2 && <polyline className="ln" stroke="var(--palette-text-secondary-light)" points={pts.slice(-2).join(' ')} />}
        {buckets.map((b, i) => (
          <circle key={i} cx={x(i)} cy={y(b[key])} r="4.5" fill={i === n - 1 && n > 2 ? 'var(--palette-text-secondary-light)' : color}>
            <title>{`${labelFmt(b.date)}: ${b[key]}`}</title>
          </circle>
        ))}
      </>
    )
  }
  const step = Math.ceil(n / 14)
  return (
    <svg viewBox={`0 0 ${W} ${H}`}>
      {ticks.map((v, i) => (
        <g key={i}>
          <line className="ac-gridline" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
          <text x={L - 6} y={y(v) + 3} textAnchor="end">{Number.isInteger(v) ? v : v.toFixed(1)}</text>
        </g>
      ))}
      {buckets.map((b, i) => <line key={i} className="ac-gridline" x1={x(i)} x2={x(i)} y1={T} y2={H - B + 6} />)}
      {buckets.map((b, i) => (i % step === 0 ? <text key={i} x={x(i)} y={H - 6} textAnchor="middle">{labelFmt(b.date)}</text> : null))}
      {seg('created', 'var(--ac-stats-c1)')}
      {seg('won', 'var(--ac-stats-c2)')}
    </svg>
  )
}

function Donut({ items, total }) {
  const t = useT()
  const R = 112, C = 2 * Math.PI * R
  let acc = 0
  const sum = items.reduce((a, x) => a + x.count, 0) || 1
  return (
    <div className="ac-stats-donut">
      <svg viewBox="0 0 260 260">
        <circle cx="130" cy="130" r={R} fill="none" stroke="var(--palette-border-primary)" strokeWidth="6" />
        {items.map((it, i) => {
          const len = (it.count / sum) * C
          const el = <circle key={it.key} cx="130" cy="130" r={R} fill="none" stroke={it.color} strokeWidth="6" strokeDasharray={`${Math.max(0, len - 3)} ${C}`} strokeDashoffset={-acc} />
          acc += len
          return el
        })}
      </svg>
      <div className="ac-stats-donut__mid">
        <small>{money(total.sum)}</small>
        <b>{num(total.count)}</b>
        <span>{t('Jami bitim')}</span>
      </div>
    </div>
  )
}

function Consolidated({ filter, params }) {
  const t = useT()
  const plural = usePlural()
  const [gran, setGran] = useState('week')
  const range = useMemo(() => {
    if (filter.preset === 'range' || filter.preset === 'today' || filter.preset === 'yesterday' || filter.preset === 'week' || filter.preset === 'month') {
      if (params.from) return { from: params.from, to: params.to }
    }
    const d = new Date()
    const back = gran === 'day' ? 30 : gran === 'week' ? 30 * 7 : 365
    return { from: iso(new Date(d.getTime() - back * 86400000)), to: iso(d) }
  }, [filter, params.from, params.to, gran])
  const userIds = filter.userIds.join(',') || undefined
  const tl = useApi(() => crmService.analyticsTimeline({ ...range, pipelineId: params.pipelineId, granularity: gran === 'week' ? 'week' : 'day', userIds }), [JSON.stringify(range), params.pipelineId, gran, userIds], null)
  const ov = useApi(() => crmService.analytics({ ...params, userIds }), [JSON.stringify(params), userIds], null)
  const emp = useApi(() => crmService.analyticsEmployees(params), [JSON.stringify(params)], null)
  const buckets = useMemo(() => {
    const b = tl.data?.buckets || []
    if (gran !== 'month') return b
    const m = new Map()
    for (const x of b) {
      const k = x.date.slice(0, 7) + '-01'
      const e = m.get(k) || { date: k, created: 0, won: 0, wonSum: 0 }
      e.created += x.created; e.won += x.won; e.wonSum += x.wonSum
      m.set(k, e)
    }
    return [...m.values()]
  }, [tl.data, gran])
  const labelFmt = (d) => { const x = new Date(d); return gran === 'month' ? `${String(x.getMonth() + 1).padStart(2, '0')}.${x.getFullYear()}` : `${String(x.getDate()).padStart(2, '0')}.${String(x.getMonth() + 1).padStart(2, '0')}` }

  const funnel = (ov.data?.funnel || []).map((f, i) => ({ ...f, color: stageColor(f, i) })).filter((f) => f.count > 0).sort((a, b) => b.count - a.count)
  const total = funnel.reduce((a, f) => ({ count: a.count + f.count, sum: a.sum + f.sum }), { count: 0, sum: 0 })
  const rows = byUsers(Array.isArray(emp.data) ? emp.data : [], filter).filter((r) => r.leads > 0).sort((a, b) => b.leads - a.leads)
  const rowTotal = rows.reduce((a, r) => a + r.leads, 0) || 1
  const pct = (v, tot) => `${Math.round((v / (tot || 1)) * 100)}%`
  return (
    <div className="ac-stats-body">
      <div className="ac-stats-box">
        <div className="ac-stats-box__title">{t('Bitimlar')}</div>
        <Tabs center value={gran} onChange={setGran} options={[['day', 'Kunlar bo\'yicha'], ['week', 'Haftalar bo\'yicha'], ['month', 'Oylar bo\'yicha']]} />
        <div className="ac-stats-chart">{tl.data ? (buckets.length ? <LineChart buckets={buckets} labelFmt={labelFmt} /> : <div className="ac-stats-empty">{t("Ma'lumot yo'q")}</div>) : <Spin />}</div>
      </div>
      <div className="ac-stats-box">
        <div className="ac-stats-box__title">{t('Bitimlar')}</div>
        {!ov.data ? <Spin /> : (
          <div className="ac-stats-sum">
            <div>
              <div className="ac-stats-sum__cap">{t('Sotuv bosqichlari')}</div>
              {funnel.map((f) => (
                <div className="ac-stats-sum__row" key={f.key}>
                  <div className="ac-stats-sum__pct">{pct(f.count, total.count)}</div>
                  <div className="ac-stats-sum__txt" style={{ '--c': f.color }}><div>{f.name}</div><div>{plural(f.count, 'bitim')}, {money(f.sum)}</div></div>
                </div>
              ))}
            </div>
            <Donut items={funnel} total={total} />
            <div>
              <div className="ac-stats-sum__cap">{t('Menejer bo\'yicha bitimlar')}</div>
              {rows.map((r, i) => (
                <div className="ac-stats-sum__row" key={r.id}>
                  <div className="ac-stats-sum__pct">{pct(r.leads, rowTotal)}</div>
                  <div className="ac-stats-sum__txt" style={{ '--c': SERIES[i % SERIES.length] }}><div>{r.name}</div><div>{plural(r.leads, 'bitim')}, {money(r.leadSum)}</div></div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Xodimlar bo'yicha hisobot ── */
function ByActivities({ filter, params }) {
  const t = useT()
  const navigate = useNavigate()
  const { data } = useApi(() => crmService.analyticsEmployees(params), [JSON.stringify(params)], null)
  if (!data) return <Spin />
  const rows = byUsers(Array.isArray(data) ? data : (data.rows || []), filter)
  return (
    <div className="ac-stats-emp">
      <table className="ac-table">
        <thead><tr>
          <th>{t('Nomi')}</th><th>{t('Ishdagi bitimlar')}</th><th>{t("Qo'shilgan izohlar")}</th><th>{t('Ishdagi vazifalar')}</th><th>{t('Xaridlar summasi')}</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><a onClick={() => navigate(`/events/list?user=${r.id}`)}>{r.name}</a></td>
              <td className="r">{r.leads ? `${num(r.leads)} (${money(r.leadSum)})` : ''}</td>
              <td className="l">{r.notes || ''}</td>
              <td className="l">{r.tasksOpen || ''}</td>
              <td className="r">{r.won ? `${num(r.won)} (${money(r.sum)})` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="ac-stats-empty">{t("Ma'lumot yo'q")}</div>}
    </div>
  )
}

/* ── Sahifa ── */
const SECTIONS = {
  pipeline: { title: 'Sotuv tahlili', fields: ['period', 'pipeline1', 'cf'], preset: 'month' },
  consolidated: { title: 'Umumiy hisobot', fields: ['period', 'pipeline', 'users', 'cf'], preset: 'all' },
  by_activities: { title: "Barcha xodimlar bo'yicha hisobot", fields: ['period', 'users'], preset: 'week' },
  events: { title: '', fields: [], preset: 'all' },
  calls: { title: "Qo'ng'iroqlar", fields: ['period', 'users'], preset: 'month' },
  goals: { title: 'Bitimlar bo\'yicha maqsadlar', fields: ['users'], preset: 'month' },
}

export default function StatsPage({ section = 'pipeline' }) {
  // /stats keyingi safar shu hisobotni ochadi (amoCRM)
  useEffect(() => { try { localStorage.setItem('amo_stats_last', section) } catch { /* */ } }, [section])
  const cfg = SECTIONS[section] || SECTIONS.pipeline
  return <StatsInner key={section} section={section} cfg={cfg} />
}

function StatsInner({ section, cfg }) {
  const t = useT()
  const [filter, setFilter] = useState(() => defaultFilter(cfg.preset))
  const params = useParams(filter, cfg.fields.includes('pipeline') || cfg.fields.includes('pipeline1'))
  const pipes = useApi(() => crmService.listPipelines(), [], 'stats-pipes')
  const mem = useApi(() => crmService.listMembers(), [], 'stats-members')
  const pipelines = pipes.data?.pipelines || []
  const members = mem.data?.members || []
  const [gsOpen, setGsOpen] = useState(false)

  const head = section === 'events' ? null : (
    <StatsHead
      title={cfg.title} plain={section === 'goals'} filter={filter} setFilter={setFilter} fields={cfg.fields}
      pipelines={pipelines} members={members} right={section === 'goals' ? <button className="ac-stats-fbtn" onClick={() => setGsOpen(true)}><Ico name="gear" size={14} />{t('Maqsadlar sozlamalari')}</button> : null}
    >
      {section === 'by_activities' ? <>{t(cfg.title)} <u>{periodLabel(filter)}</u></> : null}
    </StatsHead>
  )
  return (
    <>
      <SectionAside title="Analitika" items={ASIDE_ITEMS} collapsible="stats" />
      <div className="ac-content ac-stats">
        {head}
        {section === 'pipeline' && <SalesPipeline filter={filter} params={params} />}
        {section === 'consolidated' && <Consolidated filter={filter} params={params} />}
        {section === 'by_activities' && <ByActivities filter={filter} params={params} />}
        {section === 'events' && <StatsEvents members={members} />}
        {section === 'calls' && <StatsCalls filter={filter} params={params} />}
        {section === 'goals' && <StatsGoals filter={filter} members={members} settingsOpen={gsOpen} onCloseSettings={() => setGsOpen(false)} />}
      </div>
    </>
  )
}
