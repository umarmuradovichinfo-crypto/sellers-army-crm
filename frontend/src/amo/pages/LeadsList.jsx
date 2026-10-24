// amoCRM "Все сделки" — bitimlar ro'yxati (/leads/list): jadval, saralash, belgilash va ommaviy amallar.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { crmService } from '../../services/crm.service'
import { useAuth } from '../../context/AuthContext'
import { useApi } from '../../lib/useApi'
import TopBar from '../TopBar'
import { Ico } from '../AmoIcons'
import { money, dmy } from '../format'
import LeadsFilter, { applyLeadFilter, EMPTY_FILTER } from '../LeadsFilter'
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
})

export default function LeadsList() {
  const navigate = useNavigate()
  const t = useT()
  const plural = usePlural()
  const { user } = useAuth()
  const { data, reload } = useApi(async () => {
    const [l, tags, mem, pipe] = await Promise.all([crmService.listLeads({}), crmService.listTags(), crmService.listMembers(), crmService.getPipeline()])
    return { leads: (l.leads || []).filter((x) => !x.unsorted), tags: tags.tags || [], members: mem.members || [], stages: pipe.stages || [] }
  }, [], 'amo-leads-list', 60000)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState(EMPTY_FILTER)
  const [sort, setSort] = useState({ key: 'createdAt', dir: -1 })
  const [sel, setSel] = useState(new Set())
  const [bulkMode, setBulkMode] = useState(null)
  const [limit, setLimit] = useState(50)
  const sentinel = useRef(null)

  const rows = useMemo(() => {
    const f = { ...filter, search, preset: filter.preset === 'open' ? '' : filter.preset }
    const list = applyLeadFilter(data?.leads || [], f, user).filter((l) => filter.preset !== 'open' || (!l.won && !l.lost))
    const val = (l) => (sort.key === 'n' ? l.n : sort.key === 'contact' ? l.contactName || '' : sort.key === 'assignee' ? l.assigneeName || '' : sort.key === 'value' ? l.value || 0 : sort.key === 'stage' ? l.stageName || '' : l.createdAt)
    return [...list].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir)
  }, [data, filter, search, sort, user])

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) setLimit((n) => n + 50) })
    io.observe(el)
    return () => io.disconnect()
  }, [rows.length, limit])

  const total = rows.reduce((a, l) => a + (l.value || 0), 0)
  const allOn = rows.length > 0 && rows.every((r) => sel.has(r.id))
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const th = (key, label, style) => (
    <th style={style} onClick={() => key && setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))}>
      {t(label)}{sort.key === key ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}
    </th>
  )
  const runBulk = async (action, value) => {
    const ids = rows.filter((r) => sel.has(r.id)).map((r) => r.id)
    if (!ids.length) return
    try { await crmService.bulk(ids, action, value) } catch (e) { window.alert(e?.message || t('Xatolik yuz berdi')); return }
    setSel(new Set()); setBulkMode(null); reload()
  }

  return (
    <div>
      <TopBar
        title={t('Barcha bitimlar')}
        switcher={<ViewSwitch mode="list" />}
        search={search}
        onSearch={setSearch}
        filterPanel={(close) => <LeadsFilter value={filter} tags={data?.tags || []} members={data?.members || []} onApply={(f) => { setFilter(f); close() }} />}
        count={<>{plural(rows.length, 'bitim')}:<b>{money(total)}</b></>}
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
              <th className="ac-chk"><input type="checkbox" className="ac-check" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
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
            {rows.length === 0 && <tr><td colSpan={8} style={{ color: '#f37575' }}>{t('Bitimlar topilmadi')}</td></tr>}
            {rows.slice(0, limit).map((l) => (
              <tr key={l.id} className={sel.has(l.id) ? 'selected' : ''}>
                <td className="ac-chk"><input type="checkbox" className="ac-check" checked={sel.has(l.id)} onChange={() => toggle(l.id)} /></td>
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
        {limit < rows.length && <div ref={sentinel} style={{ height: 40 }} />}
      </div>

      {sel.size > 0 && (
        <div className="ac-bulk">
          <b>{t('Belgilandi')}: {sel.size}</b>
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
          <button className="danger" onClick={() => window.confirm(t("Tanlangan bitimlar o'chirilsinmi?")) && runBulk('delete')}><Ico name="trash" /> {t("O'chirish")}</button>
          <span style={{ flex: 1 }} />
          <button onClick={() => { setSel(new Set()); setBulkMode(null) }}>{t('Bekor qilish')}</button>
        </div>
      )}
    </div>
  )
}
