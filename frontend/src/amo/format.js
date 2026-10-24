// amoCRM formatlari: summa "12,918,600 so'm", sana "Bugun 12:04" / "Kecha 15:44" / "22.10.2026".

export const CURRENCY = "so'm"

export function money(v) {
  const n = Math.round(Number(v) || 0)
  return n.toLocaleString('en-US') + ' ' + CURRENCY
}

const pad = (n) => String(n).padStart(2, '0')

export function dmy(d) {
  const t = new Date(d)
  return `${pad(t.getDate())}.${pad(t.getMonth() + 1)}.${t.getFullYear()}`
}

export function hm(d) {
  const t = new Date(d)
  return `${pad(t.getHours())}:${pad(t.getMinutes())}`
}

export function relDay(d) {
  if (!d) return ''
  const t = new Date(d)
  const now = new Date()
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (t.toDateString() === now.toDateString()) return 'Bugun'
  if (t.toDateString() === y.toDateString()) return 'Kecha'
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

