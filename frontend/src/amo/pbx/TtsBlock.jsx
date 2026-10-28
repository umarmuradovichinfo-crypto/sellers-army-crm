// «Matndan audio yaratish» (ovoz sintezi): matn, til, ovoz, nom → audio kutubxonaga yoziladi; natijani darrov tinglash mumkin.
import React, { useState } from 'react'
import { useT } from '../i18n'
import { useApi } from '../../lib/useApi'
import { pbxService } from '../../services/pbx.service'

const LANGS = [['uz', "pbx§O'zbekcha"], ['ru', 'pbx§Ruscha'], ['en', 'pbx§Inglizcha']]
const PROV = { espeak: 'pbx§eSpeak (mahalliy)', azure: 'Microsoft Azure', google: 'Google Cloud', mock: 'pbx§Sinov' }

/** onCreated(audio) — yaratilgan fayl (masalan formada darrov tanlash uchun). initialText — standart matn. */
export function TtsBlock({ onCreated, initialText = '', initialName = '', compact = false }) {
  const t = useT()
  const { data: v, reload } = useApi(() => pbxService.ttsVoices().catch(() => null), [], 'pbx:tts-voices')
  const [f, setF] = useState({ text: initialText, lang: 'uz', voice: '', name: initialName })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [url, setUrl] = useState(null)
  const voices = (v?.voices || []).filter((x) => x.lang === f.lang)
  const max = v?.maxLength || 500
  const go = async () => {
    setBusy(true); setMsg(null); setUrl(null)
    try {
      const a = await pbxService.tts({ text: f.text, lang: f.lang, voice: f.voice || undefined, name: f.name || undefined })
      setMsg({ ok: true, text: `${t('pbx§Audio yaratildi')}: ${a.name}` })
      try { setUrl(URL.createObjectURL(await pbxService.audioBlob(a.id))) } catch { /* tinglash ixtiyoriy */ }
      onCreated?.(a)
      reload()
    } catch (e) { setMsg({ ok: false, text: e?.message || t("pbx§Yaratib bo'lmadi") }) } finally { setBusy(false) }
  }
  const prov = v?.provider ? (PROV[v.provider]?.startsWith('pbx§') ? t(PROV[v.provider]) : PROV[v.provider]) : null
  return (
    <div className={`pbxtts${compact ? ' pbxtts--compact' : ''}`}>
      {!compact && <h4>{t('pbx§Matndan audio yaratish')}</h4>}
      {v && !v.provider && <p className="ac-pbx__err">{t("pbx§Ovoz sintezi sozlanmagan: serverda espeak-ng o'rnating yoki Azure / Google kalitini bering.")}</p>}
      <textarea className="ac-input pbxtts__text" rows={compact ? 2 : 3} maxLength={max} value={f.text} placeholder={t("pbx§Masalan: Assalomu alaykum! Qo'ng'iroqingiz uchun rahmat.")} onChange={(e) => setF({ ...f, text: e.target.value })} />
      <div className="pbxtts__row">
        <select className="ac-select" value={f.lang} onChange={(e) => setF({ ...f, lang: e.target.value, voice: '' })} aria-label={t('pbx§Til')}>
          {LANGS.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
        </select>
        <select className="ac-select" value={f.voice} onChange={(e) => setF({ ...f, voice: e.target.value })} aria-label={t('pbx§Ovoz')}>
          <option value="">{t('pbx§Ovoz (standart)')}</option>
          {voices.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <input className="ac-input" value={f.name} maxLength={100} placeholder={t('pbx§Fayl nomi')} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <button type="button" className="ac-btn ac-btn--blue" disabled={busy || !f.text.trim() || !v?.provider} onClick={go}>{busy ? '…' : t('pbx§Yaratish')}</button>
      </div>
      <small className="ac-pbx__muted">{f.text.length}/{max}{prov ? ` · ${t('pbx§Provayder')}: ${prov}` : ''}{v ? ` · ${t('pbx§Bugun')}: ${v.usedToday}/${v.dailyLimit}` : ''}</small>
      {msg && <div className={msg.ok ? 'ac-pbx__ok' : 'ac-pbx__err'}>{msg.text}</div>}
      {url && <audio controls autoPlay src={url} style={{ width: '100%', marginTop: 6 }} />}
    </div>
  )
}
