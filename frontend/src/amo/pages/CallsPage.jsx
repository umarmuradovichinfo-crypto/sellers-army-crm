// «Qo'ng'iroqlar jurnali» (OnlinePBX «Звонки» uslubida): tablar, plitalar, jadval, filtr paneli, jami. Analitika bo'limida.
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { useApi } from '../../lib/useApi'
import { crmService } from '../../services/crm.service'
import '../i18n/calls.ru'
import '../calls.css'

const TILES = [['all', 'calls§Hammasi'], ['in', 'calls§Kiruvchi'], ['out', 'calls§Chiquvchi'], ['internal', 'calls§Ichki'], ['missed', "calls§O'tkazib yuborilgan"], ['notcalledback', "calls§Qayta qo'ng'iroq qilinmagan"], ['notanswered', 'calls§Javob bermagan'], ['rated', 'calls§Baholangan']]
const TZ = 'Asia/Tashkent'
const today = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10)
const mmss = (s) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
const fmtAt = (iso) => { try { return new Date(iso).toLocaleString('ru-RU', { timeZone: TZ, hour12: false, day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(',', '') } catch { return '' } }
const ARROW = { in: '↙', out: '↗', internal: '↔' }

export default function CallsPage() {
  const t = useT()
  const [tab, setTab] = useState('all')
  const [kind, setKind] = useState('all')
  const [draft, setDraft] = useState({ from: today(), to: today(), ext: '', phone: '', rating: '', durMin: '', durMax: '', talkMin: '', talkMax: '' })
  const [applied, setApplied] = useState(draft)
  const params = { ...applied, tab, kind }
  const { data, loading, error } = useApi(() => crmService.callsReport(params), [JSON.stringify(params)], `calls-report:${JSON.stringify(params)}`, 30000)
  const [play, setPlay] = useState({}) // id → blob url | 'err'
  const listen = async (id) => {
    try { const b = await crmService.recordingBlob(id); setPlay((p) => ({ ...p, [id]: URL.createObjectURL(b) })) } catch { setPlay((p) => ({ ...p, [id]: 'err' })) }
  }
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }))
  const tiles = data?.tiles || {}
  const tot = data?.totals || { count: 0, talkSec: 0, roundedMinutes: 0, totalSec: 0 }

  return (
    <>
      <div className="ac-content ac-cl">
        <div className="ac-cl__head">
          <div className="ac-cl__tabs">
            {[['all', 'calls§Barcha qo\'ng\'iroqlar'], ['talks', 'calls§Suhbatlar']].map(([k, l]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(l)}</button>)}
          </div>
        </div>
        <div className="ac-cl__tiles">
          {TILES.map(([k, l]) => (
            <button key={k} type="button" className={`ac-cl__tile ac-cl__tile--${k} ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
              <span>{t(l)}</span><b>{tiles[k] ?? 0}</b>
            </button>
          ))}
        </div>
        <div className="ac-cl__main">
          <div className="ac-cl__tablewrap">
            {error && !data && <div className="ac-cl__empty">{t('calls§Yuklab bo\'lmadi')}</div>}
            {loading && !data && <div className="ac-cl__empty">{t('Yuklanmoqda…')}</div>}
            {data && (
              <table className="ac-cl__table">
                <thead><tr><th /><th>{t('calls§Vaqt')}</th><th>{t('calls§Kim')}</th><th>{t('calls§Kimga')}</th><th>{t('calls§Jiringlash')}</th><th>{t('calls§Suhbat')}</th><th>{t('calls§Baho')}</th><th>{t('calls§Natija')}</th><th /></tr></thead>
                <tbody>
                  {data.calls.length === 0 && <tr><td colSpan={9} className="ac-cl__empty">{t("calls§Tanlangan davrda qo'ng'iroq yo'q")}</td></tr>}
                  {data.calls.map((c) => {
                    const mine = c.userName ? `${c.ext || ''} ${c.userName}`.trim() : (c.ext || '')
                    const from = c.kind === 'in' ? c.phone : mine
                    const to = c.kind === 'in' ? mine : c.phone
                    return (
                      <React.Fragment key={c.id}>
                        <tr className={c.status === 'missed' || (c.kind === 'out' && c.talkSec === 0) ? 'bad' : ''}>
                          <td className={`ac-cl__ico ${c.kind}`}>{ARROW[c.kind] || '↗'}</td>
                          <td>{fmtAt(c.at)}</td>
                          <td>{from}</td>
                          <td>{to}{c.leadId && <> · <Link to={`/leads/${c.leadId}`}>{c.leadName || t('calls§Bitim')}</Link></>}</td>
                          <td>{mmss(c.ringSec)}</td>
                          <td>{mmss(c.talkSec)}</td>
                          <td>{c.rating ? '★'.repeat(c.rating) + '☆'.repeat(5 - c.rating) : ''}</td>
                          <td>{c.result ? t(`calls§${c.result}`) : ''}</td>
                          <td>{c.hasRecording && play[c.id] === undefined && <button type="button" className="ac-cl__play" title={t('calls§Yozuvni tinglash')} onClick={() => listen(c.id)}>▶</button>}</td>
                        </tr>
                        {play[c.id] && <tr><td colSpan={9}>{play[c.id] === 'err' ? t('calls§Yozuv topilmadi') : <audio controls autoPlay src={play[c.id]} style={{ width: '100%' }} />}</td></tr>}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}
            <div className="ac-cl__foot">
              <span><b>{tot.count}</b> {t('calls§qo\'ng\'iroq')}</span>
              <span>{mmss(tot.talkSec)} {t('calls§suhbat')}</span>
              <span>{tot.roundedMinutes} {t('calls§daqiqa (to\'liq daqiqagacha yaxlitlangan)')}</span>
              <span>{mmss(tot.totalSec)} {t('calls§umumiy davomiylik')}</span>
            </div>
          </div>
          <aside className="ac-cl__filter">
            <h4>{t('calls§FILTR')}</h4>
            <label>{t('calls§Dan')}<input className="ac-input" type="date" value={draft.from} onChange={(e) => set('from', e.target.value)} /></label>
            <label>{t('calls§Gacha')}<input className="ac-input" type="date" value={draft.to} onChange={(e) => set('to', e.target.value)} /></label>
            <label>{t('calls§Ichki raqam (xodim)')}<input className="ac-input" value={draft.ext} onChange={(e) => set('ext', e.target.value)} /></label>
            <label>{t('calls§Mijoz telefoni')}<input className="ac-input" value={draft.phone} onChange={(e) => set('phone', e.target.value)} /></label>
            <label>{t('calls§Baho')}<select className="ac-select" value={draft.rating} onChange={(e) => set('rating', e.target.value)}><option value="">{t('calls§Hammasi')}</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            <div className="ac-cl__range"><span>{t('calls§Qo\'ng\'iroq davomiyligi, soniya')}</span><input className="ac-input" type="number" placeholder={t('calls§dan')} value={draft.durMin} onChange={(e) => set('durMin', e.target.value)} /><input className="ac-input" type="number" placeholder={t('calls§gacha')} value={draft.durMax} onChange={(e) => set('durMax', e.target.value)} /></div>
            <div className="ac-cl__range"><span>{t('calls§Suhbat davomiyligi, soniya')}</span><input className="ac-input" type="number" placeholder={t('calls§dan')} value={draft.talkMin} onChange={(e) => set('talkMin', e.target.value)} /><input className="ac-input" type="number" placeholder={t('calls§gacha')} value={draft.talkMax} onChange={(e) => set('talkMax', e.target.value)} /></div>
            <button type="button" className="ac-btn ac-btn--blue" onClick={() => setApplied(draft)}>{t('calls§Qo\'llash')}</button>
          </aside>
        </div>
      </div>
    </>
  )
}
