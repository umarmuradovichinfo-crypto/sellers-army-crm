// «Hisob va to'lov» (amoCRM «Счет и оплата» kabi): joriy obuna, tarif/foydalanuvchi/davr kalkulyatori,
// qo'lda to'lov (karta + chekni Telegramga) va litsenziya kodini kiritish.
import React, { useState } from 'react'
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

  if (!can('settings.view')) return <div className="ac-bl"><p>{t("bl§Bu bo'limga ruxsat yo'q")}</p></div>
  if (loading && !data) return <div className="ac-bl" />
  if (error && !data) return <div className="ac-bl"><p>{t('bl§Yuklab bo\'lmadi')}</p></div>
  if (!data) return null

  const p = data.plans.find((x) => x.key === plan) || data.plans[0]
  const q = p.quotes.find((x) => x.months === months) || p.quotes[0]
  const total = q.perUserTotal * users
  const amoTotal = AMO[plan] * q.paidMonths * users
  const st = data.status
  const statusText = { trial: t('bl§Sinov davri'), active: t('bl§Faol'), grace: t('bl§Muddat tugadi (qo\'shimcha kunlar)'), expired: t('bl§Obuna tugagan') }[st]
  const periodLabel = (m) => (m < 12 ? `${m} ${t('bl§oy')}` : m === 12 ? `1 ${t('bl§yil')}` : `${m / 12} ${t('bl§yil')}`)
  const msgText = `${t('bl§Assalomu alaykum! To\'lov qildim')}: ${p.name}, ${users} ${t('bl§foydalanuvchi')}, ${periodLabel(months)}, ${fmt(total)} ${t("bl§so'm")}.`
  const tgUrl = data.payment.telegram ? `https://t.me/${data.payment.telegram}?text=${encodeURIComponent(msgText)}` : ''

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
        {!data.enforced && <div className="ac-bl__muted">{t("bl§Cheklov hozircha o'chiq (ma'lumot uchun)")}</div>}
      </div>

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
        <label>{t('bl§Foydalanuvchilar soni')}
          <input className="ac-input" type="number" min="1" max="1000" value={users} onChange={(e) => setUsers(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))} />
        </label>
        <div className="ac-bl__periods">
          {data.periods.map((m) => {
            const qq = p.quotes.find((x) => x.months === m)
            return (
              <button key={m} type="button" className={`ac-bl__period ${months === m ? 'on' : ''}`} onClick={() => setMonths(m)}>
                <b>{periodLabel(m)}</b>
                {qq.giftMonths > 0 ? <small>{qq.giftMonths} {t('bl§oy sovg\'a')}</small> : <small>{m === data.minMonths ? t('bl§eng kam davr') : ' '}</small>}
              </button>
            )
          })}
        </div>
        <div className="ac-bl__total">
          <span>{t('bl§Jami')}</span>
          <b>{fmt(total)} {t("bl§so'm")}</b>
          <span className="ac-bl__muted">({fmt(total / months / users)} {t("bl§so'm")} / {t('bl§foydalanuvchi')} / {t('bl§oy')}) · amoCRM: {fmt(amoTotal)} {t("bl§so'm")}</span>
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
          {tgUrl ? <a className="ac-btn ac-btn--blue" href={tgUrl} target="_blank" rel="noreferrer">{t('bl§Telegramga yuborish')}</a> : <span className="ac-bl__muted">{t('bl§Telegram hali sozlanmagan (BILLING_TELEGRAM)')}</span>}
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
                <tr key={h.id}><td>{dateStr(h.at)}</td><td>{h.planName || h.plan}</td><td>{h.users} {t('bl§foydalanuvchi')}</td><td>{periodLabel(h.months)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
