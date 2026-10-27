import { BadRequestException, HttpException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { verifyLicense } from './license';
import { FEATURE_LABEL, FEATURE_MIN, MIN_MONTHS, PERIODS, PLANS, addMonths, isPlan, planAllows, quote, type Feature } from './plans';

const KEY = 'billing_state';
const DAY = 86_400_000;
export const TRIAL_DAYS = 14;
export const TRIAL_USERS = 5;
export const GRACE_DAYS = 3;
const LOCK_ID = 7401; // litsenziya faollashtirish uchun pg advisory lock
type Db = Pick<PrismaService, 'appSetting'>;

interface State {
  installId?: string; // shu o'rnatishning noyob id si: litsenziya kodi shunga bog'lanadi
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

  private readonly log = new Logger('Billing');

  /** Holatni o'qish. `corrupt` — JSON buzilgan: bunda hech narsani qayta yozmaymiz (used/history yo'qolmasin). */
  private async loadRaw(db: Db = this.prisma): Promise<{ s: State; corrupt: boolean }> {
    const row = await db.appSetting.findUnique({ where: { key: KEY } });
    if (!row) return { s: {}, corrupt: false };
    try { return { s: JSON.parse(row.value) as State, corrupt: false }; } catch {
      this.log.error('billing_state JSON buzilgan — yozuv o\'zgartirilmaydi');
      return { s: {}, corrupt: true };
    }
  }

  private async save(s: State, db: Db = this.prisma) {
    const value = JSON.stringify(s);
    await db.appSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
    this.cache = null;
  }

  private async compute() {
    const { s: loaded, corrupt } = await this.loadRaw();
    let s = loaded;
    // Sinov soati faqat cheklov YOQILGANDA boshlanadi (BILLING_ENFORCE o'chiq paytda mavjud mijozlar «sinov tugagan» bo'lib qolmasin).
    if (!s.trialStartedAt) {
      s = { ...s, trialStartedAt: new Date().toISOString() };
      if (this.enforced() && !corrupt) await this.save(s);
    }
    if (!s.installId && !corrupt) {
      s = { ...s, installId: randomBytes(5).toString('hex') };
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
      installId: c.state.installId || '', status: c.status, plan: c.plan, planName: c.plan && isPlan(c.plan) ? PLANS[c.plan].name : null, users: c.users, activeUsers: active,
      endsAt: c.endsAt, daysLeft: c.daysLeft, enforced: this.enforced(), trialDays: TRIAL_DAYS, graceDays: GRACE_DAYS, minMonths: MIN_MONTHS,
      plans, periods: Object.keys(PERIODS).map(Number),
      payment: {
        card: process.env.BILLING_CARD_NUMBER || '',
        holder: process.env.BILLING_CARD_HOLDER || '',
        telegram: (process.env.BILLING_TELEGRAM || '').replace(/^@/, ''),
      },
      features: Object.fromEntries((Object.keys(FEATURE_MIN) as Feature[]).map((f) => [f, { min: FEATURE_MIN[f], label: FEATURE_LABEL[f] }])),
      history: (c.state.history || []).slice(-20).reverse().map((h) => ({ ...h, planName: isPlan(h.plan) ? PLANS[h.plan].name : h.plan })),
    };
  }

  /** Litsenziya kodini tekshirib, obunani uzaytiradi (har kod bir marta). */
  async activate(code: string) {
    const secret = process.env.LICENSE_SECRET;
    if (!secret) throw new ServiceUnavailableException({ error: 'LICENSE_NOT_CONFIGURED', message: 'Litsenziya sozlanmagan (serverda LICENSE_SECRET yo\'q)' });
    const p = verifyLicense(code, secret);
    if (!p || !isPlan(p.p) || !PERIODS[p.m] || p.u < 1 || p.u > 1000) throw new BadRequestException({ error: 'BAD_LICENSE', message: "Kod noto'g'ri" });
    // Bir vaqtda kiritilgan kodlar bir-birini bosib ketmasin va bitta kod ikki marta ishlamasin: tranzaksiya + advisory lock.
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${LOCK_ID})`);
      const { s, corrupt } = await this.loadRaw(tx);
      if (corrupt) throw new HttpException({ error: 'BILLING_STATE_CORRUPT', message: "Obuna holati buzilgan — qo'llab-quvvatlashga murojaat qiling" }, 500);
      if (p.d ? p.d !== s.installId : process.env.LICENSE_ALLOW_UNBOUND !== '1') {
        throw new BadRequestException({ error: 'LICENSE_OTHER_INSTALL', message: p.d ? "Bu kod boshqa o'rnatish uchun berilgan" : "Kod o'rnatishga bog'lanmagan (installId kerak)" });
      }
      if ((s.used || []).includes(p.i)) throw new BadRequestException({ error: 'LICENSE_USED', message: 'Bu kod avval ishlatilgan' });
      const now = new Date();
      const cur = s.until ? new Date(s.until) : now;
      const from = cur.getTime() > now.getTime() ? cur : now;
      const next: State = {
        ...s,
        plan: p.p, users: p.u, until: addMonths(from, p.m).toISOString(),
        used: [...(s.used || []), p.i].slice(-1000),
        history: [...(s.history || []), { at: now.toISOString(), id: p.i, plan: p.p, users: p.u, months: p.m, customer: p.c }].slice(-100),
      };
      await this.save(next, tx);
    });
    return this.overview();
  }

  /**
   * Tarif imkoniyati yoqilganmi. Cheklov o'chiq (BILLING_ENFORCE yo'q) — hammasi ochiq; sinov davri — barcha imkoniyatlar.
   * Zaxira nusxa (backup): obuna tugagan/tugayotgan bo'lsa ham mijoz o'z ma'lumotini yuklab olishi mumkin.
   */
  async allows(feature: Feature): Promise<boolean> {
    if (!this.enforced()) return true;
    const c = await this.current();
    if (c.status === 'trial') return true;
    if (c.status === 'expired') return feature === 'backup';
    if (c.status === 'grace' && feature === 'backup') return true; // ma'lumotni olib chiqish tugash arafasida ham ochiq
    return planAllows(c.plan, feature);
  }

  async assertFeature(feature: Feature) {
    if (await this.allows(feature)) return;
    const min = PLANS[FEATURE_MIN[feature]].name;
    throw new HttpException({ error: 'PLAN_FEATURE', message: `«${FEATURE_LABEL[feature]}» ${min} tarifidan boshlanadi. «Hisob va to'lov» bo'limida tarifni oshiring` }, 402);
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
