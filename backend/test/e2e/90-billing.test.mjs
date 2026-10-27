// Obuna va to'lov (qo'lda, OnlinePBX litsenziyalari kabi): har kod — alohida litsenziya qatori (renew/new/addon), qayta ishlatishdan himoya,
// davr va kunlik narx hisobi. Vaqtga bog'liq holatlar (kelajak davr faollashishi, grace, eski holatdan ko'chirish) — 91-billing-enforce.
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
    assert.deepEqual(ov.licenses, []);
    assert.deepEqual(ov.addonQuotes, [], "faol litsenziyasiz qo'shimcha foydalanuvchi narxi chiqdi");
    // kunlik narx = oylik / 30 (1 foydalanuvchi)
    assert.deepEqual(ov.dailyRates, { basic: 1316.67, advanced: 2983.33, pro: 4316.67 });
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
    // turi noma'lum; renew/new uchun davr majburiy
    assert.equal((await req('POST', '/billing/activate', { code: code({ i: 'b5', p: 'pro', u: 1, m: 3, t: 'gift' }) }, A)).status, 400);
    assert.equal((await req('POST', '/billing/activate', { code: code({ i: 'b6', p: 'pro', u: 1, m: 0, t: 'new' }) }, A)).status, 400);
    // foydalanuvchi qo'shish faol litsenziyasiz rad etiladi (sinov davrida ham)
    const add = await req('POST', '/billing/activate', { code: code({ i: 'b7', p: 'basic', u: 2, m: 0, t: 'addon' }) }, A);
    assert.equal(add.status, 400);
    assert.equal(add.data?.error, 'NO_ACTIVE_LICENSE');
    assert.equal((await ok('GET', '/billing/status', undefined, A, 200)).status, 'trial', 'xato kodlar holatni o\'zgartirdi');
  });

  test('faollashtirish: 3 oy; shu tarifni uzaytirish — oldindan to\'langan kelajak litsenziya; kod bir marta ishlaydi', async () => {
    const A = await admin();
    const c1 = code({ i: 'e2e-1', p: 'advanced', u: 7, m: 3, c: 'QA mijoz' });
    const r1 = await ok('POST', '/billing/activate', { code: c1 }, A, [200, 201]);
    assert.equal(r1.status, 'active');
    assert.equal(r1.plan, 'advanced');
    assert.equal(r1.users, 7);
    const d1 = new Date(r1.endsAt);
    const months = (d1.getUTCFullYear() - new Date().getUTCFullYear()) * 12 + d1.getUTCMonth() - new Date().getUTCMonth();
    assert.ok(months === 3 || months === 2 || months === 4, `3 oyga uzaytirilmadi: ${r1.endsAt}`);
    assert.equal(r1.licenses.length, 1);
    const l1 = r1.licenses[0];
    assert.deepEqual([l1.id, l1.plan, l1.planName, l1.users, l1.status, l1.type], ['e2e-1', 'advanced', 'Kengaytirilgan', 7, 'active', 'renew']);
    assert.ok(l1.days >= 89 && l1.days <= 93, `kunlar: ${l1.days}`);
    assert.equal(l1.amount, 7 * 89500 * 3, "litsenziya summasi to'langan narxga teng emas");
    assert.equal((await req('POST', '/billing/activate', { code: c1 }, A)).status, 400, 'kod ikkinchi marta ishladi');

    // xuddi shu tarifni uzaytirish: joriy litsenziya oxiridan boshlanadigan kelajak davr (hozir o'rindiq/muddat bermaydi)
    const r2 = await ok('POST', '/billing/activate', { code: code({ i: 'e2e-2', p: 'advanced', u: 7, m: 12 }) }, A, [200, 201]);
    const l2 = r2.licenses.find((l) => l.id === 'e2e-2');
    assert.equal(l2.status, 'future');
    assert.equal(l2.from, l1.until, 'uzaytirish mavjud muddat oxiridan emas');
    const gain = (new Date(l2.until) - d1) / 86400000;
    assert.ok(gain > 360 && gain < 370, `uzaytirish +${gain} kun`);
    assert.equal(r2.users, 7, "kelajak litsenziya hozir o'rindiq qo'shdi");
    assert.equal(r2.endsAt, r1.endsAt, 'faol muddat kelajak litsenziya bilan siljidi');
    assert.equal(r2.paidUntil, l2.until, "to'langan qamrov kelajak davrni hisobga olmadi");
    assert.ok(r2.paidDaysLeft > 360);
    assert.equal(r2.history[0].id, 'e2e-2');
    assert.equal(r2.history[0].type, 'renew');
    const st = await ok('GET', '/billing/status', undefined, A, 200);
    assert.equal(st.status, 'active');
    assert.ok(st.paidDaysLeft > 360, 'banner uchun qamrov kunlari');
  });

  test("ikki litsenziya yig'iladi (1 + 7 = 8 o'rindiq); «yangi» kod bugundan boshlanadi, tarif — eng yuqori faol", async () => {
    const A = await admin();
    const r = await ok('POST', '/billing/activate', { code: code({ i: 'e2e-new', p: 'pro', u: 1, m: 3, t: 'new' }) }, A, [200, 201]);
    assert.equal(r.users, 8, "o'rindiqlar yig'ilmadi");
    assert.equal(r.plan, 'pro');
    const l = r.licenses.find((x) => x.id === 'e2e-new');
    assert.equal(l.status, 'active');
    assert.equal(l.type, 'new');
    assert.ok(Math.abs(new Date(l.from) - Date.now()) < 60_000, 'yangi litsenziya bugundan boshlanmadi');
    assert.equal(r.licenses.filter((x) => x.status === 'active').reduce((a, x) => a + x.users, 0), 8);
  });

  test("foydalanuvchi qo'shish: bugundan faol muddat oxirigacha, narx qolgan kunlarga proporsional", async () => {
    const A = await admin();
    const ov = await ok('GET', '/billing', undefined, A, 200);
    const q = ov.addonQuotes.find((x) => x.plan === 'advanced');
    assert.ok(ov.addonUntil && q, "qo'shimcha foydalanuvchi narxi yo'q");
    assert.equal(q.days, ov.addonDays);
    assert.equal(q.total, Math.round((89500 / 30) * q.days), '1 foydalanuvchi narxi = kunlik × qolgan kun');
    assert.ok(!ov.addonQuotes.some((x) => x.plan === 'cost'));
    const r = await ok('POST', '/billing/activate', { code: code({ i: 'e2e-add', p: 'advanced', u: 2, m: 0, t: 'addon' }) }, A, [200, 201]);
    const l = r.licenses.find((x) => x.id === 'e2e-add');
    assert.equal(l.status, 'active');
    assert.equal(l.until, ov.addonUntil, "qo'shimcha foydalanuvchi muddati faol muddat oxiriga teng emas");
    assert.ok(Math.abs(l.amount - q.total * 2) <= 2 * Math.round(89500 / 30), `summa ${l.amount} ≈ ${q.total * 2}`);
    assert.equal(r.users, 10);
    assert.equal(r.endsAt, ov.endsAt, "qo'shimcha foydalanuvchi muddatni uzaytirdi");
    assert.equal(r.history[0].months, 0);
  });

  test("yashirin «xarajat» tarifi: menyuda yo'q, kod bilan ishlaydi, boshqalar kabi muddat bilan", async () => {
    const A = await admin();
    const ov = await ok('GET', '/billing', undefined, A, 200);
    assert.ok(!ov.plans.some((p) => p.key === 'cost'), "xarajat tarifi menyuda ko'rindi");
    assert.ok(!('cost' in ov.dailyRates));
    const r = await ok('POST', '/billing/activate', { code: code({ i: 'e2e-cost', p: 'cost', u: 3, m: 3, c: 'Eksklyuziv' }) }, A, [200, 201]);
    const l = r.licenses.find((x) => x.id === 'e2e-cost');
    assert.equal(l.planName, 'Maxsus tarif');
    assert.equal(l.users, 3);
    assert.equal(l.status, 'active');
    assert.equal(l.amount, 0);
    assert.equal(r.status, 'active');
    assert.equal(r.users, 13);
    assert.equal(r.plan, 'pro', "teng darajada ko'rinadigan tarif ko'rsatilsin");
    assert.equal(r.history[0].planName, 'Maxsus tarif');
    assert.ok(!r.plans.some((p) => p.key === 'cost'));
    assert.ok(!r.addonQuotes.some((x) => x.plan === 'cost'));
  });

  test('kod o\'rnatishga bog\'lanadi: boshqa installId rad, o\'zinikiga ishlaydi; bir vaqtda ikki marta kiritilsa faqat biri o\'tadi', async () => {
    const A = await admin();
    const ov = await ok('GET', '/billing', undefined, A, 200);
    assert.match(ov.installId, /^[0-9a-f]{10}$/);
    const bad = await req('POST', '/billing/activate', { code: code({ i: 'bind-x', p: 'basic', u: 3, m: 3, d: 'ffffffffff' }) }, A);
    assert.equal(bad.status, 400);
    const good = code({ i: 'bind-ok', p: 'basic', u: 3, m: 3, d: ov.installId });
    const [r1, r2] = await Promise.all([req('POST', '/billing/activate', { code: good }, A), req('POST', '/billing/activate', { code: good }, A)]);
    assert.deepEqual([r1.status, r2.status].sort(), [201, 400], 'bitta kod ikki marta ishladi');
  });
});
