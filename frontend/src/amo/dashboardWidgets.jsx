// amoCRM ish stoli vidjetlari: joylashuv (server), vidjetlar katalogi, filtr vidjeti (Цифра / Диаграмма / Список)
// va vidjet sozlamalari oynasi (ish stolida ham, voronka/ro'yxatdagi «Создать виджет на раб. стол»da ham).
import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/apiClient'
import { crmService } from '../services/crm.service'
import { useApi } from '../lib/useApi'
import { Ico } from './AmoIcons'
import { money } from './format'
import { useT, usePlural } from './i18n'
import './i18n/dashboard.ru.js'

// Tizim vidjetlari: tur → sarlavha va o'lcham (small 1x1, big 2x2, wide — butun qator)
export const SYSTEM_WIDGETS = {
  flow: { title: 'Sotuv tahlili', size: 'wide' },
  total: { title: 'Jami bitimlar', size: 'big' },
  month: { title: "Oy bo'yicha bitimlar", size: 'big' },
  sources: { title: 'Bitim manbalari', size: 'big' },
  forecast: { title: 'Sotuv prognozi', size: 'small' },
  overdue: { title: "Muddati o'tgan vazifalar", size: 'small' },
  today_tasks: { title: 'Bugungi vazifalar', size: 'small' },
  calls: { title: "Qo'ng'iroqlar", size: 'small' },
  missed: { title: "O'tkazib yuborilgan qo'ng'iroqlar", size: 'small' },
  processed: { title: 'Ishlov berilgan suhbatlar', size: 'small' },
  incoming: { title: 'Kiruvchi xabarlar', size: 'small' },
  outgoing: { title: 'Chiquvchi xabarlar', size: 'small' },
  avg_resp: { title: "O'rtacha javob vaqti", size: 'small' },
  median_resp: { title: 'Javob vaqti medianasi', size: 'small' },
  long_wait: { title: 'Uzoq javob kutmoqda', size: 'small' },
  members: { title: 'Xodimlar', size: 'small' },
}

export const DEFAULT_LAYOUT = {
  font: 'light', theme: 'navy', bg: null,
  widgets: ['flow', 'total', 'month', 'sources', 'overdue', 'today_tasks', 'calls', 'missed', 'avg_resp', 'long_wait', 'members'].map((type) => ({ id: type, type })),
  library: [],
}

export const sizeOf = (w) => (w.type === 'filter' ? (w.view === 'number' ? 'small' : 'big') : SYSTEM_WIDGETS[w.type]?.size || 'small')

export async function loadLayout() {
  const r = await api.get('/crm/dashboard').catch(() => null)
  const l = r?.layout
  return l && Array.isArray(l.widgets) ? { ...DEFAULT_LAYOUT, ...l, library: l.library || [] } : DEFAULT_LAYOUT
}
export const saveLayout = (layout, applyAll = false) => api.put('/crm/dashboard', { layout, applyAll })

/** Voronka/ro'yxat filtridan vidjet yaratish (joriy foydalanuvchi ish stoliga). */
export async function addFilterWidget(widget) {
  const l = await loadLayout()
  await saveLayout({ ...l, widgets: [...l.widgets, { ...widget, id: `f${Date.now().toString(36)}`, type: 'filter' }] })
}

/** «Сравнение с показателем» variantlari: bosqich, mas'ul, yo'qotish sababi + ro'yxatli qo'shimcha maydonlar. */
function useCompareOptions() {
  const { data: fr } = useApi(() => crmService.listFields('lead').catch(() => null), [], 'fields:lead')
  const fields = (fr?.fields || []).filter((f) => f.active !== false && ['select', 'multiselect', 'text'].includes(f.type))
  return [
    ['stage', 'Bitim bosqichi'], ['assignee', "Mas'ul menejer"], ['lostReason', "Yo'qotish sababi"],
    ...fields.map((f) => [`cf:${f.key}`, f.label]),
  ]
}

const VIEWS = [
  ['number', 'dw§Raqam', "Ma'lumotlar tanlovining raqamli ko'rinishi", 'w-number'],
  ['chart', 'Diagramma', "Ko'rsatkich bilan solishtirish:", 'w-chart'],
  ['list', "Ro'yxat", 'Filtr natijalari jadvali', 'w-list'],
]

/** amoCRM vidjet sozlamalari: nom, 3 ko'rinish (Цифра / Диаграмма + ko'rsatkich / Список), «Удалить виджет». */
export function WidgetModal({ value, onApply, onCancel, onDelete }) {
  const t = useT()
  const opts = useCompareOptions()
  const [w, setW] = useState({ view: 'number', compareBy: 'stage', ...value })
  return createPortal(
    <div className="ac-modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="ac-modal ac-wmodal">
        <div className="ac-wmodal__head">
          <input className="ac-wmodal__title" value={w.title || ''} placeholder={t('Vidjet nomi')} onChange={(e) => setW({ ...w, title: e.target.value })} autoFocus />
          <button className="ac-wmodal__cancel" onClick={onCancel}>{t('Bekor qilish')}</button>
          <button className="ac-btn" onClick={() => onApply({ ...w, title: (w.title || '').trim() || t('Filtr') })}>{t("Qo'llash")}</button>
        </div>
        <div className="ac-wmodal__views">
          {VIEWS.map(([k, label, desc, ico]) => (
            <div key={k} className={`ac-wmodal__view ${w.view === k ? 'on' : ''}`} onClick={() => setW({ ...w, view: k })}>
              <span className={`ac-wmodal__pic ${ico}`}><i /><i /><i /><i /></span>
              <b>{t(label)}</b>
              <small>{t(desc)}</small>
              {k === 'chart' && (
                <select className="ac-select" value={w.compareBy} onClick={(e) => e.stopPropagation()} onChange={(e) => setW({ ...w, view: 'chart', compareBy: e.target.value })}>
                  {opts.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
                </select>
              )}
            </div>
          ))}
        </div>
        {onDelete && <button className="ac-wmodal__del" onClick={onDelete}><Ico name="trash" size={14} /> {t("Vidjetni o'chirish")}</button>}
      </div>
    </div>,
    document.body,
  )
}

/** Filtr vidjeti: saqlangan filtr bo'yicha son/diagramma/ro'yxat; ish stoli davri o'sish uchun, «Meniki» — userIds. */
export function FilterWidget({ w, range, mineId, periodWord }) {
  const t = useT()
  const plural = usePlural()
  const navigate = useNavigate()
  const [d, setD] = useState(null)
  const key = JSON.stringify([w.filter, w.view, w.compareBy, range.from, range.to, mineId])
  useEffect(() => {
    let alive = true
    api.get(`/crm/dashboard/widget?${new URLSearchParams({
      filter: JSON.stringify(w.filter || {}), view: w.view || 'number', compareBy: w.compareBy || 'stage',
      ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}), ...(mineId ? { userIds: mineId } : {}),
    })}`).then((r) => alive && setD(r)).catch(() => alive && setD({ count: 0, sum: 0, delta: 0 }))
    return () => { alive = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  // vidjet bosilsa — shu filtr bilan bitimlar ro'yxati
  const open = () => navigate(`/leads/list?${new URLSearchParams(Object.fromEntries(Object.entries(w.filter || {}).filter(([k]) => k !== 'pipelineId')))}`)
  if (!d) return <div className="ac-dash-tile__body"><div className="ac-spinner" /></div>
  const head = (
    <div className="ac-dash-tile__top">
      <div>
        <div className={`ac-dash-big ${w.view === 'number' ? 'ac-dash-big--sm' : ''}`} onClick={open} style={{ cursor: 'pointer' }}>{d.count}</div>
        <div className="ac-dash-sum">{money(d.sum)}</div>
      </div>
      {w.view !== 'number' && <div className="ac-dash-delta"><b>{d.delta > 0 ? `+${d.delta}` : d.delta}</b><span>{t(periodWord)}</span></div>}
    </div>
  )
  if (w.view === 'number') return <>{head}<div className="ac-dash-cap">{d.delta > 0 ? `+${d.delta}` : d.delta} {t(periodWord)}</div></>
  if (w.view === 'list') {
    return (
      <>
        {head}
        <hr className="ac-dash-hr" />
        <div className="ac-dash-wlist">
          {(d.items || []).map((x) => (
            <div key={x.id} className="ac-dash-wlist__row" onClick={() => navigate(`/leads/${x.id}`)}>
              <span className="ac-dash-wlist__name">{x.name}</span>
              <span className="ac-dash-status" style={{ background: x.color || '#d5d8db' }}>{x.stage}</span>
              <span className="ac-dash-wlist__sum">{money(x.value)}</span>
            </div>
          ))}
          {!d.items?.length && <div className="ac-dash-empty">{t("Ma'lumot yo'q")}</div>}
        </div>
      </>
    )
  }
  const total = d.count || 1
  const rows = [...(d.groups || []), ...(d.other?.count ? [{ key: '_other', label: t('Boshqalar'), count: d.other.count, sum: d.other.sum, delta: null }] : [])]
  return (
    <>
      {head}
      <hr className="ac-dash-hr" />
      <div className="ac-dash-chart">
        {rows.map((g, i) => (
          <div className="ac-dash-chart__item" key={g.key}>
            <div className="ac-dash-chart__row">
              <span className="ac-dash-status" style={{ background: g.color || '#d5d8db' }}>{t(g.label)}</span>
              <span className="ac-dash-chart__count">{i === 0 ? plural(g.count, 'bitim') : g.count}</span>
              <span className="ac-dash-chart__sum">({money(g.sum)})</span>
              {g.delta !== null && <span className={`ac-dash-chart__delta ${g.delta > 0 ? 'pos' : ''}`}>{g.delta > 0 ? `+${g.delta}` : g.delta}</span>}
            </div>
            <div className="ac-dash-chart__track"><i style={{ width: `${Math.max(g.count ? 1.5 : 0, (g.count / total) * 100)}%` }} /></div>
          </div>
        ))}
      </div>
    </>
  )
}

/**
 * amoCRM: bitimlar soni ustida «Создать виджет на раб. стол» — bosilsa joriy filtr bilan vidjet yaratiladi
 * (nom va ko'rinish tanlanadi). filter — voronka/ro'yxat filtrining API parametrlari.
 */
export function CountWidget({ filter, defaultTitle, children }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState('')
  const apply = async (w) => {
    setOpen(false)
    try { await addFilterWidget({ ...w, filter }); setDone(t("Vidjet ish stoliga qo'shildi")) } catch (e) { setDone(e?.message || t('Xatolik yuz berdi')) }
    setTimeout(() => setDone(''), 3000)
  }
  return (
    <>
      <span className="ac-countw" title={t('Ish stoliga vidjet yaratish')} onClick={() => setOpen(true)}>{children}</span>
      {open && <WidgetModal value={{ title: defaultTitle, view: 'number', compareBy: 'stage' }} onCancel={() => setOpen(false)} onApply={apply} />}
      {done && createPortal(<div className="ac-countw__toast">{done}</div>, document.body)}
    </>
  )
}
