// OnlinePBX bo'limlari: stansiya serveri (Asterisk) ulangach to'liq ishlaydiganlari va oddiy ma'lumot sahifalari.
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { useApi } from '../../lib/useApi'
import { crmService } from '../../services/crm.service'
import { pbxService } from '../../services/pbx.service'

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
  const tiles = data?.tiles || {}
  const tot = data?.totals || { count: 0, talkSec: 0 }
  const links = [
    ['/pbx/ats/incoming', 'pbx§Kiruvchi qo\'ng\'iroqlar sozlamasi'], ['/pbx/calls', "pbx§Qo'ng'iroqlar jurnali"], ['/pbx/reports', 'pbx§Hisobotlar'],
    ['/pbx/services/callback', 'pbx§Callback vidjeti'], ['/pbx/services/autorecall', "pbx§Avto-qayta qo'ng'iroq"], ['/pbx/ats/blacklist', "pbx§Qora ro'yxat"],
  ]
  return (
    <Page title={t('pbx§Bosh sahifa')} narrow={false}>
      <div className="pbxx__cards">
        <div className="pbxx__card"><span>{t("pbx§Bugun: qo'ng'iroqlar")}</span><b>{tot.count}</b></div>
        <div className="pbxx__card"><span>{t('pbx§Kiruvchi')}</span><b>{tiles.in ?? 0}</b></div>
        <div className="pbxx__card"><span>{t('pbx§Chiquvchi')}</span><b>{tiles.out ?? 0}</b></div>
        <div className="pbxx__card pbxx__card--bad"><span>{t("pbx§O'tkazib yuborilgan")}</span><b>{tiles.missed ?? 0}</b></div>
        <div className="pbxx__card"><span>{t('pbx§Suhbat, daqiqa')}</span><b>{Math.round((tot.talkSec || 0) / 60)}</b></div>
      </div>
      <h3 className="pbxx__sub">{t('pbx§Tezkor amallar')}</h3>
      <div className="pbxx__quick">{links.map(([to, l]) => <Link key={to} to={to}>{t(l)}</Link>)}</div>
    </Page>
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
  const DEVICES = [['yealink', 'Yealink SIP-Txx/W52P'], ['panasonic600', 'Panasonic KX-TGP600'], ['panasonic500', 'Panasonic KX-TGP500'], ['cisco', 'Cisco/Linksys/Sipura'], ['phonerlite', 'PhonerLite']]
  const { data } = useApi(() => pbxService.modules('user'), [], 'pbx:cfg-users')
  const [device, setDevice] = useState('yealink')
  const [mac, setMac] = useState('')
  const [lines, setLines] = useState(['', '', '', '', ''])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const users = data?.modules || []
  const count = device === 'phonerlite' ? 1 : 5
  const go = async () => {
    setErr(''); setBusy(true)
    try {
      const f = await pbxService.deviceConfig({ device, mac, lines: lines.slice(0, count).filter(Boolean).map((ext) => ({ ext })) })
      const url = URL.createObjectURL(new Blob([f.content], { type: f.mime || 'text/plain' }))
      const a = document.createElement('a'); a.href = url; a.download = f.filename; a.click(); URL.revokeObjectURL(url)
    } catch (e) { setErr(e?.message || t('pbx§Tayyorlab bo\'lmadi')) } finally { setBusy(false) }
  }
  return (
    <Page title={t('pbx§Qurilma konfiguratori')}>
      <p className="pbxx__text">{t("pbx§Stol telefonini avtomatik sozlash: qurilma turini va MAC-adresini kiriting, har liniyaga foydalanuvchini tanlang — tayyor konfiguratsiya fayli yuklab olinadi.")}</p>
      <div className="pbxx__devs">{DEVICES.map(([k, l]) => <button key={k} type="button" className={device === k ? 'on' : ''} onClick={() => setDevice(k)}>{l}</button>)}</div>
      {device !== 'phonerlite' && <div className="pbxx__frow"><span>{t('pbx§MAC-adres')}</span><input className="ac-input" value={mac} placeholder="00:15:65:AA:BB:CC" onChange={(e) => setMac(e.target.value)} /></div>}
      {lines.slice(0, count).map((v, i) => (
        <div key={i} className="pbxx__frow"><span>{t('pbx§Liniya')} {i + 1}</span>
          <select className="ac-select" value={v} onChange={(e) => setLines(lines.map((x, j) => (j === i ? e.target.value : x)))}>
            <option value="">—</option>
            {users.map((u) => <option key={u.id} value={u.number}>{u.number}{u.name ? ` — ${u.name}` : ''}</option>)}
          </select></div>
      ))}
      {err && <div className="ac-pbx__err">{err}</div>}
      <button type="button" className="pbxx__btn" disabled={busy} onClick={go}>{t('pbx§Konfiguratsiyani tayyorlash')}</button>
      <div className="pbxx__note">{t("pbx§Fayl qurilma ishlab chiqaruvchisi hujjatlari bo'yicha hosil qilinadi; haqiqiy telefonda hali sinalmagan. Faylda SIP paroli bor — uni begonalarga bermang.")}</div>
    </Page>
  )
}
