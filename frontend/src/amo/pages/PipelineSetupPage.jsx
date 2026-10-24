// amoCRM "Воронка — настройка" (/settings/pipeline/leads/:pipelineId): chapda bitim manbalari, o'ngda bosqich ustunlari
// va har bir bosqichdagi avtomatlashtirish (trigger) kartochkalari. "main" = asosiy voronka (backendda pipelineId = null).
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { crmService } from '../../services/crm.service'
import { facebookService } from '../../services/facebook.service'
import { Ico } from '../AmoIcons'
import { useOutside } from '../TopBar'
import { useT } from '../i18n'
import TriggerModal, { actionMeta, actionSummary } from './PipelineSetupModals'
import '../i18n/pipesetup.ru'
import '../pipesetup.css'

const COLORS = ['#d6eaff', '#99ccff', '#c1e0ff', '#d6d9fb', '#ebd6fb', '#ffcccc', '#f5c8d8', '#ffd9b3', '#ffcc66', '#ffff99', '#e8f5b3', '#c9efb0', '#b3f0d2', '#b5ece8', '#d0d0d0', '#e0e0e0', '#c7b8a8', '#a7c4d9']
const EMPTY_CELLS = 14
const LS = 'amo:pipesetup:'
const lsFlag = (k, d) => { try { const v = localStorage.getItem(LS + k); return v == null ? d : v === '1' } catch { return d } }

function PipeName({ pid, pipes, name, onChanged }) {
  const t = useT()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('list') // list | new | rename
  const [text, setText] = useState('')
  const ref = useRef(null)
  useOutside(ref, () => { setOpen(false); setMode('list') }, open)
  const go = (id) => { setOpen(false); navigate(`/settings/pipeline/leads/${id || 'main'}`) }
  const isMain = pid === 'main'
  const submit = async () => {
    const v = text.trim()
    if (!v) return
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
  }
  const remove = async () => {
    if (!window.confirm(t("Voronka o'chirilsinmi? Bosqichlar va bitimlar asosiy voronkaga o'tkaziladi."))) return
    await crmService.deletePipeline(pid)
    go('main')
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

function Sources({ forms, tgOn, fbPages }) {
  const t = useT()
  const navigate = useNavigate()
  const [unsorted, setUnsorted] = useState(lsFlag('unsorted', true))
  const [dups, setDups] = useState(lsFlag('dups', true))
  const flip = (k, v, set) => { set(!v); try { localStorage.setItem(LS + k, v ? '0' : '1') } catch { /* */ } }
  return (
    <div className="ac-ps-src">
      <h3 className="ac-ps-src__title">{t('BITIM MANBALARI')}</h3>
      <div className="ac-ps-box">
        <div className="ac-ps-box__head">{t('Saralanmagan')}<span className={`ac-switch ${unsorted ? 'on' : ''}`} onClick={() => flip('unsorted', unsorted, setUnsorted)} /></div>
        <div className="ac-ps-box__text">{t('"Saralanmagan" holatidagi arizalar ko\'rinishida kelgan so\'rovlar')}</div>
      </div>
      <div className="ac-ps-box">
        <div className="ac-ps-box__head">{t('Dublikatlarni nazorat qilish')}<span className={`ac-switch ${dups ? 'on' : ''}`} onClick={() => flip('dups', dups, setDups)} /></div>
        <div className="ac-ps-box__text">{t('Kiruvchi arizalarni dublikatga tekshirish va qayta ishlash usulini belgilang')}</div>
        <a onClick={() => navigate('/settings/general')}>{t('Qoidalarni sozlash')}</a>
      </div>
      {tgOn && <Conn kind="tg" icon="telegram" name="Telegram" sub={t('Messenjer')} onClick={() => navigate('/amo-market')} />}
      {fbPages.map((p) => <Conn key={p.id} kind="fb" icon="facebook" name={p.name} sub="Facebook Lead Ads" onClick={() => navigate('/amo-market')} />)}
      {forms.map((f) => <Conn key={f.id} kind="fm" icon="form" name={f.title || f.name} sub={t('Forma')} onClick={() => navigate('/amo-market')} />)}
      <button className="ac-ps-add" onClick={() => navigate('/amo-market')}><Ico name="plus" size={12} />{t("Qo'shish")}</button>
    </div>
  )
}
function Conn({ kind, icon, name, sub, onClick }) {
  return (
    <div className="ac-ps-conn">
      <span className={`ac-ps-conn__ico ${kind}`}><Ico name={icon} size={18} /></span>
      <div className="ac-ps-conn__t"><div className="ac-ps-conn__name" onClick={onClick}>{name}</div><div className="ac-ps-conn__sub">{sub}</div></div>
    </div>
  )
}

function TriggerCard({ a, trigger, onClick }) {
  const t = useT()
  const act = a.actions?.[0]
  const meta = actionMeta(act?.type)
  return (
    <div className={`ac-ps-trig ${a.active === false ? 'off' : ''}`} onClick={onClick}>
      <span className="ac-ps-trig__ico"><Ico name={meta.icon} size={13} /></span>
      <div>
        <div className="ac-ps-trig__when">{t(trigger === 'lead_created' ? 'Yaratilganda' : "Bosqichga o'tgandan keyin")}</div>
        {(a.actions || []).map((x, i) => {
          const [l, v] = actionSummary(x)
          return <div key={i} className="ac-ps-trig__act"><b>{t(l)}:</b>{v && <i>{v}</i>}</div>
        })}
      </div>
    </div>
  )
}

function Cells({ items, trigger, onOpen, onNew }) {
  return (
    <div className="ac-ps-col__body">
      {items.map((a) => <TriggerCard key={a.id} a={a} trigger={trigger} onClick={() => onOpen(a)} />)}
      {Array.from({ length: Math.max(EMPTY_CELLS - items.length, 3) }).map((_, i) => <div key={i} className="ac-ps-cell" onClick={onNew} />)}
    </div>
  )
}

function Reasons() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [list, setList] = useState([])
  const [text, setText] = useState('')
  const load = () => crmService.listLostReasons().then((r) => setList(r.reasons || [])).catch(() => {})
  useEffect(() => { load() }, [])
  const add = async () => { const v = text.trim(); if (!v) return; setText(''); await crmService.createLostReason(v); load() }
  const del = async (id) => { setList((x) => x.filter((r) => r.id !== id)); await crmService.deleteLostReason(id); load() }
  return (
    <div className="ac-ps-reasons">
      <div className="ac-ps-reasons__title">{t("Yo'qotish sabablari")}</div>
      <div className="ac-ps-reasons__text">{t("Bitimni yo'qotishning sabablarini sozlang — bu zaif joylarni topishga va sotuv samaradorligini oshirishga yordam beradi.")}</div>
      {!open && <a onClick={() => setOpen(true)}>{t('Sozlash')}{list.length ? ` (${list.length})` : ''}</a>}
      {open && (
        <>
          {list.map((r) => <div key={r.id} className="ac-ps-reason"><span>{r.name}</span><button onClick={() => del(r.id)}><Ico name="close" size={11} /></button></div>)}
          <div className="ac-ps-reasons__add">
            <input className="ac-input" value={text} placeholder={t('Sabab nomi')} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <button className="ac-btn ac-btn--sm" onClick={add}><Ico name="plus" size={11} /></button>
          </div>
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
  const [fbPages, setFbPages] = useState([])
  const [editing, setEditing] = useState(null)
  const [modal, setModal] = useState(null) // {trigger, stageKey, initial}
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)
  const [saveState, setSaveState] = useState('idle')

  const loadPipe = () => crmService.getPipeline(pid).then((r) => {
    setData(r)
    const c = (r.stages || []).map((s) => ({ id: s.id, name: s.name, color: s.color, kind: s.kind, isSystem: s.isSystem }))
    setCols(c); setOrig(c)
  })
  const loadAutos = () => crmService.listAutomations().then((r) => setAutos(r.automations || [])).catch(() => {})
  useEffect(() => { setData(null); setEditing(null); loadPipe().catch(() => setData({ stages: [], pipelines: [] })) }, [pipelineId]) // eslint-disable-line
  useEffect(() => {
    loadAutos()
    crmService.listMembers().then((r) => setMembers(r.members || [])).catch(() => {})
    crmService.listForms().then((r) => setForms(r.forms || [])).catch(() => {})
    crmService.chatStatus().then((r) => setTgOn(!!r.telegram)).catch(() => {})
    facebookService.getConfig().then((r) => setFbPages(r.pages || [])).catch(() => {})
  }, [])

  const pipes = data?.pipelines || []
  const pipeName = pid ? (pipes.find((p) => p.id === pid)?.name || t('Voronka')) : t('Asosiy voronka')
  const open = cols.filter((c) => c.kind === 'open')
  const tail = cols.filter((c) => c.kind !== 'open')

  const sameScope = (a) => (a.pipelineId || null) === pid
  const stageAutos = (key) => autos.filter((a) => a.trigger === 'stage_enter' && a.stageKey === key)
  const unsortedAutos = autos.filter((a) => a.trigger === 'lead_created' && sameScope(a))

  const patchCol = (id, patch) => setCols((cs) => cs.map((c) => c.id === id ? { ...c, ...patch } : c))

  // Bosqichlar tartibini (faqat ochiq bosqichlar) saqlash: mavjud order qiymatlari yangi ketma-ketlikka beriladi
  const persistOrder = async (list, base) => {
    const baseOrder = new Map()
    const orders = (data?.stages || []).map((s) => s).length ? null : null // eslint-disable-line
    void orders
    const sortedVals = base.slice().map((x) => x.order).filter((x) => x != null).sort((a, b) => a - b)
    list.forEach((c, i) => baseOrder.set(c.id, sortedVals[i]))
    await Promise.all(list.map((c) => baseOrder.get(c.id) != null ? crmService.updateStage(c.id, { order: baseOrder.get(c.id) }) : null))
  }

  const addStage = async (index) => {
    const r = await crmService.createStage({ name: t('Yangi bosqich'), kind: 'open', color: COLORS[1], pipelineId: pid })
    const s = r.stage
    if (!s) return
    const fresh = { id: s.key || s.id, name: s.name, color: s.color, kind: 'open', isSystem: false }
    const next = open.slice(); next.splice(index, 0, fresh)
    setCols([...next, ...tail]); setOrig((o) => [...o, fresh])
    setEditing(fresh.id)
    // yangi bosqichning order'i oxirida — tartibni darhol saqlaymiz
    const fresh2 = await crmService.getPipeline(pid)
    const ord = new Map((fresh2.stages || []).map((x, i) => [x.id, i]))
    void ord
    await reorderByIds(next.map((c) => c.id), fresh2)
  }

  // Server tartibi yangi ro'yxatdagi indeksga mos kelishi uchun: server orderlari yo'q bo'lgani uchun faqat updateStage(order)
  const reorderByIds = async (ids, snapshot) => {
    // order qiymatlarini aniqlash uchun backenddan stages ro'yxati
    const all = await crmService.getPipeline(pid)
    void snapshot
    const have = (all.stages || []).filter((s) => s.kind === 'open').map((s) => s.id)
    const pool = have.slice().sort((a, b) => 0) // eslint-disable-line
    void pool
    const base = (await crmService.listStagesOrder?.(pid)) || null
    void base
    // oddiy yondashuv: ketma-ket order = 0..n-1 emas, balki mavjud global orderlarni qayta taqsimlash mumkin emas
    // (getPipeline order qaytarmaydi) — shuning uchun yangi tartib bo'yicha order = (indeks + 1) * 10 beriladi.
    await Promise.all(ids.map((id, i) => crmService.updateStage(id, { order: (i + 1) * 10 })))
  }

  const removeStage = async (id) => {
    try { await crmService.deleteStage(id) } catch (e) { window.alert(e?.message || 'Error'); return }
    setCols((cs) => cs.filter((c) => c.id !== id)); setOrig((cs) => cs.filter((c) => c.id !== id)); setEditing(null)
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
      if (oIds !== nIds) open.forEach((c, i) => ops.push(crmService.updateStage(c.id, { order: (i + 1) * 10 })))
      await Promise.all(ops)
      setOrig(cols); setSaveState('saved')
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

  const saveTrigger = async (acts, active, name) => {
    const m = modal
    const payload = { name, trigger: m.trigger, stageKey: m.stageKey || null, pipelineId: pid, actions: acts, active }
    if (m.initial) await crmService.updateAutomation(m.initial.id, payload)
    else await crmService.createAutomation({ ...payload, conditions: [] })
    setModal(null); loadAutos()
  }
  const delTrigger = async () => { await crmService.deleteAutomation(modal.initial.id); setModal(null); loadAutos() }

  const back = () => navigate(`/leads/pipeline/${pid || ''}`)

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
      {c.kind === 'lost' && <Reasons />}
      <Cells items={stageAutos(c.id)} trigger="stage_enter" onOpen={(a) => setModal({ trigger: 'stage_enter', stageKey: c.id, initial: a })} onNew={() => setModal({ trigger: 'stage_enter', stageKey: c.id })} />
    </div>
  )

  return (
    <div className="ac-pipesetup">
      <div className="ac-top">
        <PipeName pid={pipelineId} pipes={pipes} name={pipeName} onChanged={loadPipe} />
        <div className="ac-ps-spacer" />
        <div className="ac-top__actions">
          <button className="ac-ps-back" onClick={back}>{t('Orqaga')}</button>
          <button className="ac-btn" disabled={saveState === 'saving' || (!dirty && saveState !== 'saved')} onClick={save}>{t(saveState === 'saved' ? 'Saqlandi' : 'Saqlash')}</button>
        </div>
      </div>
      <div className="ac-ps-body">
        <Sources forms={forms} tgOn={tgOn} fbPages={fbPages} />
        <div className="ac-ps-cols">
          {!data ? <div style={{ padding: 30 }}><div className="ac-spinner" /></div> : (
            <>
              <div className="ac-ps-col">
                <div className="ac-ps-col__head"><span className="ac-ps-col__name fixed">{t('Saralanmagan')}</span></div>
                <div className="ac-ps-col__line" style={{ background: '#c9c9c9' }}>
                  <button className="ac-ps-col__plus" title={t("Bosqich qo'shish")} onClick={() => addStage(0)}><Ico name="plus" size={11} /></button>
                </div>
                <Cells items={unsortedAutos} trigger="lead_created" onOpen={(a) => setModal({ trigger: 'lead_created', initial: a })} onNew={() => setModal({ trigger: 'lead_created' })} />
              </div>
              {open.map((c, i) => renderCol(c, i, { fixed: false }))}
              {tail.map((c) => renderCol(c, null, { fixed: true }))}
            </>
          )}
        </div>
      </div>
      {modal && <TriggerModal initial={modal.initial} trigger={modal.trigger} members={members} onSave={saveTrigger} onDelete={delTrigger} onClose={() => setModal(null)} />}
    </div>
  )
}
