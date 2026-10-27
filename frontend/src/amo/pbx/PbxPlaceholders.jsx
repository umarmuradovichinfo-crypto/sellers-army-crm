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
  const [tab, setTab] = useState('desc')
  return (
    <div className="pbxs__page">
      <h3 className="pbxs__title">{t(title)}</h3>
      <div className="pbxs__tabs">
        {[['set', 'pbx§Sozlamalar'], ['desc', 'pbx§Tavsif'], ['rep', 'pbx§Hisobotlar']].map(([k, l]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(l)}</button>)}
      </div>
      {tab === 'desc' ? (
        <div className="pbxs__body">
          <p>{t(text)}</p>
          {items.length > 0 && <ul>{items.map((i) => <li key={i}>{t(i)}</li>)}</ul>}
          <p className="pbxs__soon">{t("pbx§Bu imkoniyat stansiya serveri (Asterisk) ulangach ishga tushadi. Sozlamalar tayyorlanmoqda.")}</p>
        </div>
      ) : <div className="pbxs__body"><p className="pbxs__soon">{t("pbx§Bu imkoniyat stansiya serveri (Asterisk) ulangach ishga tushadi. Sozlamalar tayyorlanmoqda.")}</p></div>}
    </div>
  )
}

export function PbxRecord() {
  const t = useT()
  const { data: rec, setData: setRec } = useApi(() => pbxService.recording().catch(() => null), [], 'pbx:recording')
  const on = rec ? rec.enabled !== false : true
  const toggle = async () => { try { setRec(await pbxService.saveRecording({ enabled: !on })) } catch { /* */ } }
  return (
    <div className="pbxr">
      <Link className="pbxr__help" to="/pbx/calls">{t('pbx§Yozuv qanday yoqiladi?')}</Link>
      <div className="pbxr__cards">
        <div className="pbxr__card">
          <h4>{t('pbx§Suhbatlarni yozib olish')}<button type="button" className={`pbxr__sw${on ? '' : ' off'}`} onClick={toggle} aria-pressed={on} title={on ? t('pbx§Yozuv yoqilgan') : t('pbx§Yozuv o\'chiq')} /></h4>
          <p>{t("pbx§Yozuvlarni qo'ng'iroqlar jurnalidan")} <Link to="/pbx/calls">{t('pbx§tinglash')}</Link> {t('pbx§mumkin. Stansiya serveri ulangach yozuv avtomatik yoqiladi.')}</p>
          <Link className="pbxr__btn" to="/pbx/license">{t('pbx§Litsenziyani uzaytirish')}</Link>
        </div>
        <div className="pbxr__card">
          <h4>{t('pbx§Stereoyozuv')}</h4>
          <p>{t("pbx§Stereoyozuv ovoz sifatini oshiradi va nutq tahlili xizmatlaridan foydalanish imkonini beradi.")}</p>
          <span className="pbxr__btn pbxr__btn--off">{t('pbx§Tez orada')}</span>
        </div>
      </div>
    </div>
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
          <div className="pbxh__chead"><h4>{t("pbx§Qo'ng'iroqlar soni (tur bo'yicha)")}</h4><Link to="/pbx/reports">{t('pbx§Hisobotlar')}</Link></div>
          {series.length > 0 && <LineChart series={series} />}
          <div className="pbxst__legend">{LINES.map(([k, c, l]) => <span key={k}><i style={{ background: c }} />{t(l)}</span>)}</div>
        </div>
        <div className="pbxh__side">
          <div className="pbxh__card"><h3>{t('pbx§Amallar')}</h3>{actions.map(([to, l]) => <Link key={l} to={to}>{t(l)}</Link>)}</div>
          <div className="pbxh__card"><h3>{t('pbx§Bilimlar bazasi')}</h3>{kb.map(([to, l]) => <Link key={l} to={to}>{t(l)}</Link>)}</div>
        </div>
      </div>
    </div>
  )
}

const LINES = [['in', '#01c716', 'pbx§Kiruvchi'], ['out', '#0d71d7', 'pbx§Chiquvchi'], ['internal', '#8d84b0', 'pbx§Ichki'], ['missed', '#e8383d', "pbx§O'tkazib yuborilgan"]]

/** Silliq chiziqli grafik (OnlinePBX /statistic). */
function LineChart({ series }) {
  const W = 1000, H = 330, L = 40, B = 30, T = 10
  const max = Math.max(5, ...series.flatMap((d) => LINES.map(([k]) => d[k] || 0)))
  const step = Math.ceil(max / 5)
  const top = step * 5
  const x = (i) => L + (series.length < 2 ? (W - L) / 2 : (i * (W - L - 10)) / (series.length - 1))
  const y = (v) => T + (H - T - B) * (1 - v / top)
  const path = (k) => series.map((d, i) => [x(i), y(d[k] || 0)]).reduce((acc, [px, py], i, arr) => {
    if (i === 0) return `M${px},${py}`
    const [qx, qy] = arr[i - 1]; const cx = (qx + px) / 2
    return `${acc} C${cx},${qy} ${cx},${py} ${px},${py}`
  }, '')
  return (
    <svg viewBox={`0 0 ${W} ${H}`}>
      {[0, 1, 2, 3, 4, 5].map((n) => <g key={n}><line x1={L} x2={W} y1={y(n * step)} y2={y(n * step)} stroke="#efeef5" /><text x={L - 8} y={y(n * step) + 4} textAnchor="end">{n * step}</text></g>)}
      {series.map((d, i) => (i % Math.ceil(series.length / 8) === 0 ? <text key={d.day} x={x(i)} y={H - 8} textAnchor="middle">{d.day.slice(5).split('-').reverse().join('.')}</text> : null))}
      {LINES.map(([k, c]) => <path key={k} d={path(k)} fill="none" stroke={c} strokeWidth="2" />)}
    </svg>
  )
}

export function PbxStatistic() {
  const t = useT()
  const { data } = useApi(() => crmService.callsStats({}).catch(() => null), [], 'pbx-statistic', 60000)
  const series = data?.series || []
  return (
    <TopTabs first="pbx§Statistika" desc={["pbx§Statistika — qo'ng'iroqlarni mustaqil tahlil qilish uchun qulay vosita.", "pbx§Bu bo'limda noyob qo'ng'iroqlar sonini xodim, raqam, davomiylik va boshqa parametrlar bo'yicha ko'rish mumkin."]}>
    <div className="pbxst">
      <div className="pbxst__head"><h3>{t('pbx§Statistika')}</h3><span>{t("pbx§Qo'ng'iroqlar soni (tur bo'yicha)")}</span></div>
      {series.length > 0 && <LineChart series={series} />}
      <div className="pbxst__legend">{LINES.map(([k, c, l]) => <span key={k}><i style={{ background: c }} />{t(l)}</span>)}</div>
    </div>
    </TopTabs>
  )
}

/** Yuqori tablar (OnlinePBX /statistic, /reports): birinchi tab — ishchi ko'rinish, ikkinchisi — tavsif. */
export function TopTabs({ first, desc, children }) {
  const t = useT()
  const [tab, setTab] = useState('main')
  return (
    <div className="pbxt">
      <div className="pbxt__tabs">
        <button type="button" className={tab === 'main' ? 'on' : ''} onClick={() => setTab('main')}>{t(first)}</button>
        <button type="button" className={tab === 'desc' ? 'on' : ''} onClick={() => setTab('desc')}>{t('pbx§Tavsif')}</button>
      </div>
      {tab === 'main' ? children : <div className="pbxt__desc">{desc.map((p) => <p key={p}>{t(p)}</p>)}</div>}
    </div>
  )
}

export function PbxChats() {
  const t = useT()
  const [tab, setTab] = useState('desc')
  return (
    <div className="pbxs pbxs--chats">
      <aside className="pbxs__aside"><a className="on">Telegram</a><a>WhatsApp</a></aside>
      <div className="pbxs__main">
        <div className="pbxs__page">
          <h3 className="pbxs__title">{t('pbx§Chatlar')}</h3>
          <div className="pbxs__tabs">
            {[['desc', 'pbx§Tavsif'], ['set', 'pbx§Sozlamalar']].map(([k, l]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(l)}</button>)}
          </div>
          <div className="pbxs__body">
            <p>{t("pbx§Telegram va boshqa chatlar CRM ichidagi imBox bo'limida ishlaydi: mijozlar bilan yozishma, bot, tezkor javoblar shu yerda.")}</p>
            <Link className="pbxx__btn" to="/inbox">{t("pbx§imBox'ga o'tish")}</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export function PbxIntegration() {
  const t = useT()
  const { data } = useApi(() => crmService.getPbxConfig().catch(() => null), [], 'pbx-config')
  const groups = [
    ['pbx§CRM', [['CRM', '#4d7cff', "pbx§Shu CRM bilan to'liq bog'langan: qo'ng'iroq jurnali, mijoz kartochkasi, kiruvchi oyna", 'pbx§Faol'], ['amoCRM', '#33a8ff', "pbx§Qo'ng'iroqlar amoCRM'dan: bosib qo'ng'iroq qilish", 'pbx§Tayyorlanmoqda'], ['Kommo', '#1c1c2b', "pbx§Xalqaro loyihalar uchun amoCRM analogi", 'pbx§Tayyorlanmoqda'], ['Bitrix24', '#4ec3e0', "pbx§Bitrix24 kabinetidan bosib qo'ng'iroq qilish", 'pbx§Tayyorlanmoqda'], ['YClients', '#f7b500', "pbx§YClients kabinetidan bosib qo'ng'iroq qilish", 'pbx§Tayyorlanmoqda']]],
    ['pbx§Nutq tahlili', [['TQM', '#7a5cc7', "pbx§Biznes muloqotini yaxshiroq tahlil qilish vositalari", 'pbx§Tayyorlanmoqda'], ['pbx§Qo\'ng\'iroq transkripsiyasi', '#f2b24c', "pbx§Qo'ng'iroqni avtomatik matnga aylantirish", 'pbx§Tayyorlanmoqda']]],
    ['pbx§Dasturchilar uchun', [['Webhooks', '#8b6dbb', data?.webhookUrl ? `${t('pbx§Hodisalar manzili')}: ${data.webhookUrl.replace(/secret=.*/, 'secret=•••')}` : 'pbx§Hodisalarni boshqa tizimlarga yuborish', data?.enabled ? 'pbx§Faol' : 'pbx§Sozlanmagan'], ['API', '#17b890', "pbx§Telefoniya ma'lumotlarini boshqa tizimlarga berish uchun API", 'pbx§Tayyorlanmoqda']]],
  ]
  return (
    <div className="pbxg">
      <h3 className="pbxg__title">{t('pbx§Integratsiya')}</h3>
      {groups.map(([g, items]) => (
        <section key={g}>
          <h5>{t(g)}</h5>
          <div className="pbxg__grid">
            {items.map(([n, c, d, st]) => (
              <div key={n} className="pbxg__card">
                <i style={{ background: c }}>{n.replace(/^pbx§/, '')[0]}</i>
                <div><b>{n.startsWith('pbx§') ? t(n) : n}</b><span>{d.startsWith('pbx§') ? t(d) : d}</span><em>{t(st)}</em></div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export function PbxLicense() {
  const t = useT()
  const [tab, setTab] = useState('lic')
  const { data: b } = useApi(() => billingService.status().catch(() => null), [], 'billing:status', 600000)
  const fmt = (d) => (d ? new Date(d).toLocaleDateString('ru-RU') : '—')
  const left = b?.daysLeft != null ? Math.max(0, b.daysLeft) : null
  const rows = b ? [[t('pbx§Platformaga kirish'), `${b.planName || t('pbx§Sinov davri')}`], [t('pbx§Foydalanuvchilar'), `${b.activeUsers ?? 0} / ${b.users ?? '—'}`]] : []
  return (
    <div className="pbxl">
      <div className="pbxl__main">
        <div className="pbxl__tabs">
          {[['pay', "pbx§To'lov"], ['lic', 'pbx§Litsenziyalar'], ['hist', "pbx§To'lovlar tarixi"], ['help', 'pbx§Yordam']].map(([k, l]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(l)}</button>)}
        </div>
        {tab === 'lic' && (
          <>
            <h6>{t('pbx§Faol litsenziyalar')}</h6>
            {b && rows.map(([n, v]) => (
              <div key={n} className="pbxl__row"><b>{n}</b><span>{v}</span><em>{b.endsAt ? `${t('pbx§gacha')} ${fmt(b.endsAt)}${left != null ? ` (${left} ${t('pbx§kun')})` : ''}` : ''}</em></div>
            ))}
            <Link className="pbxl__btn" to="/settings/billing">{t("pbx§Tanlangan litsenziyalarni uzaytirish")}</Link>
          </>
        )}
        {tab === 'hist' && (b?.history?.length ? b.history.map((h, i) => <div key={i} className="pbxl__row"><b>{h.planName}</b><span>{h.users} · {h.months} {t('pbx§oy')}</span><em>{fmt(h.at || h.date)}</em></div>) : <p className="pbxl__empty">{t("pbx§To'lovlar tarixi bo'sh")}</p>)}
        {(tab === 'pay' || tab === 'help') && <p className="pbxl__empty">{t("pbx§Tarif, foydalanuvchilar soni va to'lov «Hisob va to'lov» bo'limida boshqariladi.")} <Link to="/settings/billing">{t("pbx§Hisob va to'lov")}</Link></p>}
      </div>
      <aside className="pbxl__side">
        <h5>{t('pbx§Ma\'lumotnoma')}</h5>
        <Link to="/settings/billing">{t("pbx§Qanday to'lash mumkin")}</Link>
        <h5>{t('pbx§Kontaktlar')}</h5>
        <p>{t("pbx§To'lov masalalari bo'yicha")}: Telegram @UmarMuradovich</p>
      </aside>
    </div>
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
