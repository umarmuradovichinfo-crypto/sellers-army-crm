// amoCRM "Воронка — настройка" (/settings/pipeline/leads/:pipelineId): chapda bitim manbalari, o'ngda bosqich ustunlari
// va har bir bosqichdagi avtomatlashtirish (Digital Pipeline trigger) kartochkalari. "main" = asosiy voronka (backendda pipelineId = null).
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { crmService } from '../../services/crm.service'
import { facebookService } from '../../services/facebook.service'
import { Ico } from '../AmoIcons'
import { useOutside } from '../TopBar'
import { useI18n, useT } from '../i18n'
import { DupModal, ConfirmModal, HintsModal, SourcesCatalog, SrcIco } from './PipelineSetupDialogs'
import { TriggerCatalog, TriggerForm } from './PipelineSetupModals'
import { actionSummary, psApi, whenText } from './PipelineSetupApi'
import '../i18n/pipesetup.ru'
import '../pipesetup.css'

const COLORS = ['#d6eaff', '#99ccff', '#c1e0ff', '#d6d9fb', '#ebd6fb', '#ffcccc', '#f5c8d8', '#ffd9b3', '#ffcc66', '#ffff99', '#e8f5b3', '#c9efb0', '#b3f0d2', '#b5ece8', '#d0d0d0', '#e0e0e0', '#c7b8a8', '#a7c4d9']
const EMPTY_CELLS = 14
const DEFAULT_SETTINGS = { unsortedEnabled: true, dups: { enabled: false, sources: {}, matchPhone: true, matchEmail: true, fields: [], pipelines: null, stages: null, onConflict: 'update', onMultiple: 'newest', afterTask: { enabled: false, assignee: 'lead', text: '' } } }

function PipeName({ pid, pipes, name, onChanged }) {
  const t = useT()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('list') // list | new | rename
  const [text, setText] = useState('')
  const ref = useRef(null)
  const busy = useRef(false)
  useOutside(ref, () => { setOpen(false); setMode('list') }, open)
  const go = (id) => { setOpen(false); navigate(`/settings/pipeline/leads/${id || 'main'}`) }
  const isMain = pid === 'main'
  const submit = async () => {
    const v = text.trim()
    if (!v || busy.current) return
    busy.current = true
    try {
      if (mode === 'new') {
        const r = await crmService.createPipeline(v)
        const id = r?.pipeline?.id
        if (id) {
          await crmService.createStage({ name: 'Birlamchi aloqa', kind: 'open', color: COLORS[1], pipelineId: id })
          await crmService.createStage({ name: 'Muvaffaqiyatli', kind: 'won', color: '#c9efb0', pipelineId: id })
          await crmService.createStage({ name: 'Muvaffaqiyatsiz', kind: 'lost', color: '#d0d0d0', pipelineId: id })
          go(id)
        }
      } else {
        await crmService.updatePipeline(pid, { name: v })
        onChanged()
      }
      setMode('list'); setOpen(false); setText('')
    } catch (e) { window.alert(e?.message || t('Xatolik')) }
    finally { busy.current = false }
  }
  const remove = async () => {
    if (!window.confirm(t("Voronka o'chirilsinmi? Bosqichlar va bitimlar asosiy voronkaga o'tkaziladi."))) return
    try { await crmService.deletePipeline(pid); go('main') }
    catch (e) { window.alert(e?.message || t('Xatolik')) }
  }
  return (
    <div ref={ref} className={`ac-ps-name ${open ? 'open' : ''}`} onClick={(e) => { if (e.target.closest('.ac-ps-menu')) return; setOpen((v) => !v) }}>
      <span className="ac-ps-name__t">{name}</span>
      <Ico name="chevronDown" size={14} className="ac-ico-chev" />
      {open && (
        <div className="ac-ps-menu">
          {mode === 'list' ? (
            <>
              <button className={`ac-ps-menu__item ${isMain ? 'sel' : ''}`} onClick={() => go('main')}>{t('Asosiy voronka')}</button>
              {pipes.map((p) => <button key={p.id} className={`ac-ps-menu__item ${pid === p.id ? 'sel' : ''}`} onClick={() => go(p.id)}>{p.name}</button>)}
              <div className="ac-ps-menu__sep" />
              <button className="ac-ps-menu__item" onClick={() => { setText(''); setMode('new') }}><Ico name="plus" size={12} />{t('Yangi voronka qo\'shish')}</button>
              {!isMain && <button className="ac-ps-menu__item" onClick={() => { setText(name); setMode('rename') }}><Ico name="edit" size={12} />{t("Nomini o'zgartirish")}</button>}
              {!isMain && <button className="ac-ps-menu__item danger" onClick={remove}><Ico name="trash" size={12} />{t("Voronkani o'chirish")}</button>}
            </>
          ) : (
            <div className="ac-ps-menu__form">
              <input className="ac-input" autoFocus value={text} placeholder={t('Voronka nomi')} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
              <button className="ac-btn ac-btn--blue ac-btn--sm" onClick={submit}>OK</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Chap panel: bitim manbalari ──
function Sources({ settings, sources, onUnsorted, onDupSwitch, onRules, onAdd, onOpen }) {
  const t = useT()
  return (
    <div className="ac-ps-src">
      <h3 className="ac-ps-src__title">{t('BITIM MANBALARI')}</h3>
      <div className="ac-ps-box">
        <div className="ac-ps-box__head">{t('Saralanmagan')}<span className={`ac-switch ${settings.unsortedEnabled ? 'on' : ''}`} onClick={onUnsorted} /></div>
        <div className="ac-ps-box__text">{t('"Saralanmagan" holatidagi arizalar ko\'rinishida kelgan so\'rovlar')}</div>
      </div>
      <div className="ac-ps-box">
        <div className="ac-ps-box__head">{t('Dublikatlarni nazorat qilish')}<span className={`ac-switch ${settings.dups.enabled ? 'on' : ''}`} onClick={onDupSwitch} /></div>
        <div className="ac-ps-box__text">{t('Kiruvchi arizalarni dublikatga tekshirish va qayta ishlash usulini belgilang')}</div>
        <a onClick={onRules}>{t('Qoidalarni sozlash')}</a>
      </div>
      {sources.map((s) => (
        <div key={s.key} className="ac-ps-conn">
          <SrcIco kind={s.kind} />
          <div className="ac-ps-conn__t"><div className="ac-ps-conn__name" onClick={() => onOpen(s)}>{s.name}</div><div className="ac-ps-conn__sub">{s.sub}</div></div>
        </div>
      ))}
      <button className="ac-ps-add" onClick={onAdd}><Ico name="plus" size={12} />{t("Qo'shish")}</button>
    </div>
  )
}

function TriggerCard({ a, ctx, onClick }) {
  const t = useT()
  const dateName = a.trigger === 'before_date_field' ? ctx.dateFieldName(a.schedule?.field) : ''
  return (
    <div className={`ac-ps-trig ${a.active === false ? 'off' : ''}`} onClick={(e) => onClick(e.currentTarget.getBoundingClientRect())}>
      <span className="ac-ps-trig__ico"><Ico name="edit" size={13} /></span>
      <div className="ac-ps-trig__txt">
        {(a.conditions || []).length > 0 && <div className="ac-ps-trig__cond">{t('Shartlar')}: {a.conditions.length}</div>}
        <div className="ac-ps-trig__when">{whenText(a, t, dateName)}</div>
        {(a.actions || []).map((x, i) => {
          const [l, v] = actionSummary(x, { ...ctx, t })
          return (
            <div key={i} className="ac-ps-trig__act"><b>{t(l)}{v && v.length ? ':' : ''}</b>
              {Array.isArray(v) ? v.map((x2) => <i key={x2}>{x2}</i>) : v && <i>{v}</i>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Cells({ items, ctx, onOpen, onNew }) {
  const t = useT()
  return (
    <div className="ac-ps-col__body">
      {items.map((a) => <TriggerCard key={a.id} a={a} ctx={ctx} onClick={(rect) => onOpen(a, rect)} />)}
      {Array.from({ length: Math.max(EMPTY_CELLS - items.length, 3) }).map((_, i) => (
        <div key={i} className="ac-ps-cell" onClick={(e) => onNew(e.currentTarget.getBoundingClientRect())}>
          <span className="ac-ps-cell__add"><Ico name="plusCircle" size={18} />{t("Trigger qo'shish")}</span>
        </div>
      ))}
    </div>
  )
}

// ── Yo'qotish sabablari (sudrab tartiblash, tahrirlash, o'chirish) ──
function Reasons() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [list, setList] = useState([])
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)
  const [adding, setAdding] = useState(false)
  const load = () => crmService.listLostReasons().then((r) => setList(r.reasons || [])).catch(() => {})
  useEffect(() => { load() }, [])
  const fail = (e) => { window.alert(e?.message || t('Xatolik')); load() }
  const add = async (name) => {
    const v = name.trim(); setAdding(false)
    if (!v) return
    try { await crmService.createLostReason(v) } catch (e) { return fail(e) }
    load()
  }
  const rename = async (r, name) => {
    const v = name.trim()
    if (!v || v === r.name) return
    setList((x) => x.map((i) => (i.id === r.id ? { ...i, name: v } : i)))
    try { await psApi.updateReason(r.id, v) } catch (e) { fail(e) }
  }
  const del = async (id) => {
    setList((x) => x.filter((r) => r.id !== id))
    try { await crmService.deleteLostReason(id) } catch (e) { fail(e) }
  }
  const drop = async (targetId) => {
    if (!dragId || dragId === targetId) return
    const from = list.findIndex((r) => r.id === dragId), to = list.findIndex((r) => r.id === targetId)
    if (from < 0 || to < 0) return
    const next = list.slice(); const [m] = next.splice(from, 1); next.splice(to, 0, m)
    setList(next)
    try { await psApi.reorderReasons(next.map((r) => r.id)) } catch (e) { fail(e) }
  }
  return (
    <div className="ac-ps-reasons">
      <div className="ac-ps-reasons__title">{t("Yo'qotish sabablari")}</div>
      <div className="ac-ps-reasons__text">{t("Bitimni yo'qotishning sabablarini sozlang — bu zaif joylarni topishga va sotuv samaradorligini oshirishga yordam beradi.")}</div>
      {!open && <a onClick={() => setOpen(true)}>{t('Sozlash')}{list.length ? ` (${list.length})` : ''}</a>}
      {open && (
        <>
          {list.map((r) => (
            <div key={r.id} className={`ac-ps-reason ${dragId === r.id ? 'dragging' : ''} ${overId === r.id && dragId !== r.id ? 'over' : ''}`}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(r.id) } }}
              onDrop={(e) => { e.preventDefault(); drop(r.id); setDragId(null); setOverId(null) }}>
              <span className="ac-ps-reason__grip" draggable
                onDragStart={(e) => { setDragId(r.id); const row = e.currentTarget.closest('.ac-ps-reason'); if (row) e.dataTransfer.setDragImage(row, 10, 10); e.dataTransfer.effectAllowed = 'move' }}
                onDragEnd={() => { setDragId(null); setOverId(null) }}><Ico name="dots" size={12} className="v" /></span>
              <input key={r.id + r.name} className="ac-ps-reason__in" defaultValue={r.name} maxLength={100}
                onBlur={(e) => rename(r, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = r.name; e.currentTarget.blur() } }} />
              <button className="ac-ps-reason__del" title={t("O'chirish")} onClick={() => del(r.id)}><Ico name="close" size={10} /></button>
            </div>
          ))}
          {adding && (
            <div className="ac-ps-reason">
              <span className="ac-ps-reason__grip" style={{ visibility: 'hidden' }}><Ico name="dots" size={12} className="v" /></span>
              <input autoFocus className="ac-ps-reason__in" placeholder={t('Sabab nomi')} maxLength={100}
                onBlur={(e) => add(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = ''; e.currentTarget.blur() } }} />
            </div>
          )}
          <a onClick={() => setAdding(true)}>{t("Sabab qo'shish")}</a>
        </>
      )}
    </div>
  )
}

function StageEdit({ col, canDelete, onChange, onDelete, onClose }) {
  const t = useT()
  const ref = useRef(null)
  const [sure, setSure] = useState(false)
  useOutside(ref, onClose, true)
  return (
    <div className="ac-ps-edit" ref={ref} onClick={(e) => e.stopPropagation()}>
      <input className="ac-input" autoFocus value={col.name} onChange={(e) => onChange({ name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && onClose()} />
      <div className="ac-ps-colors">
        {COLORS.map((c) => <button key={c} className={col.color === c ? 'on' : ''} style={{ background: c }} onClick={() => onChange({ color: c })} />)}
      </div>
      {canDelete && (sure
        ? <button className="ac-ps-edit__del" onClick={onDelete}>{t("Ha, o'chirish")}</button>
        : <button className="ac-ps-edit__del" onClick={() => setSure(true)}>{t("Bosqichni o'chirish")}</button>)}
    </div>
  )
}

export default function PipelineSetupPage() {
  const t = useT()
  const { lang } = useI18n()
  const navigate = useNavigate()
  const { pipelineId = 'main' } = useParams()
  const pid = pipelineId === 'main' ? null : pipelineId

  const [data, setData] = useState(null)
  const [cols, setCols] = useState([])
  const [orig, setOrig] = useState([])
  const [autos, setAutos] = useState([])
  const [members, setMembers] = useState([])
  const [forms, setForms] = useState([])
  const [tgOn, setTgOn] = useState(false)
  const [fbMaps, setFbMaps] = useState([])
  const [metaOn, setMetaOn] = useState(false)
  const [metaPages, setMetaPages] = useState([])
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [allStages, setAllStages] = useState([])
  const [tags, setTags] = useState([])
  const [fields, setFields] = useState([])
  const [editing, setEditing] = useState(null)
  const [catalog, setCatalog] = useState(null) // {stageKey, rect}
  const [form, setForm] = useState(null) // {stageKey, rect, actionType, initial}
  const [hintsFor, setHintsFor] = useState(null)
  const [dupOpen, setDupOpen] = useState(false)
  const [srcOpen, setSrcOpen] = useState(false)
  const [confirmExit, setConfirmExit] = useState(false)
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)
  const [saveState, setSaveState] = useState('idle')

  const loadPipe = () => crmService.getPipeline(pid).then((r) => {
    setData(r)
    const c = (r.stages || []).map((s) => ({ id: s.id, name: s.name, color: s.color, kind: s.kind, isSystem: s.isSystem, hints: s.hints || {} }))
    setCols(c); setOrig(c)
  })
  const loadAutos = () => crmService.listAutomations().then((r) => setAutos(r.automations || [])).catch(() => {})
  const loadAllStages = () => psApi.allStages().then((r) => setAllStages(r.stages || [])).catch(() => {})
  useEffect(() => {
    setData(null); setEditing(null)
    loadPipe().catch(() => setData({ stages: [], pipelines: [] }))
    psApi.getSettings(pid).then((r) => setSettings({ ...DEFAULT_SETTINGS, ...r.settings, dups: { ...DEFAULT_SETTINGS.dups, ...(r.settings?.dups || {}) } })).catch(() => {})
    loadAllStages()
  }, [pipelineId]) // eslint-disable-line
  useEffect(() => {
    loadAutos()
    crmService.listMembers().then((r) => setMembers(r.members || [])).catch(() => {})
    crmService.listForms().then((r) => setForms(r.forms || [])).catch(() => {})
    crmService.chatStatus().then((r) => setTgOn(!!r.telegram)).catch(() => {})
    facebookService.getConfig().then((r) => { setMetaOn(!!r.enabled && (r.pages || []).length > 0); setMetaPages(r.pages || []) }).catch(() => {})
    facebookService.listMappings().then((r) => setFbMaps((r.mappings || []).filter((m) => (m.destination || 'crm') === 'crm'))).catch(() => {})
    psApi.tags().then((r) => setTags((r.tags || []).map((x) => x.name))).catch(() => {})
    psApi.fields().then((r) => setFields(r.fields || [])).catch(() => {})
  }, [])

  const pipes = data?.pipelines || []
  const pipeName = pid ? (pipes.find((p) => p.id === pid)?.name || t('Voronka')) : t('Asosiy voronka')
  const open = cols.filter((c) => c.kind === 'open')
  const tail = cols.filter((c) => c.kind !== 'open')

  const sameScope = (a) => !a.stageKey && (a.pipelineId || null) === pid
  const stageAutos = (key) => autos.filter((a) => a.stageKey === key)
  const unsortedAutos = autos.filter(sameScope)

  // Trigger formalari uchun kontekst: barcha voronka va bosqichlar, foydalanuvchilar, teglar, maydonlar
  const ctx = useMemo(() => {
    const byPipe = new Map([['main', []]])
    pipes.forEach((p) => byPipe.set(p.id, []))
    allStages.slice().sort((a, b) => a.order - b.order).forEach((s) => { const k = s.pipelineId || 'main'; if (byPipe.has(k)) byPipe.get(k).push({ key: s.key, name: s.name, kind: s.kind }) })
    const pp = [{ id: 'main', name: t('Asosiy voronka'), stages: byPipe.get('main') }, ...pipes.map((p) => ({ id: p.id, name: p.name, stages: byPipe.get(p.id) }))]
    const stagesMap = {}
    allStages.forEach((s) => { stagesMap[s.key] = s })
    const dates = fields.filter((f) => f.type === 'date')
    return {
      members, pipes: pp, stages: stagesMap, tags, fields,
      sources: [...new Set(['Telegram', 'Facebook', 'Instagram', 'Sayt formasi', ...forms.map((f) => f.source).filter(Boolean)])],
      dateFieldName: (k) => (k === 'nextTaskDate' ? t('Keyingi vazifa sanasi') : dates.find((f) => `cf:${f.key}` === k)?.label || k),
    }
  }, [members, pipes, allStages, tags, fields, forms]) // eslint-disable-line

  // Ulangan manbalar (kartochkalar + dublikat qoidalari "Manbalar" tabi)
  const sources = useMemo(() => {
    const out = []
    // amoCRM: faqat shu voronkaga lid tushiradigan manbalar; chatlar (Telegram, Messenger, Instagram) asosiy voronkaga tushadi
    const inThis = (pipelineId) => (pipelineId || 'main') === (pid || 'main')
    if (inThis(null)) {
      if (tgOn) out.push({ key: 'telegram', kind: 'telegram', name: 'Telegram', sub: t('Messenjer') })
      metaPages.forEach((p) => {
        out.push({ key: `msg:${p.id}`, kind: 'facebook', name: p.name, sub: 'Messenger' })
        if (p.igId) {
          out.push({ key: `ig:${p.id}`, kind: 'instagram', name: p.igUsername || p.name, sub: 'Instagram Direct' })
          out.push({ key: `igc:${p.id}`, kind: 'instagram', name: p.igUsername || p.name, sub: t('Instagram izohlari') })
        }
      })
    }
    fbMaps.filter((m) => inThis(m.pipelineId)).forEach((m) => out.push({ key: `fb:${m.formId}`, kind: 'facebook', name: m.formName || m.pageName || 'Facebook', sub: 'Facebook Lead Ads' }))
    forms.forEach((f) => out.push({ key: `form:${f.id}`, kind: 'form', name: f.title || f.name, sub: t('Forma') }))
    return out
  }, [tgOn, fbMaps, forms, metaPages, pid]) // eslint-disable-line

  const patchCol = (id, patch) => setCols((cs) => cs.map((c) => c.id === id ? { ...c, ...patch } : c))

  // Tartibni saqlash: ochiq bosqichlar, so'ng muvaffaqiyatli/muvaffaqiyatsiz — order = (indeks + 1) * 10
  const persistOrder = (list) => Promise.all(list.map((c, i) => crmService.updateStage(c.id, { order: (i + 1) * 10 })))

  const addStage = async (index) => {
    let r
    try { r = await crmService.createStage({ name: t('Yangi bosqich'), kind: 'open', color: COLORS[1], pipelineId: pid }) }
    catch (e) { window.alert(e?.message || t('Xatolik')); return }
    const s = r.stage
    if (!s) return
    const fresh = { id: s.key || s.id, name: s.name, color: s.color, kind: 'open', isSystem: false, hints: {} }
    const next = open.slice(); next.splice(index, 0, fresh)
    const all = [...next, ...tail]
    // saqlanmagan nom/rang o'zgarishlari "saqlangan" deb belgilanib yo'qolmasin: orig = eski qiymatlar, yangi tartib
    const oMap = new Map(orig.map((c) => [c.id, c]))
    setCols(all); setOrig(all.map((c) => oMap.get(c.id) || c))
    setEditing(fresh.id)
    try { await persistOrder(all); loadAllStages() } catch (e) { window.alert(e?.message || t('Xatolik')) }
  }

  const removeStage = async (id) => {
    try { await crmService.deleteStage(id) } catch (e) { window.alert(e?.message || 'Error'); return }
    setCols((cs) => cs.filter((c) => c.id !== id)); setOrig((cs) => cs.filter((c) => c.id !== id)); setEditing(null)
    loadAutos(); loadAllStages()
  }

  const dirty = useMemo(() => JSON.stringify(cols) !== JSON.stringify(orig), [cols, orig])
  const save = async () => {
    setSaveState('saving')
    try {
      const o = new Map(orig.map((c) => [c.id, c]))
      const ops = []
      cols.forEach((c) => {
        const p = o.get(c.id)
        if (p && (p.name !== c.name || p.color !== c.color)) ops.push(crmService.updateStage(c.id, { name: c.name.trim() || p.name, color: c.color }))
      })
      const oIds = orig.filter((c) => c.kind === 'open').map((c) => c.id).join()
      const nIds = open.map((c) => c.id).join()
      if (oIds !== nIds) ops.push(persistOrder([...open, ...tail]))
      await Promise.all(ops)
      setOrig(cols); setSaveState('saved'); loadAllStages()
      setTimeout(() => setSaveState('idle'), 1500)
    } catch (e) { setSaveState('idle'); window.alert(e?.message || 'Error') }
  }

  const drop = (targetId) => {
    if (!dragId || dragId === targetId) return
    const from = open.findIndex((c) => c.id === dragId); const to = open.findIndex((c) => c.id === targetId)
    if (from < 0 || to < 0) return
    const next = open.slice(); const [m] = next.splice(from, 1); next.splice(to, 0, m)
    setCols([...next, ...tail])
  }

  // ── Triggerlar ──
  const saveTrigger = async (payload) => {
    const f = form
    const body = { ...payload, stageKey: f.stageKey || null, pipelineId: pid }
    if (f.initial) await crmService.updateAutomation(f.initial.id, body)
    else await crmService.createAutomation(body)
    setForm(null); loadAutos()
  }
  const delTrigger = async () => { await crmService.deleteAutomation(form.initial.id); setForm(null); loadAutos() }
  const openNew = (stageKey, rect) => setCatalog({ stageKey, rect })
  const openEdit = (a, rect) => setForm({ stageKey: a.stageKey || null, rect, initial: a, actionType: a.actions?.[0]?.type })

  // ── Saralanmagan / dublikat sozlamalari ──
  const patchSettings = async (patch) => {
    const prev = settings
    setSettings((s) => ({ ...s, ...patch, dups: patch.dups ? { ...s.dups, ...patch.dups } : s.dups }))
    try {
      const r = await psApi.saveSettings(pid, patch)
      if (r?.settings) setSettings({ ...DEFAULT_SETTINGS, ...r.settings, dups: { ...DEFAULT_SETTINGS.dups, ...(r.settings.dups || {}) } })
    } catch (e) { setSettings(prev); window.alert(e?.message || t('Xatolik')) }
  }
  const saveHints = async (hints) => {
    await crmService.updateStage(hintsFor.id, { hints })
    patchCol(hintsFor.id, { hints }); setOrig((os) => os.map((c) => (c.id === hintsFor.id ? { ...c, hints } : c)))
    setHintsFor(null)
  }

  const back = () => navigate(`/leads/pipeline/${pid || ''}`)
  const exit = () => { if (dirty) setConfirmExit(true); else back() }
  const hasHints = (c) => Object.values(c.hints || {}).some((x) => String(x || '').trim())

  const renderCol = (c, i, { fixed }) => (
    <div key={c.id} className={`ac-ps-col ${dragId === c.id ? 'dragging' : ''} ${overId === c.id && dragId !== c.id ? 'over' : ''}`}
      onDragOver={(e) => { if (dragId && !fixed) { e.preventDefault(); setOverId(c.id) } }}
      onDrop={(e) => { e.preventDefault(); drop(c.id); setDragId(null); setOverId(null) }}>
      <div className="ac-ps-col__head">
        {!fixed && (
          <span className="ac-ps-col__grip" draggable
            onDragStart={(e) => { setDragId(c.id); const h = e.currentTarget.closest('.ac-ps-col'); if (h) e.dataTransfer.setDragImage(h, 20, 10); e.dataTransfer.effectAllowed = 'move' }}
            onDragEnd={() => { setDragId(null); setOverId(null) }}><Ico name="dragDots" size={12} /></span>
        )}
        <span className={`ac-ps-col__name ${fixed ? 'fixed' : ''}`} onClick={() => !fixed && setEditing(editing === c.id ? null : c.id)}>{c.name}</span>
        {editing === c.id && <StageEdit col={c} canDelete={!c.isSystem} onChange={(p) => patchCol(c.id, p)} onDelete={() => removeStage(c.id)} onClose={() => setEditing(null)} />}
      </div>
      <div className="ac-ps-col__line" style={{ background: c.color }}>
        {i != null && <button className="ac-ps-col__plus" title={t("Bosqich qo'shish")} onClick={() => addStage(i + 1)}><Ico name="plus" size={11} /></button>}
      </div>
      {c.kind === 'open' && <div className="ac-ps-col__hints"><a onClick={() => setHintsFor(c)}>{t(hasHints(c) ? "Tavsifni o'zgartirish" : "Tavsif qo'shish")}</a></div>}
      {c.kind === 'lost' && <Reasons />}
      <Cells items={stageAutos(c.id)} ctx={ctx} onOpen={openEdit} onNew={(rect) => openNew(c.id, rect)} />
    </div>
  )

  return (
    <div className="ac-pipesetup">
      <div className="ac-top">
        <PipeName pid={pipelineId} pipes={pipes} name={pipeName} onChanged={loadPipe} />
        <div className="ac-ps-spacer" />
        <div className="ac-top__actions">
          <button className="ac-ps-back" onClick={exit}>{lang === 'ru' ? 'Выйти' : t('Chiqish')}</button>
          <button className="ac-btn" disabled={saveState === 'saving' || (!dirty && saveState !== 'saved')} onClick={save}>{t(saveState === 'saved' ? 'Saqlandi' : 'Saqlash')}</button>
        </div>
      </div>
      <div className="ac-ps-body">
        <Sources settings={settings} sources={sources}
          onUnsorted={() => patchSettings({ unsortedEnabled: !settings.unsortedEnabled })}
          onDupSwitch={() => patchSettings({ dups: { enabled: !settings.dups.enabled } })}
          onRules={() => setDupOpen(true)} onAdd={() => setSrcOpen(true)} onOpen={() => navigate('/amo-market')} />
        <div className="ac-ps-cols">
          {!data ? <div style={{ padding: 30 }}><div className="ac-spinner" /></div> : (
            <>
              <div className="ac-ps-col">
                <div className="ac-ps-col__head"><span className="ac-ps-col__name fixed">{t('Saralanmagan')}</span></div>
                <div className="ac-ps-col__line" style={{ background: '#c9c9c9' }}>
                  <button className="ac-ps-col__plus" title={t("Bosqich qo'shish")} onClick={() => addStage(0)}><Ico name="plus" size={11} /></button>
                </div>
                <Cells items={unsortedAutos} ctx={ctx} onOpen={openEdit} onNew={(rect) => openNew(null, rect)} />
              </div>
              {open.map((c, i) => renderCol(c, i, { fixed: false }))}
              {tail.map((c) => renderCol(c, null, { fixed: true }))}
            </>
          )}
        </div>
      </div>

      {catalog && <TriggerCatalog onClose={() => setCatalog(null)} onPick={(type) => { setForm({ stageKey: catalog.stageKey, rect: catalog.rect, actionType: type }); setCatalog(null) }} />}
      {form && <TriggerForm key={form.initial?.id || 'new'} anchor={{ top: form.rect.top, left: form.rect.left }} initial={form.initial} actionType={form.actionType} stageKey={form.stageKey} ctx={ctx} onSave={saveTrigger} onDelete={delTrigger} onClose={() => setForm(null)} />}
      {hintsFor && <HintsModal stageName={hintsFor.name} hints={hintsFor.hints} onSave={saveHints} onClose={() => setHintsFor(null)} />}
      {dupOpen && <DupModal settings={settings} sources={sources} fields={fields} pipes={ctx.pipes} members={members} onClose={() => setDupOpen(false)}
        onSave={async (d) => { await patchSettings({ dups: { ...d, enabled: settings.dups.enabled } }); setDupOpen(false) }} />}
      {srcOpen && <SourcesCatalog metaOn={metaOn} tgOn={tgOn} onClose={() => setSrcOpen(false)} onGo={(k) => navigate(k === 'instagram' ? '/amo-market?open=instagram' : k === 'facebook' ? '/amo-market?open=messenger' : '/amo-market')} />}
      {confirmExit && <ConfirmModal title={t('Saqlanmagan o\'zgarishlar')} text={t("Bosqichlardagi o'zgarishlar saqlanmadi. Baribir chiqasizmi?")} yes={t('Saqlamasdan chiqish')} no={t('Qolish')} onYes={back} onNo={() => setConfirmExit(false)} />}
    </div>
  )
}

