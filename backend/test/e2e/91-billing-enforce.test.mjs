// Cheklov mantiqi (BILLING_ENFORCE=1): tarif imkoniyatlari, o'rindiq limiti, muddat tugagach yozish bloki.
// Server ishga tushirilmaydi — BillingService/BillingGuard dist'dan to'g'ridan-to'g'ri, soxta baza bilan tekshiriladi.
// Litsenziyalar modeli (OnlinePBX kabi) vaqt bo'yicha ham shu yerda sinaladi: service.now almashtiriladi.
import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { BillingService } from '../../dist/billing/billing.service.js';
import { BillingGuard } from '../../dist/billing/billing.guard.js';

const DAY = 86_400_000;
const SECRET = (process.env.LICENSE_SECRET ||= 'e2e-license-secret');
const INSTALL = 'abcdef0123';
function code(payload) {
  const body = Buffer.from(JSON.stringify({ d: INSTALL, ...payload })).toString('base64url');
  return `SA1.${body}.${createHmac('sha256', SECRET).update(body).digest().subarray(0, 16).toString('base64url')}`;
}
/** Soxta baza (holat xotirada saqlanadi) + kerak bo'lsa soxta vaqt. */
function store(state, activeUsers = 1) {
  const db = { value: state ? JSON.stringify(state) : null };
  const appSetting = { findUnique: async () => (db.value == null ? null : { value: db.value }), upsert: async ({ update }) => { db.value = update.value; return {}; } };
  const prisma = { appSetting, user: { count: async () => activeUsers }, $transaction: async (fn) => fn({ appSetting, $executeRawUnsafe: async () => 0 }) };
  return {
    at(now) { const b = new BillingService(prisma); if (now !== undefined) b.now = () => now; return b; },
    state: () => JSON.parse(db.value),
  };
}
const make = (state, activeUsers = 1) => store(state, activeUsers).at();
const iso = (offsetDays, base = Date.now()) => new Date(base + offsetDays * DAY).toISOString();
const lic = (id, plan, users, fromDays, untilDays, base) => ({ id, plan, users, from: iso(fromDays, base), until: iso(untilDays, base), type: 'renew' });
const sub = (plan, users = 3, untilDays = 30) => ({ trialStartedAt: iso(-100), installId: INSTALL, licenses: [lic('s1', plan, users, -10, untilDays)] });

beforeEach(() => { process.env.BILLING_ENFORCE = '1'; });

describe('Tarif cheklovlari', () => {
  test("cheklov o'chiq bo'lsa hammasi ochiq", async () => {
    process.env.BILLING_ENFORCE = '';
    const b = make(sub('basic'));
    assert.equal(await b.allows('backup'), true);
    await b.assertSeat();
  });

  test('imkoniyatlar tarif bo`yicha: Bazoviy — yo`q, Kengaytirilgan — avtomatlashtirish bor, backup yo`q; Professional va xarajat tarifi — hammasi', async () => {
    const f = async (plan) => {
      const b = make(sub(plan));
      return Object.fromEntries(await Promise.all(['automation', 'goals', 'catalogs', 'backup', 'intents'].map(async (k) => [k, await b.allows(k)])));
    };
    assert.deepEqual(await f('basic'), { automation: false, goals: false, catalogs: false, backup: false, intents: false });
    assert.deepEqual(await f('advanced'), { automation: true, goals: true, catalogs: true, backup: false, intents: false });
    assert.deepEqual(await f('pro'), { automation: true, goals: true, catalogs: true, backup: true, intents: true });
    assert.deepEqual(await f('cost'), { automation: true, goals: true, catalogs: true, backup: true, intents: true });
    await assert.rejects(() => make(sub('basic')).assertFeature('automation'), (e) => e.getStatus() === 402 && e.getResponse().error === 'PLAN_FEATURE');
  });

  test('sinov davrida hammasi ochiq; tugagach faqat zaxira nusxa (ma`lumotni olib chiqish) ochiq', async () => {
    const trial = make({ trialStartedAt: iso(-2) });
    assert.equal(await trial.allows('automation'), true);
    const expired = make({ trialStartedAt: iso(-100) });
    assert.equal(await expired.allows('automation'), false);
    assert.equal(await expired.allows('backup'), true);
  });

  test("o'rindiq limiti: to'langan foydalanuvchilar soni to'lsa 402; tugagan obunada ham 402", async () => {
    await assert.rejects(() => make(sub('pro', 3), 3).assertSeat(), (e) => e.getStatus() === 402 && e.getResponse().error === 'SEAT_LIMIT');
    await make(sub('pro', 3), 2).assertSeat();
    await assert.rejects(() => make({ trialStartedAt: iso(-100) }, 1).assertSeat(), (e) => e.getStatus() === 402 && e.getResponse().error === 'PAYMENT_REQUIRED');
  });

  test("ikki litsenziya yig'iladi: 1 + 7 = 8 o'rindiq; tarif — eng yuqori faol; kelajak litsenziya o'rindiq bermaydi", async () => {
    const st = { trialStartedAt: iso(-100), installId: INSTALL, licenses: [lic('a', 'basic', 1, -29, 1), lic('b', 'advanced', 7, -21, 65), lic('f', 'pro', 50, 1, 31)] };
    const b = store(st, 8).at();
    const c = await b.current();
    assert.equal(c.status, 'active');
    assert.equal(c.users, 8);
    assert.equal(c.plan, 'advanced');
    assert.equal(await b.allows('automation'), true);
    assert.equal(await b.allows('backup'), false, 'kelajak pro litsenziya hozir imkoniyat berdi');
    await assert.rejects(() => b.assertSeat(), (e) => e.getResponse().error === 'SEAT_LIMIT');
    await store(st, 7).at().assertSeat();
  });

  test("renew — kelajak litsenziya: vaqti kelganda o'zi faollashadi; keyin grace (3 kun) va tugagan", async () => {
    const T = Date.now();
    const s = store({ trialStartedAt: iso(-100, T), installId: INSTALL });
    await s.at(T).activate(code({ i: 'r1', p: 'basic', u: 2, m: 3 }));
    const ov = await s.at(T).activate(code({ i: 'r2', p: 'basic', u: 4, m: 3 }));
    const [l1, l2] = ['r1', 'r2'].map((id) => ov.licenses.find((l) => l.id === id));
    assert.deepEqual([l1.status, l2.status], ['active', 'future']);
    assert.equal(l2.from, l1.until);
    assert.equal(ov.users, 2);
    assert.equal(ov.endsAt, l1.until);
    assert.equal(ov.paidUntil, l2.until);
    const at2 = new Date(l1.until).getTime() + 1000; // birinchi davr tugadi — ikkinchisi o'zi faol
    const c2 = await s.at(at2).overview();
    assert.equal(c2.status, 'active');
    assert.equal(c2.users, 4);
    assert.deepEqual(c2.licenses.map((l) => [l.id, l.status]), [['r1', 'ended'], ['r2', 'active']]);
    const end = new Date(l2.until).getTime();
    const g = await s.at(end + DAY).current();
    assert.equal(g.status, 'grace');
    assert.equal(g.users, 4, "grace davrida oxirgi o'rindiqlar saqlanadi");
    assert.equal(g.plan, 'basic');
    const x = s.at(end + 4 * DAY);
    assert.equal((await x.current()).status, 'expired');
    assert.equal(await x.allows('automation'), false);
    assert.equal(await x.allows('backup'), true);
    await assert.rejects(() => x.assertSeat(), (e) => e.getResponse().error === 'PAYMENT_REQUIRED');
    // tugagandan keyin renew — bugundan boshlanadi
    const r3 = await x.activate(code({ i: 'r3', p: 'basic', u: 1, m: 3 }));
    assert.equal(new Date(r3.licenses.find((l) => l.id === 'r3').from).getTime(), end + 4 * DAY);
    assert.equal(r3.status, 'active');
  });

  test("addon: bugundan faol muddat oxirigacha, narx qolgan kunga proporsional; faol litsenziyasiz rad", async () => {
    const T = Date.now();
    const none = store({ trialStartedAt: iso(-100, T), installId: INSTALL });
    await assert.rejects(() => none.at(T).activate(code({ i: 'x0', p: 'pro', u: 1, m: 0, t: 'addon' })), (e) => e.getResponse().error === 'NO_ACTIVE_LICENSE');
    assert.ok(!(none.state().used || []).includes('x0'), 'rad etilgan kod ishlatilgan deb belgilandi');
    // sinov davrida ham (litsenziya yo'q) rad
    const trial = store({ trialStartedAt: iso(-1, T), installId: INSTALL });
    await assert.rejects(() => trial.at(T).activate(code({ i: 'x1', p: 'pro', u: 1, m: 0, t: 'addon' })), (e) => e.getStatus() === 400);

    const s = store({ trialStartedAt: iso(-100, T), installId: INSTALL, licenses: [lic('p', 'pro', 5, -50, 30, T), lic('b', 'basic', 1, -10, 10, T)] });
    const ov0 = await s.at(T).overview();
    assert.equal(ov0.addonDays, 30);
    assert.deepEqual(ov0.addonQuotes.map((q) => [q.plan, q.days, q.total]), [['basic', 30, 39500], ['advanced', 30, 89500], ['pro', 30, 129500]]);
    const ov = await s.at(T).activate(code({ i: 'x2', p: 'pro', u: 3, m: 0, t: 'addon' }));
    const a = ov.licenses.find((l) => l.id === 'x2');
    assert.equal(a.from, iso(0, T));
    assert.equal(a.until, iso(30, T), 'addon eng kech faol muddat oxirida tugamadi');
    assert.equal(a.days, 30);
    assert.equal(a.amount, 3 * 129500, '3 foydalanuvchi × 4316.67 × 30 kun');
    assert.equal(ov.users, 9);
    const late = await s.at(T + 20 * DAY).current(); // basic tugadi, pro + addon qoladi
    assert.equal(late.users, 8);
    // 'new' — bugundan to'liq davr, boshqa litsenziyalarga bog'liq emas
    const n = await s.at(T).activate(code({ i: 'x3', p: 'advanced', u: 2, m: 6, t: 'new' }));
    const nl = n.licenses.find((l) => l.id === 'x3');
    assert.equal(nl.from, iso(0, T));
    assert.equal(nl.status, 'active');
    assert.equal(nl.amount, 2 * 89500 * 6);
    assert.equal(n.users, 11);
  });

  test("eski holatdan (plan/users/until) lazy ko'chirish: hech narsa yo'qolmaydi, renew uning oxiridan davom etadi", async () => {
    const T = Date.now();
    const old = {
      installId: INSTALL, trialStartedAt: iso(-200, T), plan: 'pro', users: 4, until: iso(20, T), used: ['old-1', 'old-2'],
      history: [{ at: iso(-160, T), id: 'old-1', plan: 'advanced', users: 3, months: 3 }, { at: iso(-70, T), id: 'old-2', plan: 'pro', users: 4, months: 3, customer: 'Eski' }],
    };
    const s = store(old, 4);
    const ov = await s.at(T).overview();
    assert.equal(ov.status, 'active');
    assert.equal(ov.plan, 'pro');
    assert.equal(ov.users, 4);
    assert.equal(ov.licenses.length, 1);
    assert.deepEqual([ov.licenses[0].id, ov.licenses[0].from, ov.licenses[0].until, ov.licenses[0].status], ['old-2', old.history[0].at, old.until, 'active']);
    assert.equal(s.state().licenses, undefined, "faqat o'qishda holat qayta yozildi");
    const r = await s.at(T).activate(code({ i: 'new-1', p: 'pro', u: 4, m: 3 }));
    assert.equal(r.licenses.find((l) => l.id === 'new-1').from, old.until, "renew eski muddat oxiridan boshlanmadi");
    const saved = s.state();
    assert.equal(saved.installId, INSTALL);
    assert.deepEqual(saved.used, ['old-1', 'old-2', 'new-1']);
    assert.deepEqual(saved.history.map((h) => h.id), ['old-1', 'old-2', 'new-1']);
    assert.equal(saved.licenses.length, 2);
    assert.equal(saved.users, 4); // orqaga moslik xulosasi
    assert.equal(saved.until, r.licenses.find((l) => l.id === 'new-1').until);
    // eski holat — tugagan (grace)
    const g = await store({ trialStartedAt: iso(-200, T), plan: 'advanced', users: 2, until: iso(-1, T) }).at(T).current();
    assert.deepEqual([g.status, g.users, g.plan], ['grace', 2, 'advanced']);
  });

  test("yashirin «xarajat» tarifi ro'yxatlarda yo'q, lekin pro darajasida ishlaydi", async () => {
    const st = sub('cost', 2);
    const ov = await store(st).at().overview();
    assert.ok(!ov.plans.some((p) => p.key === 'cost'));
    assert.ok(!('cost' in ov.dailyRates));
    assert.ok(!ov.addonQuotes.some((q) => q.plan === 'cost'));
    assert.equal(ov.licenses[0].planName, 'Maxsus tarif');
    assert.equal(ov.plan, 'cost');
  });

  test("BillingGuard: obuna tugagach yozish 402, o'qish/kirish/to'lov ochiq; tarifda yo'q imkoniyat 402", async () => {
    const ctx = (method, url, meta) => ({
      getHandler: () => 'h', getClass: () => 'c',
      switchToHttp: () => ({ getRequest: () => ({ method, originalUrl: url, url }) }),
      _meta: meta,
    });
    const reflector = (meta) => ({ getAllAndOverride: (key) => (key === 'billingFeature' ? meta : undefined) });
    const run = (billing, method, url, meta) => new BillingGuard(billing, reflector(meta)).canActivate(ctx(method, url));
    const expired = make({ trialStartedAt: iso(-100) });
    await assert.rejects(() => run(expired, 'POST', '/api/v1/crm/leads'), (e) => e.getStatus() === 402);
    assert.equal(await run(expired, 'GET', '/api/v1/crm/leads'), true);
    assert.equal(await run(expired, 'POST', '/api/v1/auth/login'), true);
    assert.equal(await run(expired, 'POST', '/api/v1/billing/activate'), true);
    const basic = make(sub('basic'));
    assert.equal(await run(basic, 'POST', '/api/v1/crm/leads'), true);
    await assert.rejects(() => run(basic, 'POST', '/api/v1/crm/automations', { feature: 'automation', all: false }), (e) => e.getResponse().error === 'PLAN_FEATURE');
    assert.equal(await run(basic, 'GET', '/api/v1/crm/automations', { feature: 'automation', all: false }), true); // o'qish ochiq
    await assert.rejects(() => run(basic, 'GET', '/api/v1/settings/backup', { feature: 'backup', all: true }), (e) => e.getResponse().error === 'PLAN_FEATURE');
  });
});
