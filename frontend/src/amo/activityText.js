// Server yozgan voqea matnlari (o'zbekcha) — interfeys tilida ko'rsatish: ma'lum boshlanishlar t() orqali,
// maydon o'zgarishlari esa data'dan («Maydon»: oldin → keyin) quriladi.
const PREFIXES = [
  'Salesbot ishga tushdi', 'Salesbot',
  // bildirishnomalar
  'Avtomatik vazifa', 'Yangi lid biriktirildi', 'Sizga lid biriktirildi', 'Yangi vazifa',
  'Saralanmagandan qabul qilindi', 'Suhbat yopildi', 'Kontakt biriktirildi', 'Kontakt uzildi', "Mas'ul (ommaviy)", "Mas'ul",
  'Teglar', 'Formadan keldi', 'Avtomatlashtirish', 'Dublikat', 'Vazifalar yakunlandi', 'Lid yaratildi', 'Yo\'qotildi', 'Sotuv yopildi',
  'Bosqich',
]

// avtomatlashtirish natijalari: «Avtomatlashtirish: <nom> — <natija>» (natija serverda o'zbekcha yoziladi)
const AUTO_RESULTS = [
  [/^vazifa "(.+)" yaratildi$/, (t, m) => `${t('Vazifa yaratildi')}: «${m[1]}»`],
  [/^yangi bitim "(.+)" yaratildi \((.+)\)$/, (t, m) => `${t('Yangi bitim yaratildi')}: «${m[1]}» (${m[2]})`],
  [/^bitim "(.+)" asosida yaratildi$/, (t, m) => `${t('Bitim asosida yaratildi')}: «${m[1]}»`],
  [/^webhook yuborildi \(HTTP (\d+)\)$/, (t, m) => `${t('Webhook yuborildi')} (HTTP ${m[1]})`],
  [/^bosqich o'zgartirildi: (.+)$/, (t, m) => `${t("Bosqich o'zgartirildi")}: ${m[1]}`],
  [/^ochiq vazifalar yo'q$/, (t) => t("Ochiq vazifalar yo'q")],
  [/^(\d+) ta vazifa yakunlandi(?: \((.+)\))?$/, (t, m) => `${t('Yakunlangan vazifalar')}: ${m[1]}${m[2] ? ` (${m[2]})` : ''}`],
  [/^"(.+)" maydoni yangilandi$/, (t, m) => `${t('Maydon yangilandi')}: «${m[1]}»`],
  [/^Telegram xabar yuborildi: (.*)$/, (t, m) => `${t('Telegram xabar yuborildi')}: ${m[1]}`],
  [/^Salesbot ishga tushirildi$/, (t) => t('Salesbot ishga tushirildi')],
  [/^izoh qo'shildi$/, (t) => t("Izoh qo'shildi")],
  [/^bildirishnoma yuborildi$/, (t) => t('Bildirishnoma yuborildi')],
  [/^(\w+): xato — (.+)$/, (t, m) => `${m[1]}: ${t('xato')} — ${m[2]}`],
]
const trAutoPart = (part, t) => {
  for (const [re, f] of AUTO_RESULTS) { const m = part.match(re); if (m) return f(t, m) }
  const tg = part.match(/^teg (qo'shildi|olib tashlandi): (.+)$/)
  if (tg) return `${t(tg[1] === "qo'shildi" ? "Teg qo'shildi" : 'Teg olib tashlandi')}: ${tg[2]}`
  return part
}

export function trActivity(text, t, data) {
  if (data && data.label && ('from' in data || 'to' in data)) {
    return `«${t(data.label)}»: ${data.from || '—'} → ${data.to || '—'}`
  }
  let s = String(text || '')
  // Salesbot xizmat matnlari: «Salesbot (Bot nomi): …»
  const bot = s.match(/^Salesbot \((.+?)\): (.+)$/)
  if (bot) return `Salesbot (${bot[1]}): ${bot[2].split(' — ').map((x) => t(x)).join(' — ')}`
  const auto = s.match(/^Avtomatlashtirish: (.+?) — (.+)$/)
  if (auto) return `${t('Avtomatlashtirish')}: ${auto[1]} — ${auto[2].split('; ').map((x) => trAutoPart(x, t)).join('; ')}`
  const many = s.match(/^Sizga (\d+) ta lid biriktirildi$/)
  if (many) return `${t('Sizga biriktirilgan lidlar')}: ${many[1]}`
  const dup = s.match(/^(\d+) ta dublikat birlashtirildi$/)
  if (dup) return `${t('Birlashtirilgan dublikatlar')}: ${dup[1]}`
  for (const p of PREFIXES) {
    if (s.startsWith(p)) return t(p) + s.slice(p.length)
  }
  return s
}
