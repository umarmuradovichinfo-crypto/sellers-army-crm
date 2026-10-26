// OnlinePBX bo'limlari: stansiya serveri (Asterisk) ulangach to'liq ishlaydiganlari va oddiy ma'lumot sahifalari.
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { useApi } from '../../lib/useApi'
import { crmService } from '../../services/crm.service'
import { billingService } from '../../services/billing.service'
import { pbxService } from '../../services/pbx.service'
import { AtsLayout } from './PbxShell'

function Page({ title, children, narrow = true }) {
  return <div className="pbxx__page" style={narrow ? { maxWidth: 760 } : undefined}><h2 className="pbxx__title">{title}</h2>{children}</div>
}

/** Stansiya serveri talab qiladigan servis: tavsif va holat (hozircha ulanmagan). */
export function ServiceInfo({ title, text, items = [] }) {
  const t = useT()
  return (
    <Page title={t(title)}>
      <p className="pbxx__text">{t(text)}</p>
      {items.length > 0 && <ul className="pbxx__list">{items.map((i) => <li key={i}>{t(i)}</li>)}</ul>}
      <div className="pbxx__note">{t("pbx§Bu imkoniyat stansiya serveri (Asterisk) ulangach ishga tushadi. Sozlamalar tayyorlanmoqda.")}</div>
    </Page>
  )
}

export function PbxHome() {
  const t = useT()
  const today = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10)
  const { data } = useApi(() => crmService.callsReport({ from: today, to: today }).catch(() => null), [], 'pbx-home-today', 30000)
  const stats = useApi(() => crmService.callsStats({}).catch(() => null), [], 'pbx-home-stats', 60000)
  const bill = useApi(() => billingService.status().catch(() => null), [], 'billing:status', 600000)
  const tiles = data?.tiles || {}
  const tot = data?.totals || { count: 0, talkSec: 0 }
  const series = stats.data?.series || []
  const max = Math.max(1, ...series.map((d) => d.in + d.out + d.internal))
  const services = [['/pbx/services/tts', 'pbx§Ovoz sintezi va audio fayllar', 'M2 3h12v8H2zM5 14h6'], ['/pbx/services/ai', 'pbx§AI-menejer', 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM6 7h.01M10 7h.01M6 10c1 1 3 1 4 0'], ['/pbx/integration', 'pbx§Integratsiya', 'M3 3h10v10H3zM6 6h4v4H6z'], ['/pbx/reports', 'pbx§Analitika', 'M8 2a6 6 0 1 0 6 6H8z'], ['/pbx/chats', 'pbx§Chatlar', 'M2 3h12v8H6l-3 3v-3H2z'], ['/pbx/services/quality', 'pbx§Sifat bahosi', 'M3 2l2.5 3-1.2 1.6a6 6 0 0 0 3.1 3.1L9 8.5l3 2.5-1.2 1.6C6 13 2 9 2 4z'], ['/pbx/services/informer', 'pbx§Avtoinformator', 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM6.5 5.5v5l4-2.5z']]
  const actions = [['/pbx/ats/incoming', "pbx§Virtual raqam ulash"], ['/settings/users', "pbx§Foydalanuvchi qo'shish"], ['/pbx/integration', "pbx§CRM bilan integratsiyani sozlash"], ['/contacts', "pbx§«Mijozlar» bo'limiga o'tish"]]
  const kb = [['/pbx/ats/incoming', 'pbx§ATS qanday sozlanadi'], ['/settings/billing', "pbx§Xizmat to'lovi"], ['/pbx/integration', 'pbx§Yana…']]
  return (
    <div className="pbxh">
      <div className="pbxh__top">
        <div className="pbxh__card">
          <h4>{t('pbx§Obuna')}</h4>
          <p>{bill.data?.status === 'trial' ? t('pbx§Sinov davri') : bill.data?.status === 'expired' ? t('pbx§Tugagan') : t('pbx§Faol')}{bill.data?.daysLeft != null ? ` · ${Math.max(0, bill.data.daysLeft)} ${t('pbx§kun')}` : ''}</p>
          <Link className="pbxh__btn" to="/settings/billing">{t("pbx§Hisob va to'lov")}</Link>
        </div>
        <div className="pbxh__card pbxh__card--peach"><h4>{t("pbx§Bugun: qo'ng'iroqlar")}</h4><b>{tot.count}</b><span>{t("pbx§O'tkazib yuborilgan")}: {tiles.missed ?? 0}</span></div>
        <div className="pbxh__card pbxh__card--lav"><h4>{t('pbx§Suhbat, daqiqa')}</h4><b>{Math.round((tot.talkSec || 0) / 60)}</b><span>{t('pbx§Kiruvchi')}: {tiles.in ?? 0} · {t('pbx§Chiquvchi')}: {tiles.out ?? 0}</span></div>
        <div className="pbxh__card"><h4>{t('pbx§Yangiliklar')}</h4><p>{t("pbx§Telefoniya bo'limi CRM ichiga ko'chirildi: ATS sozlamalari, qo'ng'iroqlar jurnali, hisobotlar, callback va avto-qayta qo'ng'iroq.")}</p></div>
      </div>
      <div className="pbxh__grid">
        <div className="pbxh__card pbxh__services">
          <h3>{t('pbx§Servislar')}</h3>
          {services.map(([to, l, d], i) => <Link key={to} to={to} className={i === 0 ? 'on' : ''}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>{t(l)}</Link>)}
        </div>
        <div className="pbxh__card pbxh__chart">
          <h4>{t("pbx§Qo'ng'iroqlar soni (tur bo'yicha)")}</h4>
          <div className="ac-cr__bars">
            {series.map((d) => (
              <div key={d.day} className="ac-cr__bar" title={`${d.day}: ${d.in}/${d.out}/${d.internal}`}>
                <div className="ac-cr__stack" style={{ height: 200 }}><i style={{ height: `${(d.in / max) * 100}%`, background: '#01c716' }} /><i style={{ height: `${(d.out / max) * 100}%`, background: '#0d71d7' }} /><i style={{ height: `${(d.internal / max) * 100}%`, background: '#adaabc' }} /></div>
                <span>{d.day.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="pbxh__side">
          <div className="pbxh__card"><h3>{t('pbx§Amallar')}</h3>{actions.map(([to, l]) => <Link key={l} to={to}>{t(l)}</Link>)}</div>
          <div className="pbxh__card"><h3>{t('pbx§Bilimlar bazasi')}</h3>{kb.map(([to, l]) => <Link key={l} to={to}>{t(l)}</Link>)}</div>
        </div>
      </div>
    </div>
  )
}

export function PbxStatistic() {
  const t = useT()
  const { data } = useApi(() => crmService.callsStats({}).catch(() => null), [], 'pbx-statistic', 60000)
  const series = data?.series || []
  const max = Math.max(1, ...series.map((d) => d.in + d.out + d.internal))
  return (
    <Page title={t("pbx§Qo'ng'iroqlar soni (tur bo'yicha)")} narrow={false}>
      {!data && <div className="pbxx__text">{t('Yuklanmoqda…')}</div>}
      <div className="ac-cr__bars">
        {series.map((d) => (
          <div key={d.day} className="ac-cr__bar" title={`${d.day}: ${d.in}/${d.out}/${d.internal}`}>
            <div className="ac-cr__stack" style={{ height: 160 }}>
              <i style={{ height: `${(d.in / max) * 100}%`, background: '#01c716' }} /><i style={{ height: `${(d.out / max) * 100}%`, background: '#0d71d7' }} /><i style={{ height: `${(d.internal / max) * 100}%`, background: '#adaabc' }} /><i style={{ height: `${(d.missed / max) * 100}%`, background: '#fb6a6e' }} />
            </div>
            <span>{d.day.slice(5)}</span>
          </div>
        ))}
      </div>
      <div className="ac-cr__legend">{[['#01c716', 'pbx§Kiruvchi'], ['#0d71d7', 'pbx§Chiquvchi'], ['#adaabc', 'pbx§Ichki'], ['#fb6a6e', "pbx§O'tkazib yuborilgan"]].map(([c, l]) => <span key={l}><i style={{ background: c }} />{t(l)}</span>)}</div>
    </Page>
  )
}

export function PbxChats() {
  const t = useT()
  return (
    <Page title={t('pbx§Chatlar')}>
      <p className="pbxx__text">{t("pbx§Telegram va boshqa chatlar CRM ichidagi imBox bo'limida ishlaydi: mijozlar bilan yozishma, bot, tezkor javoblar shu yerda.")}</p>
      <Link className="pbxx__btn" to="/inbox">{t("pbx§imBox'ga o'tish")}</Link>
    </Page>
  )
}

export function PbxIntegration() {
  const t = useT()
  const { data } = useApi(() => crmService.getPbxConfig().catch(() => null), [], 'pbx-config')
  const rows = [
    ['pbx§CRM', 'pbx§Telefoniya shu CRM bilan to\'liq bog\'langan: qo\'ng\'iroq jurnali, mijoz kartochkasi, bosib qo\'ng\'iroq qilish, kiruvchi oyna.', 'pbx§Faol'],
    ['pbx§Webhooks', data?.webhookUrl ? `${t('pbx§Hodisalar manzili')}: ${data.webhookUrl.replace(/secret=.*/, 'secret=•••')}` : t('pbx§Hodisalarni boshqa tizimlarga yuborish'), data?.enabled ? 'pbx§Faol' : 'pbx§Sozlanmagan'],
    ['pbx§API', "pbx§Telefoniya ma'lumotlarini boshqa tizimlarga berish uchun API", 'pbx§Tayyorlanmoqda'],
  ]
  return (
    <Page title={t('pbx§Integratsiya')}>
      {rows.map(([n, d, s]) => <div key={n} className="pbxx__int"><b>{t(n)}</b><span>{t(d)}</span><em>{t(s)}</em></div>)}
    </Page>
  )
}

export function PbxLicense() {
  const t = useT()
  return (
    <Page title={t("pbx§Litsenziya va to'lov")}>
      <p className="pbxx__text">{t("pbx§Telefoniya obunasi CRM obunasiga kiradi. Tarif, foydalanuvchilar soni va to'lov «Hisob va to'lov» bo'limida boshqariladi.")}</p>
      <Link className="pbxx__btn" to="/settings/billing">{t("pbx§Hisob va to'lov")}</Link>
    </Page>
  )
}

export function PbxConfigurator() {
  const t = useT()
  const DEVICES = [['yealink', 'Yealink SIP-Txx/W52P', 'pbx§Yealink T-seriyali stol telefonlari (T18, T19, T20, T21…) va W52P simsiz telefon uchun.', '001110002001'], ['panasonic500', 'Panasonic KX-TGP500', 'pbx§Panasonic KX-TGP500 simsiz SIP-telefon uchun.', '001110002001'], ['panasonic600', 'Panasonic KX-TGP600', 'pbx§Panasonic KX-TGP600 simsiz SIP-telefon uchun.', '001110002001'], ['cisco', 'Cisco/Linksys/Sipura', 'pbx§Cisco/Linksys/Sipura qurilmalari uchun.', '001110002001'], ['phonerlite', 'PhonerLite', 'pbx§PhonerLite dasturiy telefoni uchun (bitta liniya).', '']]
  const { data } = useApi(() => pbxService.modules('user'), [], 'pbx:cfg-users')
  const [device, setDevice] = useState('yealink')
  const [mac, setMac] = useState('')
  const [lines, setLines] = useState(['', '', '', '', ''])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const users = data?.modules || []
  const cur = DEVICES.find((d) => d[0] === device)
  const count = device === 'phonerlite' ? 1 : 5
  const ready = (device === 'phonerlite' || mac.trim()) && lines.slice(0, count).some(Boolean)
  const go = async () => {
    setErr(''); setBusy(true)
    try {
      const f = await pbxService.deviceConfig({ device, mac, lines: lines.slice(0, count).filter(Boolean).map((ext) => ({ ext })) })
      const url = URL.createObjectURL(new Blob([f.content], { type: f.mime || 'text/plain' }))
      const a = document.createElement('a'); a.href = url; a.download = f.filename; a.click(); URL.revokeObjectURL(url)
    } catch (e) { setErr(e?.message || t("pbx§Tayyorlab bo'lmadi")) } finally { setBusy(false) }
  }
  const extra = (
    <div className="pbxx__devs2">
      <b>{t('pbx§QURILMALAR')}</b>
      {DEVICES.map(([k, l]) => <button key={k} type="button" className={device === k ? 'on' : ''} onClick={() => setDevice(k)}>{l}</button>)}
    </div>
  )
  return (
    <AtsLayout extra={extra}>
      <div className="pbxm">
        <div className="pbxm__card pbxm__card--cfg">
          <h3>{cur[1]}</h3>
          {device !== 'phonerlite' && <div className="pbxm__row"><span>{t('pbx§Qurilma MAC-adresi')}</span><input className="ac-input" value={mac} placeholder={cur[3]} onChange={(e) => setMac(e.target.value)} /></div>}
          <div className="pbxm__thead"><span>{t('pbx§Liniya')}</span><span>{t('pbx§Foydalanuvchi')}</span></div>
          {lines.slice(0, count).map((v, i) => (
            <div key={i} className="pbxm__line"><span>{i + 1}</span>
              <select className="ac-select" value={v} onChange={(e) => setLines(lines.map((x, j) => (j === i ? e.target.value : x)))}>
                <option value="">{t('pbx§Foydalanuvchi')} {i + 1}</option>
                {users.map((u) => <option key={u.id} value={u.number}>{u.number}{u.name ? ` — ${u.name}` : ''}</option>)}
              </select></div>
          ))}
          <p className="pbxm__hint">{t(cur[2])}</p>
          {err && <div className="ac-pbx__err">{err}</div>}
          <button type="button" className="pbxm__wide" disabled={!ready || busy} onClick={go}>{t('pbx§Konfiguratsiyani tayyorlash')}</button>
        </div>
      </div>
    </AtsLayout>
  )
}
