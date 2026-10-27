import { BadRequestException, HttpException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { verifyLicense } from './license';
import { FEATURE_LABEL, FEATURE_MIN, MIN_MONTHS, PERIODS, PLANS, addMonths, dailyRate, daysBetween, isPlan, planAllows, planRank, quote, quoteAddon, type Feature, type PlanKey } from './plans';

const KEY = 'billing_state';
const DAY = 86_400_000;
export const TRIAL_DAYS = 14;
export const TRIAL_USERS = 5;
export const GRACE_DAYS = 3;
const LOCK_ID = 7401; // litsenziya faollashtirish uchun pg advisory lock
const ENDED_KEEP = 50; // tugagan litsenziyalardan nechtasi saqlanadi (tarix history'da to'liq)
type Db = Pick<PrismaService, 'appSetting'>;

export type LicenseType = 'renew' | 'new' | 'addon';
const TYPES: LicenseType[] = ['renew', 'new', 'addon'];

/** Bitta litsenziya qatori (OnlinePBX «Лицензии» kabi): o'z tarifi, foydalanuvchilar soni va sana oralig'i bilan. */
export interface License {
  id: string; // kod id (eski holatdan ko'chirilgani — oxirgi tarix id si yoki 'legacy')
  plan: string;
  users: number;
  from: string;
  until: string;
  customer?: string;
  type: LicenseType | 'legacy';
  amount?: number; // to'langan summa (so'm), faollashtirish paytida yoziladi
}

interface State {
  installId?: string; // shu o'rnatishning noyob id si: litsenziya kodi shunga bog'lanadi
  trialStartedAt?: string;
  licenses?: License[];
  // Eski (bitta holatli) maydonlar: litsenziyalar yo'q bo'lsa — ulardan ko'chiriladi; saqlashda qisqa xulosa sifatida yoziladi
  // (eski versiyaga qaytilsa ham obuna ishlab tursin).
  plan?: string;
  users?: number;
  until?: string;
  used?: string[]; // ishlatilgan litsenziya id lari
  history?: { at: string; id: string; plan: string; users: number; months: number; customer?: string; type?: LicenseType; from?: string; until?: string; amount?: number }[];
}

export type BillingStatus = 'trial' | 'active' | 'grace' | 'expired';

const ms = (iso: string | undefined) => (iso ? new Date(iso).getTime() : NaN);

/** Litsenziyalar ro'yxati; eski holatdan (plan/users/until) lazy ko'chirish — hech narsa yo'qolmaydi. */
export function licensesOf(s: State): License[] {
  if (Array.isArray(s.licenses)) return s.licenses.filter((l) => l && Number.isFinite(ms(l.from)) && Number.isFinite(ms(l.until)) && ms(l.until) > ms(l.from));
  const until = ms(s.until);
  if (!Number.isFinite(until)) return [];
  const first = (s.history || [])[0]?.at || s.trialStartedAt;
  let from = ms(first);
  if (!Number.isFinite(from) || from >= until) from = until - 30 * DAY;
  const last = (s.history || []).slice(-1)[0];
  return [{ id: last?.id || 'legacy', plan: s.plan || 'basic', users: s.users ?? 0, from: new Date(from).toISOString(), until: new Date(until).toISOString(), customer: last?.customer, type: 'legacy' }];
}

/** Bir guruh litsenziyadagi eng yuqori tarif (teng darajada — ko'rinadigan tarif afzal). */
function topPlan(list: License[]): string | null {
  let best: License | null = null;
  for (const l of list) {
    const r = planRank(l.plan), br = best ? planRank(best.plan) : -1;
    if (r > br || (r === br && best && isPlan(best.plan) && PLANS[best.plan].hidden && isPlan(l.plan) && !PLANS[l.plan].hidden)) best = l;
  }
  return best ? best.plan : null;
}

/** Vaqt bo'yicha holat: faol / grace / sinov / tugagan; o'rindiqlar = faol litsenziyalar yig'indisi. */
export function evaluate(s: State, now: number) {
  const lic = licensesOf(s);
  const active = lic.filter((l) => ms(l.from) <= now && now < ms(l.until));
  const future = lic.filter((l) => ms(l.from) > now);
  const ended = lic.filter((l) => ms(l.until) <= now);
  const lastEnd = ended.length ? Math.max(...ended.map((l) => ms(l.until))) : 0;
  const atLastEnd = ended.filter((l) => ms(l.from) < lastEnd && ms(l.until) >= lastEnd); // tugash arafasida faol bo'lganlar
  const trialEnd = ms(s.trialStartedAt) + TRIAL_DAYS * DAY;
  const sum = (list: License[]) => list.reduce((a, l) => a + (Number(l.users) || 0), 0);
  let status: BillingStatus;
  let endsAt: number;
  let users: number;
  let plan: string | null;
  if (active.length) {
    status = 'active'; endsAt = Math.max(...active.map((l) => ms(l.until))); users = sum(active); plan = topPlan(active);
  } else if (lastEnd && now - lastEnd < GRACE_DAYS * DAY && !future.length) {
    status = 'grace'; endsAt = lastEnd + GRACE_DAYS * DAY; users = sum(atLastEnd); plan = topPlan(atLastEnd);
  } else if (!lic.length && trialEnd > now) {
    status = 'trial'; endsAt = trialEnd; users = TRIAL_USERS; plan = 'trial';
  } else {
    status = 'expired'; endsAt = lastEnd || trialEnd; users = sum(atLastEnd); plan = topPlan(atLastEnd);
  }
  // To'langan qamrov oxiri: faol muddatga ulanib ketadigan kelajak litsenziyalar bilan (banner «tugayapti» deb noto'g'ri ogohlantirmasin)
  let paidUntil = status === 'active' ? endsAt : 0;
  if (paidUntil) {
    for (const l of [...future].sort((a, b) => ms(a.from) - ms(b.from))) if (ms(l.from) <= paidUntil) paidUntil = Math.max(paidUntil, ms(l.until));
  }
  return { licenses: lic, active, future, status, endsAt, users, plan, paidUntil };
}

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  private cache: { at: number; value: Awaited<ReturnType<BillingService['compute']>> } | null = null;

  /** Joriy vaqt (ms). Testlar vaqtni siljitish uchun almashtiradi: `service.now = () => ...`. */
  now: () => number = () => Date.now();

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
      s = { ...s, trialStartedAt: new Date(this.now()).toISOString() };
      if (this.enforced() && !corrupt) await this.save(s);
    }
    if (!s.installId && !corrupt) {
      s = { ...s, installId: randomBytes(5).toString('hex') };
      await this.save(s);
    }
    const now = this.now();
    const e = evaluate(s, now);
    const daysLeft = Math.ceil((e.endsAt - now) / DAY);
    const paidDaysLeft = e.paidUntil ? Math.ceil((e.paidUntil - now) / DAY) : daysLeft;
    return {
      state: s, now, status: e.status, endsAt: new Date(e.endsAt).toISOString(), daysLeft, paidDaysLeft,
      paidUntil: e.paidUntil ? new Date(e.paidUntil).toISOString() : null,
      plan: e.plan, users: e.users, licenses: e.licenses, active: e.active,
    };
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
    return { status: c.status, daysLeft: c.daysLeft, endsAt: c.endsAt, paidDaysLeft: c.paidDaysLeft, paidUntil: c.paidUntil, enforced: this.enforced() };
  }

  /** Super admin uchun to'liq ma'lumot: tariflar, litsenziyalar, kunlik narxlar, to'lov rekvizitlari, tarix. */
  async overview() {
    const c = await this.current();
    const now = c.now;
    const active = await this.prisma.user.count({ where: { isActive: true } });
    const visible = (Object.keys(PLANS) as PlanKey[]).filter((k) => !PLANS[k].hidden);
    const plans = visible.map((key) => ({
      key, name: PLANS[key].name, price: PLANS[key].price,
      quotes: Object.keys(PERIODS).map((m) => quote(key, 1, Number(m))),
    }));
    const licStatus = (l: License) => (ms(l.from) > now ? 'future' : ms(l.until) <= now ? 'ended' : 'active');
    const licenses = c.licenses
      .filter((l) => licStatus(l) !== 'ended' || now - ms(l.until) < 30 * DAY)
      .sort((a, b) => ms(a.from) - ms(b.from) || ms(a.until) - ms(b.until))
      .map((l) => {
        const days = daysBetween(ms(l.from), ms(l.until));
        const amount = typeof l.amount === 'number' ? l.amount : isPlan(l.plan) ? Math.round(l.users * dailyRate(l.plan) * days) : 0;
        return { id: l.id, plan: l.plan, planName: isPlan(l.plan) ? PLANS[l.plan].name : l.plan, users: l.users, from: l.from, until: l.until, days, type: l.type, customer: l.customer, status: licStatus(l), amount };
      });
    // Foydalanuvchi qo'shish: faol litsenziyalarning eng kech tugashigacha qolgan kunlarga proporsional (1 foydalanuvchi uchun)
    const addonUntil = c.active.length ? Math.max(...c.active.map((l) => ms(l.until))) : 0;
    const addonQuotes = addonUntil ? visible.map((k) => quoteAddon(k, 1, now, addonUntil)) : [];
    return {
      installId: c.state.installId || '', status: c.status, plan: c.plan, planName: c.plan && isPlan(c.plan) ? PLANS[c.plan].name : null, users: c.users, activeUsers: active,
      endsAt: c.endsAt, daysLeft: c.daysLeft, paidUntil: c.paidUntil, paidDaysLeft: c.paidDaysLeft,
      enforced: this.enforced(), trialDays: TRIAL_DAYS, graceDays: GRACE_DAYS, minMonths: MIN_MONTHS,
      plans, periods: Object.keys(PERIODS).map(Number),
      licenses,
      dailyRates: Object.fromEntries(visible.map((k) => [k, Math.round(dailyRate(k) * 100) / 100])),
      addonQuotes, addonDays: addonUntil ? daysBetween(now, addonUntil) : 0, addonUntil: addonUntil ? new Date(addonUntil).toISOString() : null,
      payment: {
        card: process.env.BILLING_CARD_NUMBER || '',
        holder: process.env.BILLING_CARD_HOLDER || '',
        telegram: (process.env.BILLING_TELEGRAM || '').replace(/^@/, ''),
      },
      features: Object.fromEntries((Object.keys(FEATURE_MIN) as Feature[]).map((f) => [f, { min: FEATURE_MIN[f], label: FEATURE_LABEL[f] }])),
      history: (c.state.history || []).slice(-20).reverse().map((h) => ({ ...h, type: h.type || 'renew', planName: isPlan(h.plan) ? PLANS[h.plan].name : h.plan })),
    };
  }

  /**
   * Litsenziya kodini tekshirib, yangi litsenziya qatorini qo'shadi (har kod bir marta).
   * Turi: renew — shu tarifdagi eng kech litsenziya oxiridan (kelajak davr, vaqti kelganda o'zi faollashadi), yo'q bo'lsa hozirdan;
   * new — hozirdan to'liq davr; addon — hozirdan faol litsenziyalarning eng kech tugashigacha (qo'shimcha foydalanuvchilar).
   */
  async activate(code: string) {
    const secret = process.env.LICENSE_SECRET;
    if (!secret) throw new ServiceUnavailableException({ error: 'LICENSE_NOT_CONFIGURED', message: 'Litsenziya sozlanmagan (serverda LICENSE_SECRET yo\'q)' });
    const p = verifyLicense(code, secret);
    const type = (p?.t ?? 'renew') as LicenseType;
    if (!p || !isPlan(p.p) || !TYPES.includes(type) || (type !== 'addon' && !PERIODS[p.m]) || p.u < 1 || p.u > 1000) {
      throw new BadRequestException({ error: 'BAD_LICENSE', message: "Kod noto'g'ri" });
    }
    const plan = p.p as PlanKey;
    // Bir vaqtda kiritilgan kodlar bir-birini bosib ketmasin va bitta kod ikki marta ishlamasin: tranzaksiya + advisory lock.
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${LOCK_ID})`);
      const { s, corrupt } = await this.loadRaw(tx);
      if (corrupt) throw new HttpException({ error: 'BILLING_STATE_CORRUPT', message: "Obuna holati buzilgan — qo'llab-quvvatlashga murojaat qiling" }, 500);
      if (p.d ? p.d !== s.installId : process.env.LICENSE_ALLOW_UNBOUND !== '1') {
        throw new BadRequestException({ error: 'LICENSE_OTHER_INSTALL', message: p.d ? "Bu kod boshqa o'rnatish uchun berilgan" : "Kod o'rnatishga bog'lanmagan (installId kerak)" });
      }
      if ((s.used || []).includes(p.i)) throw new BadRequestException({ error: 'LICENSE_USED', message: 'Bu kod avval ishlatilgan' });
      const now = this.now();
      const lic = licensesOf(s);
      let from = now;
      let until: number;
      let amount: number;
      if (type === 'addon') {
        const act = lic.filter((l) => ms(l.from) <= now && now < ms(l.until));
        if (!act.length) throw new BadRequestException({ error: 'NO_ACTIVE_LICENSE', message: "Foydalanuvchi qo'shish uchun faol litsenziya kerak — avval obunani uzaytiring" });
        until = Math.max(...act.map((l) => ms(l.until)));
        amount = quoteAddon(plan, p.u, now, until).total;
      } else {
        if (type === 'renew') {
          const same = lic.filter((l) => l.plan === plan).map((l) => ms(l.until));
          const last = same.length ? Math.max(...same) : 0;
          if (last > now) from = last;
        }
        until = addMonths(new Date(from), p.m).getTime();
        amount = quote(plan, p.u, p.m)!.total;
      }
      const row: License = { id: p.i, plan, users: p.u, from: new Date(from).toISOString(), until: new Date(until).toISOString(), type, amount, ...(p.c ? { customer: p.c } : {}) };
      const all = [...lic, row];
      const ended = all.filter((l) => ms(l.until) <= now).sort((a, b) => ms(a.until) - ms(b.until));
      const kept = new Set([...all.filter((l) => ms(l.until) > now), ...ended.slice(-ENDED_KEEP)]);
      const licenses = all.filter((l) => kept.has(l));
      // eski maydonlar — qisqa xulosa (orqaga qaytish mosligi uchun)
      const e = evaluate({ ...s, licenses }, now);
      const next: State = {
        ...s,
        licenses,
        plan: e.plan && e.plan !== 'trial' ? e.plan : plan, users: e.users,
        until: new Date(Math.max(...licenses.map((l) => ms(l.until)))).toISOString(),
        used: [...(s.used || []), p.i].slice(-1000),
        history: [...(s.history || []), { at: new Date(now).toISOString(), id: p.i, plan, users: p.u, months: type === 'addon' ? 0 : p.m, customer: p.c, type, from: row.from, until: row.until, amount }].slice(-100),
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
