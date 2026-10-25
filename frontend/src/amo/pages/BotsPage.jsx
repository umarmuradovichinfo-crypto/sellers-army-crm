// amoCRM «AI-агенты и боты» (/agents-and-bots): «Ваши боты — Список ботов» (nom, triggerlar, konversiya, ishga tushishlar)
// va Salesbot konstruktori (BotBuilder).
import React, { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/apiClient'
import { useAuth } from '../../context/AuthContext'
import { Ico } from '../AmoIcons'
import { useT } from '../i18n'
import BotBuilder, { TRIGGER_LABEL, emptyBot } from '../BotBuilder'
import '../i18n/bots.ru.js'
import '../bots.css'

export default function BotsPage() {
  const t = useT()
  const { can } = useAuth()
  const canEdit = !can || can('crm.settings')
  const [bots, setBots] = useState(null)
  const [sel, setSel] = useState(new Set())
  const [open, setOpen] = useState(null) // bot obyekti (yangi yoki mavjud)
  const fileRef = useRef(null)
  const load = () => api.get('/crm/salesbots').then((r) => setBots(r.bots || [])).catch(() => setBots([]))
  useEffect(() => { load() }, [])

  const openBot = async (id) => { const r = await api.get(`/crm/salesbots/${id}`); setOpen(r.bot) }
  const importBot = (file) => {
    if (!file) return
    file.text().then((txt) => {
      try {
        const b = JSON.parse(txt)
        setOpen({ ...emptyBot(t), name: b.name || 'Salesbot', steps: b.steps || [], startId: b.startId || null, triggers: b.triggers || [] })
      } catch { window.alert(t("Fayl noto'g'ri")) }
    })
  }
  const removeSel = async () => {
    if (!window.confirm(t("Tanlangan botlar o'chirilsinmi?"))) return
    await Promise.all([...sel].map((id) => api.del(`/crm/salesbots/${id}`).catch(() => null)))
    setSel(new Set()); load()
  }
  const toggleActive = async (b) => { await api.put(`/crm/salesbots/${b.id}`, { active: !b.active }).catch(() => null); load() }

  return (
    <div className="ac-content ac-bots">
      <div className="ac-top"><div className="ac-top__preset"><span className="ac-top__title">{t('Agentlar va botlar')}</span></div></div>
      <div className="ac-bots__body">
        <h2 className="ac-bots__h">{t('Sizning botlaringiz')}</h2>
        <div className="ac-bots__card">
          <div className="ac-bots__card-title">{t("Botlar ro'yxati")}</div>
          <p className="ac-bots__card-desc">{t("Botlarni oldindan yaratib, ularni triggerlarda ishlatishingiz, mavjudlarini tahrirlashingiz mumkin")}</p>
          {sel.size > 0 && canEdit && (
            <div className="ac-bots__bulk">{t('Belgilandi')}: {sel.size} <button onClick={removeSel}><Ico name="trash" size={13} /> {t("O'chirish")}</button></div>
          )}
          <table className="ac-table ac-bots__table">
            <thead>
              <tr>
                <th className="ac-chk"><input type="checkbox" className="ac-check" checked={!!bots?.length && sel.size === bots.length} onChange={(e) => setSel(new Set(e.target.checked ? bots.map((b) => b.id) : []))} /></th>
                <th>{t('Nomi')}</th><th>{t('Triggerlar')}</th><th className="num">{t('Konversiya')}</th><th className="num">{t('Jami ishga tushishlar')}</th><th className="num">{t('Hozir ishlamoqda')}</th><th />
              </tr>
            </thead>
            <tbody>
              {canEdit && (
                <tr className="ac-bots__new">
                  <td className="ac-chk"><span className="ac-bots__plus">+</span></td>
                  <td colSpan={6}>
                    <a onClick={() => setOpen(emptyBot(t))}>{t('bots§Yaratish')}</a> {t('yangi bot yoki')} <a onClick={() => fileRef.current?.click()}>{t('import qilish')}</a>
                    <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { importBot(e.target.files?.[0]); e.target.value = '' }} />
                  </td>
                </tr>
              )}
              {!bots && <tr><td colSpan={7}><div className="ac-spinner" style={{ margin: 20 }} /></td></tr>}
              {bots?.map((b) => (
                <tr key={b.id} className={b.active ? '' : 'off'}>
                  <td className="ac-chk"><input type="checkbox" className="ac-check" checked={sel.has(b.id)} onChange={() => setSel((s) => { const n = new Set(s); n.has(b.id) ? n.delete(b.id) : n.add(b.id); return n })} /></td>
                  <td><a className="ac-bots__name" onClick={() => openBot(b.id)}>{b.name}</a></td>
                  <td>{b.triggers.map((x, i) => <span key={i} className="ac-bots__chip">{t(TRIGGER_LABEL[x.type] || x.type)}</span>)}</td>
                  <td className="num">{b.stats?.total ? `${b.stats.conversion}%` : '—'}</td>
                  <td className="num">{b.stats?.total || '—'}</td>
                  <td className="num">{b.stats?.active || '—'}</td>
                  <td className="ac-bots__sw">{canEdit && <span className={`ac-switch ${b.active ? 'on' : ''}`} title={t(b.active ? 'bots§Faol' : "O'chirilgan")} onClick={() => toggleActive(b)} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {open && <BotBuilder bot={open} canEdit={canEdit} onClose={(changed) => { setOpen(null); if (changed) load() }} />}
    </div>
  )
}
