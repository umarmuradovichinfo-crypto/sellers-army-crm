// amoCRM «Доно» — mahsulot ichidagi AI yordamchi: pastki o'ngdagi avatar tugma («Открыть чат с Доно») va o'ng yon panel,
// ish stolida esa akkaunt nomi ostidagi chat qutisi. Suhbat sessiya davomida saqlanadi (sessionStorage).
import React, { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../lib/apiClient'
import { Ico } from './AmoIcons'
import { useT } from './i18n'
import './i18n/dono.ru.js'
import './dono.css'

const KEY = 'dono:chat'
const OPEN_EVT = 'dono:open'
const SUGGEST = ['Bu bitimda nima muammo?', "Bugunga vazifa qo'y", 'Mijozga nima javob beray?']

const loadChat = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || '[]') } catch { return [] } }
const saveChat = (m) => { try { sessionStorage.setItem(KEY, JSON.stringify(m.slice(-40))) } catch { /* */ } }

// boshqa joydan (ish stoli qutisi) panelni ochib, xabar yuborish
export const openDono = (text) => window.dispatchEvent(new CustomEvent(OPEN_EVT, { detail: { text } }))

// Dono: haqiqiy personaj rasmi (/dono/dono-avatar.webp); rasm yuklanmasa — pastdagi SVG zaxira
export function DonoAvatar({ size = 32 }) {
  const [broken, setBroken] = useState(false)
  if (!broken) {
    return (
      <span className="ac-dono-ava" style={{ width: size, height: size }}>
        <img src="/dono/dono-avatar.webp" alt="Dono" width={size} height={size} draggable={false} onError={() => setBroken(true)} style={{ width: size, height: size, objectFit: 'cover', display: 'block' }} />
      </span>
    )
  }
  return (
    <span className="ac-dono-ava" style={{ width: size, height: size }}>
      {/* Dono: Samarqand firuza fon, oltin hoshiya, do'ppi (bodom naqshli), atlas yoqa, mehribon ko'zlar */}
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id="donoBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1fb5b0" /><stop offset="1" stopColor="#0b5e8a" /></linearGradient>
          <linearGradient id="donoGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe08a" /><stop offset="1" stopColor="#c8921f" /></linearGradient>
          <clipPath id="donoClip"><circle cx="32" cy="32" r="29.5" /></clipPath>
        </defs>
        <circle cx="32" cy="32" r="31" fill="url(#donoGold)" />
        <circle cx="32" cy="32" r="29.5" fill="url(#donoBg)" />
        <g clipPath="url(#donoClip)">
          {/* atlas yoqa */}
          <path d="M8 66c1-11 10-17 24-17s23 6 24 17z" fill="#f2f2ee" />
          <path d="M14 66l5-13M22 66l3-15M30 66l1-16M38 66l-1-16M46 66l-3-15M54 66l-5-13" stroke="#d6463b" strokeWidth="2.4" />
          <path d="M18 66l4-14M34 66l0-16M50 66l-4-14" stroke="#f2b632" strokeWidth="1.6" />
          {/* bo'yin va yuz */}
          <path d="M27 44h10v8c-2 2-8 2-10 0z" fill="#d9a074" />
          <ellipse cx="32" cy="32" rx="12" ry="14" fill="#e8b88c" />
          {/* quloqlar */}
          <ellipse cx="20" cy="33" rx="2" ry="3.2" fill="#d9a074" /><ellipse cx="44" cy="33" rx="2" ry="3.2" fill="#d9a074" />
          {/* ko'zlar va kulgi */}
          <path d="M25 32q2.4-2.4 4.8 0M34.2 32q2.4-2.4 4.8 0" stroke="#3b2418" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          <path d="M28 39q4 3.6 8 0" stroke="#a5503c" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          <path d="M31 33.5q1 3 .2 4" stroke="#c98d62" strokeWidth="1.2" strokeLinecap="round" fill="none" />
          {/* do'ppi: tepasi kengroq, torayib boradigan to'rt qirrali shakl; oq hoshiya; oltin-oq bodom naqsh */}
          <path d="M19.5 26.5L22.5 9.5Q32 6.2 41.5 9.5L44.5 26.5Q32 29.5 19.5 26.5z" fill="#14202c" />
          <path d="M19.2 24.2Q32 27.2 44.8 24.2L44.9 27.4Q32 30.6 19.1 27.4z" fill="#f4f1e8" />
          <path d="M22.5 9.5Q32 6.2 41.5 9.5L41 11.6Q32 9 23 11.6z" fill="#f4f1e8" opacity=".9" />
          {/* markaziy to'rt yaproqli gul */}
          <path d="M32 12.6l2.3 4.2 4.2 2.3-4.2 2.3-2.3 4.2-2.3-4.2-4.2-2.3 4.2-2.3z" fill="url(#donoGold)" />
          <circle cx="32" cy="19.1" r="1.1" fill="#14202c" />
          {/* yon bodomlar (paisley) */}
          <path d="M24.2 15.2q3.6-.8 3.6 2.4-.2 2.8-2.8 3.2 1-1.6-.2-2.6-1.1-.9-.6-3z" fill="#f4f1e8" />
          <path d="M39.8 15.2q-3.6-.8-3.6 2.4.2 2.8 2.8 3.2-1-1.6.2-2.6 1.1-.9.6-3z" fill="#f4f1e8" />
          {/* mayda nuqtalar */}
          <circle cx="22.6" cy="22" r=".8" fill="#e5a93a" /><circle cx="41.4" cy="22" r=".8" fill="#e5a93a" /><circle cx="32" cy="9.9" r=".8" fill="#e5a93a" />
        </g>
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

function useDonoChat() {
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
      const r = await api.post('/crm/dono/chat', { messages: next.filter((m) => !m.error).map(({ role, content }) => ({ role, content })), leadId })
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
    <div className="ac-dono-input">
      <textarea ref={ref} rows={1} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go() } }} />
      <button className="ac-dono-send" disabled={!v.trim() || busy} onClick={go} aria-label="send"><Ico name="send" size={15} /></button>
    </div>
  )
}

export function DonoPanel({ open, onClose, chat }) {
  const t = useT()
  const nav = useNavigate()
  const bodyRef = useRef(null)
  const { msgs, busy, send, clear } = chat
  useEffect(() => { bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight) }, [msgs.length, busy, open])
  if (!open) return null
  return (
    <aside className="ac-dono-panel" role="dialog" aria-label="Dono">
      <div className="ac-dono-panel__head">
        <button className="ac-dono-icon" title={t('Yangi suhbat')} onClick={clear}><Ico name="edit" size={15} /></button>
        <DonoAvatar size={26} />
        <span className="ac-dono-panel__title">{t('DONO')}</span>
        <button className="ac-dono-icon ac-dono-panel__x" title={t('Yopish')} onClick={onClose}><Ico name="close" size={16} /></button>
      </div>
      <div className="ac-dono-panel__body" ref={bodyRef}>
        {!msgs.length && <div className="ac-dono-hello">{t("Xo'sh, bugun nimadan boshlaymiz?")}</div>}
        {msgs.map((m, i) => (
          <div key={i} className={`ac-dono-msg ac-dono-msg--${m.role} ${m.error ? 'err' : ''}`}>
            {m.role === 'assistant' && <DonoAvatar size={22} />}
            <div className="ac-dono-msg__text">
              {m.error ? t(m.content) : m.role === 'assistant' ? <Md text={m.content} /> : m.content}
              {m.actions?.map((a, k) => (
                <div key={k} className="ac-dono-act" onClick={() => a.leadId && nav(`/leads/${a.leadId}`)}>
                  <Ico name={a.type === 'task' ? 'check' : 'note'} size={12} /> {t(a.type === 'task' ? 'Vazifa yaratildi' : "Izoh qo'shildi")}: {a.text}
                </div>
              ))}
            </div>
          </div>
        ))}
        {busy && <div className="ac-dono-msg ac-dono-msg--assistant"><DonoAvatar size={22} /><div className="ac-dono-typing"><i /><i /><i /></div></div>}
      </div>
      <div className="ac-dono-panel__foot">
        <Composer onSend={send} busy={busy} placeholder={t("Donodan so'rang")} autoFocus />
        {!msgs.length && (
          <div className="ac-dono-chips">
            {SUGGEST.map((s) => <button key={s} onClick={() => send(t(s))}>{t(s)}</button>)}
          </div>
        )}
        <div className="ac-dono-note">{t("AI xato qilishi mumkin. Muhim ma'lumotni o'zingiz tekshiring")}</div>
      </div>
    </aside>
  )
}

// global: pastki o'ng burchakdagi tugma + panel (AmoShell ichida)
export default function DonoWidget() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const chat = useDonoChat()
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
  const [hintOff, setHintOff] = useState(() => { try { return sessionStorage.getItem('dono:hint') === '1' } catch { return false } })
  const hideHint = () => { setHintOff(true); try { sessionStorage.setItem('dono:hint', '1') } catch { /* */ } }
  const ask = (q) => { hideHint(); setOpen(true); chat.send(q) }
  return (
    <>
      {!open && !hintOff && chat.leadId && !chat.msgs.length && (
        <div className="ac-dono-hint">
          <button className="ac-dono-icon ac-dono-hint__x" title={t('Yopish')} onClick={hideHint}><Ico name="close" size={12} /></button>
          {t("Ko'zimga bir narsa tashlandi 🤔 Bu bitimda nimadir noto'g'ri. Ko'rsataymi?")}
          <button className="ac-dono-hint__go" onClick={() => ask(t('Bu bitimda nima muammo?'))}>{t("Ko'rsatish")}</button>
        </div>
      )}
      {!open && !onDash && (
        <button className="ac-dono-fab" title={t('Dono bilan chatni ochish')} onClick={() => setOpen(true)}><DonoAvatar size={36} /></button>
      )}
      <DonoPanel open={open} onClose={() => setOpen(false)} chat={chat} />
    </>
  )
}

// ish stoli: akkaunt nomi ostidagi chat qutisi
export function DonoDashBox() {
  const t = useT()
  return (
    <div className="ac-dono-dash">
      <DonoAvatar size={96} />
      <Composer onSend={openDono} placeholder={t("Assalomu alaykum! Men Donoman — sotuvingiz ustozi. Nimadan boshlaymiz?")} />
    </div>
  )
}
