// Servislar: «Sifat bahosi» (sozlama + hisobot) va «Avtoinformator» (ommaviy ovozli xabar kampaniyalari). O'z stansiyamiz (Asterisk) bilan ishlaydi.
import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { useApi } from '../../lib/useApi'
import { dialog } from '../../components/Dialog'
import { pbxService } from '../../services/pbx.service'
import { crmService } from '../../services/crm.service'
import { AudioSelect, Field } from '../pages/PbxPage'
import { TtsBlock } from './TtsBlock'
import '../i18n/pbx.ru'
import '../calls.css'

const today = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10)
const ago = (n) => new Date(Date.now() + 5 * 3_600_000 - n * 86_400_000).toISOString().slice(0, 10)
const fmt = (d) => (d ? new Date(d).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', hour12: false }) : '—')

function Tabs({ tabs, tab, setTab }) {
  const t = useT()
  return <div className="pbxs__tabs">{tabs.map(([k, l]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(l)}</button>)}</div>
}

// ── Sifat bahosi ──
export function QualityPage() {
  const t = useT()
  const [tab, setTab] = useState('set')
  return (
    <div className="pbxs__page pbxs__page--wide">
      <h3 className="pbxs__title">{t('pbx§Sifat bahosi')}</h3>
      <Tabs tabs={[['set', 'pbx§Sozlamalar'], ['rep', 'pbx§Hisobotlar'], ['desc', 'pbx§Tavsif']]} tab={tab} setTab={setTab} />
      {tab === 'set' && <QualitySettings />}
      {tab === 'rep' && <QualityReport />}
      {tab === 'desc' && (
        <div className="pbxs__body">
          <p>{t("pbx§Operator go'shakni qo'ygach, mijozga ovozli so'rov eshittiriladi: «Xizmat sifatini 1 dan 5 gacha baholang». Mijoz tugmani bosadi — baho qo'ng'iroqlar jurnaliga yoziladi.")}</p>
          <ul>
            <li>{t("pbx§Qo'ng'iroqdan keyin ovozli so'rov")}</li>
            <li>{t("pbx§Hisobotda o'rtacha baho, taqsimot va past baholar")}</li>
            <li>{t("pbx§Qo'ng'iroqlar jurnalida baho bo'yicha filtr")}</li>
          </ul>
        </div>
      )}
    </div>
  )
}

function QualitySettings() {
  const t = useT()
  const { data, setData } = useApi(() => pbxService.quality(), [], 'pbx:quality')
  const audio = useApi(() => pbxService.audioList(), [], 'pbx:audio')
  const [c, setC] = useState(null)
  const [msg, setMsg] = useState(null)
  const [tts, setTts] = useState('')
  const baseRef = useRef(null)
  useEffect(() => {
    if (!data) return
    if (!c || JSON.stringify(c) === JSON.stringify(baseRef.current)) setC(data)
    baseRef.current = data
  }, [data]) // eslint-disable-line
  if (!c) return <div className="ac-pbx__empty" />
  const files = audio.data?.files || []
  const set = (k, v) => setC({ ...c, [k]: v })
  const save = async () => {
    setMsg(null)
    try { const r = await pbxService.saveQuality(c); setC(r); setData(r); setMsg({ ok: true, text: t("pbx§Saqlandi. Stansiyaga qo'llang — dialplan yangilanadi.") }) } catch (e) { setMsg({ ok: false, text: e?.message || t("pbx§Saqlab bo'lmadi") }) }
  }
  const apply = async () => {
    setMsg(null)
    try { await pbxService.asteriskApply(); setMsg({ ok: true, text: t("pbx§Stansiyaga qo'llandi") }) } catch (e) { setMsg({ ok: false, text: e?.message || t("pbx§Qo'llab bo'lmadi") }) }
  }
  const created = (k) => async (a) => { await audio.reload(); setC((x) => ({ ...x, [k]: a.id })); setTts('') }
  return (
    <div className="pbxq">
      <Field label={t('pbx§Yoqilgan')}><input type="checkbox" checked={!!c.enabled} onChange={(e) => set('enabled', e.target.checked)} /></Field>
      <Field label={t("pbx§Qaysi qo'ng'iroqlarda")}>
        <select className="ac-select" value={c.scope} onChange={(e) => set('scope', e.target.value)}>
          <option value="in">{t('pbx§Faqat kiruvchi')}</option>
          <option value="all">{t('pbx§Kiruvchi va chiquvchi')}</option>
        </select>
      </Field>
      <Field label={t("pbx§So'rov audiosi")} hint={<a href="#" onClick={(e) => { e.preventDefault(); setTts(tts === 'p' ? '' : 'p') }}>{t('pbx§Matndan yaratish')}</a>}>
        <AudioSelect value={c.promptAudioId} files={files} onChange={(v) => set('promptAudioId', v || null)} />
      </Field>
      {tts === 'p' && <TtsBlock compact initialName={t('pbx§Sifat bahosi — so\'rov')} initialText={t("pbx§Xizmat sifatini 1 dan 5 gacha baholang: 5 — a'lo, 1 — juda yomon. Tugmani bosing.")} onCreated={created('promptAudioId')} />}
      <Field label={t('pbx§Rahmat audiosi')} hint={<a href="#" onClick={(e) => { e.preventDefault(); setTts(tts === 'th' ? '' : 'th') }}>{t('pbx§Matndan yaratish')}</a>}>
        <AudioSelect value={c.thanksAudioId} files={files} onChange={(v) => set('thanksAudioId', v || null)} />
      </Field>
      {tts === 'th' && <TtsBlock compact initialName={t('pbx§Sifat bahosi — rahmat')} initialText={t('pbx§Rahmat! Bahoingiz qabul qilindi.')} onCreated={created('thanksAudioId')} />}
      <div className="ac-pbx__actions">
        <button type="button" className="ac-btn ac-btn--blue" onClick={save}>{t('pbx§Saqlash')}</button>
        <button type="button" className="ac-btn" onClick={apply}>{t("pbx§Stansiyaga qo'llash")}</button>
      </div>
      {msg && <div className={msg.ok ? 'ac-pbx__ok' : 'ac-pbx__err'}>{msg.text}</div>}
      <p className="ac-pbx__muted">{t("pbx§Mijoz 1–5 tugmasini bosadi (6 soniya kutiladi, 2 urinish). Baho qo'ng'iroqlar jurnaliga va hisobotlarga tushadi.")}</p>
    </div>
  )
}

const STAR_COLORS = { 1: '#e5484d', 2: '#f0803c', 3: '#f0b000', 4: '#7cc36b', 5: '#2db26d' }
function QualityReport() {
  const t = useT()
  const [f, setF] = useState({ from: ago(29), to: today() })
  const [applied, setApplied] = useState(f)
  const { data, error } = useApi(() => crmService.callsStats(applied), [JSON.stringify(applied)], `calls-quality:${JSON.stringify(applied)}`, 60000)
  const q = data?.quality
  const max = q ? Math.max(1, ...Object.values(q.dist)) : 1
  return (
    <div className="pbxq">
      <div className="ac-cr__filter">
        <input className="ac-input" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label={t('pbx§Dan')} />
        <input className="ac-input" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label={t('pbx§Gacha')} />
        <button type="button" className="ac-btn ac-btn--blue" onClick={() => setApplied(f)}>{t("pbx§Qo'llash")}</button>
      </div>
      {error && !data && <div className="ac-pbx__err">{t(error.status === 400 ? 'pbx§Davr 93 kundan oshmasin' : "pbx§Yuklab bo'lmadi")}</div>}
      {q && (
        <>
          <div className="ac-cr__kpis">
            <div><b>{q.avg ?? '—'}</b><span>{t("pbx§O'rtacha baho")}</span></div>
            <div><b>{q.count}</b><span>{t('pbx§Baholar soni')}</span></div>
            <div><b>{q.answered ? `${Math.round((q.count / q.answered) * 100)}%` : '—'}</b><span>{t("pbx§Javob berilganlardan baholangan")}</span></div>
          </div>
          <div className="pbxq__dist">
            {[5, 4, 3, 2, 1].map((n) => (
              <div key={n} className="ac-cr__outrow"><span>{'★'.repeat(n)}</span><div className="ac-cr__meter"><i style={{ width: `${(q.dist[n] / max) * 100}%`, background: STAR_COLORS[n] }} /></div><b>{q.dist[n]}</b></div>
            ))}
          </div>
          <h4>{t('pbx§Past baholar')} (≤ {q.lowMax})</h4>
          {q.low.length === 0 ? <div className="ac-pbx__empty">{t("pbx§Past baho yo'q")}</div> : (
            <div className="ac-cl__tablewrap">
              <table className="ac-cl__table">
                <thead><tr><th>{t('pbx§Vaqt')}</th><th>{t('pbx§Telefon')}</th><th>{t('pbx§Xodim')}</th><th>{t('pbx§Baho')}</th><th /></tr></thead>
                <tbody>{q.low.map((r) => (
                  <tr key={r.id}><td>{fmt(r.at)}</td><td>{r.phone}</td><td>{r.ext ? `${r.ext} ` : ''}{r.userName || '—'}</td><td style={{ color: STAR_COLORS[r.rating] }}>{'★'.repeat(r.rating)}</td><td>{r.leadId && <Link to={`/leads/${r.leadId}`}>{t('pbx§Bitim')}</Link>}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Avtoinformator ──
const STATUS = { draft: 'pbx§Qoralama', running: 'pbx§Ishlamoqda', paused: 'pbx§Pauza', done: 'pbx§Tugagan' }
const TSTATE = { pending: 'pbx§Navbatda', calling: "pbx§Qo'ng'iroq qilinmoqda", answered: 'pbx§Javob berdi', noanswer: 'pbx§Javob bermadi', failed: 'pbx§Xato', dnd: "pbx§Qora ro'yxat" }

export function InformerPage() {
  const t = useT()
  const [tab, setTab] = useState('list')
  const [sel, setSel] = useState(null)
  return (
    <div className="pbxs__page pbxs__page--wide">
      <h3 className="pbxs__title">{t('pbx§Avtoinformator')}</h3>
      <Tabs tabs={[['list', 'pbx§Kampaniyalar'], ['new', 'pbx§Yangi kampaniya'], ['set', 'pbx§Sozlamalar'], ['desc', 'pbx§Tavsif']]} tab={tab} setTab={(k) => { setTab(k); setSel(null) }} />
      {tab === 'list' && (sel ? <Campaign id={sel} onBack={() => setSel(null)} /> : <CampaignList onOpen={setSel} />)}
      {tab === 'new' && <CampaignForm onDone={(id) => { setTab('list'); setSel(id) }} />}
      {tab === 'set' && <InformerSettings />}
      {tab === 'desc' && (
        <div className="pbxs__body">
          <p>{t("pbx§Ovozli xabarni raqamlar ro'yxatiga avtomatik qo'ng'iroq qilib yetkazadi: balans, to'lov eslatmasi, aksiya, tabrik.")}</p>
          <ul>
            <li>{t("pbx§Raqamlar CSV yoki matn bilan yuklanadi (5000 tagacha), takrorlar va qora ro'yxatdagilar ajratiladi")}</li>
            <li>{t("pbx§Ish vaqti oynasi, bir vaqtdagi qo'ng'iroqlar soni, qayta urinishlar (kamida 30 daqiqa oraliq)")}</li>
            <li>{t("pbx§Natijalar qo'ng'iroqlar jurnalida (chiquvchi) va kampaniya hisobotida")}</li>
          </ul>
        </div>
      )}
    </div>
  )
}

function Progress({ c }) {
  const t = useT()
  const n = c.counts || {}
  const done = (n.answered || 0) + (n.noanswer || 0) + (n.failed || 0)
  const pct = n.total ? Math.round((done / n.total) * 100) : 0
  return (
    <span className="pbxinf__prog" title={`${t('pbx§Javob berdi')}: ${n.answered || 0} · ${t('pbx§Javob bermadi')}: ${n.noanswer || 0} · ${t('pbx§Xato')}: ${n.failed || 0} · ${t("pbx§Qora ro'yxat")}: ${n.dnd || 0}`}>
      <i><em style={{ width: `${pct}%` }} /></i>{n.answered || 0}/{n.total || 0}
    </span>
  )
}

function CampaignList({ onOpen }) {
  const t = useT()
  const { data } = useApi(() => pbxService.informers(), [], 'pbx:informers', 5000)
  const list = data?.campaigns || []
  return (
    <>
      {data && !data.pbxReady && <p className="ac-pbx__muted">{t("pbx§Stansiya (Asterisk AMI) ulanmagan — kampaniya ishga tushsa ham qo'ng'iroqlar boshlanmaydi.")}</p>}
      {list.length === 0 ? <div className="ac-pbx__empty">{t("pbx§Hali kampaniya yo'q. «Yangi kampaniya» tabidan yarating.")}</div> : (
        <div className="ac-cl__tablewrap">
          <table className="ac-cl__table">
            <thead><tr><th>{t('pbx§Nomi')}</th><th>{t('pbx§Holat')}</th><th>{t('pbx§Javob berdi')}</th><th>{t('pbx§Ish vaqti')}</th><th>{t('pbx§Yaratilgan')}</th></tr></thead>
            <tbody>{list.map((c) => (
              <tr key={c.id} className="pbxinf__row" onClick={() => onOpen(c.id)}>
                <td><a href="#" onClick={(e) => e.preventDefault()}>{c.name}</a></td><td><span className={`pbxinf__st pbxinf__st--${c.status}`}>{t(STATUS[c.status] || c.status)}</span></td>
                <td><Progress c={c} /></td><td>{c.windowFrom}–{c.windowTo}</td><td>{fmt(c.createdAt)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  )
}

function AudioPick({ value, onChange }) {
  const t = useT()
  const audio = useApi(() => pbxService.audioList(), [], 'pbx:audio')
  const [tts, setTts] = useState(false)
  return (
    <>
      <Field label={t('pbx§Audio xabar')} hint={<a href="#" onClick={(e) => { e.preventDefault(); setTts(!tts) }}>{t('pbx§Matndan yaratish')}</a>}>
        <select className="ac-select" value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t('pbx§Tanlang')}</option>
          {(audio.data?.files || []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </Field>
      {tts && <TtsBlock compact initialName={t('pbx§Avtoinformator xabari')} onCreated={async (a) => { await audio.reload(); onChange(a.id); setTts(false) }} />}
    </>
  )
}

const EMPTY = { name: '', audioId: '', numbers: '', windowFrom: '09:00', windowTo: '20:00', maxParallel: 2, retries: 1, retryMin: 30, dailyLimit: 1000, startAt: '' }
function CampaignForm({ onDone }) {
  const t = useT()
  const [f, setF] = useState(EMPTY)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF({ ...f, [k]: v })
  const file = (e) => {
    const x = e.target.files?.[0]; e.target.value = ''
    if (!x) return
    if (x.size > 400_000) { setMsg({ ok: false, text: t('pbx§Fayl juda katta') }); return }
    const r = new FileReader(); r.onload = () => set('numbers', `${f.numbers ? `${f.numbers}\n` : ''}${String(r.result || '')}`); r.readAsText(x)
  }
  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await pbxService.informerCreate({ ...f, maxParallel: Number(f.maxParallel), retries: Number(f.retries), retryMin: Number(f.retryMin), dailyLimit: Number(f.dailyLimit), startAt: f.startAt ? new Date(f.startAt).toISOString() : null })
      setF(EMPTY)
      onDone(r.campaign.id)
    } catch (e) { setMsg({ ok: false, text: e?.message || t("pbx§Saqlab bo'lmadi") }) } finally { setBusy(false) }
  }
  const lines = f.numbers.split(/\n/).filter((x) => /\d{7,}/.test(x.replace(/\D/g, ''))).length
  return (
    <div className="pbxq">
      <Field label={t('pbx§Nomi')}><input className="ac-input" value={f.name} maxLength={100} onChange={(e) => set('name', e.target.value)} /></Field>
      <AudioPick value={f.audioId} onChange={(v) => set('audioId', v)} />
      <Field label={t('pbx§Raqamlar')} hint={<>{t("pbx§Har qatorda bitta raqam yoki CSV (raqam ustuni topiladi)")} · {lines} · <label className="pbxinf__file">{t('pbx§CSV yuklash')}<input type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={file} /></label></>}>
        <textarea className="ac-input" rows={6} value={f.numbers} placeholder={'+998 90 123 45 67\n998911234567;Ali\n901234567'} onChange={(e) => set('numbers', e.target.value)} />
      </Field>
      <Field label={t('pbx§Ish vaqti (Toshkent)')}><span className="pbxinf__pair"><input className="ac-input" type="time" value={f.windowFrom} onChange={(e) => set('windowFrom', e.target.value)} /> — <input className="ac-input" type="time" value={f.windowTo} onChange={(e) => set('windowTo', e.target.value)} /></span></Field>
      <Field label={t("pbx§Bir vaqtda qo'ng'iroqlar (1–10)")}><input className="ac-input" type="number" min="1" max="10" value={f.maxParallel} onChange={(e) => set('maxParallel', e.target.value)} /></Field>
      <Field label={t('pbx§Qayta urinishlar (0–3)')}><input className="ac-input" type="number" min="0" max="3" value={f.retries} onChange={(e) => set('retries', e.target.value)} /></Field>
      <Field label={t("pbx§Urinishlar oralig'i (daqiqa, ≥30)")}><input className="ac-input" type="number" min="30" max="1440" value={f.retryMin} onChange={(e) => set('retryMin', e.target.value)} /></Field>
      <Field label={t('pbx§Kunlik limit')}><input className="ac-input" type="number" min="1" max="5000" value={f.dailyLimit} onChange={(e) => set('dailyLimit', e.target.value)} /></Field>
      <Field label={t('pbx§Boshlanish vaqti (ixtiyoriy)')}><input className="ac-input" type="datetime-local" value={f.startAt} onChange={(e) => set('startAt', e.target.value)} /></Field>
      <div className="ac-pbx__actions"><button type="button" className="ac-btn ac-btn--blue" disabled={busy} onClick={save}>{t('pbx§Yaratish')}</button></div>
      {msg && <div className={msg.ok ? 'ac-pbx__ok' : 'ac-pbx__err'}>{msg.text}</div>}
    </div>
  )
}

function Campaign({ id, onBack }) {
  const t = useT()
  const [state, setState] = useState('')
  const { data, reload } = useApi(() => pbxService.informer(id, state), [id, state], `pbx:informer:${id}:${state}`, 5000)
  const [msg, setMsg] = useState(null)
  const [nums, setNums] = useState('')
  const c = data?.campaign
  if (!c) return <div className="ac-pbx__empty" />
  const n = c.counts || {}
  const act = async (a) => {
    setMsg(null)
    if (a === 'stop' && !(await dialog.confirm(t("pbx§Kampaniya to'xtatilsinmi? Qolgan raqamlarga qo'ng'iroq qilinmaydi.")))) return
    try { const r = await pbxService.informerAction(id, a); await reload(); if (a === 'start' && r.pbxReady === false) setMsg({ ok: false, text: t("pbx§Stansiya (Asterisk AMI) ulanmagan — kampaniya ishga tushsa ham qo'ng'iroqlar boshlanmaydi.") }) } catch (e) { setMsg({ ok: false, text: e?.message || '' }) }
  }
  const del = async () => {
    if (!(await dialog.confirm(t("pbx§Kampaniya o'chirilsinmi?")))) return
    try { await pbxService.informerRemove(id); onBack() } catch (e) { setMsg({ ok: false, text: e?.message || '' }) }
  }
  const add = async () => {
    setMsg(null)
    try {
      const r = await pbxService.informerNumbers(id, nums)
      setNums(''); await reload()
      setMsg({ ok: true, text: `${t("pbx§Qo'shildi")}: ${r.added} · ${t("pbx§Qora ro'yxat")}: ${r.dnd} · ${t('pbx§Takror')}: ${r.duplicates} · ${t("pbx§Noto'g'ri")}: ${r.invalid + r.foreign}${r.overLimit ? ` · ${t('pbx§Limitdan ortiq')}: ${r.overLimit}` : ''}` })
    } catch (e) { setMsg({ ok: false, text: e?.message || '' }) }
  }
  return (
    <div className="pbxinf">
      <a href="#" className="pbxinf__back" onClick={(e) => { e.preventDefault(); onBack() }}>← {t('pbx§Kampaniyalar')}</a>
      <h4>{c.name} <span className={`pbxinf__st pbxinf__st--${c.status}`}>{t(STATUS[c.status] || c.status)}</span></h4>
      <div className="ac-cr__kpis">
        <div><b>{n.total || 0}</b><span>{t('pbx§Jami')}</span></div>
        <div><b>{n.answered || 0}</b><span>{t('pbx§Javob berdi')}</span></div>
        <div><b>{n.noanswer || 0}</b><span>{t('pbx§Javob bermadi')}</span></div>
        <div><b>{(n.pending || 0) + (n.calling || 0)}</b><span>{t('pbx§Navbatda')}</span></div>
        <div><b>{n.dnd || 0}</b><span>{t("pbx§Qora ro'yxat")}</span></div>
        <div><b>{c.todayCalls}/{c.dailyLimit}</b><span>{t("pbx§Bugun qo'ng'iroqlar")}</span></div>
      </div>
      <p className="ac-pbx__muted">{t('pbx§Ish vaqti')}: {c.windowFrom}–{c.windowTo} · {t('pbx§Bir vaqtda')}: {c.maxParallel} · {t('pbx§Qayta urinishlar')}: {c.retries} ({c.retryMin} {t('pbx§daq')}){c.startAt ? ` · ${t('pbx§Boshlanish')}: ${fmt(c.startAt)}` : ''}</p>
      <div className="ac-pbx__actions">
        {c.status !== 'running' && c.status !== 'done' && <button type="button" className="ac-btn ac-btn--blue" onClick={() => act('start')}>{t('pbx§Boshlash')}</button>}
        {c.status === 'running' && <button type="button" className="ac-btn" onClick={() => act('pause')}>{t('pbx§Pauza')}</button>}
        {c.status !== 'done' && <button type="button" className="ac-btn" onClick={() => act('stop')}>{t("pbx§To'xtatish")}</button>}
        {c.status !== 'running' && <button type="button" className="ac-btn" onClick={del}>{t("pbx§O'chirish")}</button>}
      </div>
      {msg && <div className={msg.ok ? 'ac-pbx__ok' : 'ac-pbx__err'}>{msg.text}</div>}
      {c.status !== 'done' && (
        <div className="pbxinf__add">
          <textarea className="ac-input" rows={2} value={nums} placeholder={t("pbx§Raqam qo'shish (har qatorda bitta)")} onChange={(e) => setNums(e.target.value)} />
          <button type="button" className="ac-btn" disabled={!nums.trim()} onClick={add}>{t("pbx§Qo'shish")}</button>
        </div>
      )}
      <div className="pbxinf__filter">
        {[['', 'pbx§Hammasi'], ...Object.entries(TSTATE)].map(([k, l]) => <button key={k} type="button" className={state === k ? 'on' : ''} onClick={() => setState(k)}>{t(l)}{k && n[k] ? ` (${n[k]})` : ''}</button>)}
      </div>
      <div className="ac-cl__tablewrap">
        <table className="ac-cl__table">
          <thead><tr><th>{t('pbx§Telefon')}</th><th>{t('pbx§Holat')}</th><th>{t('pbx§Urinishlar')}</th><th>{t("pbx§Oxirgi qo'ng'iroq")}</th></tr></thead>
          <tbody>{(data.targets || []).map((x) => <tr key={x.id}><td>+{x.phone}</td><td><span className={`pbxinf__ts pbxinf__ts--${x.state}`}>{t(TSTATE[x.state] || x.state)}</span></td><td>{x.attempts}</td><td>{fmt(x.lastAt)}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  )
}

function InformerSettings() {
  const t = useT()
  const { data, setData } = useApi(() => pbxService.informerSettings(), [], 'pbx:informer-settings')
  const [v, setV] = useState(null)
  const [msg, setMsg] = useState(null)
  const val = v ?? (data?.prefixes || []).join(', ')
  const save = async () => {
    setMsg(null)
    try { const r = await pbxService.saveInformerSettings({ prefixes: val }); setData(r); setV(null); setMsg({ ok: true, text: t('pbx§Saqlandi') }) } catch (e) { setMsg({ ok: false, text: e?.message || t("pbx§Saqlab bo'lmadi") }) }
  }
  return (
    <div className="pbxq">
      <Field label={t('pbx§Ruxsat etilgan mamlakat prefikslari')} hint={t("pbx§Faqat shu prefikslar bilan boshlanadigan raqamlarga qo'ng'iroq qilinadi (toll-fraud himoyasi).")}>
        <input className="ac-input" value={val} placeholder="998" onChange={(e) => setV(e.target.value)} />
      </Field>
      <div className="ac-pbx__actions"><button type="button" className="ac-btn ac-btn--blue" onClick={save}>{t('pbx§Saqlash')}</button></div>
      {msg && <div className={msg.ok ? 'ac-pbx__ok' : 'ac-pbx__err'}>{msg.text}</div>}
      <p className="ac-pbx__muted">{t("pbx§Qo'ng'iroqlar chiquvchi qoidalar bo'yicha trunk orqali ketadi (ATS → Chiquvchi). Soniyasiga ko'pi bilan bitta yangi qo'ng'iroq boshlanadi.")}</p>
    </div>
  )
}

// ── AI-menejer (OnlinePBX «ИИ-менеджер»): yozuv → matn (STT) → Claude xulosasi → bitim lentasi ──
const AI_ST = { pending: 'pbx§Navbatda', processing: 'pbx§Tahlil qilinmoqda', done: 'pbx§Tayyor', failed: 'pbx§Xato', skipped: "pbx§O'tkazib yuborildi" }
const AI_REASON = { short: 'pbx§Qisqa suhbat', internal: "pbx§Ichki qo'ng'iroq", no_recording: "pbx§Yozuv yo'q", too_long: 'pbx§20 daqiqadan uzun', empty: 'pbx§Nutq aniqlanmadi' }
const AI_SENT = { positive: ['pbx§Ijobiy', '#1f8a4d'], neutral: ['pbx§Neytral', '#4e4963'], negative: ['pbx§Salbiy', '#c9372c'] }
const AI_LANGS = [['auto', 'pbx§Avtomatik aniqlash'], ['uz', "pbx§O'zbekcha"], ['ru', 'pbx§Ruscha'], ['en', 'pbx§Inglizcha']]
const STT_NAMES = { openai: 'OpenAI Whisper', deepgram: 'Deepgram', azure: 'Azure Speech', mock: 'Sinov (mock)' }
const STT_ENV = { openai: 'OPENAI_API_KEY', deepgram: 'DEEPGRAM_API_KEY', azure: 'AZURE_STT_KEY + AZURE_STT_REGION', mock: 'PBX_STT_MOCK=1' }

export function AiPage() {
  const t = useT()
  const [tab, setTab] = useState('calls')
  return (
    <div className="pbxs__page pbxs__page--wide">
      <h3 className="pbxs__title">{t('pbx§AI-menejer')}</h3>
      <Tabs tabs={[['calls', "pbx§Qo'ng'iroqlar"], ['set', 'pbx§Sozlamalar'], ['desc', 'pbx§Tavsif']]} tab={tab} setTab={setTab} />
      {tab === 'set' && <AiSettings />}
      {tab === 'calls' && <AiCalls />}
      {tab === 'desc' && (
        <div className="pbxs__body">
          <p>{t("pbx§Sun'iy intellekt qo'ng'iroqlarni tahlil qiladi, suhbat mazmunini yozib oladi va mijoz kartochkasiga xulosa qo'shadi.")}</p>
          <ul>
            <li>{t("pbx§Yozuv matnga o'giriladi (o'zbek, rus, ingliz; til avtomatik aniqlanadi)")}</li>
            <li>{t("pbx§Xulosa, mijoz kayfiyati, e'tirozlar, keyingi qadamlar va operator ishi bahosi (1–10)")}</li>
            <li>{t("pbx§Bitim lentasiga «AI xulosa» izohi (bir marta), ixtiyoriy — tavsiya etilgan vazifa")}</li>
            <li>{t("pbx§Kunlik limit va token hisobi; transkripsiyalar saqlash muddatidan keyin avtomatik o'chiriladi")}</li>
          </ul>
        </div>
      )}
    </div>
  )
}

function AiSettings() {
  const t = useT()
  const { data, setData } = useApi(() => pbxService.ai(), [], 'pbx:ai')
  const [c, setC] = useState(null)
  const [msg, setMsg] = useState(null)
  const baseRef = useRef(null)
  useEffect(() => {
    if (!data) return
    if (!c || JSON.stringify(c) === JSON.stringify(baseRef.current)) setC(data.settings)
    baseRef.current = data.settings
  }, [data]) // eslint-disable-line
  if (!c || !data) return <div className="ac-pbx__empty" />
  const set = (k, v) => setC({ ...c, [k]: v })
  const save = async () => {
    setMsg(null)
    try {
      const r = await pbxService.saveAi({ ...c, minTalkSec: Number(c.minTalkSec), dailyLimit: Number(c.dailyLimit), retainDays: Number(c.retainDays) })
      setData(r); setC(r.settings); setMsg({ ok: true, text: t('pbx§Saqlandi') })
    } catch (e) { setMsg({ ok: false, text: e?.message || t("pbx§Saqlab bo'lmadi") }) }
  }
  const runNow = async () => {
    setMsg(null)
    try { const r = await pbxService.aiTick(); setMsg({ ok: true, text: r.disabled ? t("pbx§AI-menejer o'chirilgan") : `${t('pbx§Navbatga qo\'shildi')}: ${r.enqueued} · ${t('pbx§Tahlil qilindi')}: ${r.processed}` }); setData(await pbxService.ai()) } catch (e) { setMsg({ ok: false, text: e?.message || '' }) }
  }
  const active = data.stt?.active
  const s7 = data.stats7 || {}
  return (
    <div className="pbxq">
      <div className="pbxch__list">
        <div className="pbxch__item"><b>{t('pbx§Nutqni matnga o\'girish (STT)')}</b>{active ? <span className="pbxch__on">{t('pbx§Ulangan')}: {STT_NAMES[active] || active}</span> : <span className="pbxch__off">{t('pbx§Ulanmagan')}</span>}</div>
        <div className="pbxch__item"><b>{t('pbx§Tahlil (Claude)')}</b>{data.analysis?.configured ? <span className="pbxch__on">{t('pbx§Ulangan')}{data.analysis.mock ? ' (mock)' : ''}</span> : <span className="pbxch__off">{t("pbx§Ulanmagan — faqat transkripsiya saqlanadi")}</span>}</div>
      </div>
      {!active && <p className="ac-pbx__muted">{t('pbx§Serverda kalitlardan birini o\'rnating')}: OPENAI_API_KEY · DEEPGRAM_API_KEY · AZURE_STT_KEY + AZURE_STT_REGION. {t('pbx§Tahlil uchun')}: ANTHROPIC_API_KEY.</p>}
      <Field label={t('pbx§Yoqilgan')}><input type="checkbox" checked={!!c.enabled} onChange={(e) => set('enabled', e.target.checked)} /></Field>
      <Field label={t('pbx§Suhbat tili')}>
        <select className="ac-select" value={c.language} onChange={(e) => set('language', e.target.value)}>{AI_LANGS.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select>
      </Field>
      <Field label={t('pbx§STT provayderi')}>
        <select className="ac-select" value={c.sttProvider} onChange={(e) => set('sttProvider', e.target.value)}>
          <option value="auto">{t('pbx§Avtomatik (ulanganidan birinchisi)')}</option>
          {(data.stt?.providers || []).map((p) => <option key={p.id} value={p.id}>{STT_NAMES[p.id] || p.id} — {p.available ? t('pbx§ulangan') : `${t('pbx§ulanmagan')} (${STT_ENV[p.id]})`}</option>)}
        </select>
      </Field>
      <Field label={t('pbx§Minimal suhbat (soniya)')} hint={t("pbx§Bundan qisqa qo'ng'iroqlar tahlil qilinmaydi")}><input className="ac-input" type="number" min="5" max="600" value={c.minTalkSec} onChange={(e) => set('minTalkSec', e.target.value)} /></Field>
      <Field label={t('pbx§Kunlik limit (tahlil soni)')}><input className="ac-input" type="number" min="1" max="5000" value={c.dailyLimit} onChange={(e) => set('dailyLimit', e.target.value)} /></Field>
      <Field label={t('pbx§Bitim lentasiga xulosa yozish')}><input type="checkbox" checked={!!c.autoNote} onChange={(e) => set('autoNote', e.target.checked)} /></Field>
      <Field label={t('pbx§Tavsiya etilgan vazifani yaratish')}><input type="checkbox" checked={!!c.autoTask} onChange={(e) => set('autoTask', e.target.checked)} /></Field>
      <Field label={t('pbx§Transkripsiyani saqlash muddati (kun)')} hint={t("pbx§Muddat o'tgach matn va tahlil o'chiriladi (shaxsiy ma'lumot)")}><input className="ac-input" type="number" min="7" max="365" value={c.retainDays} onChange={(e) => set('retainDays', e.target.value)} /></Field>
      <div className="ac-pbx__actions">
        <button type="button" className="ac-btn ac-btn--blue" onClick={save}>{t('pbx§Saqlash')}</button>
        <button type="button" className="ac-btn" onClick={runNow}>{t('pbx§Hozir ishga tushirish')}</button>
      </div>
      {msg && <div className={msg.ok ? 'ac-pbx__ok' : 'ac-pbx__err'}>{msg.text}</div>}
      <h4>{t("pbx§So'nggi 7 kun")}</h4>
      <div className="ac-cr__kpis">
        <div><b>{data.usage?.today ?? 0}/{data.usage?.dailyLimit ?? c.dailyLimit}</b><span>{t('pbx§Bugun tahlillar')}</span></div>
        <div><b>{s7.done ?? 0}</b><span>{t('pbx§Tahlil qilindi')}</span></div>
        <div><b>{s7.failed ?? 0}</b><span>{t('pbx§Xato')}</span></div>
        <div><b>{s7.audioMin ?? 0}</b><span>{t('pbx§Audio, daqiqa')}</span></div>
        <div><b>{(s7.tokensIn ?? 0).toLocaleString('ru-RU')} / {(s7.tokensOut ?? 0).toLocaleString('ru-RU')}</b><span>{t('pbx§Tokenlar (kirish / chiqish)')}</span></div>
      </div>
      <p className="ac-pbx__muted">{t("pbx§Fon ishchisi har 30 soniyada yakunlangan qo'ng'iroqlarni oladi (bir vaqtda 2 tagacha, xatoda 2 marta qayta urinadi). Audio 20 daqiqa va 25 MB gacha.")}</p>
    </div>
  )
}

function AiSentiment({ s }) {
  const t = useT()
  if (!s || !AI_SENT[s]) return <span>—</span>
  return <span style={{ color: AI_SENT[s][1], fontWeight: 500 }}>{t(AI_SENT[s][0])}</span>
}

function AiCalls() {
  const t = useT()
  const [status, setStatus] = useState('')
  const [open, setOpen] = useState(null)
  const { data, error } = useApi(() => pbxService.aiCalls({ status, limit: 200 }), [status], `pbx:ai-calls:${status}`, 15000)
  const list = data?.calls || []
  return (
    <>
      <div className="pbxinf__filter">
        {[['', 'pbx§Hammasi'], ...Object.entries(AI_ST)].map(([k, l]) => <button key={k} type="button" className={status === k ? 'on' : ''} onClick={() => { setStatus(k); setOpen(null) }}>{t(l)}</button>)}
      </div>
      {error && !data && <div className="ac-pbx__err">{t("pbx§Yuklab bo'lmadi")}</div>}
      {data && list.length === 0 ? <div className="ac-pbx__empty">{t("pbx§Hali tahlil qilingan qo'ng'iroq yo'q. Sozlamalar tabida AI-menejerni yoqing.")}</div> : (
        <div className="ac-cl__tablewrap">
          <table className="ac-cl__table">
            <thead><tr><th>{t('pbx§Vaqt')}</th><th>{t('pbx§Mijoz')}</th><th>{t('pbx§Xodim')}</th><th>{t('pbx§Holat')}</th><th>{t('pbx§Kayfiyat')}</th><th>{t('pbx§Ball')}</th></tr></thead>
            <tbody>{list.map((r) => (
              <React.Fragment key={r.callLogId}>
                <tr className="pbxinf__row" onClick={() => setOpen(open === r.callLogId ? null : r.callLogId)}>
                  <td>{fmt(r.at)}</td>
                  <td>{r.direction === 'in' ? '↙' : '↗'} {r.leadId ? <Link to={`/leads/${r.leadId}`} onClick={(e) => e.stopPropagation()}>{r.leadName || r.phone}</Link> : r.phone}</td>
                  <td>{r.ext ? `${r.ext} ` : ''}{r.userName || '—'}</td>
                  <td><span className={`pbxinf__st pbxai__st--${r.status}`}>{t(AI_ST[r.status] || r.status)}</span>{r.reason ? <small className="pbxai__reason"> {t(AI_REASON[r.reason] || r.reason)}</small> : null}{r.purged ? <small className="pbxai__reason"> {t("pbx§matn o'chirilgan")}</small> : null}</td>
                  <td><AiSentiment s={r.sentiment} /></td>
                  <td>{r.score != null ? `${r.score}/10` : '—'}</td>
                </tr>
                {open === r.callLogId && <tr><td colSpan={6}><AiDetail id={r.callLogId} /></td></tr>}
              </React.Fragment>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  )
}

export function AiDetail({ id }) {
  const t = useT()
  const { data, setData, error } = useApi(() => pbxService.aiCall(id), [id], `pbx:ai-call:${id}`)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  if (error && !data) return <div className="ac-pbx__err">{error.status === 403 ? t("pbx§Ruxsat yo'q") : t("pbx§Yuklab bo'lmadi")}</div>
  if (!data) return <div className="ac-pbx__empty" />
  const a = data.analysis
  const rerun = async () => {
    setBusy(true); setMsg(null)
    try { setData(await pbxService.aiRun(id)) } catch (e) { setMsg(e?.message || t('pbx§Xato')) } finally { setBusy(false) }
  }
  return (
    <div className="pbxai">
      {data.error && <div className="ac-pbx__err">{data.error}</div>}
      {a ? (
        <>
          <p className="pbxai__sum">{a.summary}</p>
          <div className="pbxai__meta"><span>{t('pbx§Kayfiyat')}: <AiSentiment s={a.sentiment} /></span><span>{t('pbx§Operator bahosi')}: <b>{a.score}/10</b></span>{a.intent && <span>{t('pbx§Maqsad')}: {a.intent}</span>}</div>
          {a.objections?.length > 0 && <><h5>{t("pbx§E'tirozlar")}</h5><ul>{a.objections.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
          {a.nextSteps?.length > 0 && <><h5>{t('pbx§Keyingi qadamlar')}</h5><ul>{a.nextSteps.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
          {a.suggestedTask && <p className="ac-pbx__muted">{t('pbx§Tavsiya etilgan vazifa')}: {a.suggestedTask.title} (+{a.suggestedTask.dueInDays} {t('pbx§kun')})</p>}
          {a.keywords?.length > 0 && <div className="pbxai__kw">{a.keywords.map((k) => <span key={k}>{k}</span>)}</div>}
        </>
      ) : data.status === 'done' && !data.purged ? <p className="ac-pbx__muted">{t("pbx§Tahlil o'chiq (Claude ulanmagan) — faqat transkripsiya")}</p> : null}
      {data.purged && <p className="ac-pbx__muted">{t("pbx§Saqlash muddati o'tgani uchun matn o'chirilgan")}</p>}
      {data.transcript && <><h5>{t('pbx§Transkripsiya')}{data.lang ? ` (${data.lang})` : ''}</h5><div className="pbxai__tr">{data.transcript}</div></>}
      <div className="ac-pbx__actions">
        <button type="button" className="ac-btn" disabled={busy || data.status === 'processing'} onClick={rerun}>{busy ? t('pbx§Tahlil qilinmoqda') : t('pbx§Qayta tahlil')}</button>
      </div>
      {msg && <div className="ac-pbx__err">{msg}</div>}
    </div>
  )
}
