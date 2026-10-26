// Qo'ng'iroq hisobotlari (OnlinePBX «Отчёты»): 4 tur — Xodimlar guruhi, Xodim, O'tkazib yuborilganlar, Muvaffaqiyatli/muvaffaqiyatsiz.
import React, { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useT } from '../i18n'
import { useApi } from '../../lib/useApi'
import { crmService } from '../../services/crm.service'
import '../i18n/callreports.ru'
import '../calls.css'

const KINDS = [
  ['group', 'cr§Xodimlar guruhi', "cr§Qo'ng'iroqlar soni, suhbat vaqti"],
  ['employee', 'cr§Xodim', "cr§Qo'ng'iroqlar soni, davomiylik, sifat bahosi"],
  ['missed', "cr§O'tkazib yuborilganlar", "cr§Kutish vaqti, qayta qo'ng'iroq"],
  ['outcomes', "cr§Muvaffaqiyatli va muvaffaqiyatsiz", "cr§Javob berilgan, o'tkazib yuborilgan, javob bermagan"],
]
const today = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10)
const ago = (n) => new Date(Date.now() + 5 * 3_600_000 - n * 86_400_000).toISOString().slice(0, 10)
const hms = (s) => (s == null ? '—' : `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`)

function Bars({ series, keys, colors }) {
  const max = Math.max(1, ...series.map((d) => keys.reduce((a, k) => a + (d[k] || 0), 0)))
  return (
    <div className="ac-cr__bars">
      {series.map((d) => (
        <div key={d.day} className="ac-cr__bar" title={`${d.day}: ${keys.map((k) => `${k}=${Math.round(d[k] || 0)}`).join(', ')}`}>
          <div className="ac-cr__stack" style={{ height: 120 }}>
            {keys.map((k, i) => <i key={k} style={{ height: `${((d[k] || 0) / max) * 100}%`, background: colors[i] }} />)}
          </div>
          <span>{d.day.slice(5)}</span>
        </div>
      ))}
    </div>
  )
}

export default function CallReportsPage() {
  const t = useT()
  const { kind } = useParams()
  const [f, setF] = useState({ from: ago(6), to: today(), ext: '' })
  const [applied, setApplied] = useState(f)
  const { data, loading, error } = useApi(() => (kind ? crmService.callsStats(applied) : Promise.resolve(null)), [kind, JSON.stringify(applied)], `calls-stats:${JSON.stringify(applied)}`, 60000)
  return (
    <>
      <div className="ac-content ac-cl">
        {!kind && (
          <div className="ac-cr__cards">
            {KINDS.map(([k, l, d]) => <Link key={k} to={`/pbx/reports/${k}`} className="ac-cr__card"><b>{t(l)}</b><span>{t(d)}</span></Link>)}
          </div>
        )}
        {kind && (
          <>
            <div className="ac-cl__tabs">
              <Link to="/pbx/reports" className="ac-cr__back">← {t('cr§Hisobotlar')}</Link>
              {KINDS.map(([k, l]) => <Link key={k} to={`/pbx/reports/${k}`} className={kind === k ? 'on' : ''}>{t(l)}</Link>)}
            </div>
            <div className="ac-cr__filter">
              <input className="ac-input" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
              <input className="ac-input" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
              {kind === 'employee' && <input className="ac-input" placeholder={t('cr§Ichki raqam')} value={f.ext} onChange={(e) => setF({ ...f, ext: e.target.value })} />}
              <button type="button" className="ac-btn ac-btn--blue" onClick={() => setApplied(f)}>{t("cr§Qo'llash")}</button>
            </div>
            {error && !data && <div className="ac-cl__empty">{t(error.status === 400 ? 'cr§Davr 93 kundan oshmasin' : "cr§Yuklab bo'lmadi")}</div>}
            {data && kind === 'group' && (
              <>
                <Bars series={data.series} keys={['in', 'out', 'internal']} colors={['#2db26d', '#7c6cf0', '#b8bcc9']} />
                <Legend items={[['#2db26d', 'cr§Kiruvchi'], ['#7c6cf0', 'cr§Chiquvchi'], ['#b8bcc9', 'cr§Ichki']]} />
                <Employees list={data.employees} />
              </>
            )}
            {data && kind === 'employee' && (
              <>
                <Bars series={data.series} keys={['talkMin']} colors={['#2db26d']} />
                <Legend items={[['#2db26d', 'cr§Suhbat, daqiqa']]} />
                <Employees list={f.ext ? data.employees : data.employees.slice(0, 1)} detailed />
              </>
            )}
            {data && kind === 'missed' && <Missed m={data.missed} />}
            {data && kind === 'outcomes' && <Outcomes o={data.outcomes} />}
          </>
        )}
      </div>
    </>
  )
}

function Legend({ items }) {
  const t = useT()
  return <div className="ac-cr__legend">{items.map(([c, l]) => <span key={l}><i style={{ background: c }} />{t(l)}</span>)}</div>
}

function Employees({ list, detailed }) {
  const t = useT()
  if (!list.length) return <div className="ac-cl__empty">{t("cr§Ma'lumot yo'q")}</div>
  return (
    <div className="ac-cl__tablewrap">
      <table className="ac-cl__table">
        <thead><tr><th>{t('cr§Xodim')}</th><th>{t('cr§Kiruvchi')}</th><th>{t('cr§Chiquvchi')}</th><th>{t("cr§O'tkazib yuborilgan")}</th><th>{t('cr§Jami')}</th><th>{t('cr§Suhbat')}</th><th>{t("cr§O'rtacha suhbat")}</th>{detailed && <th>{t('cr§Sifat bahosi')}</th>}</tr></thead>
        <tbody>{list.map((e) => (
          <tr key={e.id}><td>{e.ext ? `${e.ext} ` : ''}{e.name}</td><td>{e.in}</td><td>{e.out}</td><td>{e.missed}</td><td>{e.total}</td><td>{hms(e.talkSec)}</td><td>{hms(e.avgTalkSec)}</td>{detailed && <td>{e.avgRating ?? '—'}{e.ratings ? ` (${e.ratings})` : ''}</td>}</tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function Missed({ m }) {
  const t = useT()
  return (
    <>
      <div className="ac-cr__kpis">
        <div><b>{m.count}</b><span>{t("cr§O'tkazib yuborilgan")}</span></div>
        <div><b>{m.calledBack}</b><span>{t("cr§Qayta qo'ng'iroq qilingan")}</span></div>
        <div><b>{m.calledBack15}</b><span>{t("cr§15 daqiqa ichida")}</span></div>
        <div><b>{hms(m.avgCallbackSec)}</b><span>{t("cr§O'rtacha qayta qo'ng'iroq vaqti")}</span></div>
        <div><b>{hms(m.avgWaitSec)}</b><span>{t("cr§O'rtacha kutish")}</span></div>
      </div>
      <div className="ac-cl__tablewrap">
        <table className="ac-cl__table">
          <thead><tr><th>{t('calls§Vaqt')}</th><th>{t('cr§Telefon')}</th><th>{t('cr§Kutish')}</th><th>{t("cr§Qayta qo'ng'iroq")}</th></tr></thead>
          <tbody>{m.list.map((x) => <tr key={x.id}><td>{new Date(x.at).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', hour12: false })}</td><td>{x.phone}</td><td>{hms(x.waitSec)}</td><td>{x.callbackSec == null ? t('cr§Qilinmagan') : hms(x.callbackSec)}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  )
}

function Outcomes({ o }) {
  const t = useT()
  const pct = (n) => (o.total ? Math.round((n / o.total) * 100) : 0)
  const rows = [['#2db26d', 'cr§Javob berilgan (suhbat bo\'lgan)', o.success], ['#e5484d', "cr§Kiruvchi, o'tkazib yuborilgan", o.missedIn], ['#f0a000', "cr§Chiquvchi, javob bermagan", o.failedOut]]
  return (
    <div style={{ maxWidth: 560 }}>
      <div className="ac-cr__kpis"><div><b>{o.total}</b><span>{t('cr§Jami')}</span></div></div>
      {rows.map(([c, l, n]) => (
        <div key={l} className="ac-cr__outrow"><span>{t(l)}</span><div className="ac-cr__meter"><i style={{ width: `${pct(n)}%`, background: c }} /></div><b>{n} · {pct(n)}%</b></div>
      ))}
    </div>
  )
}
