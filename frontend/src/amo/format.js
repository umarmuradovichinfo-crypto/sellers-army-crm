// amoCRM formatlari: summa "12,918,600 so'm", sana "Bugun 12:04" / "Kecha 15:44" / "22.10.2026".

// Umumiy sozlamalardan keladigan formatlar (AmoShell yuklaydi): vaqt mintaqasi, sana/vaqt formati, valyuta.
const PREFS = { offsetMin: 300, dateFormat: '31.12.2026', h12: false, currency: "so'm" }
const CURRENCY_LABEL = { "O'zbek so'mi": "so'm", 'Rossiya rubli': '₽', 'AQSh dollari': '$', 'Yevro': '€' }

export function setFormatPrefs(g = {}) {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(g.timezone || '')
  if (m) PREFS.offsetMin = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
  if (g.dateFormat) PREFS.dateFormat = g.dateFormat
  if (g.timeFormat) PREFS.h12 = /12/.test(g.timeFormat)
  if (g.currency) PREFS.currency = CURRENCY_LABEL[g.currency] || PREFS.currency
}

export const currency = () => PREFS.currency

export function money(v) {
  const n = Math.round(Number(v) || 0)
  return n.toLocaleString('en-US') + ' ' + PREFS.currency
}

const pad = (n) => String(n).padStart(2, '0')

// Akkaunt mintaqasidagi "devor soati": UTC getterlari bilan o'qiladi
function wall(d) { return new Date(new Date(d).getTime() + PREFS.offsetMin * 60000) }

export function dmy(d) {
  const t = wall(d)
  const D = pad(t.getUTCDate()), M = pad(t.getUTCMonth() + 1), Y = t.getUTCFullYear()
  if (PREFS.dateFormat.startsWith('12/')) return `${M}/${D}/${Y}`
  if (PREFS.dateFormat.startsWith('2026-')) return `${Y}-${M}-${D}`
  return `${D}.${M}.${Y}`
}

export function hm(d) {
  const t = wall(d)
  const h = t.getUTCHours(), mi = pad(t.getUTCMinutes())
  if (!PREFS.h12) return `${pad(h)}:${mi}`
  return `${h % 12 || 12}:${mi} ${h < 12 ? 'AM' : 'PM'}`
}

// Akkaunt mintaqasidagi kun kaliti (YYYY-MM-DD)
export function dayKey(d) { return wall(d).toISOString().slice(0, 10) }

export function relDay(d) {
  if (!d) return ''
  const k = dayKey(d)
  const today = dayKey(Date.now())
  const yest = dayKey(Date.now() - 86400000)
  if (k === today) return 'Bugun'
  if (k === yest) return 'Kecha'
  return null
}

// Kartochkadagi sana: bugun/kecha bo'lsa vaqti bilan, aks holda faqat sana
export function cardDate(d, t = (s) => s) {
  if (!d) return ''
  const r = relDay(d)
  return r ? `${t(r)} ${hm(d)}` : dmy(d)
}

// Lenta (feed) sarlavhasi: "Bugun 12:04" yoki "22.10.2026 12:04"
export function feedDate(d, t = (s) => s) {
  if (!d) return ''
  const r = relDay(d)
  return `${r ? t(r) : dmy(d)} ${hm(d)}`
}

