// amoCRM "Импорт" — bitimlar va kontaktlar importi (/leads/import, /contacts/import).
// 4 qadam: fayl → maydonlarni moslash → sozlamalar → natija.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../lib/apiClient'
import { crmService } from '../../services/crm.service'
import { useApi } from '../../lib/useApi'
import { Ico } from '../AmoIcons'
import { useT } from '../i18n'
import '../i18n/import.ru.js'
import '../import.css'
import { dmy } from '../format'

const CHUNK = 500
const SKIP = ''

// Asosiy maydonlar: key = backend qator kaliti; syn = sarlavha sinonimlari (uz/ru/en)
const LEAD_FIELDS = [
  { key: 'name', label: 'Bitim nomi', required: true, syn: ['nom', 'nomi', 'bitim', 'sdelka', 'сделка', 'название', 'наименование', 'deal', 'lead', 'title', 'name', 'bitim nomi'] },
  { key: 'value', label: 'Byudjet', syn: ['byudjet', 'budget', 'бюджет', 'summa', 'сумма', 'sum', 'amount', 'narx', 'price', 'value'] },
  { key: 'stage', label: 'Bosqich', syn: ['bosqich', 'etap', 'этап', 'stage', 'status', 'статус'] },
  { key: 'pipeline', label: 'Voronka', syn: ['voronka', 'воронка', 'pipeline', 'funnel'] },
  { key: 'assignee', label: "Mas'ul", syn: ["mas'ul", 'masul', 'ответственный', 'responsible', 'manager', 'menejer', 'assignee', 'owner'] },
  { key: 'tags', label: 'Teglar', syn: ['teg', 'teglar', 'тег', 'теги', 'tag', 'tags'] },
  { key: 'contactName', label: 'Kontakt: ism', syn: ['kontakt', 'ism', 'имя', 'контакт', 'fio', 'фио', 'full name', 'fullname', 'contact', 'contact name', 'mijoz', 'клиент', 'client'] },
  { key: 'phone', label: 'Kontakt: telefon', syn: ['telefon', 'tel', 'raqam', 'phone', 'телефон', 'mobile', 'мобильный', 'номер'] },
  { key: 'email', label: 'Kontakt: email', syn: ['email', 'e-mail', 'pochta', 'почта', 'mail'] },
  { key: 'company', label: 'Kompaniya', syn: ['kompaniya', 'company', 'компания', 'tashkilot', 'organization', 'организация'] },
  { key: 'source', label: 'Manba', syn: ['manba', 'source', 'источник'] },
  { key: 'note', label: 'Izoh', syn: ['izoh', 'note', 'notes', 'примечание', 'комментарий', 'comment', 'izohlar'] },
]
const CONTACT_FIELDS = [
  { key: 'name', label: 'Ism', required: true, syn: ['ism', 'fio', 'фио', 'имя', 'name', 'full name', 'fullname', 'nom', 'nomi', 'kontakt', 'контакт', 'mijoz', 'клиент', 'client'] },
  { key: 'phone', label: 'Telefon', syn: ['telefon', 'tel', 'raqam', 'phone', 'телефон', 'mobile', 'мобильный', 'номер'] },
  { key: 'email', label: 'Email', syn: ['email', 'e-mail', 'pochta', 'почта', 'mail'] },
  { key: 'position', label: 'Lavozim', syn: ['lavozim', 'position', 'должность', 'job', 'title'] },
  { key: 'company', label: 'Kompaniya', syn: ['kompaniya', 'company', 'компания', 'tashkilot', 'organization', 'организация'] },
  { key: 'assignee', label: "Mas'ul", syn: ["mas'ul", 'masul', 'ответственный', 'responsible', 'manager', 'menejer', 'assignee', 'owner'] },
]

const norm = (s) => String(s ?? '').toLowerCase().replace(/[‘’`ʻʼ]/g, "'").replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim()

// ── CSV parser (qo'shtirnoq, ; , \t ajratgichlar) ──
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const first = text.split(/\r?\n/, 1)[0] || ''
  const delim = [';', '\t', ','].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0]
  const rows = []
  let row = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += c
    } else if (c === '"') q = true
    else if (c === delim) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}

async function readFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  if (ext === 'csv' || ext === 'txt') {
    const buf = await file.arrayBuffer()
    let text = new TextDecoder('utf-8').decode(buf)
    if (text.includes('�')) text = new TextDecoder('windows-1251').decode(buf)
    return parseCsv(text)
  }
  if (ext === 'xlsx' || ext === 'xls' || ext === 'ods') {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: false })
  }
  throw new Error('type')
}

function csvEscape(v) {
  const s = String(v ?? '')
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function downloadCsv(name, rows) {
  const blob = new Blob(['﻿' + rows.map((r) => r.map(csvEscape).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = name
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 0)
}

const pad = (n) => String(n).padStart(2, '0')
const defaultTag = () => { const d = new Date(); return `import_${pad(d.getDate())}${pad(d.getMonth() + 1)}${d.getFullYear()}_${pad(d.getHours())}${pad(d.getMinutes())}` }

function downloadSample(isLeads) {
  downloadCsv(isLeads ? 'leads-sample.csv' : 'contacts-sample.csv', isLeads
    ? [['Bitim nomi', 'Byudjet', 'Teglar', 'Kontakt: ism', 'Kontakt: telefon', 'Kontakt: email', 'Kompaniya'], ['Sayt buyurtmasi', '1500000', 'sayt;vip', 'Aziz Karimov', '+998901234567', 'aziz@example.com', 'Demo LLC']]
    : [['Ism', 'Telefon', 'Email', 'Lavozim', 'Kompaniya'], ['Aziz Karimov', '+998901234567', 'aziz@example.com', 'Direktor', 'Demo LLC']])
}

/** amoCRM "…" → "Импорт" modali: "Импорт из таблицы" kartochkasi; fayl tanlansa moslash qadamiga o'tiladi. */
export function ImportModal({ entity = 'leads', onClose }) {
  const t = useT()
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [view, setView] = useState('main') // main | history
  const [sheet, setSheet] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [hist, setHist] = useState(null)
  const pick = (file) => { if (file) { onClose(); navigate(`/${entity}/import`, { state: { file } }) } }
  const loadSheet = async () => {
    if (!sheet.trim() || busy) return
    setBusy(true); setErr('')
    try {
      const r = await api.post('/crm/import-sheet', { url: sheet.trim() })
      pick(new File([r.csv], r.name, { type: 'text/csv' }))
    } catch (e) { setErr(e?.data?.message || e?.message || t('Xatolik yuz berdi')) } finally { setBusy(false) }
  }
  const openHistory = () => { setView('history'); api.get('/crm/import-history').then((r) => setHist(r.items || [])).catch(() => setHist([])) }
  return (
    <div className="ac-modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ac-modal ac-import-modal">
        <div className="ac-import-modal__head">
          <h2 className="ac-modal__title">{t(view === 'history' ? 'Import qilingan fayllar' : 'Import')}</h2>
          <button className="ac-import-modal__cancel" onClick={view === 'history' ? () => setView('main') : onClose}>{t(view === 'history' ? 'Orqaga' : 'Bekor qilish')}</button>
        </div>
        {view === 'history' ? (
          <div className="ac-import-hist">
            {!hist && <div className="ac-spinner" style={{ margin: 30 }} />}
            {hist && !hist.length && <div className="ac-muted">{t("Hali import qilinmagan")}</div>}
            {hist && hist.length > 0 && (
              <table className="ac-table">
                <thead><tr><th>{t('Sana')}</th><th>{t('Fayl')}</th><th>{t('Kim')}</th><th>{t("Qo'shildi")}</th><th>{t('Yangilandi')}</th><th>{t("O'tkazildi")}</th><th>{t('Xatolar')}</th></tr></thead>
                <tbody>{hist.map((h, i) => (
                  <tr key={i}><td>{dmy(h.at)}</td><td>{h.fileName} <span className="ac-muted">({t(h.entity === 'contacts' ? 'Kontaktlar' : 'Bitimlar')})</span></td><td>{h.userName}</td><td>{h.created}</td><td>{h.updated}</td><td>{h.skipped}</td><td>{h.errors}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        ) : (
          <>
            <div className="ac-import-card">
              <span className="ac-import-card__ico">XLS</span>
              <div>
                <div className="ac-import-card__title">{t('Jadvaldan import')}</div>
                <p>{t("Excel'dan import .xls, .xlsx, .ods va .csv fayllarini qo'llab-quvvatlaydi. Import bir yo'la kompaniyalar, kontaktlar, bitimlar, barcha qo'shimcha maydonlar va izohlarni olib kirish imkonini beradi.")}</p>
                <p>{t("Agar faylda «Sana» maydoni bo'lsa, Excel faylini «CSV (vergul bilan ajratilgan)» formatiga o'tkazing: «Saqlash…» → «CSV (vergul bilan ajratilgan)» → «Saqlash».")}</p>
                <div className="ac-import-card__btns">
                  <button className="ac-btn ac-btn--plain ac-import-btn" onClick={() => inputRef.current?.click()}>{t('Faylni yuklash')}</button>
                  <a onClick={() => downloadSample(entity === 'leads')}>{t('Namunani yuklab olish')}</a>
                </div>
                <input ref={inputRef} type="file" hidden accept=".csv,.txt,.xlsx,.xls,.ods" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
              </div>
            </div>
            <div className="ac-import-card ac-import-card--plain">
              <span className="ac-import-card__ico ac-import-card__ico--docs">DOCS</span>
              <div>
                <div className="ac-import-card__title">{t('Google jadvallaridan import')}</div>
                <p>{t("Bazangiz Google jadvallarida bo'lsa, u bilan darhol ishlashni boshlashingiz mumkin. Jadvalga «Havolaga ega har kim ko'ra oladi» ruxsatini bering va havolani shu yerga qo'ying.")}</p>
                <div className="ac-import-card__btns">
                  <input className="ac-input ac-import-card__url" placeholder="https://docs.google.com/spreadsheets/d/…" value={sheet} onChange={(e) => setSheet(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && loadSheet()} />
                  <button className="ac-btn ac-btn--plain ac-import-btn" disabled={!sheet.trim() || busy} onClick={loadSheet}>{t(busy ? 'Yuklanmoqda…' : 'Jadvalni tanlash')}</button>
                </div>
                {err && <div className="ac-import-err" style={{ margin: '8px 0 0' }}>{err}</div>}
              </div>
            </div>
            <a className="ac-import-modal__hist" onClick={openHistory}>{t("Import qilingan fayllarni ko'rish")}</a>
          </>
        )}
      </div>
    </div>
  )
}

export default function ImportPage({ entity = 'leads' }) {
  const t = useT()
  const navigate = useNavigate()
  const isLeads = entity === 'leads'
  const base = isLeads ? LEAD_FIELDS : CONTACT_FIELDS

  const [step, setStep] = useState(1)
  const [fileName, setFileName] = useState('')
  const [header, setHeader] = useState([])
  const [body, setBody] = useState([])
  const [mapping, setMapping] = useState([]) // ustun indeksi -> maydon kaliti ('' = o'tkazish)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [pipelineId, setPipelineId] = useState('')
  const [stageKey, setStageKey] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [addTag, setAddTag] = useState(true)
  const [tag, setTag] = useState(defaultTag)
  const [dupMode, setDupMode] = useState('skip')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const stopRef = useRef(false)
  const inputRef = useRef(null)

  const { data: meta } = useApi(async () => {
    const [f, m, p] = await Promise.all([
      crmService.listFields(isLeads ? 'lead' : 'contact').catch(() => ({ fields: [] })),
      crmService.listMembers().catch(() => ({ members: [] })),
      isLeads ? crmService.listPipelines().catch(() => ({ pipelines: [] })) : { pipelines: [] },
    ])
    return { fields: f.fields || [], members: m.members || [], pipelines: p.pipelines || [] }
  }, [entity])
  const { data: pipe } = useApi(async () => (isLeads ? crmService.getPipeline(pipelineId || undefined) : { stages: [] }), [entity, pipelineId])
  const stages = (pipe?.stages || []).filter((s) => s.kind === 'open')

  const fields = useMemo(() => [
    ...base,
    ...(meta?.fields || []).filter((f) => f.active !== false).map((f) => ({ key: `cf:${f.key}`, label: f.label, custom: true, syn: [norm(f.label), norm(f.key)] })),
  ], [base, meta])

  const guess = (h, taken) => {
    const n = norm(h)
    if (!n) return SKIP
    const f = fields.find((x) => !taken.has(x.key) && (x.syn.includes(n) || norm(x.label) === n || norm(t(x.label)) === n))
    return f ? f.key : SKIP
  }

  const onFile = async (file) => {
    if (!file) return
    setErr(''); setBusy(true)
    try {
      const rows = (await readFile(file)).filter((r) => r.some((c) => String(c ?? '').trim() !== ''))
      if (rows.length < 2) { setErr(t(rows.length ? "Faylda ma'lumot qatorlari topilmadi" : "Fayl bo'sh yoki o'qib bo'lmadi")); return }
      const width = Math.max(...rows.map((r) => r.length))
      const h = Array.from({ length: width }, (_, i) => String(rows[0][i] ?? '').trim())
      const taken = new Set()
      const map = h.map((x) => { const k = guess(x, taken); if (k) taken.add(k); return k })
      setHeader(h); setBody(rows.slice(1)); setMapping(map); setFileName(file.name); setStep(2)
    } catch (e) {
      setErr(t(e.message === 'type' ? "Fayl turi qo'llab-quvvatlanmaydi" : "Fayl bo'sh yoki o'qib bo'lmadi"))
    } finally { setBusy(false) }
  }

  const sampleFile = () => downloadSample(isLeads)

  // "Импорт" modalidan tanlangan fayl (router state) — meta yuklangach darhol moslash qadamiga
  const location = useLocation()
  const handed = useRef(false)
  useEffect(() => {
    const file = location.state?.file
    if (!file || !meta || handed.current) return
    handed.current = true
    navigate(location.pathname, { replace: true, state: null })
    onFile(file)
  }, [meta]) // eslint-disable-line react-hooks/exhaustive-deps

  const setMap = (i, key) => setMapping((m) => m.map((v, j) => (j === i ? key : key && v === key ? SKIP : v)))
  const required = base.find((f) => f.required)
  const nameMapped = mapping.includes(required.key)

  const buildRows = () => body.map((r, idx) => {
    const o = { _row: idx + 2 }
    mapping.forEach((k, i) => { if (k) o[k] = String(r[i] ?? '').trim() })
    return o
  })

  const run = async () => {
    setStep(4); setResult(null); setProgress(0); stopRef.current = false
    const rows = buildRows()
    const total = { created: 0, updated: 0, skipped: 0, errors: [] }
    const options = { pipelineId: pipelineId || null, stageKey: stageKey || null, assigneeId: assigneeId || null, tag: addTag ? tag.trim() : null, dupMode }
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        if (stopRef.current) break
        const res = await api.post(`/crm/import/${entity}`, { rows: rows.slice(i, i + CHUNK), options })
        total.created += res.created; total.updated += res.updated; total.skipped += res.skipped
        total.errors.push(...res.errors)
        setProgress(Math.min(rows.length, i + CHUNK))
        // dublikatlar qismlar orasida ham aniqlansin: keyingi partiya yangi yaratilganlarni ko'radi
      }
      setResult({ ...total, stopped: stopRef.current, fatal: '' })
      api.post('/crm/import-history', { entity, fileName, created: total.created, updated: total.updated, skipped: total.skipped, errors: total.errors.length }).catch(() => {})
    } catch (e) {
      setResult({ ...total, fatal: e.message || t('Importda xatolik') })
    }
  }

  const reset = () => { setStep(1); setHeader([]); setBody([]); setMapping([]); setFileName(''); setResult(null); setErr(''); setTag(defaultTag()) }
  const steps = ['Fayl yuklash', 'Maydonlarni moslash', 'Sozlamalar', 'Natija']
  const fieldLabel = (f) => t(f.label)

  return (
    <>
      <div className="ac-top"><div className="ac-top__preset"><span className="ac-top__title">{t(isLeads ? 'Bitimlar importi' : 'Kontaktlar importi')}</span></div></div>
      <div className="ac-import">
        <div className="ac-import-steps">
          {steps.map((s, i) => <div key={s} className={`ac-import-step ${step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}`}>{t(s)}</div>)}
        </div>

        {step === 1 && (
          <>
            <div
              className={`ac-import-drop ${over ? 'over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOver(true) }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files?.[0]) }}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? <div className="ac-spinner" /> : <Ico name="excel" size={34} />}
              <div className="ac-import-drop__title">{t(busy ? "Fayl o'qilmoqda…" : 'Faylni shu yerga tashlang')}</div>
              <div className="ac-muted">{t('yoki')} <span className="ac-import-drop__link">{t('faylni tanlang')}</span></div>
              <div className="ac-muted" style={{ fontSize: 13 }}>{t("Qo'llab-quvvatlanadi: CSV, XLSX, XLS")}</div>
              <input ref={inputRef} type="file" hidden accept=".csv,.txt,.xlsx,.xls,.ods" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
            </div>
            {err && <div className="ac-import-err">{err}</div>}
            <button className="ac-import-sample" onClick={sampleFile}><Ico name="download" size={14} />{t('Namuna faylni yuklab olish')}</button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="ac-import-file ac-muted">{t('Fayl')}: <b style={{ color: 'var(--palette-text-primary)' }}>{fileName}</b> · {t('Jami qatorlar')}: {body.length}</div>
            <table className="ac-import-map" style={{ marginTop: 14 }}>
              <thead><tr><th style={{ width: '28%' }}>{t('Ustun')}</th><th style={{ width: '34%' }}>{t('Maydon')}</th><th>{t('Namuna')}</th></tr></thead>
              <tbody>
                {header.map((h, i) => (
                  <tr key={i} className={mapping[i] ? '' : 'skip'}>
                    <td>{h || `${t('Ustun')} ${i + 1}`}</td>
                    <td>
                      <select className="ac-select" value={mapping[i] || ''} onChange={(e) => setMap(i, e.target.value)}>
                        <option value="">{t("Bu ustunni o'tkazib yuborish")}</option>
                        <optgroup label={t('Asosiy maydonlar')}>
                          {fields.filter((f) => !f.custom).map((f) => <option key={f.key} value={f.key}>{fieldLabel(f)}</option>)}
                        </optgroup>
                        {fields.some((f) => f.custom) && (
                          <optgroup label={t('Maxsus maydonlar')}>
                            {fields.filter((f) => f.custom).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                          </optgroup>
                        )}
                      </select>
                    </td>
                    <td className="sample">{body.slice(0, 3).map((r) => r[i]).filter(Boolean).join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ac-import-preview">
              <h4>{t('Birinchi 5 qator')}</h4>
              <table>
                <thead><tr>{header.map((h, i) => <th key={i} className={mapping[i] ? 'mapped' : ''}>{mapping[i] ? fieldLabel(fields.find((f) => f.key === mapping[i]) || { label: mapping[i] }) : <span style={{ opacity: 0.5 }}>—</span>}</th>)}</tr></thead>
                <tbody>{body.slice(0, 5).map((r, ri) => <tr key={ri}>{header.map((_, i) => <td key={i} style={mapping[i] ? undefined : { opacity: 0.4 }}>{r[i]}</td>)}</tr>)}</tbody>
              </table>
            </div>
            {!nameMapped && <div className="ac-import-err">{t(isLeads ? 'Bitim nomi maydoni majburiy' : 'Ism maydoni majburiy')}</div>}
            <div className="ac-import-foot">
              <button className="ac-btn" onClick={reset}>{t('Orqaga')}</button>
              <button className="ac-btn ac-btn--blue" disabled={!nameMapped} onClick={() => setStep(3)}>{t('Keyingi')}</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            {isLeads && (
              <div className="ac-import-sec">
                <h3>{t('Voronka va bosqich')}</h3>
                <p className="hint">{t('Import qilinadigan bitimlar shu bosqichga tushadi')}</p>
                <div className="ac-import-row">
                  <select className="ac-select" value={pipelineId} onChange={(e) => { setPipelineId(e.target.value); setStageKey('') }}>
                    <option value="">{t('imp§Asosiy')}</option>
                    {(meta?.pipelines || []).filter((p) => !p.isDefault).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <select className="ac-select" value={stageKey} onChange={(e) => setStageKey(e.target.value)}>
                    <option value="">{stages[0] ? stages[0].name : t('Bosqich')}</option>
                    {stages.slice(1).map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
                  </select>
                </div>
              </div>
            )}
            <div className="ac-import-sec">
              <h3>{t("Mas'ul xodim")}</h3>
              <p className="hint">{t("Faylda ko'rsatilmagan bo'lsa")}</p>
              <select className="ac-select" style={{ width: 260 }} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                <option value="">—</option>
                {(meta?.members || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            {isLeads && (
              <div className="ac-import-sec">
                <h3>{t("Teg qo'shish")}</h3>
                <p className="hint">{t("Import qilingan yozuvlarga teg qo'shiladi")}</p>
                <label className="ac-import-check"><input type="checkbox" className="ac-check" checked={addTag} onChange={(e) => setAddTag(e.target.checked)} />{t("Teg qo'shish")}</label>
                {addTag && <input className="ac-input" style={{ width: 260 }} value={tag} onChange={(e) => setTag(e.target.value)} />}
              </div>
            )}
            <div className="ac-import-sec">
              <h3>{t('Dublikatlar')}</h3>
              <p className="hint">{t("Telefon yoki email bo'yicha tekshiriladi")}</p>
              {[['skip', "O'tkazib yuborish", "Dublikat topilsa — yozuv import qilinmaydi"], ['update', 'Mavjudini yangilash', "Dublikat topilsa — bo'sh bo'lmagan maydonlar yangilanadi"], ['create', 'Baribir yaratish', 'Dublikatlar ham alohida yozuv sifatida yaratiladi']].map(([v, l, d]) => (
                <label key={v} className="ac-import-radio"><input type="radio" name="dup" checked={dupMode === v} onChange={() => setDupMode(v)} /><span>{t(l)}<small>{t(d)}</small></span></label>
              ))}
            </div>
            <div className="ac-import-foot">
              <button className="ac-btn" onClick={() => setStep(2)}>{t('Orqaga')}</button>
              <button className="ac-btn ac-btn--blue" disabled={addTag && isLeads && !tag.trim()} onClick={run}>{t('Importni boshlash')}</button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            {!result && (
              <>
                <h3 style={{ margin: 0 }}>{t('Import qilinmoqda…')}</h3>
                <div className="ac-import-progress"><i style={{ width: `${(progress / Math.max(1, body.length)) * 100}%` }} /></div>
                <div className="ac-muted">{progress} / {body.length}</div>
                <div className="ac-import-foot"><button className="ac-btn" onClick={() => { stopRef.current = true }}>{t("Importni to'xtatish")}</button></div>
              </>
            )}
            {result && (
              <>
                <h3 style={{ margin: 0 }}>{t('Import yakunlandi')}</h3>
                {result.fatal && <div className="ac-import-err">{result.fatal}</div>}
                <div className="ac-import-stats">
                  <div className="ac-import-stat"><b>{result.created}</b><span>{t('Yaratildi')}</span></div>
                  <div className="ac-import-stat"><b>{result.updated}</b><span>{t('Yangilandi')}</span></div>
                  <div className="ac-import-stat"><b>{result.skipped}</b><span>{t("O'tkazib yuborildi")}</span></div>
                  <div className="ac-import-stat err"><b>{result.errors.length}</b><span>{t('Xatolar')}</span></div>
                </div>
                {result.errors.length > 0 && (
                  <>
                    <div className="ac-import-errs">
                      {result.errors.slice(0, 200).map((e, i) => <div key={i}><b>{t('Qator')} {e.row}</b><span>{e.message}</span></div>)}
                    </div>
                    <button className="ac-import-sample" onClick={() => downloadCsv('import-errors.csv', [[t('Qator'), t('Xato')], ...result.errors.map((e) => [e.row, e.message])])}><Ico name="download" size={14} />{t('Xatolarni yuklab olish')}</button>
                  </>
                )}
                <div className="ac-import-foot">
                  <button className="ac-btn ac-btn--blue" onClick={() => navigate(isLeads ? '/leads/list' : '/contacts/list')}>{t(isLeads ? "Bitimlarga o'tish" : "Kontaktlarga o'tish")}</button>
                  <button className="ac-btn" onClick={reset}>{t('Yangi import')}</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}
