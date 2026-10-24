// amoCRM bitim kartochkasi: /leads/detail/:id va /leads/add (yaratish rejimi).
// Chapda maydonlar paneli (520px), o'ngda lenta: tizim voqealari, eslatmalar, qo'ng'iroqlar, vazifalar, chat.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { crmService } from '../../services/crm.service'
import { useAuth } from '../../context/AuthContext'
import { Ico } from '../AmoIcons'
import { DotsMenu, useOutside } from '../TopBar'
import { money, feedDate, dmy, hm, relDay } from '../format'
import { useT } from '../i18n'
import '../i18n/leadcard.ru.js'
import '../leadcard.css'

export const TASK_TYPES = [
  { key: 'call', label: "Qo'ng'iroq" },
  { key: 'meeting', label: 'Uchrashuv' },
  { key: 'task', label: 'Kuzatish' },
  { key: 'message', label: 'Xat' },
]

export function PersonAvatar({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36"><circle cx="18" cy="18" r="18" fill="#dcdfe3" /><circle cx="18" cy="14" r="6.5" fill="#fff" /><path d="M5 34c1.5-7 6.5-10.5 13-10.5S29.5 27 31 34" fill="#fff" /></svg>
  )
}

// ── Status tanlagich (.pipeline-select): barcha voronkalar, joriy voronka ochiq, bosqichlar rangli ──
function StatusPicker({ lead, pipes, onPick }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(lead.pipelineId || '')
  const ref = useRef(null)
  useOutside(ref, () => setOpen(false), open)
  const current = pipes.find((p) => (p.id || '') === (lead.pipelineId || '')) || pipes[0]
  const stages = current?.stages || []
  const idx = Math.max(0, stages.findIndex((s) => s.id === lead.stage))
  const st = stages[idx]
  const openStages = stages.filter((s) => s.kind === 'open')
  const pos = st?.kind === 'open' ? openStages.findIndex((s) => s.id === st.id) + 1 : openStages.length
  const pct = openStages.length ? Math.round((pos / openStages.length) * 100) : 0
  const since = lead.stageSince ? relDay(lead.stageSince) || dmy(lead.stageSince) : null
  return (
    <div className="ac-status" ref={ref}>
      <button className="ac-status__btn" onClick={() => { setExpanded(lead.pipelineId || ''); setOpen(true) }}>
        <div className="ac-status__pipe">{current?.name || t('Asosiy voronka')}</div>
        <div className="ac-status__name">
          {st?.name || '—'} {since && <small>({t(since)})</small>}
          <span className="ac-status__chev"><Ico name="chevronDown" /></span>
        </div>
      </button>
      <div className="ac-status__bar"><div className="ac-status__fill" style={{ width: `${st?.kind === 'won' ? 100 : st?.kind === 'lost' ? 100 : pct}%`, background: st?.kind === 'lost' ? '#c5c5c5' : st?.color || '#99ccff' }} /></div>
      {open && (
        <div className="ac-status__drop">
          {pipes.map((p) => (
            <div key={p.id || 'main'} className="ac-status__group">
              <button className="ac-status__ghead" onClick={() => setExpanded(p.id || '')}>{p.name}</button>
              {(expanded === (p.id || '')) && p.stages.map((s) => (
                <button key={s.id} className="ac-status__opt" style={{ background: s.kind === 'lost' ? '#d5d8db' : s.kind === 'won' ? '#ccff66' : s.color || '#99ccff' }} onClick={() => { setOpen(false); onPick(p.id || '', s) }}>
                  {s.id === lead.stage && (p.id || '') === (lead.pipelineId || '') && <span className="tick"><Ico name="check" size={12} /></span>}
                  {s.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Maydon qatori: bosilganda tahrirlanadi (amoCRM inline edit) ──
export function FieldRow({ label, children }) {
  return (
    <div className="ac-field">
      <div className="ac-field__label" title={label}>{label}</div>
      <div className="ac-field__value">{children}</div>
    </div>
  )
}

export function CustomInput({ field, value, onChange }) {
  const t = useT()
  const opts = useMemo(() => { try { return JSON.parse(field.optionsJson || '[]') } catch { return field.options || [] } }, [field])
  const options = Array.isArray(field.options) ? field.options : opts
  if (field.type === 'select') {
    return (
      <select className={`ac-field__edit ${value ? '' : 'ac-field__edit--muted'}`} value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('Tanlash')}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  if (field.type === 'checkbox') return <input type="checkbox" className="ac-check" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
  if (field.type === 'date') return <input type="date" className="ac-field__edit" value={value || ''} onChange={(e) => onChange(e.target.value)} />
  if (field.type === 'textarea') return <textarea className="ac-field__edit" rows={2} style={{ height: 'auto', paddingTop: 4 }} value={value || ''} placeholder="..." onChange={(e) => onChange(e.target.value)} />
  return <input className="ac-field__edit" type={field.type === 'number' ? 'number' : 'text'} value={value ?? ''} placeholder="..." onChange={(e) => onChange(e.target.value)} />
}

// ── Kontakt bloki ──
function ContactBlock({ contact, onLink, onUnlink, onChange }) {
  const t = useT()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  useEffect(() => {
    if (!adding || !q.trim()) { setFound([]); return }
    const h = setTimeout(() => crmService.listContacts(q).then((r) => setFound(r.contacts || [])).catch(() => {}), 250)
    return () => clearTimeout(h)
  }, [q, adding])
  if (contact) {
    return (
      <div className="ac-linked">
        <div className="ac-linked__head">
          <div className="ac-linked__avatar"><PersonAvatar /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="ac-linked__name" onClick={() => navigate(`/contacts/detail/${contact.id}`)}>{contact.name}</div>
            {contact.position && <div className="ac-linked__sub">{contact.position}</div>}
          </div>
          <DotsMenu items={[{ label: t('Bitimdan uzish'), icon: 'close', onClick: onUnlink }]} />
        </div>
        <div style={{ marginTop: 10 }}>
          <FieldRow label={t('Ish tel.')}>
            <input className="ac-field__edit" value={contact.phone || ''} placeholder="..." onChange={(e) => onChange({ ...contact, phone: e.target.value })} />
          </FieldRow>
          <FieldRow label="Email">
            <input className="ac-field__edit" value={contact.email || ''} placeholder="..." onChange={(e) => onChange({ ...contact, email: e.target.value })} />
          </FieldRow>
        </div>
      </div>
    )
  }
  if (!adding) {
    return (
      <button className="ac-linked__add" onClick={() => setAdding(true)}>
        <span className="ac-linked__plus"><Ico name="plus" /></span>{t("Kontakt qo'shish")}
      </button>
    )
  }
  return (
    <div className="ac-linked">
      <div className="ac-linked__search">
        <input autoFocus className="ac-input" placeholder={t('Ism, telefon yoki email')} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setAdding(false)} />
        {q.trim() && (
          <div className="ac-linked__results">
            {found.map((c) => <div key={c.id} className="ac-linked__result" onClick={() => { setAdding(false); setQ(''); onLink(c) }}>{c.name} <span className="ac-muted">{c.phone || ''}</span></div>)}
            <div className="ac-linked__result" style={{ color: '#1691ff' }} onClick={() => { setAdding(false); onLink({ name: q.trim(), isNew: true }) }}>+ {t('Yangi kontakt')}: {q.trim()}</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Lenta elementlari ──
export function SysLine({ at, who, text, link }) {
  const t = useT()
  return (
    <div className="ac-feed__sys">
      <span className="grow">{feedDate(at, t)} {who && <b>{who}</b>} {text}</span>
      {link}
    </div>
  )
}

export function CallNote({ c }) {
  const t = useT()
  const [audio, setAudio] = useState(null)
  const [err, setErr] = useState(false)
  const dur = c.durationSec || 0
  const mmss = `${String(Math.floor(dur / 3600)).padStart(2, '0')}:${String(Math.floor((dur % 3600) / 60)).padStart(2, '0')}:${String(dur % 60).padStart(2, '0')}`
  const out = c.direction !== 'in'
  const listen = async () => {
    if (audio) return
    try { const b = await crmService.recordingBlob(c.id); setAudio(URL.createObjectURL(b)) } catch { setErr(true) }
  }
  const okText = c.status === 'missed' || c.status === 'failed' || !dur ? t('Javob berilmadi') : t("Suhbat bo'lib o'tdi")
  return (
    <div className="ac-note">
      <div className="ac-note__icon"><Ico name={out ? 'phoneOut' : 'phone'} size={17} /></div>
      <div className="ac-note__body">
        <div className="ac-note__head"><span className="grow">{feedDate(c.startedAt, t)} {t(out ? "Chiquvchi qo'ng'iroq" : "Kiruvchi qo'ng'iroq")} {c.phone}</span></div>
        <div className="ac-note__actions">
          <span>{t(out ? "Chiquvchi qo'ng'iroq" : "Kiruvchi qo'ng'iroq")} {mmss}</span>
          {c.hasRecording && <button className="ac-note__listen" onClick={listen}>{t('Tinglash')}</button>}
          {audio && <a href={audio} download={`call-${c.id}.mp3`} style={{ textDecoration: 'underline' }}>{t('Yuklab olish')}</a>}
        </div>
        <div className="ac-note__text" style={{ marginTop: 2 }}>{okText}</div>
        {audio && <audio src={audio} controls autoPlay />}
        {err && <div className="ac-muted" style={{ fontSize: 13 }}>{t('Yozuv topilmadi')}</div>}
      </div>
    </div>
  )
}

export function taskKind(task) {
  if (task.done) return 'done'
  if (!task.dueDate) return 'future'
  const d = new Date(task.dueDate), now = new Date()
  if (d < now && d.toDateString() !== now.toDateString()) return 'overdue'
  if (d.toDateString() === now.toDateString()) return d < now ? 'overdue' : 'today'
  return 'future'
}

export function TaskNote({ task, onDone }) {
  const t = useT()
  const [res, setRes] = useState('')
  const kind = taskKind(task)
  const typeLabel = TASK_TYPES.find((x) => x.key === task.type)?.label || 'Kuzatish'
  return (
    <div className={`ac-note ac-note--task ${kind}`}>
      <div className="ac-note__icon"><Ico name={task.done ? 'check' : 'clock'} size={17} /></div>
      <div className="ac-note__body">
        <div className="ac-note__head"><span className="grow">{task.dueDate ? feedDate(task.dueDate, t) : t('Muddatsiz')} {task.assigneeName ? `${t('uchun')} ${task.assigneeName}` : ''}</span></div>
        <div className="ac-note__text"><b>{t(typeLabel)}</b> — {task.title}</div>
        {task.done && task.result && <div className="ac-note__text ac-muted" style={{ textDecoration: 'none' }}>{t('Natija')}: {task.result}</div>}
        {!task.done && (
          <div className="ac-task-result">
            <input className="ac-input" placeholder={t("Natija qo'shing")} value={res} onChange={(e) => setRes(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onDone(task, res)} />
            <button className="ac-btn" onClick={() => onDone(task, res)}>{t('Bajarish')}</button>
          </div>
        )}
      </div>
    </div>
  )
}

export function NoteItem({ n }) {
  const t = useT()
  return (
    <div className="ac-note">
      <div className="ac-note__icon"><Ico name="edit" size={16} /></div>
      <div className="ac-note__body">
        <div className="ac-note__head"><span className="grow">{feedDate(n.at, t)} {n.by}</span></div>
        <div className="ac-note__text">{n.text}</div>
      </div>
    </div>
  )
}

export function MsgItem({ m }) {
  const t = useT()
  return (
    <div className={`ac-msg ${m.direction === 'out' ? 'ac-msg--out' : ''}`}>
      <div className="ac-msg__bubble">
        <div className="ac-msg__head">{feedDate(m.createdAt, t)} {m.senderName || ''} {m.channel ? `· ${m.channel}` : ''}</div>
        <div className="ac-msg__text">{m.text}</div>
      </div>
    </div>
  )
}

const ACT_TEXT = {
  created: 'Bitim yaratildi',
  stage: 'Yangi bosqich',
  won: 'Bitim muvaffaqiyatli yopildi',
  lost: 'Bitim yopildi va amalga oshmadi',
  assignee: "Mas'ul o'zgartirildi",
  field: "Maydon o'zgartirildi",
  tag: "Teglar o'zgartirildi",
  task_created: 'Yangi vazifa',
  task_done: 'Vazifa bajarildi',
  automation: 'Avtomatlashtirish',
  updated: "O'zgartirildi",
}

// ── Composer: Chat / Eslatma / Vazifa ──
function Composer({ lead, canChat, members, onSent }) {
  const t = useT()
  const { user } = useAuth()
  const [mode, setMode] = useState(canChat ? 'chat' : 'note')
  const [modesOpen, setModesOpen] = useState(false)
  const [text, setText] = useState('')
  const [focus, setFocus] = useState(false)
  const [due, setDue] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(12, 0, 0, 0); return toLocalInput(d) })
  const [assignee, setAssignee] = useState(user?.id || '')
  const [type, setType] = useState('call')
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)
  const wrap = useRef(null)
  useOutside(wrap, () => { setModesOpen(false); if (!text) setFocus(false) }, focus || modesOpen)

  const send = async () => {
    if (busy) return
    if (mode !== 'task' && !text.trim()) return
    setBusy(true)
    try {
      if (mode === 'chat') await crmService.sendMessage(lead.id, text.trim())
      else if (mode === 'note') await crmService.addNote(lead.id, text.trim())
      else await crmService.createTask(lead.id, { title: text.trim() || t(TASK_TYPES.find((x) => x.key === type).label), type, dueDate: new Date(due).toISOString(), assigneeId: assignee || undefined })
      setText(''); setFocus(false); onSent()
    } finally { setBusy(false) }
  }
  const labels = { chat: 'Chat', note: 'Eslatma', task: 'Vazifa' }
  return (
    <div ref={wrap} className={`ac-compose ${focus ? 'focus' : ''}`} onClick={() => { setFocus(true); ref.current?.focus() }}>
      <div className="ac-compose__line">
        <span className="ac-compose__mode">
          {modesOpen && (
            <div className="ac-menu ac-compose__modes">
              {['chat', 'note', 'task'].filter((m) => m !== 'chat' || canChat).map((m) => (
                <button key={m} className="ac-menu__item" onClick={(e) => { e.stopPropagation(); setMode(m); setModesOpen(false) }}>{t(labels[m])}</button>
              ))}
            </div>
          )}
          {mode === 'chat' && <><a onClick={(e) => { e.stopPropagation(); setModesOpen((v) => !v) }}>{t('Chat')}</a> {t('bilan')} <a>{lead.contact?.name || lead.n}</a>:</>}
          {mode === 'note' && <><a onClick={(e) => { e.stopPropagation(); setModesOpen((v) => !v) }}>{t('Eslatma')}</a>:</>}
          {mode === 'task' && <><a onClick={(e) => { e.stopPropagation(); setModesOpen((v) => !v) }}>{t('Vazifa')}</a></>}
          {mode !== 'task' && <span className="ac-compose__caret" onClick={(e) => { e.stopPropagation(); setModesOpen((v) => !v) }}><Ico name="chevronDown" size={10} /></span>}
        </span>
        {mode === 'task' ? (
          <div className="ac-compose__task" onClick={(e) => e.stopPropagation()}>
            <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
            <span>{t('uchun')}</span>
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {TASK_TYPES.map((x) => <option key={x.key} value={x.key}>{t(x.label)}</option>)}
            </select>
            <textarea ref={ref} className="ac-compose__text" rows={1} style={{ minWidth: 200 }} placeholder={t('matn kiriting...')} value={text} onChange={(e) => setText(e.target.value)} onFocus={() => setFocus(true)} />
          </div>
        ) : (
          <textarea ref={ref} className="ac-compose__text" rows={focus ? 3 : 1} placeholder={t('matn kiriting...')} value={text} onChange={(e) => setText(e.target.value)} onFocus={() => setFocus(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }} />
        )}
      </div>
      {focus && (
        <div className="ac-compose__foot" onClick={(e) => e.stopPropagation()}>
          <button className="ac-btn ac-btn--blue ac-btn--plain" style={{ height: 34, lineHeight: '32px', padding: '0 14px' }} disabled={busy} onClick={send}>{t(mode === 'task' ? "Qo'yish" : mode === 'chat' ? 'Yuborish' : 'Yuborish')}</button>
          <button className="ac-btn ac-btn--plain" style={{ height: 34, border: 0, background: 'transparent' }} onClick={() => { setText(''); setFocus(false) }}>{t('Bekor qilish')}</button>
        </div>
      )}
    </div>
  )
}

function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// ── Asosiy sahifa ──
export default function LeadCard() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const isNew = !id
  const navigate = useNavigate()
  const t = useT()
  const { user } = useAuth()
  const [lead, setLead] = useState(null)
  const [draft, setDraft] = useState({})
  const [contactDraft, setContactDraft] = useState(null)
  const [pipes, setPipes] = useState([])
  const [fields, setFields] = useState([])
  const [members, setMembers] = useState([])
  const [feed, setFeed] = useState({ calls: [], tasks: [], messages: [], canReply: false })
  const [tab, setTab] = useState('main')
  const [feedQ, setFeedQ] = useState('')
  const [tagInput, setTagInput] = useState(null)
  const [saving, setSaving] = useState(false)

  const loadLead = async () => {
    if (isNew) return
    const r = await crmService.getLead(id)
    const l = r.lead
    const stageAct = (l.activity || []).find((a) => a.type === 'stage' || a.type === 'won' || a.type === 'lost')
    setLead({ ...l, stageSince: stageAct?.at || l.createdAt })
  }
  const loadFeed = async () => {
    if (isNew) return
    const [c, tk, m] = await Promise.all([
      crmService.leadCalls(id).catch(() => ({ calls: [] })),
      crmService.listLeadTasks(id).catch(() => ({ tasks: [] })),
      crmService.leadMessages(id).catch(() => ({ messages: [], canReply: false })),
    ])
    setFeed({ calls: c.calls || [], tasks: tk.tasks || [], messages: m.messages || [], canReply: !!m.canReply })
  }

  useEffect(() => {
    setDraft({}); setContactDraft(null); setTab('main')
    const pid = sp.get('pipeline') || ''
    if (isNew) setLead({ id: null, n: '', stage: '', pipelineId: pid, tags: [], custom: {}, value: 0, assigneeId: user?.id, activity: [], notes: [] })
    else { setLead(null); loadLead() }
    loadFeed()
    ;(async () => {
      const [main, fl, mem] = await Promise.all([crmService.getPipeline(), crmService.listFields('lead'), crmService.listMembers()])
      setFields((fl.fields || []).filter((f) => f.active !== false))
      setMembers(mem.members || [])
      const list = [{ id: '', name: t('Asosiy voronka'), stages: main.stages || [] }]
      const others = await Promise.all((main.pipelines || []).map((p) => crmService.getPipeline(p.id).then((r) => ({ id: p.id, name: p.name, stages: r.stages || [] }))))
      setPipes([...list, ...others])
      if (isNew) setLead((l) => ({ ...l, stage: l.stage || ([...list, ...others].find((p) => p.id === pid)?.stages || []).find((s) => s.kind === 'open')?.id }))
    })()
  }, [id]) // eslint-disable-line

  if (!lead) return <div className="ac-cardpage" style={{ alignItems: 'center', justifyContent: 'center' }}><div className="ac-spinner" /></div>

  const v = { ...lead, ...draft, custom: { ...(lead.custom || {}), ...(draft.custom || {}) } }
  const dirty = isNew || Object.keys(draft).length > 0 || !!contactDraft
  const set = (k, val) => setDraft((d) => ({ ...d, [k]: val }))
  const setCustom = (k, val) => setDraft((d) => ({ ...d, custom: { ...(d.custom || {}), [k]: val } }))

  const save = async () => {
    setSaving(true)
    try {
      let contactId
      if (contactDraft?.isNew) {
        const c = await crmService.createContact({ name: contactDraft.name, phone: contactDraft.phone, email: contactDraft.email })
        contactId = c.contact?.id
      } else if (contactDraft?.id) {
        if (contactDraft.unlink) contactId = ''
        else {
          contactId = contactDraft.id
          await crmService.updateContact(contactDraft.id, { name: contactDraft.name, phone: contactDraft.phone || '', email: contactDraft.email || '' })
        }
      }
      const payload = { ...draft }
      if (payload.value !== undefined) payload.value = Number(String(payload.value).replace(/\D/g, '')) || 0
      if (contactId !== undefined) payload.contactId = contactId
      if (isNew) {
        const r = await crmService.createLead({ name: v.n || `${t('Bitim')} #${Date.now().toString().slice(-6)}`, stage: v.stage, pipelineId: v.pipelineId || undefined, value: payload.value ?? 0, assigneeId: v.assigneeId || undefined, tags: v.tags, custom: v.custom, contactId: contactId || undefined })
        navigate(`/leads/detail/${r.lead.id}`, { replace: true })
        return
      }
      if (payload.n !== undefined) { payload.name = payload.n; delete payload.n }
      await crmService.updateLead(lead.id, payload)
      setDraft({}); setContactDraft(null)
      await loadLead()
    } finally { setSaving(false) }
  }

  const pickStatus = async (pipelineId, stage) => {
    if (isNew) { setLead((l) => ({ ...l, pipelineId, stage: stage.id })); return }
    if ((lead.pipelineId || '') !== pipelineId) await crmService.updateLead(lead.id, { pipelineId: pipelineId || '' })
    let reason
    if (stage.kind === 'lost') reason = window.prompt(t("Yo'qotish sababi")) || undefined
    await crmService.moveLead(lead.id, stage.id, undefined, reason)
    await loadLead()
  }

  const addTag = async (name) => {
    const tags = [...new Set([...(v.tags || []), name.trim()].filter(Boolean))]
    if (isNew) return setLead((l) => ({ ...l, tags }))
    await crmService.updateLead(lead.id, { tags }); loadLead()
  }
  const removeTag = async (name) => {
    const tags = (v.tags || []).filter((x) => x !== name)
    if (isNew) return setLead((l) => ({ ...l, tags }))
    await crmService.updateLead(lead.id, { tags }); loadLead()
  }

  const completeTask = async (task, result) => {
    await crmService.updateTask(task.id, { done: true, result: result || undefined })
    loadFeed(); loadLead()
  }

  const deleteLead = async () => {
    if (!window.confirm(t("Bitimni o'chirishni tasdiqlaysizmi?"))) return
    await crmService.deleteLead(lead.id)
    navigate('/leads/pipeline')
  }

  // Lenta: barcha elementlarni vaqt bo'yicha birlashtirish
  const items = []
  if (!isNew) {
    for (const a of lead.activity || []) {
      if (a.type === 'note' || a.type === 'call') continue
      items.push({ at: a.at, kind: 'sys', a })
    }
    for (const n of lead.notes || []) items.push({ at: n.at, kind: 'note', n })
    for (const c of feed.calls) items.push({ at: c.startedAt, kind: 'call', c })
    for (const tk of feed.tasks) items.push({ at: tk.done ? tk.doneAt || tk.dueDate : tk.dueDate || new Date().toISOString(), kind: 'task', tk })
    for (const m of feed.messages) items.push({ at: m.createdAt, kind: 'msg', m })
  }
  const q = feedQ.trim().toLowerCase()
  const shown = items
    .filter((it) => !q || JSON.stringify(it).toLowerCase().includes(q))
    .sort((a, b) => new Date(a.at) - new Date(b.at))
  const openTasks = feed.tasks.filter((x) => !x.done)
  let lastDay = ''

  return (
    <div className="ac-cardpage">
      <div className="ac-cf">
        <div className="ac-cf__scroll">
          <div className="ac-cf__top">
            <button className="ac-cf__back" onClick={() => navigate(-1)} title={t('Orqaga')}><Ico name="chevronLeft" /></button>
            <div className="ac-cf__namerow">
              <input className="ac-cf__name" value={v.n || ''} placeholder={isNew ? `${t('Bitim')} #XXXXXX` : ''} onChange={(e) => set('n', e.target.value)} />
              {!isNew && (
                <DotsMenu items={[
                  { label: t('Chop etish'), icon: 'print', onClick: () => window.print() },
                  { label: t('Teglarni boshqarish'), icon: 'hash', onClick: () => setTagInput('') },
                  { label: t('Excelga eksport'), icon: 'excel', onClick: () => window.open('/api/v1' + crmService.exportUrl(), '_blank') },
                  { label: t("Bitimni o'chirish"), icon: 'trash', danger: true, onClick: deleteLead },
                ]} />
              )}
            </div>
            <div className="ac-cf__meta">
              {!isNew && <span>#{String(lead.id).slice(-8)}</span>}
              {(v.tags || []).map((tg) => <span key={tg} className="ac-cf__tagpill">{tg}<button onClick={() => removeTag(tg)}><Ico name="close" size={10} /></button></span>)}
              {tagInput === null
                ? <button className="ac-cf__tagbtn" onClick={() => setTagInput('')}>#{t('Teglash')}</button>
                : <input autoFocus className="ac-input" style={{ width: 140, height: 22 }} value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && tagInput.trim()) { addTag(tagInput); setTagInput('') } if (e.key === 'Escape') setTagInput(null) }}
                    onBlur={() => { if (tagInput.trim()) addTag(tagInput); setTagInput(null) }} />}
            </div>
            {pipes.length > 0 && <StatusPicker lead={v} pipes={pipes} onPick={pickStatus} />}
          </div>
          <div className="ac-ctabs">
            {[['main', 'Asosiy'], ['stats', 'Statistika'], ['setup', 'Sozlash']].map(([k, l]) => (
              <button key={k} className={`ac-ctabs__item ${tab === k ? 'on' : ''}`} onClick={() => k === 'setup' ? navigate('/settings/fields/leads') : setTab(k)}>{t(l)}</button>
            ))}
          </div>

          {tab === 'main' && (
            <>
              <div className="ac-fields">
                <FieldRow label={t("Mas'ul")}>
                  <select className="ac-field__edit" value={v.assigneeId || ''} onChange={(e) => set('assigneeId', e.target.value)}>
                    <option value="">—</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </FieldRow>
                <FieldRow label={t('Byudjet')}>
                  <span className="ac-field__money">
                    <input className="ac-field__edit" value={draft.value !== undefined ? draft.value : (v.value || 0).toLocaleString('en-US')} onChange={(e) => set('value', e.target.value)} />
                    <span>so'm</span>
                  </span>
                </FieldRow>
                {fields.map((f) => (
                  <FieldRow key={f.id} label={f.label}>
                    <CustomInput field={f} value={v.custom?.[f.key]} onChange={(val) => setCustom(f.key, val)} />
                  </FieldRow>
                ))}
              </div>
              <ContactBlock
                contact={contactDraft?.unlink ? null : contactDraft || lead.contact}
                onLink={(c) => setContactDraft(c.isNew ? { ...c } : { ...c })}
                onUnlink={() => setContactDraft({ id: lead.contact?.id || 'x', unlink: true })}
                onChange={(c) => setContactDraft(c)}
              />
              <button className="ac-linked__add" onClick={() => navigate('/companies/add')}>
                <span className="ac-linked__plus"><Ico name="plus" /></span>{lead.companyName || t("Kompaniya qo'shish")}
              </button>
            </>
          )}
          {tab === 'stats' && !isNew && (
            <div className="ac-cstats">
              <div className="ac-cstats__row"><span>{t('Yaratilgan sana')}</span>{dmy(lead.createdAt)} {hm(lead.createdAt)}</div>
              <div className="ac-cstats__row"><span>{t('Joriy bosqichda')}</span>{Math.max(0, Math.round((Date.now() - new Date(lead.stageSince)) / 86400000))} {t('kun')}</div>
              <div className="ac-cstats__row"><span>{t('Manba')}</span>{lead.source || '—'}</div>
              <div className="ac-cstats__row"><span>{t("Qo'ng'iroqlar")}</span>{feed.calls.length}</div>
              <div className="ac-cstats__row"><span>{t('Vazifalar')}</span>{feed.tasks.length}</div>
              <div className="ac-cstats__row"><span>{t('Byudjet')}</span>{money(lead.value)}</div>
            </div>
          )}
        </div>
        {dirty && (
          <div className="ac-cf__save">
            <button className="ac-btn ac-btn--blue ac-btn--plain" style={{ padding: '0 16px' }} disabled={saving} onClick={save}>{t('Saqlash')}</button>
            <button className="ac-btn ac-btn--plain" style={{ border: 0, background: 'transparent' }} onClick={() => (isNew ? navigate(-1) : (setDraft({}), setContactDraft(null)))}>{t('Bekor qilish')}</button>
          </div>
        )}
      </div>

      <div className="ac-feed">
        <div className="ac-feed__top">
          <div className="ac-top__search" style={{ flex: 1 }}>
            <Ico name="search" />
            <input placeholder={t('Qidiruv va filtr')} value={feedQ} onChange={(e) => setFeedQ(e.target.value)} />
          </div>
          <div className="ac-feed__dots"><DotsMenu items={[{ label: t('Yangilash'), icon: 'clock', onClick: () => { loadLead(); loadFeed() } }]} /></div>
        </div>
        <div className="ac-feed__scroll">
          <div className="ac-feed__inner">
            {shown.map((it, i) => {
              const day = new Date(it.at).toDateString()
              const sep = day !== lastDay ? (lastDay = day, <div key={`s${i}`} className="ac-feed__sep"><span>{t(relDay(it.at) || '') || dmy(it.at)}</span></div>) : null
              let el = null
              if (it.kind === 'sys') {
                const a = it.a
                const base = t(ACT_TEXT[a.type] || ACT_TEXT.updated)
                el = <SysLine key={`a${a.id}`} at={a.at} who={a.actorName} text={a.text && a.text !== base ? `${base}: ${a.text}` : base} />
              } else if (it.kind === 'note') el = <NoteItem key={`n${i}`} n={it.n} />
              else if (it.kind === 'call') el = <CallNote key={`c${it.c.id}`} c={it.c} />
              else if (it.kind === 'task') el = <TaskNote key={`t${it.tk.id}`} task={it.tk} onDone={completeTask} />
              else if (it.kind === 'msg') el = <MsgItem key={`m${it.m.id}`} m={it.m} />
              return <React.Fragment key={i}>{sep}{el}</React.Fragment>
            })}
          </div>
        </div>
        {!isNew && (
          <div className="ac-feed__bottom">
            <div className="ac-feed__hint">
              {openTasks.length === 0 ? (
                <span className="ac-notask"><Ico name="clock" size={13} /> {t("Rejalashtirilgan vazifalar yo'q, qo'shishni tavsiya qilamiz")}</span>
              ) : <span />}
              <span className="ac-feed__members">{t('Ishtirokchilar')}: 0</span>
            </div>
            <Composer lead={lead} canChat={feed.canReply} members={members} onSent={() => { loadLead(); loadFeed() }} />
          </div>
        )}
      </div>
    </div>
  )
}
