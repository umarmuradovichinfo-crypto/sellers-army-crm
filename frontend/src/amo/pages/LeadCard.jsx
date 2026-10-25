// amoCRM bitim kartochkasi: /leads/detail/:id va /leads/add (yaratish rejimi).
// Chapda maydonlar paneli (520px), o'ngda lenta: tizim voqealari, eslatmalar, qo'ng'iroqlar, vazifalar, chat.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { crmService } from '../../services/crm.service'
import { api } from '../../lib/apiClient'
import { useAuth } from '../../context/AuthContext'
import { Ico } from '../AmoIcons'
import { DotsMenu, useOutside } from '../TopBar'
import { feedDate, feedDateFull, dmy, relDay, currency, phoneFmt, money } from '../format'
import PhoneLink from '../PhoneLink'
import { useT } from '../i18n'
import { tagStyle } from '../tagColors'
import { FieldModal } from './FieldsSetup'
import { useFilterMeta } from '../filterState'
import '../pipesetup.css'
import '../i18n/leadcard.ru.js'
import '../leadcard.css'
import '../entitycard.css'

import { TASK_TYPES } from '../taskTypes'
import { trActivity } from '../activityText'
export { TASK_TYPES }

// Chap panel kengligini surish (amoCRM .card-holder__fields: width %, localStorage'da saqlanadi)
// amoCRM "Настроить" (kartochka ichida): "Настройка свойств полей и групп" — guruh tablari, maydonlar, "Обязательно N"
function CardFieldsSetup({ onClose, onChanged }) {
  const t = useT()
  const meta = useFilterMeta()
  const [fields, setFields] = useState(null)
  const [group, setGroup] = useState('')
  const [modal, setModal] = useState(null)
  const load = () => crmService.listFields('lead').then((r) => setFields((r.fields || []).map((f) => ({ ...f, group: f.group || '' })))).catch(() => setFields([]))
  useEffect(() => { load() }, [])
  const groups = useMemo(() => { const g = ['']; (fields || []).forEach((f) => { if (!g.includes(f.group)) g.push(f.group) }); return g }, [fields])
  const stageOpts = useMemo(() => {
    const pname = (pid) => (pid ? (meta.pipelines || []).find((p) => p.id === pid)?.name || '' : t('Asosiy voronka'))
    return (meta.stages || []).filter((x) => x.kind !== 'lost').map((x) => ({ value: x.key, label: x.name, group: pname(x.pipelineId), color: x.color }))
  }, [meta.stages, meta.pipelines]) // eslint-disable-line
  const summary = (f) => {
    const n = (f.options || []).length
    if (f.type === 'select' || f.type === 'multiselect') return `${n} ${t('variant')}`
    return '...'
  }
  const save = async (v) => {
    if (modal?.initial) await crmService.updateField(modal.initial.id, v)
    else await crmService.createField({ ...v, entity: 'lead' })
    setModal(null); await load(); onChanged?.()
  }
  return (
    <div className="ac-cfs">
      <div className="ac-cfs__top">
        <div className="ac-cfs__title">{t('Maydonlar va guruhlarni sozlash')}</div>
        <button className="ac-cfs__x" onClick={onClose}><Ico name="close" size={20} /></button>
        <div className="ac-cfs__desc">{t("O'z maydonlaringizni qo'shib, ulardan filtr va hisobotlarda foydalanishingiz mumkin.")}</div>
        <div className="ac-cfs__tabs">
          {groups.map((g) => <button key={g || '_'} className={group === g ? 'on' : ''} onClick={() => setGroup(g)}>{g || t('card§Asosiy')}</button>)}
          <button className="ac-cfs__plus" title={t("Maydon qo'shish")} onClick={() => setModal({ initial: null, group })}><Ico name="plus" size={12} /></button>
        </div>
      </div>
      <div className="ac-cfs__list">
        {group === '' && <div className="ac-cfs__row fixed"><span className="nm">{t('Bitim byudjeti')}</span><span className="sm">0 {currency()}</span></div>}
        {fields === null && <div className="ac-spinner" />}
        {(fields || []).filter((f) => f.group === group).map((f) => (
          <div key={f.id} className={`ac-cfs__row ${f.active === false ? 'off' : ''}`} onClick={() => setModal({ initial: f })}>
            <span className="nm" title={f.label}>{f.label}</span>
            <span className="sm">{summary(f)}</span>
            {(f.requiredStages || []).length > 0 && <span className="ac-fs-req">{t('Majburiy')} {f.requiredStages.length}</span>}
          </div>
        ))}
      </div>
      {modal && <FieldModal initial={modal.initial} defaultGroup={modal.group} groups={groups} onSave={save} onClose={() => setModal(null)} entity="lead" stageOpts={stageOpts} />}
    </div>
  )
}

export function CardResizer() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    try { const w = localStorage.getItem('amo_card_w'); if (w) document.documentElement.style.setProperty('--cf-w', w) } catch { /* */ }
  }, [])
  const down = (e) => {
    const page = e.currentTarget.closest('.ac-cardpage')
    if (!page) return
    e.preventDefault()
    setOn(true)
    const rect = page.getBoundingClientRect()
    const move = (ev) => {
      const pct = Math.min(50, Math.max(20, ((ev.clientX - rect.left) / rect.width) * 100))
      document.documentElement.style.setProperty('--cf-w', `${pct.toFixed(2)}%`)
    }
    const up = () => {
      setOn(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      try { localStorage.setItem('amo_card_w', getComputedStyle(document.documentElement).getPropertyValue('--cf-w').trim()) } catch { /* */ }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return <div className={`ac-cf__resize ${on ? 'on' : ''}`} onPointerDown={down} />
}

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
      {/* amoCRM: bosib o'tilgan har bir bosqich o'z rangida bo'lak (segment) bo'lib chiziladi */}
      <div className="ac-status__bar">
        {openStages.map((s, i) => (
          <div key={s.id} className="ac-status__seg" style={{ background: st?.kind === 'lost' ? '#c5c5c5' : (st?.kind === 'won' || i < pos) ? s.color || '#99ccff' : 'transparent' }} />
        ))}
      </div>
      {(() => { // bosqich tavsifi (voronka sozlamalaridan): hozircha "Yangi boshlovchi", bo'lmasa keyingi daraja
        const h = st?.hints || {}
        const hint = h.novice || h.experienced || h.master
        return hint ? <div className="ac-status__hint" style={{ marginTop: 6, fontSize: 13, lineHeight: 1.3, whiteSpace: 'pre-wrap', color: 'var(--palette-text-secondary-dark)' }}>{hint}</div> : null
      })()}
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

// ── Kontakt bloki: bitta kontakt (amoCRM .linked-forms__item) ──
function ContactItem({ contact, leadId, isMain, canMain, onUnlink, onMain, onChange }) {
  const t = useT()
  const navigate = useNavigate()
  const [more, setMore] = useState(false)
  const [phoneEdit, setPhoneEdit] = useState(false)
  const open = () => contact.id && !contact.isNew && navigate(`/contacts/detail/${contact.id}`)
  return (
    <div className="ac-linked">
      <div className="ac-linked__head">
        <div className="ac-linked__avatar"><PersonAvatar size={36} /></div>
        <div className="ac-linked__name" onClick={open}>{contact.name}</div>
        <DotsMenu align="left" className="ac-linked__dots" items={[
          !contact.isNew && { label: t("Kartochkaga o'tish"), icon: 'external', onClick: open },
          { label: t('Ismni nusxalash'), icon: 'list', onClick: () => navigator.clipboard?.writeText(contact.name || '') },
          canMain && !isMain && { label: t('Asosiy qilish'), icon: 'star', onClick: onMain },
          { label: t('Uzish'), icon: 'link', onClick: onUnlink },
        ]} />
      </div>
      <div className="ac-linked__fields">
        <FieldRow label={t('Kompaniya')}>
          {contact.companyName ? <span className="ac-field__link">{contact.companyName}</span> : <span className="ac-field__ph">...</span>}
        </FieldRow>
        <FieldRow label={t('Ish tel.')}>
          {contact.phone && !phoneEdit ? (
            <span className="ac-field__phone">
              <span className="ac-field__plusmini" title={t("Telefon qo'shish")} onClick={() => setPhoneEdit(true)}><Ico name="plus" size={8} /></span>
              <PhoneLink value={contact.phone} leadId={leadId} />
              <span className="ac-field__pen" onClick={() => setPhoneEdit(true)}><Ico name="edit" size={12} /></span>
            </span>
          ) : (
            <input className="ac-field__edit" autoFocus={phoneEdit} value={contact.phone || ''} placeholder="..." onBlur={() => setPhoneEdit(false)} onChange={(e) => onChange({ phone: e.target.value })} />
          )}
        </FieldRow>
        {more && (
          <>
            <FieldRow label={t('Email ish.')}>
              <input className="ac-field__edit" value={contact.email || ''} placeholder="..." onChange={(e) => onChange({ email: e.target.value })} />
            </FieldRow>
            <FieldRow label={t('Lavozim')}>
              <input className="ac-field__edit" value={contact.position || ''} placeholder="..." onChange={(e) => onChange({ position: e.target.value })} />
            </FieldRow>
          </>
        )}
        <button className="ac-linked__more" onClick={() => setMore((v) => !v)}>{t(more ? 'yashirish' : 'yana')}</button>
      </div>
    </div>
  )
}

// "Kontakt qo'shish": qidiruv (mavjud kontakt) yoki yangi kontakt nomi
function ContactAdder({ exclude, onLink }) {
  const t = useT()
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  useEffect(() => {
    if (!adding || !q.trim()) { setFound([]); return }
    const h = setTimeout(() => crmService.listContacts(q).then((r) => setFound(r.contacts || [])).catch(() => {}), 250)
    return () => clearTimeout(h)
  }, [q, adding])
  const pick = (c) => { setAdding(false); setQ(''); onLink(c) }
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
        <input autoFocus className="ac-input" placeholder={t('Ism, telefon yoki email')} value={q} onChange={(e) => setQ(e.target.value)}
          onBlur={() => !q.trim() && setAdding(false)} onKeyDown={(e) => e.key === 'Escape' && setAdding(false)} />
        {q.trim() && (
          <div className="ac-linked__results">
            {found.filter((c) => !exclude.includes(c.id)).map((c) => <div key={c.id} className="ac-linked__result" onMouseDown={(e) => { e.preventDefault(); pick(c) }}>{c.name} <span className="ac-muted">{c.phone || ''}</span></div>)}
            <div className="ac-linked__result" style={{ color: '#1691ff' }} onMouseDown={(e) => { e.preventDefault(); pick({ name: q.trim(), isNew: true }) }}>+ {t('Yangi kontakt')}: {q.trim()}</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Kompaniya bloki (amoCRM: "КОМПАНИЯ" yorlig'i, nom, "…", ish tel./email/web) ──
// amoCRM «Товары» bitimda: katalogdan pozitsiya qo'shish, miqdor; byudjet pozitsiyalar summasidan hisoblanadi
function LeadProducts({ items, onChange }) {
  const t = useT()
  const [catalog, setCatalog] = useState(null)
  const [adding, setAdding] = useState(false)
  useEffect(() => { if (adding && !catalog) crmService.listProducts().then((r) => setCatalog(r.products || [])).catch(() => setCatalog([])) }, [adding, catalog])
  const list = Array.isArray(items) ? items : []
  const total = list.reduce((a, it) => a + (Number(it.price) || 0) * (Number(it.qty) || 1), 0)
  const add = (id) => {
    const p = (catalog || []).find((x) => x.id === id)
    if (!p) return
    const i = list.findIndex((x) => x.productId === p.id)
    onChange(i >= 0 ? list.map((x, j) => (j === i ? { ...x, qty: (Number(x.qty) || 1) + 1 } : x)) : [...list, { productId: p.id, name: p.name, price: p.price, qty: 1 }])
    setAdding(false)
  }
  if (!list.length && !adding) {
    return <div className="ac-lprod"><a className="ac-lprod__add" onClick={() => setAdding(true)}>+ {t("Mahsulot qo'shish")}</a></div>
  }
  return (
    <div className="ac-lprod">
      <div className="ac-lprod__head">{t('Mahsulotlar')}</div>
      {list.map((it, i) => (
        <div className="ac-lprod__row" key={`${it.productId || it.name}-${i}`}>
          <span className="ac-lprod__name">{it.name}</span>
          <input className="ac-field__edit ac-lprod__qty" type="number" min="1" value={it.qty || 1} onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x)))} />
          <span className="ac-lprod__sum">× {money(it.price)} = {money((Number(it.price) || 0) * (Number(it.qty) || 1))}</span>
          <button className="ac-lprod__del" title={t("O'chirish")} onClick={() => onChange(list.filter((_, j) => j !== i))}><Ico name="close" size={10} /></button>
        </div>
      ))}
      {adding ? (
        <select className="ac-field__edit ac-lprod__pick" autoFocus value="" onBlur={() => setAdding(false)} onChange={(e) => add(e.target.value)}>
          <option value="">{catalog ? t('Mahsulotni tanlang') : '…'}</option>
          {(catalog || []).map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.price)}</option>)}
        </select>
      ) : <a className="ac-lprod__add" onClick={() => setAdding(true)}>+ {t("Mahsulot qo'shish")}</a>}
      {list.length > 0 && <div className="ac-lprod__total">{t('Jami')}: <b>{money(total)}</b></div>}
      {adding && catalog && !catalog.length && <div className="ac-lprod__empty">{t("Katalog bo'sh")} — <a href="/catalogs/products">{t('Mahsulotlar')}</a></div>}
    </div>
  )
}

function CompanyBlock({ company, name }) {
  const t = useT()
  const navigate = useNavigate()
  if (!company && !name) {
    return (
      <button className="ac-linked__add" onClick={() => navigate('/companies/add')}>
        <span className="ac-linked__plus"><Ico name="plus" /></span>{t("Kompaniya qo'shish")}
      </button>
    )
  }
  const open = () => company?.id && navigate(`/companies/detail/${company.id}`)
  const val = (v, href) => v ? (href ? <a className="ac-field__link" href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">{v}</a> : v) : <span className="ac-field__ph">...</span>
  return (
    <div className="ac-linked">
      <div className="ac-linked__head">
        <div className="ac-linked__avatar ac-linked__avatar--co"><Ico name="company" size={16} /></div>
        <div style={{ minWidth: 0 }}>
          <div className="ac-linked__kind">{t('Kompaniya')}</div>
          <div className="ac-linked__name" onClick={open}>{company?.name || name}</div>
        </div>
        {company?.id && <DotsMenu align="left" className="ac-linked__dots" items={[
          { label: t("Kartochkaga o'tish"), icon: 'external', onClick: open },
          { label: t('Ismni nusxalash'), icon: 'list', onClick: () => navigator.clipboard?.writeText(company.name || '') },
        ]} />}
      </div>
      <div className="ac-linked__fields">
        <FieldRow label={t('Ish tel.')}>{company?.phone ? <PhoneLink value={company.phone} /> : <span className="ac-field__ph">...</span>}</FieldRow>
        <FieldRow label={t('Email ish.')}>{val(company?.email, company?.email && `mailto:${company.email}`)}</FieldRow>
        <FieldRow label="Web">{val(company?.website, company?.website && (/^https?:/.test(company.website) ? company.website : `https://${company.website}`))}</FieldRow>
      </div>
    </div>
  )
}

// ── Statistika tabi (amoCRM .card-statistic) ──
const UTM_ALL = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_referrer', 'roistat', 'referrer',
  'openstat_service', 'openstat_campaign', 'openstat_ad', 'openstat_source', 'from', 'gclientid', '_ym_uid', '_ym_counter', 'gclid', 'yclid', 'fbclid']

function LeadStats({ lead, feed }) {
  const t = useT()
  const [showUtm, setShowUtm] = useState(false)
  const days = Math.max(0, Math.floor((Date.now() - new Date(lead.createdAt)) / 86400000))
  const callsIn = feed.calls.filter((c) => c.direction === 'in').length
  const now = Date.now()
  const doneTasks = feed.tasks.filter((x) => x.done).length
  const overdue = feed.tasks.filter((x) => x.dueDate && new Date(x.done ? x.doneAt || x.dueDate : now) > new Date(x.dueDate)).length
  const chats = feed.messages.length
  const utm = UTM_ALL.filter((k) => lead.custom?.[k])
  const Row = ({ l, sub, v }) => <div className="ac-cstats__row"><span>{t(l)} {sub && <small>{sub}</small>}</span><b>{v}</b></div>
  return (
    <div className="ac-cstats">
      <div className="ac-cstats__src">
        <b>{t('Manba')}:</b>
        <div>{lead.source || '—'} / {dmy(lead.createdAt)}</div>
      </div>
      <div className="ac-cstats__days"><div className="ac-cstats__big">{days}</div><div>{t('Ishdagi kunlar')}</div></div>
      <div className="ac-cstats__rows">
        <Row l="Qo'ng'iroqlar" sub={t('kir. / chiq.')} v={`${callsIn}/${feed.calls.length - callsIn}`} />
        <Row l="Xatlar" v={0} />
        <Row l="Vazifalar" sub={<>{t('yopilgan')} / <span className="red">{t("muddati o'tgan")}</span></>} v={<>{doneTasks}/<span className="red">{overdue}</span></>} />
        <Row l="Eslatmalar" v={(lead.notes || []).length} />
        <Row l="Mijozlar bilan chatlar" v={chats} />
        <Row l="Ichki chatlar" v={0} />
      </div>
      <div className="ac-cstats__utm">
        <b>{t('Statistika tizimlari belgilari')}:</b>
        <div>{t('{n} tadan {m} tasi to\'ldirilgan').replace('{n}', UTM_ALL.length).replace('{m}', utm.length)} <a onClick={() => setShowUtm((v) => !v)}>{t(showUtm ? 'Yashirish' : "Ko'rsatish")}</a></div>
        {showUtm && UTM_ALL.map((k) => <FieldRow key={k} label={k}>{lead.custom?.[k] || <span className="ac-field__ph">...</span>}</FieldRow>)}
      </div>
    </div>
  )
}

// ── Lenta elementlari ──
export function SysLine({ at, who, text, link }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [long, setLong] = useState(false)
  // amoCRM: uzun yozuv bir qatorda kesiladi, "⌄" bosilsa to'liq ochiladi
  const measure = (el) => { if (el && !open) setLong(el.scrollWidth > el.clientWidth + 1) }
  return (
    <div className={`ac-feed__sys ${open ? 'open' : ''}`}>
      <span className="grow" ref={measure}>{feedDateFull(at, t)} {who && <b>{who}</b>} {text}</span>
      {(long || open) && <span className="ac-feed__more" onClick={() => setOpen((v) => !v)}><Ico name="chevronDown" size={10} /></span>}
      {link}
    </div>
  )
}

export function CallNote({ c }) {
  const t = useT()
  const [audio, setAudio] = useState(null)
  const [err, setErr] = useState(false)
  useEffect(() => () => { if (audio) URL.revokeObjectURL(audio) }, [audio])
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
  const [busy, setBusy] = useState(false)
  const finish = async () => { if (busy) return; setBusy(true); try { await onDone(task, res) } finally { setBusy(false) } }
  const kind = taskKind(task)
  const tt = TASK_TYPES.find((x) => x.key === task.type) || TASK_TYPES[2]
  const typeLabel = tt.label
  return (
    <div className={`ac-note ac-note--task ${kind}`}>
      <div className="ac-note__icon"><Ico name={task.done ? 'check' : 'clock'} size={17} /></div>
      <div className="ac-note__body">
        <div className="ac-note__head"><span className="grow">{task.dueDate ? feedDate(task.dueDate, t) : t('Muddatsiz')} {task.assigneeName ? `${t('uchun')} ${task.assigneeName}` : ''}</span></div>
        <div className="ac-note__text"><span className="ac-note__ttype"><Ico name={tt.icon} size={13} /></span><b>{t(typeLabel)}</b> — {task.title}</div>
        {task.done && task.result && <div className="ac-note__text ac-muted" style={{ textDecoration: 'none' }}>{t('Natija')}: {task.result}</div>}
        {!task.done && (
          <div className="ac-task-result">
            <input className="ac-input" placeholder={t("Natija qo'shing")} value={res} onChange={(e) => setRes(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && finish()} />
            <button className="ac-btn" disabled={busy} onClick={finish}>{t('Bajarish')}</button>
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

// Suhbat raqami: leadId'dan barqaror "A1234" ko'rinishidagi yorliq (imBox bilan bir xil)
export function convNum(id) {
  let h = 0
  for (let i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) % 9000
  return `A${1000 + h}`
}
const CHAN_TITLE = { instagram: 'Instagram', facebook: 'Facebook Messenger', telegram: 'Telegram', whatsapp: 'WhatsApp' }

// amoCRM: ketma-ket chat xabarlari bitta "suhbat bloki"da — tepada kanal, pastda "Беседа № A1234"
// Chat composer: "Javob shablonlari" (Sozlamalar → Chatlar) — tanlansa matn maydoniga qo'yiladi
export function TemplatePicker({ onPick }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [list, setList] = useState(null)
  const ref = useRef(null)
  useOutside(ref, () => setOpen(false), open)
  const toggle = () => {
    setOpen((v) => !v)
    if (!list) crmService.chatSettings().then((r) => setList((r.templates || []).filter((x) => x.active !== false))).catch(() => setList([]))
  }
  return (
    <span className="ac-tplpick" ref={ref}>
      <button type="button" className="ac-tplpick__btn" title={t('Javob shablonlari')} onClick={toggle}><Ico name="list" size={16} /></button>
      {open && (
        <div className="ac-menu ac-tplpick__menu">
          {list === null && <div className="ac-menu__item"><span className="ac-spinner" /></div>}
          {list && list.length === 0 && <div className="ac-menu__item ac-muted">{t("Shablonlar yo'q — Sozlamalar → Chatlar")}</div>}
          {(list || []).map((x) => (
            <button key={x.id} className="ac-menu__item" title={x.text} onClick={() => { onPick(x.text); setOpen(false) }}>
              <span className="grow">{x.name}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  )
}

// conv — faqat oxirgi suhbat blokiga: { closed, onClose } (amoCRM: «Закрыть · Беседа № …»)
// Bitim kartochkasidan Salesbot'ni qo'lda ishga tushirish (amoCRM: «запускайте вручную – через карточку сделки»)
function BotPick({ leadId, onClose }) {
  const t = useT()
  const [bots, setBots] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { api.get('/crm/salesbots').then((r) => setBots((r.bots || []).filter((b) => b.active))).catch(() => setBots([])) }, [])
  const run = async (id) => {
    try { await api.post(`/crm/salesbots/${id}/run`, { leadId }); onClose(true) } catch (e) { setErr(e?.data?.message || e?.message || t('Xatolik yuz berdi')) }
  }
  return (
    <div className="ac-modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose(false)}>
      <div className="ac-modal" style={{ maxWidth: 420 }}>
        <button className="ac-modal__close" onClick={() => onClose(false)}><Ico name="close" /></button>
        <h2 className="ac-modal__title">{t("Salesbot'ni ishga tushirish")}</h2>
        {!bots && <div className="ac-spinner" />}
        {bots && !bots.length && <div className="ac-muted">{t("Faol botlar yo'q — «AI-agentlar va botlar» bo'limida yarating")}</div>}
        {bots?.map((b) => <div key={b.id} className="ac-botpick__item" onClick={() => run(b.id)}><Ico name="play" size={13} /> {b.name}</div>)}
        {err && <div className="ac-import-err" style={{ marginTop: 10 }}>{err}</div>}
      </div>
    </div>
  )
}

export function MsgGroup({ msgs, leadId, conv }) {
  const t = useT()
  const ch = msgs[0]?.channel || 'telegram'
  const comment = msgs[0]?.kind === 'comment'
  return (
    <div className="ac-chatblock">
      <div className="ac-chatblock__head"><Ico name={ch === 'facebook' ? 'facebook' : ch === 'instagram' ? 'instagram' : 'telegram'} size={12} /> {CHAN_TITLE[ch] || ch}{comment ? ` (${t('izohlar')})` : ''}</div>
      {msgs.map((m) => <MsgItem key={m.id} m={m} />)}
      <div className="ac-chatblock__foot">
        {conv && (conv.closed ? <span className="ac-chatblock__closed">{t('Suhbat yopilgan')}</span> : <button className="ac-chatblock__close" onClick={conv.onClose}>{t('Yopish')}</button>)}
        <span className={conv && !conv.closed ? 'open' : ''}>{t('Suhbat')} № {convNum(leadId)}</span>
      </div>
    </div>
  )
}

export function MsgItem({ m }) {
  const t = useT()
  return (
    <div className={`ac-msg ${m.direction === 'out' ? 'ac-msg--out' : ''}`}>
      <div className="ac-msg__bubble">
        <div className="ac-msg__head">{feedDateFull(m.createdAt, t)} {m.senderName || ''}
          {m.status === 'error' && <span className="ac-msg__err" title={m.error || ''}><Ico name="alert" size={11} />{t('Xatolik')}</span>}
        </div>
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

// Server matnidagi takroriy prefiksni olib tashlash: "Yangi bosqich: Bosqich: X" -> "Yangi bosqich: X"
const ACT_PREFIX = /^(Bosqich|Lid yaratildi|Vazifa bajarildi|Vazifa|Sotuv yopildi|Yo'qotildi)\s*[:—-]?\s*/
function actText(a, t) {
  const base = t(ACT_TEXT[a.type] || ACT_TEXT.updated)
  let txt = String(a.text || '').replace(/^🏆\s*/, '')
  if (['stage', 'created', 'task_created', 'task_done', 'won', 'lost'].includes(a.type)) txt = txt.replace(ACT_PREFIX, '')
  else txt = trActivity(txt, t, a.data)
  if (!txt || txt === base || txt === ACT_TEXT[a.type]) return base
  return `${base}: ${txt}`
}

const ACT_GROUP = { created: 'Yaratish', field: "Maydon o'zgarishi", updated: "Maydon o'zgarishi", tag: "Teglar o'zgartirildi" }
const dayOf = (d) => new Date(d).toDateString()
const contactsOf = (l) => l.contacts || (l.contact ? [l.contact] : [])
// "3 события / 13 событий" — ruscha ko'plik i18n'da ("voqea" kalitlari)
function plEvents(n) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'voqea'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'voqea_few'
  return 'voqea_many'
}

// ── Composer: Chat / Eslatma / Vazifa ──
function Composer({ lead, canChat, members, onSent, modeReq }) {
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
  // "Vazifa yo'q, qo'shishni tavsiya qilamiz" havolasi composer'ni vazifa rejimida ochadi
  useEffect(() => { if (modeReq?.n) { setMode(modeReq.mode); setFocus(true) } }, [modeReq?.n]) // eslint-disable-line

  const send = async () => {
    if (busy) return
    if (mode !== 'task' && !text.trim()) return
    if (mode === 'task' && (!due || isNaN(new Date(due).getTime()))) { window.alert(t("Sanani to'g'ri kiriting")); return }
    setBusy(true)
    try {
      if (mode === 'chat') await crmService.sendMessage(lead.id, text.trim())
      else if (mode === 'note') await crmService.addNote(lead.id, text.trim())
      else await crmService.createTask(lead.id, { title: text.trim() || t(TASK_TYPES.find((x) => x.key === type).label), type, dueDate: new Date(due).toISOString(), assigneeId: assignee || undefined })
      setText(''); setFocus(false); onSent()
    } catch (e) { window.alert(e?.message || t('Xatolik yuz berdi')) } finally { setBusy(false) }
  }
  const labels = { chat: 'Chat', note: 'Eslatma', task: 'Vazifa' }
  return (
    <div ref={wrap} className={`ac-compose ${focus ? 'focus' : ''}`} onClick={() => { setFocus(true); ref.current?.focus() }}>
      <div className="ac-compose__line">
        <span className="ac-compose__mode">
          {modesOpen && (
            <div className="ac-menu ac-compose__modes">
              {['chat', 'note', 'task'].filter((m) => m !== 'chat' || canChat).map((m) => (
                <button key={m} className={`ac-menu__item ${mode === m ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); setMode(m); setModesOpen(false) }}>
                  <span className="grow">{t(labels[m])}</span>{mode === m && <Ico name="check" size={12} />}
                </button>
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
            <span>{t("vazifa§")}</span>
            <DueDatePicker value={due} onChange={setDue} />
            <span>{t('uchun')}</span>
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <span>:</span>
            <select className="ac-compose__type" value={type} onChange={(e) => setType(e.target.value)}>
              {TASK_TYPES.map((x) => <option key={x.key} value={x.key}>{t(x.label)}</option>)}
            </select>
            <span>:</span>
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
          {mode === 'chat' && <TemplatePicker onPick={(x) => { setText(x); ref.current?.focus() }} />}
        </div>
      )}
    </div>
  )
}

// amoCRM vazifa sanasi: "31.10.2026 12:00" tugmasi; ochilganda tezkor variantlar, sana va vaqt
function DueDatePicker({ value, onChange }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useOutside(ref, () => setOpen(false), open)
  const d = value ? new Date(value) : null
  const p = (n) => String(n).padStart(2, '0')
  const label = d && !isNaN(d) ? `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}` : t('Sana')
  const keepTime = (base) => { const x = new Date(base); const h = d && !isNaN(d) ? d : null; x.setHours(h ? h.getHours() : 12, h ? h.getMinutes() : 0, 0, 0); return x }
  const quick = [
    ['Bugun', () => new Date()],
    ['Ertaga', () => { const x = new Date(); x.setDate(x.getDate() + 1); return x }],
    ['Shu hafta oxirida', () => { const x = new Date(); x.setDate(x.getDate() + ((7 - x.getDay()) % 7 || 7) - 2); return x }],
    ['Bir haftadan keyin', () => { const x = new Date(); x.setDate(x.getDate() + 7); return x }],
    ['Bir oydan keyin', () => { const x = new Date(); x.setMonth(x.getMonth() + 1); return x }],
    ['Bir yildan keyin', () => { const x = new Date(); x.setFullYear(x.getFullYear() + 1); return x }],
  ]
  const datePart = value ? value.slice(0, 10) : ''
  const timePart = value ? value.slice(11, 16) : '12:00'
  return (
    <span className="ac-duepick" ref={ref}>
      <button type="button" className="ac-duepick__btn" onClick={() => setOpen((v) => !v)}>{label}</button>
      {open && (
        <div className="ac-menu ac-duepick__pop">
          {quick.map(([l, fn]) => <button key={l} className="ac-menu__item" onClick={() => { onChange(toLocalInput(keepTime(fn()))); setOpen(false) }}>{t(l)}</button>)}
          <div className="ac-duepick__exact">
            <input type="date" value={datePart} onChange={(e) => e.target.value && onChange(`${e.target.value}T${timePart}`)} />
            <input type="time" value={timePart} onChange={(e) => datePart && onChange(`${datePart}T${e.target.value || '12:00'}`)} />
          </div>
        </div>
      )}
    </span>
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
  const [contactEdits, setContactEdits] = useState({}) // kontakt id -> o'zgargan maydonlar (Saqlash bosilganda yoziladi)
  const [pipes, setPipes] = useState([])
  const [fields, setFields] = useState([])
  const [members, setMembers] = useState([])
  const [feed, setFeed] = useState({ calls: [], tasks: [], messages: [], canReply: false })
  const [tab, setTab] = useState('main')
  const [feedQ, setFeedQ] = useState('')
  const [tagInput, setTagInput] = useState(null)
  const [botPick, setBotPick] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tagColors, setTagColors] = useState({})
  const [modeReq, setModeReq] = useState(null)
  const [expanded, setExpanded] = useState({}) // guruhlangan tizim voqealari ("Развернуть")

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
    setFeed({ calls: c.calls || [], tasks: tk.tasks || [], messages: m.messages || [], canReply: !!m.canReply, closed: !!m.closed })
  }

  // Lenta o'zi yangilanib tursin: OnlinePBX/MicroSIP qo'ng'iroqlari, yangi xabarlar (sahifa ko'rinib turganda, 15 s).
  // Kartochkadan qo'ng'iroq boshlanganda — webhook kelishiga vaqt berib, tezroq tekshiramiz.
  useEffect(() => {
    if (isNew) return
    const tick = () => { if (document.visibilityState === 'visible') loadFeed() }
    const iv = setInterval(tick, 15000)
    let t1, t2
    const onCall = () => { clearTimeout(t1); clearTimeout(t2); t1 = setTimeout(tick, 5000); t2 = setTimeout(tick, 30000) }
    window.addEventListener('pbx:outgoing', onCall)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(iv); clearTimeout(t1); clearTimeout(t2); window.removeEventListener('pbx:outgoing', onCall); document.removeEventListener('visibilitychange', tick) }
  }, [id, isNew]) // eslint-disable-line react-hooks/exhaustive-deps

  // Amma vazifa/izoh qo'shganda kartochka va lentani yangilash
  useEffect(() => {
    const h = () => { if (!isNew) { loadLead(); loadFeed() } }
    window.addEventListener('amo:lead-changed', h)
    return () => window.removeEventListener('amo:lead-changed', h)
  })
  useEffect(() => {
    setDraft({}); setContactEdits({}); setTab('main')
    const pid = sp.get('pipeline') || ''
    if (isNew) setLead({ id: null, n: '', stage: '', pipelineId: pid, tags: [], custom: {}, value: 0, assigneeId: user?.id, activity: [], notes: [] })
    else { setLead(null); loadLead() }
    loadFeed()
    ;(async () => {
      const [main, fl, mem] = await Promise.all([crmService.getPipeline(), crmService.listFields('lead'), crmService.listMembers()])
      crmService.listTags().then((r) => setTagColors(Object.fromEntries((r.tags || []).map((x) => [x.name, x.color])))).catch(() => {})
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
  const dirty = isNew || Object.keys(draft).length > 0 || Object.keys(contactEdits).length > 0
  const set = (k, val) => setDraft((d) => ({ ...d, [k]: val }))
  const setCustom = (k, val) => setDraft((d) => ({ ...d, custom: { ...(d.custom || {}), [k]: val } }))

  const save = async () => {
    setSaving(true)
    try {
      for (const [cid, patch] of Object.entries(contactEdits)) {
        if (!cid.startsWith('new:')) await crmService.updateContact(cid, patch)
      }
      const payload = { ...draft }
      if (payload.value !== undefined) payload.value = Number(String(payload.value).replace(/\D/g, '')) || 0
      if (isNew) {
        // yangi bitim: kontaktlar avval yaratiladi/biriktiriladi (birinchisi asosiy)
        const ids = []
        for (const c of contactsOf(lead)) {
          if (c.isNew) ids.push((await crmService.createContact({ name: c.name, ...(contactEdits[c.id] || {}) })).contact?.id)
          else ids.push(c.id)
        }
        const r = await crmService.createLead({ name: v.n || `${t('Bitim')} #${Date.now().toString().slice(-6)}`, stage: v.stage, pipelineId: v.pipelineId || undefined, value: payload.value ?? 0, assigneeId: v.assigneeId || undefined, tags: v.tags, custom: v.custom, items: v.items?.length ? v.items : undefined, contactId: ids[0] || undefined })
        for (const cid of ids.slice(1).filter(Boolean)) await crmService.addLeadContact(r.lead.id, { contactId: cid })
        navigate(`/leads/detail/${r.lead.id}`, { replace: true })
        return
      }
      if (payload.n !== undefined) { payload.name = payload.n; delete payload.n }
      await crmService.updateLead(lead.id, payload)
      setDraft({}); setContactEdits({})
      await loadLead()
    } finally { setSaving(false) }
  }

  // Kontaktni biriktirish/uzish darhol saqlanadi; yangi (hali saqlanmagan) bitimda — faqat lokal ro'yxat
  const linkOp = async (remote, local) => {
    if (isNew) { if (local) setLead(local); return }
    try { await remote() } catch (e) { window.alert(e?.message || t('Xatolik yuz berdi')); return }
    loadLead()
  }

  const pickStatus = async (pipelineId, stage) => {
    if (isNew) { setLead((l) => ({ ...l, pipelineId, stage: stage.id })); return }
    let reason
    if (stage.kind === 'lost') {
      const r = window.prompt(t("Yo'qotish sababi"))
      if (r === null) return
      reason = r || undefined
    }
    try {
      if ((lead.pipelineId || '') !== pipelineId) await crmService.updateLead(lead.id, { pipelineId: pipelineId || '' })
      await crmService.moveLead(lead.id, stage.id, undefined, reason)
    } catch (e) { window.alert(e?.message || t('Xatolik yuz berdi')) }
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
    try { await crmService.updateTask(task.id, { done: true, result: result?.trim() || undefined }) } catch (e) { window.alert(e?.message || t('Xatolik yuz berdi')); return }
    loadFeed(); loadLead()
  }

  // Saralanmagan bitim: amoCRM pastki paneli "Принять / Отклонить"
  const acceptLead = async () => {
    const pipe = pipes.find((p) => (p.id || '') === (lead.pipelineId || '')) || pipes[0]
    const first = (pipe?.stages || []).find((s) => s.kind === 'open')
    try { await crmService.acceptUnsorted(lead.id, { stageKey: first?.id, pipelineId: pipe?.id || null, assigneeId: lead.assigneeId || user?.id }) } catch (e) { window.alert(e?.message || t('Xatolik yuz berdi')); return }
    loadLead()
  }
  const rejectLead = async () => {
    if (!window.confirm(t('Bitimni rad etasizmi?'))) return
    try { await crmService.deleteLead(lead.id) } catch (e) { window.alert(e?.message || t('Xatolik yuz berdi')); return }
    navigate('/leads/pipeline' + (lead.pipelineId ? `/${lead.pipelineId}` : ''))
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
    // bog'langan kontaktlarning eslatmalari (amoCRM: o'ng tomonda kontakt nomi havola sifatida)
    for (const ct of lead.contacts || []) for (const n of ct.notes || []) items.push({ at: n.at, kind: 'note', n, ct })
    for (const c of feed.calls) items.push({ at: c.startedAt, kind: 'call', c })
    for (const tk of feed.tasks) if (tk.done) items.push({ at: tk.doneAt || tk.dueDate, kind: 'task', tk })
    for (const m of feed.messages) items.push({ at: m.createdAt, kind: 'msg', m })
  }
  const q = feedQ.trim().toLowerCase()
  const shown = items
    .filter((it) => !q || JSON.stringify(it).toLowerCase().includes(q))
    .sort((a, b) => new Date(a.at) - new Date(b.at))
  const openTasks = feed.tasks.filter((x) => !x.done).sort((a, b) => new Date(a.dueDate || 8e15) - new Date(b.dueDate || 8e15))
  // amoCRM: ketma-ket kelgan bir turdagi tizim voqealari (3+) "Изменение поля: 13 событий Развернуть" bo'lib yig'iladi
  const groups = []
  for (const it of shown) {
    const g = groups[groups.length - 1]
    if (it.kind === 'sys' && g?.kind === 'grp' && g.type === it.a.type && dayOf(g.items[0].at) === dayOf(it.at)) g.items.push(it)
    else if (it.kind === 'sys') groups.push({ kind: 'grp', type: it.a.type, at: it.at, items: [it] })
    else if (it.kind === 'msg' && g?.kind === 'chat' && g.channel === it.m.channel && dayOf(g.at) === dayOf(it.at)) g.msgs.push(it.m)
    else if (it.kind === 'msg') groups.push({ kind: 'chat', channel: it.m.channel, at: it.at, msgs: [it.m] })
    else groups.push(it)
  }
  let lastDay = ''

  return (
    <div className="ac-cardpage">
      <div className="ac-cf">
        <div className="ac-cf__scroll">
          <div className="ac-cf__top">
            <button className="ac-cf__back" onClick={() => navigate(-1)} title={t('Orqaga')}><Ico name="chevronLeft" /></button>
            <div className="ac-cf__namerow">
              <textarea className="ac-cf__name" rows={1} value={v.n || ''} placeholder={isNew ? `${t('Bitim')} #XXXXXX` : `${t('Bitim')} #${String(lead.id).slice(-8)}`}
                onChange={(e) => set('n', e.target.value.replace(/\n/g, ' '))} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
              {!isNew && (
                <DotsMenu items={[
                  { label: t('Chop etish'), icon: 'print', onClick: () => window.print() },
                  { label: t('Teglarni boshqarish'), icon: 'hash', onClick: () => setTagInput('') },
                  { label: t("Salesbot'ni ishga tushirish"), icon: 'play', onClick: () => setBotPick(true) },
                  { label: t("card§Botni to'xtatish"), icon: 'close', onClick: () => api.post(`/crm/leads/${lead.id}/salesbot-stop`, {}).then((r) => { window.alert(r.stopped ? t("Bot to'xtatildi") : t("Ishlayotgan bot yo'q")); loadLead(); loadFeed() }).catch(() => {}) },
                  { label: t('Excelga eksport'), icon: 'excel', onClick: () => window.open('/api/v1' + crmService.exportUrl(), '_blank') },
                  { label: t("Bitimni o'chirish"), icon: 'trash', danger: true, onClick: deleteLead },
                ]} />
              )}
              {botPick && <BotPick leadId={lead.id} onClose={(ran) => { setBotPick(false); if (ran) { loadLead(); loadFeed() } }} />}
            </div>
            <div className="ac-cf__meta" onClick={(e) => { if (e.target === e.currentTarget && tagInput === null) setTagInput('') }}>
              {!isNew && v.n && <span>#{String(lead.id).slice(-8)}</span>}
              {(v.tags || []).map((tg) => <span key={tg} className={`ac-cf__tagpill ${tagColors[tg] ? 'ac-tag--c' : ''}`} style={tagStyle(tagColors[tg])}>{tg}<button onClick={() => removeTag(tg)}><Ico name="close" size={10} /></button></span>)}
              {tagInput === null
                ? <button className={`ac-cf__tagbtn ${(v.tags || []).length ? 'ac-cf__tagbtn--more' : ''}`} onClick={() => setTagInput('')}>{(v.tags || []).length ? '+' : `#${t('card§Teglash')}`}</button>
                : <input autoFocus className="ac-input" style={{ width: 140, height: 22 }} value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && tagInput.trim()) { addTag(tagInput); setTagInput('') } if (e.key === 'Escape') setTagInput(null) }}
                    onBlur={() => { if (tagInput.trim()) addTag(tagInput); setTagInput(null) }} />}
            </div>
            {pipes.length > 0 && <StatusPicker lead={v} pipes={pipes} onPick={pickStatus} />}
          </div>
          <div className="ac-ctabs">
            {[['main', 'card§Asosiy'], ['stats', 'card§Statistika'], ['setup', 'card§Sozlash']].map(([k, l]) => (
              <button key={k} className={`ac-ctabs__item ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{t(l)}</button>
            ))}
          </div>

          {tab === 'main' && (
            <>
              <div className="ac-fields">
                <FieldRow label={t("card§Mas'ul")}>
                  <select className="ac-field__edit" value={v.assigneeId || ''} onChange={(e) => set('assigneeId', e.target.value)}>
                    <option value="">...</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </FieldRow>
                <FieldRow label={t('Byudjet')}>
                  <span className="ac-field__money">
                    <input className="ac-field__edit" inputMode="numeric" style={{ width: `${String(draft.value !== undefined ? draft.value : (v.value || 0).toLocaleString('en-US')).length + 2}ch`, minWidth: 40, maxWidth: 220 }} value={draft.value !== undefined ? draft.value : (v.value || 0).toLocaleString('en-US')} onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 10); set('value', d ? Math.min(Number(d), 2000000000).toLocaleString('en-US') : '0') }} />
                    <span>{currency()}</span>
                  </span>
                </FieldRow>
                {fields.map((f) => (
                  <FieldRow key={f.id} label={f.label}>
                    <CustomInput field={f} value={v.custom?.[f.key]} onChange={(val) => setCustom(f.key, val)} />
                  </FieldRow>
                ))}
              </div>
              <LeadProducts items={v.items} onChange={(items) => {
                set('items', items)
                if (items.length) set('value', items.reduce((a, it) => a + (Number(it.price) || 0) * (Number(it.qty) || 1), 0).toLocaleString('en-US'))
              }} />
              {contactsOf(lead).map((c, i) => (
                <ContactItem key={c.id} leadId={lead?.id} contact={{ ...c, ...(contactEdits[c.id] || {}) }} isMain={i === 0} canMain={!isNew}
                  onChange={(patch) => setContactEdits((m) => ({ ...m, [c.id]: { ...(m[c.id] || {}), ...patch } }))}
                  onUnlink={() => linkOp(() => crmService.removeLeadContact(lead.id, c.id), (l) => ({ ...l, contacts: contactsOf(l).filter((x) => x.id !== c.id) }))}
                  onMain={() => linkOp(() => crmService.setMainLeadContact(lead.id, c.id))} />
              ))}
              <ContactAdder exclude={contactsOf(lead).map((c) => c.id)}
                onLink={(c) => linkOp(() => crmService.addLeadContact(lead.id, c.isNew ? { name: c.name } : { contactId: c.id }),
                  (l) => ({ ...l, contacts: [...contactsOf(l), c.isNew ? { ...c, id: `new:${Date.now()}` } : c] }))} />
              <CompanyBlock company={lead.companyInfo} name={lead.companyName} />
            </>
          )}
          {tab === 'stats' && !isNew && <LeadStats lead={lead} feed={feed} />}
        </div>
        {!dirty && lead.unsorted && (
          <div className="ac-cf__unsorted">
            <button className="ac-cf__accept" onClick={acceptLead}><Ico name="checkCircle" size={18} /> {t('Qabul qilish')}</button>
            <span className="ac-cf__vsep" />
            <button className="ac-cf__decline" onClick={rejectLead}><Ico name="trash" size={16} /> {t('Rad etish')}</button>
          </div>
        )}
        {tab === 'setup' && <CardFieldsSetup onClose={() => setTab('main')} onChanged={() => crmService.listFields('lead').then((fl) => setFields((fl.fields || []).filter((f) => f.active !== false))).catch(() => {})} />}
        <CardResizer />
        {dirty && (
          <div className="ac-cf__save">
            <button className="ac-btn ac-btn--blue ac-btn--plain" style={{ padding: '0 16px' }} disabled={saving} onClick={save}>{t('Saqlash')}</button>
            <button className="ac-btn ac-btn--plain" style={{ border: 0, background: 'transparent' }} onClick={() => (isNew ? navigate(-1) : (setDraft({}), setContactEdits({})))}>{t('Bekor qilish')}</button>
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
            {groups.map((it, i) => {
              const day = dayOf(it.at)
              const sep = day !== lastDay ? (lastDay = day, <div key={`s${i}`} className="ac-feed__sep"><span>{t(relDay(it.at) || '') || dmy(it.at)}</span></div>) : null
              let el = null
              if (it.kind === 'grp') {
                const gk = `${it.type}:${it.at}`
                const rows = it.items.map(({ a }) => <SysLine key={`a${a.id}`} at={a.at} who={a.actorName} text={actText(a, t)} />)
                el = it.items.length < 3 || expanded[gk] ? rows : (
                  <div className="ac-feed__sys">
                    <span className="grow">{t(relDay(it.at) || '') || dmy(it.at)} {t(ACT_GROUP[it.type] || ACT_TEXT[it.type] || ACT_TEXT.updated)}: {it.items.length} {t(plEvents(it.items.length)).replace(/^voqea_.*/, 'voqea')} <a onClick={() => setExpanded((x) => ({ ...x, [gk]: true }))}>{t('Yoyish')}</a></span>
                  </div>
                )
              } else if (it.kind === 'note') el = it.ct
                ? <div key={`n${i}`} className="ac-ec-wrap"><NoteItem n={it.n} /><a className="ac-ec-wrap__link" onClick={() => navigate(`/contacts/detail/${it.ct.id}`)}>{it.ct.name}</a></div>
                : <NoteItem key={`n${i}`} n={it.n} />
              else if (it.kind === 'call') el = <CallNote key={`c${it.c.id}`} c={it.c} />
              else if (it.kind === 'task') el = <TaskNote key={`t${it.tk.id}`} task={it.tk} onDone={completeTask} />
              else if (it.kind === 'chat') el = <MsgGroup key={`g${it.msgs[0].id}`} msgs={it.msgs} leadId={lead.id}
                conv={it.msgs[it.msgs.length - 1].id === feed.messages[feed.messages.length - 1]?.id ? { closed: feed.closed, onClose: () => crmService.conversationAction(lead.id, 'close').then(loadFeed) } : null} />
              return <React.Fragment key={i}>{sep}{el}</React.Fragment>
            })}
          </div>
        </div>
        {!isNew && (
          <div className="ac-feed__bottom">
            <div className="ac-feed__hint">
              {openTasks.length === 0 ? (
                <span className="ac-notask"><Ico name="clock" size={13} /> {t("Rejalashtirilgan vazifalar yo'q, tavsiya qilamiz")} <a onClick={() => setModeReq({ mode: 'task', n: Date.now() })}>{t("qo'shish")}</a></span>
              ) : <span />}
              <span className="ac-feed__members">{t('Ishtirokchilar')}: 0</span>
            </div>
            {openTasks.map((tk) => <TaskNote key={tk.id} task={tk} onDone={completeTask} />)}
            <Composer lead={lead} canChat={feed.canReply} members={members} modeReq={modeReq} onSent={() => { loadLead(); loadFeed() }} />
          </div>
        )}
      </div>
    </div>
  )
}
