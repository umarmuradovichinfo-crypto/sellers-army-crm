// Cheklov mantiqi (BILLING_ENFORCE=1): tarif imkoniyatlari, o'rindiq limiti, muddat tugagach yozish bloki.
// Server ishga tushirilmaydi — BillingService/BillingGuard dist'dan to'g'ridan-to'g'ri, soxta baza bilan tekshiriladi.
import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { BillingService } from '../../dist/billing/billing.service.js';
import { BillingGuard } from '../../dist/billing/billing.guard.js';

const DAY = 86_400_000;
function make(state, activeUsers = 1) {
  const prisma = {
    appSetting: { findUnique: async () => (state ? { value: JSON.stringify(state) } : null), upsert: async () => ({}) },
    user: { count: async () => activeUsers },
  };
  return new BillingService(prisma);
}
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString();
const sub = (plan, users = 3, until = iso(30)) => ({ trialStartedAt: iso(-100), plan, users, until });

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
