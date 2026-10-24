// amoCRM "Все сделки" — bitimlar ro'yxati (/leads/list): jadval, saralash, belgilash va ommaviy amallar.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { crmService } from '../../services/crm.service'
import { useApi } from '../../lib/useApi'
import TopBar from '../TopBar'
import { Ico } from '../AmoIcons'
import { money, dmy } from '../format'
import LeadsFilter, { EMPTY_FILTER } from '../LeadsFilter'
import { useT, usePlural, addRu } from '../i18n'
import { ViewSwitch } from './LeadsPipeline'
import '../leads.css'

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
const SORT_KEY = { n: 'name', contact: 'contact', assignee: 'assignee', value: 'value', stage: 'stage', createdAt: 'createdAt' }

export default function LeadsList() {
  const navigate = useNavigate()
  const t = useT()
  const plural = usePlural()
  // Bosqichlar / teglar / mas'ullar — bir marta (bitimlarning o'zi server sahifalash bilan yuklanadi)
  const { data } = useApi(async () => {
    const [tags, mem, pipe] = await Promise.all([crmService.listTags(), crmService.listMembers(), crmService.getPipeline(undefined, { limit: 0 })])
    return { tags: tags.tags || [], members: mem.members || [], stages: pipe.stages || [] }
  }, [], 'amo-leads-list-meta', 60000)
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState(EMPTY_FILTER)
  const [sort, setSort] = useState({ key: 'createdAt', dir: -1 })
  const [bulkMode, setBulkMode] = useState(null)
  const [list, setList] = useState({ rows: [], next: null, total: 0, totalSum: 0, loading: true, error: '' })
  // Tanlash: sel — qo'lda belgilanganlar; allMode — filtrga mos HAMMA bitimlar (barcha sahifalar), excluded — undan olib tashlanganlar
  const [sel, setSel] = useState(new Set())
  const [allMode, setAllMode] = useState(false)
  const [excluded, setExcluded] = useState(new Set())
  const sentinel = useRef(null)
  const seq = useRef(0)

  useEffect(() => { const id = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(id) }, [search])

  // Filtr parametrlari (limit/cursor/sort'siz) — ro'yxat va ommaviy amallar uchun bir xil
  const filterParams = useMemo(() => ({
    unsorted: '0', search: q, preset: filter.preset, name: filter.name, period: filter.period, assigneeId: filter.assigneeId,
    budgetFrom: filter.budgetFrom, budgetTo: filter.budgetTo, task: filter.task, tags: filter.tags?.length ? filter.tags.join(',') : '',
  }), [q, filter])
  const paramsKey = JSON.stringify([filterParams, sort])

  const fetchPage = async (cursor, reset) => {
    const my = ++seq.current
    if (reset) setList((l) => ({ ...l, loading: true, error: '' }))
    else setList((l) => ({ ...l, loading: true }))
    try {
      const r = await crmService.listLeads({ ...filterParams, sort: SORT_KEY[sort.key] || 'createdAt', dir: sort.dir > 0 ? 'asc' : 'desc', limit: PAGE, cursor })
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
  const clearSel = () => { setSel(new Set()); setAllMode(false); setExcluded(new Set()); setBulkMode(null) }
  const th = (key, label, style) => (
    <th style={style} onClick={() => key && setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))}>
      {t(label)}{sort.key === key ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}
    </th>
  )
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
      <TopBar
        title={t('Barcha bitimlar')}
        switcher={<ViewSwitch mode="list" />}
        search={search}
        onSearch={setSearch}
        filterPanel={(close) => <LeadsFilter value={filter} tags={data?.tags || []} members={data?.members || []} onApply={(f) => { setFilter(f); close() }} />}
        count={<>{plural(list.total, 'bitim')}:<b>{money(list.totalSum)}</b></>}
        menu={[
          { label: t('Import'), icon: 'download', onClick: () => navigate('/leads/import') },
          { label: t('Eksport'), icon: 'excel', onClick: () => window.open('/api/v1' + crmService.exportUrl(), '_blank') },
        ]}
        actions={<>
          <button className="ac-btn" onClick={() => navigate('/settings/pipeline/leads/main')}>{t('Voronkani sozlash')}</button>
          <button className="ac-btn ac-btn--blue" onClick={() => navigate('/leads/add')}><span className="ac-btn__plus">+</span>{t('Yangi bitim')}</button>
        </>}
      />
      <div className="ac-table-wrap">
        <table className="ac-table">
          <thead>
            <tr>
              <th className="ac-chk"><input type="checkbox" className="ac-check" checked={allOn} onChange={toggleAll} /></th>
              {th('n', 'Bitim nomi', { width: '34%' })}
              {th('contact', 'Asosiy kontakt')}
              {th(null, 'Telefon (kontakt)')}
              {th('stage', 'Bosqich')}
              {th('value', 'Byudjet')}
              {th('assignee', "Mas'ul")}
              {th('createdAt', 'Yaratilgan')}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !list.loading && <tr><td colSpan={8} style={{ color: '#f37575' }}>{list.error || t('Bitimlar topilmadi')}</td></tr>}
            {rows.map((l) => (
              <tr key={l.id} className={isOn(l.id) ? 'selected' : ''}>
                <td className="ac-chk"><input type="checkbox" className="ac-check" checked={isOn(l.id)} onChange={() => toggle(l.id)} /></td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="ac-dot" style={{ background: l.stageColor || '#c1c1c1' }} />
                    <a onClick={() => navigate(`/leads/detail/${l.id}`)} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.n}</a>
                    {(l.tags || []).slice(0, 3).map((tg) => <span key={tg} className="ac-tag ac-tag--sm">{tg}</span>)}
                  </div>
                </td>
                <td>{l.contactName ? <span className="u" style={{ cursor: 'pointer' }} onClick={() => navigate(`/contacts/detail/${l.contactId}`)}>{l.contactName}</span> : ''}</td>
                <td>{(l.contactPhone || l.phone) ? <a className="u" href={`tel:${l.contactPhone || l.phone}`}>{l.contactPhone || l.phone}</a> : ''}</td>
                <td>{l.stageName}</td>
                <td>{l.value ? money(l.value) : ''}</td>
                <td>{l.assigneeName || ''}</td>
                <td>{dmy(l.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(list.next || list.loading) && <div ref={sentinel} style={{ height: 40, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>{list.loading && <span className="ac-spinner" />}</div>}
      </div>

      {selCount > 0 && (
        <div className="ac-bulk">
          <b>{t('Belgilandi')}: {selCount}</b>
          {!allMode && list.total > sel.size && sel.size >= rows.length && <button onClick={() => { setAllMode(true); setExcluded(new Set()) }}>{t('Barchasini belgilash')} ({list.total})</button>}
          {bulkMode === 'stage' ? (
            <select className="ac-select" style={{ width: 220 }} autoFocus onChange={(e) => e.target.value && runBulk('stage', e.target.value)} defaultValue="">
              <option value="">{t("Bosqichni o'zgartirish")}</option>
              {(data?.stages || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : <button onClick={() => setBulkMode('stage')}>{t("Bosqichni o'zgartirish")}</button>}
          {bulkMode === 'assignee' ? (
            <select className="ac-select" style={{ width: 220 }} autoFocus onChange={(e) => e.target.value && runBulk('assignee', e.target.value)} defaultValue="">
              <option value="">{t("Mas'ulni o'zgartirish")}</option>
              {(data?.members || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          ) : <button onClick={() => setBulkMode('assignee')}>{t("Mas'ulni o'zgartirish")}</button>}
          {bulkMode === 'tag' ? (
            <input className="ac-input" style={{ width: 180 }} autoFocus placeholder={t("Teg qo'shish")} onKeyDown={(e) => e.key === 'Enter' && e.target.value.trim() && runBulk('add_tag', e.target.value.trim())} />
          ) : <button onClick={() => setBulkMode('tag')}>{t("Teg qo'shish")}</button>}
          <button className="danger" onClick={() => window.confirm(t("Tanlangan bitimlar o'chirilsinmi?") + (allMode ? ` (${selCount})` : '')) && runBulk('delete')}><Ico name="trash" /> {t("O'chirish")}</button>
          <span style={{ flex: 1 }} />
          <button onClick={clearSel}>{t('Bekor qilish')}</button>
        </div>
      )}
    </div>
  )
}
