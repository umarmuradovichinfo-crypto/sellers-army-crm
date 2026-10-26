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

describe('Muntazam hisobot («Регулярный отчет»)', () => {
  test("sozlama saqlanadi va prefs saqlanganda o'chib ketmaydi; ko'rsatkichlar qaytadi; Telegram ulanmagan bo'lsa yuborilmaydi", async () => {
    const r = await ok('PUT', '/notifications/report', { on: true, hour: 9 }, T, 200);
    assert.deepEqual([r.on, r.hour], [true, 9]);
    await ok('PUT', '/notifications/prefs', { prefs: { task: { main: true } } }, T, 200);
    const g = await ok('GET', '/notifications/report', undefined, T, 200);
    assert.equal(g.on, true, 'prefs saqlash hisobot sozlamasini o\'chirib yubordi');
    assert.equal(g.hour, 9);
    assert.equal(typeof g.preview.created, 'number');
    assert.equal((await ok('PUT', '/notifications/report', { hour: 99 }, T, 200)).hour, 9, "noto'g'ri soat qabul qilindi");
    const st = await ok('GET', '/notifications/telegram', undefined, T, 200);
    if (!st.linked) assert.equal((await ok('POST', '/notifications/report-run', {}, T)).sent, false);
    await ok('PUT', '/notifications/report', { on: false }, T, 200);
  });
});

describe('Muntazam hisobot («Регулярный отчет»)', () => {
  test("sozlama saqlanadi, ko'rsatkichlar qaytadi, Telegram ulanmagan bo'lsa yuborilmaydi", async () => {
    const r0 = await ok('GET', '/notifications/report', undefined, T, 200);
    assert.equal(typeof r0.preview.created, 'number');
    const s = await ok('PUT', '/notifications/report', { on: true, hour: 9 }, T, 200);
    assert.deepEqual([s.on, s.hour], [true, 9]);
    assert.equal((await ok('PUT', '/notifications/report', { hour: 99 }, T, 200)).hour, 9, "noto'g'ri soat qabul qilindi");
    // hisobot sozlamasi bildirishnoma sozlamasini saqlaganda yo'qolmasligi kerak
    await ok('PUT', '/notifications/prefs', { prefs: { task: { browser: true } } }, T, 200);
    assert.equal((await ok('GET', '/notifications/report', undefined, T, 200)).on, true);
    const run = await ok('POST', '/notifications/report-run', {}, T);
    assert.equal(typeof run.sent, 'boolean');
    await ok('PUT', '/notifications/report', { on: false }, T, 200);
  });
});

describe('Onlayn chat vidjeti (amoCRM «Онлайн чаты»)', () => {
  test("vidjet skripti beriladi, mehmon yozadi → bitim + suhbat, operator javobi mehmonga qaytadi; noto'g'ri kalit/rate-limit", async () => {
    const cs = await ok('GET', '/crm/chat-settings', undefined, T, 200);
    const saved = await ok('PUT', '/crm/chat-settings', { webChats: [{ id: 'wq1', name: 'Asosiy sayt', greeting: 'Salom!', color: '#118833' }] }, T, 200);
    const w = saved.webChats[0];
    assert.ok(w.key && w.key.length >= 8, 'kalit yaratilmadi');
    const again = await ok('PUT', '/crm/chat-settings', { webChats: [{ id: 'wq1', name: 'Asosiy sayt 2', key: 'HACK-KEY-123' }] }, T, 200);
    assert.equal(again.webChats[0].key, w.key, "kalit o'zgarmasligi kerak");
    const base = process.env.E2E_BASE;
    const js = await fetch(`${base}/webchat/${w.key}/widget.js`);
    assert.equal(js.status, 200);
    const code = await js.text();
    assert.ok(code.includes(w.key));
    assert.doesNotThrow(() => new Function(code), 'vidjet skriptida sintaksis xatosi');
    assert.equal((await fetch(`${base}/webchat/yoqkalit123/widget.js`)).status, 404);

    const vid = 'vis' + Math.random().toString(36).slice(2, 12);
    const send = (text) => fetch(`${base}/webchat/${w.key}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitorId: vid, name: 'Saytchi', text }) });
    assert.equal((await send('Salom, narx qancha?')).status, 201);
    const conv = (await ok('GET', '/crm/conversations', undefined, T, 200)).conversations.find((c) => /narx qancha/.test(c.last || ''));
    assert.ok(conv, 'suhbat topilmadi');
    const lm = await ok('GET', `/crm/leads/${conv.leadId}/messages`, undefined, T, 200);
    assert.equal(lm.canReply, true);
    assert.equal(lm.channel, 'web');
    await ok('POST', `/crm/leads/${conv.leadId}/messages`, { text: 'Assalomu alaykum, javob!' }, T);
    const got = await (await fetch(`${base}/webchat/${w.key}/messages?visitorId=${vid}`)).json();
    assert.ok(got.messages.some((m) => m.from === 'agent' && /javob!/.test(m.text)), JSON.stringify(got));
    assert.ok(got.messages.some((m) => m.from === 'visitor'));
    const other = await (await fetch(`${base}/webchat/${w.key}/messages?visitorId=otherVisitor1234`)).json();
    assert.equal(other.messages.length, 0, 'boshqa mehmon xabarlarini ko\'rdi');
    assert.equal((await fetch(`${base}/webchat/${w.key}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitorId: 'x', text: 'a' }) })).status, 400);
    await ok('PUT', '/crm/chat-settings', { webChats: [{ id: 'wq1', name: 'Asosiy sayt', active: false }] }, T, 200);
    assert.equal((await send('o\'chiq chatga')).status, 404);
    await ok('PUT', '/crm/chat-settings', { webChats: cs.webChats || [] }, T, 200);
  });
});

describe('NPS («Обращения и NPS»)', () => {
  test("suhbat yopilganda baho so'raladi; mijoz 1–10 yozsa baho yoziladi, suhbat qayta ochilmaydi; boshqa matn — oddiy xabar", async () => {
    const base = process.env.E2E_BASE;
    const cs = await ok('GET', '/crm/chat-settings', undefined, T, 200);
    const w = (await ok('PUT', '/crm/chat-settings', { webChats: [{ id: 'wnps', name: 'NPS sayt' }], nps: { on: true } }, T, 200)).webChats.find((x) => x.id === 'wnps');
    const vid = 'nps' + Math.random().toString(36).slice(2, 12);
    const send = (text) => fetch(`${base}/webchat/${w.key}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitorId: vid, name: 'NpsMijoz', text }) });
    const find = async (re) => (await ok('GET', '/crm/conversations', undefined, T, 200)).conversations.find((c) => re.test(c.last || ''));
    await send('Yordam kerak edi');
    const conv = await find(/Yordam kerak edi/);
    await ok('POST', `/crm/conversations/${conv.leadId}/close`, undefined, T);
    const msgs = async () => (await (await fetch(`${base}/webchat/${w.key}/messages?visitorId=${vid}`)).json()).messages;
    assert.ok((await msgs()).some((m) => m.from === 'agent' && /baholang/.test(m.text)), "baho so'rovi yuborilmadi");
    await send('9');
    const after = await ok('GET', `/crm/leads/${conv.leadId}/messages`, undefined, T, 200);
    assert.equal(after.closed, true, 'baho javobi suhbatni qayta ochdi');
    assert.ok((await msgs()).some((m) => m.from === 'agent' && /rahmat/i.test(m.text)), 'rahmat xabari yo\'q');
    const st = await ok('GET', '/crm/nps', undefined, T, 200);
    assert.ok(st.total >= 1 && st.dist[8] >= 1, JSON.stringify(st));
    // kutilmayotgan raqam oddiy xabar sifatida o'tadi (baho yozilmaydi)
    const before = st.total;
    await send('7');
    assert.equal((await ok('GET', '/crm/nps', undefined, T, 200)).total, before);
    await ok('PUT', '/crm/chat-settings', { webChats: cs.webChats || [], nps: { on: false } }, T, 200);
  });
});

describe('Diagnostika tuzatishlari (chat)', () => {
  test("lenta eng YANGI 200 xabarni qaytaradi (250 xabarli suhbat), takroriy message_id ikki marta yozilmaydi, tahrirlangan xabar yangi xabar emas", async () => {
    const chatId = Math.floor(Math.random() * 1e9);
    const upd = (id, text, extra = {}) => req('POST', '/telegram/webhook', { update_id: id, message: { message_id: id, date: Math.floor(Date.now() / 1000), text, chat: { id: chatId, type: 'private' }, from: { id: chatId, first_name: 'Ko\'pxabar' } }, ...extra }, null, { headers: { 'x-telegram-bot-api-secret-token': secret } });
    for (let i = 1; i <= 250; i++) await upd(i, `xabar-${i}`);
    const row = (await ok('GET', '/crm/conversations', undefined, T, 200)).conversations.find((c) => /xabar-250/.test(c.last || ''));
    assert.ok(row, 'suhbat topilmadi');
    const m = await ok('GET', `/crm/leads/${row.leadId}/messages`, undefined, T, 200);
    assert.equal(m.messages.length, 200);
    assert.equal(m.messages[m.messages.length - 1].text, 'xabar-250', 'oxirgi xabar lentada yo\'q');
    assert.equal(m.messages[0].text, 'xabar-51');
    // takroriy yetkazib berish
    await upd(250, 'xabar-250');
    const m2 = await ok('GET', `/crm/leads/${row.leadId}/messages`, undefined, T, 200);
    assert.equal(m2.messages.filter((x) => x.text === 'xabar-250').length, 1, 'message_id takrorlandi');
    // tahrirlangan xabar
    await req('POST', '/telegram/webhook', { update_id: 999, edited_message: { message_id: 251, date: 1, text: 'tahrir', chat: { id: chatId, type: 'private' }, from: { id: chatId, first_name: 'X' } } }, null, { headers: { 'x-telegram-bot-api-secret-token': secret } });
    assert.ok(!(await ok('GET', `/crm/leads/${row.leadId}/messages`, undefined, T, 200)).messages.some((x) => x.text === 'tahrir'), 'tahrirlangan xabar yangi sifatida yozildi');
  });

  test("qisqa havola: bir havola boshqasining boshi bo'lsa ham to'g'ri almashadi; preview-bot bosishi hisobga olinmaydi; Telegram guruhi ulanish kodini ishlata olmaydi", async () => {
    await ok('PUT', '/crm/chat-settings', { shortLinks: true, webChats: [{ id: 'wsl', name: 'SL' }] }, T, 200);
    const w = (await ok('GET', '/crm/chat-settings', undefined, T, 200)).webChats.find((x) => x.id === 'wsl');
    const base = process.env.E2E_BASE;
    const vid = 'sl' + Math.random().toString(36).slice(2, 12);
    await fetch(`${base}/webchat/${w.key}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitorId: vid, name: 'SL', text: 'salom' }) });
    const conv = (await ok('GET', '/crm/conversations', undefined, T, 200)).conversations.find((c) => c.last === 'salom' || /salom/.test(c.last || ''));
    await ok('POST', `/crm/leads/${conv.leadId}/messages`, { text: 'A: https://a.example.com va B: https://a.example.com/narx' }, T);
    const out = (await (await fetch(`${base}/webchat/${w.key}/messages?visitorId=${vid}`)).json()).messages.filter((m) => m.from === 'agent').pop().text;
    const codes = [...out.matchAll(/\/api\/v1\/l\/([\w-]+)/g)].map((x) => x[1]);
    assert.equal(codes.length, 2, out);
    const r1 = await fetch(`${base}/l/${codes[1]}`, { redirect: 'manual', headers: { 'user-agent': 'TelegramBot (like TwitterBot)' } });
    assert.equal(r1.headers.get('location'), 'https://a.example.com/narx');
    const l1 = await ok('GET', `/crm/leads/${conv.leadId}`, undefined, T, 200);
    assert.ok(!((l1.lead || l1).activity || []).some((a) => a.type === 'link'), "preview-bot bosishi «havola ochildi» deb yozildi");
    // guruh chatidan ulash kodi ishlamaydi
    const st = await ok('GET', '/notifications/telegram', undefined, T, 200);
    if (st.code) {
      await req('POST', '/telegram/webhook', { update_id: 5, message: { message_id: 5, date: 1, text: `/start ${st.code}`, chat: { id: -1001, type: 'group', title: 'G' }, from: { id: 7, first_name: 'G' } } }, null, { headers: { 'x-telegram-bot-api-secret-token': secret } });
      assert.equal((await ok('GET', '/notifications/telegram', undefined, T, 200)).linked, false, 'guruh chati ulandi');
    }
    await ok('PUT', '/crm/chat-settings', { shortLinks: false, webChats: [] }, T, 200);
  });

  test("web-chat: bitta IP'dan juda ko'p yangi mehmon — cheklanadi (429)", async () => {
    await ok('PUT', '/crm/chat-settings', { webChats: [{ id: 'wrl', name: 'RL' }] }, T, 200);
    const w = (await ok('GET', '/crm/chat-settings', undefined, T, 200)).webChats.find((x) => x.id === 'wrl');
    const base = process.env.E2E_BASE;
    let blocked = 0;
    for (let i = 0; i < 45; i++) {
      const r = await fetch(`${base}/webchat/${w.key}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitorId: `rl${i}${Math.random().toString(36).slice(2, 10)}`, text: 'x' }) });
      if (r.status === 429) blocked++;
    }
    assert.ok(blocked > 0, 'IP bo\'yicha limit ishlamadi');
    await ok('PUT', '/crm/chat-settings', { webChats: [] }, T, 200);
  });
});
