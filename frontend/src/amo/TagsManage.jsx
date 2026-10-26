// amoCRM "Управление тегами" (.modal-tags-lib-manage): bitimlar filtridagi "Teglar → Boshqarish" havolasidan ochiladi.
// Yangi teg yaratishni taqiqlash, "Topish yoki teg qo'shish", ro'yxat (teg + soni); hover'da rang va o'chirish.
import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../lib/apiClient'
import { useApi } from '../lib/useApi'
import { useAuth } from '../context/AuthContext'
import { crmService } from '../services/crm.service'
import { Ico } from './AmoIcons'
import { useT } from './i18n'
import { tagStyle } from './tagColors'
import './i18n/import.ru.js'
import './import.css'

const COLORS = ['#3F77DD', '#4C8BF7', '#27AE60', '#F2C94C', '#F2994A', '#EB5757', '#BB6BD9', '#9B51E0', '#56CCF2', '#828282', '#98A7B9', '#E91E63']

export default function TagsManage({ onClose, onChanged }) {
  const t = useT()
  const { can } = useAuth()
  const canEdit = !can || can('crm.settings')
  const { data, reload } = useApi(() => crmService.listTags(), [])
  const { data: lockedData, setData: setLocked } = useApi(() => api.get('/crm/tags-settings').catch(() => null), [], 'tags:settings')
  const locked = !!lockedData?.locked
  const [q, setQ] = useState('')
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [colorId, setColorId] = useState(null)
  const [del, setDel] = useState(null)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  // amoCRM: eng ko'p ishlatilgan teglar yuqorida
  const tags = useMemo(() => [...(data?.tags || [])].sort((a, b) => b.usage - a.usage || a.name.localeCompare(b.name)), [data])
  const query = q.trim()
  const shown = tags.filter((x) => x.name.toLowerCase().includes(query.toLowerCase()))
  const exact = tags.some((x) => x.name.toLowerCase() === query.toLowerCase())
  const run = async (fn) => {
    setMsg('')
    try { await fn(); await reload(); onChanged?.() } catch (e) { setMsg(e?.data?.message || e?.message || t('Xatolik yuz berdi')) }
  }
  const toggleLock = () => {
    const v = !locked
    setLocked({ locked: v })
    api.put('/crm/tags-settings', { locked: v }).catch(() => setLocked({ locked: !v }))
  }
  const add = () => { if (query && !exact) { setQ(''); run(() => crmService.upsertTag(query)) } }
  const saveEdit = (x) => {
    setEditId(null)
    const name = editName.trim()
    if (!name || name === x.name) return
    // boshqa mavjud teg nomiga o'zgartirilsa — ikkalasi bitta tegga birlashtiriladi (bitimlardagi teglar ham almashadi)
    const twin = tags.find((o) => o.id !== x.id && o.name.toLowerCase() === name.toLowerCase())
    if (twin) {
      if (window.confirm(`«${x.name}» → «${twin.name}»: ${t('teglar birlashtirilsinmi?')}`)) run(() => api.post('/crm/tags/merge', { fromIds: [x.id], intoId: twin.id }))
      return
    }
    run(() => api.put(`/crm/tags/${x.id}`, { name }))
  }

  return createPortal(
    <div className="ac-modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ac-modal ac-tagman">
        <button className="ac-modal__close" onClick={onClose}><Ico name="close" /></button>
        <h2 className="ac-modal__title">{t('Teglarni boshqarish')}</h2>
        {canEdit && (
          <label className="ac-tagman__lock" onClick={toggleLock}>
            {t('Foydalanuvchilarga yangi teg yaratishni taqiqlash')}
            <span className={`ac-switch ${locked ? 'on' : ''}`} />
          </label>
        )}
        <input className="ac-input ac-tagman__q" autoFocus placeholder={t("Topish yoki teg qo'shish")} value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && canEdit && add()} />
        {msg && <div className="ac-import-err" style={{ margin: '8px 0 0' }}>{msg}</div>}
        <div className="ac-tagman__list">
          {canEdit && query && !exact && (
            <div className="ac-tagman__row ac-tagman__row--add" onClick={add}><Ico name="plus" size={12} /> {t("Qo'shish")}: <b>{query}</b></div>
          )}
          {!data && <div className="ac-spinner" style={{ margin: 30 }} />}
          {data && !shown.length && !query && <div className="ac-tags-empty">{t('Teglar topilmadi')}</div>}
          {shown.map((x) => (
            <React.Fragment key={x.id}>
              <div className="ac-tagman__row">
                {editId === x.id ? (
                  <input className="ac-input ac-tagman__edit" autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => saveEdit(x)} onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(x); if (e.key === 'Escape') setEditId(null) }} />
                ) : (
                  <span className={`ac-tag ${x.color ? 'ac-tag--c' : ''}`} style={tagStyle(x.color)} title={canEdit ? t("Nomini o'zgartirish") : undefined}
                    onClick={() => { if (canEdit) { setEditId(x.id); setEditName(x.name); setColorId(null) } }}>{x.name}</span>
                )}
                <span className="ac-tagman__n">{x.usage}</span>
                {canEdit && editId !== x.id && (
                  <span className="ac-tagman__act">
                    <i className="ac-tagman__dot" style={{ background: x.color }} title={t('Rang')} onClick={() => setColorId(colorId === x.id ? null : x.id)} />
                    <button title={t("O'chirish")} onClick={() => setDel(x)}><Ico name="trash" size={14} /></button>
                  </span>
                )}
              </div>
              {colorId === x.id && (
                <div className="ac-tags-colors">
                  {COLORS.map((c) => <i key={c} className={(x.color || '').toLowerCase() === c.toLowerCase() ? 'on' : ''} style={{ background: c }}
                    onClick={() => { setColorId(null); run(() => api.put(`/crm/tags/${x.id}`, { color: c })) }} />)}
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
      {del && (
        <div className="ac-modal-wrap ac-tagman__confirm" onMouseDown={(e) => e.target === e.currentTarget && setDel(null)}>
          <div className="ac-modal" style={{ maxWidth: 440 }}>
            <h2 className="ac-modal__title">{t("Tegni o'chirish")} «{del.name}»</h2>
            <div>{t('Teg barcha bitimlardan ham olib tashlanadi. Davom etasizmi?')}</div>
            <div className="ac-modal__foot">
              <button className="ac-btn ac-btn--red" onClick={() => { const x = del; setDel(null); run(() => api.del(`/crm/tags/${x.id}`)) }}>{t("O'chirish")}</button>
              <button className="ac-btn ac-btn--plain" onClick={() => setDel(null)}>{t('Bekor qilish')}</button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
