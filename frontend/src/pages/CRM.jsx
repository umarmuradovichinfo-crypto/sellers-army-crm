import { dialog } from '../components/Dialog'
import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export const VIEW_SLUG = { leads: 'lidlar', tasks: 'vazifalar', lists: 'royxatlar', chats: 'suhbatlar', calls: 'qongiroqlar', analytics: 'analitika', settings: 'sozlamalar' }
export const SLUG_VIEW = Object.fromEntries(Object.entries(VIEW_SLUG).map(([k, v]) => [v, k]))
import Icon from '../components/Icon'
import { PageHead, Stat, Avatar, Pill, Loading, ErrorState } from '../components/ui'
import { useApi } from '../lib/useApi'
import { useAuth } from '../context/AuthContext'
import { crmService, dialSoftphone } from '../services/crm.service'
import { phone as webrtcPhone } from '../lib/webrtcPhone'
import { tokenStore } from '../lib/apiClient'
import AnalyticsView from '../components/crm/AnalyticsView'
import AutomationsView from '../components/crm/AutomationsView'
import CrmSettingsView from '../components/crm/CrmSettingsView'
import ContactsView from '../components/crm/ContactsView'
import FormsView from '../components/crm/FormsView'
import PbxSettingsView from '../components/crm/PbxSettingsView'
import FacebookSettingsView from '../components/crm/FacebookSettingsView'
import UnsortedInbox from '../components/crm/UnsortedInbox'
import ConversationsView from '../components/crm/ConversationsView'
import TasksBoard, { TaskModal, ResultModal } from '../components/crm/TasksBoard'

const STAGE_COLORS = ['#3F77DD', '#D9952E', '#9b59b6', '#E6A33C', '#46B17B', '#DE5147', '#0EA5E9']
const SOURCES = ['Instagram', 'Meta Ads', 'Telegram', 'Tavsiya', 'Sayt', 'Telefon', 'Boshqa']

// amoCRM uslubidagi maydon turlari (maksimal)
const CRM_FIELD_TYPES = [
  { v: 'text', l: 'Matn' },
  { v: 'textarea', l: 'Uzun matn' },
  { v: 'number', l: 'Raqam' },
  { v: 'price', l: "Narx (so'm)" },
  { v: 'select', l: "Ro'yxat (bitta)" },
  { v: 'multiselect', l: "Ko'p tanlov" },
  { v: 'radio', l: 'Tugmali tanlov' },
  { v: 'date', l: 'Sana' },
  { v: 'datetime', l: 'Sana va vaqt' },
  { v: 'checkbox', l: 'Belgi (checkbox)' },
  { v: 'switch', l: "Ha / Yo'q" },
  { v: 'url', l: 'Havola' },
  { v: 'phone', l: 'Telefon' },
  { v: 'email', l: 'Email' },
]
const CRM_TYPE_OPT = ['select', 'multiselect', 'radio']
const crmTypeLabel = (t) => (CRM_FIELD_TYPES.find((x) => x.v === t) || { l: t }).l

// Qo'ng'iroq yozuvi — SHU YERDA (chatda) ijro. Bosilganda server orqali yuklanadi va
// audio pleer o'sha qatorda ochiladi (hech qanday tashqi saytga/joyga o'tkazmaydi).
function fmtDur(s) { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }
function waveBars(seed, n = 32) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = (h * 16777619) >>> 0 }
  const out = []
  for (let i = 0; i < n; i++) { h = (h * 1103515245 + 12345) >>> 0; out.push(30 + (h % 70)) }
  return out
}
// Telegram ovozli xabari uslubidagi yozuv pleeri: dumaloq play + to'lqin + vaqt.
function CallRecording({ callId, seconds = 0 }) {
  const [state, setState] = useState('idle') // idle | loading | ready | error
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(seconds || 0)
  const audioRef = useRef(null)
  const urlRef = useRef(null)
  const bars = useMemo(() => waveBars(String(callId), 32), [callId])

  useEffect(() => () => { const a = audioRef.current; if (a) a.pause(); if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  const ensure = async () => {
    if (audioRef.current) return audioRef.current
    const blob = await crmService.recordingBlob(callId)
    const u = URL.createObjectURL(blob); urlRef.current = u
    const a = new Audio(u); audioRef.current = a
    a.onloadedmetadata = () => { if (a.duration && isFinite(a.duration)) setDur(a.duration) }
    a.ontimeupdate = () => setCur(a.currentTime || 0)
    a.onended = () => { setPlaying(false); setCur(0) }
    return a
  }
  const toggle = async () => {
    if (playing) { audioRef.current && audioRef.current.pause(); setPlaying(false); return }
    setState('loading')
    try { const a = await ensure(); await a.play(); setPlaying(true); setState('ready') }
    catch { setState('error') }
  }
  const seek = (e) => {
    const a = audioRef.current; const d = (a && a.duration) || dur; if (!a || !d) return
    const r = e.currentTarget.getBoundingClientRect()
    const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    a.currentTime = p * d; setCur(p * d)
  }
  if (state === 'error') return <span className="amo-rec-err">Yozuv topilmadi</span>
  const prog = dur ? cur / dur : 0
  return (
    <div className="voice-rec">
      <button type="button" className="voice-play" onClick={toggle} title={playing ? 'Pauza' : 'Eshitish'}>
        {state === 'loading' && !playing
          ? <span className="voice-spin" />
          : playing
            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            : <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}
      </button>
      <div className="voice-wave" onClick={seek} title="Bosib o'tkazing">
        {bars.map((hh, i) => (
          <span key={i} className="voice-bar" style={{ height: hh + '%', background: (i + 0.5) / bars.length <= prog ? 'var(--ok)' : 'var(--bd)' }} />
        ))}
      </div>
      <span className="voice-time">{fmtDur(cur > 0 || playing ? cur : dur)}</span>
    </div>
  )
}

// CRM "Qo'ng'iroqlar" bo'limi — barcha qo'ng'iroqlar bitta ro'yxatда, o'tkazib
// yuborilganlar qizil bilan ajratilgan. Har 5s avto-yangilanadi.
function CallsView({ onOpen }) {
  const [filter, setFilter] = useState('all') // all | missed
  const [data, setData] = useState({ calls: [], missedCount: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const load = () => crmService.listCalls(filter).then((r) => { if (alive) { setData(r); setLoading(false) } }).catch(() => alive && setLoading(false))
    setLoading(true); load()
    const iv = setInterval(load, 5000)
    return () => { alive = false; clearInterval(iv) }
  }, [filter])

  const calls = data.calls || []
  return (
    <div style={{ padding: 16, height: '100%', overflow: 'auto' }}>
      <div className="fx ac gap8" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <button className={`amo-tab ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>Hammasi</button>
        <button className={`amo-tab ${filter === 'missed' ? 'on' : ''}`} onClick={() => setFilter('missed')}>
          📵 O'tkazib yuborilgan{data.missedCount ? ` (${data.missedCount})` : ''}
        </button>
      </div>
      {loading ? <Loading /> : calls.length === 0 ? (
        <div className="sub2" style={{ padding: 28, textAlign: 'center', fontSize: 13 }}>Qo'ng'iroqlar yo'q</div>
      ) : (
        <div style={{ display: 'grid', gap: 6, maxWidth: 780 }}>
          {calls.map((c) => {
            const missed = c.status === 'missed'
            const stLabel = missed ? "o'tkazib yuborilgan" : c.status === 'failed' ? 'ulanmadi' : c.status === 'completed' ? 'javob berildi' : c.status
            return (
              <div key={c.id} className="card" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12, borderLeft: `3px solid ${missed ? 'var(--dang)' : 'transparent'}` }}>
                <span style={{ fontSize: 18, flex: 'none' }}>{missed ? '📵' : c.direction === 'in' ? '📥' : '📤'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="fx ac gap8" style={{ flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 13 }}>{c.phone || '—'}</b>
                    {c.leadName
                      ? <button className="btn sm" style={{ padding: '1px 8px' }} onClick={() => onOpen(c.leadId)}>{c.leadName}</button>
                      : <span className="sub2" style={{ fontSize: 11 }}>lidga bog'lanmagan</span>}
                  </div>
                  <div className="sub2" style={{ fontSize: 11.5, marginTop: 1 }}>
                    {c.direction === 'in' ? 'Kiruvchi' : 'Chiquvchi'} · <span style={missed ? { color: 'var(--dang)', fontWeight: 700 } : undefined}>{stLabel}</span>{c.durationSec ? ` · ${c.durationSec}s` : ''}
                  </div>
                </div>
                {c.hasRecording && <CallRecording callId={c.id} seconds={c.durationSec} />}
                <span className="sub2" style={{ fontSize: 11, whiteSpace: 'nowrap', flex: 'none' }}>{fmtDate(c.startedAt)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Telefon raqami yonidagi tez amallar: PBX qo'ng'iroq · nusxalash · Telegramda ochish.
// leadId berilsa — qo'ng'iroqni o'zi bajaradi (ro'yxatda); onCall berilsa — o'sha ishlatiladi (kartada).
function PhoneActions({ phone, leadId, canCall, onCall, calling: callingProp, compact }) {
  const digits = (phone || '').replace(/[^\d]/g, '')
  const [copied, setCopied] = useState(false)
  const [callingLocal, setCallingLocal] = useState(false)
  const calling = callingProp ?? callingLocal
  const copy = async () => { try { await navigator.clipboard.writeText(phone); setCopied(true); setTimeout(() => setCopied(false), 1200) } catch { /* */ } }
  const openTg = () => {
    const a = document.createElement('a')
    a.href = 'tg://resolve?phone=' + digits // Telegram (ilova) — o'sha raqamli chat
    a.rel = 'noreferrer'
    document.body.appendChild(a); a.click(); a.remove()
  }
  const doCall = async () => {
    if (onCall) return onCall()
    if (!leadId) return
    setCallingLocal(true)
    try {
      if (webrtcPhone.isOn()) {
        webrtcPhone.call(digits)
        crmService.softLogCall({ leadId }).catch(() => {})
      } else {
        const mode = await crmService.loadPbxMode()
        if (mode.callMode === 'softphone') {
          dialSoftphone(mode.dialScheme, phone)
          crmService.softLogCall({ leadId }).catch(() => {})
        } else {
          await crmService.callLead(leadId)
        }
        window.dispatchEvent(new CustomEvent('pbx:outgoing', { detail: { phone, name: null } }))
      }
    } catch (e) {
      if (e?.data?.error === 'NO_EXTENSION') {
        const ext = await dialog.prompt('Ichki raqamingiz (extension):')
        if (ext && ext.trim()) {
          try { await crmService.setMyExtension(ext.trim()); await crmService.callLead(leadId); window.dispatchEvent(new CustomEvent('pbx:outgoing', { detail: { phone, name: null } })) }
          catch (e2) { await dialog.alert(e2.message || 'Xatolik') }
        }
      } else await dialog.alert(e.message || 'Qo\'ng\'iroq boshlanmadi')
    } finally { setCallingLocal(false) }
  }
  return (
    <div className={'amo-phone-acts' + (compact ? ' compact' : '')}>
      {canCall && (
        <button type="button" className="amo-pa amo-pa-call" title="OnlinePBX orqali qo'ng'iroq" disabled={calling} onClick={doCall}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.9.36 1.78.7 2.6a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.48-1.27a2 2 0 0 1 2.11-.45c.82.34 1.7.57 2.6.7A2 2 0 0 1 22 16.92z" /></svg>
        </button>
      )}
      <button type="button" className="amo-pa" title={copied ? 'Nusxalandi' : 'Raqamni nusxalash'} onClick={copy}>
        {copied ? <span style={{ color: 'var(--ok)', fontWeight: 800, fontSize: 13 }}>✓</span> : <Icon name="copy" size={13} />}
      </button>
      <button type="button" className="amo-pa amo-pa-tg" title="Telegramda ochish" onClick={openTg}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" /></svg>
      </button>
    </div>
  )
}
const TASK_TYPES = [
  { v: 'call', l: 'Qo\'ng\'iroq', e: '📞' },
  { v: 'meeting', l: 'Uchrashuv', e: '🤝' },
  { v: 'message', l: 'Xabar', e: '💬' },
  { v: 'task', l: 'Vazifa', e: '📋' },
]
const TYPE_META = Object.fromEntries(TASK_TYPES.map((t) => [t.v, t]))
const ACT_ICON = { created: '✨', updated: '✏️', stage: '➡️', note: '💬', task_created: '📋', task_done: '✅', call: '📞', field: '✏️', won: '🏆', lost: '❌', assignee: '👤', tag: '🏷', automation: '⚙️', email: '✉️' }

function fmtSum(v) {
  v = Number(v) || 0
  if (v >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, '') + ' mlrd'
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + ' mln'
  if (v >= 1e3) return Math.round(v / 1e3) + ' ming'
  return String(v)
}
function fmtDate(iso) {
  const d = new Date(iso); if (isNaN(d)) return ''
  const M = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek']
  return `${d.getDate()} ${M[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function p2(n) { return String(n).padStart(2, '0') }
function toLocalDT(d) { return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}` }
function atTimeDT(addDays, hour) { const d = new Date(); d.setDate(d.getDate() + addDays); d.setHours(hour, 0, 0, 0); return toLocalDT(d) }

// chrome='tabs' — asosiy platformada tepada tab-qator; 'none' — alohida CRM
// platformasida (subdomen) tab yashirin, bo'lim tanlash chapdagi panel orqali.
export default function CRM({ chrome = 'tabs' }) {
  const { data, loading, error, reload, setData } = useApi(async () => {
    const [pipe, mem, fl, cfl, cofl, lr] = await Promise.all([
      crmService.getPipeline(), crmService.listMembers(), crmService.listFields('lead'), crmService.listFields('contact'), crmService.listFields('company'), crmService.listLostReasons(),
    ])
    return { stages: pipe.stages || [], stats: pipe.stats || [], members: mem.members || [], pipelines: pipe.pipelines || [], fields: fl.fields || [], contactFields: cfl.fields || [], companyFields: cofl.fields || [], lostReasons: lr.reasons || [] }
  }, [], 'crm', 600000)

  const { user, can } = useAuth()
  const location = useLocation()
  const isSuper = user?.role === 'super_admin'
  const canSettings = isSuper || can?.('crm.settings')
  const canAutomation = isSuper || can?.('crm.automation')
  const [sel, setSel] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const [addingStage, setAddingStage] = useState(false)
  const [editingStage, setEditingStage] = useState(null)
  const navigate = useNavigate()
  // CRM bo'limi URL'dan o'qiladi. Asosiy platformada: /crm/vazifalar;
  // alohida CRM platformasida (subdomen) prefiks yo'q: /vazifalar
  const base = location.pathname.startsWith('/crm') ? '/crm' : ''
  const seg = location.pathname.slice(base.length).replace(/^\//, '').split('/')[0]
  const view = SLUG_VIEW[seg] || 'leads'
  const setView = (k) => navigate((base + (k === 'leads' ? '' : '/' + (VIEW_SLUG[k] || k))) || '/')
  const [leadsView, setLeadsView] = useState('board') // board | list | unsorted
  const [settingsTab, setSettingsTab] = useState('fields') // fields | automation | forms
  const [formsOpen, setFormsOpen] = useState(false) // "Formalar" drawer (toolbardan ochiladi)
  const [showCardLayout, setShowCardLayout] = useState(false)
  const [cardLayout, setCardLayout] = useState(() => {
    const def = { avatar: true, contact: true, company: true, phone: false, email: false, date: true, budget: true, tags: true, source: true, task: true, responsible: true, fields: [] }
    try { return { ...def, ...JSON.parse(localStorage.getItem('crm_card_layout') || '{}') } } catch { return def }
  })
  const saveCardLayout = (cl) => { setCardLayout(cl); try { localStorage.setItem('crm_card_layout', JSON.stringify(cl)) } catch { /* */ } }
  const [pipelineId, setPipelineId] = useState('')
  const [filters, setFilters] = useState({ search: '', source: '', assigneeId: '', tag: '', hot: '' })
  const [unsortedCount, setUnsortedCount] = useState(0)
  const [unsortedLeads, setUnsortedLeads] = useState([]) // doskadagi chap "Saralanmagan" ustuni
  const [quickAdd, setQuickAdd] = useState(null) // qaysi ustunda tez qo'shish ochiq
  const [dragging, setDragging] = useState(null) // {id, from} — pastki yopish zonalari uchun
  const [boardQ, setBoardQ] = useState('') // doska tez filtri: qidiruv
  const [boardAssignee, setBoardAssignee] = useState('') // doska tez filtri: mas'ul

  useEffect(() => {
    if (loading) return
    crmService.listUnsorted().then((r) => {
      setUnsortedCount((r.leads || []).length)
      setUnsortedLeads(r.leads || [])
    }).catch(() => {})
  }, [loading, view])

  // pipeline tanlanganda qayta yuklash
  useEffect(() => {
    if (loading) return
    crmService.getPipeline(pipelineId).then((pipe) => {
      setData((d) => ({ ...d, stages: pipe.stages || [], stats: pipe.stats || [], pipelines: pipe.pipelines || d.pipelines }))
    }).catch(() => {})
  }, [pipelineId])

  const openLeadById = async (id) => {
    try { const r = await crmService.getLead(id); setSel({ lead: r.lead, stageId: r.lead.stage }) } catch { /* */ }
  }

  // ?lead=<id> — bildirishnoma yoki global qidiruvdan ochish (har o'zgarishda)
  useEffect(() => {
    const p = new URLSearchParams(location.search).get('lead')
    if (p) openLeadById(p)
  }, [location.search])

  if (loading) return <Loading />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const stages = data.stages

  const lostStage = (key) => stages.find((s) => s.id === key)?.kind === 'lost'

  const moveLead = async (id, fromStage, toStage) => {
    if (!id || fromStage === toStage) return
    let lostReason
    if (lostStage(toStage)) {
      lostReason = await pickLostReason(data.lostReasons)
      if (lostReason === null) return // bekor qilindi
    }
    setData((d) => {
      const moved = d.stages.flatMap((s) => s.leads).find((l) => l.id === id)
      if (!moved) return d
      const target = d.stages.find((s) => s.id === toStage)
      if (!target) return d
      const ns = d.stages.map((s) => {
        const leads = s.leads.filter((l) => l.id !== id)
        if (s.id === toStage) leads.push({ ...moved, stage: toStage, won: s.kind === 'won' || undefined, lost: s.kind === 'lost' || undefined })
        return { ...s, leads }
      })
      return { ...d, stages: recomputeSums(ns) }
    })
    // Server xatosida joyiga QAYTMAYDI (optimistik holat qoladi; fon yangilanishi keyin sinxronlaydi)
    crmService.moveLead(id, toStage, undefined, lostReason).catch((ex) => console.warn('Lid ko\'chirish serverda saqlanmadi (keyin sinxronlanadi):', (ex && ex.message) || ex))
  }

  const saveLead = async (payload, id) => {
    const res = id ? await crmService.updateLead(id, payload) : await crmService.createLead(payload)
    const lead = res.lead
    setData((d) => {
      let ns = d.stages
      if (id) {
        ns = ns.map((s) => ({ ...s, leads: s.leads.map((l) => l.id === lead.id ? { ...l, ...lead } : l) }))
        ns = reseat(ns, lead)
      } else if (ns.some((s) => s.id === lead.stage)) {
        ns = ns.map((s) => s.id === lead.stage ? { ...s, leads: [...s.leads, lead] } : s)
      }
      return { ...d, stages: recomputeSums(ns) }
    })
    return lead
  }

  const deleteLead = async (id) => {
    await crmService.deleteLead(id)
    setData((d) => ({ ...d, stages: recomputeSums(d.stages.map((s) => ({ ...s, leads: s.leads.filter((l) => l.id !== id) }))) }))
  }

  // ── Doska tez filtri (amoCRM quick filter) ──
  const filterBoard = (leads) => leads.filter((l) => {
    if (boardAssignee && l.assigneeId !== boardAssignee) return false
    if (boardQ.trim()) {
      const q = boardQ.trim().toLowerCase()
      const hay = [l.n, l.contactName, l.phone, l.company].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  // amoCRM: voronka nomi yonida jami ochiq lidlar hisobi
  const boardTotals = (() => {
    const open = (data?.stages || []).filter((s) => s.kind === 'open')
    const leads = open.flatMap((s) => filterBoard(s.leads))
    const sum = leads.reduce((a, l) => a + (l.value || 0), 0)
    const fmt = sum >= 1_000_000 ? (sum / 1_000_000).toFixed(1).replace(/\.0$/, '') + ' mln' : sum >= 1_000 ? Math.round(sum / 1_000) + ' ming' : String(sum)
    return { count: leads.length, sum: fmt }
  })()

  // ── Saralanmagan (doskadagi chap ustun): qabul / rad ──
  const acceptUnsortedLead = async (l) => {
    const firstOpen = stages.find((s) => s.kind === 'open')
    try {
      await crmService.acceptUnsorted(l.id, { stageKey: firstOpen?.id, pipelineId: pipelineId || undefined })
      setUnsortedLeads((u) => u.filter((x) => x.id !== l.id)); setUnsortedCount((c) => c - 1)
      reload()
    } catch (e) { await dialog.alert(e.message || 'Qabul qilinmadi') }
  }
  const rejectUnsortedLead = async (l) => {
    if (!await dialog.confirm(`"${l.n || l.name}" rad etilsinmi? Lid o'chiriladi.`)) return
    try {
      await crmService.deleteLead(l.id)
      setUnsortedLeads((u) => u.filter((x) => x.id !== l.id)); setUnsortedCount((c) => c - 1)
    } catch (e) { await dialog.alert(e.message || "O'chirilmadi") }
  }

  const addStage = async (name, color, kind) => {
    if (!name || !name.trim()) return
    try {
      const res = await crmService.createStage({ name: name.trim(), color, kind: kind || 'open', pipelineId: pipelineId || undefined })
      setData((d) => ({ ...d, stages: [...d.stages, { id: res.stage.key, name: res.stage.name, color: res.stage.color, kind: res.stage.kind, isSystem: false, sum: '0', leads: [] }] }))
      setAddingStage(false)
    } catch (e) { await dialog.alert(e.message || 'Bosqich qo`shilmadi') }
  }
  const saveStageEdit = async (st, patch) => {
    try {
      await crmService.updateStage(st.id, patch)
      setData((d) => ({ ...d, stages: d.stages.map((s) => s.id === st.id ? { ...s, ...patch } : s) }))
      setEditingStage(null)
    } catch (e) { await dialog.alert(e.message || 'Saqlanmadi') }
  }
  const deleteStage = async (st) => {
    if (st.leads.length > 0) { await dialog.alert("Bosqichda lidlar bor — avval ularni ko'chiring"); return }
    if (!await dialog.confirm(`"${st.name}" bosqichi o'chirilsinmi?`)) return
    try { await crmService.deleteStage(st.id); setData((d) => ({ ...d, stages: d.stages.filter((s) => s.id !== st.id) })) }
    catch (e) { await dialog.alert(e.message || 'O`chirib bo`lmadi') }
  }

  const exportCsv = async () => {
    try {
      const res = await fetch(`/api/v1${crmService.exportUrl()}`, { headers: { Authorization: `Bearer ${tokenStore.get()}` } })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'leads.csv'; a.click(); URL.revokeObjectURL(url)
    } catch (e) { await dialog.alert('Eksport xatosi') }
  }

  const TABS = [
    { k: 'leads', l: 'Lidlar' },
    { k: 'tasks', l: 'Vazifalar' },
    { k: 'lists', l: 'Ro\'yxatlar' },
    { k: 'chats', l: 'Suhbatlar' },
    { k: 'analytics', l: 'Analitika' },
    ...((canSettings || canAutomation) ? [{ k: 'settings', l: 'Sozlamalar' }] : []),
  ]
  const refreshUnsorted = () => crmService.listUnsorted().then((r) => {
    setUnsortedCount((r.leads || []).length)
    setUnsortedLeads(r.leads || [])
  }).catch(() => {})

  return (
    <div className="amo">
      {chrome === 'tabs' && (
        <div className="amo-top">
          <div className="amo-tabs">
            {TABS.map((t) => <button key={t.k} className={`amo-tab ${view === t.k ? 'on' : ''}`} onClick={() => setView(t.k)}>{t.l}</button>)}
          </div>
        </div>
      )}

      {/* ===== LIDLAR (Voronka — amoCRM Сделки) ===== */}
      {view === 'leads' && (
        <>
          <div className="amo-toolbar">
            {data.pipelines?.length > 0 && (
              <select className="hr-select amo-pipe" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
                <option value="">Asosiy voronka</option>
                {data.pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            {/* amoCRM: voronka nomi yonida jami hisob */}
            <span className="amo-total num">{boardTotals.count} ta lid: {boardTotals.sum} so'm</span>
            <div className="amo-seg">
              <button className={leadsView === 'board' ? 'on' : ''} onClick={() => setLeadsView('board')} title="Doska"><Icon name="tasks" size={14} /></button>
              <button className={leadsView === 'list' ? 'on' : ''} onClick={() => setLeadsView('list')} title="Ro'yxat"><Icon name="checklist" size={14} /></button>
            </div>
            <button className={`amo-incoming ${leadsView === 'unsorted' ? 'on' : ''}`} onClick={() => setLeadsView('unsorted')}>
              Saralanmagan{unsortedCount > 0 && <span className="amo-badge">{unsortedCount}</span>}
            </button>
            {/* Doska filtri (amoCRM tez filtr): qidiruv + mas'ul */}
            <div className="search" style={{ maxWidth: 220, padding: '6px 10px' }}>
              <Icon name="search" size={14} />
              <input value={boardQ} onChange={(e) => setBoardQ(e.target.value)} placeholder="Qidirish..."
                style={{ border: 0, outline: 0, background: 'transparent', width: '100%', font: 'inherit' }} />
            </div>
            <select className="hr-select" style={{ width: 150, padding: '6px 10px' }} value={boardAssignee} onChange={(e) => setBoardAssignee(e.target.value)}>
              <option value="">Barcha mas'ul</option>
              {(data.members || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <div className="f1" />
            <button className="btn sm" onClick={exportCsv} title="CSV eksport"><Icon name="download" size={14} /></button>
            {(isSuper || can?.('crm.import')) && <ImportButton onDone={reload} />}
            <button className="btn sm amo-dots" onClick={() => setShowCardLayout(true)} title="Kartochkani sozlash">⋮</button>
            {canSettings && <button className="btn sm" onClick={() => setFormsOpen(true)} title="Web formalar"><Icon name="checklist" size={14} />Formalar</button>}
            <button className="btn primary" onClick={() => setSel({ __new: true })}><Icon name="plus" size={15} />Lid qo'shish</button>
          </div>

          {formsOpen && (
            <div className="hr-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setFormsOpen(false) }}>
              <div className="hr-drawer">
                <div className="hr-dh">
                  <div className="f1"><b style={{ fontSize: 15 }}>Web formalar</b><div className="sub2" style={{ fontSize: 12 }}>Forma tuzing — to'ldirilganda CRM'ga lid tushadi</div></div>
                  <button className="hr-x" onClick={() => setFormsOpen(false)}>×</button>
                </div>
                <div className="hr-db"><FormsView stages={stages} members={data.members} /></div>
              </div>
            </div>
          )}

          {leadsView === 'list' && <ListView filters={filters} setFilters={setFilters} members={data.members} stages={stages} pipelineId={pipelineId} onOpen={openLeadById} onChanged={reload} />}
          {leadsView === 'unsorted' && <UnsortedInbox stages={stages} members={data.members} onChanged={() => { reload(); refreshUnsorted() }} />}

          {leadsView === 'board' && (
            <div className="kanban">
              {/* amoCRM: Saralanmagan — voronkaning eng chap maxsus ustuni */}
              {unsortedLeads.length > 0 && (
                <div className="kcol kcol-unsorted">
                  <div className="kcolhead" style={{ background: '#9aa0a6' }}>
                    <div className="fx ac gap8">
                      <b className="kcoltitle">SARALANMAGAN</b>
                      <span className="kcolcnt">{unsortedLeads.length}</span>
                    </div>
                    <div className="kcolsum">qabul qiling yoki rad eting</div>
                  </div>
                  <div className="kcards">
                    {unsortedLeads.map((l) => (
                      <div className="kcard" key={l.id}>
                        <div className="fx jb" style={{ gap: 6 }}>
                          <span className="kc-contact">{l.n || l.name}</span>
                          <span className="kc-date num">{fmtCardDate(l.createdAt)}</span>
                        </div>
                        {(l.phone || l.tag) && (
                          <div className="sub2" style={{ fontSize: 11.5, marginTop: 3 }}>{[l.phone, l.tag !== '—' ? l.tag : null].filter(Boolean).join(' · ')}</div>
                        )}
                        <div className="fx ac gap8" style={{ marginTop: 9 }}>
                          <button className="btn sm primary f1" onClick={() => acceptUnsortedLead(l)}>✓ Qabul</button>
                          <button className="btn sm" onClick={() => rejectUnsortedLead(l)}>✕ Rad</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {stages.map((s) => (
                <div className="kcol" key={s.id}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(s.id) }}
                  onDragLeave={() => setDragOver((p) => (p === s.id ? null : p))}
                  onDrop={(e) => { e.preventDefault(); setDragOver(null); const fs = e.dataTransfer.getData('fromStage'); const id = e.dataTransfer.getData('text/plain'); if (id) moveLead(id, fs, s.id) }}
                  style={dragOver === s.id ? { outline: '2px dashed var(--amo-blue)', outlineOffset: 2, borderRadius: 6 } : undefined}>
                  {editingStage === s.id ? (
                    <StageEditInline stage={s} onSave={(patch) => saveStageEdit(s, patch)} onCancel={() => setEditingStage(null)} />
                  ) : (
                    <div className="kcolhead" style={{ background: s.color }}>
                      <div className="fx ac gap8">
                        <b className="kcoltitle">{s.name}</b>
                        <span className="kcolcnt">{filterBoard(s.leads).length}</span>
                        {isSuper && (
                          <span className="fx ac" style={{ marginLeft: 'auto' }}>
                            <button className="kcolbtn" title="Tahrirlash" onClick={() => setEditingStage(s.id)}><Icon name="edit" size={12} /></button>
                            {!s.isSystem && <button className="kcolbtn" title="O'chirish" onClick={() => deleteStage(s)}>×</button>}
                          </span>
                        )}
                      </div>
                      <div className="kcolsum">{s.sum} so'm</div>
                    </div>
                  )}
                  <div className="kcards">
                    {/* amoCRM "Быстрое добавление" — har ustunning tepasida tez qo'shish */}
                    {quickAdd === s.id ? (
                      <QuickAddCard onSave={async (p) => { await saveLead({ ...p, stage: s.id }); setQuickAdd(null) }} onCancel={() => setQuickAdd(null)} />
                    ) : (
                      <button className="kaddquick" onClick={() => setQuickAdd(s.id)} title="Tez qo'shish"><Icon name="plus" size={12} /></button>
                    )}
                    {filterBoard(s.leads).map((l) => (
                      <LeadCard key={l.id} l={l} layout={cardLayout} fields={data.fields}
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', l.id); e.dataTransfer.setData('fromStage', s.id); setDragging({ id: l.id, from: s.id }) }}
                        onDragEnd={() => setDragging(null)}
                        onClick={() => setSel({ lead: l, stageId: s.id })} />
                    ))}
                  </div>
                </div>
              ))}
              {isSuper && (addingStage
                ? <AddStageInline onAdd={addStage} onCancel={() => setAddingStage(false)} />
                : <button className="kcol hr-addcol" onClick={() => setAddingStage(true)}><Icon name="plus" size={18} /> Bosqich</button>)}
            </div>
          )}

          {/* amoCRM: karta sudralayotganda pastda yopish zonalari chiqadi */}
          {leadsView === 'board' && dragging && (
            <div className="kclose" onDragLeave={(e) => e.preventDefault()}>
              <div className="kclose-z del"
                onDragOver={(e) => e.preventDefault()}
                onDrop={async (e) => { e.preventDefault(); const d = dragging; setDragging(null); if (d && await dialog.confirm("Lid o'chirilsinmi?")) deleteLead(d.id) }}>
                🗑 O'CHIRISH
              </div>
              <div className="kclose-z lost"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const d = dragging; setDragging(null); const st = stages.find((x) => x.kind === 'lost'); if (d && st) moveLead(d.id, d.from, st.id) }}>
                YOPILDI — AMALGA OSHMADI
              </div>
              <div className="kclose-z won"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const d = dragging; setDragging(null); const st = stages.find((x) => x.kind === 'won'); if (d && st) moveLead(d.id, d.from, st.id) }}>
                ✓ MUVAFFAQIYATLI YAKUNLANDI
              </div>
            </div>
          )}
        </>
      )}

      {view === 'tasks' && <TasksBoard onOpenLead={openLeadById} members={data.members} />}
      {view === 'lists' && <ContactsView />}
      {view === 'chats' && <ConversationsView onOpen={openLeadById} />}
      {view === 'calls' && <CallsView onOpen={openLeadById} />}
      {view === 'analytics' && (
        <>
          {data.pipelines?.length > 0 && (
            <div className="amo-toolbar">
              <select className="hr-select amo-pipe" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
                <option value="">Asosiy voronka</option>
                {data.pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <AnalyticsView pipelineId={pipelineId} />
        </>
      )}

      {view === 'settings' && (
        <>
          <div className="amo-subtabs">
            {canSettings && <button className={`amo-tab ${settingsTab === 'fields' ? 'on' : ''}`} onClick={() => setSettingsTab('fields')}>Voronka & maydonlar</button>}
            {canAutomation && <button className={`amo-tab ${settingsTab === 'automation' ? 'on' : ''}`} onClick={() => setSettingsTab('automation')}>Avtomatlashtirish</button>}
            {canSettings && <button className={`amo-tab ${settingsTab === 'forms' ? 'on' : ''}`} onClick={() => setSettingsTab('forms')}>Formalar</button>}
            {canSettings && <button className={`amo-tab ${settingsTab === 'pbx' ? 'on' : ''}`} onClick={() => setSettingsTab('pbx')}>Telefoniya</button>}
            {canSettings && <button className={`amo-tab ${settingsTab === 'facebook' ? 'on' : ''}`} onClick={() => setSettingsTab('facebook')}>Facebook</button>}
          </div>
          {settingsTab === 'fields' && canSettings && <CrmSettingsView onChanged={reload} />}
          {settingsTab === 'automation' && canAutomation && <AutomationsView stages={stages} members={data.members} />}
          {settingsTab === 'forms' && canSettings && <FormsView stages={stages} members={data.members} />}
          {settingsTab === 'pbx' && canSettings && <PbxSettingsView />}
          {settingsTab === 'facebook' && canSettings && <FacebookSettingsView stages={stages} members={data.members} pipelines={data.pipelines || []} />}
        </>
      )}

      {showCardLayout && (
        <CardLayoutModal layout={cardLayout} fields={data.fields} onSave={(cl) => { saveCardLayout(cl); setShowCardLayout(false) }} onClose={() => setShowCardLayout(false)} />
      )}

      {sel && (
        <LeadDrawer key={sel.lead?.id || 'new'} initial={sel.__new ? null : sel.lead} stages={stages} members={data.members}
          fields={data.fields} contactFields={data.contactFields} companyFields={data.companyFields} lostReasons={data.lostReasons} pipelines={data.pipelines} pipelineId={pipelineId} defaultStage={sel.stage}
          canSettings={canSettings} onFieldsChanged={reload}
          onClose={() => setSel(null)}
          onSave={async (p, id) => { await saveLead(p, id); setSel(null) }}
          onDelete={async () => { await deleteLead(sel.lead.id); setSel(null) }} />
      )}
    </div>
  )
}

// ── Lid kartochkasi — amoCRM ko'rinishi ──────────────────────
// [avatar] [Kontakt (ko'k)  ..............  sana]
//          [LID NOMI (caps, mayda)]
//          [teg chiplari]
//          ── ajratkich ──
//          [🔥/✓/✕ .................. Vazifa holati •]
// Vazifa holati (amoCRM qoidasi): vazifasiz/muddati o'tgan = qizil,
// bugun = yashil, kelajak = kulrang sana. Hammasi "⋮ Kartochkani sozlash"da yoqib-o'chiriladi.
const TASK_COLORS = { none: '#DE5147', overdue: '#DE5147', today: '#2E9E5B', future: '#8C8C8C' }

function fmtCardDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

function LeadCard({ l, layout, fields = [], onDragStart, onDragEnd, onClick }) {
  // Ko'k qator — kontakt (amoCRM'dagidek); kontakt bo'lmasa lid nomining o'zi
  const primary = layout.contact !== false && l.contactName ? l.contactName : l.n
  const showLeadLine = primary !== l.n
  const ts = l.taskStatus
  const showTags = layout.tags && ((l.tags || []).length > 0 || (layout.source && l.tag && l.tag !== '—'))
  const fmeta = new Map((fields || []).map((f) => [f.key, f.label]))
  const cf = (layout.fields || []).map((k) => ({ k, v: l.custom?.[k], label: fmeta.get(k) || k })).filter((x) => x.v !== undefined && x.v !== '' && !(Array.isArray(x.v) && !x.v.length))
  return (
    <div className="kcard" draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onClick}>
      <div className="fx" style={{ gap: 8 }}>
        {layout.avatar !== false && (
          <span className="kc-avatar" title={l.contactName || l.n}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2.2c-4.2 0-8 2.1-8 5.3V22h16v-2.5c0-3.2-3.8-5.3-8-5.3z" /></svg>
          </span>
        )}
        <div className="f1" style={{ minWidth: 0 }}>
          <div className="fx jb" style={{ gap: 6 }}>
            <span className="kc-contact" title={primary}>{primary}</span>
            {layout.date !== false && <span className="kc-date num">{fmtCardDate(l.createdAt)}</span>}
          </div>
          {showLeadLine && <div className="kc-lead" title={l.n}>{l.n}</div>}
          {layout.budget && l.value > 0 && <div className="kcardsum num">{l.sum} so'm</div>}
          {layout.company && l.company && <div className="kc-company" title={l.company}>{l.company}</div>}
          {layout.phone && l.phone && <div className="kc-info" title={l.phone}>{l.phone}</div>}
          {layout.email && l.email && <div className="kc-info" title={l.email}>{l.email}</div>}
        </div>
      </div>
      {showTags && (
        <div className="fx ac" style={{ gap: 4, flexWrap: 'wrap', margin: '7px 0 0' }}>
          {layout.source && l.tag && l.tag !== '—' && <span className="kc-tag">{l.tag}</span>}
          {(l.tags || []).slice(0, 3).map((t) => <span className="kc-tag" key={t}>{t}</span>)}
        </div>
      )}
      {cf.length > 0 && (
        <div style={{ margin: '6px 0 0' }}>
          {cf.map((x) => <div key={x.k} className="kcardcf"><b className="kcardcf-l">{x.label}:</b> {Array.isArray(x.v) ? x.v.join(', ') : String(x.v)}</div>)}
        </div>
      )}
      {((layout.task !== false && ts) || (layout.responsible && l.assigneeName) || l.hot || l.won || l.lost) && (
        <div className="kc-foot">
          <span className="fx ac gap6" style={{ minWidth: 0 }}>
            {layout.task !== false && ts && (
              <span className="kc-task" style={{ color: TASK_COLORS[ts.kind] || '#8C8C8C' }}
                title={ts.title ? `Vazifa: ${ts.title}` : "Ochiq vazifa yo'q — lid e'tibordan chetda qolgan"}>
                <i className="kc-taskdot" style={{ background: TASK_COLORS[ts.kind] || '#8C8C8C' }} /> {ts.label}
              </span>
            )}
            {l.hot && <span title="Issiq" style={{ fontSize: 12 }}>🔥</span>}
            {l.won && <span className="pill ok" style={{ padding: '0 6px', fontSize: 10 }}>✓</span>}
            {l.lost && <span className="pill mut" style={{ padding: '0 6px', fontSize: 10 }}>✕</span>}
          </span>
          {layout.responsible && l.assigneeName && (
            <span className="kc-resp" title={`Mas'ul: ${l.assigneeName}`}>
              <Avatar ini={initials(l.assigneeName)} color={avatarColor(l.assigneeId || l.assigneeName)} size={22} />
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// Ism/id'dan barqaror avatar rangi (amoCRM'dagidek mas'ul avatar rangi)
function avatarColor(s) {
  const colors = ['#2A9AF3', '#7C5CFC', '#E0574B', '#F5A623', '#20B486', '#EC6EAD', '#0EA5A4', '#6366F1']
  let h = 0
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return colors[Math.abs(h) % colors.length]
}

function initials(name) {
  return (name || '').split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '•'
}

// amoCRM "Быстрое добавление" — ustun ichida mini forma (ism, telefon, byudjet)
function QuickAddCard({ onSave, onCancel }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!name.trim()) return
    setBusy(true)
    try { await onSave({ name: name.trim(), phone: phone.trim() || undefined, value: Number(value) || 0 }) }
    catch (e) { await dialog.alert(e.message || 'Saqlanmadi') } finally { setBusy(false) }
  }
  const onKey = (e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }
  return (
    <div className="kcard kqa" onClick={(e) => e.stopPropagation()}>
      <input className="kqa-in" autoFocus placeholder="Lid nomi *" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onKey} />
      <input className="kqa-in" placeholder="Telefon" value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={onKey} />
      <input className="kqa-in num" placeholder="Byudjet (so'm)" type="number" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={onKey} />
      <div className="fx ac gap8" style={{ marginTop: 7 }}>
        <button className="btn sm primary f1" disabled={busy || !name.trim()} onClick={submit}>Qo'shish</button>
        <button className="btn sm" onClick={onCancel}>✕</button>
      </div>
    </div>
  )
}

// Kartochka ko'rinishini sozlash (amoCRM "Edit card layout" — ⋮ menyu)
function CardLayoutModal({ layout, fields = [], onSave, onClose }) {
  const [l, setL] = useState({ avatar: true, contact: true, company: true, phone: false, email: false, date: true, budget: true, tags: true, source: true, task: true, responsible: true, fields: [], ...layout })
  const t = (k) => setL((p) => ({ ...p, [k]: !p[k] }))
  const toggleField = (key) => setL((p) => ({ ...p, fields: p.fields.includes(key) ? p.fields.filter((x) => x !== key) : [...p.fields, key] }))
  const Row = ({ k, label }) => (
    <label className="amo-cl-row"><span>{label}</span><span className={`amo-sw ${l[k] ? 'on' : ''}`} onClick={() => t(k)}><i /></span></label>
  )

  // Jonli namuna kartochka — toggle bosilganda shu yerda o'zgaradi
  const demoCustom = {}
  for (const fd of fields) {
    demoCustom[fd.key] = fd.type === 'multiselect' ? ['Namuna'] : (fd.type === 'checkbox' || fd.type === 'switch') ? true
      : (fd.type === 'number' || fd.type === 'price') ? '150000' : fd.type === 'date' ? '2026-08-01' : 'Namuna qiymat'
  }
  const demo = {
    id: 'demo', n: 'Namuna bitim', name: 'Namuna bitim', contactName: 'Demo Kontakt',
    company: 'Demo Kompaniya', phone: '+998 90 000 00 00', email: 'mijoz@example.com',
    value: 4500000, sum: '4 500 000', tags: ['issiq', 'vip'], tag: 'Instagram',
    createdAt: new Date().toISOString(), assigneeName: 'Demo Menejer', assigneeId: 'u-demo',
    c: '#2A9AF3', ini: 'DK', hot: true,
    taskStatus: { kind: 'today', label: 'Bugun', title: 'Qo\'ng\'iroq qilish' },
    custom: demoCustom,
  }

  return (
    <div className="hr-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="hr-drawer" style={{ maxWidth: 440 }}>
        <div className="hr-dh"><div className="f1"><b style={{ fontSize: 15 }}>Kartochka ko'rinishi</b><div className="sub2" style={{ fontSize: 12 }}>Yoqib/o'chirsangiz — yuqoridagi namuna darrov o'zgaradi</div></div><button className="hr-x" onClick={onClose}>×</button></div>
        <div className="hr-db">
          {/* Jonli namuna — amoCRM'dagidek doska ustuni foni ustida */}
          <div className="amo-cl-preview">
            <div className="amo-cl-preview-lbl">Namuna</div>
            <div className="amo-cl-preview-col amo">
              <LeadCard l={demo} layout={l} fields={fields} onClick={() => {}} />
            </div>
          </div>

          <div className="hr-sec">
            <h4>Elementlar</h4>
            <Row k="avatar" label="Kontakt avatari (chap yuqori)" />
            <Row k="contact" label="Kontakt ismi (ko'k qator)" />
            <Row k="company" label="Kompaniya nomi" />
            <Row k="phone" label="Telefon" />
            <Row k="email" label="Email" />
            <Row k="date" label="Yaratilgan sana" />
            <Row k="budget" label="Byudjet (summa)" />
            <Row k="source" label="Manba" />
            <Row k="tags" label="Teglar" />
            <Row k="task" label="Vazifa holati (Bugun / Muddati o'tgan / Vazifa yo'q)" />
            <Row k="responsible" label="Mas'ul sotuvchi avatari (o'ng past)" />
          </div>
          {fields.length > 0 && (
            <div className="hr-sec">
              <h4>Maxsus maydonlar (mijoz ma'lumotlari)</h4>
              {fields.map((f) => (
                <label className="amo-cl-row" key={f.id}><span>{f.label}</span><span className={`amo-sw ${l.fields.includes(f.key) ? 'on' : ''}`} onClick={() => toggleField(f.key)}><i /></span></label>
              ))}
            </div>
          )}
          <div className="fx ac gap10" style={{ paddingTop: 8 }}>
            <button className="btn primary f1" onClick={() => onSave(l)}>Saqlash</button>
            <button className="btn" onClick={onClose}>Yopish</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Yo'qotish sababini tanlash (oddiy prompt — katalog ko'rsatiladi)
async function pickLostReason(reasons) {
  const list = (reasons || []).map((r) => r.name)
  const hint = list.length ? `Sabablar: ${list.join(', ')}` : 'Yo\'qotish sababini yozing'
  const r = await dialog.prompt(`Yo'qotish sababi?\n${hint}`, '')
  if (r === null || r === undefined) return null
  return r.trim()
}

// ── Import tugmasi (CSV) ──
function ImportButton({ onDone }) {
  const ref = useRef(null)
  const handle = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const text = await file.text()
    const rows = parseCsv(text)
    if (!rows.length) { await dialog.alert('CSV bo\'sh yoki noto\'g\'ri'); return }
    try {
      const r = await crmService.importLeads(rows)
      await dialog.alert(`Import tugadi: ${r.created} qo'shildi, ${r.skipped} o'tkazib yuborildi (dublikat/bo'sh)`)
      onDone && onDone()
    } catch (err) { await dialog.alert(err.message || 'Import xatosi') }
    e.target.value = ''
  }
  return (
    <>
      <button className="btn sm" onClick={() => ref.current?.click()} title="CSV import"><Icon name="download" size={14} style={{ transform: 'rotate(180deg)' }} />Import</button>
      <input ref={ref} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handle} />
    </>
  )
}
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const split = (line) => {
    const out = []; let cur = ''; let q = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c }
      else { if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = '' } else cur += c }
    }
    out.push(cur); return out
  }
  const head = split(lines[0]).map((h) => h.trim().toLowerCase())
  const map = { 'ism': 'name', 'name': 'name', 'telefon': 'phone', 'phone': 'phone', 'email': 'email', 'kompaniya': 'company', 'company': 'company', 'manba': 'source', 'source': 'source', 'byudjet': 'value', 'value': 'value' }
  return lines.slice(1).map((line) => {
    const cells = split(line)
    const obj = {}
    head.forEach((h, i) => { const k = map[h]; if (k) obj[k] = cells[i]?.trim() })
    return obj
  }).filter((o) => o.name)
}

// ── Ro'yxat (list) ko'rinishi + filtr + ommaviy amallar ──
function ListView({ filters, setFilters, members, stages, pipelineId, onOpen, onChanged }) {
  const [leads, setLeads] = useState(null)
  const [picked, setPicked] = useState(() => new Set())
  const [tags, setTags] = useState([])
  const [saved, setSaved] = useState([])

  const load = () => {
    crmService.listLeads({ ...clean(filters), pipelineId: pipelineId || undefined }).then((r) => { setLeads(r.leads || []); setPicked(new Set()) })
  }
  const loadSaved = () => crmService.listFilters().then((r) => setSaved(r.filters || [])).catch(() => {})
  useEffect(() => { crmService.listTags().then((r) => setTags(r.tags || [])).catch(() => {}); loadSaved() }, [])

  const saveFilter = async () => {
    const name = await dialog.prompt('Filtr nomi:', '')
    if (!name || !name.trim()) return
    try { await crmService.createFilter(name.trim(), clean(filters)); loadSaved() } catch (e) { await dialog.alert(e.message) }
  }
  const applyFilter = (sf) => setFilters({ search: '', source: '', assigneeId: '', tag: '', hot: '', ...(sf.paramsJson ? JSON.parse(sf.paramsJson) : {}) })
  const delFilter = async (sf) => { try { await crmService.deleteFilter(sf.id); loadSaved() } catch (e) { await dialog.alert(e.message) } }
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [filters, pipelineId])

  const toggle = (id) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allPicked = leads && leads.length > 0 && picked.size === leads.length
  const toggleAll = () => setPicked(allPicked ? new Set() : new Set((leads || []).map((l) => l.id)))

  const bulk = async (action, value) => {
    const ids = [...picked]; if (!ids.length) return
    try { const r = await crmService.bulk(ids, action, value); load(); onChanged && onChanged() }
    catch (e) { await dialog.alert(e.message || 'Xatolik') }
  }
  const bulkTag = async () => { const t = await dialog.prompt('Teg:', ''); if (t && t.trim()) bulk('add_tag', t.trim()) }
  const bulkDelete = async () => { if (await dialog.confirm(`${picked.size} ta lid o'chirilsinmi?`)) bulk('delete') }
  const merge = async () => {
    const ids = [...picked]
    if (ids.length < 2) return
    if (!await dialog.confirm(`${ids.length} ta lid bittaga birlashtirilsinmi? (birinchisi asosiy bo'ladi)`)) return
    try { await crmService.mergeLeads(ids[0], ids.slice(1)); await dialog.alert('Birlashtirildi'); load(); onChanged && onChanged() }
    catch (e) { await dialog.alert(e.message || 'Xatolik') }
  }

  return (
    <div>
      <FilterBar filters={filters} setFilters={setFilters} members={members} tags={tags} />
      <div className="fx ac gap8 mb16" style={{ flexWrap: 'wrap' }}>
        {saved.map((sf) => (
          <span key={sf.id} className="tag" style={{ cursor: 'pointer' }} onClick={() => applyFilter(sf)}>
            {sf.name}<button className="hr-x" style={{ marginLeft: 4 }} onClick={(e) => { e.stopPropagation(); delFilter(sf) }}>×</button>
          </span>
        ))}
        <button className="btn sm" onClick={saveFilter}><Icon name="plus" size={12} />Filtrni saqlash</button>
      </div>
      {picked.size > 0 && (
        <div className="fx ac gap8 mb16" style={{ background: 'var(--canvas)', padding: '8px 12px', borderRadius: 10, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 13 }}>{picked.size} ta tanlandi:</b>
          <select className="hr-select" style={{ width: 'auto' }} value="" onChange={(e) => { if (e.target.value) bulk('stage', e.target.value) }}>
            <option value="">Bosqichga ko'chirish…</option>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="hr-select" style={{ width: 'auto' }} value="" onChange={(e) => { if (e.target.value) bulk('assignee', e.target.value === 'none' ? '' : e.target.value) }}>
            <option value="">Mas'ul belgilash…</option>
            <option value="none">— olib tashlash —</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button className="btn sm" onClick={bulkTag}>+ Teg</button>
          <button className="btn sm" onClick={() => bulk('hot', true)}>🔥 Issiq</button>
          {picked.size >= 2 && <button className="btn sm" onClick={merge}>Birlashtirish</button>}
          <button className="btn sm" onClick={bulkDelete} style={{ color: 'var(--dang)' }}>O'chirish</button>
          <button className="btn sm" onClick={() => setPicked(new Set())}>Bekor</button>
        </div>
      )}
      {leads === null ? <Loading /> : (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--mut)', fontSize: 12, borderBottom: '1px solid var(--bd)' }}>
                <th style={{ padding: '10px 12px', width: 32 }}><input type="checkbox" checked={allPicked} onChange={toggleAll} /></th>
                <th style={{ padding: '10px 12px' }}>Mijoz</th><th>Telefon</th><th>Bosqich</th><th>Manba</th><th>Mas'ul</th><th>Byudjet</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 && <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--mut)' }}>Lid topilmadi</td></tr>}
              {leads.map((l) => (
                <tr key={l.id} style={{ borderBottom: '1px solid var(--bd)', cursor: 'pointer' }}>
                  <td style={{ padding: '8px 12px' }} onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={picked.has(l.id)} onChange={() => toggle(l.id)} /></td>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }} onClick={() => onOpen(l.id)}>
                    {l.hot && '🔥 '}{l.n}
                    {(l.tags || []).slice(0, 2).map((t) => <span className="tag" key={t} style={{ marginLeft: 6 }}>{t}</span>)}
                  </td>
                  <td className="amo-phone-cell" onClick={() => onOpen(l.id)}>
                    {l.phone ? (
                      <span className="amo-phone-wrap">
                        <span className="amo-phone-num">{l.phone}</span>
                        <span className="amo-phone-inline" onClick={(e) => e.stopPropagation()}>
                          <PhoneActions phone={l.phone} leadId={l.id} canCall compact />
                        </span>
                      </span>
                    ) : '—'}
                  </td>
                  <td onClick={() => onOpen(l.id)}><span className="tag">{l.stageName || l.stage}</span></td>
                  <td onClick={() => onOpen(l.id)}>{l.source || '—'}</td>
                  <td onClick={() => onOpen(l.id)}>{l.assigneeName || '—'}</td>
                  <td className="num" onClick={() => onOpen(l.id)} style={{ fontWeight: 700 }}>{fmtSum(l.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function FilterBar({ filters, setFilters, members, tags }) {
  const set = (k, v) => setFilters((p) => ({ ...p, [k]: v }))
  return (
    <div className="fx ac gap8 mb16" style={{ flexWrap: 'wrap' }}>
      <div className="fx ac gap8" style={{ flex: 1, minWidth: 200, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 10, padding: '6px 10px' }}>
        <Icon name="search" size={15} />
        <input style={{ border: 'none', background: 'none', outline: 'none', flex: 1, color: 'var(--ink)' }} placeholder="Ism, telefon, email…" value={filters.search} onChange={(e) => set('search', e.target.value)} />
      </div>
      <select className="hr-select" style={{ width: 'auto' }} value={filters.source} onChange={(e) => set('source', e.target.value)}>
        <option value="">Barcha manba</option>{SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select className="hr-select" style={{ width: 'auto' }} value={filters.assigneeId} onChange={(e) => set('assigneeId', e.target.value)}>
        <option value="">Barcha mas'ul</option><option value="none">Biriktirilmagan</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      {tags.length > 0 && (
        <select className="hr-select" style={{ width: 'auto' }} value={filters.tag} onChange={(e) => set('tag', e.target.value)}>
          <option value="">Barcha teg</option>{tags.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
        </select>
      )}
      <button className={`btn sm ${filters.hot === 'true' ? 'primary' : ''}`} onClick={() => set('hot', filters.hot === 'true' ? '' : 'true')}>🔥 Issiq</button>
    </div>
  )
}
function clean(o) { const r = {}; Object.entries(o).forEach(([k, v]) => { if (v) r[k] = v }); return r }

// ── Zadachalar bo'limi (barcha vazifalar) ──
function TasksView({ onOpenLead }) {
  const [tasks, setTasks] = useState(null)
  const load = () => crmService.listTasks().then((r) => setTasks(r.tasks || []))
  useEffect(() => { load() }, [])

  const toggle = async (t) => {
    setTasks((ts) => ts.map((x) => x.id === t.id ? { ...x, done: !x.done } : x))
    try { await crmService.updateTask(t.id, { done: !t.done }) } catch { load() }
  }
  const remove = async (t) => {
    if (!await dialog.confirm('Vazifa o\'chirilsinmi?')) return
    setTasks((ts) => ts.filter((x) => x.id !== t.id))
    try { await crmService.deleteTask(t.id) } catch { load() }
  }

  if (tasks === null) return <Loading />

  const today = new Date().toISOString().slice(0, 10)
  const open = tasks.filter((t) => !t.done)
  const groups = [
    { key: 'overdue', title: 'Muddati o\'tgan', color: 'var(--dang)', items: open.filter((t) => t.dueDate && t.dueDate.slice(0, 10) < today) },
    { key: 'today', title: 'Bugun', color: 'var(--warn)', items: open.filter((t) => t.dueDate && t.dueDate.slice(0, 10) === today) },
    { key: 'upcoming', title: 'Keyingi', color: 'var(--info)', items: open.filter((t) => !t.dueDate || t.dueDate.slice(0, 10) > today) },
    { key: 'done', title: 'Bajarilgan', color: 'var(--ok)', items: tasks.filter((t) => t.done) },
  ]

  const Row = (t) => (
    <div className="cl-row" key={t.id} style={{ cursor: 'default', alignItems: 'center' }}>
      <input type="checkbox" checked={t.done} onChange={() => toggle(t)} style={{ width: 18, height: 18, flex: 'none' }} />
      <span style={{ fontSize: 18, flex: 'none' }}>{(TYPE_META[t.type] || TYPE_META.task).e}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--mut)' : 'var(--ink)' }}>{t.title}</div>
        <div className="sub2" style={{ fontSize: 12 }}>
          <a onClick={() => onOpenLead(t.leadId)} style={{ color: 'var(--info)', cursor: 'pointer', fontWeight: 600 }}>{t.leadName || 'lid'}</a>
          {t.assigneeName ? ` · ${t.assigneeName}` : ''}{t.dueDate ? ` · ${t.dueDate.slice(0, 10)}` : ''}
        </div>
      </div>
      <button className="hr-x" onClick={() => remove(t)} title="O'chirish">×</button>
    </div>
  )

  return (
    <div style={{ maxWidth: 720 }}>
      {open.length === 0 && tasks.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--mut)' }}>Hali vazifa yo'q. Lid kartochkasidan vazifa qo'shing.</div>}
      {groups.map((g) => g.items.length > 0 && (
        <div key={g.key} style={{ marginBottom: 18 }}>
          <div className="fx ac gap8" style={{ marginBottom: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: g.color }} />
            <b style={{ fontSize: 13.5 }}>{g.title}</b>
            <span className="kcnt">{g.items.length}</span>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>{g.items.map(Row)}</div>
        </div>
      ))}
    </div>
  )
}

function AddStageInline({ onAdd, onCancel }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(STAGE_COLORS[0])
  const [kind, setKind] = useState('open')
  return (
    <div className="kcol" style={{ alignSelf: 'flex-start' }}>
      <input className="hr-input" autoFocus value={name} placeholder="Bosqich nomi…"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onAdd(name, color, kind); if (e.key === 'Escape') onCancel() }} />
      <div className="fx ac gap8" style={{ margin: '8px 0', flexWrap: 'wrap' }}>
        {STAGE_COLORS.map((c) => (
          <button key={c} onClick={() => setColor(c)} title={c}
            style={{ width: 24, height: 24, borderRadius: 6, background: c, cursor: 'pointer',
              border: color === c ? '2px solid var(--ink)' : '2px solid transparent', outline: color === c ? '2px solid #fff' : 'none', outlineOffset: -3 }} />
        ))}
      </div>
      <select className="hr-select" value={kind} onChange={(e) => setKind(e.target.value)} style={{ marginBottom: 8 }}>
        <option value="open">Oddiy bosqich</option>
        <option value="won">Yutilgan (sotuv)</option>
        <option value="lost">Yo'qotilgan</option>
      </select>
      <div className="fx ac gap8">
        <button className="btn primary sm f1" onClick={() => onAdd(name, color, kind)}>Qo'shish</button>
        <button className="btn sm" onClick={onCancel}>×</button>
      </div>
    </div>
  )
}

function StageEditInline({ stage, onSave, onCancel }) {
  const [name, setName] = useState(stage.name)
  const [color, setColor] = useState(stage.color)
  const [kind, setKind] = useState(stage.kind || 'open')
  return (
    <div style={{ padding: 4 }}>
      <input className="hr-input" autoFocus value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSave({ name: name.trim(), color, kind }); if (e.key === 'Escape') onCancel() }} />
      <div className="fx ac gap8" style={{ margin: '8px 0', flexWrap: 'wrap' }}>
        {STAGE_COLORS.map((c) => (
          <button key={c} onClick={() => setColor(c)} title={c}
            style={{ width: 22, height: 22, borderRadius: 6, background: c, cursor: 'pointer', border: color === c ? '2px solid var(--ink)' : '2px solid transparent', outline: color === c ? '2px solid #fff' : 'none', outlineOffset: -3 }} />
        ))}
      </div>
      <select className="hr-select" value={kind} onChange={(e) => setKind(e.target.value)} style={{ marginBottom: 8 }}>
        <option value="open">Oddiy</option>
        <option value="won">Yutilgan</option>
        <option value="lost">Yo'qotilgan</option>
      </select>
      <div className="fx ac gap8">
        <button className="btn primary sm f1" onClick={() => onSave({ name: name.trim(), color, kind })}>Saqlash</button>
        <button className="btn sm" onClick={onCancel}>×</button>
      </div>
    </div>
  )
}

function recomputeSums(stages) {
  return stages.map((s) => ({ ...s, sum: fmtSum(s.leads.reduce((a, l) => a + (l.value || 0), 0)) }))
}
function reseat(stages, lead) {
  const cur = stages.find((s) => s.leads.some((l) => l.id === lead.id))
  if (!cur || cur.id === lead.stage) return stages
  return stages.map((s) => {
    if (s.id === cur.id) return { ...s, leads: s.leads.filter((l) => l.id !== lead.id) }
    if (s.id === lead.stage) return { ...s, leads: [...s.leads, lead] }
    return s
  })
}

function LeadDrawer({ initial, stages, members, fields = [], contactFields = [], companyFields = [], lostReasons = [], pipelines = [], pipelineId, defaultStage, canSettings, onFieldsChanged, onClose, onSave, onDelete }) {
  const isNew = !initial
  const [f, setF] = useState(() => ({
    name: initial?.n || '',
    phone: initial?.phone || '',
    email: initial?.email || '',
    company: initial?.company || '',
    source: initial?.source || '',
    value: initial?.value || 0,
    assigneeId: initial?.assigneeId || '',
    tags: (initial?.tags || []).join(', '),
    hot: !!initial?.hot,
    nextTask: initial?.nextTask || '',
    nextTaskDate: initial?.nextTaskDate ? initial.nextTaskDate.slice(0, 10) : '',
    stage: initial?.stage || defaultStage || (stages[0]?.id || 'new'),
    pipelineId: initial?.pipelineId || pipelineId || '',
    lostReason: initial?.lostReason || '',
    custom: initial?.custom || {},
    items: initial?.items || [],
    companyId: initial?.companyId || '',
  }))
  const [products, setProducts] = useState([])
  const [companies, setCompanies] = useState([])
  const [notes, setNotes] = useState([])
  const [activity, setActivity] = useState([])
  const [newNote, setNewNote] = useState('')
  const [tasks, setTasks] = useState([])
  const [nt, setNt] = useState({ title: '', type: 'call', dueDate: atTimeDT(0, 18) })
  const [calls, setCalls] = useState([])
  const [chat, setChat] = useState({ messages: [], canReply: false, telegramLinked: false })
  const [chatText, setChatText] = useState('')
  const [calling, setCalling] = useState(false)
  const [syncingCalls, setSyncingCalls] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [leftTab, setLeftTab] = useState('main') // main | stats
  const [composerTab, setComposerTab] = useState('note') // note | task | chat
  const [editTask, setEditTask] = useState(null) // kartochkada vazifani tahrirlash (TaskModal)
  const [completingTask, setCompletingTask] = useState(null) // natija oynasi
  const feedRef = useRef(null)
  useEffect(() => { const el = feedRef.current; if (el) el.scrollTop = el.scrollHeight }, [activity.length, calls.length])
  const reloadTasksAndFeed = () => {
    if (!initial?.id) return
    crmService.listLeadTasks(initial.id).then((r) => setTasks(r.tasks || [])).catch(() => {})
    crmService.getLead(initial.id).then((x) => setActivity(x.lead?.activity || [])).catch(() => {})
  }
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const setCustom = (k, v) => setF((p) => ({ ...p, custom: { ...p.custom, [k]: v } }))

  useEffect(() => {
    if (initial?.id) {
      crmService.getLead(initial.id).then((r) => { setNotes(r.lead?.notes || []); setActivity(r.lead?.activity || []) }).catch(() => {})
      crmService.listLeadTasks(initial.id).then((r) => setTasks(r.tasks || [])).catch(() => {})
      crmService.leadCalls(initial.id).then((r) => setCalls(r.calls || [])).catch(() => {})
      crmService.leadMessages(initial.id).then((r) => setChat(r)).catch(() => {})
    }
  }, [initial?.id])

  // Qo'ng'iroq/yozuvlarni har 3 soniyada avto-yangilaydi — gaplashib bo'lgach yozuv
  // deyarli darhol (~3-5s) ko'rinishi uchun (backend OnlinePBX tarixidan tortadi).
  useEffect(() => {
    if (!initial?.id) return
    const iv = setInterval(() => {
      crmService.leadCalls(initial.id).then((r) => setCalls(r.calls || [])).catch(() => {})
    }, 3000)
    return () => clearInterval(iv)
  }, [initial?.id])

  const sendChat = async () => {
    if (!chatText.trim() || !initial?.id) return
    const t = chatText.trim(); setChatText('')
    try {
      const r = await crmService.sendMessage(initial.id, t)
      setChat((c) => ({ ...c, messages: [...c.messages, r.message] }))
    } catch (e) { setMsg(e.message || 'Xabar yuborilmadi'); setChatText(t) }
  }

  useEffect(() => {
    crmService.listProducts().then((r) => setProducts(r.products || [])).catch(() => {})
    crmService.listCompanies().then((r) => setCompanies(r.companies || [])).catch(() => {})
  }, [])

  const itemsTotal = (f.items || []).reduce((a, it) => a + (Number(it.price) || 0) * (Number(it.qty) || 1), 0)
  const addItem = (pid) => {
    const p = products.find((x) => x.id === pid); if (!p) return
    setF((s) => ({ ...s, items: [...(s.items || []), { productId: p.id, name: p.name, price: p.price, qty: 1 }] }))
  }
  const setItemQty = (i, qty) => setF((s) => ({ ...s, items: s.items.map((x, j) => j === i ? { ...x, qty: Math.max(1, Number(qty) || 1) } : x) }))
  const rmItem = (i) => setF((s) => ({ ...s, items: s.items.filter((_, j) => j !== i) }))

  const isLostStage = stages.find((s) => s.id === f.stage)?.kind === 'lost'

  const call = async () => {
    if (isNew || !initial?.id) { setMsg('Avval lidni saqlang'); return }
    if (!f.phone) { setMsg('Telefon raqami yo\'q'); return }
    setCalling(true); setMsg(null)
    try {
      if (webrtcPhone.isOn()) {
        webrtcPhone.call((f.phone || '').replace(/[^\d+*#]/g, ''))
        crmService.softLogCall({ leadId: initial.id }).catch(() => {})
        setMsg('📞 Qo\'ng\'iroq boshlandi…')
        setTimeout(() => setMsg((m) => (m && m.includes('boshlandi') ? null : m)), 4000)
      } else {
        const mode = await crmService.loadPbxMode()
        if (mode.callMode === 'softphone') {
          dialSoftphone(mode.dialScheme, f.phone)
          crmService.softLogCall({ leadId: initial.id }).catch(() => {})
          setMsg('📞 MicroSIP orqali terilyapti…')
          setTimeout(() => setMsg((m) => (m && m.includes('terilyapti') ? null : m)), 4000)
        } else {
          await crmService.callLead(initial.id)
          setMsg('📞 Qo\'ng\'iroq boshlandi — ichki raqamingiz jiringlaydi')
          setTimeout(() => setMsg((m) => (m && m.includes('jiringlaydi') ? null : m)), 4000)
        }
        window.dispatchEvent(new CustomEvent('pbx:outgoing', { detail: { phone: f.phone, name: f.name || null } }))
      }
      setTimeout(() => crmService.leadCalls(initial.id).then((r) => setCalls(r.calls || [])).catch(() => {}), 1500)
    } catch (e) {
      if (e?.data?.error === 'NO_EXTENSION') {
        const ext = await dialog.prompt('Ichki raqamingizni kiriting (OnlinePBX extension):')
        if (ext && ext.trim()) { try { await crmService.setMyExtension(ext.trim()); setMsg('Ichki raqam saqlandi. Qaytadan "Qo\'ng\'iroq" bosing.') } catch (e2) { setMsg(e2.message) } }
      } else setMsg(e.message || 'Qo\'ng\'iroq qilib bo\'lmadi')
    } finally { setCalling(false) }
  }

  // OnlinePBX tarixidan qo'ng'iroq/yozuvlarni tortib olish (webhook ishlamasa ham)
  const syncCalls = async () => {
    if (!initial?.id) return
    setSyncingCalls(true)
    try {
      const res = await crmService.syncCalls()
      const r = await crmService.leadCalls(initial.id); setCalls(r.calls || [])
      if (res && res.ok === false) setMsg('Yozuvlarni olishда xatolik')
      else { setMsg('Yozuvlar yangilandi'); setTimeout(() => setMsg((m) => (m === 'Yozuvlar yangilandi' ? null : m)), 3000) }
    } catch (e) { setMsg(e.message || 'Sinxronlab bo\'lmadi') }
    finally { setSyncingCalls(false) }
  }

  const addTask = async () => {
    if (!nt.title.trim() || !initial?.id) return
    try {
      const r = await crmService.createTask(initial.id, { title: nt.title.trim(), type: nt.type, dueDate: nt.dueDate ? new Date(nt.dueDate).toISOString() : undefined })
      setTasks((ts) => [...ts, r.task]); setNt({ title: '', type: 'call', dueDate: atTimeDT(0, 18) })
    } catch (e) { setMsg(e.message) }
  }
  // amoCRM: bajarishda natija MAJBURIY — natija oynasi ochiladi
  const toggleTask = (t) => { if (!t.done) setCompletingTask(t) }
  const doComplete = async (t, result) => {
    setCompletingTask(null)
    setTasks((ts) => ts.map((x) => x.id === t.id ? { ...x, done: true, result } : x))
    try { await crmService.updateTask(t.id, { done: true, result }); crmService.getLead(initial.id).then((x) => setActivity(x.lead?.activity || [])).catch(() => {}) } catch (e) { setMsg(e.message) }
  }
  const removeTask = async (t) => {
    setTasks((ts) => ts.filter((x) => x.id !== t.id))
    try { await crmService.deleteTask(t.id) } catch (e) { setMsg(e.message) }
  }

  const payload = () => ({
    name: f.name.trim(),
    phone: f.phone || undefined,
    email: f.email || undefined,
    company: f.company || undefined,
    source: f.source || undefined,
    value: (f.items && f.items.length) ? itemsTotal : (Number(f.value) || 0),
    items: f.items || [],
    companyId: f.companyId || undefined,
    assigneeId: f.assigneeId || '',
    tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
    hot: f.hot,
    nextTask: f.nextTask || '',
    nextTaskDate: f.nextTaskDate || '',
    stage: f.stage,
    pipelineId: f.pipelineId || undefined,
    lostReason: isLostStage ? (f.lostReason || '') : undefined,
    custom: f.custom || {},
  })

  const save = async () => {
    if (!f.name.trim()) { setMsg('Ism majburiy'); return }
    // Yangi lid: telefon/email bo'yicha dublikat tekshiruvi
    if (isNew && (f.phone || f.email)) {
      try {
        const r = await crmService.checkDuplicate(f.phone, f.email, initial?.id)
        if (r.duplicates?.length) {
          const ok = await dialog.confirm(`Shu raqam/email bilan lid bor: ${r.duplicates.map((d) => d.name).join(', ')}.\nBaribir yangi lid yaratilsinmi?`)
          if (!ok) return
        }
      } catch { /* tekshiruv xatosi saqlashni to'xtatmaydi */ }
    }
    setSaving(true); setMsg(null)
    try { await onSave(payload(), initial?.id); onClose() }
    catch (e) { setMsg(e.message || 'Saqlashda xatolik'); setSaving(false) }
  }
  const remove = async () => {
    if (!initial || !await dialog.confirm(`"${initial.n}" o'chirilsinmi?`)) return
    setSaving(true)
    try { await onDelete() } catch (e) { setMsg(e.message); setSaving(false) }
  }
  const addNote = async () => {
    if (!newNote.trim() || !initial?.id) return
    try { const r = await crmService.addNote(initial.id, newNote.trim()); setNotes(r.notes || []); setNewNote(''); crmService.getLead(initial.id).then((x) => setActivity(x.lead?.activity || [])).catch(() => {}) } catch (e) { setMsg(e.message) }
  }

  const stageObj = stages.find((s) => s.id === f.stage)
  // Birlashgan lenta: faoliyat + qo'ng'iroqlar (xronologik, eng yangisi tepada)
  const feed = [
    ...activity.map((a) => ({ kind: 'act', at: a.at, id: 'a' + a.id, type: a.type, text: a.text, actorName: a.actorName })),
    ...calls.map((c) => ({ kind: 'call', at: c.startedAt, id: 'c' + c.id, rawId: c.id, dir: c.direction, status: c.status, dur: c.durationSec, hasRec: c.hasRecording ?? !!(c.recordUrl || c.externalId) })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at)) // A-Z: eng yangisi pastda
  const openTasks = tasks.filter((t) => !t.done)
  const aName = f.assigneeId ? (members.find((m) => m.id === f.assigneeId) || {}).name : null
  // amoCRM uslubi: faqat faol maydonlar; guruhlanganlar alohida bo'lim bo'lib chiqadi
  const activeLead = (fields || []).filter((x) => x.active !== false)
  const ungroupedLead = activeLead.filter((x) => !x.group)
  const leadGroupList = Object.entries(
    activeLead.filter((x) => x.group).reduce((m, x) => { (m[x.group] = m[x.group] || []).push(x); return m }, {}),
  ).map(([name, items]) => ({ name, items }))
  const activeContact = (contactFields || []).filter((x) => x.active !== false)
  const activeCompany = (companyFields || []).filter((x) => x.active !== false)

  return (
    <div className="hr-overlay amo-cardov" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`amo-card ${isNew ? 'isnew' : ''}`}>
        {/* Yuqori panel */}
        <div className="amo-card-top">
          <Avatar ini={(f.name || '?').slice(0, 1).toUpperCase()} color={initial?.c || '#2A9AF3'} size={34} />
          <div className="f1" style={{ minWidth: 0 }}>
            <input className="amo-card-name" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Lid nomi" />
            <div className="sub2" style={{ fontSize: 12 }}>{fmtSum(f.value)} so'm{aName ? ` · ${aName}` : ''}</div>
          </div>
          {!isNew && f.phone && (
            <button className="btn sm primary" disabled={calling} onClick={call} title="OnlinePBX orqali qo'ng'iroq"><Icon name="play" size={13} />{calling ? '...' : 'Qo\'ng\'iroq'}</button>
          )}
          {!isNew && (
            <button className="btn sm" disabled={syncingCalls} onClick={syncCalls} title="Qo'ng'iroq yozuvlarini OnlinePBX'dan yangilash">{syncingCalls ? '...' : '↻ Yozuvlar'}</button>
          )}
          <button className="hr-x" onClick={onClose}>×</button>
        </div>

        {/* Status bar — bosqichlar */}
        <div className="amo-statusbar">
          {stages.map((st) => {
            const active = f.stage === st.id
            return (
              <button key={st.id} className={`amo-stage ${active ? 'on' : ''}`} title={st.name}
                style={active ? { background: st.color, color: '#fff' } : undefined}
                onClick={() => { set('stage', st.id); if (stageObj?.kind === 'lost' && st.kind !== 'lost') set('lostReason', '') }}>
                <span className="amo-stage-nm">{st.name}</span>
              </button>
            )
          })}
        </div>

        {msg && <div className="amo-card-msg">{msg}</div>}

        <div className="amo-card-body">
          {/* ===== CHAP: ma'lumot ===== */}
          <div className="amo-card-left">
            <div className="amo-subtabs" style={{ marginBottom: 14 }}>
              <button className={`amo-tab ${leftTab === 'main' ? 'on' : ''}`} onClick={() => setLeftTab('main')}>Asosiy</button>
              {!isNew && <button className={`amo-tab ${leftTab === 'stats' ? 'on' : ''}`} onClick={() => setLeftTab('stats')}>Statistika</button>}
              {canSettings && <button className={`amo-tab ${leftTab === 'setup' ? 'on' : ''}`} onClick={() => setLeftTab('setup')}>Sozlash</button>}
            </div>

            {leftTab === 'setup' ? (
              <CardFieldSetup onChanged={onFieldsChanged} />
            ) : leftTab === 'stats' ? (
              <div className="hr-sec">
                <div className="amo-stat-row"><span>Yaratilgan</span><b>{initial?.createdAt ? fmtDate(initial.createdAt) : '—'}</b></div>
                <div className="amo-stat-row"><span>Faoliyat yozuvlari</span><b>{feed.length}</b></div>
                <div className="amo-stat-row"><span>Vazifalar (ochiq / jami)</span><b>{openTasks.length} / {tasks.length}</b></div>
                <div className="amo-stat-row"><span>Qo'ng'iroqlar</span><b>{calls.length}</b></div>
                <div className="amo-stat-row"><span>Telegram xabarlar</span><b>{chat.messages.length}</b></div>
                <div className="amo-stat-row"><span>Manba</span><b>{f.source || '—'}</b></div>
              </div>
            ) : (
              <>
                {/* ===== BITIM (Sdelka) ===== amoCRM tartibi: mas'ul → byudjet → voronka → manba → teg ===== */}
                <div className="hr-sec">
                  <h4>Bitim (sdelka)</h4>
                  <div className="hr-grid2">
                    <div className="hr-field"><label>Mas'ul sotuvchi</label>
                      <select className="hr-select" value={f.assigneeId} onChange={(e) => set('assigneeId', e.target.value)}>
                        <option value="">— yo'q —</option>
                        {(members || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div className="hr-field"><label>Byudjet (so'm)</label><input className="hr-input" type="number" value={f.value} onChange={(e) => set('value', e.target.value)} placeholder="0" /></div>
                    {pipelines.length > 0 && (
                      <div className="hr-field"><label>Voronka</label>
                        <select className="hr-select" value={f.pipelineId} onChange={(e) => set('pipelineId', e.target.value)}>
                          <option value="">Standart</option>{pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                    )}
                    <div className="hr-field"><label>Manba</label>
                      <select className="hr-select" value={f.source} onChange={(e) => set('source', e.target.value)}>
                        <option value="">— tanlang —</option>
                        {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  {isLostStage && (
                    <div className="hr-field"><label>Yo'qotish sababi</label>
                      <select className="hr-select" value={f.lostReason} onChange={(e) => set('lostReason', e.target.value)}>
                        <option value="">— tanlang —</option>
                        {lostReasons.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="hr-field"><label>Teglar (vergul bilan)</label><input className="hr-input" value={f.tags} onChange={(e) => set('tags', e.target.value)} placeholder="issiq, vip" /></div>
                  <label className="apply-opt"><input type="checkbox" checked={f.hot} onChange={(e) => set('hot', e.target.checked)} /> 🔥 Issiq lid</label>
                  {ungroupedLead.length > 0 && (
                    <div className="hr-grid2" style={{ marginTop: 4 }}>
                      {ungroupedLead.map((fd) => <CustomField key={fd.id} field={fd} value={f.custom?.[fd.key]} onChange={(v) => setCustom(fd.key, v)} />)}
                    </div>
                  )}
                </div>

                {/* ===== Maxsus guruhlar — amoCRM uslubidagi qo'shimcha bo'limlar ===== */}
                {leadGroupList.map((g) => (
                  <div className="hr-sec" key={g.name}>
                    <h4>{g.name}</h4>
                    <div className="hr-grid2">
                      {g.items.map((fd) => <CustomField key={fd.id} field={fd} value={f.custom?.[fd.key]} onChange={(v) => setCustom(fd.key, v)} />)}
                    </div>
                  </div>
                ))}

                {products.length > 0 && (
                  <div className="hr-sec">
                    <h4>Mahsulotlar / kurslar</h4>
                    {(f.items || []).length === 0 && <div className="sub2" style={{ fontSize: 12, marginBottom: 8 }}>Mahsulot qo'shilmagan — byudjet qo'lda</div>}
                    {(f.items || []).map((it, i) => (
                      <div className="fx ac gap8" key={i} style={{ marginBottom: 6 }}>
                        <span style={{ flex: 1, fontSize: 13 }}>{it.name}</span>
                        <input className="hr-input" style={{ width: 60, flex: 'none' }} type="number" min={1} value={it.qty} onChange={(e) => setItemQty(i, e.target.value)} />
                        <span className="num" style={{ width: 84, textAlign: 'right', fontSize: 12.5 }}>{fmtSum((Number(it.price) || 0) * (Number(it.qty) || 1))}</span>
                        <button className="hr-x" onClick={() => rmItem(i)}>×</button>
                      </div>
                    ))}
                    <div className="fx ac gap8" style={{ marginTop: 8 }}>
                      <select className="hr-select" style={{ flex: 1 }} value="" onChange={(e) => { if (e.target.value) addItem(e.target.value) }}>
                        <option value="">+ Mahsulot…</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {fmtSum(p.price)}</option>)}
                      </select>
                      {(f.items || []).length > 0 && <b style={{ fontSize: 13 }}>{fmtSum(itemsTotal)}</b>}
                    </div>
                  </div>
                )}

                {/* ===== KONTAKT ===== amoCRM: telefon/email kontaktга tegishli ===== */}
                <div className="hr-sec">
                  <h4>Kontakt</h4>
                  <div className="hr-grid2">
                    <div className="hr-field"><label>Telefon</label>
                      <input className="hr-input" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+998..." />
                      {f.phone && <PhoneActions phone={f.phone} canCall={!isNew} onCall={call} calling={calling} />}
                    </div>
                    <div className="hr-field"><label>Email</label><input className="hr-input" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="mijoz@example.com" /></div>
                  </div>
                  {activeContact.length > 0 && (
                    <div className="hr-grid2">
                      {activeContact.map((fd) => <CustomField key={fd.id} field={fd} value={f.custom?.[`contact:${fd.key}`]} onChange={(v) => setCustom(`contact:${fd.key}`, v)} />)}
                    </div>
                  )}
                </div>

                {/* ===== KOMPANIYA ===== */}
                <div className="hr-sec">
                  <h4>Kompaniya</h4>
                  <div className="hr-grid2">
                    <div className="hr-field"><label>Nomi</label><input className="hr-input" value={f.company} onChange={(e) => set('company', e.target.value)} /></div>
                    {companies.length > 0 && (
                      <div className="hr-field"><label>Bog'langan kompaniya</label>
                        <select className="hr-select" value={f.companyId} onChange={(e) => set('companyId', e.target.value)}>
                          <option value="">— yo'q —</option>
                          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                  {activeCompany.length > 0 && (
                    <div className="hr-grid2">
                      {activeCompany.map((fd) => <CustomField key={fd.id} field={fd} value={f.custom?.[`company:${fd.key}`]} onChange={(v) => setCustom(`company:${fd.key}`, v)} />)}
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="amo-card-actions">
              <button className="btn primary f1" disabled={saving} onClick={save}>{saving ? 'Saqlanmoqda…' : 'Saqlash'}</button>
              {!isNew && <button className="btn" onClick={remove} disabled={saving} style={{ color: 'var(--dang)' }}>O'chirish</button>}
            </div>
          </div>

          {/* ===== O'NG: faoliyat lentasi (tepada) + kompozitor (pastda) ===== */}
          {!isNew ? (
            <div className="amo-card-right">
              <div className="amo-feed-scroll" ref={feedRef}>
                <div className="amo-feed">
                  {feed.length === 0 && <div className="sub2" style={{ fontSize: 13, padding: '8px 0' }}>Hali faoliyat yo'q</div>}
                  {feed.map((it) => {
                    // Izoh (komment) — ajralib turadi
                    if (it.kind === 'act' && it.type === 'note') {
                      return (
                        <div key={it.id} className="amo-note">
                          <div className="amo-note-h">💬 {it.actorName || '—'} · {fmtDate(it.at)}</div>
                          <div className="amo-note-b">{it.text}</div>
                        </div>
                      )
                    }
                    // Qo'ng'iroq — minimal qator + OnlinePBX audio yozuvi (mavjud bo'lsa)
                    if (it.kind === 'call') {
                      const missed = it.status === 'missed'
                      const stLabel = missed ? "o'tkazib yuborilgan" : it.status === 'failed' ? 'ulanmadi' : it.status === 'completed' ? 'javob berildi' : it.status
                      return (
                        <div key={it.id} className="amo-callrow">
                          <div className="amo-log">
                            <span className="amo-log-ic">{missed ? '📵' : it.dir === 'in' ? '📥' : '📤'}</span>
                            <span className="amo-log-tx">
                              {it.dir === 'in' ? 'Kiruvchi' : 'Chiquvchi'} qo'ng'iroq · <span style={missed ? { color: 'var(--dang)', fontWeight: 700 } : undefined}>{stLabel}</span>{it.dur ? ` · ${it.dur}s` : ''}
                            </span>
                            <span className="amo-log-dt">{fmtDate(it.at)}</span>
                          </div>
                          {it.hasRec && <CallRecording callId={it.rawId} seconds={it.dur} />}
                        </div>
                      )
                    }
                    // Log (tizim hodisasi) — minimal
                    return (
                      <div key={it.id} className="amo-log">
                        <span className="amo-log-ic">{ACT_ICON[it.type] || '•'}</span>
                        <span className="amo-log-tx">{it.text || it.type}</span>
                        <span className="amo-log-dt">{fmtDate(it.at)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Ochiq vazifa — kompozitorga yopishib turadi (amoCRM kabi) */}
              {openTasks.length > 0 && (
                <div className="amo-pinned-tasks">
                  {openTasks.map((t) => {
                    const od = t.dueDate && new Date(t.dueDate) < new Date()
                    const td = t.dueDate && t.dueDate.slice(0, 10) === new Date().toISOString().slice(0, 10)
                    return (
                      <div className="fx ac gap8" key={t.id} style={{ padding: '4px 0' }}>
                        <input type="checkbox" checked={t.done} onChange={() => toggleTask(t)} style={{ width: 17, height: 17, flex: 'none' }} />
                        <span style={{ fontSize: 16, flex: 'none' }}>{(TYPE_META[t.type] || TYPE_META.task).e}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5 }}>{t.title}</div>
                          {t.dueDate && <div style={{ fontSize: 12, fontWeight: 600, color: od ? 'var(--dang)' : td ? 'var(--warn)' : 'var(--amo-mut,#8a8a8a)' }}>{od ? 'Muddati o\'tgan · ' : td ? 'Bugun · ' : ''}{fmtDate(t.dueDate)}</div>}
                        </div>
                        <button className="kcolbtn" style={{ color: 'var(--amo-mut,#8a8a8a)' }} title="Tahrirlash" onClick={() => setEditTask(t)}><Icon name="edit" size={13} /></button>
                        <button className="hr-x" onClick={() => removeTask(t)}>×</button>
                      </div>
                    )
                  })}
                </div>
              )}
              {editTask && <TaskModal initial={editTask} members={members} onClose={() => setEditTask(null)} onSaved={() => { setEditTask(null); reloadTasksAndFeed() }} />}
              {completingTask && <ResultModal task={completingTask} onClose={() => setCompletingTask(null)} onDone={(res) => doComplete(completingTask, res)} />}

              {/* Kompozitor — pastda (amoCRM kabi) */}
              <div className="amo-composer">
                <div className="amo-comp-tabs">
                  <button className={composerTab === 'note' ? 'on' : ''} onClick={() => setComposerTab('note')}>💬 Izoh</button>
                  <button className={composerTab === 'task' ? 'on' : ''} onClick={() => setComposerTab('task')}>📋 Vazifa</button>
                  {(chat.telegramLinked || chat.canReply) && <button className={composerTab === 'chat' ? 'on' : ''} onClick={() => setComposerTab('chat')}>✈️ Telegram</button>}
                </div>
                {composerTab === 'note' && (
                  <div className="fx ac gap8">
                    <input className="hr-input" value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Izoh yozing..." onKeyDown={(e) => e.key === 'Enter' && addNote()} />
                    <button className="btn sm primary" onClick={addNote}>Qo'shish</button>
                  </div>
                )}
                {composerTab === 'task' && (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div className="fx ac gap8">
                      <select className="hr-select" style={{ width: 120, flex: 'none' }} value={nt.type} onChange={(e) => setNt((p) => ({ ...p, type: e.target.value }))}>
                        {TASK_TYPES.map((t) => <option key={t.v} value={t.v}>{t.e} {t.l}</option>)}
                      </select>
                      <input className="hr-input" style={{ flex: 1, minWidth: 100 }} value={nt.title} placeholder="Vazifa..." onChange={(e) => setNt((p) => ({ ...p, title: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && addTask()} />
                    </div>
                    <div className="fx ac gap8" style={{ flexWrap: 'wrap' }}>
                      <input className="hr-input" style={{ width: 190, flex: 'none' }} type="datetime-local" value={nt.dueDate} onChange={(e) => setNt((p) => ({ ...p, dueDate: e.target.value }))} />
                      <button className="btn sm" onClick={() => setNt((p) => ({ ...p, dueDate: atTimeDT(0, 18) }))}>Bugun</button>
                      <button className="btn sm" onClick={() => setNt((p) => ({ ...p, dueDate: atTimeDT(1, 10) }))}>Ertaga</button>
                      <button className="btn sm" onClick={() => setNt((p) => ({ ...p, dueDate: toLocalDT(new Date(Date.now() + 36e5)) }))}>+1 soat</button>
                      <button className="btn sm primary f1" onClick={addTask}>Qo'shish</button>
                    </div>
                  </div>
                )}
                {composerTab === 'chat' && (
                  chat.canReply ? (
                    <div className="fx ac gap8">
                      <input className="hr-input" value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder="Telegram orqali javob..." onKeyDown={(e) => e.key === 'Enter' && sendChat()} />
                      <button className="btn sm primary" onClick={sendChat}><Icon name="send" size={13} /></button>
                    </div>
                  ) : <div className="sub2" style={{ fontSize: 12 }}>{chat.telegramLinked ? 'Javob uchun TELEGRAM_BOT_TOKEN sozlang' : 'Telegram orqali bog`lanmagan'}</div>
                )}
              </div>
            </div>
          ) : (
            <div className="amo-card-right amo-card-right-empty">
              <div className="sub2" style={{ fontSize: 13, textAlign: 'center', padding: '40px 20px' }}>Lidni saqlagach — bu yerda faoliyat lentasi, vazifalar va suhbat paydo bo'ladi.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// amoCRM "Setup/Настроить" — kartochka ichida maydonlarni sozlash (Bitim/Kontakt/Kompaniya)
function CardFieldSetup({ onChanged }) {
  const ENT = [{ v: 'lead', l: 'Bitim' }, { v: 'contact', l: 'Kontakt' }, { v: 'company', l: 'Kompaniya' }]
  const [entity, setEntity] = useState('lead')
  const [fields, setFields] = useState(null)
  const [editing, setEditing] = useState(null) // maydon obyekti yoki {__new:true}
  const load = () => crmService.listFields(entity).then((r) => setFields(r.fields || [])).catch(() => setFields([]))
  useEffect(() => { setFields(null); setEditing(null); load() }, [entity])

  const groups = [...new Set((fields || []).map((f) => f.group).filter(Boolean))]

  const saveField = async (data) => {
    try {
      if (data.id) await crmService.updateField(data.id, data)
      else await crmService.createField({ ...data, entity })
      setEditing(null); await load(); onChanged && onChanged()
    } catch (e) { await dialog.alert(e.message || 'Saqlanmadi') }
  }
  const remove = async (fd) => { if (!await dialog.confirm(`"${fd.label}" o'chirilsinmi?`)) return; try { await crmService.deleteField(fd.id); load(); onChanged && onChanged() } catch (e) { await dialog.alert(e.message) } }
  const toggleActive = async (fd) => {
    setFields((xs) => xs.map((x) => x.id === fd.id ? { ...x, active: fd.active === false } : x))
    try { await crmService.updateField(fd.id, { active: fd.active === false }); onChanged && onChanged() } catch { load() }
  }
  const move = async (i, dir) => {
    const j = i + dir; if (j < 0 || j >= fields.length) return
    const arr = [...fields];[arr[i], arr[j]] = [arr[j], arr[i]]; setFields(arr)
    try { await crmService.reorderFields(arr.map((f) => f.id)); onChanged && onChanged() } catch { load() }
  }

  return (
    <div className="hr-sec">
      <div className="fx jb ac" style={{ marginBottom: 12 }}>
        <h4 style={{ margin: 0 }}>Maydonlarni sozlash</h4>
        {!editing && <button className="btn primary sm" onClick={() => setEditing({ __new: true, type: 'text', required: false, group: '', options: [] })}><Icon name="plus" size={13} />Yangi maydon</button>}
      </div>
      <div className="fx ac gap8" style={{ background: 'var(--canvas)', borderRadius: 8, padding: 3, width: 'fit-content', marginBottom: 12 }}>
        {ENT.map((e) => <button key={e.v} className={`btn sm ${entity === e.v ? 'primary' : ''}`} onClick={() => setEntity(e.v)}>{e.l}</button>)}
      </div>

      {editing && <FieldEditor initial={editing} groups={groups} onCancel={() => setEditing(null)} onSave={saveField} />}

      {fields === null ? <Loading /> : fields.length === 0 ? <div className="sub2" style={{ fontSize: 12 }}>Hali maydon yo'q. "Yangi maydon" bilan qo'shing.</div> : (
        <div className="crm-fieldlist">
          {fields.map((fd, i) => (
            <div className={`crm-fieldrow ${fd.active === false ? 'off' : ''}`} key={fd.id}>
              <div className="crm-fmove">
                <button type="button" className="crm-fmini" disabled={i === 0} onClick={() => move(i, -1)} title="Yuqoriga">↑</button>
                <button type="button" className="crm-fmini" disabled={i === fields.length - 1} onClick={() => move(i, 1)} title="Pastga">↓</button>
              </div>
              <div className="f1" style={{ minWidth: 0 }}>
                <div className="fx ac gap6" style={{ flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 13 }}>{fd.label}</b>
                  {fd.required && <span className="crm-req" title="Majburiy">*</span>}
                  {fd.group && <span className="crm-grouptag">{fd.group}</span>}
                </div>
                <div className="sub2" style={{ fontSize: 11 }}>{crmTypeLabel(fd.type)}{fd.options?.length ? ` · ${fd.options.length} variant` : ''}{fd.active === false ? ' · yashirin' : ''}</div>
              </div>
              <button type="button" className="crm-fmini" title={fd.active === false ? 'Ko\'rsatish' : 'Yashirish'} onClick={() => toggleActive(fd)}>{fd.active === false ? '🙈' : '👁'}</button>
              <button type="button" className="crm-fmini" title="Tahrirlash" onClick={() => setEditing(fd)}><Icon name="edit" size={12} /></button>
              <button type="button" className="crm-fmini crm-fdel" title="O'chirish" onClick={() => remove(fd)}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FieldEditor({ initial, groups, onCancel, onSave }) {
  const [f, setF] = useState({
    id: initial.id, label: initial.label || '', type: initial.type || 'text',
    options: (initial.options || []).join('\n'), group: initial.group || '', required: !!initial.required,
  })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const hasOpt = CRM_TYPE_OPT.includes(f.type)
  const submit = () => {
    if (!f.label.trim()) return
    onSave({ id: f.id, label: f.label.trim(), type: f.type, group: (f.group || '').trim(), required: f.required, options: hasOpt ? f.options.split('\n').map((s) => s.trim()).filter(Boolean) : [] })
  }
  return (
    <div className="crm-feditor">
      <div className="crm-feditor-t">{f.id ? 'Maydonni tahrirlash' : 'Yangi maydon'}</div>
      <div className="hr-grid2">
        <div className="hr-field" style={{ margin: 0 }}><label>Nomi</label><input className="hr-input" autoFocus value={f.label} onChange={(e) => set('label', e.target.value)} placeholder="Masalan: Manzil" /></div>
        <div className="hr-field" style={{ margin: 0 }}><label>Turi</label><select className="hr-select" value={f.type} onChange={(e) => set('type', e.target.value)}>{CRM_FIELD_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
      </div>
      {hasOpt && <div className="hr-field" style={{ marginTop: 8, marginBottom: 0 }}><label>Variantlar (har qatorda bittadan)</label><textarea className="hr-input" rows={3} value={f.options} onChange={(e) => set('options', e.target.value)} placeholder={'Variant 1\nVariant 2'} /></div>}
      <div className="hr-grid2" style={{ marginTop: 8 }}>
        <div className="hr-field" style={{ margin: 0 }}><label>Guruh (bo'lim)</label>
          <input className="hr-input" list="crm-groups-dl" value={f.group} onChange={(e) => set('group', e.target.value)} placeholder="masalan: Qo'shimcha" />
          <datalist id="crm-groups-dl">{(groups || []).map((g) => <option key={g} value={g} />)}</datalist>
        </div>
        <label className="apply-opt" style={{ alignSelf: 'end' }}><input type="checkbox" checked={f.required} onChange={(e) => set('required', e.target.checked)} /> Majburiy maydon</label>
      </div>
      <div className="fx ac gap8" style={{ marginTop: 12 }}>
        <button type="button" className="btn primary sm" onClick={submit}>Saqlash</button>
        <button type="button" className="btn sm" onClick={onCancel}>Bekor</button>
      </div>
    </div>
  )
}

function CustomField({ field, value, onChange }) {
  const t = field.type
  const req = field.required ? <span className="crm-req"> *</span> : null
  if (t === 'textarea') return <div className="hr-field" style={{ gridColumn: '1 / -1' }}><label>{field.label}{req}</label><textarea className="hr-input" rows={2} value={value || ''} onChange={(e) => onChange(e.target.value)} /></div>
  if (t === 'checkbox' || t === 'switch') return <div className="hr-field"><label>{field.label}{req}</label><label className="apply-opt"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> Ha</label></div>
  if (t === 'select') return <div className="hr-field"><label>{field.label}{req}</label><select className="hr-select" value={value || ''} onChange={(e) => onChange(e.target.value)}><option value="">—</option>{(field.options || []).map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
  if (t === 'radio') {
    return <div className="hr-field" style={{ gridColumn: '1 / -1' }}><label>{field.label}{req}</label><div className="fx ac gap8" style={{ flexWrap: 'wrap' }}>{(field.options || []).map((o) => <button type="button" key={o} className={`btn sm ${value === o ? 'primary' : ''}`} onClick={() => onChange(value === o ? '' : o)}>{o}</button>)}</div></div>
  }
  if (t === 'multiselect') {
    const arr = Array.isArray(value) ? value : []
    const toggle = (o) => onChange(arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o])
    return <div className="hr-field" style={{ gridColumn: '1 / -1' }}><label>{field.label}{req}</label><div className="fx ac gap8" style={{ flexWrap: 'wrap' }}>{(field.options || []).map((o) => <button type="button" key={o} className={`btn sm ${arr.includes(o) ? 'primary' : ''}`} onClick={() => toggle(o)}>{o}</button>)}</div></div>
  }
  if (t === 'price') return <div className="hr-field"><label>{field.label}{req}</label><div className="crm-price-wrap"><input className="hr-input" type="number" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="0" /><span className="crm-price-cur">so'm</span></div></div>
  const inputType = t === 'number' ? 'number' : t === 'date' ? 'date' : t === 'datetime' ? 'datetime-local' : t === 'url' ? 'url' : t === 'email' ? 'email' : t === 'phone' ? 'tel' : 'text'
  return <div className="hr-field"><label>{field.label}{req}</label><input className="hr-input" type={inputType} value={value || ''} onChange={(e) => onChange(e.target.value)} /></div>
}
