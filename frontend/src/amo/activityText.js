// Server yozgan voqea matnlari (o'zbekcha) — interfeys tilida ko'rsatish: ma'lum boshlanishlar t() orqali,
// maydon o'zgarishlari esa data'dan («Maydon»: oldin → keyin) quriladi.
const PREFIXES = [
  // bildirishnomalar
  'Avtomatik vazifa', 'Yangi lid biriktirildi', 'Sizga lid biriktirildi', 'Yangi vazifa',
  'Saralanmagandan qabul qilindi', 'Suhbat yopildi', 'Kontakt biriktirildi', 'Kontakt uzildi', "Mas'ul (ommaviy)", "Mas'ul",
  'Teglar', 'Formadan keldi', 'Avtomatlashtirish', 'Dublikat', 'Vazifalar yakunlandi', 'Lid yaratildi', 'Yo\'qotildi', 'Sotuv yopildi',
]

export function trActivity(text, t, data) {
  if (data && data.label && ('from' in data || 'to' in data)) {
    return `«${t(data.label)}»: ${data.from || '—'} → ${data.to || '—'}`
  }
  let s = String(text || '')
  const many = s.match(/^Sizga (\d+) ta lid biriktirildi$/)
  if (many) return `${t('Sizga biriktirilgan lidlar')}: ${many[1]}`
  const dup = s.match(/^(\d+) ta dublikat birlashtirildi$/)
  if (dup) return `${t('Birlashtirilgan dublikatlar')}: ${dup[1]}`
  for (const p of PREFIXES) {
    if (s.startsWith(p)) return t(p) + s.slice(p.length)
  }
  return s
}
