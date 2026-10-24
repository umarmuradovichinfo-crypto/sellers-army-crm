// amoCRM "Управление тегами" (/settings/tags): qidiruv, qo'llanish soni, nom/rang, o'chirish, birlashtirish.
import React, { useMemo, useState } from 'react'
import { api } from '../../lib/apiClient'
import { useApi } from '../../lib/useApi'
import { useAuth } from '../../context/AuthContext'
import { crmService } from '../../services/crm.service'
import SectionAside from '../SectionAside'
import TopBar from '../TopBar'
import { Ico } from '../AmoIcons'
import { useT } from '../i18n'
import '../i18n/import.ru.js'
import '../import.css'

const ITEMS = [
  { to: '/settings/general', label: 'Umumiy sozlamalar' },
  { to: '/settings/users', label: 'Foydalanuvchilar' },
  { to: '/settings/chats', label: 'Chatlar va messenjerlar' },
  { to: '/settings/security', label: 'Xavfsizlik' },
  { to: '/settings/tags', label: 'Teglarni boshqarish' },
]
const COLORS = ['#3F77DD', '#4C8BF7', '#27AE60', '#F2C94C', '#F2994A', '#EB5757', '#BB6BD9', '#9B51E0', '#56CCF2', '#828282', '#98A7B9', '#E91E63']

function Confirm({ title, text, onOk, onCancel }) {
  const t = useT()
  return (
    <div className="ac-modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="ac-modal" style={{ maxWidth: 440 }}>
        <button className="ac-modal__close" onClick={onCancel}><Ico name="close" /></button>
        <h2 className="ac-modal__title">{title}</h2>
        <div>{text}</div>
        <div className="ac-modal__foot">
          <button className="ac-btn ac-btn--blue" onClick={onOk}>{t("O'chirish")}</button>
          <button className="ac-btn ac-btn--plain" onClick={onCancel}>{t('Bekor qilish')}</button>
        </div>
      </div>
    </div>
  )
}

export default function TagsPage() {
  const t = useT()
  const { can } = useAuth()
  const canEdit = !can || can('crm.settings')
  const { data, reload } = useApi(() => crmService.listTags(), [])
  const [q, setQ] = useState('')
  const [sel, setSel] = useState([])
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [colorId, setColorId] = useState(null)
  const [newName, setNewName] = useState('')
  const [confirm, setConfirm] = useState(null) // {ids}
  const [merge, setMerge] = useState(null) // {intoId}
  const [msg, setMsg] = useState('')

  const tags = data?.tags || []
  const shown = useMemo(() => tags.filter((x) => x.name.toLowerCase().includes(q.trim().toLowerCase())), [tags, q])
  const fail = (e) => setMsg(e?.data?.message || e?.message || t('Xatolik yuz berdi'))
  const run = async (fn) => { setMsg(''); try { await fn(); await reload() } catch (e) { fail(e) } }

  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const startEdit = (x) => { setEditId(x.id); setEditName(x.name); setColorId(null) }
  const saveEdit = () => {
    const x = tags.find((r) => r.id === editId)
    setEditId(null)
    if (!x || !editName.trim() || editName.trim() === x.name) return
    run(() => api.put(`/crm/tags/${x.id}`, { name: editName.trim() }))
  }
  const setColor = (x, color) => { setColorId(null); run(() => api.put(`/crm/tags/${x.id}`, { color })) }
  const doDelete = () => {
    const ids = confirm.ids
    setConfirm(null); setSel((s) => s.filter((i) => !ids.includes(i)))
    run(() => (ids.length === 1 ? api.del(`/crm/tags/${ids[0]}`) : api.post('/crm/tags/bulk-delete', { ids })))
  }
  const doMerge = () => {
    const fromIds = sel.filter((i) => i !== merge.intoId)
    const intoId = merge.intoId
    setMerge(null); setSel([])
    run(() => api.post('/crm/tags/merge', { fromIds, intoId }))
  }
  const add = () => {
    const name = newName.trim()
    if (!name) return
    setNewName('')
    run(() => crmService.upsertTag(name))
  }

  return (
    <>
      <SectionAside title="Sozlamalar" items={ITEMS} />
      <div className="ac-content">
        <TopBar title={t('Teglarni boshqarish')} search={q} onSearch={setQ} searchPlaceholder="Teglarni qidirish" count={tags.length} />
        <div className="ac-tags">
          {canEdit && (
            <div className="ac-tags-add">
              <input className="ac-input" placeholder={t('Yangi teg')} value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
              <button className="ac-btn ac-btn--blue" disabled={!newName.trim()} onClick={add}>{t("Qo'shish")}</button>
            </div>
          )}
          {msg && <div className="ac-import-err" style={{ margin: '0 0 10px' }}>{msg}</div>}
          {!data && <div className="ac-spinner" style={{ margin: 30 }} />}
          {data && shown.length === 0 && <div className="ac-tags-empty">{t('Teglar topilmadi')}</div>}
          {shown.map((x) => (
            <React.Fragment key={x.id}>
              <div className={`ac-tags-row ${sel.includes(x.id) ? 'selected' : ''}`}>
                {canEdit && <input type="checkbox" className="ac-check" checked={sel.includes(x.id)} onChange={() => toggle(x.id)} />}
                <div className="ac-tags-row__name">
                  <i className="ac-tags-row__dot" style={{ background: x.color }} title={t('Rang')} onClick={() => canEdit && setColorId(colorId === x.id ? null : x.id)} />
                  {editId === x.id ? (
                    <div className="ac-tags-row__edit">
                      <input className="ac-input" autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditId(null) }} />
                      <button className="ac-btn ac-btn--blue ac-btn--sm" onClick={saveEdit}>{t('Saqlash')}</button>
                      <button className="ac-btn ac-btn--plain ac-btn--sm" onClick={() => setEditId(null)}>{t('Bekor qilish')}</button>
                    </div>
                  ) : (
                    <span className="ac-tags-row__title" onClick={() => canEdit && startEdit(x)}>{x.name}</span>
                  )}
                </div>
                <div className="ac-tags-row__usage">{x.usage > 0 ? `${x.usage} ${t('ta bitimda')}` : t('Hech qaysi bitimda')}</div>
                {canEdit && (
                  <div className="ac-tags-row__act">
                    <button title={t("Nomini o'zgartirish")} onClick={() => startEdit(x)}><Ico name="edit" size={14} /></button>
                    <button title={t("O'chirish")} onClick={() => setConfirm({ ids: [x.id] })}><Ico name="trash" size={14} /></button>
                  </div>
                )}
              </div>
              {colorId === x.id && (
                <div className="ac-tags-colors">
                  {COLORS.map((c) => <i key={c} className={x.color.toLowerCase() === c.toLowerCase() ? 'on' : ''} style={{ background: c }} onClick={() => setColor(x, c)} />)}
                </div>
              )}
            </React.Fragment>
          ))}
        </div>

        {sel.length > 0 && (
          <div className="ac-bulk">
            <span>{t('Belgilangan: ')}{sel.length}</span>
            {sel.length >= 2 && <button onClick={() => setMerge({ intoId: sel[0] })}>{t('Birlashtirish')}</button>}
            <button className="danger" onClick={() => setConfirm({ ids: sel })}>{t("O'chirish")}</button>
            <button onClick={() => setSel([])}>{t('Bekor qilish')}</button>
          </div>
        )}

        {confirm && (
          <Confirm
            title={t(confirm.ids.length > 1 ? "Teglarni o'chirish" : "Tegni o'chirish")}
            text={t(confirm.ids.length > 1 ? "Tanlangan teglar barcha bitimlardan ham olib tashlanadi. Davom etasizmi?" : "Teg barcha bitimlardan ham olib tashlanadi. Davom etasizmi?")}
            onOk={doDelete} onCancel={() => setConfirm(null)}
          />
        )}
        {merge && (
          <div className="ac-modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && setMerge(null)}>
            <div className="ac-modal" style={{ maxWidth: 440 }}>
              <button className="ac-modal__close" onClick={() => setMerge(null)}><Ico name="close" /></button>
              <h2 className="ac-modal__title">{t('Ikki tegni birlashtirish')}</h2>
              <div className="ac-muted" style={{ marginBottom: 10 }}>{t("Tanlangan teglar shu tegga o'tkaziladi, qolganlari o'chiriladi")}</div>
              <select className="ac-select" style={{ width: '100%' }} value={merge.intoId} onChange={(e) => setMerge({ intoId: e.target.value })}>
                {sel.map((id) => <option key={id} value={id}>{tags.find((x) => x.id === id)?.name}</option>)}
              </select>
              <div className="ac-modal__foot">
                <button className="ac-btn ac-btn--blue" onClick={doMerge}>{t('Birlashtirish')}</button>
                <button className="ac-btn ac-btn--plain" onClick={() => setMerge(null)}>{t('Bekor qilish')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
