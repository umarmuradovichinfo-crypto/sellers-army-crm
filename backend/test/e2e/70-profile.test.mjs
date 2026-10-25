// amoCRM «Настройки профиля» va «Безопасность»: profil maydonlari, «Сеансы» (har qurilma alohida, «Выйти»),
// parol almashgach boshqa qurilmalar chiqariladi, «Резервное копирование» (parol xeshlarisiz).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { req, ok, admin, login, userWithRole } from './lib.mjs';

describe('Profil va xavfsizlik (amoCRM)', () => {
  test('profil: ism, telefon, izoh saqlanadi; boshqa email band bo\'lsa rad etiladi', async () => {
    const S = await userWithRole('sotuvchi');
    const r = await ok('PUT', '/settings/me/profile', { name: 'QA Profil', phone: '+998 90 111 22 33', note: 'izoh' }, S.token, 200);
    assert.equal(r.profile.name, 'QA Profil');
    assert.equal(r.profile.phone, '+998 90 111 22 33');
    assert.equal(r.profile.note, 'izoh');
    assert.equal(r.profile.id, S.id);
    const bad = await req('PUT', '/settings/me/profile', { email: process.env.E2E_EMAIL }, S.token);
    assert.equal(bad.status, 400);
    const ava = await req('PUT', '/settings/me/profile', { avatar: 'javascript:alert(1)' }, S.token);
    assert.equal(ava.status, 400, 'noto\'g\'ri avatar qabul qilindi');
  });

  test('sessiyalar: har kirish alohida, «Выйти» boshqa qurilmani darhol chiqaradi, joriy qoladi', async () => {
    const S = await userWithRole('sotuvchi');
    const t2 = await login(S.email, 'qa-test-Passw0rd!');
    const p = await ok('GET', '/settings/me/profile', undefined, S.token, 200);
    assert.ok(p.sessions.length >= 2, `sessiyalar: ${p.sessions.length}`);
    assert.equal(p.sessions.filter((s) => s.current).length, 1);
    const other = p.sessions.find((s) => !s.current);
    await ok('DELETE', `/settings/me/sessions/${other.id}`, undefined, S.token, 200);
    assert.equal((await req('GET', '/auth/me', undefined, t2)).status, 401, 'yopilgan sessiya tokeni hali ishlayapti');
    await ok('GET', '/auth/me', undefined, S.token, 200);
    // boshqa foydalanuvchining sessiyasini yopib bo'lmaydi
    const A = await admin();
    const mine = (await ok('GET', '/settings/me/profile', undefined, A, 200)).sessions[0];
    assert.equal((await req('DELETE', `/settings/me/sessions/${mine.id}`, undefined, S.token)).status, 404);
  });

  test("parol almashgach joriy qurilmadan tashqari hammasi chiqariladi", async () => {
    const S = await userWithRole('sotuvchi');
    const t2 = await login(S.email, 'qa-test-Passw0rd!');
    await ok('POST', '/settings/me/password', { currentPassword: 'qa-test-Passw0rd!', password: 'yangi-Passw0rd!' }, S.token);
    assert.equal((await req('GET', '/auth/me', undefined, t2)).status, 401);
    await ok('GET', '/auth/me', undefined, S.token, 200);
  });

  test('zaxira nusxa: JSON, parol xeshi va tokenlarsiz; sotuvchiga taqiqlangan', async () => {
    const r = await req('GET', '/settings/backup', undefined, await admin());
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.data.leads) && Array.isArray(r.data.users) && Array.isArray(r.data.messages), Object.keys(r.data || {}).join(','));
    const raw = JSON.stringify(r.data);
    assert.ok(!/passwordHash|tokenHash|sipPassword/.test(raw), 'zaxirada maxfiy maydon bor');
    const S = await userWithRole('sotuvchi');
    assert.equal((await req('GET', '/settings/backup', undefined, S.token)).status, 403);
  });
});
