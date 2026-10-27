// O'z telefon stansiyamiz: «Настройка АТС» modullari — yaratish, tekshiruv, zanjir, aylanma himoyasi, qora ro'yxat, musiqa, chiquvchi qoidalar.
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { req, ok, admin, userWithRole, uniq } from './lib.mjs';

let T;
const mk = (type, body) => ok('POST', '/pbx/modules', { type, ...body }, T, 201).then((r) => r.module);
before(async () => { T = await admin(); });

describe('PBX modullari (Настройка АТС)', () => {
  test('raqamlar avtomatik beriladi; band raqam 409; noto`g`ri tur/raqam 400; oddiy xodim kira olmaydi', async () => {
    const n1 = (await ok('GET', '/pbx/modules/next-number?type=queue', undefined, T, 200)).number;
    const q = await mk('queue', { name: uniq('Navbat') });
    assert.equal(q.number, n1);
    const n2 = (await ok('GET', '/pbx/modules/next-number?type=queue', undefined, T, 200)).number;
    assert.notEqual(n2, n1);
    assert.equal((await req('POST', '/pbx/modules', { type: 'queue', number: q.number }, T)).status, 409);
    assert.equal((await req('POST', '/pbx/modules', { type: 'yoq' }, T)).status, 400);
    assert.equal((await req('POST', '/pbx/modules', { type: 'queue', number: 'bad number!' }, T)).status, 400);
    const S = await userWithRole('sotuvchi');
    assert.equal((await req('GET', '/pbx/modules', undefined, S.token)).status, 403);
  });

  test('zanjir: trunk → vaqt qoidasi → (ish vaqti: guruh | ish vaqtidan tashqari: ovozli pochta); xodim moduli CRM foydalanuvchisiga bog`lanadi', async () => {
    const crmUser = await userWithRole('sotuvchi');
    const u1 = await mk('user', { number: '9101', name: 'Ali', config: { crmUserId: crmUser.id } });
    const u2 = await mk('user', { number: '9102', name: 'Vali' });
    // CRM foydalanuvchisining ichki raqami moslandi
    const me = await ok('GET', '/crm/my-extension', undefined, crmUser.token, 200);
    assert.equal(me.extension, '9101');
    const g = await mk('group', { name: 'Savdo', config: { members: '9101;9102', afterSec: 20 } });
    const vm = await mk('voicemail', { name: 'Nerabochee', config: { recordSec: 20, email: 'x@y.uz' } });
    const tr = await mk('timerule', { name: 'Ish vaqti', config: { timezone: 'UTC+5', days: { mon: { on: true, from: '09:00', to: '18:00' } }, workTo: g.number, offTo: vm.number } });
    assert.equal(tr.config.days.mon.from, '09:00');
    assert.equal(tr.config.days.sun.on, true, 'berilmagan kunlar standart qiymat bilan to`ldirilishi kerak');
    const trunk = await mk('trunk', { number: '0552299', name: 'Operator', config: { login: 'l', password: 'sirli-parol', server: '1.2.3.4', forwardTo: tr.number } });
    assert.equal(trunk.passwordSet, true);
    assert.equal(trunk.config.password, undefined, 'trunk paroli javobda ko`rinmasligi kerak');
    // paroli bo'sh yuborilsa eskisi qoladi
    const upd = await ok('PUT', `/pbx/modules/${trunk.id}`, { name: 'Operator 2', config: { server: '5.6.7.8' } }, T, 200);
    assert.equal(upd.module.passwordSet, true);
    assert.equal(upd.module.config.server, '5.6.7.8');
    assert.equal(upd.module.config.login, 'l', 'yuborilmagan maydonlar saqlanishi kerak');
    const v = await ok('GET', '/pbx/flow/validate', undefined, T, 200);
    assert.equal(v.ok, true, JSON.stringify(v.issues));
    // ro'yxat turi bo'yicha
    const only = await ok('GET', '/pbx/modules?type=group', undefined, T, 200);
    assert.ok(only.modules.every((m) => m.type === 'group') && only.modules.some((m) => m.id === g.id));
    // o'chirishni bog'liq modul to'sadi
    const del = await req('DELETE', `/pbx/modules/${g.id}`, undefined, T);
    assert.equal(del.status, 409);
    assert.ok(String(del.data.message).includes(tr.number), `xabarda bog'langan modul ko'rsatilmadi: ${JSON.stringify(del.data)}`);
    // raqamini o'zgartirib ham bo'lmaydi (havolalar buzilmasin)
    assert.equal((await req('PUT', `/pbx/modules/${g.id}`, { number: '77' }, T)).status, 409);
    // zanjirni teskari tartibda o'chirish mumkin
    for (const m of [trunk, tr, g, vm, u1, u2]) await ok('DELETE', `/pbx/modules/${m.id}`, undefined, T, 200);
    const after = await ok('GET', '/crm/my-extension', undefined, crmUser.token, 200);
    assert.ok(!after.extension, 'modul o`chgach CRM foydalanuvchisining raqami tozalanishi kerak');
  });

  test('validatsiya: mavjud bo`lmagan marshrut, guruhdagi begona raqam, aylanma, noto`g`ri vaqt/URL', async () => {
    assert.equal((await req('POST', '/pbx/modules', { type: 'voicemail', config: { forwardTo: '99999' } }, T)).status, 400);
    assert.equal((await req('POST', '/pbx/modules', { type: 'group', config: { members: '00000' } }, T)).status, 400);
    assert.equal((await req('POST', '/pbx/modules', { type: 'timerule', config: { days: { mon: { from: '25:00', to: '18:00' } } } }, T)).status, 400);
    assert.equal((await req('POST', '/pbx/modules', { type: 'http', config: { url: 'ftp://x' } }, T)).status, 400);
    const a = await mk('voicemail', { name: 'A' });
    const b = await mk('voicemail', { name: 'B', config: { forwardTo: a.number } });
    // A → B bo'lsa B → A bilan aylanma
    assert.equal((await req('PUT', `/pbx/modules/${a.id}`, { config: { forwardTo: b.number } }, T)).status, 400);
    assert.equal((await req('PUT', `/pbx/modules/${a.id}`, { config: { forwardTo: a.number } }, T)).status, 400);
    await ok('DELETE', `/pbx/modules/${b.id}`, undefined, T, 200);
    await ok('DELETE', `/pbx/modules/${a.id}`, undefined, T, 200);
  });

  test('qora ro`yxat, musiqa va chiquvchi qoidalar', async () => {
    const n = `+99890${String(Date.now()).slice(-7)}`;
    const b = await ok('POST', '/pbx/blacklist', { number: n, note: 'spam' }, T, 201);
    assert.equal((await req('POST', '/pbx/blacklist', { number: n }, T)).status, 409);
    assert.equal((await req('POST', '/pbx/blacklist', { number: 'abc' }, T)).status, 400);
    assert.ok((await ok('GET', '/pbx/blacklist', undefined, T, 200)).numbers.some((x) => x.number === n));
    await ok('DELETE', `/pbx/blacklist/${b.id}`, undefined, T, 200);
    assert.equal((await req('DELETE', `/pbx/blacklist/${b.id}`, undefined, T)).status, 404);

    assert.deepEqual(await ok('GET', '/pbx/music', undefined, T, 200), { ringback: 'default', hold: 'default' });
    const m = await ok('PUT', '/pbx/music', { hold: 'klassika' }, T, 200);
    assert.equal(m.hold, 'klassika');
    await ok('PUT', '/pbx/music', { hold: 'default' }, T, 200);

    const out = await ok('PUT', '/pbx/outgoing', { rules: [{ name: 'Hammasi', mask: '', trunk: '0552233', externalNumber: '0552233', users: ['100', '101'] }] }, T, 200);
    assert.equal(out.rules.length, 1);
    assert.equal((await req('PUT', '/pbx/outgoing', { rules: [{ mask: 'abc<script>' }] }, T)).status, 400);
    assert.equal((await ok('GET', '/pbx/outgoing', undefined, T, 200)).rules[0].users.length, 2);
    await ok('PUT', '/pbx/outgoing', { rules: [] }, T, 200);
  });

  test('in`ektsiya: trunk server/login/parol, maska, nom — \\n ; " rad etiladi yoki tozalanadi; xodim raqami faqat 2–5 xonali son', async () => {
    for (const config of [{ login: 'l', server: '1.2.3.4\n[x]' }, { login: 'l;x', server: '1.2.3.4' }, { login: 'l', server: '1.2.3.4', password: 'a;b' }, { login: 'a"b', server: 'h' }]) {
      const r = await req('POST', '/pbx/modules', { type: 'trunk', config }, T);
      assert.equal(r.status, 400, JSON.stringify(config));
    }
    assert.equal((await req('POST', '/pbx/modules', { type: 'numrule', config: { mask: '998\nexten' } }, T)).status, 400);
    assert.equal((await req('POST', '/pbx/modules', { type: 'queue', number: '_X' }, T)).status, 400, '_ bilan boshlanadigan raqam (naqsh) rad');
    assert.equal((await req('POST', '/pbx/modules', { type: 'user', number: 'trunk-1' }, T)).status, 400);
    assert.equal((await req('POST', '/pbx/modules', { type: 'user', number: '1234567' }, T)).status, 400);
    const u = await mk('user', { number: '9181', name: 'Ali"\n[evil];x' });
    assert.equal(u.name, 'Alievilx');
    assert.equal((await req('PUT', '/pbx/outgoing', { rules: [{ mask: '', trunk: '0552233', users: ['100@trunk'] }] }, T)).status, 400);
    assert.equal((await req('PUT', '/pbx/outgoing', { rules: [{ mask: '', trunk: '0552233', externalNumber: '1;2' }] }, T)).status, 400);
    await ok('DELETE', `/pbx/modules/${u.id}`, undefined, T, 200);
  });

  test('CRM foydalanuvchisi: ikki modulga bog`lab bo`lmaydi (409); A → B o`tkazilsa A ning raqami tozalanadi; server SIP parolini yaratadi', async () => {
    const A = await userWithRole('sotuvchi');
    const B = await userWithRole('sotuvchi');
    const m = await mk('user', { number: '9191', config: { crmUserId: A.id } });
    assert.equal((await req('POST', '/pbx/modules', { type: 'user', number: '9192', config: { crmUserId: A.id } }, T)).status, 409);
    assert.equal((await ok('GET', '/crm/my-extension', undefined, A.token, 200)).extension, '9191');
    await ok('PUT', `/pbx/modules/${m.id}`, { config: { crmUserId: B.id } }, T, 200);
    assert.ok(!(await ok('GET', '/crm/my-extension', undefined, A.token, 200)).extension, 'A ning eski raqami tozalanmadi');
    assert.equal((await ok('GET', '/crm/my-extension', undefined, B.token, 200)).extension, '9191');
    await ok('DELETE', `/pbx/modules/${m.id}`, undefined, T, 200);
  });

  test('o`chirish: chiquvchi qoida / callback / avto-qayta qo`ng`iroq ishlatgan trunk yoki xodimni o`chirib bo`lmaydi', async () => {
    const tr = await mk('trunk', { number: '0557711', config: { login: 'l', server: '1.2.3.4' } });
    const u = await mk('user', { number: '9171' });
    await ok('PUT', '/pbx/outgoing', { rules: [{ name: 'Q', mask: '', trunk: '0557711', users: ['9171'] }] }, T, 200);
    assert.equal((await req('DELETE', `/pbx/modules/${tr.id}`, undefined, T)).status, 409);
    assert.equal((await req('DELETE', `/pbx/modules/${u.id}`, undefined, T)).status, 409);
    await ok('PUT', '/pbx/outgoing', { rules: [] }, T, 200);
    await ok('PUT', '/pbx/autorecall', { ext: '9171' }, T, 200);
    assert.equal((await req('DELETE', `/pbx/modules/${u.id}`, undefined, T)).status, 409);
    await ok('PUT', '/pbx/autorecall', { ext: '' }, T, 200);
    for (const m of [tr, u]) await ok('DELETE', `/pbx/modules/${m.id}`, undefined, T, 200);
  });

  test('qora ro`yxat: +998…/998…/9 xonali bir raqam deb hisoblanadi (409)', async () => {
    const n = `90${String(Date.now()).slice(-7)}`;
    const b = await ok('POST', '/pbx/blacklist', { number: `+998${n}` }, T, 201);
    assert.equal((await req('POST', '/pbx/blacklist', { number: `998${n}` }, T)).status, 409);
    assert.equal((await req('POST', '/pbx/blacklist', { number: n }, T)).status, 409);
    await ok('DELETE', `/pbx/blacklist/${b.id}`, undefined, T, 200);
  });

  test('audio kutubxona: yuklash, ro`yxat, fayl berish, ishlatilayotganini o`chirib bo`lmaydi, noto`g`ri tur/hajm rad etiladi', async () => {
    const wav = Buffer.concat([Buffer.from('RIFF....WAVEfmt '), Buffer.alloc(300, 1)]).toString('base64');
    const f = await ok('POST', '/pbx/audio', { name: uniq('salom') + '.wav', mime: 'audio/wav', data: wav }, T, 201);
    assert.ok(f.id && f.size > 100);
    assert.ok((await ok('GET', '/pbx/audio', undefined, T, 200)).files.some((x) => x.id === f.id));
    const res = await fetch(`${process.env.E2E_BASE}/pbx/audio/${f.id}/file`, { headers: { Authorization: `Bearer ${T}` } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'audio/wav');
    assert.equal((await res.arrayBuffer()).byteLength, f.size);
    assert.equal((await req('POST', '/pbx/audio', { name: 'x', mime: 'text/html', data: wav }, T)).status, 400);
    assert.equal((await req('POST', '/pbx/audio', { name: 'x', mime: 'audio/wav', data: Buffer.alloc(6 * 1024 * 1024, 1).toString('base64') }, T)).status, 400);
    const S = await userWithRole('sotuvchi');
    assert.equal((await req('GET', '/pbx/audio', undefined, S.token)).status, 403);
    // modulda ishlatilsa o'chirib bo'lmaydi
    const g = await mk('greeting', { name: 'Audioli', config: { audioId: f.id } });
    assert.equal((await req('DELETE', `/pbx/audio/${f.id}`, undefined, T)).status, 409);
    await ok('DELETE', `/pbx/modules/${g.id}`, undefined, T, 200);
    await ok('DELETE', `/pbx/audio/${f.id}`, undefined, T, 200);
    assert.equal((await req('GET', `/pbx/audio/${f.id}/file`, undefined, T)).status, 404);
  });
});
