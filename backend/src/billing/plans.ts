// Tariflar va davrlar. Narx = amoCRM «Счет и оплата» narxining 50% i (docs/amo-clone/PRICING.md), so'm / foydalanuvchi / oy.
export type PlanKey = 'basic' | 'advanced' | 'pro';

export const PLANS: Record<PlanKey, { name: string; price: number }> = {
  basic: { name: 'Bazoviy', price: 39_500 },
  advanced: { name: 'Kengaytirilgan', price: 89_500 },
  pro: { name: 'Professional', price: 129_500 },
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
