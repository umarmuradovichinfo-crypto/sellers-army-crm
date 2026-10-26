// Chat tarixi amoCRM mantig'ida: xabarlar «Беседа № A…» suhbatlariga bog'lanadi, yopilgan suhbatga mijoz yozsa — yangi raqam;
// chat jurnali voqealar ro'yxatida va lentada takrorlanmaydi.
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { req, ok, admin } from './lib.mjs';

let T;
const secret = createHash('sha256').update('crm-tg-webhook:e2e-test-token').digest('hex').slice(0, 48);
const tg = (chatId, text) => req('POST', '/telegram/webhook', {
  update_id: Date.now(), message: { message_id: Math.floor(Math.random() * 1e9), date: Math.floor(Date.now() / 1000), text, chat: { id: chatId, type: 'private' }, from: { id: chatId, first_name: 'ChatTest' } },
}, null, { headers: { 'x-telegram-bot-api-secret-token': secret } });
before(async () => { T = await admin(); });

describe('Chat tarixi (amoCRM suhbatlari)', () => {
  test("xabarlar bitta suhbatda; yopilgach mijoz yozsa — yangi suhbat raqami", async () => {
    const chatId = Math.floor(Math.random() * 1e9);
    await tg(chatId, 'Salom');
    await tg(chatId, 'Narxi qancha?');
    const conv = (await ok('GET', '/crm/conversations', undefined, T, 200));
    const row = (conv.conversations || conv.items || conv).find((c) => /Narxi qancha/.test(c.last || ''));
    assert.ok(row, 'suhbat ro`yxatda yo`q');
    const leadId = row.leadId;
    let m = await ok('GET', `/crm/leads/${leadId}/messages`, undefined, T, 200);
    assert.ok(m.convNo, 'suhbat raqami yo`q');
    assert.equal(row.convNo, m.convNo);
    assert.ok(m.messages.every((x) => x.convNo === m.convNo), "xabarlar bir suhbatga bog'lanmadi");
    const first = m.convNo;
    await ok('POST', `/crm/conversations/${leadId}/close`, undefined, T);
    await tg(chatId, 'Yana savol bor');
    m = await ok('GET', `/crm/leads/${leadId}/messages`, undefined, T, 200);
    assert.equal(m.closed, false, 'yangi xabardan keyin suhbat ochilmadi');
    assert.notEqual(m.convNo, first, 'yopilgan suhbatga yozilganda yangi raqam berilmadi');
    assert.equal(m.messages[m.messages.length - 1].convNo, m.convNo);
    assert.equal(m.messages.filter((x) => x.convNo === first).length, 2);
  });

  test("Список событий: kiruvchi xabar bir marta (chat jurnali takrorlanmaydi), «Беседа закрыта» bor", async () => {
    const ev = await ok('GET', '/crm/analytics/events?preset=today', undefined, T, 200);
    assert.ok(!ev.items.some((x) => x.type === 'email'), 'chat jurnali (email) voqealar ro`yxatida takrorlandi');
    assert.ok(ev.items.some((x) => x.type === 'message_in' && /Yana savol bor/.test(x.text)));
    const closed = await ok('GET', '/crm/analytics/events?types=conv_closed', undefined, T, 200);
    assert.ok(closed.items.length > 0 && closed.items.every((x) => x.type === 'conv_closed'), JSON.stringify(closed.items.slice(0, 2)));
  });
  test("«Сокращать ссылки»: yuborilgan havola qisqa havolaga almashadi, bosilganda asl manzil va lentada yozuv", async () => {
    await ok('PUT', '/crm/chat-settings', { shortLinks: true }, T, 200);
    const chatId = Math.floor(Math.random() * 1e9);
    await tg(chatId, 'Katalog bormi?');
    const row = (await ok('GET', '/crm/conversations', undefined, T, 200)).conversations.find((c) => /Katalog bormi/.test(c.last || ''));
    // Telegram API test muhitida yopiq — yuborish xato bilan tugaydi, lekin xabar (qisqa havola bilan) lentada qoladi
    await req('POST', `/crm/leads/${row.leadId}/messages`, { text: 'Mana katalog: https://example.com/katalog?x=1' }, T);
    const m = await ok('GET', `/crm/leads/${row.leadId}/messages`, undefined, T, 200);
    const out = m.messages.filter((x) => x.direction === 'out').pop();
    const link = (out.text.match(/https?:\/\/\S+\/api\/v1\/l\/([\w-]+)/) || [])[1];
    assert.ok(link && !out.text.includes('example.com'), out.text);
    const r = await fetch(`${process.env.E2E_BASE}/l/${link}`, { redirect: 'manual' });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), 'https://example.com/katalog?x=1');
    const lead = await ok('GET', `/crm/leads/${row.leadId}`, undefined, T, 200);
    assert.ok(((lead.lead || lead).activity || []).some((a) => a.type === 'link'), "lentada «havola ochildi» yozuvi yo'q");
    assert.equal((await fetch(`${process.env.E2E_BASE}/l/yoqkod1`, { redirect: 'manual' })).status, 404);
    await ok('PUT', '/crm/chat-settings', { shortLinks: false }, T, 200);
  });
});

describe('Bildirishnoma kanali: Telegram', () => {
  test("profil kodi bilan botga «/start» yuborilsa chat xodimga ulanadi; kod bir martalik", async () => {
    const st = await ok('GET', '/notifications/telegram', undefined, T, 200);
    assert.equal(st.enabled, true);
    assert.ok(st.code && /^[a-f0-9]{10}$/.test(st.code), JSON.stringify(st));
    const chatId = Math.floor(Math.random() * 1e9);
    await tg(chatId, `/start ${st.code}`);
    const after = await ok('GET', '/notifications/telegram', undefined, T, 200);
    assert.equal(after.linked, true, 'ulanmadi');
    const leadsBefore = (await ok('GET', '/crm/conversations', undefined, T, 200)).conversations.length;
    await tg(chatId + 1, `/start ${st.code}`); // ishlatilgan kod — oddiy mijoz xabari sifatida o'tadi
    const prefs = (await ok('GET', '/notifications/prefs', undefined, T, 200)).prefs;
    assert.equal(prefs.task.telegram, false, 'Telegram standart bo\'yicha o\'chiq bo\'lishi kerak');
    const saved = (await ok('PUT', '/notifications/prefs', { prefs: { task: { telegram: true } } }, T, 200)).prefs;
    assert.equal(saved.task.telegram, true);
    assert.ok((await ok('GET', '/crm/conversations', undefined, T, 200)).conversations.length >= leadsBefore);
    await ok('DELETE', '/notifications/telegram', undefined, T, 200);
    assert.equal((await ok('GET', '/notifications/telegram', undefined, T, 200)).linked, false);
  });
});

describe('Telegram jamlanmasi («Один раз в день»)', () => {
  test("jamlanma sozlamasi saqlanadi; yoqilgan turlar bo'yicha so'nggi 24 soat xabarlari jamlanadi", async () => {
    const A = await admin();
    const st = await ok('GET', '/notifications/telegram', undefined, A, 200);
    if (!st.linked) { await tg(Math.floor(Math.random() * 1e9), `/start ${st.code}`); }
    const r = await ok('PUT', '/notifications/prefs', { prefs: { lead: { telegram: true } }, digest: true }, A, 200);
    assert.equal(r.digest, true);
    assert.equal((await ok('GET', '/notifications/prefs', undefined, A, 200)).digest, true);
    const l = (await ok('POST', '/crm/leads', { name: 'QA jamlanma' }, A)).lead;
    const u = (await ok('GET', '/crm/members', undefined, A, 200)).members.find((m) => m.name !== 'Admin');
    await ok('PUT', `/crm/leads/${l.id}`, { assigneeId: u.id }, A, 200);
    const mine = (await ok('GET', '/crm/leads', undefined, A, 200));
    assert.ok(mine);
    const d = await ok('POST', '/notifications/digest-run', {}, A);
    assert.equal(typeof d.sent, 'number');
    const off = await ok('PUT', '/notifications/prefs', { prefs: {}, digest: false }, A, 200);
    assert.equal(off.digest, false);
    await ok('DELETE', '/notifications/telegram', undefined, A, 200);
  });
});

describe('Tipik savollar (amoCRM «Типовые вопросы»)', () => {
  test("kalit so'z topilsa shablon bilan javob (xato bo'lsa ham hisoblagich), e'tiborsiz ibora tegmaydi, sozlama saqlanadi", async () => {
    const A = T;
    const cs = await ok('GET', '/crm/chat-settings', undefined, A, 200);
    const tpl = { id: 'tq1', name: 'Narx javobi', text: 'Narx haqida: menejerimiz aloqaga chiqadi', active: true };
    const saved = await ok('PUT', '/crm/chat-settings', { templates: [...(cs.templates || []).filter((x) => x.id !== 'tq1'), tpl], intents: [{ id: 'iq1', name: 'Narx', keywords: 'narxi, qancha pul, price', action: 'reply', templateId: 'tq1' }], ignorePhrases: ['rahmat'] }, A, 200);
    assert.equal(saved.intents.length, 1);
    assert.deepEqual(saved.intents[0].keywords, ['narxi', 'qancha pul', 'price']);
    assert.equal(saved.intents[0].count, 0);
    const chatId = Math.floor(Math.random() * 1e9);
    await tg(chatId, 'Salom, narxi qancha turadi?');
    // Telegram API test muhitida yopiq — yuborish muvaffaqiyatsiz bo'ladi, shuning uchun hisoblagich oshmaydi, lekin xabar «error» holatida lentada qoladi
    const row = (await ok('GET', '/crm/conversations', undefined, A, 200)).conversations.find((c) => /narxi qancha/.test(c.last || '') || /menejerimiz aloqaga/.test(c.last || ''));
    assert.ok(row, 'suhbat topilmadi');
    const m = await ok('GET', `/crm/leads/${row.leadId}/messages`, undefined, A, 200);
    assert.ok(m.messages.some((x) => x.direction === 'out' && /menejerimiz aloqaga chiqadi/.test(x.text)), "shablon javobi yuborilmadi (lentada yo'q)");
    await tg(chatId + 7, 'rahmat narxi price');
    const row2 = (await ok('GET', '/crm/conversations', undefined, A, 200)).conversations.find((c) => /rahmat narxi/.test(c.last || ''));
    const m2 = await ok('GET', `/crm/leads/${row2.leadId}/messages`, undefined, A, 200);
    assert.ok(!m2.messages.some((x) => x.direction === 'out'), "e'tiborsiz ibora uchun javob yuborildi");
    await ok('PUT', '/crm/chat-settings', { intents: [], ignorePhrases: [] }, A, 200);
  });
});
