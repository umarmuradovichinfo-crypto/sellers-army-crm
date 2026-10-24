// amoCRM "Сделки" — voronka ko'rinishi (/leads/pipeline/:pipelineId).
// Tuzilma: yuqori panel → ustun sarlavhalari (sticky) → kartalar; drag paytida pastda yopish zonalari.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { crmService } from '../../services/crm.service'
import { useAuth } from '../../context/AuthContext'
import { useApi } from '../../lib/useApi'
import TopBar from '../TopBar'
import { Ico } from '../AmoIcons'
import { money, cardDate } from '../format'
import LeadsFilter from '../LeadsFilter'
import FieldsModal from '../FieldsModal'
import BulkBar from '../BulkBar'
import { useLeadsQuery, useFilterMeta, filterChips, sortMenuItem, downloadLeadsCsv, useLayout, CARD_FIELDS, CARD_DEFAULT, withCustomFields } from '../filterState'
import { useTagColors, tagStyle } from '../tagColors'
import { useT, usePlural } from '../i18n'
import '../i18n/leadcard.ru.js'
import '../i18n/leadsfilter.ru.js'
import '../leads.css'

const PAGE = 50

export function ViewSwitch({ mode }) {
  const navigate = useNavigate()
  const { pipelineId } = useParams()
  const t = useT()
  return (
    <div className="ac-top__switch">
      <button className={mode === 'pipeline' ? 'on' : ''} title={t('Voronka')} onClick={() => navigate(`/leads/pipeline/${pipelineId || ''}`)}><Ico name="pipeline" /></button>
      <button className={mode === 'list' ? 'on' : ''} title={t("Ro'yxat")} onClick={() => navigate('/leads/list')}><Ico name="burger" /></button>
    </div>
  )
}

function Avatar({ src }) {
  return (
    <div className="ac-card__avatar">
      <svg viewBox="0 0 36 36"><circle cx="18" cy="14" r="6.5" fill="#fff" /><path d="M5 34c1.5-7 6.5-10.5 13-10.5S29.5 27 31 34" fill="#fff" /></svg>
      {src && <span className="ac-card__src"><Ico name={/telegram/i.test(src) ? 'telegram' : 'instagram'} size={9} /></span>}
    </div>
  )
}

// amoCRM: rejalashtirilgan vazifa bo'lsa belgi yo'q; vazifa yo'q — sariq, muddati o'tgan — qizil.
// Matn faqat teglar bo'lmaganda (joy bo'lsa) ko'rinadi.
function TaskMark({ s, compact }) {
  const t = useT()
  if (!s) return null
  const kind = s.kind || 'none'
  if (kind === 'today' || kind === 'future') return null
  return <span className={`ac-card__task ${kind}`} title={t(s.label)}>{!compact && t(s.label)}<i /></span>
}

function LeadCard({ lead, onOpen, onPointerDown, dragging, fields, bulk, selected, onToggle }) {
  const has = (k) => fields.includes(k)
  const tagColors = useTagColors()
  const tags = has('tags') ? lead.tags || [] : []
  const title = has('contact') ? lead.contactName || lead.n : lead.n
  const t = useT()
  // Qo'shimcha qatorlar kartochka sozlamasidagi tartibda
  const lines = fields.map((k) => {
    if (k === 'company') return lead.company
    if (k === 'phone') return lead.contactPhone || lead.phone
    if (k === 'email') return lead.email
    if (k === 'source') return lead.source
    if (k === 'assignee') return lead.assigneeName
    if (k.startsWith('cf:')) { const v = lead.custom?.[k.slice(3)]; return Array.isArray(v) ? v.join(', ') : v === true ? t('Ha') : v }
    return null
  })
  return (
    <div className={`ac-card ${dragging ? 'dragging-src' : ''} ${bulk ? 'ac-card--bulk' : ''} ${selected ? 'sel' : ''}`} onPointerDown={(e) => !bulk && onPointerDown(e, lead)} onClick={() => bulk && onToggle(lead.id)} data-lead={lead.id}>
      {bulk && <input type="checkbox" className="ac-check ac-card__chk" readOnly checked={!!selected} />}
      {has('avatar') && <Avatar />}
      <div className="ac-card__body">
        {/* amoCRM: kompaniya nomi bitim nomi ustida kulrang */}
        {has('company') && lead.company && <div className="ac-card__company">{lead.company}</div>}
        <div className="ac-card__row">
          <span className="ac-card__name" onClick={(e) => { if (bulk) return; e.stopPropagation(); onOpen(lead) }} onPointerDown={(e) => e.stopPropagation()}>{title}</span>
          {has('date') && <span className="ac-card__date">{cardDate(lead.createdAt, t)}</span>}
        </div>
        {has('contact') && lead.contactName && lead.contactName !== lead.n && <div className="ac-card__sub">{lead.n}</div>}
        {fields.map((k, i) => {
          if (k === 'budget') return lead.value > 0 ? <div key={k} className="ac-card__budget">{money(lead.value)}</div> : null
          if (k === 'company') return null
          const v = lines[i]
          if (v == null || v === '') return null
          return <div key={k} className={k === 'assignee' ? 'ac-card__sub' : 'ac-card__extra'}>{v}</div>
        })}
        {(has('tags') || has('task')) && (
          <div className="ac-card__foot">
            <div className="ac-card__tags">
              {tags.slice(0, 2).map((x) => <span key={x} className={`ac-tag ac-tag--sm ${tagColors[x] ? 'ac-tag--c' : ''}`} style={tagStyle(tagColors[x])}>{x}</span>)}
              {tags.length > 2 && <span className="ac-tag ac-tag--sm ac-tag--more">+{tags.length - 2}</span>}
            </div>
            {has('task') && <TaskMark s={lead.taskStatus} compact={tags.length > 0} />}
          </div>
        )}
      </div>
    </div>
  )
}

const UTM_RE = /^(utm_|openstat_|_ym_|gclid|yclid|fbclid|gclientid|roistat|referrer|from$)/

function UnsortedCard({ lead, fields = [], onAccept, onReject, onOpen }) {
  const t = useT()
  // amoCRM: forma/Lead Ads arizasi — avatar o'rniga forma maydonlari ro'yxati (nom → qiymat)
  const answers = Object.entries(lead.custom || {}).filter(([k, v]) => !UTM_RE.test(k) && !k.startsWith('_') && v !== '' && v != null && typeof v !== 'object')
  if (lead.formName || answers.length) {
    const label = (k) => fields.find((f) => f.key === k)?.label || k
    const rows = [
      [t('Bitim nomi'), lead.n],
      ...answers.map(([k, v]) => [label(k), v === true ? t('Ha') : String(v)]),
      lead.contactName && [t('Kontakt ismi'), lead.contactName],
      (lead.contactPhone || lead.phone) && [t('Telefon'), lead.contactPhone || lead.phone],
      lead.company && [t('Kompaniya nomi'), lead.company],
    ].filter(Boolean)
    return (
      <div className="ac-card ac-card--unsorted ac-card--form">
        <div className="ac-card__body">
          <div className="ac-card__row">
            <span className="ac-card__formtitle" onClick={() => onOpen(lead)}>{lead.n}</span>
            <span className="ac-card__date">{cardDate(lead.createdAt, t)}</span>
          </div>
          {rows.map(([k, v], i) => <div key={i} className="ac-card__kv"><span title={k}>{k}</span><b title={v}>{v}</b></div>)}
        </div>
        <div className="ac-card__accept">
          <button className="ac-btn ac-btn--green ac-btn--sm" onClick={() => onAccept(lead)}><Ico name="check" size={12} /> {t('Qabul qilish')}</button>
          <button className="ac-btn ac-btn--sm" onClick={() => onReject(lead)}>{t('Rad etish')}</button>
        </div>
      </div>
    )
  }
  return (
    <div className="ac-card ac-card--unsorted">
      <Avatar src={lead.source || 'form'} />
      <div className="ac-card__body">
        <div className="ac-card__row">
          <span className="ac-card__from" style={{ flex: 1 }}>{t('dan')}: {lead.source || lead.formName || t('Forma')}</span>
          <span className="ac-card__date">{cardDate(lead.createdAt, t)}</span>
        </div>
        <div className="ac-card__name" onClick={() => onOpen(lead)}>{lead.n}</div>
        <span className="ac-card__msg">{lead.formName ? `${t('Forma')}: ${lead.formName}` : lead.phone || t("Yangi so'rov")}</span>
      </div>
      <div className="ac-card__accept">
        <button className="ac-btn ac-btn--green ac-btn--sm" onClick={() => onAccept(lead)}><Ico name="check" size={12} /> {t('Qabul qilish')}</button>
        <button className="ac-btn ac-btn--sm" onClick={() => onReject(lead)}>{t('Rad etish')}</button>
      </div>
    </div>
  )
}

function QuickAdd({ stage, pipelineId, onDone }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ name: '', contact: '', phone: '', value: '' })
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)
  const t = useT()
  useEffect(() => { if (open) ref.current?.focus() }, [open])
  const save = async () => {
    if (busy || (!f.name.trim() && !f.contact.trim())) return
    setBusy(true)
    try {
      await crmService.createLead({ name: f.name.trim() || f.contact.trim(), contactName: f.contact.trim() || undefined, phone: f.phone.trim() || undefined, value: Math.min(Number(String(f.value).replace(/\D/g, '')) || 0, 2000000000), stage: stage.id, pipelineId: pipelineId || undefined })
      setF({ name: '', contact: '', phone: '', value: '' })
      setOpen(false)
      onDone()
    } catch (e) { window.alert(e?.message || t('Xatolik yuz berdi')) } finally { setBusy(false) }
  }
  if (!open) return <div className="ac-quick"><button className="ac-quick__btn" onClick={() => setOpen(true)}>{t("Tez qo'shish")}</button></div>
  const inp = (k, ph) => <input className="ac-input" placeholder={t(ph)} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setOpen(false) }} />
  return (
    <div className="ac-quick">
      <div className="ac-quick__form">
        <input ref={ref} className="ac-input" placeholder={t('Bitim nomi')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setOpen(false) }} />
        {inp('contact', 'Kontakt: F.I.Sh.')}
        {inp('phone', 'Kontakt: telefon')}
        {inp('value', 'Byudjet')}
        <div className="ac-quick__row">
          <button className="ac-btn ac-btn--blue ac-btn--sm" disabled={busy} onClick={save}>{t("Qo'shish")}</button>
          <button className="ac-btn ac-btn--sm ac-btn--plain" onClick={() => setOpen(false)}>{t('Bekor qilish')}</button>
        </div>
      </div>
    </div>
  )
}

// Pointer asosidagi drag: amoCRM sortable kabi — kartani olib, ustunlar orasida joy belgisi bilan ko'chirish.
// Tinglovchilar pointerdown paytida darhol ulanadi (tez harakatda ham tashlash yo'qolmaydi).
function useCardDrag({ onDrop }) {
  const [drag, setDrag] = useState(null) // { lead, from, x, y, w, h, dx, dy, html, over }
  const cur = useRef(null)
  const dropRef = useRef(onDrop)
  dropRef.current = onDrop

  const locate = (x, y, leadId) => {
    const el = document.elementFromPoint(x, y)
    const zone = el?.closest?.('[data-zone]')
    if (zone) return { zone: zone.dataset.zone }
    const col = el?.closest?.('[data-stage]')
    if (!col) return null
    const cards = [...col.querySelectorAll('[data-lead]')].filter((c) => c.dataset.lead !== leadId)
    let index = cards.length
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect()
      if (y < r.top + r.height / 2) { index = i; break }
    }
    return { stage: col.dataset.stage, index }
  }

  const start = (e, lead, from) => {
    if (e.button !== 0) return
    const card = e.currentTarget
    const r = card.getBoundingClientRect()
    const sx = e.clientX, sy = e.clientY
    let active = false
    const move = (ev) => {
      if (!active) {
        if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 6) return
        active = true
        cur.current = { lead, from, w: r.width, h: r.height, dx: sx - r.left, dy: sy - r.top, html: card.outerHTML }
      }
      ev.preventDefault()
      cur.current = { ...cur.current, x: ev.clientX, y: ev.clientY, over: locate(ev.clientX, ev.clientY, lead.id) }
      setDrag(cur.current)
    }
    const up = (ev) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (!active) return
      const d = { ...cur.current, over: locate(ev.clientX, ev.clientY, lead.id) || cur.current.over }
      cur.current = null
      setDrag(null)
      if (d.over) dropRef.current(d.lead, d.from, d.over)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return { drag, start }
}

// Ustun oxiridagi kuzatuvchi: ko'rinish maydoniga kirsa keyingi sahifani so'raydi (cheksiz scroll)
function ColumnMore({ onMore }) {
  const ref = useRef(null)
  const cb = useRef(onMore)
  cb.current = onMore
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) cb.current() }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return <div ref={ref} className="ac-col__more" style={{ height: 36, display: 'flex', justifyContent: 'center', alignItems: 'center' }}><span className="ac-spinner" /></div>
}

function LostReasons({ reasons, at, onPick, onCancel }) {
  const t = useT()
  return (
    <>
      <div className="ac-overlay" style={{ background: 'transparent' }} onClick={onCancel} />
      <div className="ac-reasons" style={{ left: Math.min(at.x, window.innerWidth - 340), top: Math.max(20, at.y - 260) }}>
        <div className="ac-reasons__title">{t("Yo'qotish sababi")}</div>
        {(reasons.length ? reasons : [{ id: '', name: t('Sababsiz') }]).map((r) => (
          <div key={r.id || r.name} className="ac-reasons__item" onClick={() => onPick(r.name)}><Ico name="chevronRight" size={12} /> {r.name}</div>
        ))}
        <div className="ac-modal__foot" style={{ marginTop: 12 }}>
          <button className="ac-btn ac-btn--sm ac-btn--plain" onClick={onCancel}>{t('Bekor qilish')}</button>
        </div>
      </div>
    </>
  )
}

export default function LeadsPipeline() {
  const { pipelineId = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const t = useT()
  const plural = usePlural()
  const Q = useLeadsQuery()
  const { filter, search, setSearch, sort } = Q
  const meta = useFilterMeta()
  const layout = useLayout('card', CARD_DEFAULT)
  const [lostAsk, setLostAsk] = useState(null)
  const [cardModal, setCardModal] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(() => localStorage.getItem('amo_autorefresh') !== '0')
  const [bulk, setBulk] = useState(false)
  const [sel, setSel] = useState(new Set())

  // Filtr serverda qo'llanadi (URL query'dagi holat): har bosqichdan dastlabki PAGE ta karta + bosqich bo'yicha jami son/summa
  const filterParams = useMemo(() => ({ ...Q.params, ...Q.sortParams }), [Q.params, sort.key, sort.dir]) // eslint-disable-line
  const fKey = JSON.stringify(filterParams)
  const isFiltered = Q.isFiltered || !!sort.key
  const fKeyRef = useRef(fKey)
  fKeyRef.current = fKey
  const { data, reload, setData } = useApi(async () => {
    const { sort: _s, dir: _d, ...unsParams } = filterParams
    const [pipe, uns, lr] = await Promise.all([
      crmService.getPipeline(pipelineId || undefined, { limit: PAGE, ...filterParams }), crmService.listUnsorted(unsParams), crmService.listLostReasons(),
    ])
    return { ...pipe, unsorted: uns.leads || [], unsortedTotal: uns.total ?? (uns.leads || []).length, reasons: lr.reasons || [] }
  }, [pipelineId, fKey], isFiltered ? `ac-pipeline-${pipelineId}-f${fKey}` : `ac-pipeline-${pipelineId}`)

  const stages = data?.stages || []
  const openStages = stages.filter((s) => s.kind === 'open')
  const shownKind = filter.preset === 'won' || filter.preset === 'lost' ? filter.preset : 'open'
  // Bosqichlar filtri tanlangan bo'lsa — faqat tanlangan bosqichlar ustun bo'ladi (won/lost — shu turdagi barchasi)
  const picked = new Set(filter.stages)
  const shownStages = filter.stages.length
    ? stages.filter((s) => picked.has(`${pipelineId || 'main'}:${s.id}`) || picked.has(s.kind))
    : stages.filter((s) => s.kind === shownKind)
  const pipeName = (data?.pipelines || []).find((p) => String(p.id) === String(pipelineId))?.name || t(pipelineId ? 'Voronka' : 'Asosiy voronka')

  const cntOf = (s) => (s.count != null ? s.count : s.leads.length)
  const sumOf = (s) => (s.sumValue != null ? s.sumValue : s.leads.reduce((a, l) => a + (l.value || 0), 0))
  const totalCount = shownStages.reduce((a, s) => a + cntOf(s), 0)
  const totalSum = shownStages.reduce((a, s) => a + sumOf(s), 0)

  // Ustun pastiga aylantirilganda keyingi sahifa (kursor bo'yicha)
  const busy = useRef({})
  const extraLoaded = useRef(false)
  const loadMore = async (s) => {
    if (busy.current[s.id] || !s.nextCursor) return
    busy.current[s.id] = true
    const key = fKeyRef.current
    try {
      const r = await crmService.stageLeads({ stage: s.id, cursor: s.nextCursor, limit: PAGE, ...filterParams })
      if (key !== fKeyRef.current) return
      extraLoaded.current = true
      setData((d) => ({ ...d, stages: d.stages.map((st) => {
        if (st.id !== s.id) return st
        const have = new Set(st.leads.map((l) => l.id))
        return { ...st, leads: [...st.leads, ...(r.leads || []).filter((l) => !have.has(l.id))], nextCursor: r.nextCursor || null }
      }) }))
    } catch { /* keyingi aylantirishda qayta uriniladi */ } finally { busy.current[s.id] = false }
  }
  useEffect(() => { extraLoaded.current = false }, [pipelineId, fKey])
  // Fon yangilanishi: ochilgan qo'shimcha sahifalarni yo'qotmaslik uchun faqat birinchi sahifa ko'rinib turganda
  const dragRef = useRef(false)
  useEffect(() => {
    if (!autoRefresh) return undefined
    const iv = setInterval(() => { if (!extraLoaded.current && !dragRef.current) reload() }, 60000)
    return () => clearInterval(iv)
  }, [pipelineId, fKey, autoRefresh]) // eslint-disable-line

  // Optimistik ko'chirish: kartani + bosqich jamilarini (son/summa) yangilaydi
  const moveLocal = (lead, toStage, index) => {
    setData((d) => {
      const st = d.stages.map((s) => {
        const had = s.leads.some((l) => l.id === lead.id)
        let o = { ...s, leads: s.leads.filter((l) => l.id !== lead.id) }
        if (had || s.id === lead.stage) {
          // eski bosqichdan chiqdi (karta yuklangan yoki bu uning bosqichi bo'lsa)
          if (s.id !== toStage && s.count != null) o = { ...o, count: Math.max(0, s.count - 1), sumValue: Math.max(0, (s.sumValue || 0) - (lead.value || 0)) }
        }
        return o
      })
      const target = st.find((s) => s.id === toStage)
      if (target) {
        const from = d.stages.find((s) => s.id === lead.stage)
        if (target.count != null && (!from || from.id !== toStage)) { target.count += 1; target.sumValue = (target.sumValue || 0) + (lead.value || 0) }
        target.leads.splice(index ?? target.leads.length, 0, { ...lead, stage: toStage })
      }
      return { ...d, stages: st }
    })
  }
  const dropLocal = (lead) => {
    setData((d) => ({ ...d, stages: d.stages.map((s) => (s.id === lead.stage || s.leads.some((l) => l.id === lead.id)
      ? { ...s, leads: s.leads.filter((l) => l.id !== lead.id), ...(s.count != null ? { count: Math.max(0, s.count - 1), sumValue: Math.max(0, (s.sumValue || 0) - (lead.value || 0)) } : {}) }
      : s)) }))
  }

  const onDrop = async (lead, from, over) => {
    if (over.zone === 'delete') {
      dropLocal(lead)
      await crmService.deleteLead(lead.id).catch(() => reload())
      return
    }
    if (over.zone === 'won' || over.zone === 'lost') {
      const target = stages.find((s) => s.kind === over.zone)
      if (!target) return
      if (over.zone === 'lost') return setLostAsk({ lead, stage: target.id, at: { x: window.innerWidth / 2 - 160, y: window.innerHeight - 80 } })
      moveLocal(lead, target.id)
      await crmService.moveLead(lead.id, target.id).catch(() => reload())
      return
    }
    if (!over.stage || (over.stage === from && over.index == null)) return
    moveLocal(lead, over.stage, over.index)
    await crmService.moveLead(lead.id, over.stage, over.index).catch(() => reload())
  }
  const { drag, start } = useCardDrag({ onDrop })
  dragRef.current = !!drag

  const acceptUnsorted = async (lead) => {
    const first = openStages[0]
    try { await crmService.acceptUnsorted(lead.id, { stageKey: first?.id, pipelineId: pipelineId || null, assigneeId: user?.id }) } catch (e) { window.alert(e?.message || t('Xatolik yuz berdi')) }
    reload()
  }
  const rejectUnsorted = async (lead) => { try { await crmService.deleteLead(lead.id) } catch (e) { window.alert(e?.message || t('Xatolik yuz berdi')) } reload() }
  const openLead = (lead) => navigate(`/leads/detail/${lead.id}`)
  const toggleSel = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const runBulk = async (action, value) => {
    if (!sel.size) return
    try { await crmService.bulk([...sel], action, value) } catch (e) { window.alert(e?.message || t('Xatolik yuz berdi')); return }
    setSel(new Set()); reload()
  }

  const unsorted = data?.unsorted || []

  return (
    <div className="ac-pipeline">
      <TopBar
        title={pipeName}
        switcher={<ViewSwitch mode="pipeline" />}
        search={search}
        onSearch={setSearch}
        filterPanel={(close) => <LeadsFilter value={filter} meta={meta} onApply={(f) => { Q.applyFilter(f); close() }} />}
        chips={filterChips(filter, meta, t).map((c) => ({ id: c.id, label: c.label, onRemove: () => Q.removeChip(c.clear) }))}
        count={<>{plural(totalCount, 'bitim')}:<b>{money(totalSum)}</b></>}
        menu={[
          { label: t('Import'), icon: 'download', onClick: () => navigate('/leads/import') },
          { label: t('Eksport'), icon: 'excel', onClick: () => downloadLeadsCsv({ ...filterParams, pipelineId: pipelineId || 'main', unsorted: '0' }).catch((e) => window.alert(e?.message || t('Xatolik yuz berdi'))) },
          sortMenuItem(t, sort, Q.setSort),
          { label: t("Kartochka ko'rinishi"), icon: 'edit', onClick: () => setCardModal(true) },
          { label: t('Dublikatlarni qidirish'), icon: 'search', onClick: () => navigate('/leads/duplicates') },
          { label: t('Ommaviy amallar'), icon: 'check', switch: bulk, onClick: () => { setBulk((v) => !v); setSel(new Set()) } },
          { label: t('Avto-yangilash'), switch: autoRefresh, onClick: () => setAutoRefresh((v) => { localStorage.setItem('amo_autorefresh', v ? '0' : '1'); return !v }) },
        ]}
        actions={<>
          <button className="ac-btn" onClick={() => navigate(`/settings/pipeline/leads/${pipelineId || 'main'}`)}>{t('Sozlash')}</button>
          <button className="ac-btn ac-btn--blue" onClick={() => navigate(`/leads/add${pipelineId ? `?pipeline=${pipelineId}` : ''}`)}><span className="ac-btn__plus">+</span>{t('Yangi bitim')}</button>
        </>}
      />
      <div className="ac-pipeline__scroll">
        <div className="ac-pipeline__cols">
          {(unsorted.length > 0) && (
            <div className="ac-col ac-col--unsorted">
              <div className="ac-col__head">
                <div className="ac-col__title">{t('Saralanmagan')}</div>
                <div className="ac-col__info">{t("So'rovlar")}: {data?.unsortedTotal ?? unsorted.length}</div>
                <div className="ac-col__line" />
              </div>
              <div className="ac-col__body">
                {unsorted.map((l) => <UnsortedCard key={l.id} lead={l} fields={meta.fields} onAccept={acceptUnsorted} onReject={rejectUnsorted} onOpen={openLead} />)}
              </div>
            </div>
          )}
          {shownStages.map((s, i) => {
            const leads = s.leads
            const sum = sumOf(s)
            const isOver = drag?.over?.stage === s.id
            const phIndex = isOver ? drag.over.index : -1
            const items = leads.filter((l) => !(drag && l.id === drag.lead.id && isOver))
            return (
              <div key={s.id} className={`ac-col ${isOver ? 'drop-target' : ''}`} data-stage={s.id}>
                <div className="ac-col__head">
                  <div className="ac-col__title" title={s.name}>{s.name}</div>
                  <div className="ac-col__info">{plural(cntOf(s), 'bitim')}: <b>{money(sum)}</b></div>
                  <div className="ac-col__line" style={{ background: s.color || '#99ccff' }} />
                </div>
                <div className="ac-col__body">
                  {i === 0 && shownKind === 'open' && <QuickAdd stage={s} pipelineId={pipelineId} onDone={reload} />}
                  {items.map((l, idx) => (
                    <React.Fragment key={l.id}>
                      {idx === phIndex && <div className="ac-drop-ph" style={{ height: drag.h }} />}
                      <LeadCard lead={l} onOpen={openLead} dragging={drag?.lead.id === l.id} onPointerDown={(e, lead) => start(e, lead, s.id)} fields={layout.fields} bulk={bulk} selected={sel.has(l.id)} onToggle={toggleSel} />
                    </React.Fragment>
                  ))}
                  {isOver && phIndex >= items.length && <div className="ac-drop-ph" style={{ height: drag.h }} />}
                  {s.nextCursor && <ColumnMore key={s.nextCursor} onMore={() => loadMore(s)} />}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className={`ac-manage ${drag ? 'show' : ''}`}>
        <div data-zone="delete" className={`ac-manage__zone ac-manage__zone--delete ${drag?.over?.zone === 'delete' ? 'hover' : ''}`}>{t("O'chirish")}</div>
        <div data-zone="lost" className={`ac-manage__zone ac-manage__zone--lost ${drag?.over?.zone === 'lost' ? 'hover' : ''}`}>{t('Yopildi va amalga oshmadi')}</div>
        <div data-zone="won" className={`ac-manage__zone ac-manage__zone--won ${drag?.over?.zone === 'won' ? 'hover' : ''}`}>{t('Muvaffaqiyatli amalga oshirildi')}</div>
      </div>

      {drag && (
        <div className="ac-drag-ghost" style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.w }} dangerouslySetInnerHTML={{ __html: drag.html }} />
      )}

      {bulk && sel.size > 0 && (
        <BulkBar count={sel.size} selectedCount={sel.size} total={sel.size} canAll={false} stages={stages} members={meta.members} onRun={runBulk} onClear={() => { setSel(new Set()); setBulk(false) }} />
      )}

      {cardModal && (
        <FieldsModal
          title="Kartochka ko'rinishi"
          options={withCustomFields(CARD_FIELDS, meta.fields)}
          value={layout.fields}
          defaults={CARD_DEFAULT}
          onClose={() => setCardModal(false)}
          onSave={async (next) => { await layout.save(next); setCardModal(false) }}
        />
      )}

      {lostAsk && (
        <LostReasons
          reasons={data?.reasons || []}
          at={lostAsk.at}
          onCancel={() => setLostAsk(null)}
          onPick={async (reason) => {
            const { lead, stage } = lostAsk
            setLostAsk(null)
            moveLocal(lead, stage)
            await crmService.moveLead(lead.id, stage, undefined, reason).catch(() => reload())
          }}
        />
      )}
    </div>
  )
}
