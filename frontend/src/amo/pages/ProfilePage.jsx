// amoCRM «Настройки профиля» (/settings/profile): akkaunt paneli → «профиль». Avatar, ID, til, ism, telefon, email,
// parol, izoh; «Безопасность» → «Сеансы» (har bir qurilma, «Выйти»); «Доступ к аккаунту».
import React, { useEffect, useRef, useState } from 'react'
import { Ico } from '../AmoIcons'
import { useI18n } from '../i18n'
import { useAuth } from '../../context/AuthContext'
import { settingsService } from '../../services/settings.service'
import { notifService } from '../../services/crm.service'
import '../i18n/settings.ru'
import '../settings.css'

// "Mozilla/5.0 (Macintosh…) Chrome/…" → "Chrome, MacOSX" (amoCRM ko'rinishi)
export function uaLabel(ua) {
  const s = String(ua || '')
  if (!s) return '—'
  const br = /Edg\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera' : /YaBrowser/.test(s) ? 'Yandex' : /Firefox\//.test(s) ? 'Firefox'
    : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : /node|curl|axios/i.test(s) ? 'API' : s.split(/[\s/]/)[0]
  const os = /iPhone|iPad/.test(s) ? 'iOS' : /Android/.test(s) ? 'Android' : /Windows NT 10/.test(s) ? 'Win10' : /Windows/.test(s) ? 'Windows'
    : /Mac OS X|Macintosh/.test(s) ? 'MacOSX' : /Linux/.test(s) ? 'Linux' : ''
  return os ? `${br}, ${os}` : br
}

// amoCRM «Получать уведомления»: turlar (bizdagi bildirishnoma turlari bo'yicha)
const NOTIF_ROWS = [
  ['task', 'Vazifalar: sizga yangi vazifa qo\'yildi'],
  ['task_due', "Vazifalar: bugungi va muddati o'tgan vazifalar"],
  ['lead', 'Bitimlar: sizga bitim biriktirildi, yangi so\'rov'],
  ['mention', 'Chat xabarlari'],
  ['automation', 'Avtomatlashtirish xabarlari'],
]

const fmt = (iso) => {
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// Rasmni 160px kvadratga kichraytirib data-URL qiladi (serverga kichik hajm boradi)
function shrink(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = 160; c.height = 160
      const k = Math.max(160 / img.width, 160 / img.height)
      const w = img.width * k, h = img.height * k
      c.getContext('2d').drawImage(img, (160 - w) / 2, (160 - h) / 2, w, h)
      URL.revokeObjectURL(img.src)
      resolve(c.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

export default function ProfilePage() {
  const { t, lang, setLang } = useI18n()
  const { logout } = useAuth()
  const [base, setBase] = useState(null)
  const [form, setForm] = useState(null)
  const [uiLang, setUiLang] = useState(lang)
  const [sessions, setSessions] = useState([])
  const [pwOpen, setPwOpen] = useState(false)
  const [pw, setPw] = useState({ cur: '', a: '', b: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const fileRef = useRef(null)
  // «Настройки уведомлений»: tur × kanal
  const [nBase, setNBase] = useState(null)
  const [nPrefs, setNPrefs] = useState(null)
  const [digest, setDigest] = useState(false)
  const [digestBase, setDigestBase] = useState(false)
  const [perm, setPerm] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  useEffect(() => { notifService.prefs().then((r) => { setNBase(r.prefs); setNPrefs(r.prefs); setDigest(!!r.digest); setDigestBase(!!r.digest) }).catch(() => {}) }, [])
  const [tg, setTg] = useState(null) // { enabled, linked, code, bot, url }
  const loadTg = () => notifService.tgStatus().then(setTg).catch(() => setTg({ enabled: false }))
  useEffect(() => { loadTg() }, [])
  // bot'ga «/start» yuborilguncha ulanish holatini tekshirib turamiz
  useEffect(() => {
    if (!tg?.enabled || tg.linked) return undefined
    const id = setInterval(() => { notifService.tgStatus().then((s) => { if (s.linked) setTg(s) }).catch(() => {}) }, 4000)
    return () => clearInterval(id)
  }, [tg?.enabled, tg?.linked])
  const toggleN = async (cat, ch) => {
    if (ch === 'browser' && !nPrefs[cat].browser && perm === 'default') {
      try { setPerm(await Notification.requestPermission()) } catch { /* */ }
    }
    setNPrefs((p) => ({ ...p, [cat]: { ...p[cat], [ch]: !p[cat][ch] } }))
  }

  const load = (r) => {
    const p = { name: r.profile.name, email: r.profile.email, phone: r.profile.phone, note: r.profile.note, avatar: r.profile.avatar || '' }
    setBase({ ...p, id: r.profile.id }); setForm(p); setSessions(r.sessions || [])
  }
  useEffect(() => { settingsService.getProfile().then(load).catch((e) => setMsg({ ok: false, m: e.message })) }, [])

  if (!form) return <div className="ac-content"><div className="ac-set-body">{msg ? <div className="ac-set-err">{msg.m}</div> : null}</div></div>

  const pwWant = pwOpen && (pw.cur || pw.a || pw.b)
  const pwBad = pwWant && (!pw.cur || pw.a.length < 6 || pw.a !== pw.b)
  const nDirty = nPrefs && (JSON.stringify(nPrefs) !== JSON.stringify(nBase) || digest !== digestBase)
  const dirty = ['name', 'email', 'phone', 'note', 'avatar'].some((k) => form[k] !== base[k]) || uiLang !== lang || pwWant || nDirty
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    if (pwBad) { setMsg({ ok: false, m: pw.a !== pw.b ? t('Parollar mos emas') : t("Yangi parol kamida 6 belgi bo'lsin") }); return }
    setBusy(true); setMsg(null)
    try {
      const changed = {}
      for (const k of ['name', 'email', 'phone', 'note', 'avatar']) if (form[k] !== base[k]) changed[k] = form[k]
      if (Object.keys(changed).length) load(await settingsService.saveProfile(changed))
      if (pwWant) {
        await settingsService.changeOwnPassword(pw.cur, pw.a)
        setPw({ cur: '', a: '', b: '' }); setPwOpen(false)
        settingsService.getProfile().then(load).catch(() => {})
      }
      if (nDirty) { const r = await notifService.savePrefs(nPrefs, digest); setNBase(r.prefs); setNPrefs(r.prefs); setDigest(!!r.digest); setDigestBase(!!r.digest) }
      if (uiLang !== lang) setLang(uiLang)
      setMsg({ ok: true, m: t('Saqlandi') })
      setTimeout(() => setMsg(null), 2500)
    } catch (e) { setMsg({ ok: false, m: e.message || t('Xatolik') }) } finally { setBusy(false) }
  }

  const pickAvatar = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    try { const a = await shrink(f); setForm((x) => ({ ...x, avatar: a })) } catch { setMsg({ ok: false, m: t("Rasmni o'qib bo'lmadi") }) }
  }

  const close = async (s) => {
    if (s.current) { logout(); return }
    try { await settingsService.closeSession(s.id); setSessions((l) => l.filter((x) => x.id !== s.id)) } catch (e) { setMsg({ ok: false, m: e.message }) }
  }

  return (
    <div className="ac-content">
      <div className="ac-top ac-prof-top">
        <h1 className="ac-prof-title">{t('Profil sozlamalari')}</h1>
        <div className="ac-top__actions" style={{ border: 0 }}>
          {msg && <span className={msg.ok ? 'ac-set-saved' : 'ac-set-err'} style={msg.ok ? undefined : { margin: '0 14px 0 0' }}>{msg.m}</span>}
          <button className={`ac-set-save ${dirty ? 'on' : ''}`} disabled={busy || !dirty} onClick={save}>{t('card§Saqlash')}</button>
        </div>
      </div>
      <div className="ac-set-body">
        <div className="ac-set-block ac-prof">
          <div className="ac-prof__ava" onClick={() => fileRef.current?.click()} title={t('Rasmni almashtirish')}>
            {form.avatar ? <img src={form.avatar} alt="" /> : <Ico name="user" size={64} />}
            <span className="ac-prof__cam"><Ico name="camera" size={14} /></span>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pickAvatar} />
          </div>
          <div className="ac-prof__fields">
            <div className="ac-set-row"><div className="ac-set-row__label ac-prof__muted">{t('Foydalanuvchi ID')}</div>
              <span className="ac-prof__id">{base.id}
                <button className="ac-prof__copy" title={t('Nusxalash')} onClick={() => navigator.clipboard?.writeText(base.id)}><Ico name="list" size={12} /></button>
              </span>
            </div>
            <div className="ac-set-row"><div className="ac-set-row__label">Language / Язык</div>
              <select className="ac-select" value={uiLang} onChange={(e) => setUiLang(e.target.value)}>
                <option value="uz">O'zbekcha</option><option value="ru">Русский</option>
              </select>
            </div>
            <div className="ac-set-row"><div className="ac-set-row__label">{t('Ism')}</div><input className="ac-input" value={form.name} onChange={set('name')} maxLength={100} /></div>
            <div className="ac-set-row"><div className="ac-set-row__label">{t('Telefon')}</div><input className="ac-input" value={form.phone} onChange={set('phone')} maxLength={40} /></div>
            <div className="ac-set-row"><div className="ac-set-row__label">Email</div><input className="ac-input" type="email" value={form.email} onChange={set('email')} /></div>
            <div className="ac-set-row"><div className="ac-set-row__label">{t('Parol')}</div>
              {!pwOpen
                ? <input className="ac-input" type="password" value="••••••" readOnly onFocus={() => setPwOpen(true)} />
                : <input className="ac-input" type="password" autoComplete="current-password" placeholder={t('Joriy parol')} value={pw.cur} onChange={(e) => setPw((p) => ({ ...p, cur: e.target.value }))} autoFocus />}
            </div>
            {pwOpen && <>
              <div className="ac-set-row"><div className="ac-set-row__label" /><input className="ac-input" type="password" autoComplete="new-password" placeholder={t('Yangi parol')} value={pw.a} onChange={(e) => setPw((p) => ({ ...p, a: e.target.value }))} /></div>
              <div className="ac-set-row"><div className="ac-set-row__label" /><input className="ac-input" type="password" autoComplete="new-password" placeholder={t('Parolni takrorlang')} value={pw.b} onChange={(e) => setPw((p) => ({ ...p, b: e.target.value }))} /></div>
            </>}
            <div className="ac-set-row ac-prof__note"><div className="ac-set-row__label">{t('Izoh')}</div><textarea className="ac-input" value={form.note} onChange={set('note')} maxLength={2000} /></div>
          </div>
        </div>

        <h2 className="ac-prof-h2">{t('Xavfsizlik')}</h2>
        <div className="ac-set-block">
          <h2 className="ac-set-block__title">{t('Seanslar')}</h2>
          <div className="ac-set-block__desc">{t("Kirilgan qurilmalar ro'yxati. Seanslar 30 kun faolsiz qolsa yakunlanadi. Shubhali narsani sezsangiz, parolni almashtiring — shundan so'ng joriy qurilmadan tashqari barcha qurilmalardan avtomatik chiqasiz.")}</div>
          <table className="ac-set-table ac-prof-sess">
            <thead><tr><th>{t('SEANS')}</th><th>{t('OXIRGI KIRISH')}</th><th>{t('IP MANZIL')}</th><th /></tr></thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>{uaLabel(s.ua)}</td>
                  <td>{s.current ? <span className="ac-prof-cur">{t('Joriy')}</span> : fmt(s.lastAt)}</td>
                  <td>{s.ip || '—'}</td>
                  <td>{!s.current && <button className="ac-prof-out" onClick={() => close(s)}>{t('prof§Chiqish')}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {nPrefs && (
          <>
            <h2 className="ac-prof-h2">{t('Bildirishnomalar sozlamalari')}</h2>
            <div className="ac-set-block">
              <table className="ac-prof-sess ac-prof-notif">
                <thead><tr><th>{t('ASOSIY')}</th><th>{t('MARKAZ')}</th><th>{t('BRAUZER')}</th>{tg?.linked && <th>TELEGRAM</th>}</tr></thead>
                <tbody>
                  {NOTIF_ROWS.map(([k, l]) => (
                    <tr key={k}>
                      <td>{t(l)}</td>
                      {['main', 'browser', ...(tg?.linked ? ['telegram'] : [])].map((ch) => (
                        <td key={ch}><span className={`ac-switch ${nPrefs[k]?.[ch] ? 'on' : ''}`} onClick={() => toggleN(k, ch)} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {tg?.enabled && (
                <div className="ac-prof-tg">
                  {tg.linked ? (
                    <>
                      <span>✅ {t("Telegram ulangan — kerakli turlar uchun «TELEGRAM» ustunini yoqing")}</span>
                      <button className="ac-prof-out" onClick={() => notifService.tgUnlink().then(loadTg)}>{t('tg§Uzish')}</button>
                      <label className="ac-set-radio" style={{ width: '100%' }}>
                        <input type="checkbox" checked={digest} onChange={(e) => setDigest(e.target.checked)} />
                        <span>{t("Telegram: kuniga bir marta 18:00 da jamlab yuborish")}</span>
                      </label>
                    </>
                  ) : (
                    <>
                      <span>{t("Bildirishnomalarni Telegram'da olish:")}</span>
                      {tg.url
                        ? <a className="ac-btn ac-btn--plain ac-import-btn" href={tg.url} target="_blank" rel="noreferrer">{t("Telegram'ga ulash")}</a>
                        : <span className="ac-muted">{t("botga yuboring")}: <b>/start {tg.code}</b></span>}
                    </>
                  )}
                </div>
              )}
              {perm === 'denied' && <div className="ac-set-err" style={{ marginTop: 8 }}>{t("Brauzer bildirishnomalari brauzer sozlamalarida bloklangan")}</div>}
            </div>
          </>
        )}

        <div className="ac-set-block">
          <h2 className="ac-set-block__title">{t('Akkauntga kirish')}</h2>
          <div className="ac-set-block__desc">{t("Bu akkauntda endi ishlamasangiz, administratordan foydalanuvchini o'chirib qo'yishini so'rang. Joriy qurilmadan chiqish:")}</div>
          <button className="ac-btn ac-btn--plain" onClick={logout}>{t('Akkauntdan chiqish')}</button>
        </div>
      </div>
    </div>
  )
}
