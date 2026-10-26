import { BadRequestException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { verifyLicense } from './license';
import { MIN_MONTHS, PERIODS, PLANS, addMonths, isPlan, quote } from './plans';

const KEY = 'billing_state';
const DAY = 86_400_000;
export const TRIAL_DAYS = 14;
export const TRIAL_USERS = 5;
export const GRACE_DAYS = 3;

interface State {
  trialStartedAt?: string;
  plan?: string;
  users?: number;
  until?: string;
  used?: string[]; // ishlatilgan litsenziya id lari
  history?: { at: string; id: string; plan: string; users: number; months: number; customer?: string }[];
}

export type BillingStatus = 'trial' | 'active' | 'grace' | 'expired';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  private cache: { at: number; value: Awaited<ReturnType<BillingService['compute']>> } | null = null;

  enforced() { return /^(1|true|yes)$/i.test(process.env.BILLING_ENFORCE || ''); }

  private async load(): Promise<State> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: KEY } });
    if (!row) return {};
    try { return JSON.parse(row.value) as State; } catch { return {}; }
  }

  private async save(s: State) {
    const value = JSON.stringify(s);
    await this.prisma.appSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
    this.cache = null;
  }

  private async compute() {
    let s = await this.load();
    if (!s.trialStartedAt) {
      s = { ...s, trialStartedAt: new Date().toISOString() };
      await this.save(s);
    }
    const now = Date.now();
    const until = s.until ? new Date(s.until).getTime() : 0;
    const trialEnd = new Date(s.trialStartedAt!).getTime() + TRIAL_DAYS * DAY;
    let status: BillingStatus;
    let endsAt: number;
    if (until && until > now) { status = 'active'; endsAt = until; }
    else if (until && now - until < GRACE_DAYS * DAY) { status = 'grace'; endsAt = until + GRACE_DAYS * DAY; }
    else if (!until && trialEnd > now) { status = 'trial'; endsAt = trialEnd; }
    else { status = 'expired'; endsAt = until || trialEnd; }
    const daysLeft = Math.ceil((endsAt - now) / DAY);
    const users = status === 'trial' ? TRIAL_USERS : s.users ?? 0;
    return { state: s, status, endsAt: new Date(endsAt).toISOString(), daysLeft, plan: status === 'trial' ? 'trial' : s.plan || null, users };
  }

  /** Qisqa kesh: har yozuv so'rovida bazaga bormaslik uchun. */
  async current() {
    if (this.cache && Date.now() - this.cache.at < 30_000) return this.cache.value;
    const value = await this.compute();
    this.cache = { at: Date.now(), value };
    return value;
  }

  /** Har kim ko'radigan qisqa holat (banner uchun). */
  async status() {
    const c = await this.current();
    return { status: c.status, daysLeft: c.daysLeft, endsAt: c.endsAt, enforced: this.enforced() };
  }

  /** Super admin uchun to'liq ma'lumot: tariflar, to'lov rekvizitlari, tarix. */
  async overview() {
    const c = await this.current();
    const active = await this.prisma.user.count({ where: { isActive: true } });
    const plans = Object.entries(PLANS).filter(([, p]) => !p.hidden).map(([key, p]) => ({
      key, name: p.name, price: p.price,
      quotes: Object.keys(PERIODS).map((m) => quote(key as 'basic', 1, Number(m))),
    }));
    return {
      status: c.status, plan: c.plan, planName: c.plan && isPlan(c.plan) ? PLANS[c.plan].name : null, users: c.users, activeUsers: active,
      endsAt: c.endsAt, daysLeft: c.daysLeft, enforced: this.enforced(), trialDays: TRIAL_DAYS, graceDays: GRACE_DAYS, minMonths: MIN_MONTHS,
      plans, periods: Object.keys(PERIODS).map(Number),
      payment: {
        card: process.env.BILLING_CARD_NUMBER || '',
        holder: process.env.BILLING_CARD_HOLDER || '',
        telegram: (process.env.BILLING_TELEGRAM || '').replace(/^@/, ''),
      },
      history: (c.state.history || []).slice(-20).reverse().map((h) => ({ ...h, planName: isPlan(h.plan) ? PLANS[h.plan].name : h.plan })),
    };
  }

  /** Litsenziya kodini tekshirib, obunani uzaytiradi (har kod bir marta). */
  async activate(code: string) {
    const secret = process.env.LICENSE_SECRET;
    if (!secret) throw new ServiceUnavailableException({ error: 'LICENSE_NOT_CONFIGURED', message: 'Litsenziya sozlanmagan (serverda LICENSE_SECRET yo\'q)' });
    const p = verifyLicense(code, secret);
    if (!p || !isPlan(p.p) || !PERIODS[p.m] || p.u < 1 || p.u > 1000) throw new BadRequestException({ error: 'BAD_LICENSE', message: "Kod noto'g'ri" });
    const s = await this.load();
    if ((s.used || []).includes(p.i)) throw new BadRequestException({ error: 'LICENSE_USED', message: 'Bu kod avval ishlatilgan' });
    const now = new Date();
    const cur = s.until ? new Date(s.until) : now;
    const from = cur.getTime() > now.getTime() ? cur : now;
    const next: State = {
      ...s,
      plan: p.p, users: p.u, until: addMonths(from, p.m).toISOString(),
      used: [...(s.used || []), p.i].slice(-200),
      history: [...(s.history || []), { at: now.toISOString(), id: p.i, plan: p.p, users: p.u, months: p.m, customer: p.c }].slice(-100),
    };
    await this.save(next);
    return this.overview();
  }

  /** Foydalanuvchi qo'shish/yoqishdan oldin: to'langan o'rindiq soni oshib ketmasin (faqat BILLING_ENFORCE=1). */
  async assertSeat() {
    if (!this.enforced()) return;
    const c = await this.current();
    const active = await this.prisma.user.count({ where: { isActive: true } });
    if (c.status === 'expired') throw new HttpException({ error: 'PAYMENT_REQUIRED', message: "Obuna muddati tugagan. «Hisob va to'lov» bo'limida uzaytiring" }, 402);
    if (active >= c.users) throw new HttpException({ error: 'SEAT_LIMIT', message: `Tarifdagi foydalanuvchilar soni to'lgan (${c.users}). «Hisob va to'lov» bo'limida oshiring` }, 402);
  }
}
