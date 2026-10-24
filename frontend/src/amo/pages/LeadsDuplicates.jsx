// amoCRM "Поиск дублей" — bitimlar dublikatlari (/leads/duplicates): telefon / email / nom bo'yicha guruhlar va birlashtirish.
import React, { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { crmService } from '../../services/crm.service'
import { useApi } from '../../lib/useApi'
import TopBar from '../TopBar'
import { money, dmy } from '../format'
import { useT, usePlural } from '../i18n'
import '../i18n/leadsfilter.ru.js'
import '../leads.css'

const TABS = [['phone', 'Telefon bo\'yicha'], ['email', 'Email bo\'yicha'], ['name', 'Nomi bo\'yicha']]

function Group({ g, onMerged }) {
  const t = useT()
  const navigate = useNavigate()
  const [keep, setKeep] = useState(g.leads[0].id)
  const [busy, setBusy] = useState(false)
  const merge = async () => {
    if (busy || !window.confirm(t('Tanlangan bitimlar birlashtirilsinmi?'))) return
    setBusy(true)
    try { await crmService.mergeLeads(keep, g.leads.filter((l) => l.id !== keep).map((l) => l.id)); onMerged() } catch (e) { window.alert(e?.message || t('Xatolik yuz berdi')) } finally { setBusy(false) }
  }
  return (
    <div className="ac-dups__group">
      <div className="ac-dups__head">
        <b>{g.key}</b><span className="muted ac-muted">{g.count}</span>
        <span style={{ flex: 1 }} />
        <button className="ac-btn ac-btn--blue ac-btn--sm" disabled={busy} onClick={merge}>{t('Birlashtirish')}</button>
      </div>
      {g.leads.map((l) => (
        <div key={l.id} className="ac-dups__row">
          <input type="radio" name={`keep-${g.key}`} checked={keep === l.id} onChange={() => setKeep(l.id)} title={t('Asosiy bitim')} />
          <a className="grow" onClick={() => navigate(`/leads/detail/${l.id}`)}>{l.name}</a>
          <span className="muted">{l.phone || l.email || ''}</span>
          <span className="muted">{l.stageName}</span>
          <span className="muted">{l.value ? money(l.value) : ''}</span>
          <span className="muted">{l.assigneeName || ''}</span>
          <span className="muted">{dmy(l.createdAt)}</span>
        </div>
      ))}
    </div>
  )
}

export default function LeadsDuplicates() {
  const t = useT()
  const plural = usePlural()
  const navigate = useNavigate()
  const [sp, setSp] = useSearchParams()
  const by = ['phone', 'email', 'name'].includes(sp.get('by')) ? sp.get('by') : 'phone'
  const { data, loading, reload } = useApi(() => crmService.leadDuplicates(by), [by], `amo-leads-dups-${by}`)
  return (
    <div>
      <TopBar title={t('Dublikatlarni qidirish')} count={<>{data?.total ?? 0} {t('guruh')}</>}
        actions={<button className="ac-btn" onClick={() => navigate('/leads/pipeline')}>{t('Voronkaga qaytish')}</button>} />
      <div className="ac-dups">
        <div className="ac-dups__tabs">
          {TABS.map(([k, l]) => <button key={k} className={`ac-btn ${by === k ? 'ac-btn--blue' : ''}`} onClick={() => setSp({ by: k })}>{t(l)}</button>)}
        </div>
        {loading && !data && <span className="ac-spinner" />}
        {data && data.groups.length === 0 && <div className="ac-muted">{t('Dublikatlar topilmadi')}</div>}
        {data?.groups.map((g) => <Group key={`${by}:${g.key}:${g.leads.map((l) => l.id).join()}`} g={g} onMerged={reload} />)}
        {data && data.groups.length > 0 && <div className="ac-muted" style={{ marginTop: 6 }}>{plural(data.groups.reduce((a, g) => a + g.count, 0), 'bitim')}</div>}
      </div>
    </div>
  )
}
