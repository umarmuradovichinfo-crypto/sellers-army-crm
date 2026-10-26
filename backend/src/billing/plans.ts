// Tariflar va davrlar. Narx = amoCRM «Счет и оплата» narxining 50% i (docs/amo-clone/PRICING.md), so'm / foydalanuvchi / oy.
export type PlanKey = 'basic' | 'advanced' | 'pro' | 'cost';

export const PLANS: Record<PlanKey, { name: string; price: number; hidden?: boolean }> = {
  basic: { name: 'Bazoviy', price: 39_500 },
  advanced: { name: 'Kengaytirilgan', price: 89_500 },
  pro: { name: 'Professional', price: 129_500 },
  // Eksklyuziv mijozlar uchun «xarajat» tarifi: tarif menyusida ko'rinmaydi, narx har mijozga alohida (faqat haqiqiy xarajat) —
  // kod faqat bizda (scripts/license.mjs --plan cost). Muddat/cheklov qoidalari boshqa tariflar bilan bir xil.
  cost: { name: 'Maxsus tarif', price: 0, hidden: true },
};

/** Obuna davri (oy) → to'lanadigan oy soni. Eng kam davr — 3 oy; uzoq davrga sovg'a oylar (amoCRM kabi). */
export const PERIODS: Record<number, number> = { 3: 3, 6: 6, 9: 8, 12: 10, 24: 18 };
export const MIN_MONTHS = 3;

export function isPlan(k: unknown): k is PlanKey {
  return typeof k === 'string' && Object.prototype.hasOwnProperty.call(PLANS, k);
}

export function quote(plan: PlanKey, users: number, months: number) {
  const paidMonths = PERIODS[months];
  if (!paidMonths) return null;
  const monthly = PLANS[plan].price * users;
  const total = monthly * paidMonths;
  return { plan, users, months, paidMonths, giftMonths: months - paidMonths, monthly, total, perUserTotal: PLANS[plan].price * paidMonths };
}

export function addMonths(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + n);
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, last));
  return r;
}

/** Imkoniyat → eng past tarif (amoCRM'dagi kabi: yuqori tariflar ko'proq imkoniyat beradi). */
export type Feature = 'automation' | 'goals' | 'catalogs' | 'backup' | 'intents';
export const FEATURE_MIN: Record<Feature, PlanKey> = {
  automation: 'advanced', // avtomatlashtirish, Salesbot, botlar
  goals: 'advanced', // KPI va sotuv rejalari
  catalogs: 'advanced', // mahsulot kataloglari
  backup: 'pro', // butun akkaunt zaxira nusxasi
  intents: 'pro', // mijoz savollariga avto-javob
};
export const FEATURE_LABEL: Record<Feature, string> = {
  automation: 'Avtomatlashtirish va Salesbot', goals: 'KPI va sotuv rejalari', catalogs: 'Kataloglar (mahsulotlar)', backup: 'Zaxira nusxa', intents: 'Mijoz savollariga avto-javob',
};
const RANK: Record<PlanKey, number> = { basic: 1, advanced: 2, pro: 3, cost: 3 };
export function planAllows(plan: string | null | undefined, feature: Feature): boolean {
  if (!isPlan(plan)) return false;
  return RANK[plan] >= RANK[FEATURE_MIN[feature]];
}
