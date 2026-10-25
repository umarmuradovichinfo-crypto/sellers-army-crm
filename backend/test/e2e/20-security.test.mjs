import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { req, ok, admin, uniq, userWithRole, newLead } from './lib.mjs';

let T;
before(async () => { T = await admin(); });

describe('Login: parol tanlashdan himoya', () => {
  test("10 ta xato urinishdan so'ng 429, to'g'ri parol ham kutishi kerak", async () => {
    const email = `${uniq('brute')}@test.local`;
    const statuses = [];
    for (let i = 0; i < 12; i++) statuses.push((await req('POST', '/auth/login', { email, password: `wrong-${i}` })).status);
    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));
    assert.equal(statuses[10], 429, `11-urinish: ${statuses[10]}`);
  });

  test("boshqa email bloklanmaydi (bir xato foydalanuvchi butun ofisni bloklamasin)", async () => {
    const r = await req('POST', '/auth/login', { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD });
    assert.equal(r.status, 200);
  });
});

describe('Telegram webhook', () => {
  const secret = createHash('sha256').update('crm-tg-webhook:e2e-test-token').digest('hex').slice(0, 48);
  const update = (chatId, text) => ({ update_id: Date.now(), message: { message_id: Date.now(), date: Math.floor(Date.now() / 1000), text, chat: { id: chatId, type: 'private' }, from: { id: chatId, first_name: 'Soxta' } } });

  test("maxfiy kalitsiz soxta xabar CRM'ga kirmaydi", async () => {
    const chatId = Math.floor(Math.random() * 1e9);
    const r = await req('POST', '/telegram/webhook', update(chatId, 'soxta xabar'));
    assert.ok(r.status < 500);
    assert.equal(r.data?.error, 'BAD_SECRET');
    const list = await ok('GET', `/crm/leads?search=Soxta`, undefined, T, 200);
    assert.ok(!list.leads.some((l) => JSON.stringify(l).includes(String(chatId))));
  });

  test("noto'g'ri kalit bilan ham rad etiladi", async () => {
    const r = await req('POST', '/telegram/webhook', update(1, 'x'), null, { headers: { 'x-telegram-bot-api-secret-token': 'guess' } });
    assert.equal(r.data?.error, 'BAD_SECRET');
  });

  test("to'g'ri kalit bilan mijoz xabari bitimga aylanadi", async () => {
    const chatId = Math.floor(Math.random() * 1e9);
    const r = await req('POST', '/telegram/webhook', update(chatId, 'Salom, narxi qancha?'), null, { headers: { 'x-telegram-bot-api-secret-token': secret } });
    assert.ok(r.status < 300, `${r.status} ${JSON.stringify(r.data)}`);
    assert.notEqual(r.data?.error, 'BAD_SECRET');
    const conv = await ok('GET', '/crm/conversations', undefined, T, 200);
    assert.ok(JSON.stringify(conv).includes('narxi qancha'), 'xabar suhbatlarda yo`q');
  });
});

describe('Ommaviy forma', () => {
  let slug;
  before(async () => {
    const f = await ok('POST', '/crm/forms', { title: uniq('Forma') }, T);
    slug = (f.form || f).slug;
  });

  test("forma ochiq ko'rinadi, mavjud bo'lmagani 404", async () => {
    assert.equal((await req('GET', `/public/crm-forms/${slug}`)).status, 200);
    assert.equal((await req('GET', '/public/crm-forms/yoq-forma-xyz')).status, 404);
  });

  test("majburiy maydonsiz ariza → 400", async () => {
    const r = await req('POST', `/public/crm-forms/${slug}`, { answers: { name: '' } });
    assert.equal(r.status, 400);
  });

  test('ariza bitim yaratadi (saralanmaganlarga)', async () => {
    const name = uniq('FormaMijoz');
    await ok('POST', `/public/crm-forms/${slug}`, { answers: { name, phone: '+998901112233' } });
    const u = await ok('GET', '/crm/unsorted', undefined, T, 200);
    assert.ok(JSON.stringify(u).includes(name), 'ariza saralanmaganlarda yo`q');
  });

  test("spam: bir IP'dan ko'p ariza → 429", async () => {
    let last;
    for (let i = 0; i < 25; i++) {
      last = await req('POST', `/public/crm-forms/${slug}`, { answers: { name: `spam ${i}`, phone: '+998900000000' } });
      if (last.status === 429) break;
    }
    assert.equal(last.status, 429);
  });

  test("o'chirilgan (nofaol) forma ariza qabul qilmaydi", async () => {
    const f = await ok('POST', '/crm/forms', { title: uniq('Nofaol'), active: false }, T);
    const r = await req('POST', `/public/crm-forms/${(f.form || f).slug}`, { answers: { name: 'x', phone: '1' } });
    assert.equal(r.status, 404);
  });
});

describe('iCal', () => {
  test("noto'g'ri token → 404", async () => {
    assert.equal((await req('GET', `/crm/ical/${'a'.repeat(48)}.ics`)).status, 404);
    assert.equal((await req('GET', '/crm/ical/../../etc/passwd')).status, 404);
  });

  test("o'z havolasi ishlaydi, reset'dan keyin eskisi ishlamaydi", async () => {
    const l = await ok('GET', '/crm/ical-link', undefined, T, 200);
    const url = l.url || l.link || l.path;
    assert.ok(url, JSON.stringify(l));
    const file = url.split('/').pop();
    assert.equal((await req('GET', `/crm/ical/${file}`)).status, 200);
    await ok('POST', '/crm/ical-link/reset', undefined, T);
    assert.equal((await req('GET', `/crm/ical/${file}`)).status, 404);
  });
});

describe("Boshqa foydalanuvchi ma'lumotlari", () => {
  test("bildirishnomani boshqa foydalanuvchi o'qilgan qila olmaydi", async () => {
    const S = await userWithRole('sotuvchi');
    const l = await newLead(T, { assigneeId: S.id });
    const n = await ok('GET', '/notifications', undefined, S.token, 200);
    const item = (n.notifications || n.items || n).find((x) => (x.text || '').includes(l.n));
    assert.ok(item, 'sotuvchiga biriktirilgan bitim haqida bildirishnoma kelmadi');
    await req('POST', `/notifications/${item.id}/read`, undefined, T);
    const n2 = await ok('GET', '/notifications', undefined, S.token, 200);
    const again = (n2.notifications || n2.items || n2).find((x) => x.id === item.id);
    assert.ok(!again.read, "admin boshqa foydalanuvchining bildirishnomasini o'qilgan qilib qo'ydi");
  });

  test("saqlangan filtrni boshqa foydalanuvchi o'chira olmaydi", async () => {
    const S = await userWithRole('sotuvchi');
    const f = await ok('POST', '/crm/filters', { name: uniq('filtr'), query: { search: 'x' } }, S.token);
    const id = (f.filter || f).id;
    await req('DELETE', `/crm/filters/${id}`, undefined, T);
    const mine = await ok('GET', '/crm/filters', undefined, S.token, 200);
    assert.ok((mine.filters || mine).some((x) => x.id === id), "boshqa foydalanuvchi filtrni o'chirib yubordi");
  });
});
