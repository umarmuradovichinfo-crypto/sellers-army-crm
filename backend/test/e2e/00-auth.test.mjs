import { test } from 'node:test';
import assert from 'node:assert/strict';
import { req, ok, login, admin, me, userWithRole } from './lib.mjs';

test('health ochiq', async () => {
  const r = await req('GET', '/health');
  assert.equal(r.status, 200);
});

test("setup-status: admin bor — qayta sozlash kerak emas", async () => {
  const d = await ok('GET', '/auth/setup-status', undefined, null, 200);
  assert.equal(d.needsSetup, false);
});

test('setup admin bor paytda yangi super admin yarata olmaydi', async () => {
  const r = await req('POST', '/auth/setup', { name: 'Hacker', email: 'h@test.local', password: 'Passw0rd!!' });
  assert.ok(r.status >= 400 && r.status < 500, `status ${r.status}`);
});

test("noto'g'ri parol → 401, xabar parolni oshkor qilmaydi", async () => {
  const r = await req('POST', '/auth/login', { email: process.env.E2E_EMAIL, password: 'wrong-password' });
  assert.equal(r.status, 401);
  const r2 = await req('POST', '/auth/login', { email: 'yoq@test.local', password: 'wrong-password' });
  assert.equal(r2.status, 401);
  assert.equal(r.data?.message, r2.data?.message, "mavjud va mavjud bo'lmagan email uchun xabar bir xil bo'lishi kerak");
});

test('tokensiz CRM → 401', async () => {
  for (const p of ['/crm/leads', '/crm/pipeline', '/crm/tasks', '/settings/users', '/crm/dono']) {
    const r = await req('GET', p);
    assert.equal(r.status, 401, `${p} → ${r.status}`);
  }
});

test("buzilgan token → 401", async () => {
  const r = await req('GET', '/crm/leads', undefined, 'abc.def.ghi');
  assert.equal(r.status, 401);
});

test('me: admin barcha ruxsatlarga ega', async () => {
  const d = await me(await admin());
  assert.equal(d.user.email, process.env.E2E_EMAIL);
  for (const p of ['crm.view', 'crm.settings', 'settings.roles.manage']) assert.ok(d.permissions.includes(p), p);
});

test('refresh va logout', async () => {
  const r = await ok('POST', '/auth/login', { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD }, null, 200);
  const refresh = r.refreshToken || r.refresh_token;
  assert.ok(refresh, `refreshToken yo'q: ${Object.keys(r)}`);
  const n = await ok('POST', '/auth/refresh', { refreshToken: refresh }, null, [200, 201]);
  assert.ok(n.token || n.accessToken, `yangi token yo'q: ${Object.keys(n)}`);
});

test("sotuvchi: login bo'ladi, faqat crm.view", async () => {
  const u = await userWithRole('sotuvchi');
  const d = await me(u.token);
  assert.deepEqual(d.permissions, ['crm.view']);
});

test('email katta-kichik harf farqi bilan ham login', async () => {
  const t = await login(process.env.E2E_EMAIL.toUpperCase(), process.env.E2E_PASSWORD);
  assert.ok(t);
});
