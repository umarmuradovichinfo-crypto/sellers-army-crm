// amoCRM "Списки" — kontaktlar va kompaniyalar jadvali (/contacts/list, /companies/list).
// Kartochkalar bu yerda emas: nom bosilganda detail sahifaga o'tiladi.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { crmService } from '../../services/crm.service'
import { useApi } from '../../lib/useApi'
import TopBar, { useOutside } from '../TopBar'
import { Ico } from '../AmoIcons'
import { useT, usePlural } from '../i18n'
import '../i18n/lists.ru'
import '../leads.css'
import '../lists.css'

const PAGE = 50
const EMPTY = { preset: 'all', name: '', phone: '', email: '', assigneeId: '', period: '' }
const SORT_KEY = { name: 'name', companyName: 'companyName', phone: 'phone', assignee: 'assignee', email: 'email' }

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
  const t = useT()
  const plural = usePlural()
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState(EMPTY)
  const [sort, setSort] = useState({ key: 'name', dir: 1 })
  const [list, setList] = useState({ rows: [], next: null, total: 0, loading: true, error: '' })
  // Tanlash: sel — qo'lda belgilanganlar (kind:id); allMode — filtrga mos HAMMA yozuvlar (barcha sahifalar), excluded — undan olib tashlanganlar
  const [sel, setSel] = useState(() => new Set())
  const [allMode, setAllMode] = useState(false)
  const [excluded, setExcluded] = useState(() => new Set())
  const sentinel = useRef(null)
  const seq = useRef(0)

  useEffect(() => { const id = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(id) }, [search])

  const { data: meta } = useApi(async () => ({ members: (await crmService.listMembers()).members || [] }), [], 'ac-lists-members')
  const members = meta?.members || []
  const memberName = (id) => members.find((m) => m.id === id)?.name || ''

  // Server parametrlari (limit/cursor/sort'siz) — ro'yxat, eksport va ommaviy o'chirish uchun bir xil
  const filterParams = useMemo(() => ({
    kind: entity, search: q, preset: filter.preset === 'mine' ? 'mine' : '', name: filter.name, phone: filter.phone, email: filter.email,
    assigneeId: filter.assigneeId, period: filter.period,
  }), [entity, q, filter])
  const paramsKey = JSON.stringify([filterParams, sort])

  const decorate = (r) => ({ ...r, key: `${r.kind}:${r.id}`, assignee: memberName(r.assigneeId) })
  const fetchPage = async (cursor, reset) => {
    const my = ++seq.current
    setList((l) => ({ ...l, loading: true, ...(reset ? { error: '' } : {}) }))
    try {
      const r = await crmService.listEntities({ ...filterParams, sort: SORT_KEY[sort.key] || 'name', dir: sort.dir > 0 ? 'asc' : 'desc', limit: PAGE, cursor })
      if (my !== seq.current) return
      setList((l) => {
        const base = reset ? [] : l.rows
        const have = new Set(base.map((x) => x.key))
        const fresh = (r.items || []).map(decorate).filter((x) => !have.has(x.key))
        return { rows: [...base, ...fresh], next: r.nextCursor || null, total: r.total || 0, loading: false, error: '' }
      })
    } catch (e) {
      if (my === seq.current) setList((l) => ({ ...l, loading: false, error: e?.message || t('Xatolik yuz berdi') }))
    }
  }
  const reload = () => fetchPage(undefined, true)
  const clearSel = () => { setSel(new Set()); setAllMode(false); setExcluded(new Set()) }

  useEffect(() => { clearSel(); fetchPage(undefined, true) }, [paramsKey]) // eslint-disable-line

  // Mas'ul nomlari a'zolar yuklangach to'ldiriladi
  const rows = useMemo(() => list.rows.map((r) => ({ ...r, assignee: memberName(r.assigneeId) })), [list.rows, members]) // eslint-disable-line

  // Cheksiz scroll: sahifa oxiriga yetganda keyingi sahifani so'raymiz
  useEffect(() => {
    const el = sentinel.current
    if (!el || !list.next || list.loading) return
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) fetchPage(list.next, false) }, { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [list.next, list.loading, list.rows.length]) // eslint-disable-line

  const isOn = (key) => (allMode ? !excluded.has(key) : sel.has(key))
  const selCount = allMode ? Math.max(0, list.total - excluded.size) : sel.size
  const allOn = rows.length > 0 && rows.every((r) => isOn(r.key))
  const toggleAll = () => { if (allMode || allOn) clearSel(); else setSel(new Set(rows.map((r) => r.key))) }
  const toggle = (key) => {
    if (allMode) setExcluded((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
    else setSel((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  const sortBy = (key) => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: 1 }))

  const open = (r) => navigate(r.kind === 'contact' ? `/contacts/detail/${r.id}` : `/companies/detail/${r.id}`)
  const removeSelected = async () => {
    if (!window.confirm(t('Tanlanganlarni o\'chirishni tasdiqlaysizmi?') + (allMode ? ` (${selCount})` : ''))) return
    try {
      if (allMode) await crmService.bulkDeleteEntities({ all: true, filter: filterParams, excludeIds: [...excluded] })
      else await crmService.bulkDeleteEntities({ items: rows.filter((r) => sel.has(r.key)).map((r) => ({ kind: r.kind, id: r.id })) })
    } catch (e) { window.alert(`${t("O'chirib bo'lmadi")}: ${e?.message || ''}`) }
    clearSel()
    reload()
  }
  const exportCsv = async () => {
    // Belgilangan bo'lsa — shular; "hammasi" yoki hech narsa belgilanmagan bo'lsa — filtrga mos barcha yozuvlar (sahifa-sahifa yuklanadi)
    let chosen
    if (!allMode && sel.size) chosen = rows.filter((r) => sel.has(r.key))
    else {
      chosen = []
      let cursor
      do {
        const r = await crmService.listEntities({ ...filterParams, sort: SORT_KEY[sort.key] || 'name', dir: sort.dir > 0 ? 'asc' : 'desc', limit: 200, cursor }).catch(() => ({ items: [] }))
        chosen.push(...(r.items || []).map(decorate).map((x) => ({ ...x, assignee: memberName(x.assigneeId) })))
        cursor = r.nextCursor
      } while (cursor && chosen.length < 100000)
      if (allMode) chosen = chosen.filter((r) => !excluded.has(r.key))
    }
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
        count={plural(list.total, 'element')}
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
              <th className="ac-chk"><input type="checkbox" className="ac-check" checked={allOn} onChange={toggleAll} /></th>
              {cols.map(([k, label]) => (
                <th key={k} className="sortable" onClick={() => sortBy(k)}>{t(label)}{sort.key === k && <span className="arr">{sort.dir > 0 ? '▲' : '▼'}</span>}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={isOn(r.key) ? 'selected' : ''}>
                <td className="ac-chk"><input type="checkbox" className="ac-check" checked={isOn(r.key)} onChange={() => toggle(r.key)} /></td>
                <td className="name">
                  {r.kind === 'company' ? <Ico name="company" size={14} className="ico" /> : <span className="ac-dot" />}
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
        {rows.length === 0 && list.loading && <div className="ac-lists-empty"><span className="ac-spinner" /></div>}
        {rows.length === 0 && !list.loading && list.error && <div className="ac-lists-empty">{list.error}</div>}
        {rows.length === 0 && !list.loading && !list.error && <div className="ac-lists-empty">{t("Ma'lumot topilmadi")}</div>}
        {(list.next || (list.loading && rows.length > 0)) && <div ref={sentinel} className="ac-lists-more"><span className="ac-spinner" /></div>}
      </div>
      {selCount > 0 && (
        <div className="ac-bulk">
          <span className="ac-lists-bulk-count">{t('Tanlangan: ')}{selCount}</span>
          {!allMode && list.total > sel.size && sel.size >= rows.length && <button onClick={() => { setAllMode(true); setExcluded(new Set()) }}>{t('Barchasini belgilash')} ({list.total})</button>}
          <button onClick={exportCsv}>{t('Eksport')}</button>
          <button className="danger" onClick={removeSelected}>{t("O'chirish")}</button>
        </div>
      )}
    </div>
  )
}
