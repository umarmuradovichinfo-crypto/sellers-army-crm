// «Parolni unutdim»: bir xil javob, Telegram orqali 6 xonali kod, bir martalik, 5 urinish, 15 daqiqa, tezlik cheklovi,
// tiklangach eski parol/sessiyalar yaroqsiz. Kod testda TELEGRAM_TEST_SINK faylidan o'qiladi (bazada faqat xesh).
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { req, ok, admin, userWithRole, uniq } from './lib.mjs';

const SINK = process.env.TELEGRAM_TEST_SINK;
const secret = createHash('sha256').update('crm-tg-webhook:e2e-test-token').digest('hex').slice(0, 48);
let ipSeq = 0;
const newIp = () => `10.77.${Math.floor(Math.random() * 200)}.${++ipSeq % 250}`;
const forgot = (email, ip = newIp()) => req('POST', '/auth/forgot', { email }, null, { headers: { 'x-forwarded-for': ip } });
const reset = (body, ip = newIp()) => req('POST', '/auth/reset', body, null, { headers: { 'x-forwarded-for': ip } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sinkLines(chatId) {
  if (!SINK || !existsSync(SINK)) return [];
  return readFileSync(SINK, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.chatId === String(chatId));
}
async function waitMsg(chatId, re, since) {
  for (let i = 0; i < 40; i++) {
    const hit = sinkLines(chatId).filter((x) => x.at >= since && re.test(x.text)).pop();
    if (hit) return hit.text;
    await sleep(100);
  }
  assert.fail(`Telegram xabari kelmadi (${re})`);
}
async function codeFor(chatId, since) {
  return (await waitMsg(chatId, /parolni tiklash kodi: \d{6}/, since)).match(/(\d{6})/)[1];
}
// foydalanuvchini botga ulaydi (profil kodi + «/start <kod>»), chat id qaytadi
async function linkTg(token) {
  const st = await ok('GET', '/notifications/telegram', undefined, token, 200);
  const chatId = Math.floor(Math.random() * 1e9) + 1000;
  await req('POST', '/telegram/webhook', {
    update_id: Date.now(), message: { message_id: 1, date: Math.floor(Date.now() / 1000), text: `/start ${st.code}`, chat: { id: chatId, type: 'private' }, from: { id: chatId, first_name: 'PR' } },
  }, null, { headers: { 'x-telegram-bot-api-secret-token': secret } });
  assert.equal((await ok('GET', '/notifications/telegram', undefined, token, 200)).linked, true, 'Telegram ulanmadi');
  return chatId;
}
async function tgUser() {
  const u = await userWithRole('sotuvchi');
  return { ...u, chatId: await linkTg(u.token) };
}
async function requestCode(u) {
  const since = Date.now();
  const r = await forgot(u.email);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return codeFor(u.chatId, since);
}
const psql = (sql) => execFileSync('psql', [process.env.DATABASE_URL, '-qc', sql]);

before(async () => { await admin(); });

describe('Parolni tiklash (forgot/reset)', () => {
  test('forgot: mavjud/mavjud emas/Telegram ulanmagan — javob bir xil', async () => {
    const linked = await tgUser();
    const plain = await userWithRole('sotuvchi');
    const rs = [await forgot(`yoq-${uniq()}@test.local`), await forgot(plain.email), await forgot(linked.email)];
    for (const r of rs) assert.equal(r.status, 200);
    assert.deepEqual(rs[0].data, rs[1].data);
    assert.deepEqual(rs[1].data, rs[2].data);
    assert.match(rs[0].data.message, /Telegram ulangan bo'lsa/);
    assert.ok(!JSON.stringify(rs[2].data).match(/\d{6}/), 'javobda kod bo\'lmasligi kerak');
    // noto'g'ri formatdagi email — 400 (borligidan qat'i nazar)
    assert.equal((await forgot('emas-email')).status, 400);
  });

  test("kod bilan tiklash: email normallashtiriladi, eski parol va sessiyalar yaroqsiz, Telegram'ga xabar, jurnal", async () => {
    const u = await tgUser();
    const sess = await ok('POST', '/auth/login', { email: u.email, password: 'qa-test-Passw0rd!' }, null, 200);
    const since = Date.now();
    assert.equal((await forgot(`  ${u.email.toUpperCase()} `)).status, 200);
    const code = await codeFor(u.chatId, since);
    // yangi parol siyosati: kamida 6 belgi
    assert.equal((await reset({ email: u.email, code, newPassword: '123' })).status, 400);
    const r = await reset({ email: ` ${u.email.toUpperCase()}`, code, newPassword: 'yangi-Parol-2026' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal((await req('POST', '/auth/login', { email: u.email, password: 'qa-test-Passw0rd!' })).status, 401, 'eski parol ishlamasligi kerak');
    assert.equal((await req('POST', '/auth/refresh', { refreshToken: sess.refreshToken })).status, 401, 'eski refresh token ishlamasligi kerak');
    assert.equal((await req('GET', '/auth/me', undefined, u.token)).status, 401, 'eski access token (sessiya) yopilishi kerak');
    await ok('POST', '/auth/login', { email: u.email, password: 'yangi-Parol-2026' }, null, 200);
    await waitMsg(u.chatId, /parolingiz o'zgartirildi/, since);
    const log = await ok('GET', '/auth/log', undefined, await admin(), 200);
    assert.ok(log.items.some((x) => x.email === u.email && x.kind === 'password_reset'), 'jurnalda parol tiklash yozuvi yo\'q');
    // bir martalik: shu kod ikkinchi marta ishlamaydi
    const again = await reset({ email: u.email, code, newPassword: 'boshqa-Parol-1' });
    assert.equal(again.status, 400);
    assert.equal(again.data.error, 'CODE_INVALID');
  });

  test("noto'g'ri kod 5 marta → kod bekor (to'g'ri kod ham ishlamaydi)", async () => {
    const u = await tgUser();
    const code = await requestCode(u);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 1; i <= 4; i++) {
      const r = await reset({ email: u.email, code: wrong, newPassword: 'yangi-Parol-2026' });
      assert.equal(r.data.error, 'CODE_INVALID');
      assert.equal(r.data.details?.attemptsLeft, 5 - i);
    }
    const fifth = await reset({ email: u.email, code: wrong, newPassword: 'yangi-Parol-2026' });
    assert.equal(fifth.data.error, 'CODE_ATTEMPTS');
    const right = await reset({ email: u.email, code, newPassword: 'yangi-Parol-2026' });
    assert.equal(right.status, 400);
    assert.equal(right.data.error, 'CODE_ATTEMPTS');
    await ok('POST', '/auth/login', { email: u.email, password: 'qa-test-Passw0rd!' }, null, 200);
  });

  test('eskirgan kod (15 daqiqa) ishlamaydi; yangi kod so\'ralsa eskisi bekor', async () => {
    const u = await tgUser();
    const c1 = await requestCode(u);
    await sleep(20);
    const c2 = await requestCode(u);
    if (c1 !== c2) assert.equal((await reset({ email: u.email, code: c1, newPassword: 'yangi-Parol-2026' })).data.error, 'CODE_INVALID');
    psql(`UPDATE password_reset_codes SET "expiresAt" = '2000-01-01' WHERE email = '${u.email}'`);
    const r = await reset({ email: u.email, code: c2, newPassword: 'yangi-Parol-2026' });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, 'CODE_EXPIRED');
  });

  test("mavjud bo'lmagan email: reset xatolari mavjud foydalanuvchinikidan farq qilmaydi", async () => {
    const ghost = `ghost-${uniq()}@test.local`;
    assert.equal((await forgot(ghost)).status, 200);
    await sleep(300);
    for (let i = 1; i <= 4; i++) {
      const r = await reset({ email: ghost, code: '123456', newPassword: 'yangi-Parol-2026' });
      assert.equal(r.data.error, 'CODE_INVALID');
      assert.equal(r.data.details?.attemptsLeft, 5 - i);
    }
    assert.equal((await reset({ email: ghost, code: '123456', newPassword: 'yangi-Parol-2026' })).data.error, 'CODE_ATTEMPTS');
    // umuman so'ralmagan email
    assert.equal((await reset({ email: `none-${uniq()}@test.local`, code: '123456', newPassword: 'yangi-Parol-2026' })).data.error, 'CODE_INVALID');
  });

  test("Telegram ulanmagan foydalanuvchi: super adminga bildirishnoma (kod yuborilmaydi)", async () => {
    const name = `QA Unutgan ${uniq()}`;
    const email = `${uniq('nochan')}@test.local`;
    await ok('POST', '/settings/users', { name, email, password: 'qa-test-Passw0rd!', roleKey: 'sotuvchi' }, await admin());
    assert.equal((await forgot(email)).status, 200);
    let found = null;
    for (let i = 0; i < 30 && !found; i++) {
      const n = await ok('GET', '/notifications', undefined, await admin(), 200);
      found = n.items.find((x) => x.text.includes(name));
      if (!found) await sleep(100);
    }
    assert.ok(found, 'super adminga bildirishnoma kelmadi');
    assert.match(found.text, /parolni tiklamoqchi/);
    assert.ok(!/\d{6}/.test(found.text), 'bildirishnomada kod bo\'lmasligi kerak');
  });

  test('tezlik cheklovi: email bo\'yicha soatiga 3, IP bo\'yicha soatiga 10', async () => {
    const email = `rate-${uniq()}@test.local`;
    for (let i = 0; i < 3; i++) assert.equal((await forgot(email)).status, 200);
    assert.equal((await forgot(email)).status, 429, 'emailga 4-so\'rov cheklanishi kerak');
    const ip = newIp();
    for (let i = 0; i < 10; i++) assert.equal((await forgot(`ip-${uniq()}@test.local`, ip)).status, 200);
    assert.equal((await forgot(`ip-${uniq()}@test.local`, ip)).status, 429, 'IPdan 11-so\'rov cheklanishi kerak');
  });
});
