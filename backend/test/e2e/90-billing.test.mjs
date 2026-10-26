// Obuna va to'lov (qo'lda): litsenziya kodi bilan faollashtirish, uzaytirish, qayta ishlatishdan himoya, narx hisobi.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { req, ok, admin, userWithRole } from './lib.mjs';

const SECRET = 'e2e-license-secret';
function code(payload, secret = SECRET) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest().subarray(0, 16).toString('base64url');
  return `SA1.${body}.${sig}`;
}

describe('Obuna va to\'lov', () => {
  test('boshida sinov davri; holat hammaga, tafsilot faqat sozlamalar huquqi bilan', async () => {
    const A = await admin();
    const st = await ok('GET', '/billing/status', undefined, A, 200);
    assert.equal(st.status, 'trial');
    assert.ok(st.daysLeft > 0 && st.daysLeft <= 14);
    const ov = await ok('GET', '/billing', undefined, A, 200);
    assert.deepEqual(ov.plans.map((p) => p.price), [39500, 89500, 129500]);
    assert.deepEqual(ov.periods, [3, 6, 9, 12, 24]);
    assert.equal(ov.minMonths, 3);
    assert.equal(ov.payment.card, '8600 0000 0000 0000');
    assert.equal(ov.payment.telegram, 'test_admin');
    const S = await userWithRole('sotuvchi');
    await ok('GET', '/billing/status', undefined, S.token, 200);
    assert.equal((await req('GET', '/billing', undefined, S.token)).status, 403, 'oddiy xodim tafsilotni ko\'rdi');
    assert.equal((await req('POST', '/billing/activate', { code: 'x' }, S.token)).status, 403);
  });

  test('narx: 1 foydalanuvchi uchun davrlar (amoCRM chegirmasi 9→8, 12→10, 24→18 oy)', async () => {
    const A = await admin();
    const ov = await ok('GET', '/billing', undefined, A, 200);
    const basic = ov.plans.find((p) => p.key === 'basic');
    const by = Object.fromEntries(basic.quotes.map((q) => [q.months, q.total]));
    assert.deepEqual(by, { 3: 118500, 6: 237000, 9: 316000, 12: 395000, 24: 711000 });
    const pro = ov.plans.find((p) => p.key === 'pro');
    assert.equal(pro.quotes.find((q) => q.months === 12).total, 1295000);
  });

  test('noto\'g\'ri, soxta va buzilgan kod rad etiladi', async () => {
    const A = await admin();
    for (const c of ['', 'abc', 'SA1.x.y', code({ i: 'a1', p: 'pro', u: 5, m: 3 }, 'boshqa-sir')]) {
      const r = await req('POST', '/billing/activate', { code: c }, A);
      assert.equal(r.status, 400, `kod qabul qilindi: ${c.slice(0, 20)}`);
    }
    // imzo to'g'ri, lekin tarif/davr yaroqsiz
    assert.equal((await req('POST', '/billing/activate', { code: code({ i: 'b1', p: 'yoq', u: 5, m: 3 }) }, A)).status, 400);
    assert.equal((await req('POST', '/billing/activate', { code: code({ i: 'b2', p: 'pro', u: 5, m: 4 }) }, A)).status, 400);
    assert.equal((await req('POST', '/billing/activate', { code: code({ i: 'b3', p: 'pro', u: 0, m: 3 }) }, A)).status, 400);
    // payload o'zgartirilsa imzo buziladi
    const good = code({ i: 'b4', p: 'basic', u: 1, m: 3 });
    const [h, , sig] = good.split('.');
    const forged = `${h}.${Buffer.from(JSON.stringify({ i: 'b4', p: 'pro', u: 99, m: 24 })).toString('base64url')}.${sig}`;
    assert.equal((await req('POST', '/billing/activate', { code: forged }, A)).status, 400, 'soxta kod o\'tdi');
    assert.equal((await ok('GET', '/billing/status', undefined, A, 200)).status, 'trial', 'xato kodlar holatni o\'zgartirdi');
  });

  test('faollashtirish: 3 oy, keyin uzaytirish oxiridan davom etadi, kod bir marta ishlaydi', async () => {
    const A = await admin();
    const c1 = code({ i: 'e2e-1', p: 'advanced', u: 7, m: 3, c: 'QA mijoz' });
    const r1 = await ok('POST', '/billing/activate', { code: c1 }, A, [200, 201]);
    assert.equal(r1.status, 'active');
    assert.equal(r1.plan, 'advanced');
    assert.equal(r1.users, 7);
    const d1 = new Date(r1.endsAt);
    const months = (d1.getUTCFullYear() - new Date().getUTCFullYear()) * 12 + d1.getUTCMonth() - new Date().getUTCMonth();
    assert.ok(months === 3 || months === 2 || months === 4, `3 oyga uzaytirilmadi: ${r1.endsAt}`);
    assert.equal((await req('POST', '/billing/activate', { code: c1 }, A)).status, 400, 'kod ikkinchi marta ishladi');

    const r2 = await ok('POST', '/billing/activate', { code: code({ i: 'e2e-2', p: 'pro', u: 10, m: 12 }) }, A, [200, 201]);
    assert.equal(r2.plan, 'pro');
    assert.equal(r2.users, 10);
    const gain = (new Date(r2.endsAt) - d1) / 86400000;
    assert.ok(gain > 360 && gain < 370, `uzaytirish mavjud muddat oxiridan emas: +${gain} kun`);
    assert.equal(r2.history[0].id, 'e2e-2');
    assert.equal((await ok('GET', '/billing/status', undefined, A, 200)).status, 'active');
  });

  test("yashirin «xarajat» tarifi: menyuda yo'q, kod bilan ishlaydi, boshqalar kabi muddat bilan", async () => {
    const A = await admin();
    const ov = await ok('GET', '/billing', undefined, A, 200);
    assert.ok(!ov.plans.some((p) => p.key === 'cost'), "xarajat tarifi menyuda ko'rindi");
    const r = await ok('POST', '/billing/activate', { code: code({ i: 'e2e-cost', p: 'cost', u: 3, m: 3, c: 'Eksklyuziv' }) }, A, [200, 201]);
    assert.equal(r.plan, 'cost');
    assert.equal(r.planName, 'Maxsus tarif');
    assert.equal(r.users, 3);
    assert.equal(r.status, 'active');
    assert.equal(r.history[0].planName, 'Maxsus tarif');
    assert.ok(!r.plans.some((p) => p.key === 'cost'));
  });
});
