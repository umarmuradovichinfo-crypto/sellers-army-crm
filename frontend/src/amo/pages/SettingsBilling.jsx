// «Hisob va to'lov» (amoCRM «Счет и оплата» + OnlinePBX «Лицензии» kabi): faol va oldindan to'langan litsenziyalar,
// uch rejimli kalkulyator (uzaytirish / foydalanuvchi qo'shish — qolgan kunlarga proporsional / yangi litsenziya),
// qo'lda to'lov (karta + chekni Telegramga) va litsenziya kodini kiritish.
import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useT } from '../i18n'
import { useApi } from '../../lib/useApi'
import { useAuth } from '../../context/AuthContext'
import { billingService } from '../../services/billing.service'
import '../i18n/billing.ru'
import '../billing.css'

// amoCRM narxi (so'm / foydalanuvchi / oy) — solishtirish uchun
const AMO = { basic: 79000, advanced: 179000, pro: 259000 }
const FEATURES = {
  basic: ['bl§Bitimlar, voronka, vazifalar', 'bl§imBox va kontaktlar', "bl§Ruxsatlar matritsasi"],
  advanced: ['bl§Bazoviy imkoniyatlari', 'bl§Avtomatlashtirish va Salesbot', 'bl§KPI va sotuv rejalari', 'bl§Kataloglar (mahsulotlar)'],
  pro: ['bl§Kengaytirilgan imkoniyatlari', 'bl§Zaxira nusxa (backup)', 'bl§Mijoz savollariga avto-javob'],
}
const fmt = (n) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ')
const dateStr = (iso) => { try { return new Date(iso).toLocaleDateString('ru-RU') } catch { return '' } }
const MODES = [['renew', 'bl§Uzaytirish'], ['addon', "bl§Foydalanuvchi qo'shish"], ['new', 'bl§Yangi litsenziya']]

/** Litsenziyalar ro'yxati (OnlinePBX kabi): tarif, foydalanuvchilar, sana oralig'i (kun), summa. */
function LicenseList({ title, rows, t }) {
  if (!rows.length) return null
  return (
    <>
      <h3>{title}</h3>
      <table className="ac-bl__hist ac-bl__lic">
        <tbody>
          {rows.map((l) => (
            <tr key={l.id + l.from}>
              <td><b>{l.planName}</b></td>
              <td>{l.users} {t('bl§foydalanuvchi')}</td>
              <td>{dateStr(l.from)} – {dateStr(l.until)} <span className="ac-bl__muted">({l.days} {t('bl§kun')})</span></td>
              <td className="ac-bl__amount">{fmt(l.amount)} {t("bl§so'm")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

export default function SettingsBilling() {
  const t = useT()
  const { user, can } = useAuth()
  const isSuper = user?.role === 'super_admin'
  const { data, loading, error, reload } = useApi(() => (can('settings.view') ? billingService.overview() : Promise.resolve(null)), [], 'billing:overview')
  const [plan, setPlan] = useState('advanced')
  const [users, setUsers] = useState(5)
  const [months, setMonths] = useState(12)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [copied, setCopied] = useState(false)
  const [mode, setMode] = useState('renew')
  const [sp] = useSearchParams()
  const renewIds = sp.get('renew') || ''
  // «Продлить выбранные лицензии» (Telefoniya → Litsenziyalar): tanlanganlar tarifi va foydalanuvchilar soni oldindan qo'yiladi
  useEffect(() => {
    if (!data || !renewIds) return
    const sel = (data.licenses || []).filter((l) => renewIds.split(',').includes(l.id))
    const first = sel.find((l) => data.plans.some((x) => x.key === l.plan))
    if (!first) return
    setMode('renew'); setPlan(first.plan)
    setUsers(Math.max(1, sel.filter((l) => l.plan === first.plan).reduce((a, l) => a + l.users, 0)))
  }, [data, renewIds])

  if (!can('settings.view')) return <div className="ac-bl"><p>{t("bl§Bu bo'limga ruxsat yo'q")}</p></div>
  if (loading && !data) return <div className="ac-bl" />
  if (error && !data) return <div className="ac-bl"><p>{t('bl§Yuklab bo\'lmadi')}</p></div>
  if (!data) return null

  const p = data.plans.find((x) => x.key === plan) || data.plans[0]
  const q = p.quotes.find((x) => x.months === months) || p.quotes[0]
  const lic = data.licenses || []
  const activeLic = lic.filter((l) => l.status === 'active')
  const futureLic = lic.filter((l) => l.status === 'future')
  const aq = (data.addonQuotes || []).find((x) => x.plan === p.key)
  const isAddon = mode === 'addon'
  const total = isAddon ? (aq ? aq.total * users : 0) : q.perUserTotal * users
  const amoTotal = AMO[p.key] * q.paidMonths * users
  // Uzaytirish shu tarifdagi eng kech litsenziya oxiridan boshlanadi (bo'lmasa — bugundan)
  const lastSame = lic.filter((l) => l.plan === p.key && l.status !== 'ended').reduce((a, l) => (l.until > a ? l.until : a), '')
  const startIso = mode === 'renew' && lastSame && new Date(lastSame).getTime() > Date.now() ? lastSame : new Date().toISOString()
  const st = data.status
  const statusText = { trial: t('bl§Sinov davri'), active: t('bl§Faol'), grace: t('bl§Muddat tugadi (qo\'shimcha kunlar)'), expired: t('bl§Obuna tugagan') }[st]
  const periodLabel = (m) => (m < 12 ? `${m} ${t('bl§oy')}` : m === 12 ? `1 ${t('bl§yil')}` : `${m / 12} ${t('bl§yil')}`)
  const modeLabel = t(MODES.find(([k]) => k === mode)[1])
  const termText = isAddon ? `${data.addonDays} ${t('bl§kun')} (${dateStr(new Date().toISOString())} – ${dateStr(data.addonUntil)})` : `${periodLabel(months)} (${t('bl§boshlanishi')} ${dateStr(startIso)})`
  const msgText = `${t('bl§Assalomu alaykum! To\'lov qildim')}: ${modeLabel}, ${p.name}, ${users} ${t('bl§foydalanuvchi')}, ${termText}, ${fmt(total)} ${t("bl§so'm")}. ${t("bl§O'rnatish ID")}: ${data.installId}`
  const tgUrl = data.payment.telegram ? `https://t.me/${data.payment.telegram}?text=${encodeURIComponent(msgText)}` : ''
  const canPay = total > 0

  const copy = async (text) => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* */ } }
  const activate = async () => {
    setBusy(true); setMsg(null)
    try { await billingService.activate(code.trim()); setCode(''); setMsg({ ok: true, text: t('bl§Obuna faollashtirildi') }); reload() }
    catch (e) { setMsg({ ok: false, text: e?.message || t('bl§Kod qabul qilinmadi') }) }
    finally { setBusy(false) }
  }

  return (
    <div className="ac-bl">
      <h2>{t("Hisob va to'lov")}</h2>

      <div className={`ac-bl__card ac-bl__status ac-bl__status--${st}`}>
        <div><b>{statusText}</b>{data.planName && st !== 'trial' ? ` · ${data.planName}` : ''}</div>
        <div className="ac-bl__muted">
          {st === 'trial' && `${t('bl§Sinov tugashiga')} ${Math.max(0, data.daysLeft)} ${t('bl§kun qoldi')} · ${t('bl§Foydalanuvchilar')}: ${data.activeUsers}/${data.users}`}
          {st === 'active' && `${t('bl§Tugash sanasi')}: ${dateStr(data.endsAt)} (${Math.max(0, data.daysLeft)} ${t('bl§kun')}) · ${t('bl§Foydalanuvchilar')}: ${data.activeUsers}/${data.users}`}
          {st === 'grace' && `${t('bl§Tizim')} ${dateStr(data.endsAt)} ${t('bl§gacha ishlaydi, keyin faqat ko\'rish mumkin bo\'ladi')}`}
          {st === 'expired' && t("bl§Ma'lumotlar saqlanadi. Obunani uzaytirsangiz hammasi qayta ochiladi")}
        </div>
        {st === 'active' && data.paidUntil && data.paidUntil !== data.endsAt && <div className="ac-bl__muted">{t("bl§Oldindan to'langan")}: {dateStr(data.paidUntil)} {t('bl§gacha')}</div>}
        {!data.enforced && <div className="ac-bl__muted">{t("bl§Cheklov hozircha o'chiq (ma'lumot uchun)")}</div>}
      </div>

      <LicenseList t={t} title={t('bl§Faol litsenziyalar')} rows={activeLic} />
      <LicenseList t={t} title={t("bl§Oldindan to'langan kelajak davr litsenziyalari (avtomatik faollashadi)")} rows={futureLic} />

      <h3>{t('bl§Tarifni tanlang')}</h3>
      <div className="ac-bl__plans">
        {data.plans.map((x) => (
          <button key={x.key} type="button" className={`ac-bl__plan ${plan === x.key ? 'on' : ''}`} onClick={() => setPlan(x.key)}>
            <div className="ac-bl__plan-name">{x.name}</div>
            <div className="ac-bl__plan-price">{fmt(x.price)} <small>{t("bl§so'm")} / {t('bl§foydalanuvchi')} / {t('bl§oy')}</small></div>
            <div className="ac-bl__muted ac-bl__amo">amoCRM: <s>{fmt(AMO[x.key])}</s></div>
            <ul>{FEATURES[x.key].map((f) => <li key={f}>{t(f)}</li>)}</ul>
          </button>
        ))}
      </div>

      <div className="ac-bl__card ac-bl__calc">
        <div className="ac-bl__modes">
          {MODES.map(([k, l]) => <button key={k} type="button" className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{t(l)}</button>)}
        </div>
        <div className="ac-bl__muted">
          {mode === 'renew' && t("bl§Tanlangan tarifdagi litsenziya oxiridan davom etadi; oldindan to'langan davr vaqti kelganda avtomatik faollashadi")}
          {mode === 'addon' && t("bl§Qo'shimcha foydalanuvchilar bugundan joriy faol muddat oxirigacha; narx qolgan kunlarga proporsional")}
          {mode === 'new' && t("bl§Bugundan boshlanadigan to'liq davr (boshqa tarif yoki alohida litsenziya)")}
        </div>
        <label>{t('bl§Foydalanuvchilar soni')}
          <input className="ac-input" type="number" min="1" max="1000" value={users} onChange={(e) => setUsers(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))} />
        </label>
        {!isAddon && (
          <div className="ac-bl__periods">
            {data.periods.map((m) => {
              const qq = p.quotes.find((x) => x.months === m)
              return (
                <button key={m} type="button" className={`ac-bl__period ${months === m ? 'on' : ''}`} onClick={() => setMonths(m)}>
                  <b>{periodLabel(m)}</b>
                  {qq.giftMonths > 0 ? <small>{qq.giftMonths} {t('bl§oy sovg\'a')}</small> : <small>{m === data.minMonths ? t('bl§eng kam davr') : ' '}</small>}
                </button>
              )
            })}
          </div>
        )}
        {isAddon && !aq && <div className="ac-bl__err">{t("bl§Faol litsenziya yo'q — avval obunani uzaytiring yoki yangi litsenziya oling")}</div>}
        {isAddon && aq && (
          <div className="ac-bl__muted">
            {t('bl§Qolgan muddat')}: <b>{aq.days} {t('bl§kun')}</b> ({dateStr(new Date().toISOString())} – {dateStr(aq.until)}) × {fmt(aq.daily)} {t("bl§so'm")} / {t('bl§kun')} × {users} {t('bl§foydalanuvchi')}
          </div>
        )}
        {!isAddon && <div className="ac-bl__muted">{t('bl§Davr boshlanishi')}: {dateStr(startIso)}</div>}
        <div className="ac-bl__total">
          <span>{t('bl§Jami')}</span>
          <b>{fmt(total)} {t("bl§so'm")}</b>
          {!isAddon && <span className="ac-bl__muted">({fmt(total / months / users)} {t("bl§so'm")} / {t('bl§foydalanuvchi')} / {t('bl§oy')}) · amoCRM: {fmt(amoTotal)} {t("bl§so'm")}</span>}
        </div>
      </div>

      <h3>{t("bl§To'lov")}</h3>
      <ol className="ac-bl__steps">
        <li>
          {t("bl§Quyidagi kartaga")} <b>{fmt(total)} {t("bl§so'm")}</b> {t("bl§o'tkazing")}:
          {data.payment.card
            ? <div className="ac-bl__card ac-bl__pay"><span className="ac-bl__cardno">{data.payment.card}</span>{data.payment.holder && <span className="ac-bl__muted">{data.payment.holder}</span>}
                <button type="button" className="ac-btn" onClick={() => copy(data.payment.card.replace(/\s/g, ''))}>{copied ? t('bl§Nusxalandi') : t('bl§Nusxalash')}</button></div>
            : <div className="ac-bl__muted">{t("bl§Karta raqami hali sozlanmagan (serverda BILLING_CARD_NUMBER)")}</div>}
        </li>
        <li>
          {t("bl§To'lov chekini (skrinshot) Telegramga yuboring")}{data.installId ? <> ({t("bl§O'rnatish ID")}: <b>{data.installId}</b>)</> : null}:{' '}
          {tgUrl && canPay ? <a className="ac-btn ac-btn--blue" href={tgUrl} target="_blank" rel="noreferrer">{t('bl§Telegramga yuborish')}</a> : <span className="ac-bl__muted">{t('bl§Telegram hali sozlanmagan (BILLING_TELEGRAM)')}</span>}
        </li>
        <li>
          {t("bl§To'lov tasdiqlangach sizga kod yuboriladi. Uni shu yerga kiriting")}:
          <div className="ac-bl__code">
            <input className="ac-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="SA1.…" disabled={!isSuper} />
            <button type="button" className="ac-btn ac-btn--blue" disabled={!isSuper || busy || !code.trim()} onClick={activate}>{t('bl§Faollashtirish')}</button>
          </div>
          {!isSuper && <div className="ac-bl__muted">{t('bl§Kodni faqat super admin kiritadi')}</div>}
          {msg && <div className={msg.ok ? 'ac-bl__ok' : 'ac-bl__err'}>{msg.text}</div>}
        </li>
      </ol>

      {data.history.length > 0 && (
        <>
          <h3>{t("bl§To'lovlar tarixi")}</h3>
          <table className="ac-bl__hist">
            <tbody>
              {data.history.map((h) => (
                <tr key={h.id}>
                  <td>{dateStr(h.at)}</td><td>{t(MODES.find(([k]) => k === (h.type || 'renew'))?.[1] || 'bl§Uzaytirish')}</td><td>{h.planName || h.plan}</td><td>{h.users} {t('bl§foydalanuvchi')}</td>
                  <td>{h.from && h.until ? `${dateStr(h.from)} – ${dateStr(h.until)}` : periodLabel(h.months)}</td>
                  <td className="ac-bl__amount">{typeof h.amount === 'number' ? `${fmt(h.amount)} ${t("bl§so'm")}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
