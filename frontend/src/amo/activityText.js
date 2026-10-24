// Server yozgan voqea matnlari (o'zbekcha) — interfeys tilida ko'rsatish: ma'lum boshlanishlar t() orqali,
// maydon o'zgarishlari esa data'dan («Maydon»: oldin → keyin) quriladi.
const PREFIXES = [
  'Saralanmagandan qabul qilindi', 'Suhbat yopildi', 'Kontakt biriktirildi', 'Kontakt uzildi', "Mas'ul (ommaviy)", "Mas'ul",
  'Teglar', 'Formadan keldi', 'Avtomatlashtirish', 'Dublikat', 'Vazifalar yakunlandi', 'Lid yaratildi', 'Yo\'qotildi', 'Sotuv yopildi',
]

export function trActivity(text, t, data) {
  if (data && data.label && ('from' in data || 'to' in data)) {
    return `«${t(data.label)}»: ${data.from || '—'} → ${data.to || '—'}`
  }
  let s = String(text || '')
  const dup = s.match(/^(\d+) ta dublikat birlashtirildi$/)
  if (dup) return `${t('Birlashtirilgan dublikatlar')}: ${dup[1]}`
  for (const p of PREFIXES) {
    if (s.startsWith(p)) return t(p) + s.slice(p.length)
  }
  return s
}
