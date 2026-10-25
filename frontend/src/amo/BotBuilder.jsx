// amoCRM Salesbot konstruktori: kanvas (surish, masshtab), qadam tugunlari, ulanish chiziqlari,
// «Следующий шаг» menyusi, triggerlar paneli, «Запуск бота» tuguni va «Превью бота» (mijoz bilan suhbat simulyatsiyasi).
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../lib/apiClient'
import { Ico } from './AmoIcons'
import { useT } from './i18n'
import { useFilterMeta } from './filterState'

export const TRIGGER_LABEL = { stage_enter: "Bosqichga o'tish", lead_created: 'bots§Bitim yaratildi', message_in: 'Kiruvchi xabar' }
export const emptyBot = () => ({ id: null, name: 'Salesbot', active: true, steps: [], startId: null, triggers: [] })

const STEP_TYPES = [
  ['message', 'Xabar yuborish', 'send'], ['note', 'Ichki xabar', 'note'], ['action', 'Amalni bajarish', 'gear'],
  ['condition', 'Shart', 'filter'], ['validator', 'Validator', 'checkCircle'], ['pause', 'Pauza', 'clock'],
  ['distribute', 'Taqsimlash', 'users'], ['start_bot', 'Botni ishga tushirish', 'play'], ['stop', "Botni to'xtatish", 'close'],
]
const TYPE_TITLE = Object.fromEntries(STEP_TYPES.map(([k, l]) => [k, l]))
const rid = () => Math.random().toString(36).slice(2, 9)
const NODE_W = 300
const START = { x: 380, y: 70, w: 170 }

function defaults(type) {
  switch (type) {
    case 'message': return { text: '', buttons: [], wait: false }
    case 'note': return { text: '' }
    case 'action': return { actions: [{ type: 'change_stage', stageKey: '' }] }
    case 'condition': return { branches: [{ id: rid(), rules: [{ field: 'reply', op: 'contains', value: '' }] }] }
    case 'validator': return { kind: 'phone', errorText: "Iltimos, to'g'ri qiymat yozing" }
    case 'pause': return { amount: 1, unit: 'hour' }
    case 'distribute': return { userIds: [] }
    default: return {}
  }
}

// Qadam chiqishlari (portlar): kalit → keyingi qadam qaysi xususiyatda saqlanadi
export function outputs(s, t) {
  switch (s.type) {
    case 'message':
      return (s.buttons || []).length
        ? [...s.buttons.map((b) => ({ key: `btn:${b.id}`, label: b.label || t('Tugma') })), { key: 'else', label: t('Boshqa javob') }]
        : [{ key: 'next', label: t(s.wait ? 'Javobdan keyin' : 'Keyingi qadam') }]
    case 'condition':
      return [...(s.branches || []).map((b, i) => ({ key: `br:${b.id}`, label: `${t('Shart')} ${i + 1}` })), { key: 'else', label: t('Aks holda') }]
    case 'validator':
      return [{ key: 'valid', label: t("To'g'ri") }, { key: 'invalid', label: t("Noto'g'ri (ixtiyoriy)") }]
    case 'start_bot': case 'stop': return []
    default: return [{ key: 'next', label: t('Keyingi qadam') }]
  }
}
const getNext = (s, key) => {
  if (key === 'next') return s.next
  if (key === 'else') return s.elseNext
  if (key === 'valid') return s.validNext
  if (key === 'invalid') return s.invalidNext
  if (key.startsWith('btn:')) return (s.buttons || []).find((b) => `btn:${b.id}` === key)?.next
  if (key.startsWith('br:')) return (s.branches || []).find((b) => `br:${b.id}` === key)?.next
  return null
}
const setNext = (s, key, id) => {
  if (key === 'next') return { ...s, next: id }
  if (key === 'else') return { ...s, elseNext: id }
  if (key === 'valid') return { ...s, validNext: id }
  if (key === 'invalid') return { ...s, invalidNext: id }
  if (key.startsWith('btn:')) return { ...s, buttons: s.buttons.map((b) => (`btn:${b.id}` === key ? { ...b, next: id } : b)) }
  if (key.startsWith('br:')) return { ...s, branches: s.branches.map((b) => (`br:${b.id}` === key ? { ...b, next: id } : b)) }
  return s
}
const unlink = (s, id) => {
  let r = { ...s }
  for (const k of ['next', 'elseNext', 'validNext', 'invalidNext']) if (r[k] === id) r[k] = null
  if (r.buttons) r.buttons = r.buttons.map((b) => (b.next === id ? { ...b, next: null } : b))
  if (r.branches) r.branches = r.branches.map((b) => (b.next === id ? { ...b, next: null } : b))
  return r
}

const ACTIONS = [['change_stage', "bots§Bosqichni o'zgartirish"], ['change_assignee', "Mas'ulni o'zgartirish"], ['edit_tags', "bots§Teg qo'shish"], ['create_task', 'Vazifa yaratish'], ['change_field', "Maydonni o'zgartirish"], ['notify', 'Bildirishnoma']]
const FIELDS = [['name', 'Bitim nomi'], ['value', 'Byudjet'], ['phone', 'Telefon'], ['email', 'Email'], ['source', 'Manba'], ['company', 'Kompaniya']]
const COND_FIELDS = [['reply', 'Mijoz javobi'], ['stage', 'Bosqich'], ['tag', 'Teg'], ['value', 'Byudjet'], ['source', 'Manba'], ['assignee', "Mas'ul"]]
const OPS = [['contains', "o'z ichiga oladi"], ['eq', 'teng'], ['ne', 'teng emas'], ['gt', 'katta'], ['lt', 'kichik'], ['empty', "bo'sh"], ['not_empty', "bo'sh emas"]]

function ActionEditor({ a, onChange, onRemove, meta, t }) {
  const set = (p) => onChange({ ...a, ...p })
  return (
    <div className="ac-bb-act">
      <div className="ac-bb-row">
        <select className="ac-select" value={a.type} onChange={(e) => onChange({ type: e.target.value })}>
          {ACTIONS.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
        </select>
        <button className="ac-bb-x" onClick={onRemove} title={t("O'chirish")}><Ico name="close" size={11} /></button>
      </div>
      {a.type === 'change_stage' && (
        <select className="ac-select" value={a.stageKey || ''} onChange={(e) => set({ stageKey: e.target.value })}>
          <option value="">{t('Bosqichni tanlang')}</option>
          {meta.pipes.map((p) => <optgroup key={p.id} label={p.name}>{p.stages.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</optgroup>)}
        </select>
      )}
      {a.type === 'change_assignee' && (
        <select className="ac-select" value={a.userId || ''} onChange={(e) => set({ userId: e.target.value })}>
          <option value="">{t("Mas'ulni tanlang")}</option>
          {meta.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      )}
      {a.type === 'edit_tags' && <input className="ac-input" placeholder={t('Teg')} value={(a.add || [])[0] || ''} onChange={(e) => set({ add: [e.target.value] })} />}
      {a.type === 'create_task' && (
        <>
          <input className="ac-input" placeholder={t('Vazifa matni')} value={a.text || ''} onChange={(e) => set({ text: e.target.value })} />
          <div className="ac-bb-row"><span className="ac-bb-cap">{t('Muddat (kun)')}</span><input className="ac-input ac-bb-num" type="number" min="0" value={a.dueValue ?? 1} onChange={(e) => set({ dueMode: 'days', dueValue: e.target.value })} /></div>
        </>
      )}
      {a.type === 'change_field' && (
        <>
          <select className="ac-select" value={a.field || ''} onChange={(e) => set({ field: e.target.value })}>
            <option value="">{t('Maydonni tanlang')}</option>
            {FIELDS.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
            {meta.fields.map((f) => <option key={f.key} value={`cf:${f.key}`}>{f.label}</option>)}
          </select>
          <input className="ac-input" placeholder={t('Qiymat ({{reply}} — mijoz javobi)')} value={a.value || ''} onChange={(e) => set({ value: e.target.value })} />
        </>
      )}
      {a.type === 'notify' && <input className="ac-input" placeholder={t('Bildirishnoma matni')} value={a.text || ''} onChange={(e) => set({ text: e.target.value })} />}
    </div>
  )
}

/** Qadam tugunining tahrirlash qismi. Port — har chiqish qatori o'ng chetida. */
function StepBody({ s, update, meta, bots, port, t }) {
  const set = (p) => update({ ...s, ...p })
  const outs = outputs(s, t)
  const portRow = (key, label) => <div className="ac-bb-out" key={key}><span>{label}</span>{port(key)}</div>
  switch (s.type) {
    case 'message':
      return (
        <>
          <textarea className="ac-input ac-bb-text" rows={3} placeholder={t('Xabar matni ({{name}} — mijoz ismi)')} value={s.text || ''} onChange={(e) => set({ text: e.target.value })} />
          {(s.buttons || []).map((b) => (
            <div className="ac-bb-out ac-bb-btn" key={b.id}>
              <input className="ac-input" value={b.label} autoFocus={!b.label} placeholder={t('Tugma matni')} onChange={(e) => set({ buttons: s.buttons.map((x) => (x.id === b.id ? { ...x, label: e.target.value } : x)) })} />
              <button className="ac-bb-x" onClick={() => set({ buttons: s.buttons.filter((x) => x.id !== b.id) })}><Ico name="close" size={11} /></button>
              {port(`btn:${b.id}`)}
            </div>
          ))}
          <a className="ac-bb-add" onClick={() => set({ buttons: [...(s.buttons || []), { id: rid(), label: '' }] })}>+ {t('Tugma')}</a>
          {!(s.buttons || []).length && <label className="ac-bb-check"><input type="checkbox" className="ac-check" checked={!!s.wait} onChange={(e) => set({ wait: e.target.checked })} /> {t('Mijoz javobini kutish')}</label>}
          {(s.buttons || []).length ? portRow('else', t('Boshqa javob')) : portRow('next', outs[0].label)}
        </>
      )
    case 'note':
      return <><textarea className="ac-input ac-bb-text" rows={3} placeholder={t('Operatorlar uchun ichki xabar')} value={s.text || ''} onChange={(e) => set({ text: e.target.value })} />{portRow('next', t('Keyingi qadam'))}</>
    case 'action':
      return (
        <>
          {(s.actions || []).map((a, i) => (
            <ActionEditor key={i} a={a} meta={meta} t={t} onChange={(na) => set({ actions: s.actions.map((x, j) => (j === i ? na : x)) })} onRemove={() => set({ actions: s.actions.filter((_, j) => j !== i) })} />
          ))}
          <a className="ac-bb-add" onClick={() => set({ actions: [...(s.actions || []), { type: 'change_stage', stageKey: '' }] })}>+ {t('Amal')}</a>
          {portRow('next', t('Keyingi qadam'))}
        </>
      )
    case 'condition':
      return (
        <>
          {(s.branches || []).map((b, i) => (
            <div className="ac-bb-branch" key={b.id}>
              <div className="ac-bb-cap">{t('Shart')} {i + 1}</div>
              {b.rules.map((r, j) => {
                const upd = (p) => set({ branches: s.branches.map((x) => (x.id === b.id ? { ...x, rules: x.rules.map((y, k) => (k === j ? { ...y, ...p } : y)) } : x)) })
                return (
                  <div className="ac-bb-rule" key={j}>
                    <select className="ac-select" value={r.field} onChange={(e) => upd({ field: e.target.value })}>
                      {COND_FIELDS.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
                      {meta.fields.map((f) => <option key={f.key} value={`cf:${f.key}`}>{f.label}</option>)}
                    </select>
                    <select className="ac-select" value={r.op} onChange={(e) => upd({ op: e.target.value })}>{OPS.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select>
                    {!['empty', 'not_empty'].includes(r.op) && (r.field === 'stage'
                      ? <select className="ac-select" value={r.value || ''} onChange={(e) => upd({ value: e.target.value })}><option value="" />{meta.pipes.flatMap((p) => p.stages).map((st) => <option key={st.key} value={st.key}>{st.name}</option>)}</select>
                      : <input className="ac-input" value={r.value || ''} placeholder={t('Qiymat')} onChange={(e) => upd({ value: e.target.value })} />)}
                  </div>
                )
              })}
              <div className="ac-bb-out"><a className="ac-bb-add" onClick={() => set({ branches: s.branches.map((x) => (x.id === b.id ? { ...x, rules: [...x.rules, { field: 'reply', op: 'contains', value: '' }] } : x)) })}>+ {t('va')}</a>
                {s.branches.length > 1 && <button className="ac-bb-x" onClick={() => set({ branches: s.branches.filter((x) => x.id !== b.id) })}><Ico name="close" size={11} /></button>}
                {port(`br:${b.id}`)}</div>
            </div>
          ))}
          <a className="ac-bb-add" onClick={() => set({ branches: [...(s.branches || []), { id: rid(), rules: [{ field: 'reply', op: 'contains', value: '' }] }] })}>+ {t('Shart')}</a>
          {portRow('else', t('Aks holda'))}
        </>
      )
    case 'validator':
      return (
        <>
          <div className="ac-bb-row"><span className="ac-bb-cap">{t('Oxirgi javob')}</span>
            <select className="ac-select" value={s.kind} onChange={(e) => set({ kind: e.target.value })}>
              {[['phone', 'Telefon'], ['email', 'Email'], ['number', 'Raqam'], ['any', "Bo'sh emas"]].map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
            </select></div>
          <input className="ac-input" placeholder={t("Noto'g'ri bo'lsa yuboriladigan matn")} value={s.errorText || ''} onChange={(e) => set({ errorText: e.target.value })} />
          <select className="ac-select" value={s.saveTo || ''} onChange={(e) => set({ saveTo: e.target.value })}>
            <option value="">{t('Javobni maydonga saqlamaslik')}</option>
            {FIELDS.map(([k, l]) => <option key={k} value={k}>{t('Saqlash')}: {t(l)}</option>)}
            {meta.fields.map((f) => <option key={f.key} value={`cf:${f.key}`}>{t('Saqlash')}: {f.label}</option>)}
          </select>
          {portRow('valid', t("To'g'ri"))}{portRow('invalid', t("Noto'g'ri (ixtiyoriy)"))}
        </>
      )
    case 'pause':
      return (
        <>
          <div className="ac-bb-row">
            <input className="ac-input ac-bb-num" type="number" min="1" value={s.amount ?? 1} onChange={(e) => set({ amount: e.target.value })} />
            <select className="ac-select" value={s.unit} onChange={(e) => set({ unit: e.target.value })}>{[['min', 'daqiqa'], ['hour', 'soat'], ['day', 'kun']].map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select>
          </div>
          {portRow('next', t('Keyingi qadam'))}
        </>
      )
    case 'distribute':
      return (
        <>
          <div className="ac-bb-cap">{t("Mas'ullar navbat bilan")}</div>
          <div className="ac-bb-users">
            {meta.members.map((m) => (
              <label key={m.id} className="ac-bb-check"><input type="checkbox" className="ac-check" checked={(s.userIds || []).includes(m.id)}
                onChange={(e) => set({ userIds: e.target.checked ? [...(s.userIds || []), m.id] : s.userIds.filter((x) => x !== m.id) })} /> {m.name}</label>
            ))}
          </div>
          {portRow('next', t('Keyingi qadam'))}
        </>
      )
    case 'start_bot':
      return (
        <select className="ac-select" value={s.botId || ''} onChange={(e) => set({ botId: e.target.value })}>
          <option value="">{t('Botni tanlang')}</option>
          {bots.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )
    default:
      return <div className="ac-bb-cap">{t("Bot shu yerda to'xtaydi")}</div>
  }
}

/** «Превью бота»: qadamlarni mijoz suhbatida sinab ko'rish (amallar bajarilmaydi, faqat ko'rsatiladi). */
function Preview({ steps, startId, onClose, t }) {
  const byId = useMemo(() => new Map(steps.map((s) => [s.id, s])), [steps])
  const [log, setLog] = useState([])
  const [waiting, setWaiting] = useState(null)
  const [text, setText] = useState('')
  const lastReply = useRef('')
  const push = (m) => setLog((l) => [...l, m])
  const run = (id) => {
    for (let i = 0; i < 40; i++) {
      if (!id) { push({ sys: t('Bot yakunlandi') }); setWaiting(null); return }
      const s = byId.get(id)
      if (!s) { push({ sys: t('Qadam topilmadi') }); return }
      if (s.type === 'message') {
        const btns = (s.buttons || []).filter((b) => b.label)
        push({ bot: (s.text || '').replace(/\{\{\s*reply\s*\}\}/g, lastReply.current).replace(/\{\{\s*name\s*\}\}/g, t('Aziz')), btns })
        if (btns.length || s.wait) { setWaiting(s); return }
        id = s.next
      } else if (s.type === 'validator') {
        const v = lastReply.current.trim()
        const ok = s.kind === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) : s.kind === 'phone' ? v.replace(/\D/g, '').length >= 9 : s.kind === 'number' ? /^-?\d+([.,]\d+)?$/.test(v) : v.length > 0
        if (ok) id = s.validNext || s.next
        else if (s.invalidNext) id = s.invalidNext
        else { if (s.errorText) push({ bot: s.errorText, btns: [] }); setWaiting(s); return }
      } else if (s.type === 'condition') {
        const hit = (s.branches || []).find((b) => b.rules.every((r) => r.field !== 'reply' ? false
          : r.op === 'contains' ? lastReply.current.toLowerCase().includes(String(r.value || '').toLowerCase())
            : r.op === 'eq' ? lastReply.current.trim().toLowerCase() === String(r.value || '').trim().toLowerCase()
              : r.op === 'ne' ? lastReply.current.trim().toLowerCase() !== String(r.value || '').trim().toLowerCase()
                : r.op === 'empty' ? !lastReply.current.trim() : r.op === 'not_empty' ? !!lastReply.current.trim() : false))
        push({ sys: `${t('Shart')}: ${hit ? `${t('Shart')} ${s.branches.indexOf(hit) + 1}` : t('Aks holda')}` })
        id = hit ? hit.next : s.elseNext
      } else if (s.type === 'stop') { push({ sys: t("Bot to'xtatildi") }); setWaiting(null); return }
      else if (s.type === 'start_bot') { push({ sys: t('Boshqa bot ishga tushadi') }); setWaiting(null); return }
      else { push({ sys: `${t(TYPE_TITLE[s.type])}${s.type === 'note' && s.text ? `: ${s.text}` : ''}${s.type === 'pause' ? `: ${s.amount} ${t(s.unit === 'day' ? 'kun' : s.unit === 'min' ? 'daqiqa' : 'soat')}` : ''}` }); id = s.next }
    }
  }
  const started = useRef(false) // dev StrictMode effektni ikki marta chaqiradi
  useEffect(() => { if (started.current) return; started.current = true; push({ sys: t('Bot ishga tushdi') }); run(startId) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const reply = (v) => {
    const val = String(v || '').trim()
    if (!val || !waiting) return
    push({ me: val }); setText(''); lastReply.current = val
    const s = waiting; setWaiting(null)
    if (s.type === 'message') {
      const btns = (s.buttons || []).filter((b) => b.label)
      const hit = btns.find((b, i) => b.label.trim().toLowerCase() === val.toLowerCase() || val === String(i + 1))
      run(hit ? hit.next : btns.length ? s.elseNext || s.next : s.next)
    } else run(s.id)
  }
  return (
    <div className="ac-bb-preview">
      <div className="ac-bb-preview__head">{t("Botni sinash")}<button className="ac-bb-x" onClick={onClose}><Ico name="close" size={13} /></button></div>
      <div className="ac-bb-preview__log">
        {log.map((m, i) => m.sys ? <div key={i} className="ac-bb-pv-sys">{m.sys}</div> : m.me ? <div key={i} className="ac-bb-pv-me">{m.me}</div> : (
          <div key={i} className="ac-bb-pv-bot">{m.bot}{m.btns?.length > 0 && <div className="ac-bb-pv-btns">{m.btns.map((b) => <button key={b.id} onClick={() => reply(b.label)}>{b.label}</button>)}</div>}</div>
        ))}
      </div>
      <div className="ac-bb-preview__input">
        <input className="ac-input" value={text} placeholder={t(waiting ? 'Mijoz javobi…' : 'Bot javob kutmayapti')} disabled={!waiting} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && reply(text)} />
        <button className="ac-btn ac-btn--blue ac-btn--sm" disabled={!waiting} onClick={() => reply(text)}><Ico name="send" size={13} /></button>
      </div>
    </div>
  )
}

export default function BotBuilder({ bot, canEdit, onClose }) {
  const t = useT()
  const fm = useFilterMeta()
  const [name, setName] = useState(bot.name)
  const [steps, setSteps] = useState(bot.steps || [])
  const [startId, setStartId] = useState(bot.startId || null)
  const [triggers, setTriggers] = useState(bot.triggers || [])
  const [view, setView] = useState({ x: 0, y: 0, z: 1 })
  const [ports, setPorts] = useState({})
  const [linking, setLinking] = useState(null) // { from: 'stepId|key', x, y }
  const [menu, setMenu] = useState(null) // { from, x, y, sx, sy }
  const [nodeMenu, setNodeMenu] = useState(null)
  const [trigAdd, setTrigAdd] = useState(false)
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [bots, setBots] = useState([])
  const canvasRef = useRef(null)
  const layerRef = useRef(null)
  const dirty = useRef(false)
  useEffect(() => { api.get('/crm/salesbots').then((r) => setBots((r.bots || []).filter((b) => b.id !== bot.id))).catch(() => {}) }, [bot.id])
  useEffect(() => { const h = (e) => e.key === 'Escape' && (setMenu(null), setNodeMenu(null), setLinking(null)); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [])

  const meta = useMemo(() => {
    const pipes = [{ id: 'main', name: t('Asosiy voronka') }, ...fm.pipelines.map((p) => ({ id: p.id, name: p.name }))]
      .map((p) => ({ ...p, stages: fm.stages.filter((s) => (s.pipelineId || 'main') === p.id).map((s) => ({ key: s.key || s.id, name: s.name })) }))
    return { pipes, members: fm.members, fields: fm.fields.filter((f) => f.active !== false) }
  }, [fm, t])

  const change = (fn) => { dirty.current = true; setSteps(fn) }
  const updateStep = (ns) => change((list) => list.map((x) => (x.id === ns.id ? ns : x)))

  // portlarning kanvasdagi koordinatalari (DOM o'lchovidan)
  useLayoutEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    const lr = layer.getBoundingClientRect()
    const next = {}
    layer.querySelectorAll('[data-port]').forEach((el) => {
      const r = el.getBoundingClientRect()
      next[el.dataset.port] = { x: (r.left + r.width / 2 - lr.left) / view.z, y: (r.top + r.height / 2 - lr.top) / view.z }
    })
    if (JSON.stringify(next) !== JSON.stringify(ports)) setPorts(next)
  })

  const toCanvas = (cx, cy) => {
    const r = canvasRef.current.getBoundingClientRect()
    return { x: (cx - r.left - view.x) / view.z, y: (cy - r.top - view.y) / view.z }
  }
  // Umumiy surish: fon (pan), tugun (ko'chirish), port (ulash)
  const drag = (e, kind, payload) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const sx = e.clientX, sy = e.clientY
    const v0 = view
    const s0 = payload?.step
    const move = (ev) => {
      if (kind === 'pan') setView({ ...v0, x: v0.x + ev.clientX - sx, y: v0.y + ev.clientY - sy })
      if (kind === 'node') change((list) => list.map((x) => (x.id === s0.id ? { ...x, x: Math.round(s0.x + (ev.clientX - sx) / v0.z), y: Math.round(s0.y + (ev.clientY - sy) / v0.z) } : x)))
      if (kind === 'link') setLinking({ from: payload.from, ...toCanvas(ev.clientX, ev.clientY) })
    }
    const up = (ev) => {
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up)
      if (kind !== 'link') return
      setLinking(null)
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-node]')?.dataset.node
      const [fromId] = payload.from.split('|')
      if (target && target !== fromId) connect(payload.from, target)
      else if (!target) {
        const p = toCanvas(ev.clientX, ev.clientY)
        const r = canvasRef.current.getBoundingClientRect()
        setMenu({ from: payload.from, x: p.x, y: p.y, sx: ev.clientX - r.left, sy: ev.clientY - r.top })
      }
    }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }
  const connect = (from, toId) => {
    const [fromId, ...rest] = from.split('|')
    const key = rest.join('|')
    dirty.current = true
    if (fromId === 'start') { setStartId(toId); return }
    change((list) => list.map((x) => (x.id === fromId ? setNext(x, key, toId) : x)))
  }
  const addStep = (type) => {
    const s = { id: rid(), type, x: Math.round(menu.x), y: Math.round(menu.y - 20), ...defaults(type) }
    change((list) => [...list, s])
    if (menu.from) setTimeout(() => connect(menu.from, s.id))
    setMenu(null)
  }
  const removeStep = (id) => {
    change((list) => list.filter((x) => x.id !== id).map((x) => unlink(x, id)))
    if (startId === id) setStartId(null)
    setNodeMenu(null)
  }
  const cloneStep = (s) => {
    const c = { ...JSON.parse(JSON.stringify(s)), id: rid(), x: s.x + 40, y: s.y + 40, next: null, elseNext: null, validNext: null, invalidNext: null }
    if (c.buttons) c.buttons = c.buttons.map((b) => ({ ...b, id: rid(), next: null }))
    if (c.branches) c.branches = c.branches.map((b) => ({ ...b, id: rid(), next: null }))
    change((list) => [...list, c]); setNodeMenu(null)
  }

  const save = async () => {
    setBusy(true); setErr('')
    const body = { name: name.trim() || 'Salesbot', steps, startId, triggers, active: bot.active !== false }
    try {
      if (bot.id) await api.put(`/crm/salesbots/${bot.id}`, body)
      else await api.post('/crm/salesbots', body)
      dirty.current = false
      onClose(true)
    } catch (e) { setErr(e?.data?.message || e?.message || t('Xatolik yuz berdi')) } finally { setBusy(false) }
  }
  const close = () => { if (!dirty.current || window.confirm(t("Saqlanmagan o'zgarishlar yo'qoladi. Yopilsinmi?"))) onClose(false) }
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ name, steps, startId, triggers }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${(name || 'salesbot').replace(/[^\w-]+/g, '_')}.json`; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const zoom = (d) => setView((v) => ({ ...v, z: Math.min(1.6, Math.max(0.4, Math.round((v.z + d) * 10) / 10)) }))

  // ulanish chiziqlari
  const edges = []
  const inPoint = (id) => { const s = steps.find((x) => x.id === id); return s ? { x: s.x, y: s.y + 20 } : null }
  const curve = (a, b) => { const dx = Math.max(40, Math.abs(b.x - a.x) / 2); return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}` }
  if (startId && ports['start|next'] && inPoint(startId)) edges.push({ k: 'start', d: curve(ports['start|next'], inPoint(startId)) })
  for (const s of steps) for (const o of outputs(s, t)) {
    const to = getNext(s, o.key)
    const a = ports[`${s.id}|${o.key}`], b = to && inPoint(to)
    if (a && b) edges.push({ k: `${s.id}|${o.key}`, d: curve(a, b), from: s.id, key: o.key })
  }
  const port = (sid) => (key) => (
    <span className={`ac-bb-port ${getNext(steps.find((x) => x.id === sid) || {}, key) ? 'on' : ''}`} data-port={`${sid}|${key}`}
      onMouseDown={(e) => canEdit && drag(e, 'link', { from: `${sid}|${key}` })}
      onDoubleClick={() => canEdit && change((list) => list.map((x) => (x.id === sid ? setNext(x, key, null) : x)))} title={t("Ulash uchun suring; ikki marta bosish — uzish")} />
  )

  return createPortal(
    <div className="ac-bb">
      <div className="ac-bb__head">
        <input className="ac-bb__name" value={name} onChange={(e) => { dirty.current = true; setName(e.target.value) }} disabled={!canEdit} />
        <span className="grow" />
        {err && <span className="ac-bb__err">{err}</span>}
        <button className="ac-bb__cancel" onClick={close}>{t('Bekor qilish')}</button>
        {canEdit && <button className="ac-btn ac-btn--blue" disabled={busy} onClick={save}>{t('Saqlash')}</button>}
        <button className="ac-bb__close" onClick={close}><Ico name="close" size={16} /></button>
      </div>
      <div className="ac-bb__canvas" ref={canvasRef} onScroll={(e) => { e.currentTarget.scrollLeft = 0; e.currentTarget.scrollTop = 0 }} onMouseDown={(e) => { setMenu(null); setNodeMenu(null); setTrigAdd(false); drag(e, 'pan') }}>
        <div className="ac-bb__tools" onMouseDown={(e) => e.stopPropagation()}>
          <button onClick={() => zoom(0.1)} title={t('Kattalashtirish')}><Ico name="plus" size={14} /></button>
          <button onClick={() => zoom(-0.1)} title={t('Kichraytirish')}><span className="ac-bb__minus">−</span></button>
          <button onClick={() => setView({ x: 0, y: 0, z: 1 })} title={t('Markazga')}><Ico name="dragDots" size={14} /></button>
          <button onClick={exportJson} title={t('Eksport (JSON)')}><Ico name="download" size={14} /></button>
          <button className="wide" onClick={() => setPreview(true)} disabled={!startId}><Ico name="play" size={13} /> {t('Botni sinash')}</button>
        </div>
        <div className="ac-bb__layer" ref={layerRef} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
          <svg className="ac-bb__edges">
            {edges.map((e) => <path key={e.k} d={e.d} />)}
            {linking && ports[linking.from] && <path className="tmp" d={curve(ports[linking.from], linking)} />}
          </svg>

          {/* Triggerlar paneli */}
          <div className="ac-bb-trig" style={{ left: 40, top: 40 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="ac-bb-trig__title">{t('Triggerlar')}</div>
            <p>{t("Botni qoidalar bo'yicha avtomatik ishga tushiring yoki bitim kartochkasidan qo'lda ishga tushiring")}</p>
            <div className="ac-bb-trig__list">
              {triggers.map((tr, i) => (
                <span key={i} className="ac-bots__chip">{t(TRIGGER_LABEL[tr.type])}{tr.type === 'stage_enter' && tr.stageKey ? `: ${meta.pipes.flatMap((p) => p.stages).find((s) => s.key === tr.stageKey)?.name || ''}` : ''}
                  {canEdit && <i onClick={() => { dirty.current = true; setTriggers(triggers.filter((_, j) => j !== i)) }}>×</i>}</span>
              ))}
            </div>
            {canEdit && (trigAdd ? (
              <div className="ac-bb-trig__add">
                <select className="ac-select" defaultValue="" onChange={(e) => {
                  const v = e.target.value
                  if (!v) return
                  const [type, pipelineId, stageKey] = v.split('|')
                  dirty.current = true
                  setTriggers([...triggers, type === 'stage_enter' ? { type, pipelineId, stageKey } : { type }]); setTrigAdd(false)
                }}>
                  <option value="">{t('Trigger turini tanlang')}</option>
                  <option value="lead_created">{t(TRIGGER_LABEL.lead_created)}</option>
                  <option value="message_in">{t(TRIGGER_LABEL.message_in)}</option>
                  {meta.pipes.map((p) => <optgroup key={p.id} label={`${t(TRIGGER_LABEL.stage_enter)} — ${p.name}`}>{p.stages.map((s) => <option key={s.key} value={`stage_enter|${p.id}|${s.key}`}>{s.name}</option>)}</optgroup>)}
                </select>
              </div>
            ) : <button className="ac-bb-trig__btn" onClick={() => setTrigAdd(true)}>+ {t('Trigger')}</button>)}
          </div>

          {/* «Запуск бота» */}
          <div className="ac-bb-start" style={{ left: START.x, top: START.y, width: START.w }}>
            <Ico name="play" size={13} /> {t('Botni ishga tushirish')}
            <span className={`ac-bb-port ${startId ? 'on' : ''}`} data-port="start|next" onMouseDown={(e) => canEdit && drag(e, 'link', { from: 'start|next' })} />
          </div>
          {!steps.length && <div className="ac-bb-hint" style={{ left: START.x + START.w + 30, top: START.y - 4 }}>{t("Birinchi qadamni qo'shish uchun nuqtadan chiziqni bo'sh joyga torting")}</div>}

          {steps.map((s, i) => (
            <div key={s.id} className={`ac-bb-node ac-bb-node--${s.type}`} data-node={s.id} style={{ left: s.x, top: s.y, width: NODE_W }} onMouseDown={(e) => e.stopPropagation()}>
              <div className="ac-bb-node__head" onMouseDown={(e) => canEdit && drag(e, 'node', { step: s })}>
                <span className="ac-bb-node__num">{i + 1}</span>
                <span className="ac-bb-node__title">{t(TYPE_TITLE[s.type])}</span>
                {startId === s.id && <span className="ac-bb-node__first">{t('bots§Boshlanish')}</span>}
                {canEdit && <button className="ac-bb-node__dots" onMouseDown={(e) => e.stopPropagation()} onClick={() => setNodeMenu(nodeMenu === s.id ? null : s.id)}><Ico name="dots" size={14} /></button>}
                {nodeMenu === s.id && (
                  <div className="ac-bb-nodemenu" onMouseDown={(e) => e.stopPropagation()}>
                    <div onClick={() => { setStartId(s.id); dirty.current = true; setNodeMenu(null) }}>{t('Birinchi qadam qilish')}</div>
                    <div onClick={() => cloneStep(s)}>{t('Nusxa olish')}</div>
                    <div className="danger" onClick={() => removeStep(s.id)}>{t("O'chirish")}</div>
                  </div>
                )}
              </div>
              <fieldset className="ac-bb-node__body" disabled={!canEdit}>
                <StepBody s={s} update={updateStep} meta={meta} bots={bots} port={port(s.id)} t={t} />
              </fieldset>
            </div>
          ))}
        </div>

        {/* «Следующий шаг» menyusi */}
        {menu && (
          <div className="ac-bb-menu" style={{ left: Math.min(menu.sx, (canvasRef.current?.clientWidth || 9999) - 240), top: Math.max(8, Math.min(menu.sy, (canvasRef.current?.clientHeight || 9999) - 420)) }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="ac-bb-menu__title">{t('Keyingi qadam')}</div>
            {STEP_TYPES.map(([k, l, ico]) => <div key={k} className="ac-bb-menu__item" onClick={() => addStep(k)}><Ico name={ico} size={14} /> {t(l)}</div>)}
          </div>
        )}
        {preview && <Preview steps={steps} startId={startId} t={t} onClose={() => setPreview(false)} />}
      </div>
    </div>,
    document.body,
  )
}
