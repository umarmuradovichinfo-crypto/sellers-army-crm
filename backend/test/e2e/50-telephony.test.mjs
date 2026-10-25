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

  test("kiruvchi: noma'lum raqamdan o'tkazib yuborilgan qo'ng'iroq — «Saralanmagan»ga yangi bitim", async () => {
    const n = rnd9();
    await hook({ accountcode: 'missed', caller: `+998${n}`, callee: '100', uuid: uniq('miss'), dialog_duration: 0 });
    const u = await ok('GET', '/crm/unsorted', undefined, T, 200);
    assert.ok(JSON.stringify(u).includes(n.slice(-7)), "o'tkazib yuborilgan qo'ng'iroqdan bitim yaratilmadi");
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
});
