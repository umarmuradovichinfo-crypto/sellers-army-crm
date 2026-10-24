// Kontakt kartochkasi (amoCRM): chapda maydonlar/bitimlar, o'ngda bog'langan bitimlar lentasi.
// EntityCard — kontakt va kompaniya uchun umumiy; CompanyCard.jsx ham shundan foydalanadi.
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../lib/apiClient'
import { crmService } from '../../services/crm.service'
import { useAuth } from '../../context/AuthContext'
import { Ico } from '../AmoIcons'
import { DotsMenu, useOutside } from '../TopBar'
import { money, dmy, relDay, phoneFmt } from '../format'
import { useT } from '../i18n'
import { CardResizer, PersonAvatar, FieldRow, CustomInput, SysLine, CallNote, TaskNote, NoteItem, taskKind, TASK_TYPES } from './LeadCard'
import '../i18n/entitycard.ru.js'
import '../leadcard.css'
import '../entitycard.css'

const ACT_TEXT = {
  created: 'Bitim yaratildi', stage: 'Yangi bosqich', won: 'Bitim muvaffaqiyatli yopildi', lost: 'Bitim yopildi va amalga oshmadi',
  assignee: "Mas'ul o'zgartirildi", field: "Maydon o'zgartirildi", tag: "Teglar o'zgartirildi", task_created: 'Yangi vazifa',
  task_done: 'Vazifa bajarildi', automation: 'Avtomatlashtirish', updated: "O'zgartirildi",
}
const digits = (s) => String(s || '').replace(/\D/g, '')

function LeadLink({ lead, navigate }) {
  const t = useT()
  return <a className="ac-ec-leadlink" onClick={() => navigate(`/leads/detail/${lead.id}`)}>{t('Bitim')} #{String(lead.id).slice(-8)}</a>
}

// Bog'lash uchun qidiruv (kompaniya yoki kontakt)
function LinkSearch({ kind, onPick, onClose }) {
  const t = useT()
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  useEffect(() => {
    if (!q.trim()) { setFound([]); return }
    const h = setTimeout(() => {
      const p = kind === 'company' ? crmService.listCompanies({ search: q, limit: 10 }) : crmService.listContacts({ search: q, limit: 10 })
      p.then((r) => setFound(r.companies || r.contacts || [])).catch(() => {})
    }, 250)
    return () => clearTimeout(h)
  }, [q, kind])
  return (
    <div className="ac-linked">
      <div className="ac-linked__search">
        <input autoFocus className="ac-input" placeholder={t(kind === 'company' ? 'Kompaniya nomi' : 'Ism, telefon yoki email')} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onClose()} onBlur={() => setTimeout(onClose, 150)} />
        {q.trim() && (
          <div className="ac-linked__results">
            {found.map((c) => <div key={c.id} className="ac-linked__result" onMouseDown={() => onPick(c)}>{c.name} <span className="ac-muted">{c.phone || ''}</span></div>)}
            <div className="ac-linked__result" style={{ color: 'var(--palette-link-primary)' }} onMouseDown={() => onPick({ name: q.trim(), isNew: true })}>+ {t(kind === 'company' ? 'Yangi kompaniya' : 'Yangi kontakt')}: {q.trim()}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function ContactComposer({ onSave }) {
  const t = useT()
  const [text, setText] = useState('')
  const [focus, setFocus] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = React.useRef(null)
  const wrap = React.useRef(null)
  useOutside(wrap, () => { if (!text) setFocus(false) }, focus)
  const send = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    try { await onSave(text.trim()); setText(''); setFocus(false) } finally { setBusy(false) }
  }
  return (
    <div ref={wrap} className={`ac-compose ${focus ? 'focus' : ''}`} onClick={() => { setFocus(true); ref.current?.focus() }}>
      <div className="ac-compose__line">
        <span className="ac-compose__mode"><a onClick={(e) => e.stopPropagation()}>{t('Eslatma')}</a>:</span>
        <textarea ref={ref} className="ac-compose__text" rows={focus ? 3 : 1} placeholder={t('matn kiriting...')} value={text} onChange={(e) => setText(e.target.value)} onFocus={() => setFocus(true)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }} />
      </div>
      {focus && (
        <div className="ac-compose__foot" onClick={(e) => e.stopPropagation()}>
          <button className="ac-btn ac-btn--blue ac-btn--plain" style={{ height: 34, lineHeight: '32px', padding: '0 14px' }} disabled={busy} onClick={send}>{t('Yuborish')}</button>
          <button className="ac-btn ac-btn--plain" style={{ height: 34, border: 0, background: 'transparent' }} onClick={() => { setText(''); setFocus(false) }}>{t('Bekor qilish')}</button>
        </div>
      )}
    </div>
  )
}

export function EntityCard({ kind }) {
  const isContact = kind === 'contact'
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const t = useT()
  const { user } = useAuth()
  const base = isContact ? '/contacts' : '/companies'
  const [ent, setEnt] = useState(null)
  const [draft, setDraft] = useState({})
  const [fields, setFields] = useState([])
  const [members, setMembers] = useState([])
  const [leads, setLeads] = useState([])
  const [leadsTotal, setLeadsTotal] = useState(0)
  const [phoneEdit, setPhoneEdit] = useState(false)
  const [people, setPeople] = useState([]) // kompaniya kontaktlari
  const [company, setCompany] = useState(null) // kontaktning kompaniyasi
  const [feed, setFeed] = useState({ calls: [], tasks: [], acts: [] })
  const [tab, setTab] = useState('main')
  const [feedQ, setFeedQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [loadErr, setLoadErr] = useState('')
  const [busyLead, setBusyLead] = useState(false)
  const feedSeq = React.useRef(0)
  const guard = (fn) => async (...a) => { try { setErr(''); return await fn(...a) } catch (e) { setErr(e?.message || t('Xatolik yuz berdi')) } }

  const loadEnt = async () => {
    if (isNew) return
    try {
      if (isContact) {
        const r = await api.get(`/crm/contacts/${id}`)
        setEnt(r.contact); setCompany(r.company || null)
      } else {
        const r = await crmService.getCompany(id)
        setEnt(r.company); setPeople(r.contacts || [])
      }
      setLoadErr('')
    } catch (e) { setLoadErr(e?.message || t('Xatolik yuz berdi')) }
  }
  const loadFeed = async () => {
    if (isNew) return
    const seq = ++feedSeq.current
    // Server filtri: kontaktning o'z bitimlari (contactId) yoki kompaniyaniki (companyId — kompaniya va uning kontaktlari bitimlari)
    const res = await crmService.listLeads({ [isContact ? 'contactId' : 'companyId']: id, sort: 'createdAt', dir: 'desc', limit: 200 }).catch(() => ({ leads: [], total: 0 }))
    const mine = res.leads || []
    setLeadsTotal(res.total || mine.length)
    setLeads(mine)
    const top = mine.slice(0, 15)
    const per = await Promise.all(top.map(async (l) => {
      const [c, tk, d] = await Promise.all([
        crmService.leadCalls(l.id).catch(() => ({ calls: [] })),
        crmService.listLeadTasks(l.id).catch(() => ({ tasks: [] })),
        crmService.getLead(l.id).catch(() => ({ lead: {} })),
      ])
      return { l, calls: c.calls || [], tasks: tk.tasks || [], acts: (d.lead?.activity || []).filter((a) => a.type !== 'note' && a.type !== 'call') }
    }))
    const calls = [], tasks = [], acts = []
    for (const p of per) {
      p.calls.forEach((c) => calls.push({ ...c, _lead: p.l }))
      p.tasks.forEach((x) => tasks.push({ ...x, _lead: p.l }))
      p.acts.forEach((a) => acts.push({ ...a, _lead: p.l }))
    }
    // telefon bo'yicha qo'ng'iroqlar
    const phones = [ent?.phone, ...(ent?.custom?.phones || [])].map(digits).filter((x) => x.length >= 7)
    if (phones.length) {
      const lc = await crmService.listCalls('all').catch(() => ({ calls: [] }))
      for (const c of lc.calls || []) {
        const d = digits(c.phone)
        if (d && phones.some((p) => d.endsWith(p.slice(-9))) && !calls.some((x) => x.id === c.id)) calls.push(c)
      }
    }
    if (seq === feedSeq.current) setFeed({ calls, tasks, acts })
  }

  useEffect(() => {
    feedSeq.current++
    setDraft({}); setErr(''); setLoadErr(''); setTab('main'); setEnt(null); setLeads([]); setLeadsTotal(0); setFeed({ calls: [], tasks: [], acts: [] })
    if (isNew) setEnt({ id: null, name: '', phone: '', email: '', position: '', website: '', companyId: '', custom: { _assigneeId: user?.id } })
    else loadEnt()
    ;(async () => {
      const [fl, mem] = await Promise.all([crmService.listFields(kind), crmService.listMembers()])
      setFields((fl.fields || []).filter((f) => f.active !== false))
      setMembers(mem.members || [])
    })()
  }, [id, kind]) // eslint-disable-line
  useEffect(() => { if (ent && !isNew) loadFeed() }, [ent?.id, ent?.updatedAt]) // eslint-disable-line

  if (!ent && loadErr) return <div className="ac-cardpage" style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}><div>{loadErr}</div><button className="ac-btn" onClick={() => navigate(`${base}/list`)}>{t('Orqaga')}</button></div>
  if (!ent) return <div className="ac-cardpage" style={{ alignItems: 'center', justifyContent: 'center' }}><div className="ac-spinner" /></div>

  const v = { ...ent, ...draft, custom: { ...(ent.custom || {}), ...(draft.custom || {}) } }
  const dirty = isNew || Object.keys(draft).length > 0
  const set = (k, val) => setDraft((d) => ({ ...d, [k]: val }))
  const setCustom = (k, val) => setDraft((d) => ({ ...d, custom: { ...(d.custom || {}), [k]: val } }))
  const extraPhones = v.custom.phones || []

  const save = async () => {
    if (saving) return
    if (!isNew && draft.name !== undefined && !String(draft.name).trim()) return setErr(t('Nomini kiriting'))
    if (v.email && !/^\S+@\S+\.\S+$/.test(String(v.email).trim())) return setErr(t("Email noto'g'ri"))
    setSaving(true); setErr('')
    try {
      const payload = { ...draft }
      if (payload.name !== undefined) payload.name = String(payload.name).trim()
      if (payload.custom) {
        payload.custom = { ...(ent.custom || {}), ...payload.custom }
        if (payload.custom.phones) payload.custom.phones = payload.custom.phones.map((p) => String(p).trim()).filter(Boolean)
      }
      if (isNew) {
        const custom = { ...v.custom, ...(v.custom.phones ? { phones: v.custom.phones.map((p) => String(p).trim()).filter(Boolean) } : {}) }
        const body = { name: (v.name || '').trim() || t(isContact ? 'Kontakt' : 'Kompaniya'), phone: v.phone, email: v.email, custom }
        if (isContact) { body.position = v.position; body.companyId = v.companyId || undefined } else body.website = v.website
        const r = isContact ? await crmService.createContact(body) : await crmService.createCompany(body)
        navigate(`${base}/detail/${(r.contact || r.company).id}`, { replace: true })
        return
      }
      if (isContact) await crmService.updateContact(id, payload); else await crmService.updateCompany(id, payload)
      setDraft({})
      await loadEnt()
    } catch (e) { setErr(e?.message || t('Xatolik yuz berdi')) } finally { setSaving(false) }
  }
  const remove = guard(async () => {
    if (!window.confirm(t(isContact ? "Kontaktni o'chirishni tasdiqlaysizmi?" : "Kompaniyani o'chirishni tasdiqlaysizmi?"))) return
    if (isContact) await crmService.deleteContact(id); else await crmService.deleteCompany(id)
    navigate(`${base}/list`, { replace: true })
  })
  const addNote = async (text) => {
    const notes = [...(ent.custom?.notes || []), { at: new Date().toISOString(), by: user?.name || '', text }]
    const custom = { ...(ent.custom || {}), notes }
    if (isContact) await crmService.updateContact(id, { custom }); else await crmService.updateCompany(id, { custom })
    await loadEnt()
  }
  const completeTask = async (task, result) => {
    await crmService.updateTask(task.id, { done: true, result: result || undefined })
    loadFeed()
  }
  const addLead = guard(async () => {
    if (busyLead) return
    setBusyLead(true)
    try {
    const pipe = await crmService.getPipeline().catch(() => ({ stages: [] }))
    const stage = (pipe.stages || []).find((s) => s.kind === 'open')?.id
    const body = { name: `${t('Bitim')} #${Date.now().toString().slice(-6)}`, stage, assigneeId: v.custom._assigneeId || user?.id }
    if (isContact) { body.contactId = id; if (company) body.companyId = company.id } else body.companyId = id
    const r = await crmService.createLead(body)
    navigate(`/leads/detail/${r.lead.id}`)
    } finally { setBusyLead(false) }
  })
  const pickCompany = guard(async (c) => {
    setAdding(false)
    let cid = c.id
    if (c.isNew) cid = (await crmService.createCompany({ name: c.name })).company?.id
    if (isNew) { set('companyId', cid); setCompany({ id: cid, name: c.name }) } else { await crmService.updateContact(id, { companyId: cid }); await loadEnt() }
  })
  const pickPerson = guard(async (c) => {
    setAdding(false)
    if (c.isNew) await crmService.createContact({ name: c.name, companyId: id })
    else await crmService.updateContact(c.id, { companyId: id })
    await loadEnt()
  })
  const unlinkCompany = guard(async () => {
    if (isNew) { set('companyId', ''); setCompany(null); return }
    await crmService.updateContact(id, { companyId: '' }); await loadEnt()
  })
  const unlinkPerson = guard(async (c) => { await crmService.updateContact(c.id, { companyId: '' }); await loadEnt() })

  // Lenta
  const items = []
  if (!isNew) {
    for (const a of feed.acts) items.push({ at: a.at, kind: 'sys', a })
    for (const n of ent.custom?.notes || []) items.push({ at: n.at, kind: 'note', n })
    for (const c of feed.calls) items.push({ at: c.startedAt, kind: 'call', c })
    for (const tk of feed.tasks) items.push({ at: tk.done ? tk.doneAt || tk.dueDate : tk.dueDate || new Date().toISOString(), kind: 'task', tk })
  }
  const q = feedQ.trim().toLowerCase()
  const shown = items.filter((it) => !q || JSON.stringify(it).toLowerCase().includes(q)).sort((a, b) => new Date(a.at) - new Date(b.at))
  const openTasks = feed.tasks.filter((x) => !x.done)
  let lastDay = ''
  // amoCRM kontakt/kompaniya kartochkasi: faqat "Основное" va "Сделки" (soni ko'rsatilmaydi)
  const tabs = [['main', 'card§Asosiy'], ['leads', 'card§Bitimlar']]

  return (
    <div className="ac-cardpage">
      <div className="ac-cf">
        <div className="ac-cf__scroll">
          <div className="ac-cf__top">
            <button className="ac-cf__back" onClick={() => navigate(-1)} title={t('Orqaga')}><Ico name="chevronLeft" /></button>
            <div className="ac-cf__namerow">
              <input className="ac-cf__name" value={v.name || ''} placeholder={t(isContact ? 'Kontakt nomi' : 'Kompaniya nomi')} maxLength={255} onChange={(e) => set('name', e.target.value)} />
              {!isNew && <DotsMenu items={[
                { label: t('Chop etish'), icon: 'print', onClick: () => window.print() },
                { label: t("O'chirish"), icon: 'trash', danger: true, onClick: remove },
              ]} />}
            </div>
            <div className="ac-cf__meta">
              {!isNew && <span>#{String(ent.id).slice(-8)}</span>}
              {(v.custom.tags || []).map((tg) => <span key={tg} className="ac-cf__tagpill">{tg}<button onClick={() => setCustom('tags', (v.custom.tags || []).filter((x) => x !== tg))}><Ico name="close" size={10} /></button></span>)}
              <button className="ac-cf__tagbtn" onClick={() => { const n = window.prompt(t('Teg nomi')); if (n && n.trim()) setCustom('tags', [...new Set([...(v.custom.tags || []), n.trim()])]) }}>#{t('card§Teglash')}</button>
            </div>
          </div>
          <div className="ac-ctabs">
            {tabs.map(([k, l]) => (
              <button key={k} className={`ac-ctabs__item ${tab === k ? 'on' : ''}`} disabled={k === 'leads' && isNew}
                onClick={() => k === 'setup' ? navigate(`/settings/fields/${isContact ? 'contacts' : 'companies'}`) : setTab(k)}>
                {t(l)}
              </button>
            ))}
          </div>

          {err && <div className="ac-ec-err" onClick={() => setErr('')}>{err}</div>}
          {tab === 'main' && (
            <>
              <div className="ac-fields">
                <FieldRow label={t("card§Mas'ul")}>
                  <select className="ac-field__edit" value={v.custom._assigneeId || ''} onChange={(e) => setCustom('_assigneeId', e.target.value)}>
                    <option value="">...</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </FieldRow>
                <FieldRow label={t('Ish tel.')}>
                  <div className="ac-ec-multi">
                    {v.phone && !phoneEdit ? (
                      <span className="ac-field__phone">
                        <span className="ac-field__plusmini" title={t("Telefon qo'shish")} onClick={() => setCustom('phones', [...extraPhones, ''])}><Ico name="plus" size={8} /></span>
                        <a className="ac-field__link" href={`tel:${String(v.phone).replace(/[^\d+]/g, '')}`}>{phoneFmt(v.phone)}</a>
                        <span className="ac-field__pen" onClick={() => setPhoneEdit(true)}><Ico name="edit" size={12} /></span>
                      </span>
                    ) : (
                      <input className="ac-field__edit" autoFocus={phoneEdit} value={v.phone || ''} placeholder="..." onBlur={() => setPhoneEdit(false)} onChange={(e) => set('phone', e.target.value)} />
                    )}
                    {extraPhones.map((p, i) => (
                      <input key={i} className="ac-field__edit" value={p} placeholder="..." onChange={(e) => setCustom('phones', extraPhones.map((x, j) => j === i ? e.target.value : x))} />
                    ))}
                  </div>
                </FieldRow>
                <FieldRow label={t('Email ish.')}>
                  <input className="ac-field__edit" value={v.email || ''} placeholder="..." onChange={(e) => set('email', e.target.value)} />
                </FieldRow>
                {isContact
                  ? <FieldRow label={t('Lavozim')}><input className="ac-field__edit" value={v.position || ''} placeholder="..." onChange={(e) => set('position', e.target.value)} /></FieldRow>
                  : <FieldRow label={t('Veb-sayt')}><input className="ac-field__edit" value={v.website || ''} placeholder="..." onChange={(e) => set('website', e.target.value)} /></FieldRow>}
                {fields.map((f) => (
                  <FieldRow key={f.id} label={f.label}>
                    <CustomInput field={f} value={v.custom?.[f.key]} onChange={(val) => setCustom(f.key, val)} />
                  </FieldRow>
                ))}
              </div>

              {isContact && (
                adding ? <LinkSearch kind="company" onPick={pickCompany} onClose={() => setAdding(false)} />
                : (company && (draft.companyId === undefined || draft.companyId))
                  ? (
                    <div className="ac-linked">
                      <div className="ac-linked__head">
                        <div className="ac-linked__avatar ac-linked__avatar--co"><Ico name="company" size={16} /></div>
                        <div style={{ minWidth: 0 }}>
                          <div className="ac-linked__kind">{t('Kompaniya')}</div>
                          <div className="ac-linked__name" onClick={() => navigate(`/companies/detail/${company.id}`)}>{company.name}</div>
                        </div>
                        <DotsMenu align="left" className="ac-linked__dots" items={[
                          { label: t("Kartochkaga o'tish"), icon: 'external', onClick: () => navigate(`/companies/detail/${company.id}`) },
                          { label: t('Ismni nusxalash'), icon: 'list', onClick: () => navigator.clipboard?.writeText(company.name || '') },
                          { label: t('Uzish'), icon: 'link', onClick: unlinkCompany },
                        ]} />
                      </div>
                    </div>
                  )
                  : <button className="ac-linked__add" onClick={() => setAdding(true)}><span className="ac-linked__plus"><Ico name="plus" /></span>{t("Kompaniya qo'shish")}</button>
              )}
              {!isContact && (
                <>
                  {people.map((c) => (
                    <div key={c.id} className="ac-linked">
                      <div className="ac-linked__head">
                        <div className="ac-linked__avatar"><PersonAvatar /></div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="ac-linked__name" onClick={() => navigate(`/contacts/detail/${c.id}`)}>{c.name}</div>
                          {(c.position || c.phone) && <div className="ac-linked__sub">{[c.position, c.phone].filter(Boolean).join(' · ')}</div>}
                        </div>
                        <DotsMenu items={[{ label: t('Uzish'), icon: 'close', onClick: () => unlinkPerson(c) }]} />
                      </div>
                    </div>
                  ))}
                  {!isNew && (adding
                    ? <LinkSearch kind="contact" onPick={pickPerson} onClose={() => setAdding(false)} />
                    : <button className="ac-linked__add" onClick={() => setAdding(true)}><span className="ac-linked__plus"><Ico name="plus" /></span>{t("Kontakt qo'shish")}</button>)}
                </>
              )}
            </>
          )}
          {tab === 'leads' && !isNew && (
            <div className="ac-ec-leads">
              {leads.map((l) => (
                <div key={l.id} className="ac-ec-lead" onClick={() => navigate(`/leads/detail/${l.id}`)}>
                  <div className="ac-ec-lead__name">{l.n}</div>
                  <div className="ac-ec-lead__row">
                    <span className="ac-ec-lead__stage"><i style={{ background: l.stageColor || '#99ccfd' }} />{l.stageName || l.stage}</span>
                    <span>{money(l.value || 0)}</span>
                  </div>
                </div>
              ))}
              {leads.length === 0 && <div className="ac-ec-empty">{t("Bitimlar yo'q")}</div>}
              <button className="ac-linked__add" disabled={busyLead} onClick={addLead}><span className="ac-linked__plus"><Ico name="plus" /></span>{t("Bitim qo'shish")}</button>
            </div>
          )}
        </div>
        <CardResizer />
        {dirty && (
          <div className="ac-cf__save">
            <button className="ac-btn ac-btn--blue ac-btn--plain" style={{ padding: '0 16px' }} disabled={saving} onClick={save}>{t('Saqlash')}</button>
            <button className="ac-btn ac-btn--plain" style={{ border: 0, background: 'transparent' }} onClick={() => { if (isNew) navigate(-1); else { setDraft({}); if (isContact) loadEnt() } }}>{t('Bekor qilish')}</button>
          </div>
        )}
      </div>

      <div className="ac-feed">
        <div className="ac-feed__top">
          <div className="ac-top__search" style={{ flex: 1 }}>
            <Ico name="search" />
            <input placeholder={t('Qidiruv va filtr')} value={feedQ} onChange={(e) => setFeedQ(e.target.value)} />
          </div>
          <div className="ac-feed__dots"><DotsMenu items={[{ label: t('Yangilash'), icon: 'clock', onClick: () => { loadEnt(); loadFeed() } }]} /></div>
        </div>
        <div className="ac-feed__scroll">
          <div className="ac-feed__inner">
            {shown.map((it, i) => {
              const day = new Date(it.at).toDateString()
              const sep = day !== lastDay ? (lastDay = day, <div key={`s${i}`} className="ac-feed__sep"><span>{t(relDay(it.at) || '') || dmy(it.at)}</span></div>) : null
              const link = it._lead || it.a?._lead || it.c?._lead || it.tk?._lead
              const ll = link ? <LeadLink lead={link} navigate={navigate} /> : null
              let el = null
              if (it.kind === 'sys') {
                const a = it.a
                const b = t(ACT_TEXT[a.type] || ACT_TEXT.updated)
                el = <SysLine key={`a${a.id}`} at={a.at} who={a.actorName} text={a.text && a.text !== b ? `${b}: ${a.text}` : b} link={ll} />
              } else if (it.kind === 'note') el = <NoteItem key={`n${i}`} n={it.n} />
              else if (it.kind === 'call') el = <div key={`c${it.c.id}`} className="ac-ec-wrap"><CallNote c={it.c} />{it.c._lead && <span className="ac-ec-wrap__link"><LeadLink lead={it.c._lead} navigate={navigate} /></span>}</div>
              else if (it.kind === 'task') el = <div key={`t${it.tk.id}`} className="ac-ec-wrap"><TaskNote task={it.tk} onDone={completeTask} /><span className="ac-ec-wrap__link"><LeadLink lead={it.tk._lead} navigate={navigate} /></span></div>
              return <React.Fragment key={i}>{sep}{el}</React.Fragment>
            })}
          </div>
        </div>
        {!isNew && (
          <div className="ac-feed__bottom">
            <div className="ac-feed__hint">
              {openTasks.length === 0 ? <span className="ac-notask"><Ico name="clock" size={13} /> {t("Rejalashtirilgan vazifalar yo'q, qo'shishni tavsiya qilamiz")}</span> : <span />}
              <span />
            </div>
            <ContactComposer onSave={addNote} />
          </div>
        )}
      </div>
    </div>
  )
}

export default function ContactCard() { return <EntityCard kind="contact" /> }
