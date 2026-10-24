// Digital Pipeline — trigger katalogi modali va trigger formasi (shartlar + "Bajarish" + amal maydonlari).
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Ico } from '../AmoIcons'
import { useOutside } from '../TopBar'
import { useT } from '../i18n'
import { ACTIONS, DELAYS, FIELD_TARGETS, TASK_TYPES, UNSORTED_TRIGGERS, WHEN_GROUPS, actionMeta, delayLabel, whenText } from './PipelineSetupApi'

export { ACTIONS, actionMeta }

// ── Kichik umumiy komponentlar ──
function Drop({ label, children, className = '', align = 'left' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useOutside(ref, () => setOpen(false), open)
  return (
    <div ref={ref} className={`ac-ps-dd ${open ? 'open' : ''} ${className}`}>
      <button type="button" className="ac-ps-dd__btn" onClick={() => setOpen((v) => !v)}>
        <span className="ac-ps-dd__txt">{label}</span><Ico name="chevronDown" size={12} className="ac-ps-dd__chev" />
      </button>
      {open && <div className={`ac-ps-dd__list ${align}`}>{children(() => setOpen(false))}</div>}
    </div>
  )
}

// Ko'p tanlovli ro'yxat: options = [{v, l}]
function MultiPick({ options, value = [], onChange, placeholder }) {
  const t = useT()
  const sel = options.filter((o) => value.includes(o.v))
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  return (
    <Drop className="multi" label={sel.length ? sel.map((o) => o.l).join(', ') : <span className="ac-ps-ph">{placeholder || t('Tanlang')}</span>}>
      {() => (
        <>
          {options.length === 0 && <div className="ac-ps-dd__empty">{t("Ro'yxat bo'sh")}</div>}
          {options.map((o) => (
            <label key={o.v} className="ac-ps-dd__opt">
              <input type="checkbox" className="ac-check" checked={value.includes(o.v)} onChange={() => toggle(o.v)} />
              <span>{o.l}</span>
            </label>
          ))}
        </>
      )}
    </Drop>
  )
}

// Teg/matn chiplari (Enter bilan qo'shiladi)
function ChipInput({ value = [], onChange, suggestions = [], placeholder }) {
  const [text, setText] = useState('')
  const listId = useMemo(() => 'dl' + Math.random().toString(36).slice(2, 8), [])
  const add = () => {
    const v = text.trim()
    if (v && !value.includes(v)) onChange([...value, v])
    setText('')
  }
  return (
    <div className="ac-ps-chips">
      {value.map((v) => (
        <span key={v} className="ac-ps-chip">{v}<button type="button" onClick={() => onChange(value.filter((x) => x !== v))}><Ico name="close" size={9} /></button></span>
      ))}
      <input list={listId} value={text} placeholder={value.length ? '' : placeholder} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1)) }}
        onBlur={add} />
      <datalist id={listId}>{suggestions.filter((s) => !value.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  )
}

// ── Trigger katalogi (qidiruv + kartochkalar) ──
export function TriggerCatalog({ onPick, onClose }) {
  const t = useT()
  const [q, setQ] = useState('')
  const list = ACTIONS.filter((a) => t(a.l).toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div className="ac-modal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ac-modal ac-ps-catalog">
        <button className="ac-modal__close" onClick={onClose}><Ico name="close" size={14} /></button>
        <div className="ac-ps-search">
          <Ico name="search" size={14} />
          <input autoFocus value={q} placeholder={t('Qidiruv va filtr')} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="ac-ps-tiles">
          {list.map((a) => (
            <div key={a.v} className="ac-ps-tile" onClick={() => onPick(a.v)}>
              <span className="ac-ps-tile__ico"><Ico name={a.icon} size={36} /></span>
              <button type="button" className="ac-ps-tile__btn"><Ico name="plus" size={11} />{t(a.l)}</button>
            </div>
          ))}
          {list.length === 0 && <div className="ac-ps-dd__empty" style={{ gridColumn: '1 / -1' }}>{t('Hech narsa topilmadi')}</div>}
        </div>
      </div>
    </div>
  )
}

// ── Trigger formasi ──
const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']

function CondEditor({ c, set, ctx }) {
  const t = useT()
  if (c.field === 'tags') return <MultiPick options={(ctx.tags || []).map((x) => ({ v: x, l: x }))} value={c.value || []} onChange={(v) => set({ value: v })} />
  if (c.field === 'assignee') return <MultiPick options={ctx.members.map((m) => ({ v: m.id, l: m.name }))} value={c.value || []} onChange={(v) => set({ value: v })} />
  if (c.field === 'source') return <ChipInput value={c.value || []} onChange={(v) => set({ value: v })} suggestions={ctx.sources} placeholder={t('Manba nomi')} />
  if (c.field === 'budget') {
    return (
      <div className="ac-ps-row2">
        <input className="ac-input" type="number" placeholder={t('dan')} value={c.from ?? ''} onChange={(e) => set({ from: e.target.value })} />
        <input className="ac-input" type="number" placeholder={t('gacha')} value={c.to ?? ''} onChange={(e) => set({ to: e.target.value })} />
      </div>
    )
  }
  const fd = ctx.fields.find((f) => `cf:${f.key}` === c.field)
  if (fd && (fd.type === 'select' || fd.type === 'multiselect')) return <MultiPick options={(fd.options || []).map((o) => ({ v: o, l: o }))} value={c.value || []} onChange={(v) => set({ value: v })} />
  return <input className="ac-input" value={typeof c.value === 'string' ? c.value : ''} onChange={(e) => set({ value: e.target.value })} />
}

function Conditions({ conds, setConds, ctx }) {
  const t = useT()
  const labelOf = (f) => {
    if (f === 'tags') return t('Teglar')
    if (f === 'assignee') return t("Mas'ul")
    if (f === 'budget') return t('Byudjet')
    if (f === 'source') return t('Manba')
    if (f.startsWith('cf:')) return ctx.fields.find((x) => `cf:${x.key}` === f)?.label || f.slice(3)
    return f
  }
  const all = [
    { v: 'tags' }, { v: 'assignee' }, { v: 'budget' }, { v: 'source' },
    ...UTM.map((u) => ({ v: u })),
    ...ctx.fields.filter((f) => f.active !== false).map((f) => ({ v: `cf:${f.key}` })),
  ].filter((o) => !conds.some((c) => c.field === o.v))
  return (
    <div className="ac-ps-cond">
      <div className="ac-ps-cond__lbl">{t('Quyidagi bitimlar uchun:')}</div>
      {conds.map((c, i) => (
        <div key={c.field} className="ac-ps-cond__row">
          <div className="ac-ps-cond__name">{labelOf(c.field)}</div>
          <div className="ac-ps-cond__val"><CondEditor c={c} ctx={ctx} set={(p) => setConds(conds.map((x, j) => (j === i ? { ...x, ...p } : x)))} /></div>
          <button type="button" className="ac-ps-x" onClick={() => setConds(conds.filter((_, j) => j !== i))}><Ico name="close" size={11} /></button>
        </div>
      ))}
      {all.length > 0 && (
        <Drop className="cond-add" label={<span className="ac-ps-ph">{t("Shart qo'shish")}</span>}>
          {(close) => all.map((o) => (
            <button type="button" key={o.v} className="ac-ps-dd__item" onClick={() => { setConds([...conds, { field: o.v, value: o.v === 'budget' ? undefined : [] }]); close() }}>{labelOf(o.v)}</button>
          ))}
        </Drop>
      )}
    </div>
  )
}

function WhenSelect({ form, set, unsorted, ctx }) {
  const t = useT()
  const [delayFor, setDelayFor] = useState(false)
  const [custom, setCustom] = useState(false)
  const groups = WHEN_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !unsorted || UNSORTED_TRIGGERS.includes(i.v)) })).filter((g) => g.items.length)
  const dateFields = [{ v: 'nextTaskDate', l: t('Keyingi vazifa sanasi') }, ...ctx.fields.filter((f) => f.type === 'date').map((f) => ({ v: `cf:${f.key}`, l: f.label }))]
  const sch = form.schedule || {}
  const setSch = (p) => set({ schedule: { ...sch, ...p } })
  const fieldName = dateFields.find((d) => d.v === sch.field)?.l
  return (
    <>
      <Drop className="when" label={<><span className="ac-ps-dd__pre">{t('Bajarish')}:</span> {whenText(form, t, fieldName)}</>}>
        {(close) => groups.map((g) => (
          <React.Fragment key={g.g}>
            <div className="ac-ps-dd__group">{t(g.g)}</div>
            {g.items.map((it) => (
              <div key={it.v} className={`ac-ps-dd__item ${form.trigger === it.v ? 'sel' : ''}`}
                onClick={() => {
                  const base = { trigger: it.v }
                  if (!it.delay) base.delay = 0
                  if (it.v === 'no_reply_hours' && !sch.hours) base.schedule = { hours: 1 }
                  if (it.v === 'before_date_field' && !sch.field) base.schedule = { field: dateFields[0]?.v, hours: 1 }
                  if (it.v === 'daily' && !sch.time) base.schedule = { time: '09:00' }
                  set(base); close()
                }}>
                {form.trigger === it.v && <span className="ac-ps-dd__tick"><Ico name="check" size={11} /></span>}
                {it.delay && (
                  <span className="ac-ps-delay" onClick={(e) => { e.stopPropagation(); setDelayFor(it.v) }}>
                    {delayLabel(form.trigger === it.v ? form.delay : 0, t)}
                    {delayFor === it.v && (
                      <span className="ac-ps-delay__pop" onClick={(e) => e.stopPropagation()}>
                        {DELAYS.map((d) => (
                          <button type="button" key={d.v} className="ac-ps-dd__item" onClick={() => { set({ trigger: it.v, delay: d.v }); setDelayFor(false); setCustom(false); close() }}>{t(d.l)}</button>
                        ))}
                        {!custom
                          ? <button type="button" className="ac-ps-dd__item" onClick={() => setCustom(true)}>{t('Boshqa')}</button>
                          : (
                            <span className="ac-ps-delay__custom">
                              <input autoFocus type="number" min="1" className="ac-input" placeholder={t('daqiqa')}
                                onKeyDown={(e) => { if (e.key === 'Enter' && Number(e.target.value) > 0) { set({ trigger: it.v, delay: Math.round(Number(e.target.value)) }); setDelayFor(false); setCustom(false); close() } }} />
                            </span>
                          )}
                      </span>
                    )}
                  </span>
                )}
                {' '}{it.delay ? t(it.l) : t(it.l)}
              </div>
            ))}
          </React.Fragment>
        ))}
      </Drop>
      {form.trigger === 'no_reply_hours' && (
        <div className="ac-ps-line"><span>{t("Oxirgi kiruvchi xabardan o'tgan soat")}:</span>
          <input className="ac-input ac-ps-num" type="number" min="1" value={sch.hours ?? ''} onChange={(e) => setSch({ hours: e.target.value })} /></div>
      )}
      {form.trigger === 'before_date_field' && (
        <div className="ac-ps-line">
          <select className="ac-select" value={sch.field || ''} onChange={(e) => setSch({ field: e.target.value })}>{dateFields.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}</select>
          <input className="ac-input ac-ps-num" type="number" min="0" value={sch.hours ?? ''} onChange={(e) => setSch({ hours: e.target.value })} />
          <span>{t('soat oldin')}</span>
        </div>
      )}
      {form.trigger === 'exact_time' && (
        <div className="ac-ps-line"><input className="ac-input" type="datetime-local" value={sch.at ? toLocalInput(sch.at) : ''} onChange={(e) => setSch({ at: e.target.value ? new Date(e.target.value).toISOString() : '' })} /></div>
      )}
      {form.trigger === 'daily' && (
        <div className="ac-ps-line"><span>{t('Har kuni soat')}</span><input className="ac-input ac-ps-num" style={{ width: 110 }} type="time" value={sch.time || ''} onChange={(e) => setSch({ time: e.target.value })} /></div>
      )}
    </>
  )
}
function toLocalInput(iso) {
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function PipeStageSelect({ pipes, pipelineId, stageKey, onChange, onlyOpen }) {
  const t = useT()
  const pid = pipelineId || 'main'
  const cur = pipes.find((p) => p.id === pid) || pipes[0]
  const stages = (cur?.stages || []).filter((s) => !onlyOpen || s.kind === 'open')
  return (
    <div className="ac-ps-row2">
      <select className="ac-select" value={cur?.id || 'main'} onChange={(e) => {
        const np = pipes.find((p) => p.id === e.target.value)
        const first = (np?.stages || []).find((s) => !onlyOpen || s.kind === 'open')
        onChange({ pipelineId: e.target.value === 'main' ? null : e.target.value, stageKey: first?.key })
      }}>{pipes.map((p) => <option key={p.id} value={p.id}>{p.id === 'main' ? t('Asosiy voronka') : p.name}</option>)}</select>
      <select className="ac-select" value={stageKey || ''} onChange={(e) => onChange({ stageKey: e.target.value })}>
        {stages.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
      </select>
    </div>
  )
}

function ActionFields({ a, set, ctx }) {
  const t = useT()
  const Lbl = ({ children }) => <label className="ac-ps-lbl">{children}</label>
  switch (a.type) {
    case 'create_task':
      return (
        <>
          <div className="ac-ps-line"><Ico name="calendar" size={14} /><span>{t('Bajarish muddati')}:</span>
            <select className="ac-select" value={a.dueMode || 'now'} onChange={(e) => set({ dueMode: e.target.value })}>
              <option value="now">{t('Darhol')}</option><option value="end_of_day">{t('Kun oxirigacha')}</option><option value="days">{t('Necha kundan keyin')}</option><option value="hours">{t('Necha soatdan keyin')}</option>
            </select>
            {(a.dueMode === 'days' || a.dueMode === 'hours') && <input className="ac-input ac-ps-num" type="number" min="0" value={a.dueValue ?? ''} onChange={(e) => set({ dueValue: e.target.value })} />}
          </div>
          <div className="ac-ps-line"><span>{t('Kimga')}:</span>
            <select className="ac-select" value={a.assignee || 'lead'} onChange={(e) => set({ assignee: e.target.value })}>
              <option value="lead">{t("Joriy mas'ul")}</option>{ctx.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select></div>
          <div className="ac-ps-line"><span>{t('Turi')}:</span>
            <select className="ac-select" value={a.taskType || 'call'} onChange={(e) => set({ taskType: e.target.value })}>{TASK_TYPES.map((x) => <option key={x.v} value={x.v}>{t(x.l)}</option>)}</select></div>
          <textarea className="ac-input ac-ps-ta" value={a.text || ''} placeholder={t('Izoh matni')} onChange={(e) => set({ text: e.target.value })} />
        </>
      )
    case 'create_lead':
      return (
        <>
          <Lbl>{t('Yangi bitim qaysi voronka va bosqichda yaratiladi')}</Lbl>
          <PipeStageSelect pipes={ctx.pipes} pipelineId={a.pipelineId} stageKey={a.stageKey} onlyOpen onChange={set} />
          <Lbl>{t('Bitim nomi')}</Lbl>
          <input className="ac-input" value={a.name || ''} placeholder={t('Joriy bitim nomi')} onChange={(e) => set({ name: e.target.value })} />
          <Lbl>{t("Mas'ul")}</Lbl>
          <select className="ac-select" value={a.assignee || 'lead'} onChange={(e) => set({ assignee: e.target.value })}>
            <option value="lead">{t("Joriy mas'ul")}</option>{ctx.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <label className="ac-ps-chk"><input type="checkbox" className="ac-check" checked={a.withContact !== false} onChange={(e) => set({ withContact: e.target.checked })} />{t('Kontakt bilan')}</label>
          <label className="ac-ps-chk"><input type="checkbox" className="ac-check" checked={!!a.copyTags} onChange={(e) => set({ copyTags: e.target.checked })} />{t('Teglarni nusxalash')}</label>
          <label className="ac-ps-chk"><input type="checkbox" className="ac-check" checked={!!a.copyBudget} onChange={(e) => set({ copyBudget: e.target.checked })} />{t('Byudjetni nusxalash')}</label>
        </>
      )
    case 'webhook':
      return (
        <>
          <Lbl>Webhook URL</Lbl>
          <input className="ac-input" value={a.url || ''} placeholder="https://..." onChange={(e) => set({ url: e.target.value })} />
          <div className="ac-ps-hint">{t("Bitim ma'lumotlari POST (JSON) bilan yuboriladi. Ichki manzillar (localhost, 10.*, 192.168.* ...) taqiqlangan.")}</div>
        </>
      )
    case 'change_stage':
      return (<><Lbl>{t('Bitim ko\'chiriladigan bosqich')}</Lbl><PipeStageSelect pipes={ctx.pipes} pipelineId={a.pipelineId} stageKey={a.stageKey} onChange={set} /></>)
    case 'edit_tags':
      return (
        <>
          <Lbl>{t("Qo'shish")}</Lbl><ChipInput value={a.add || []} onChange={(v) => set({ add: v })} suggestions={ctx.tags} placeholder={t('Teg nomi')} />
          <Lbl>{t('Olib tashlash')}</Lbl><ChipInput value={a.remove || []} onChange={(v) => set({ remove: v })} suggestions={ctx.tags} placeholder={t('Teg nomi')} />
        </>
      )
    case 'complete_tasks':
      return (<><Lbl>{t('Vazifa natijasi')}</Lbl><input className="ac-input" value={a.result || ''} placeholder={t('Natija matni')} onChange={(e) => set({ result: e.target.value })} /></>)
    case 'change_assignee':
      return (
        <>
          <div className="ac-ps-line">
            <label className="ac-ps-chk inl"><input type="radio" checked={a.mode !== 'queue'} onChange={() => set({ mode: 'user' })} />{t('Foydalanuvchi')}</label>
            <label className="ac-ps-chk inl"><input type="radio" checked={a.mode === 'queue'} onChange={() => set({ mode: 'queue' })} />{t('Navbat bilan (guruh)')}</label>
          </div>
          {a.mode === 'queue'
            ? <MultiPick options={ctx.members.map((m) => ({ v: m.id, l: m.name }))} value={a.userIds || []} onChange={(v) => set({ userIds: v })} placeholder={t('Barcha foydalanuvchilar')} />
            : <select className="ac-select" value={a.userId || ''} onChange={(e) => set({ userId: e.target.value })}><option value="">—</option>{ctx.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
        </>
      )
    case 'change_field': {
      const fd = ctx.fields.find((f) => `cf:${f.key}` === a.field)
      return (
        <>
          <Lbl>{t('Maydon')}</Lbl>
          <select className="ac-select" value={a.field || ''} onChange={(e) => set({ field: e.target.value, value: '' })}>
            <option value="">—</option>
            {FIELD_TARGETS.map((f) => <option key={f.v} value={f.v}>{t(f.l)}</option>)}
            {ctx.fields.filter((f) => f.active !== false).map((f) => <option key={f.key} value={`cf:${f.key}`}>{f.label}</option>)}
          </select>
          <Lbl>{t('Qiymat')}</Lbl>
          {fd && (fd.type === 'select')
            ? <select className="ac-select" value={a.value ?? ''} onChange={(e) => set({ value: e.target.value })}><option value="" />{(fd.options || []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
            : <input className="ac-input" type={a.field === 'budget' || fd?.type === 'number' ? 'number' : fd?.type === 'date' ? 'date' : 'text'} value={a.value ?? ''} onChange={(e) => set({ value: e.target.value })} />}
        </>
      )
    }
    case 'send_message':
      return (
        <>
          <textarea className="ac-input ac-ps-ta" value={a.text || ''} placeholder={t('Xabar matni')} onChange={(e) => set({ text: e.target.value })} />
          <div className="ac-ps-hint">{t("Xabar bitimning chat kanaliga (Telegram) yuboriladi; kanal bo'lmasa o'tkazib yuboriladi. O'zgaruvchilar: {{name}}, {{phone}}, {{budget}}")}</div>
        </>
      )
    default:
      return null
  }
}

const defaultAction = (type, ctx) => {
  const first = ctx.pipes.find((p) => p.id === 'main')?.stages?.find((s) => s.kind === 'open')
  switch (type) {
    case 'create_task': return { type, text: '', dueMode: 'now', assignee: 'lead', taskType: 'call' }
    case 'create_lead': return { type, pipelineId: null, stageKey: first?.key, withContact: true, assignee: 'lead' }
    case 'change_stage': return { type, pipelineId: null, stageKey: first?.key }
    case 'edit_tags': return { type, add: [], remove: [] }
    case 'change_assignee': return { type, mode: 'user', userId: '', userIds: [] }
    default: return { type }
  }
}

// anchor: {top, left} — katak joylashuvi. initial: mavjud trigger (tahrirlash) yoki null (yangi)
export function TriggerForm({ anchor, initial, actionType, stageKey, ctx, onSave, onDelete, onClose }) {
  const t = useT()
  const unsorted = !stageKey
  const [form, setForm] = useState(() => initial
    ? { trigger: initial.trigger, delay: initial.delay || 0, schedule: initial.schedule || {}, conditions: initial.conditions || [], action: initial.actions?.[0] || defaultAction(actionType, ctx), active: initial.active !== false }
    : { trigger: unsorted ? 'conversation_created' : 'stage_enter', delay: 0, schedule: {}, conditions: [], action: defaultAction(actionType, ctx), active: true })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (p) => setForm((f) => ({ ...f, ...p }))
  const setA = (p) => setForm((f) => ({ ...f, action: { ...f.action, ...p } }))
  const a = form.action
  const meta = actionMeta(a.type)
  const ref = useRef(null)
  const [style, setStyle] = useState({ top: anchor.top, left: anchor.left, visibility: 'hidden' })

  useEffect(() => { // oynadan chiqib ketmasin
    const w = 430
    const left = Math.max(12, Math.min(anchor.left, window.innerWidth - w - 12))
    const h = ref.current?.offsetHeight || 500
    const top = Math.max(70, Math.min(anchor.top, window.innerHeight - Math.min(h, window.innerHeight - 90) - 12))
    setStyle({ top, left, maxHeight: window.innerHeight - top - 12 })
  }, []) // eslint-disable-line
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const problem = () => {
    const has = (v) => String(v ?? '').trim() !== ''
    const sch = form.schedule || {}
    if (form.trigger === 'no_reply_hours' && !(Number(sch.hours) > 0)) return "Soat sonini kiriting"
    if (form.trigger === 'before_date_field' && (!sch.field || !(Number(sch.hours) >= 0) || sch.hours === '')) return 'Sana maydoni va soat sonini kiriting'
    if (form.trigger === 'exact_time' && !sch.at) return 'Aniq vaqtni kiriting'
    if (form.trigger === 'daily' && !sch.time) return 'Vaqtni kiriting'
    if (a.type === 'create_task' && !has(a.text)) return 'Vazifa matnini kiriting'
    if (a.type === 'create_lead' && !a.stageKey) return 'Bosqichni tanlang'
    if (a.type === 'change_stage' && !a.stageKey) return 'Bosqichni tanlang'
    if (a.type === 'edit_tags' && !(a.add || []).length && !(a.remove || []).length) return 'Tegni kiriting'
    if (a.type === 'change_assignee' && a.mode !== 'queue' && !a.userId) return "Mas'ulni tanlang"
    if (a.type === 'change_field' && !has(a.field)) return 'Maydonni tanlang'
    if (a.type === 'send_message' && !has(a.text)) return 'Matnni kiriting'
    if (a.type === 'webhook' && !/^https?:\/\/\S+$/i.test(String(a.url || '').trim())) return "To'g'ri URL kiriting (http:// yoki https://)"
    return ''
  }
  const submit = async () => {
    if (saving) return
    const pr = problem()
    if (pr) { setErr(pr); return }
    setSaving(true); setErr('')
    const conditions = form.conditions.filter((c) => (c.field === 'budget' ? c.from !== undefined && c.from !== '' || c.to !== undefined && c.to !== '' : Array.isArray(c.value) ? c.value.length : String(c.value ?? '').trim()))
      .map((c) => (c.field === 'budget' ? { field: 'budget', from: c.from === '' ? undefined : Number(c.from), to: c.to === '' ? undefined : Number(c.to) } : c))
    const schedule = { ...form.schedule }
    if (schedule.hours !== undefined) schedule.hours = Number(schedule.hours)
    try {
      await onSave({ trigger: form.trigger, delay: form.delay, schedule, conditions, actions: [{ ...a, ...(a.type === 'webhook' ? { url: String(a.url).trim() } : {}) }], active: form.active, name: meta.l })
    } catch (e) { setErr(e?.message || t('Saqlanmadi')) } finally { setSaving(false) }
  }

  return (
    <>
      <div className="ac-ps-popback" />
      <div ref={ref} className="ac-ps-pop" style={style} onMouseDown={(e) => e.stopPropagation()}>
        <div className="ac-ps-pop__head">
          <span className={`ac-ps-pop__ico ${form.active ? 'on' : ''}`}><Ico name="checkCircle" size={22} /></span>
          <div><div>{whenText(form, t)}</div><b>{t(meta.l)}</b></div>
        </div>
        <Conditions conds={form.conditions} setConds={(c) => set({ conditions: c })} ctx={ctx} />
        <div className="ac-ps-pop__body">
          <WhenSelect form={form} set={set} unsorted={unsorted} ctx={ctx} />
          <ActionFields a={a} set={setA} ctx={ctx} />
          {err && <div className="ac-ps-err">{t(err)}</div>}
        </div>
        <div className="ac-ps-pop__foot">
          <button className="ac-btn ac-btn--blue" disabled={saving} onClick={submit}>{t('Tayyor')}</button>
          <button className="ac-btn ac-btn--plain" onClick={onClose}>{t('Bekor qilish')}</button>
          <span className="grow" />
          <span className="ac-ps-foot__st">{form.active ? t('Faol') : t('Faol emas')}</span>
          <span className={`ac-switch ${form.active ? 'on' : ''}`} onClick={() => set({ active: !form.active })} />
          {initial && <button className="ac-btn ac-btn--plain ac-ps-del" onClick={async () => { try { await onDelete() } catch (e) { setErr(e?.message || t('Xatolik')) } }}>{t("O'chirish")}</button>}
        </div>
      </div>
    </>
  )
}

export { defaultAction }
