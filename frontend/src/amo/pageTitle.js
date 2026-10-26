// Brauzer sarlavhasi (tab, history, bookmark) — manzil bo'yicha: «Vazifalar · CRM»
export const TITLES = [
  ['/dashboard', 'Ish stoli'], ['/leads', 'Bitimlar'], ['/inbox', 'imBox'], ['/tasks', 'Vazifalar'],
  ['/contacts', 'Kontaktlar'], ['/companies', 'Kompaniyalar'], ['/products', 'Mahsulotlar'],
  ['/stats', 'Analitika'], ['/pbx', 'Telefoniya'], ['/events', 'Voqealar ro\'yxati'], ['/settings', 'Sozlamalar'],
  ['/integrations', 'Market'], ['/bots', 'AI-agentlar va botlar'],
]
export function titleFor(pathname) {
  const hit = TITLES.find(([p]) => pathname === p || pathname.startsWith(p + '/'))
  return hit ? hit[1] : ''
}
