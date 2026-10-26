// Telefoniya: OnlinePBX + MicroSIP (softphone, tel:) — eski versiyadagi oqim: sotuvchi raqamni bosadi → MicroSIP qo'ng'iroq qiladi,
// CRM «niyat»ni yozib qo'yadi → OnlinePBX webhook qo'ng'iroqni shu bitimga bog'laydi; kiruvchi qo'ng'iroqlar ham raqam bo'yicha bog'lanadi.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { req, ok, admin, uniq, newLead, userWithRole } from './lib.mjs';

let T, S, secret;
const rnd9 = () => String(900000000 + Math.floor(Math.random() * 99999999));
const hook = (body) => req('POST', `/onlinepbx/webhook?secret=${encodeURIComponent(secret)}`, body);
const callsOf = async (leadId) => (await ok('GET', `/crm/leads/${leadId}/calls`, undefined, T, 200)).calls;

before(async () => {
  T = await admin();
  S = await userWithRole('sotuvchi');
  const cfg = await ok('PUT', '/crm/pbx/config', { domain: 'e2e.onpbx.ru', apiKey: 'e2e-test-key', defaultExt: '100', callMode: 'softphone', dialScheme: 'tel' }, T, 200);
  secret = decodeURIComponent(cfg.webhookUrl.match(/[?&]secret=([^&]+)/)[1]);
});
after(async () => { await ok('PUT', '/crm/pbx/config', { domain: '', apiKey: '', callMode: 'callback' }, T, 200); });

describe('Telefoniya (OnlinePBX + MicroSIP)', () => {
  test("sotuvchi ham qo'ng'iroq usulini ko'radi (softphone, tel:) — MicroSIP orqali tersin", async () => {
    const me = await ok('GET', '/crm/my-extension', undefined, S.token, 200);
    assert.equal(me.callMode, 'softphone');
    assert.equal(me.dialScheme, 'tel');
    assert.equal(me.pbxEnabled, true);
  });

  test("chiquvchi: kartochkadan bosilgan raqam webhook kelganda shu bitimga bog'lanadi (raqam kontaktda)", async () => {
    const n = rnd9();
    const c = (await ok('POST', '/crm/contacts', { name: uniq('Mijoz'), phone: `+998 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 7)} ${n.slice(7)}` }, T)).contact;
    const l = await newLead(S.token, { contactId: c.id });
    await ok('POST', '/crm/calls/soft-log', { leadId: l.id, to: `+998${n}` }, S.token);
    const uuid = uniq('out');
    const r = await hook({ accountcode: 'outbound', caller: '101', callee: `998${n}`, uuid, dialog_duration: 0, call_duration: 5 });
    assert.ok(r.status < 300 && r.data?.ok, JSON.stringify(r.data));
    // keyin gaplashildi (o'sha uuid) — yozuv yangilanadi, yangisi qo'shilmaydi
    await hook({ accountcode: 'outbound', caller: '101', callee: `998${n}`, uuid, dialog_duration: 42, call_duration: 50, download_url: 'https://e2e.onpbx.ru/rec/1.mp3' });
    const calls = await callsOf(l.id);
    assert.equal(calls.length, 1, `qo'ng'iroq bitimga bog'lanmadi yoki ikki marta yozildi: ${calls.length}`);
    assert.equal(calls[0].direction, 'out');
    assert.equal(calls[0].status, 'completed');
    assert.ok(calls[0].hasRecording);
  });

  test("kiruvchi: mavjud mijoz (telefoni faqat kontaktda) qo'ng'iroq qilsa — dublikat bitim yaratilmaydi", async () => {
    const n = rnd9();
    const c = (await ok('POST', '/crm/contacts', { name: uniq('Doimiy'), phone: `+998${n}` }, T)).contact;
    const l = await newLead(T, { contactId: c.id });
    const before = (await ok('GET', `/crm/leads?search=${n.slice(-7)}`, undefined, T, 200)).total;
    await hook({ accountcode: 'missed', caller: `998${n}`, callee: '100', uuid: uniq('in'), dialog_duration: 0, call_duration: 12 });
    const calls = await callsOf(l.id);
    assert.equal(calls.length, 1, "kiruvchi qo'ng'iroq mavjud mijoz bitimiga bog'lanmadi");
    assert.equal(calls[0].direction, 'in');
    const afterN = (await ok('GET', `/crm/leads?search=${n.slice(-7)}`, undefined, T, 200)).total;
    assert.equal(afterN, before, "mavjud mijoz uchun yangi (dublikat) bitim yaratildi");
  });

  test("yangi raqam (amoCRM vidjeti kabi): jiringlaganda kontakt + «Saralanmagan» bitim, oyna mijoz bilan chiqadi; javob berilsa vazifa yo'q", async () => {
    const n = rnd9();
    const uuid = uniq('ring');
    await hook({ event: 'call_start', caller: `+998${n}`, callee: '100', uuid });
    const inc = (await ok('GET', '/crm/calls/incoming', undefined, S.token, 200)).call;
    assert.ok(inc && inc.phone.includes(n.slice(-7)), `kiruvchi oyna chiqmadi: ${JSON.stringify(inc)}`);
    assert.equal(inc.status, 'ringing', "jiringlayotgan qo'ng'iroq «o'tkazib yuborilgan» deb belgilandi");
    assert.ok(inc.leadId, 'yangi raqam uchun bitim yaratilmadi');
    const contacts = await ok('GET', `/crm/contacts?search=${n.slice(-7)}`, undefined, T, 200);
    assert.ok(JSON.stringify(contacts).includes(n.slice(-7)), 'yangi raqam uchun kontakt yaratilmadi');
    const u = await ok('GET', '/crm/unsorted', undefined, T, 200);
    assert.ok(JSON.stringify(u).includes(inc.leadId), "bitim «Saralanmagan»ga tushmadi");
    // gaplashildi
    await hook({ event: 'call_end', caller: `+998${n}`, callee: '100', uuid, dialog_duration: 25, call_duration: 30, hangup_cause: 'normal_clearing' });
    const tasks = (await ok('GET', `/crm/leads/${inc.leadId}/tasks`, undefined, T, 200)).tasks;
    assert.equal(tasks.length, 0, "javob berilgan qo'ng'iroqqa vazifa yaratildi");
    const after = (await ok('GET', '/crm/calls/incoming', undefined, S.token, 200)).call;
    assert.ok(!after || after.id !== inc.id, "qo'ng'iroq tugagach ham oyna ko'rinmoqda");
    const calls = await callsOf(inc.leadId);
    assert.equal(calls[0].status, 'completed');
  });

  test("o'tkazib yuborilgan kiruvchi — mas'ulga «qayta qo'ng'iroq» vazifasi, takroriy qo'ng'iroqda ikkinchi vazifa yo'q", async () => {
    const n = rnd9();
    const l = await newLead(T, { phone: `+998${n}`, assigneeId: S.id });
    for (let i = 0; i < 2; i++) {
      const uuid = uniq('missed');
      await hook({ event: 'call_start', caller: `998${n}`, callee: '100', uuid });
      await hook({ event: 'call_end', caller: `998${n}`, callee: '100', uuid, dialog_duration: 0, call_duration: 20, hangup_cause: 'no_answer' });
    }
    const tasks = (await ok('GET', `/crm/leads/${l.id}/tasks`, undefined, T, 200)).tasks.filter((x) => /Qayta qo'ng'iroq/.test(x.title));
    assert.equal(tasks.length, 1, `vazifalar soni: ${tasks.length}`);
    assert.equal(tasks[0].assigneeId, S.id, "vazifa bitim mas'uliga tushmadi");
    assert.equal(tasks[0].type, 'call');
  });

  test("Список событий (amoCRM): qo'ng'iroqlar «Звонки» filtrida, yozuv belgisi bilan; tur/obyekt/preset filtrlari", async () => {
    const n = rnd9();
    const l = await newLead(T, { phone: `+998${n}` });
    await hook({ event: 'call_end', caller: '101', callee: `998${n}`, uuid: uniq('evc'), dialog_duration: 31, call_duration: 35, download_url: 'https://e2e.onpbx.ru/r.mp3' });
    const ev = await ok('GET', '/crm/analytics/events?types=call_in,call_out&preset=today', undefined, T, 200);
    const row = ev.items.find((x) => x.leadId === l.id);
    assert.ok(row, "qo'ng'iroq voqealar ro'yxatida yo'q");
    assert.equal(row.type, 'call_out');
    assert.ok(row.call?.hasRecording && /00:35 998/.test(row.text), JSON.stringify(row));
    assert.ok(ev.items.every((x) => x.type.startsWith('call_')), 'tur filtri boshqa voqealarni ham qaytardi');
    const tasks = await ok('GET', '/crm/analytics/events?entity=task', undefined, T, 200);
    assert.ok(tasks.items.every((x) => x.type.startsWith('task_')), 'obyekt filtri ishlamadi');
    const all = await ok('GET', '/crm/analytics/events', undefined, T, 200);
    assert.ok(all.total >= all.items.length && all.items.some((x) => x.type === 'call_out'), "umumiy ro'yxatda qo'ng'iroq yo'q");
    const mine = await ok('GET', '/crm/analytics/events?preset=mine', undefined, S.token, 200);
    assert.ok(mine.items.every((x) => !x.call), "«Mening voqealarim»da boshqaning qo'ng'iroqlari chiqdi");
  });

  test("qalqib chiquvchi oyna sozlamasi sotuvchiga ham ko'rinadi", async () => {
    await ok('PUT', '/crm/pbx/config', { popups: false }, T, 200);
    assert.equal((await ok('GET', '/crm/my-extension', undefined, S.token, 200)).popups, false);
    await ok('PUT', '/crm/pbx/config', { popups: true }, T, 200);
    assert.equal((await ok('GET', '/crm/my-extension', undefined, S.token, 200)).popups, true);
  });

  test("raqam formatlari (8…, 998…, +998 …, 9 xonali) bir xil mijozga tushadi", async () => {
    const n = rnd9();
    const l = await newLead(T, { phone: `+998 ${n}` });
    for (const f of [`998${n}`, `+998${n}`, `8${n}`, n]) {
      await hook({ accountcode: 'inbound', caller: f, callee: '100', uuid: uniq('fmt'), dialog_duration: 10 });
    }
    assert.equal((await callsOf(l.id)).length, 4);
  });

  test('qo\'ng\'iroq widgeti: raqam bo\'yicha bitim nomi topiladi (kontakt telefoni ham)', async () => {
    const n = rnd9();
    const c = (await ok('POST', '/crm/contacts', { name: uniq('Widget'), phone: `+998${n}` }, T)).contact;
    const l = await newLead(T, { contactId: c.id, name: uniq('WidgetLead') });
    const r = await ok('GET', `/crm/lead-by-phone?phone=${encodeURIComponent('+998' + n)}`, undefined, S.token, 200);
    assert.equal(r.leadId, l.id, JSON.stringify(r));
  });

  test("callback rejimi: ichki raqam yo'q bo'lsa tushunarli xato (NO_EXTENSION)", async () => {
    await ok('PUT', '/crm/pbx/config', { callMode: 'callback', defaultExt: '' }, T, 200);
    const r = await req('POST', '/crm/calls/dial', { to: '+998901234567' }, S.token);
    assert.ok(r.status >= 400 && r.status < 500, `${r.status}`);
    assert.equal(r.data?.error, 'NO_EXTENSION');
  });

  test("diagnostika: bir yangi raqamdan parallel webhooklar — bitta bitim; «answered» holati o'tkazib yuborilgan emas; yakuniy holat orqaga qaytmaydi", async () => {
    const n = rnd9();
    await Promise.all(Array.from({ length: 5 }, (_, i) => hook({ event: 'call_start', caller: `+998${n}`, callee: '100', uuid: uniq('par' + i) })));
    const found = await ok('GET', `/crm/leads?search=${n.slice(-7)}`, undefined, T, 200);
    assert.equal(found.total, 1, `parallel webhooklar ${found.total} ta bitim yaratdi`);
    // «answered» — gaplashuv boshlandi: o'tkazib yuborilgan emas, vazifa yo'q
    const m = rnd9(); const u = uniq('ans');
    await hook({ caller: `998${m}`, callee: '100', uuid: u, status: 'answered' });
    const lm = await ok('GET', `/crm/leads?search=${m.slice(-7)}`, undefined, T, 200);
    const lid = (lm.leads || lm.items)[0].id;
    assert.equal((await callsOf(lid))[0].status, 'ringing', "gaplashayotgan qo'ng'iroq yakunlangan deb hisoblandi");
    assert.equal((await ok('GET', `/crm/leads/${lid}/tasks`, undefined, T, 200)).tasks.length, 0);
    // yakuniy → kechikkan ringing orqaga qaytarmaydi
    await hook({ event: 'call_end', caller: `998${m}`, callee: '100', uuid: u, dialog_duration: 20, call_duration: 25 });
    await hook({ event: 'call_start', caller: `998${m}`, callee: '100', uuid: u });
    assert.equal((await callsOf(lid))[0].status, 'completed', 'yakuniy holat orqaga qaytdi');
  });

  test("diagnostika: sotuvchi «from» orqali boshqa ichki/tashqi raqamdan qo'ng'iroq qila olmaydi (toll-fraud)", async () => {
    await ok('PUT', '/crm/pbx/config', { callMode: 'callback', defaultExt: '100' }, T, 200);
    const l = await newLead(T, { phone: `+998${rnd9()}` });
    const r = await req('POST', `/crm/leads/${l.id}/call`, { from: '+88213000000' }, S.token);
    // PBX test muhitida ulanmagan — muhimi: tashqi raqam «from» sifatida qabul qilinmaydi (xato PBX tomondan, 4xx/5xx), CRM'da chaqiruv yozuvi yaratilmaydi
    assert.ok(r.status >= 400, `${r.status}`);
    await ok('PUT', '/crm/pbx/config', { callMode: 'softphone' }, T, 200);
  });

  test('provayder qatlami: standart onlinepbx; «own» tanlansa ulanmagan holat tushunarli, qayta onlinepbx\'ga qaytadi', async () => {
    const cur = await ok('GET', '/crm/pbx/config', undefined, T, 200);
    assert.equal(cur.provider, 'onlinepbx');
    const own = await ok('PUT', '/crm/pbx/config', { provider: 'own' }, T, 200);
    assert.equal(own.provider, 'own');
    const test = await ok('POST', '/crm/pbx/test', undefined, T, [200, 201]);
    assert.equal(test.ok, false);
    const back = await ok('PUT', '/crm/pbx/config', { provider: 'onlinepbx' }, T, 200);
    assert.equal(back.provider, 'onlinepbx');
  });

  test("qo'ng'iroqlar jurnali (/crm/calls/report): plitalar, «qayta qo'ng'iroq qilinmagan», suhbat davomiyligi, jami, «Разговоры» tabi", async () => {
    const n = rnd9();
    const phone = `998${n}`;
    // 1) chiquvchi gaplashilgan (50 s umumiy, 42 s suhbat)
    await hook({ accountcode: 'outbound', caller: '101', callee: phone, uuid: uniq('j1'), dialog_duration: 42, call_duration: 50, download_url: 'https://e2e.onpbx.ru/rec/j1.mp3' });
    // 2) kiruvchi o'tkazib yuborilgan
    await hook({ accountcode: 'inbound', caller: phone, callee: '100', uuid: uniq('j2'), dialog_duration: 0, call_duration: 12, hangup_cause: 'NO_ANSWER' });
    const rep = async (extra = '') => ok('GET', `/crm/calls/report?phone=${n}${extra}`, undefined, T, 200);
    let r = await rep();
    assert.equal(r.tiles.all, 2);
    assert.equal(r.tiles.out, 1);
    assert.equal(r.tiles.in, 1);
    assert.equal(r.tiles.missed, 1);
    assert.equal(r.tiles.notcalledback, 1, "o'tkazib yuborilgan kiruvchidan keyin chiquvchi bo'lmagan — «qayta qo'ng'iroq qilinmagan»");
    assert.equal(r.totals.count, 2);
    assert.equal(r.totals.talkSec, 42);
    assert.equal(r.totals.roundedMinutes, 1);
    const outRow = r.calls.find((c) => c.kind === 'out');
    assert.equal(outRow.talkSec, 42);
    assert.equal(outRow.ringSec, 8);
    assert.ok(outRow.hasRecording);
    // «Разговоры» tabi faqat suhbat bo'lganlar
    r = await rep('&tab=talks');
    assert.equal(r.calls.length, 1);
    // plita bo'yicha filtr
    r = await rep('&kind=missed');
    assert.deepEqual(r.calls.map((c) => c.kind), ['in']);
    assert.equal(r.calls[0].result, 'Javob berilmadi');
    // davomiylik filtri
    r = await rep('&talkMin=30');
    assert.equal(r.totals.count, 1);
    // keyin shu raqamga qayta qo'ng'iroq → «qayta qo'ng'iroq qilinmagan» kamayadi
    await hook({ accountcode: 'outbound', caller: '101', callee: phone, uuid: uniq('j3'), dialog_duration: 10, call_duration: 15 });
    r = await rep();
    assert.equal(r.tiles.notcalledback, 0, 'qayta qo`ng`iroq qilingan raqam hali ham «qilinmagan» hisoblanadi');
    assert.equal((await req('GET', '/crm/calls/report?from=2000-01-01', undefined, S.token)).status, 200);
  });

  test("qo'ng'iroq hisobotlari (/crm/calls/stats): kunlik qator, xodimlar, o'tkazib yuborilganlar va natijalar; davr chegarasi", async () => {
    const n = rnd9();
    await hook({ accountcode: 'inbound', caller: `998${n}`, callee: '100', uuid: uniq('s1'), dialog_duration: 0, call_duration: 9, hangup_cause: 'NO_ANSWER' });
    await hook({ accountcode: 'outbound', caller: '101', callee: `998${n}`, uuid: uniq('s2'), dialog_duration: 30, call_duration: 35 });
    const st = await ok('GET', '/crm/calls/stats?from=2000-01-01&to=2000-01-03', undefined, T, 200);
    assert.equal(st.series.length, 3, 'davr kunlari soni');
    const cur = await ok('GET', '/crm/calls/stats', undefined, T, 200);
    assert.equal(cur.series.length, 7, 'standart davr 7 kun');
    assert.ok(cur.series.some((d) => d.in + d.out > 0), 'bugungi qo`ng`iroqlar qatorga tushmadi');
    assert.ok(cur.missed.count >= 1);
    assert.ok(cur.missed.calledBack >= 1, "qayta qo'ng'iroq qilingan o'tkazib yuborilgan hisoblanmadi");
    assert.ok(cur.outcomes.success >= 1 && cur.outcomes.total >= cur.outcomes.success);
    assert.ok(Array.isArray(cur.employees));
    assert.equal((await req('GET', '/crm/calls/stats?from=2000-01-01&to=2026-12-31', undefined, T)).status, 400, 'juda uzun davr rad etilishi kerak');
  });
});
