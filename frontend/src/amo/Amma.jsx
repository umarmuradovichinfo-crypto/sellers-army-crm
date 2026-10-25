// amoCRM «Амма» — mahsulot ichidagi AI yordamchi: pastki o'ngdagi avatar tugma («Открыть чат с Аммой») va o'ng yon panel,
// ish stolida esa akkaunt nomi ostidagi chat qutisi. Suhbat sessiya davomida saqlanadi (sessionStorage).
import React, { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../lib/apiClient'
import { Ico } from './AmoIcons'
import { useT } from './i18n'
import './i18n/amma.ru.js'
import './amma.css'

const KEY = 'amma:chat'
const OPEN_EVT = 'amma:open'
const SUGGEST = ['Bu bitimda nima muammo?', "Bugunga vazifa qo'y", 'Mijozga nima javob beray?']

const loadChat = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || '[]') } catch { return [] } }
const saveChat = (m) => { try { sessionStorage.setItem(KEY, JSON.stringify(m.slice(-40))) } catch { /* */ } }

// boshqa joydan (ish stoli qutisi) panelni ochib, xabar yuborish
export const openAmma = (text) => window.dispatchEvent(new CustomEvent(OPEN_EVT, { detail: { text } }))

export function AmmaAvatar({ size = 32 }) {
  return (
    <span className="ac-amma-ava" style={{ width: size, height: size }}>
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
        <defs><linearGradient id="ammaG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#872fe4" /><stop offset="1" stopColor="#3fbafe" /></linearGradient></defs>
        <circle cx="16" cy="16" r="16" fill="url(#ammaG)" />
        <path d="M16 6.5l2.1 6.2 6.4 2.3-6.4 2.3L16 23.5l-2.1-6.2-6.4-2.3 6.4-2.3z" fill="#fff" />
      </svg>
    </span>
  )
}

// **qalin**, `kod` va «- » ro'yxatlar — qisqa markdown
function inline(s) {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p.startsWith('`') && p.endsWith('`') && p.length > 1 ? <code key={i}>{p.slice(1, -1)}</code> : p)
}
function Md({ text }) {
  const out = []
  let list = null
  text.split('\n').forEach((line, i) => {
    const m = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/)
    if (m) { (list ||= []).push(<li key={i}>{inline(m[1])}</li>); return }
    if (list) { out.push(<ul key={`u${i}`}>{list}</ul>); list = null }
    const h = line.match(/^#{1,4}\s+(.*)$/)
    if (h) out.push(<p key={i} className="h">{inline(h[1])}</p>)
    else if (line.trim()) out.push(<p key={i}>{inline(line)}</p>)
  })
  if (list) out.push(<ul key="ul-end">{list}</ul>)
  return <>{out}</>
}

function useAmmaChat() {
  const [msgs, setMsgs] = useState(loadChat)
  const [busy, setBusy] = useState(false)
  const loc = useLocation()
  const leadId = (loc.pathname.match(/^\/leads\/detail\/([^/]+)/) || [])[1]
  const send = async (text) => {
    const q = String(text || '').trim()
    if (!q || busy) return
    const next = [...msgs, { role: 'user', content: q }]
    setMsgs(next); saveChat(next); setBusy(true)
    try {
      const r = await api.post('/crm/amma/chat', { messages: next.filter((m) => !m.error).map(({ role, content }) => ({ role, content })), leadId })
      const done = [...next, { role: 'assistant', content: r.reply || '…', actions: r.actions || [] }]
      setMsgs(done); saveChat(done)
      if (r.actions?.length) window.dispatchEvent(new CustomEvent('amo:lead-changed', { detail: { id: leadId } }))
    } catch (e) {
      const done = [...next, { role: 'assistant', content: e?.message || 'Xatolik', error: true }]
      setMsgs(done); saveChat(done)
    } finally { setBusy(false) }
  }
  const clear = () => { setMsgs([]); saveChat([]) }
  return { msgs, busy, send, clear, leadId }
}

function Composer({ onSend, busy, placeholder, autoFocus }) {
  const [v, setV] = useState('')
  const ref = useRef(null)
  useEffect(() => { if (autoFocus) ref.current?.focus() }, [autoFocus])
  const go = () => { if (!v.trim() || busy) return; onSend(v); setV('') }
  return (
    <div className="ac-amma-input">
      <textarea ref={ref} rows={1} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go() } }} />
      <button className="ac-amma-send" disabled={!v.trim() || busy} onClick={go} aria-label="send"><Ico name="send" size={15} /></button>
    </div>
  )
}

export function AmmaPanel({ open, onClose, chat }) {
  const t = useT()
  const nav = useNavigate()
  const bodyRef = useRef(null)
  const { msgs, busy, send, clear } = chat
  useEffect(() => { bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight) }, [msgs.length, busy, open])
  if (!open) return null
  return (
    <aside className="ac-amma-panel" role="dialog" aria-label="Amma">
      <div className="ac-amma-panel__head">
        <button className="ac-amma-icon" title={t('Yangi suhbat')} onClick={clear}><Ico name="edit" size={15} /></button>
        <AmmaAvatar size={26} />
        <span className="ac-amma-panel__title">{t('AMMA')}</span>
        <button className="ac-amma-icon ac-amma-panel__x" title={t('Yopish')} onClick={onClose}><Ico name="close" size={16} /></button>
      </div>
      <div className="ac-amma-panel__body" ref={bodyRef}>
        {!msgs.length && <div className="ac-amma-hello">{t('Bugun nima bilan ishlaymiz?')}</div>}
        {msgs.map((m, i) => (
          <div key={i} className={`ac-amma-msg ac-amma-msg--${m.role} ${m.error ? 'err' : ''}`}>
            {m.role === 'assistant' && <AmmaAvatar size={22} />}
            <div className="ac-amma-msg__text">
              {m.error ? t(m.content) : m.role === 'assistant' ? <Md text={m.content} /> : m.content}
              {m.actions?.map((a, k) => (
                <div key={k} className="ac-amma-act" onClick={() => a.leadId && nav(`/leads/detail/${a.leadId}`)}>
                  <Ico name={a.type === 'task' ? 'check' : 'note'} size={12} /> {t(a.type === 'task' ? 'Vazifa yaratildi' : "Izoh qo'shildi")}: {a.text}
                </div>
              ))}
            </div>
          </div>
        ))}
        {busy && <div className="ac-amma-msg ac-amma-msg--assistant"><AmmaAvatar size={22} /><div className="ac-amma-typing"><i /><i /><i /></div></div>}
      </div>
      <div className="ac-amma-panel__foot">
        <Composer onSend={send} busy={busy} placeholder={t("Ammadan so'rang")} autoFocus />
        {!msgs.length && (
          <div className="ac-amma-chips">
            {SUGGEST.map((s) => <button key={s} onClick={() => send(t(s))}>{t(s)}</button>)}
          </div>
        )}
        <div className="ac-amma-note">{t("AI xato qilishi mumkin. Muhim ma'lumotni o'zingiz tekshiring")}</div>
      </div>
    </aside>
  )
}

// global: pastki o'ng burchakdagi tugma + panel (AmoShell ichida)
export default function AmmaWidget() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const chat = useAmmaChat()
  const loc = useLocation()
  const sendRef = useRef(chat.send)
  sendRef.current = chat.send
  useEffect(() => {
    const h = (e) => { setOpen(true); if (e.detail?.text) sendRef.current(e.detail.text) }
    window.addEventListener(OPEN_EVT, h)
    return () => window.removeEventListener(OPEN_EVT, h)
  }, [])
  const onDash = loc.pathname === '/dashboard' || loc.pathname === '/'
  // bitim kartochkasida bir marta taklif (amoCRM kabi); yopilgani sessiyada eslab qolinadi
  const [hintOff, setHintOff] = useState(() => { try { return sessionStorage.getItem('amma:hint') === '1' } catch { return false } })
  const hideHint = () => { setHintOff(true); try { sessionStorage.setItem('amma:hint', '1') } catch { /* */ } }
  const ask = (q) => { hideHint(); setOpen(true); chat.send(q) }
  return (
    <>
      {!open && !hintOff && chat.leadId && !chat.msgs.length && (
        <div className="ac-amma-hint">
          <button className="ac-amma-icon ac-amma-hint__x" title={t('Yopish')} onClick={hideHint}><Ico name="close" size={12} /></button>
          {t("Menimcha, bu bitimda nimadir noto'g'ri 🤔 Aynan nima ekanini ko'rsataymi?")}
          <button className="ac-amma-hint__go" onClick={() => ask(t('Bu bitimda nima muammo?'))}>{t("Ko'rsatish")}</button>
        </div>
      )}
      {!open && !onDash && (
        <button className="ac-amma-fab" title={t('Amma bilan chatni ochish')} onClick={() => setOpen(true)}><AmmaAvatar size={36} /></button>
      )}
      <AmmaPanel open={open} onClose={() => setOpen(false)} chat={chat} />
    </>
  )
}

// ish stoli: akkaunt nomi ostidagi chat qutisi
export function AmmaDashBox() {
  const t = useT()
  return (
    <div className="ac-amma-dash">
      <AmmaAvatar size={58} />
      <Composer onSend={openAmma} placeholder={t('Salom, men Ammaman. Ishga tayyorman! Nimadan boshlaymiz?')} />
    </div>
  )
}
