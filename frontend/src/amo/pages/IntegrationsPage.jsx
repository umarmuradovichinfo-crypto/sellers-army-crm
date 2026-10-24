// amoМаркет o'rnida: "Integratsiyalar" (/amo-market) — kartochkalar grid'i, bosilganda vidjet oynasi (modal).
import React, { useEffect, useMemo, useState } from 'react'
import TopBar from '../TopBar'
import { Ico } from '../AmoIcons'
import { useT } from '../i18n'
import { useApi } from '../../lib/useApi'
import { crmService } from '../../services/crm.service'
import { facebookService } from '../../services/facebook.service'
import IntegrationsPbx from './IntegrationsPbx'
import IntegrationsFacebook from './IntegrationsFacebook'
import IntegrationsTelegram from './IntegrationsTelegram'
import IntegrationsForms from './IntegrationsForms'
import '../i18n/settings.ru'
import '../settings.css'

const TABS = [
  { key: 'installed', label: "O'rnatilganlar" },
  { key: 'chats', label: 'Chatlar va messenjerlar' },
  { key: 'phone', label: 'Telefoniya' },
  { key: 'site', label: 'Saytga integratsiya' },
]

const CARDS = [
  { key: 'pbx', tab: 'phone', name: 'OnlinePBX', cat: 'Telefoniya', color: '#e2453c', icon: 'phone',
    desc: "Click-to-call, kiruvchi qo'ng'iroq oynasi va qo'ng'iroqlar tarixi." },
  { key: 'facebook', tab: 'chats', name: 'Facebook Lead Ads', cat: 'Chatlar va messenjerlar', color: '#1877f2', icon: 'send',
    desc: "Facebook va Instagram reklama formalaridan lidlar avtomatik CRM'ga tushadi." },
  { key: 'telegram', tab: 'chats', name: 'Telegram', cat: 'Chatlar va messenjerlar', color: '#2ca5e0', icon: 'telegram',
    desc: "Telegram bot orqali mijozlar bilan imBox'da yozishing." },
  { key: 'forms', tab: 'site', name: 'Lid formalari', cat: 'Saytga integratsiya', color: '#8cc051', icon: 'list',
    desc: "Saytga joylanadigan formalar: to'ldirilganda CRM'ga lid bo'lib tushadi." },
]

export default function IntegrationsPage() {
  const t = useT()
  const [tab, setTab] = useState('installed')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)
  const [status, setStatus] = useState({})
  const [ready, setReady] = useState(false)
  const setOn = (k) => (v) => setStatus((s) => (s[k] === !!v ? s : { ...s, [k]: !!v }))

  const pipe = useApi(() => crmService.getPipeline(), [], 'amo:int:pipeline')
  const mem = useApi(() => crmService.listMembers(), [], 'amo:int:members')
  const stages = (pipe.data?.stages || []).map((s) => ({ id: s.id ?? s.key, name: s.name }))
  const pipelines = pipe.data?.pipelines || []
  const members = mem.data?.members || []

  // Boshlang'ich holatlar (O'rnatilganlar tabi uchun)
  useEffect(() => {
    let alive = true
    const safe = (p, fn) => p.then((r) => { if (alive) fn(r) }).catch(() => {})
    Promise.all([
      safe(crmService.getPbxConfig(), (c) => setOn('pbx')(!!c.enabled)),
      safe(facebookService.getConfig(), (c) => setOn('facebook')(!!c.enabled && (c.pages || []).length > 0)),
      safe(crmService.chatStatus(), (c) => setOn('telegram')(!!c.telegram)),
      safe(crmService.listForms(), (r) => setOn('forms')((r.forms || []).length > 0)),
    ]).then(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, []) // eslint-disable-line

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return CARDS.filter((c) => (tab === 'installed' ? status[c.key] : c.tab === tab) && (!s || `${c.name} ${t(c.desc)}`.toLowerCase().includes(s)))
  }, [tab, q, status, t])
  const card = CARDS.find((c) => c.key === open)

  return (
    <div className="ac-content">
      <TopBar title={t('Integratsiyalar')} search={q} onSearch={setQ} searchPlaceholder="Qidiruv" />
      <div className="ac-int-tabs">
        {TABS.map((x) => <button key={x.key} className={`ac-int-tab ${tab === x.key ? 'on' : ''}`} onClick={() => setTab(x.key)}>{t(x.label)}</button>)}
      </div>
      <div className="ac-int-body">
        <h2 className="ac-int-section">{t(TABS.find((x) => x.key === tab).label)}</h2>
        {tab === 'installed' && !ready && shown.length === 0 ? (
          <div className="ac-int-empty"><div className="ac-spinner" /></div>
        ) : shown.length === 0 ? (
          <div className="ac-int-empty">{tab === 'installed' ? t("Hali integratsiya o'rnatilmagan") : t('Hech narsa topilmadi')}</div>
        ) : (
          <div className="ac-int-grid">
            {shown.map((c) => (
              <div key={c.key} className="ac-int-card" onClick={() => setOpen(c.key)}>
                {status[c.key] && <span className="ac-int-badge">{t('Ulangan')}</span>}
                <div className="ac-int-card__top">
                  <div className="ac-int-card__logo" style={{ background: c.color }}><Ico name={c.icon} size={26} /></div>
                  <div><div className="ac-int-card__name">{c.name}</div><div className="ac-int-card__cat">{t(c.cat)}</div></div>
                </div>
                <div className="ac-int-card__desc">{t(c.desc)}</div>
                <div className="ac-int-card__foot">
                  <button className="ac-btn ac-btn--sm" style={{ color: 'var(--palette-link-primary)', borderColor: 'var(--palette-link-primary)' }}>
                    {status[c.key] ? t('Sozlash') : t("O'rnatish")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {card && (
        <WidgetModal card={card} onClose={() => setOpen(null)}>
          {card.key === 'pbx' && <IntegrationsPbx onStatus={setOn('pbx')} />}
          {card.key === 'facebook' && <IntegrationsFacebook stages={stages} members={members} pipelines={pipelines} onStatus={setOn('facebook')} />}
          {card.key === 'telegram' && <IntegrationsTelegram onStatus={setOn('telegram')} />}
          {card.key === 'forms' && <IntegrationsForms stages={stages} members={members} onStatus={setOn('forms')} />}
        </WidgetModal>
      )}
    </div>
  )
}

function WidgetModal({ card, onClose, children }) {
  const t = useT()
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="ac-modal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ac-modal ac-int-modal">
        <button className="ac-modal__close" onClick={onClose}><Ico name="close" size={16} /></button>
        <div className="ac-int-modal__head">
          <div className="ac-int-card__logo" style={{ background: card.color }}><Ico name={card.icon} size={24} /></div>
          <div><div className="ac-int-modal__title">{card.name}</div><div className="ac-int-card__cat">{t(card.cat)}</div></div>
        </div>
        <div className="ac-int-modal__body">{children}</div>
      </div>
    </div>
  )
}
