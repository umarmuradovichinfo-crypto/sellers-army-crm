// amoCRM "Списки" — kontaktlar va kompaniyalar jadvali (/contacts/list, /companies/list).
// Kartochkalar bu yerda emas: nom bosilganda detail sahifaga o'tiladi.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { crmService } from '../../services/crm.service'
import { useAuth } from '../../context/AuthContext'
import { useApi } from '../../lib/useApi'
import TopBar, { useOutside } from '../TopBar'
import { Ico } from '../AmoIcons'
import { useT, usePlural } from '../i18n'
import '../i18n/lists.ru'
import '../leads.css'
import '../lists.css'

const PAGE = 50
const EMPTY = { preset: 'all', name: '', phone: '', email: '', assigneeId: '', period: '' }
const DAY = 86400000
const digits = (v) => String(v || '').replace(/\D/g, '')
// Mas'ul: kontakt/kompaniya customJson._assigneeId (kartochkada tanlanadi), bo'lmasa yaratuvchi
const assigneeOf = (r) => r.custom?._assigneeId || r.createdById || ''

function inPeriod(iso, period) {
  if (!period || !iso) return true
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const t = new Date(iso).getTime()
  if (period === 'today') return t >= start
  if (period === 'yesterday') return t >= start - DAY && t < start
  if (period === 'week') return t >= start - 6 * DAY
  if (period === 'month') return t >= start - 29 * DAY
  return true
}

function ListFilter({ value, members, onApply }) {
  const [f, setF] = useState(value)
  const t = useT()
  useEffect(() => setF(value), [value])
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const presets = [{ key: 'all', label: 'Hammasi' }, { key: 'mine', label: 'Faqat mening' }]
  return (
    <>
      <div className="ac-filter__presets">
        {presets.map((p) => (
          <div key={p.key} className={`ac-filter__preset ${f.preset === p.key ? 'on' : ''}`} onClick={() => onApply({ ...EMPTY, preset: p.key })}>{t(p.label)}</div>
        ))}
      </div>
      <div className="ac-filter__col ac-filter__col--fields" style={{ flex: '1 1 auto' }}>
        <div className="ac-filter__label">{t('Kontakt va kompaniya xususiyatlari')}</div>
        <input className="ac-input" placeholder={t('Nomi')} value={f.name} onChange={(e) => set('name', e.target.value)} />
        <input className="ac-input" placeholder={t('Telefon')} value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        <input className="ac-input" placeholder={t('Email')} value={f.email} onChange={(e) => set('email', e.target.value)} />
        <select className="ac-select" value={f.assigneeId} onChange={(e) => set('assigneeId', e.target.value)}>
          <option value="">{t("Mas'ul")}</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select className="ac-select" value={f.period} onChange={(e) => set('period', e.target.value)}>
          <option value="">{t('Butun vaqt uchun')}</option>
          <option value="today">{t('Bugun')}</option>
          <option value="yesterday">{t('Kecha')}</option>
          <option value="week">{t('Oxirgi 7 kun')}</option>
          <option value="month">{t('Oxirgi 30 kun')}</option>
        </select>
        <div className="ac-filter__foot">
          <button className="ac-btn ac-btn--blue ac-btn--sm" onClick={() => onApply({ ...f, preset: '' })}>{t("Qo'llash")}</button>
          <button className="ac-btn ac-btn--sm ac-btn--plain" onClick={() => onApply(EMPTY)}>{t('Tozalash')}</button>
        </div>
      </div>
    </>
  )
}

function PresetTitle({ entity, onPick }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const t = useT()
  useOutside(ref, () => setOpen(false), open)
  const items = [
    { key: 'all', label: 'Barcha kontaktlar va kompaniyalar' },
    { key: 'contacts', label: 'Kontaktlar' },
    { key: 'companies', label: 'Kompaniyalar' },
  ]
  const cur = items.find((i) => i.key === entity) || items[0]
  return (
    <span ref={ref} className={`ac-lists-title ${open ? 'open' : ''}`} onClick={() => setOpen((v) => !v)}>
      <span className="ac-top__title">{t(cur.label)}</span>
      <Ico name="chevronDown" size={10} />
      {open && (
        <div className="ac-menu ac-lists-menu" onClick={(e) => e.stopPropagation()}>
          {items.map((i) => (
            <button key={i.key} className={`ac-menu__item ${i.key === entity ? 'on' : ''}`} onClick={() => { setOpen(false); onPick(i.key) }}>{t(i.label)}</button>
          ))}
        </div>
      )}
    </span>
  )
}

export default function ListsPage({ entity: entityProp = 'all' }) {
  const [entity, setEntity] = useState(entityProp)
  useEffect(() => setEntity(entityProp), [entityProp])
  const navigate = useNavigate()
  const { user } = useAuth()
  const t = useT()
  const plural = usePlural()
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState(EMPTY)
  const [sort, setSort] = useState({ key: 'name', dir: 1 })
  const [sel, setSel] = useState(() => new Set())
  const [shown, setShown] = useState(PAGE)
  const sentinel = useRef(null)

  useEffect(() => { const id = setTimeout(() => setQ(search.trim()), 250); return () => clearTimeout(id) }, [search])

  const { data, error, reload } = useApi(async () => {
    const [c, co, mem] = await Promise.all([
      entity === 'companies' ? { contacts: [] } : crmService.listContacts(q),
      entity === 'contacts' ? { companies: [] } : crmService.listCompanies(q),
      crmService.listMembers(),
    ])
    return { contacts: c.contacts || [], companies: co.companies || [], members: mem.members || [] }
  }, [entity, q], `ac-lists-${entity}-${q}`)

  const members = data?.members || []
  const memberName = (id) => members.find((m) => m.id === id)?.name || ''

  const rows = useMemo(() => {
    if (!data) return []
    const companyById = Object.fromEntries(data.companies.map((c) => [c.id, c.name]))
    let list = [
      ...data.contacts.map((c) => ({ ...c, kind: 'contact', companyName: companyById[c.companyId] || '' })),
      ...data.companies.map((c) => ({ ...c, kind: 'company', companyName: '' })),
    ].map((r) => ({ ...r, key: `${r.kind}:${r.id}`, assigneeId: assigneeOf(r), assignee: memberName(assigneeOf(r)) }))
    const has = (v, s) => (v || '').toLowerCase().includes(s.toLowerCase())
    list = list.filter((r) => {
      if (filter.preset === 'mine' && user && r.assigneeId !== user.id) return false
      if (filter.name && !has(r.name, filter.name)) return false
      if (filter.phone) {
        const fd = digits(filter.phone)
        const all = [r.phone, ...(r.custom?.phones || [])]
        if (!all.some((p) => (fd ? digits(p).includes(fd) : has(p, filter.phone)))) return false
      }
      if (filter.email && !has(r.email, filter.email)) return false
      if (filter.assigneeId && r.assigneeId !== filter.assigneeId) return false
      if (!inPeriod(r.createdAt, filter.period)) return false
      return true
    })
    const k = sort.key
    list.sort((a, b) => {
      const av = k === 'createdAt' ? a.createdAt || '' : (a[k] || '').toLowerCase()
      const bv = k === 'createdAt' ? b.createdAt || '' : (b[k] || '').toLowerCase()
      return av < bv ? -sort.dir : av > bv ? sort.dir : 0
    })
    return list
  }, [data, filter, sort, user]) // eslint-disable-line

  useEffect(() => { setShown(PAGE); setSel(new Set()) }, [entity, q, filter, sort])

  // Cheksiz scroll: sahifa oxiriga yetganda keyingi bo'lakni ko'rsatish
  useEffect(() => {
    const el = sentinel.current
    if (!el || shown >= rows.length) return
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) setShown((n) => n + PAGE) }, { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [shown, rows.length])

  const visible = rows.slice(0, shown)
  const allOn = visible.length > 0 && visible.every((r) => sel.has(r.key))
  const toggleAll = () => setSel(allOn ? new Set() : new Set(visible.map((r) => r.key)))
  const toggle = (key) => setSel((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  const sortBy = (key) => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: 1 }))

  const open = (r) => navigate(r.kind === 'contact' ? `/contacts/detail/${r.id}` : `/companies/detail/${r.id}`)
  const removeSelected = async () => {
    if (!window.confirm(t('Tanlanganlarni o\'chirishni tasdiqlaysizmi?'))) return
    const chosen = rows.filter((r) => sel.has(r.key))
    let failed = 0
    await Promise.all(chosen.map((r) => (r.kind === 'contact' ? crmService.deleteContact(r.id) : crmService.deleteCompany(r.id)).catch(() => { failed++ })))
    setSel(new Set())
    if (failed) window.alert(`${t("O'chirib bo'lmadi")}: ${failed}`)
    reload()
  }
  const exportCsv = () => {
    const chosen = sel.size ? rows.filter((r) => sel.has(r.key)) : rows
    // CSV-injection (=,+,-,@) dan himoya + qo'sh tirnoq ekranlash
    const esc = (v) => { let x = String(v ?? ''); if (/^[=+\-@\t\r]/.test(x) && !/^\+?[\d\s()-]+$/.test(x)) x = `'${x}`; return `"${x.replace(/"/g, '""')}"` }
    const head = [t('Nomi'), t('Kompaniya'), t('Telefon'), t("Mas'ul"), t('Email')]
    const csv = [head, ...chosen.map((r) => [r.name, r.companyName, r.phone, r.assignee, r.email])].map((l) => l.map(esc).join(',')).join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = 'contacts.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const cols = [['name', 'Nomi'], ['companyName', 'Kompaniya'], ['phone', 'Telefon'], ['assignee', "Mas'ul"], ['email', 'Email']]

  return (
    <div className="ac-lists">
      <TopBar
        title={<PresetTitle entity={entity} onPick={(k) => { if (k === 'companies') navigate('/companies/list'); else if (entityProp === 'companies') navigate('/contacts/list'); setEntity(k) }} />}
        search={search}
        onSearch={setSearch}
        filterPanel={(close) => <ListFilter value={filter} members={members} onApply={(f) => { setFilter(f); close() }} />}
        count={plural(rows.length, 'element')}
        menu={[
          { label: t('Eksport'), icon: 'excel', onClick: exportCsv },
        ]}
        actions={
          <button className="ac-btn ac-btn--blue" onClick={() => navigate(entity === 'companies' ? '/companies/add' : '/contacts/add')}>
            <span className="ac-btn__plus">+</span>{t(entity === 'companies' ? "Kompaniya qo'shish" : "Kontakt qo'shish")}
          </button>
        }
      />
      <div className="ac-lists-wrap">
        <table className="ac-table ac-lists-table">
          <thead>
            <tr>
              <th className="chk"><input type="checkbox" className="ac-check" checked={allOn} onChange={toggleAll} /></th>
              {cols.map(([k, label]) => (
                <th key={k} className="sortable" onClick={() => sortBy(k)}>{t(label)}{sort.key === k && <span className="arr">{sort.dir > 0 ? '▲' : '▼'}</span>}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.key} className={sel.has(r.key) ? 'selected' : ''}>
                <td className="chk"><input type="checkbox" className="ac-check" checked={sel.has(r.key)} onChange={() => toggle(r.key)} /></td>
                <td className="name">
                  {r.kind === 'company' ? <Ico name="company" size={14} className="ico" /> : <span className="dot" />}
                  <a onClick={() => open(r)}>{r.name}</a>
                </td>
                <td>{r.companyName && <span className="u">{r.companyName}</span>}</td>
                <td>{r.phone && <span className="u">{r.phone}</span>}</td>
                <td>{r.assignee}</td>
                <td>{r.email}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data && !error && <div className="ac-lists-empty"><span className="ac-spinner" /></div>}
        {!data && error && <div className="ac-lists-empty">{error?.message || t('Xatolik yuz berdi')}</div>}
        {data && rows.length === 0 && <div className="ac-lists-empty">{t("Ma'lumot topilmadi")}</div>}
        {shown < rows.length && <div ref={sentinel} className="ac-lists-more"><span className="ac-spinner" /></div>}
      </div>
      {sel.size > 0 && (
        <div className="ac-bulk">
          <span className="ac-lists-bulk-count">{t('Tanlangan: ')}{sel.size}</span>
          <button onClick={exportCsv}>{t('Eksport')}</button>
          <button className="danger" onClick={removeSelected}>{t("O'chirish")}</button>
        </div>
      )}
    </div>
  )
}
