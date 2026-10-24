// amoМаркет o'rnida: "Integratsiyalar" (/amo-market) — kartochkalar grid'i, bosilganda vidjet oynasi (modal).
import React, { useEffect, useMemo, useState } from 'react'
import TopBar from '../TopBar'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/apiClient'
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
  { key: 'instagram', tab: 'chats', name: 'Instagram', cat: 'Chatlar va messenjerlar', color: '#c13584', icon: 'instagram',
    desc: "Instagram Direct va izohlar imBox'ga tushadi, javobni CRM'dan yozasiz." },
  { key: 'messenger', tab: 'chats', name: 'Facebook Messenger', cat: 'Chatlar va messenjerlar', color: '#0084ff', icon: 'facebook',
    desc: "Facebook Messenger suhbatlari imBox'da, javob CRM'dan." },
  { key: 'telegram', tab: 'chats', name: 'Telegram', cat: 'Chatlar va messenjerlar', color: '#2ca5e0', icon: 'telegram',
    desc: "Telegram bot orqali mijozlar bilan imBox'da yozishing." },
  { key: 'forms', tab: 'site', name: 'Lid formalari', cat: 'Saytga integratsiya', color: '#8cc051', icon: 'list',
    desc: "Saytga joylanadigan formalar: to'ldirilganda CRM'ga lid bo'lib tushadi." },
]

const HOOK_EVENTS = [
  ['add_lead', "Bitim qo'shildi"], ['update_lead', "Bitim o'zgartirildi"], ['status_lead', "Bitim bosqichi o'zgardi"],
  ['delete_lead', "Bitim o'chirildi"], ['note_lead', "Bitimga eslatma qo'shildi"], ['add_task', "Vazifa qo'shildi"],
]
// Market → "WEB HOOKS": hodisa bo'lganda tashqi URL'ga JSON POST (amoCRM Web hooks)
function WebhooksModal({ data, onClose, onSaved }) {
  const t = useT()
  const [list, setList] = useState(() => (data?.webhooks || []).map((x) => ({ ...x })))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const upd = (i, patch) => setList((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const save = async () => {
    setBusy(true); setErr('')
    try { await api.put('/crm/webhooks', { webhooks: list }); onSaved(); onClose() } catch (e) { setErr(e?.message || t('Xatolik yuz berdi')) } finally { setBusy(false) }
  }
  return (
    <div className="ac-modal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ac-modal" style={{ maxWidth: 720 }}>
        <h2 className="ac-int-section" style={{ marginTop: 0 }}>Web hooks</h2>
        <div className="ac-muted" style={{ marginBottom: 14, fontSize: 14 }}>{t("Tanlangan hodisalar yuz berganda ko'rsatilgan manzilga POST so'rov (JSON) yuboriladi.")}</div>
        {list.map((h, i) => (
          <div key={h.id || i} className="ac-hook">
            <div className="ac-hook__row">
              <input className="ac-input" placeholder="https://example.com/hook" value={h.url} onChange={(e) => upd(i, { url: e.target.value })} />
              <button className="ac-top__dots" title={t("O'chirish")} onClick={() => setList((l) => l.filter((_, j) => j !== i))}><Ico name="trash" size={14} /></button>
            </div>
            <div className="ac-hook__events">
              {HOOK_EVENTS.map(([k, l]) => (
                <label key={k}><input type="checkbox" className="ac-check" checked={(h.events || []).includes(k)}
                  onChange={(e) => upd(i, { events: e.target.checked ? [...(h.events || []), k] : (h.events || []).filter((x) => x !== k) })} /> {t(l)}</label>
              ))}
            </div>
          </div>
        ))}
        <a className="ac-set-addlink" onClick={() => setList((l) => [...l, { url: '', events: ['add_lead', 'status_lead'], active: true }])}>+ {t("Web hook qo'shish")}</a>
        {err && <div className="ac-set-err" style={{ marginTop: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button className="ac-btn ac-btn--blue" disabled={busy} onClick={save}>{t('Saqlash')}</button>
          <button className="ac-btn ac-btn--plain" onClick={onClose}>{t('Bekor qilish')}</button>
        </div>
      </div>
    </div>
  )
}

export default function IntegrationsPage() {
  const t = useT()
  const [tab, setTab] = useState('installed')
  const { can } = useAuth()
  const canHooks = can('settings.roles.manage')
  const [hooksOpen, setHooksOpen] = useState(false)
  const hooks = useApi(() => (canHooks ? api.get('/crm/webhooks') : Promise.resolve(null)), [], 'amo:int:webhooks')
  const [q, setQ] = useState('')
  // Facebook OAuth redirect'idan qaytganda (?fb=) modal avtomatik ochiladi
  // ?open=instagram|messenger|facebook — voronka sozlamalari manbalar katalogidan keladi
  const [open, setOpen] = useState(() => {
    const p = new URLSearchParams(window.location.search)
    const o = p.get('open')
    if (['instagram', 'messenger', 'facebook'].includes(o)) return o
    return p.get('fb') ? 'facebook' : null
  })
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
      safe(facebookService.getConfig(), (c) => {
        const any = !!c.enabled && (c.pages || []).length > 0
        setOn('facebook')(any); setOn('messenger')(any); setOn('instagram')((c.pages || []).some((p) => p.igId))
      }),
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
      <TopBar title={t('Integratsiyalar')} search={q} onSearch={setQ} searchPlaceholder="Qidiruv"
        actions={canHooks && <button className="ac-btn ac-int-hooksbtn" onClick={() => setHooksOpen(true)}><span className="ac-btn__plus">+</span>WEB HOOKS{hooks.data?.webhooks?.length ? <span className="ac-int-hookscnt">{hooks.data.webhooks.length}</span> : null}</button>} />
      {hooksOpen && <WebhooksModal data={hooks.data} onClose={() => setHooksOpen(false)} onSaved={() => hooks.reload()} />}
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
          {['facebook', 'instagram', 'messenger'].includes(card.key) && (
            <IntegrationsFacebook variant={card.key === 'facebook' ? 'leads' : card.key} stages={stages} members={members} pipelines={pipelines}
              onStatus={(v) => { setOn(card.key)(v); if (card.key !== 'instagram') { setOn('facebook')(v); setOn('messenger')(v) } }} />
          )}
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
