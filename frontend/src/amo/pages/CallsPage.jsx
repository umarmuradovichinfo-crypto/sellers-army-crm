// «Qo'ng'iroqlar jurnali» (OnlinePBX «Звонки» uslubida): tablar, plitalar, jadval, filtr paneli, jami. Analitika bo'limida.
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { useApi } from '../../lib/useApi'
import { crmService } from '../../services/crm.service'
import '../i18n/calls.ru'
import '../calls.css'

const TILES = [['all', 'calls§Hammasi'], ['in', 'calls§Kiruvchi'], ['out', 'calls§Chiquvchi'], ['internal', 'calls§Ichki'], ['missed', "calls§O'tkazib yuborilgan"], ['notcalledback', "calls§Qayta qo'ng'iroq qilinmagan"], ['notanswered', 'calls§Javob bermagan'], ['rated', 'calls§Baholangan'], ['callback', 'calls§Callback']]
const TZ = 'Asia/Tashkent'
const today = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10)
const mmss = (s) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
const fmtAt = (iso) => { try { return new Date(iso).toLocaleString('ru-RU', { timeZone: TZ, hour12: false, day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(',', '') } catch { return '' } }
const ARROW = { in: '↙', out: '↗', internal: '↔' }

const Chev = () => <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="#a8a4b9" strokeWidth="1.2" strokeLinecap="round"><path d="M1 1l4 4 4-4" /></svg>

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
  const [dateOpen, setDateOpen] = useState(false)
  const [tilesOff, setTilesOff] = useState(false)
  const ddmmyyyy = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '')
  const rangeLabel = draft.from === draft.to ? `${draft.from === today() ? t('calls§Bugun') + ', ' : ''}${ddmmyyyy(draft.from)}` : `${ddmmyyyy(draft.from)} – ${ddmmyyyy(draft.to)}`
  const preset = (days) => { const to = today(); const from = new Date(Date.now() + 5 * 3_600_000 - days * 86_400_000).toISOString().slice(0, 10); setDraft((d) => ({ ...d, from, to })); setDateOpen(false) }
  const dl = async (id) => { try { const b = await crmService.recordingBlob(id); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `call-${id}.mp3`; a.click() } catch { setPlay((p) => ({ ...p, [id]: 'err' })) } }
  const tiles = data?.tiles || {}
  const tot = data?.totals || { count: 0, talkSec: 0, roundedMinutes: 0, totalSec: 0 }

  const exportCsv = () => {
    const rows = [[t('calls§Vaqt'), t('calls§Kim'), t('calls§Kimga'), t('calls§Jiringlash'), t('calls§Suhbat'), t('calls§Baho'), t('calls§Natija')]]
    for (const c of data?.calls || []) rows.push([fmtAt(c.at), c.kind === 'in' ? c.phone : `${c.ext || ''} ${c.userName || ''}`.trim(), c.kind === 'in' ? `${c.ext || ''} ${c.userName || ''}`.trim() : c.phone, mmss(c.ringSec), mmss(c.talkSec), c.rating || '', c.result || ''])
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' })); a.download = 'calls.csv'; a.click()
  }
  const splitDt = (iso) => { const s = fmtAt(iso).split(' '); return [s[1] || '', s[0] || ''] }

  return (
    <div className="pbxc">
      <div className="pbxc__main">
        <div className="pbxc__head">
          <div className="pbxc__tabs">
            {[['all', 'calls§Barcha qo\'ng\'iroqlar'], ['talks', 'calls§Suhbatlar']].map(([k, l]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(l)}</button>)}
          </div>
          <button type="button" className="pbxc__ico" title={t('calls§Eksport (CSV)')} onClick={exportCsv}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#797199" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v8M4.5 7L8 10.5 11.5 7M2.5 13h11" /></svg></button>
        </div>
        <div className="pbxc__fold"><button type="button" onClick={() => setTilesOff((v) => !v)} aria-label="toggle"><svg width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="#797199" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: tilesOff ? 'rotate(180deg)' : 'none' }}><path d="M1 1.5l5 5 5-5" /></svg></button></div>
        {!tilesOff && <div className="pbxc__tiles">
          {TILES.map(([k, l]) => (
            <button key={k} type="button" className={`pbxc__tile pbxc__tile--${k} ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
              <span>{t(l)}</span><b>{tiles[k] ?? 0}</b>
            </button>
          ))}
        </div>}
        <div className="pbxc__tablewrap">
          {error && !data && <div className="ac-cl__empty">{t('calls§Yuklab bo\'lmadi')}</div>}
          {data && (
            <table className="pbxc__table">
              <thead><tr><th>{t('calls§Tur')}</th><th className="dark">{t('calls§Vaqt')}</th><th>{t('calls§Kim')}</th><th>{t('calls§Kimga')}</th><th>{t('calls§Tashqi raqam')}</th><th>{t('calls§Jiringlash')}</th><th>{t('calls§Suhbat')}</th><th>{t('calls§Baho')}</th><th>{t('calls§Natija')}</th><th>{t('calls§Yuklangan')}</th><th /></tr></thead>
              <tbody>
                {data.calls.length === 0 && <tr><td colSpan={11} className="ac-cl__empty">{t("calls§Tanlangan davrda qo'ng'iroq yo'q")}</td></tr>}
                {data.calls.map((c) => {
                  const [time, date] = splitDt(c.at)
                  const mine = (n, ext) => <>{ext && <span>{ext}</span>} {n && <em>{n}</em>}</>
                  return (
                    <React.Fragment key={c.id}>
                      <tr className={c.status === 'missed' || (c.kind === 'out' && c.talkSec === 0) ? 'bad' : ''}>
                        <td className={`pbxc__ico2 ${c.kind}`}>{ARROW[c.kind] || '↗'}</td>
                        <td><span>{time}</span> <span>{date}</span></td>
                        <td>{c.kind === 'in' ? <span>{c.phone}</span> : mine(c.userName, c.ext)}</td>
                        <td>{c.kind === 'in' ? mine(c.userName, c.ext) : <span>{c.phone}</span>}{c.leadId && <> <Link to={`/leads/${c.leadId}`}>{c.leadName || t('calls§Bitim')}</Link></>}</td>
                        <td><span>{c.trunk || ''}</span></td>
                        <td><span>{mmss(c.ringSec)}</span></td>
                        <td><span>{mmss(c.talkSec)}</span></td>
                        <td className="pbxc__stars">{[1, 2, 3, 4, 5].map((n) => <i key={n} className={c.rating >= n ? 'on' : ''} />)}</td>
                        <td>{c.result ? t(`calls§${c.result}`) : ''}</td>
                        <td>{c.leadId ? 'CRM' : ''}</td>
                        <td className="pbxc__act">{c.hasRecording ? <>{play[c.id] === undefined && <button type="button" title={t('calls§Yozuvni tinglash')} onClick={() => listen(c.id)}>▶</button>}<button type="button" title={t('calls§Yuklab olish')} onClick={() => dl(c.id)}>⤓</button></> : null}</td>
                      </tr>
                      {play[c.id] && <tr><td colSpan={11}>{play[c.id] === 'err' ? t('calls§Yozuv topilmadi') : <audio controls autoPlay src={play[c.id]} style={{ width: '100%' }} />}</td></tr>}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="pbxc__foot">
          <span><b>{tot.count}</b> {t('calls§qo\'ng\'iroq')}</span>
          <span>{mmss(tot.talkSec)} {t('calls§suhbat')}</span>
          <span>{tot.roundedMinutes} {t('calls§daqiqa (to\'liq daqiqagacha yaxlitlangan)')}</span>
          <span>{mmss(tot.totalSec)} {t('calls§umumiy davomiylik')}</span>
        </div>
      </div>
      <aside className="pbxc__filter">
        <h4>{t('calls§FILTR')}</h4>
        <div className="pbxc__date">
          <button type="button" onClick={() => setDateOpen((v) => !v)}><span>{rangeLabel}</span><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#a8a4b9" strokeWidth="1.2"><rect x="1.5" y="2.5" width="11" height="10" rx="1.5" /><path d="M1.5 5.5h11M4.5 1v3M9.5 1v3" /></svg></button>
          {dateOpen && (
            <div className="pbxc__pop">
              <div className="pbxc__presets">{[[0, 'calls§Bugun'], [1, 'calls§Kecha'], [6, 'calls§7 kun'], [29, 'calls§30 kun']].map(([d, l]) => <button key={d} type="button" onClick={() => preset(d)}>{t(l)}</button>)}</div>
              <input className="ac-input" type="date" value={draft.from} onChange={(e) => set('from', e.target.value)} />
              <input className="ac-input" type="date" value={draft.to} onChange={(e) => set('to', e.target.value)} />
            </div>
          )}
        </div>
        <label className="pbxc__f"><input className="ac-input" placeholder={t('calls§Ichki raqam (xodim)')} value={draft.ext} onChange={(e) => set('ext', e.target.value)} /></label>
        <div className="pbxc__sel"><small>{t('calls§Baho')}</small><select className="ac-select" value={draft.rating} onChange={(e) => set('rating', e.target.value)}><option value="">{t('calls§Hammasi')}</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
        <h5>{t('calls§Mijoz')}<Chev /></h5>
        <label className="pbxc__f"><input className="ac-input" placeholder={t('calls§Mijoz telefoni')} value={draft.phone} onChange={(e) => set('phone', e.target.value)} /></label>
        <h5>{t('calls§Davomiylik')}<Chev /></h5>
        <div className="pbxc__r"><span>{t("calls§Qo'ng'iroq, soniya")}</span><input className="ac-input" type="number" placeholder={t('calls§dan')} value={draft.durMin} onChange={(e) => set('durMin', e.target.value)} /><input className="ac-input" type="number" placeholder={t('calls§gacha')} value={draft.durMax} onChange={(e) => set('durMax', e.target.value)} /></div>
        <div className="pbxc__r"><span>{t('calls§Suhbat, soniya')}</span><input className="ac-input" type="number" placeholder={t('calls§dan')} value={draft.talkMin} onChange={(e) => set('talkMin', e.target.value)} /><input className="ac-input" type="number" placeholder={t('calls§gacha')} value={draft.talkMax} onChange={(e) => set('talkMax', e.target.value)} /></div>
        <button type="button" className="pbxc__apply" onClick={() => setApplied(draft)}>{t('calls§Qo\'llash')}</button>
      </aside>
    </div>
  )
}
