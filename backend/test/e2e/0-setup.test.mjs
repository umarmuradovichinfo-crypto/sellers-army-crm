// Bo'sh bazada birinchi ishga tushirish: «Birinchi sozlash» ekrani orqali super admin yaratish (eski scripts/smoke dan ko'chirildi)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { req } from './lib.mjs';

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

test("birinchi sozlash: validatsiya, bir vaqtdagi ikki so'rovdan faqat bittasi, keyin yopiladi", async (t) => {
  const st0 = await req('GET', '/auth/setup-status');
  assert.equal(st0.status, 200);
  if (!st0.data.needsSetup) return t.skip('baza allaqachon sozlangan');
  assert.equal(st0.data.tokenRequired, false);

  assert.equal((await req('POST', '/auth/setup', { name: 'A', email: 'bad', password: PASSWORD })).status, 400);
  assert.equal((await req('POST', '/auth/setup', { name: 'A', email: EMAIL, password: 'short' })).status, 400);
  assert.equal((await req('POST', '/auth/setup', { name: '', email: EMAIL, password: PASSWORD })).status, 400);
  assert.equal((await req('GET', '/auth/setup-status')).data.needsSetup, true, "noto'g'ri urinishlardan keyin ham sozlash kutilishi kerak");

  const race = await Promise.all([1, 2, 3].map(() => req('POST', '/auth/setup', { name: 'QA Admin', email: EMAIL, password: PASSWORD })));
  const oks = race.filter((r) => r.status === 200 || r.status === 201);
  assert.equal(oks.length, 1, `bir vaqtda faqat bitta admin yaratilishi kerak: ${race.map((r) => r.status)}`);
  assert.ok(race.filter((r) => r.status === 403).length === 2);
  const res = oks[0].data;
  assert.ok(res.token && res.refreshToken && res.permissions?.length && res.user?.role === 'super_admin', JSON.stringify(res).slice(0, 200));

  const again = await req('POST', '/auth/setup', { name: 'Again', email: `again-${EMAIL}`, password: PASSWORD });
  assert.equal(again.status, 403);
  assert.equal((await req('GET', '/auth/setup-status')).data.needsSetup, false);
});
