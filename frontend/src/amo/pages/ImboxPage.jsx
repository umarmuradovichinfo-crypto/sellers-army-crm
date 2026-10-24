// amoCRM imBox (/imbox, /imbox/:leadId): chapda suhbatlar ro'yxati (325px), o'ngda tanlangan bitim lentasi.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { crmService } from '../../services/crm.service'
import { Ico } from '../AmoIcons'
import { DotsMenu, useOutside } from '../TopBar'
import { feedDate, dmy, hm, relDay } from '../format'
import { useT } from '../i18n'
import { SysLine, CallNote, TaskNote, NoteItem, MsgGroup, PersonAvatar, convNum, TemplatePicker } from './LeadCard'
import '../i18n/imbox.ru.js'
import '../leadcard.css'
import '../imbox.css'

const REFRESH_MS = 15000

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


// Ketma-ket bir kanal xabarlari bitta suhbat blokiga (amoCRM)
function chatGroups(items) {
  const out = []
  for (const it of items) {
    const g = out[out.length - 1]
    if (it.kind === 'msg' && g?.kind === 'chat' && g.channel === it.m.channel && new Date(g.at).toDateString() === new Date(it.at).toDateString()) g.msgs.push(it.m)
    else if (it.kind === 'msg') out.push({ kind: 'chat', channel: it.m.channel, at: it.at, msgs: [it.m] })
    else out.push(it)
  }
  return out
}

function listDate(iso, t) {
  if (!iso) return ''
  const r = relDay(iso)
  return r ? `${t(r)} ${hm(iso)}` : `${dmy(iso)} ${hm(iso)}`
}

// Manba ikonkasi: kanal (instagram | facebook | telegram), bo'lmasa manba nomidan
function chanOf(c) {
  if (c.channel) return c.channel
  return /telegram/i.test(c.source || '') ? 'telegram' : /facebook|messenger/i.test(c.source || '') ? 'facebook' : 'instagram'
}
function SrcIcon({ channel }) {
  return <span className={`ac-imbox-row__src ac-imbox-row__src--${channel}`}><Ico name={channel} size={8} /></span>
}
const CHAT_LABEL = { instagram: 'Instagram bilan chat', facebook: 'Messenger bilan chat', telegram: 'Telegram bilan chat' }
const CHAN_NAME = { instagram: 'Instagram', facebook: 'Facebook Messenger', telegram: 'Telegram' }

function Row({ c, on, onClick }) {
  const t = useT()
  const author = c.senderName || (c.direction === 'out' ? t('Siz') : t('Mijoz'))
  return (
    <div className={`ac-imbox-row ${on ? 'on' : ''}`} onClick={onClick}>
      <div className="ac-imbox-row__avatar">
        {c.avatar ? <img className="ac-imbox-row__img" src={c.avatar} alt="" /> : c.initial ? <span className="ac-imbox-row__letter">{c.initial}</span> : <PersonAvatar size={36} />}
        <SrcIcon channel={chanOf(c)} />
      </div>
      <div className="ac-imbox-row__body">
        <div className="ac-imbox-row__head">
          <span className={`ac-imbox-row__num ${c.closed ? 'closed' : ''}`}>{convNum(c.leadId)}</span>
          {c.fav && <Ico name="star" size={12} className="ac-imbox-row__fav" />}
          <span className="ac-imbox-row__date">{listDate(c.at, t)}</span>
        </div>
        <div className="ac-imbox-row__name">{c.name}</div>
        <div className="ac-imbox-row__text">{author}: {c.last}</div>
      </div>
    </div>
  )
}

function NotConnected({ compact }) {
  const t = useT()
  const navigate = useNavigate()
  return (
    <div className="ac-imbox-empty">
      <div className="ac-imbox-empty__title">{t('Telegram ulanmagan')}</div>
      <div className="ac-imbox-empty__text">{t("Mijozlar bilan yozishmalarni bir joyda olib borish uchun Telegram botni ulang. Xabarlar shu yerda paydo bo'ladi.")}</div>
      <button className="ac-btn ac-btn--blue" onClick={() => navigate('/amo-market')}>{t('Integratsiyalar marketiga')}</button>
    </div>
  )
}

// Voronka/status tanlagich (yuqori o'ng)
function PipePicker({ lead, pipes, onPick }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState('')
  const ref = useRef(null)
  useOutside(ref, () => setOpen(false), open)
  const current = pipes.find((p) => (p.id || '') === (lead.pipelineId || '')) || pipes[0]
  const st = (current?.stages || []).find((s) => s.id === lead.stage)
  return (
    <div className="ac-imbox-pipe" ref={ref}>
      <button className="ac-imbox-pipe__btn" onClick={() => { setExpanded(lead.pipelineId || ''); setOpen((v) => !v) }}>
        <div className="ac-imbox-pipe__pipe">{current?.name || t('Asosiy voronka')}</div>
        <div className="ac-imbox-pipe__stage">{st?.name || '—'}<Ico name="chevronDown" size={12} /></div>
      </button>
      {open && (
        <div className="ac-imbox-pipe__drop">
          {pipes.map((p) => (
            <div key={p.id || 'main'} className="ac-imbox-pipe__group">
              <button className="ac-imbox-pipe__ghead" onClick={() => setExpanded(p.id || '')}>{p.name}</button>
              {expanded === (p.id || '') && p.stages.map((s) => (
                <button key={s.id} className="ac-imbox-pipe__opt" style={{ background: s.kind === 'lost' ? '#d5d8db' : s.kind === 'won' ? '#ccff66' : s.color || '#99ccff' }}
                  onClick={() => { setOpen(false); onPick(p.id || '', s) }}>{s.name}</button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Ixcham composer: Chat / Eslatma
function Composer({ lead, canChat, channel, comment, onSent }) {
  const t = useT()
  const [mode, setMode] = useState(canChat ? 'chat' : 'note')
  const [modesOpen, setModesOpen] = useState(false)
  const [text, setText] = useState('')
  const [focus, setFocus] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ref = useRef(null)
  const wrap = useRef(null)
  useOutside(wrap, () => { setModesOpen(false); if (!text) setFocus(false) }, focus || modesOpen)
  useEffect(() => { if (!canChat && mode === 'chat') setMode('note') }, [canChat]) // eslint-disable-line

  const send = async () => {
    if (busy || !text.trim()) return
    setBusy(true); setErr('')
    try {
      if (mode === 'chat') await crmService.sendMessage(lead.id, text.trim())
      else await crmService.addNote(lead.id, text.trim())
      setText(''); setFocus(false); onSent()
    } catch (e) { setErr(e?.message || t('Xatolik yuz berdi')) } finally { setBusy(false) }
  }
  const chatLabel = comment ? 'Izohga javob' : CHAT_LABEL[channel] || 'Chat'
  const labels = { chat: chatLabel, note: 'Eslatma' }
  return (
    <div ref={wrap} className={`ac-compose ${focus ? 'focus' : ''}`} onClick={() => { setFocus(true); ref.current?.focus() }}>
      <div className="ac-compose__line">
        <span className="ac-compose__mode">
          {modesOpen && (
            <div className="ac-menu ac-compose__modes">
              {['chat', 'note'].filter((m) => m !== 'chat' || canChat).map((m) => (
                <button key={m} className="ac-menu__item" onClick={(e) => { e.stopPropagation(); setMode(m); setModesOpen(false) }}>{t(labels[m])}</button>
              ))}
            </div>
          )}
          <a onClick={(e) => { e.stopPropagation(); setModesOpen((v) => !v) }}>{t(labels[mode])}</a>
          {mode === 'chat' && !channel && <> {t('bilan')} <a>{lead.contact?.name || lead.n}</a></>}:
          <span className="ac-compose__caret" onClick={(e) => { e.stopPropagation(); setModesOpen((v) => !v) }}><Ico name="chevronDown" size={10} /></span>
        </span>
        <textarea ref={ref} className="ac-compose__text" rows={focus ? 3 : 1} placeholder={t('matn kiriting...')} value={text} maxLength={4000} onChange={(e) => { setText(e.target.value); setErr('') }} onFocus={() => setFocus(true)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }} />
      </div>
      {err && <div className="ac-imbox-err">{err}</div>}
      {focus && (
        <div className="ac-compose__foot" onClick={(e) => e.stopPropagation()}>
          <button className="ac-btn ac-btn--blue ac-btn--plain" style={{ height: 34, lineHeight: '32px', padding: '0 14px' }} disabled={busy} onClick={send}>{t('Yuborish')}</button>
          <button className="ac-btn ac-btn--plain" style={{ height: 34, border: 0, background: 'transparent' }} onClick={() => { setText(''); setFocus(false) }}>{t('Bekor qilish')}</button>
          {mode === 'chat' && <TemplatePicker onPick={(x) => { setText(x); ref.current?.focus() }} />}
        </div>
      )}
    </div>
  )
}

function Conversation({ leadId, pipes, onToggleList, onChanged }) {
  const t = useT()
  const navigate = useNavigate()
  const [lead, setLead] = useState(null)
  const [feed, setFeed] = useState({ calls: [], tasks: [], messages: [], canReply: false, channel: null })
  const [missing, setMissing] = useState(false)
  const [err, setErr] = useState('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const load = useCallback(async () => {
    const [l, c, tk, m] = await Promise.all([
      crmService.getLead(leadId).catch(() => null),
      crmService.leadCalls(leadId).catch(() => ({ calls: [] })),
      crmService.listLeadTasks(leadId).catch(() => ({ tasks: [] })),
      crmService.leadMessages(leadId).catch(() => ({ messages: [], canReply: false })),
    ])
    if (!alive.current) return
    if (l?.lead) { setLead(l.lead); setMissing(false) } else setMissing(true)
    setFeed({
      calls: c.calls || [], tasks: tk.tasks || [], messages: m.messages || [], canReply: !!m.canReply,
      channel: m.channel || null, replyKind: m.replyKind, windowOpen: m.windowOpen !== false, windowExpiresAt: m.windowExpiresAt || null, why: m.replyDisabledReason || null,
      closed: !!m.closed, fav: !!m.fav,
    })
  }, [leadId])

  useEffect(() => {
    setLead(null); setMissing(false); setFeed({ calls: [], tasks: [], messages: [], canReply: false, channel: null })
    load()
    const h = setInterval(load, REFRESH_MS)
    return () => clearInterval(h)
  }, [load])

  const pickStatus = async (pipelineId, stage) => {
    try {
      let reason
      if (stage.kind === 'lost') {
        reason = window.prompt(t("Yo'qotish sababi"))
        if (reason === null) return // bekor qilindi — holat o'zgarmaydi
        reason = reason || undefined
      }
      setErr('')
      if ((lead.pipelineId || '') !== pipelineId) await crmService.updateLead(lead.id, { pipelineId: pipelineId || '' })
      await crmService.moveLead(lead.id, stage.id, undefined, reason)
      load(); onChanged && onChanged()
    } catch (e) { setErr(e?.message || t('Xatolik yuz berdi')) }
  }
  const completeTask = async (task, result) => {
    try { await crmService.updateTask(task.id, { done: true, result: result || undefined }); load() } catch (e) { setErr(e?.message || t('Xatolik yuz berdi')) }
  }

  if (!lead && missing) return <div className="ac-imbox-view"><div className="ac-imbox-empty"><div className="ac-imbox-empty__title">{t('Bitim topilmadi')}</div></div></div>
  if (!lead) return <div className="ac-imbox-view"><div className="ac-imbox-empty"><div className="ac-spinner" /></div></div>

  const items = []
  for (const a of lead.activity || []) {
    if (a.type === 'note' || a.type === 'call') continue
    items.push({ at: a.at, kind: 'sys', a })
  }
  for (const n of lead.notes || []) items.push({ at: n.at, kind: 'note', n })
  for (const c of feed.calls) items.push({ at: c.startedAt, kind: 'call', c })
  for (const tk of feed.tasks) items.push({ at: tk.done ? tk.doneAt || tk.dueDate : tk.dueDate || new Date().toISOString(), kind: 'task', tk })
  for (const m of feed.messages) items.push({ at: m.createdAt, kind: 'msg', m })
  items.sort((a, b) => new Date(a.at) - new Date(b.at))
  let lastDay = ''

  return (
    <div className="ac-imbox-view">
      <div className="ac-imbox-view__top">
        <button className="ac-imbox-burger" onClick={onToggleList}><Ico name="burger" size={20} /></button>
        <button className={`ac-imbox-view__fav ${feed.fav ? 'on' : ''}`} title={t('Sevimlilar')} onClick={() => crmService.conversationAction(lead.id, 'fav').then((r) => { setFeed((f) => ({ ...f, fav: !!r.fav })); onChanged && onChanged() })}><Ico name="star" size={16} /></button>
        <span className="ac-imbox-view__title" title={t('Bitimni ochish')} onClick={() => navigate(`/leads/detail/${lead.id}`)}>{lead.n || `${t('Bitim')} #${String(lead.id).slice(-8)}`}</span>
        {feed.channel && feed.channel !== 'telegram' && <span className={`ac-imbox-view__chan ac-imbox-view__chan--${feed.channel}`}><Ico name={feed.channel} size={11} />{CHAN_NAME[feed.channel]}</span>}
        <div className="ac-imbox-view__tags">{(lead.tags || []).map((tg) => <span key={tg} className="ac-tag">{tg}</span>)}</div>
        {pipes.length > 0 && <PipePicker lead={lead} pipes={pipes} onPick={pickStatus} />}
      </div>
      {err && <div className="ac-imbox-err" onClick={() => setErr('')}>{err}</div>}
      <div className="ac-imbox-view__feed">
        <div className="ac-feed__inner">
          {chatGroups(items).map((it, i) => {
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
            else if (it.kind === 'chat') el = <MsgGroup key={`g${it.msgs[0].id}`} msgs={it.msgs} leadId={lead.id}
              conv={it.msgs[it.msgs.length - 1].id === feed.messages[feed.messages.length - 1]?.id ? { closed: feed.closed, onClose: () => crmService.conversationAction(lead.id, 'close').then(() => { load(); onChanged && onChanged() }) } : null} />
            return <React.Fragment key={i}>{sep}{el}</React.Fragment>
          })}
        </div>
      </div>
      <div className="ac-imbox-view__bottom">
        {/* Meta 24 soatlik xabar oynasi */}
        {feed.channel && feed.channel !== 'telegram' && feed.replyKind !== 'comment' && feed.windowOpen && feed.windowExpiresAt && (
          <div className="ac-imbox-window">{t('24 soatlik oyna')}: {t('javob yozish mumkin')} {hm(feed.windowExpiresAt)} {t('gacha')}</div>
        )}
        {feed.why === 'WINDOW_CLOSED' && <div className="ac-imbox-window ac-imbox-window--closed">{t("24 soatlik oyna yopilgan: mijoz 24 soatdan beri yozmagan, shuning uchun bu kanal orqali javob yozib bo'lmaydi. Mijoz yana yozguncha kuting.")}</div>}
        {feed.why === 'NOT_CONNECTED' && <div className="ac-imbox-window ac-imbox-window--closed">{t("Sahifa ulanmagan — Integratsiyalar bo'limida «Facebook bilan ulash»ni bosing.")}</div>}
        <Composer key={lead.id} lead={lead} canChat={feed.canReply} channel={feed.channel !== 'telegram' ? feed.channel : null} comment={feed.replyKind === 'comment'} onSent={() => { load(); onChanged && onChanged() }} />
      </div>
    </div>
  )
}

const IMBOX_PRESETS = [
  ['unanswered', 'Javob berilmaganlar'], ['fav', 'Sevimlilar'], ['open', 'Ochiq suhbatlar'],
  ['needs_reply', 'Javob talab qiladi'], ['mine', "Men mas'ul bo'lganlar"],
]
const IMBOX_PERIODS = [['', 'Butun vaqt uchun'], ['today', 'Bugun'], ['yesterday', 'Kecha'], ['week', 'Shu hafta'], ['month', 'Shu oy'], ['30d', "So'nggi 30 kun"]]

/** amoCRM imBox "Фильтр": qidiruv + presetlar (Неотвеченные, Избранные, Открытые беседы, …), davr va bosqichlar. */
function ImboxFilter({ value, q, setQ, pipes, open, setOpen, onApply }) {
  const t = useT()
  const ref = useRef(null)
  const [f, setF] = useState(value)
  useEffect(() => { if (open) setF(value) }, [open]) // eslint-disable-line
  useOutside(ref, () => setOpen(false), open)
  const active = value.preset || value.period || value.stages.length
  const label = value.preset ? t(IMBOX_PRESETS.find((x) => x[0] === value.preset)?.[1] || '') : ''
  const toggleStage = (k) => setF((p) => ({ ...p, stages: p.stages.includes(k) ? p.stages.filter((x) => x !== k) : [...p.stages, k] }))
  return (
    <div className="ac-imbox-fwrap" ref={ref}>
      <label className={`ac-imbox-filter ${active ? 'on' : ''}`} onClick={() => setOpen(true)}>
        <Ico name="filter" size={16} />
        {label && !q ? <span className="ac-imbox-filter__chip">{label}</span> : null}
        <input value={q} placeholder={label ? '' : t('Filtr')} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && (setQ(''), setOpen(false))} />
      </label>
      {open && (
        <div className="ac-imbox-fpanel">
          <div className="ac-imbox-fpanel__presets">
            {IMBOX_PRESETS.map(([k, l]) => (
              <div key={k} className={`ac-imbox-fpanel__preset ${f.preset === k ? 'on' : ''}`} onClick={() => onApply({ ...f, preset: f.preset === k ? '' : k })}>{t(l)}</div>
            ))}
          </div>
          <div className="ac-imbox-fpanel__body">
            <select className="ac-select" value={f.period} onChange={(e) => setF((p) => ({ ...p, period: e.target.value }))}>
              {IMBOX_PERIODS.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
            </select>
            <div className="ac-imbox-fpanel__stages">
              {pipes.map((p) => (
                <div key={p.id || 'main'}>
                  <div className="ac-imbox-fpanel__pipe">{p.name}</div>
                  {p.stages.map((s) => {
                    const k = `${p.id || 'main'}:${s.key || s.id}`
                    return <label key={k} className="ac-imbox-fpanel__stage"><input type="checkbox" className="ac-check" checked={f.stages.includes(k)} onChange={() => toggleStage(k)} /><i style={{ background: s.color }} />{s.name}</label>
                  })}
                </div>
              ))}
            </div>
            <div className="ac-imbox-fpanel__foot">
              <button className="ac-btn ac-btn--blue ac-btn--sm" onClick={() => onApply(f)}>{t("Qo'llash")}</button>
              <button className="ac-btn ac-btn--sm ac-btn--plain" onClick={() => onApply({ preset: '', period: '', stages: [] })}>{t('Tozalash')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ImboxPage() {
  const { leadId } = useParams()
  const navigate = useNavigate()
  const t = useT()
  const [convs, setConvs] = useState(null)
  const [status, setStatus] = useState(null)
  const [pipes, setPipes] = useState([])
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  // amoCRM imBox filtri: preset + davr + bosqichlar; saralash "…" menyusida
  const [flt, setFlt] = useState({ preset: '', period: '', stages: [] })
  const [sort, setSort] = useState('new')

  const loadList = useCallback(() => {
    crmService.conversations({ preset: flt.preset || undefined, period: flt.period || undefined, stages: flt.stages.join(',') || undefined, sort: sort === 'old' ? 'old' : undefined })
      .then((r) => setConvs(r.conversations || [])).catch(() => setConvs((v) => v || []))
  }, [flt, sort])
  useEffect(() => {
    loadList()
    crmService.chatStatus().then(setStatus).catch(() => setStatus({ telegram: false, facebook: false, instagram: false }))
    const h = setInterval(loadList, REFRESH_MS)
    return () => clearInterval(h)
  }, [loadList])
  useEffect(() => {
    ;(async () => {
      const main = await crmService.getPipeline().catch(() => null)
      if (!main) return
      const list = [{ id: '', name: t('Asosiy voronka'), stages: main.stages || [] }]
      const others = await Promise.all((main.pipelines || []).map((p) => crmService.getPipeline(p.id).then((r) => ({ id: p.id, name: p.name, stages: r.stages || [] })).catch(() => null)))
      setPipes([...list, ...others.filter(Boolean)])
    })()
  }, []) // eslint-disable-line

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (convs || []).filter((c) => !s || `${c.name} ${c.last} ${convNum(c.leadId)}`.toLowerCase().includes(s))
  }, [convs, q])

  // amoCRM: imBox ochilganda birinchi (eng so'nggi) suhbat avtomatik ochiladi (keng ekranda)
  useEffect(() => {
    if (!leadId && convs && convs.length && window.innerWidth > 760) navigate(`/imbox/${convs[0].leadId}`, { replace: true })
  }, [leadId, convs]) // eslint-disable-line

  const empty = convs && convs.length === 0 && status && !status.telegram && !status.facebook && !status.instagram

  return (
    <div className={`ac-imbox ${leadId ? 'has-lead' : ''}`}>
      <div className={`ac-imbox-list ${collapsed ? 'collapsed' : ''}`}>
        <div className="ac-imbox-list__top">
          <ImboxFilter value={flt} q={q} setQ={setQ} pipes={pipes} open={searching} setOpen={setSearching} onApply={(f) => { setFlt(f); setSearching(false) }} />
          <span className="ac-imbox-list__count">{t('Jami')}: {(convs || []).length}</span>
          <DotsMenu items={[
            { label: t('Yangilash'), icon: 'clock', onClick: loadList },
            { label: t(sort === 'new' ? 'Avval eskilari' : 'Avval yangilari'), icon: 'list', onClick: () => setSort((v) => (v === 'new' ? 'old' : 'new')) },
          ]} />
        </div>
        <div className="ac-imbox-list__scroll">
          {convs === null && [0, 1, 2, 3, 4].map((i) => <div key={i} className="ac-imbox-row"><div className="ac-plug" style={{ width: 36, height: 36, borderRadius: '50%' }} /><div style={{ flex: 1 }}><div className="ac-plug" style={{ height: 14, width: '60%', marginBottom: 8 }} /><div className="ac-plug" style={{ height: 12 }} /></div></div>)}
          {convs && convs.length === 0 && <div className="ac-imbox-list__empty">{t("Suhbatlar yo'q")}</div>}
          {convs && convs.length > 0 && shown.length === 0 && <div className="ac-imbox-list__empty">{t('Suhbatlar topilmadi')}</div>}
          {shown.map((c) => <Row key={c.leadId} c={c} on={c.leadId === leadId} onClick={() => navigate(`/imbox/${c.leadId}`)} />)}
        </div>
      </div>
      {leadId
        ? <Conversation key={leadId} leadId={leadId} pipes={pipes} onChanged={loadList} onToggleList={() => setCollapsed((v) => !v)} />
        : <div className="ac-imbox-view"><div className="ac-imbox-empty">{empty ? <NotConnected /> : <div className="ac-imbox-empty__title">{t('Suhbatni tanlang')}</div>}</div></div>}
    </div>
  )
}
