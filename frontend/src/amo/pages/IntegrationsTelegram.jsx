// Telegram bot — ulanish holati va webhook'ni o'rnatish.
import React, { useState } from 'react'
import { api } from '../../lib/apiClient'
import { crmService } from '../../services/crm.service'
import { useApi } from '../../lib/useApi'
import { useT } from '../i18n'

export default function IntegrationsTelegram({ onStatus }) {
  const t = useT()
  const { data, loading, reload } = useApi(() => crmService.chatStatus(), [], 'settings:chat-status', 60000)
  const [url, setUrl] = useState(`${window.location.origin}/api/v1/telegram/webhook`)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const on = !!data?.telegram

  const setup = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await api.post('/crm/telegram-webhook-setup', { url: url.trim() })
      setMsg({ ok: r?.ok !== false, m: r?.ok === false ? (r.error || t('Xatolik')) : t('Webhook o\'rnatildi') })
      reload(); onStatus?.(on)
    } catch (e) { setMsg({ ok: false, m: e.message || t('Xatolik') }) }
    finally { setBusy(false) }
  }

  if (loading && !data) return <div className="ac-spinner" />
  return (
    <>
      <div className="ac-int-lead">{t("Telegram bot orqali mijozlar yozishmalari imBox'ga tushadi va shu yerdan javob berasiz.")}</div>
      <div className="ac-int-field"><label>{t('Holat')}</label>
        <span className={`ac-set-status ${on ? 'ok' : ''}`}>{on ? t('Ulangan') : t('Ulanmagan')}</span>
        {!on && <div className="ac-int-hint">{t("Serverda TELEGRAM_BOT_TOKEN sozlanishi kerak (administrator bir marta qo'shadi).")}</div>}
      </div>
      {on && (
        <>
          <div className="ac-int-field"><label>Webhook URL</label>
            <input className="ac-input" value={url} onChange={(e) => setUrl(e.target.value)} />
            <div className="ac-int-hint">{t("Telegram yangi xabarlarni shu manzilga yuboradi (ommaviy HTTPS manzil bo'lishi kerak).")}</div>
          </div>
          <div className="ac-int-actions">
            <button className="ac-btn ac-btn--blue" disabled={busy || !url.trim()} onClick={setup}>{busy ? t('Saqlanmoqda…') : t("Webhook'ni o'rnatish")}</button>
            {msg && <span className={`ac-int-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.m}</span>}
          </div>
        </>
      )}
    </>
  )
}
