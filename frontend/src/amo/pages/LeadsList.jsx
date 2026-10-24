// amoCRM "Все сделки" — bitimlar ro'yxati (/leads/list): jadval, saralash, belgilash va ommaviy amallar.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { crmService } from '../../services/crm.service'
import { useApi } from '../../lib/useApi'
import TopBar from '../TopBar'
import { Ico } from '../AmoIcons'
import { money, dmy, phoneFmt } from '../format'
import LeadsFilter from '../LeadsFilter'
import FieldsModal from '../FieldsModal'
import BulkBar from '../BulkBar'
import { useLeadsQuery, useFilterMeta, filterChips, sortMenuItem, downloadLeadsCsv, useLayout, LIST_COLUMNS, LIST_DEFAULT, withCustomFields } from '../filterState'
import { useT, usePlural, addRu } from '../i18n'
import { ViewSwitch } from './LeadsPipeline'
import { useTagColors, tagStyle } from '../tagColors'
import '../i18n/leadsfilter.ru.js'
import '../leads.css'
import { ImportModal } from './ImportPage'
import DuplicatesModal from '../DuplicatesModal'

addRu({
  'Barcha bitimlar': 'Все сделки',
  'Bitim nomi': 'Название сделки',
  'Asosiy kontakt': 'Основной контакт',
  'Telefon (kontakt)': 'Телефон (контакт)',
  "Mas'ul": 'Ответственный',
  'Bosqich': 'Этап',
  'Yaratilgan': 'Дата создания',
  "Bosqichni o'zgartirish": 'Изменить этап',
  "Mas'ulni o'zgartirish": 'Изменить ответственного',
  "Teg qo'shish": 'Добавить теги',
  'Belgilandi': 'Выбрано',
  'Bekor qilish': 'Отмена',
  "Tanlangan bitimlar o'chirilsinmi?": 'Удалить выбранные сделки?',
  "Bitimlar topilmadi": 'Сделки не найдены',
  'Barchasini belgilash': 'Выбрать все',
})

const PAGE = 50

const COL_FILTER = { name: 'name', contact: 'contactName', phone: 'contactPhone', email: 'contactEmail', company: 'companyName' }

function ColMenu({ c, rect, sort, filterKey, filter, onApply, onClose }) {
  const t = useT()
  const ref = useRef(null)
  const cur = filterKey ? (filterKey.startsWith('cf:') ? filter.cf?.[filterKey.slice(3)] || '' : filter[filterKey] || '') : ''
  const [dir, setDir] = useState(sort.key === c.sort ? sort.dir : '')
  const [val, setVal] = useState(cur)
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const k = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [onClose])
  const apply = () => {
    let f = null
    if (filterKey && val.trim() !== cur) {
      f = filterKey.startsWith('cf:') ? { ...filter, preset: '', cf: { ...filter.cf, [filterKey.slice(3)]: val.trim() } } : { ...filter, preset: '', [filterKey]: val.trim() }
    }
    onApply({ filter: f, sort: dir && c.sort ? { key: c.sort, dir } : null })
  }
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 860))
  return createPortal(
    <div ref={ref} className="ac-colmenu" style={{ top: rect.bottom, left, minWidth: Math.max(rect.width, 300) }}>
      {c.sort && (
        <>
          <div className="ac-colmenu__cap">{t('Saralash')}</div>
          {[['asc', "O'sish bo'yicha"], ['desc', "Kamayish bo'yicha"]].map(([k, l]) => (
            <div key={k} className={`ac-colmenu__opt ${dir === k ? 'on' : ''}`} onClick={() => setDir(k)}>{t(l)}</div>
          ))}
        </>
      )}
      {filterKey && (
        <>
          <div className="ac-colmenu__cap ac-colmenu__cap--sep">{t('Filtr')}</div>
          <input className="ac-input" autoFocus value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} />
        </>
      )}
      <div className="ac-colmenu__foot">
        <button className="ac-btn" onClick={apply}>{t("Qo'llash")}</button>
        <button className="ac-btn ac-btn--plain" onClick={onClose}>{t('Bekor qilish')}</button>
      </div>
    </div>,
    document.body,
  )
}

export default function LeadsList() {
  const navigate = useNavigate()
  const [importOpen, setImportOpen] = useState(false)
  const [dupOpen, setDupOpen] = useState(false)
  const t = useT()
  const plural = usePlural()
  // Bosqichlar (ommaviy "bosqichni o'zgartirish" uchun) — bir marta; filtr ma'lumotlari useFilterMeta'da
  const { data } = useApi(async () => {
    const pipe = await crmService.getPipeline(undefined, { limit: 0 })
    return { stages: pipe.stages || [] }
  }, [], 'amo-leads-list-meta', 60000)
  const meta = useFilterMeta()
  const Q = useLeadsQuery({ defaultSort: { key: 'createdAt', dir: 'desc' } })
  const { filter, search, setSearch, sort } = Q
  const cols = useLayout('list', LIST_DEFAULT)
  const [colsModal, setColsModal] = useState(false)
  const [list, setList] = useState({ rows: [], next: null, total: 0, totalSum: 0, loading: true, error: '' })
  // Tanlash: sel — qo'lda belgilanganlar; allMode — filtrga mos HAMMA bitimlar (barcha sahifalar), excluded — undan olib tashlanganlar
  const [sel, setSel] = useState(new Set())
  const [allMode, setAllMode] = useState(false)
  const [excluded, setExcluded] = useState(new Set())
  const sentinel = useRef(null)
  const seq = useRef(0)

  // Filtr parametrlari (limit/cursor/sort'siz) — ro'yxat va ommaviy amallar uchun bir xil (URL query'dagi holat)
  // amoCRM "Все сделки": saralanmaganlar ham ro'yxatda (kulrang nom, manba belgisi bilan)
  const filterParams = useMemo(() => ({ ...Q.params }), [Q.params])
  const paramsKey = JSON.stringify([filterParams, sort])

  const fetchPage = async (cursor, reset) => {
    const my = ++seq.current
    if (reset) setList((l) => ({ ...l, loading: true, error: '' }))
    else setList((l) => ({ ...l, loading: true }))
    try {
      const r = await crmService.listLeads({ ...filterParams, sort: sort.key || 'createdAt', dir: sort.dir, limit: PAGE, cursor })
      if (my !== seq.current) return
      setList((l) => {
        const base = reset ? [] : l.rows
        const have = new Set(base.map((x) => x.id))
        return { rows: [...base, ...(r.leads || []).filter((x) => !have.has(x.id))], next: r.nextCursor || null, total: r.total || 0, totalSum: r.totalSum || 0, loading: false, error: '' }
      })
    } catch (e) {
      if (my === seq.current) setList((l) => ({ ...l, loading: false, error: e?.message || t('Xatolik yuz berdi') }))
    }
  }
  const reload = () => fetchPage(undefined, true)

  // Filtr/qidiruv/saralash o'zgarsa — boshidan yuklash va tanlovni tozalash
  useEffect(() => { setSel(new Set()); setAllMode(false); setExcluded(new Set()); fetchPage(undefined, true) }, [paramsKey]) // eslint-disable-line

  // Cheksiz scroll: sahifa oxiriga yetganda keyingi sahifani so'raymiz
  useEffect(() => {
    const el = sentinel.current
    if (!el || !list.next || list.loading) return
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) fetchPage(list.next, false) }, { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [list.next, list.loading, list.rows.length]) // eslint-disable-line

  const rows = list.rows
  const isOn = (id) => (allMode ? !excluded.has(id) : sel.has(id))
  const selCount = allMode ? Math.max(0, list.total - excluded.size) : sel.size
  const allOn = rows.length > 0 && rows.every((r) => isOn(r.id))
  const toggle = (id) => {
    if (allMode) setExcluded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
    else setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  const toggleAll = () => {
    if (allMode || allOn) { setAllMode(false); setExcluded(new Set()); setSel(new Set()) } else setSel(new Set(rows.map((r) => r.id)))
  }
  const clearSel = () => { setSel(new Set()); setAllMode(false); setExcluded(new Set()) }
  // amoCRM: ustun sarlavhasi bosilsa "Сортировка / Фильтр" oynachasi
  const [colMenu, setColMenu] = useState(null) // { c, rect }
  const colFilterKey = (c) => {
    if (COL_FILTER[c.key]) return COL_FILTER[c.key]
    const f = c.key.startsWith('cf:') && meta.fields.find((x) => `cf:${x.key}` === c.key)
    return f && !['select', 'multiselect', 'number', 'date', 'checkbox'].includes(f.type) ? c.key : null
  }
  const th = (c, style) => (
    <th key={c.key} style={style} className={colMenu?.c.key === c.key ? 'on' : ''} onClick={(e) => (c.sort || colFilterKey(c)) && setColMenu({ c, rect: e.currentTarget.getBoundingClientRect() })}>
      {t(c.label)}{sort.key === c.sort ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )
  const tagColors = useTagColors()
  const catalog = useMemo(() => withCustomFields(LIST_COLUMNS, meta.fields), [meta.fields])
  const shownCols = cols.fields.map((k) => catalog.find((c) => c.key === k)).filter(Boolean)
  const cell = (c, l) => {
    switch (c.key) {
      case 'name': return (
        <td key={c.key}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!l.unsorted && <span className="ac-dot" style={{ background: l.stageColor || '#c1c1c1' }} />}
            <a className={l.unsorted ? 'ac-list__unsorted' : ''} onClick={() => navigate(`/leads/detail/${l.id}`)} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.n}</a>
            {l.unsorted && <span className="ac-list__srcbadge"><Ico name="form" size={11} /> {l.formName || l.source || t('Forma')}</span>}
            {!cols.fields.includes('tags') && (l.tags || []).slice(0, 3).map((tg) => <span key={tg} className={`ac-tag ac-tag--sm ${tagColors[tg] ? 'ac-tag--c' : ''}`} style={tagStyle(tagColors[tg])}>{tg}</span>)}
          </div>
        </td>
      )
      case 'contact': return <td key={c.key}>{l.contactName ? <span className="u" style={{ cursor: 'pointer' }} onClick={() => navigate(`/contacts/detail/${l.contactId}`)}>{l.contactName}</span> : ''}</td>
      case 'company': return <td key={c.key}>{l.companyName || ''}</td>
      case 'phone': return <td key={c.key}>{(l.contactPhone || l.phone) ? <a className="u" href={`tel:${l.contactPhone || l.phone}`}>{phoneFmt(l.contactPhone || l.phone)}</a> : ''}</td>
      case 'email': return <td key={c.key}>{l.email || l.contactEmail || ''}</td>
      case 'stage': return <td key={c.key}>{l.stageName}</td>
      case 'budget': return <td key={c.key}>{l.value ? money(l.value) : ''}</td>
      case 'assignee': return <td key={c.key}>{l.assigneeName || ''}</td>
      case 'createdAt': return <td key={c.key}>{dmy(l.createdAt)}</td>
      case 'updatedAt': return <td key={c.key}>{l.updatedAt ? dmy(l.updatedAt) : ''}</td>
      case 'closedAt': return <td key={c.key}>{l.closedAt ? dmy(l.closedAt) : ''}</td>
      case 'source': return <td key={c.key}>{l.source || ''}</td>
      case 'tags': return <td key={c.key}>{(l.tags || []).map((tg) => <span key={tg} className="ac-tag ac-tag--sm" style={{ marginRight: 4 }}>{tg}</span>)}</td>
      default: {
        const v = l.custom?.[c.key.slice(3)]
        return <td key={c.key}>{Array.isArray(v) ? v.join(', ') : v === true ? t('Ha') : v ?? ''}</td>
      }
    }
  }
  const runBulk = async (action, value) => {
    if (!selCount) return
    try {
      if (allMode) await crmService.bulk(null, action, value, { all: true, filter: filterParams, excludeIds: [...excluded] })
      else await crmService.bulk([...sel], action, value)
    } catch (e) { window.alert(e?.message || t('Xatolik yuz berdi')); return }
    clearSel(); reload()
  }

  return (
    <div>
      {importOpen && <ImportModal entity="leads" onClose={() => setImportOpen(false)} />}
      {colMenu && <ColMenu c={colMenu.c} rect={colMenu.rect} sort={sort} filter={Q.filter} filterKey={colFilterKey(colMenu.c)} onClose={() => setColMenu(null)}
        onApply={(o) => { setColMenu(null); if (o.filter || o.sort) Q.apply(o) }} />}
      {dupOpen && <DuplicatesModal onClose={() => setDupOpen(false)} onMerged={reload} />}
      <TopBar
        title={t('Barcha bitimlar')}
        switcher={<ViewSwitch mode="list" listOnly />}
        search={search}
        onSearch={setSearch}
        filterPanel={(close) => <LeadsFilter value={filter} meta={meta} onApply={(f) => { Q.applyFilter(f); close() }} />}
        chips={filterChips(filter, meta, t).map((c) => ({ id: c.id, label: c.label, onRemove: () => Q.removeChip(c.clear) }))}
        count={<>{plural(list.total, 'bitim')}:<b>{money(list.totalSum)}</b></>}
        menu={[
          { label: t('Import'), icon: 'download', onClick: () => setImportOpen(true) },
          { label: t('Eksport'), icon: 'excel', onClick: () => downloadLeadsCsv({ ...filterParams, sort: sort.key, dir: sort.dir }).catch((e) => window.alert(e?.message || t('Xatolik yuz berdi'))) },
          sortMenuItem(t, sort, Q.setSort),
          { label: t('Ustunlarni sozlash'), icon: 'list', onClick: () => setColsModal(true) },
          { label: t('Dublikatlarni qidirish'), icon: 'search', onClick: () => setDupOpen(true) },
        ]}
        actions={<>
          <button className="ac-btn" onClick={() => navigate('/settings/pipeline/leads/main')}>{t('Sozlash')}</button>
          <button className="ac-btn ac-btn--blue" onClick={() => navigate('/leads/add')}><span className="ac-btn__plus">+</span>{t('Yangi bitim')}</button>
        </>}
      />
      <div className="ac-table-wrap">
        <table className="ac-table">
          <thead>
            <tr>
              <th className="ac-chk"><input type="checkbox" className="ac-check" checked={allOn} onChange={toggleAll} /></th>
              {shownCols.map((c, i) => th(c, i === 0 ? { width: '30%' } : undefined))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !list.loading && <tr><td colSpan={shownCols.length + 1} style={{ color: '#f37575' }}>{list.error || t('Bitimlar topilmadi')}</td></tr>}
            {rows.map((l) => (
              <tr key={l.id} className={isOn(l.id) ? 'selected' : ''}>
                <td className="ac-chk"><input type="checkbox" className="ac-check" checked={isOn(l.id)} onChange={() => toggle(l.id)} /></td>
                {shownCols.map((c) => cell(c, l))}
              </tr>
            ))}
          </tbody>
        </table>
        {(list.next || list.loading) && <div ref={sentinel} style={{ height: 40, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>{list.loading && <span className="ac-spinner" />}</div>}
      </div>

      {selCount > 0 && (
        <BulkBar count={selCount} selectedCount={sel.size} total={list.total} allMode={allMode} stages={data?.stages || []} members={meta.members}
          onAll={() => { setAllMode(true); setExcluded(new Set()) }} onRun={runBulk} onClear={clearSel} />
      )}

      {colsModal && (
        <FieldsModal
          title="Ustunlarni sozlash"
          options={catalog.map((c) => ({ key: c.key, label: c.label }))}
          value={cols.fields}
          defaults={LIST_DEFAULT}
          onClose={() => setColsModal(false)}
          onSave={async (next) => { await cols.save(next.length ? next : LIST_DEFAULT); setColsModal(false) }}
        />
      )}
    </div>
  )
}
