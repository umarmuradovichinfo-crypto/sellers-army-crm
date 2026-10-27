// Asterisk sozlama generatori: modullar → pjsip.conf / extensions.conf / queues.conf (matn tuzilishi).
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { generateAsterisk } from '../../dist/pbx/asterisk.generator.js';
import { normalizeConfig } from '../../dist/pbx/pbx-schema.js';
import { readFileSync, existsSync } from 'node:fs';
import { req, ok, admin, uniq, userWithRole } from './lib.mjs';

const mod = (type, number, config = {}, name = null, enabled = true) => ({ type, number, name, enabled, config });
const MODS = [
  mod('user', '100', {}, 'Ali'), mod('user', '101', { forward: [{ afterSec: 20, to: '5120' }] }, 'Vali'),
  mod('group', '10', { members: ['100', '101'], afterSec: 20, forwardTo: '5200' }, 'Savdo'),
  mod('queue', '5200', { members: [{ ext: '100', priority: 1 }, { ext: '101', priority: 2 }], strategy: 'count', ringSec: 15, queueSec: 120, forwardTo: '5120' }),
  mod('voicemail', '5120', { recordSec: 20, forwardTo: '' }),
  mod('timerule', '5100', { timezone: 'UTC+5', holidays: ['2026-01-01'], days: { mon: { on: true, from: '09:00', to: '18:00' }, sun: { on: false, from: '09:00', to: '18:00' } }, workTo: '10', offTo: '5000' }),
  mod('greeting', '5000', { menu: [{ key: '1', to: '10' }], allowExt: true, delaySec: 6, forwardTo: '5120' }),
  mod('trunk', '0552233', { login: '0552233', server: '89.0.0.1', password: 'sirli-parol', forwardTo: '5100' }),
  mod('user', '999', {}, 'O`chirilgan', false),
];

describe('Asterisk generatori', () => {
  const r = generateAsterisk(MODS, { blacklist: ['+998900000000'], outgoing: { rules: [{ mask: '', trunk: '0552233', users: ['100'] }] }, sipSecrets: { 100: 'x100', 101: 'x101' } });

  test('pjsip: xodimlar (WebRTC) va trunk ro`yxatdan o`tishi; o`chirilgan modul yo`q', () => {
    assert.match(r.pjsip, /\[100\]\ntype=endpoint/);
    assert.match(r.pjsip, /password=x100/);
    assert.match(r.pjsip, /type=registration/);
    assert.match(r.pjsip, /server_uri=sip:89\.0\.0\.1/);
    assert.ok(!r.pjsip.includes('[999]'), 'o`chirilgan xodim konfiguratsiyaga tushmasligi kerak');
  });

  test('extensions: kiruvchi raqam → vaqt qoidasi → guruh/salomlashish; qora ro`yxat; chiquvchi marshrut', () => {
    assert.match(r.extensions, /\[from-trunk\]\nexten => 0552233,1,Gosub\(blacklist-check,s,1\)\n same => n,Goto\(m5100,s,1\)/);
    // qora ro'yxat normallashtirilgan (oxirgi 9 raqam) bo'yicha solishtiriladi
    assert.match(r.extensions, /Set\(CRM_CN=\$\{FILTER\(0123456789,\$\{CALLERID\(num\)\}\)\}\)/);
    assert.match(r.extensions, /"\$\{CRM_CN:-9\}" = "900000000"\]\?blocked,1/);
    assert.match(r.extensions, /\[m5100\][\s\S]*GotoIfTime\(09:00-18:00,mon,\*,\*,Etc\/GMT-5\?work\)/);
    assert.ok(!/GotoIfTime\([^)]*,sun,/.test(r.extensions), 'o`chirilgan kun uchun vaqt sharti bo`lmasligi kerak');
    assert.match(r.extensions, /2026-01-01"\]\?holiday/);
    assert.match(r.extensions, /\[m10\]\nexten => s,1,UserEvent\(CrmRing[^\n]*\n same => n,Dial\(PJSIP\/100&PJSIP\/100-web&PJSIP\/101&PJSIP\/101-web,20\)[\s\S]*Goto\(m5200,s,1\)/);
    assert.match(r.extensions, /\[m5000\][\s\S]*exten => 1,1,Goto\(m10,s,1\)[\s\S]*exten => 100,1,Goto\(m100,s,1\)/);
    assert.match(r.extensions, /\[m101\]\nexten => s,1,UserEvent\(CrmRing,Caller: \$\{CALLERID\(num\)\},Called: 101,Uuid: \$\{UNIQUEID\}\)\n same => n,Dial\(PJSIP\/101&PJSIP\/101-web,20\)[\s\S]*Goto\(m5120,s,1\)/);
    assert.match(r.extensions, /\[from-internal\][\s\S]*exten => _X\.,1,Goto\(crm-outbound,\$\{EXTEN\},1\)/);
    // qoida faqat ko'rsatilgan xodimlar (100) uchun
    assert.match(r.extensions, /\[crm-outbound\][\s\S]*GotoIf\(\$\[\$\{REGEX\("\^\(100\)\(-web\)\?\$" \$\{CRM_EP\}\)\}\]\?r1\)\n same => n,Hangup\(21\)/);
    assert.match(r.extensions, /same => n\(r1\),Set\(CRM_EXT=\$\{CUT\(CRM_EP,-,1\)\}\)[\s\S]*?Set\(CALLERID\(num\)=0552233\)[\s\S]*?same => n,Dial\(PJSIP\/\$\{EXTEN\}@trunk-0552233,60\)/);
  });

  test('in`ektsiya: qator uzilishi / ; / " — sxema rad etadi, generator ikkinchi qatlam sifatida to`xtatadi', () => {
    for (const bad of [{ server: '1.2.3.4\n[evil]' }, { server: '1.2.3.4;x' }, { login: 'a"b' }, { login: 'a\nb' }, { password: 'p;w' }, { password: 'p\r\nw' }]) {
      assert.throws(() => normalizeConfig('trunk', { login: 'l', server: '1.2.3.4', ...bad }), /noto|ruxsat/i, JSON.stringify(bad));
    }
    assert.throws(() => normalizeConfig('numrule', { mask: '998";Dial(x)' }));
    assert.throws(() => normalizeConfig('numrule', { mask: '_X.' }));
    assert.throws(() => normalizeConfig('http', { url: 'https://a.uz/x;Dial(PJSIP/1)' }));
    assert.equal(normalizeConfig('trunk', { displayName: 'A"B;\nC', server: 'sip.uz:5060', login: 'l' }).config.displayName, 'ABC');
    // generator: sxemani chetlab o'tgan qiymat (eski baza yozuvi) — xato
    assert.throws(() => generateAsterisk([mod('user', '100', {}, 'Ali\n[evil]')]), /ruxsat/i);
    assert.throws(() => generateAsterisk([mod('user', '100', {})], { sipSecrets: { 100: 'a;b' } }), /ruxsat/i);
    assert.throws(() => generateAsterisk([mod('user', 'transport-udp', {})]), /2–5/);
    // callerid nomidan " olib tashlanadi
    assert.match(generateAsterisk([mod('user', '100', {}, 'A"li')]).pjsip, /callerid="Ali" <100>/);
  });

  test('kontekst nomlari to`qnashmaydi (1-2 va 1_2); trunk bo`limi kodlangan', () => {
    const x = generateAsterisk([mod('alias', '1-2', {}), mod('alias', '1_2', {})]).extensions;
    assert.match(x, /\[m1_2d2\]/);
    assert.match(x, /\[m1_5f2\]/);
  });

  test('http: URL`da ? bo`lsa & bilan qo`shiladi, raqam URL-kodlanadi, ; ekranlanadi', () => {
    const x = generateAsterisk([mod('http', '5300', { url: 'https://a.uz/h?k=1' })]).extensions;
    assert.match(x, /CURL\(https:\/\/a\.uz\/h\?k=1&caller=\$\{URIENCODE\(\$\{CALLERID\(num\)\}\)\}/);
    const y = generateAsterisk([mod('http', '5301', { url: 'https://a.uz/h' })]).extensions;
    assert.match(y, /CURL\(https:\/\/a\.uz\/h\?caller=/);
  });

  test('salomlashish: delaySec=0 — kutmasdan o`tadi; noto`g`ri tugma 3 martadan keyin to`xtaydi', () => {
    const x = generateAsterisk([mod('greeting', '5000', { delaySec: 0 })]).extensions;
    assert.ok(!/WaitExten/.test(x), 'delaySec=0 da WaitExten bo`lmasligi kerak');
    assert.match(x, /same => n,Goto\(t,1\)/);
    assert.match(x, /exten => i,1,Set\(CRM_TRIES=\$\[\$\{CRM_TRIES\} \+ 1\]\)\n same => n,GotoIf\(\$\[\$\{CRM_TRIES\} < 3\]\?s,menu\)/);
  });

  test('yozib olish (MixMonitor) sozlama bilan; stol telefoni (webrtc=false); chiquvchi maska prefiks', () => {
    const base = [mod('user', '100', {}), mod('user', '101', { webrtc: false }), mod('trunk', '0552233', { login: 'l', server: '1.1.1.1' })];
    const off = generateAsterisk(base, { outgoing: { rules: [{ mask: '+998', trunk: '0552233', users: [], externalNumber: '+998712000000' }] } });
    assert.ok(!off.extensions.includes('MixMonitor'));
    assert.match(off.extensions, /GotoIf\(\$\[\$\{REGEX\("\^998" \$\{EXTEN\}\)\}\]\?r1\)/);
    assert.match(off.extensions, /Set\(CALLERID\(num\)=\+998712000000\)/);
    assert.match(off.pjsip, /\[100\]\ntype=endpoint[\s\S]*?webrtc=yes/);
    assert.ok(!/\[101\]\ntype=endpoint[^[]*webrtc=yes/.test(off.pjsip), 'stol telefoniga webrtc=yes yozilmasin');
    const on = generateAsterisk(base, { recording: { enabled: true, dir: '/var/spool/asterisk/monitor' }, outgoing: { rules: [{ mask: '', trunk: '0552233', users: [] }] } });
    assert.match(on.extensions, /MixMonitor\(\/var\/spool\/asterisk\/monitor\/\$\{IF\(/);
    assert.match(on.extensions, /Set\(CRM_UF=crm:\$\{CRM_UUID\} \$\{CRM_UF\}\)/);
  });

  test('audio kutubxona fayli custom/<id> sifatida ishlatiladi', () => {
    const x = generateAsterisk([mod('greeting', '5000', { audioId: 'abc123', delaySec: 5 })]);
    assert.match(x.extensions, /Background\(custom\/abc123\)/);
    assert.match(generateAsterisk([mod('greeting', '5001', {})]).extensions, /Background\(silence\/1\)/);
  });

  test('mavjud bo`lmagan yoki o`chirilgan marshrutga o`tish — Hangup (osilib qolmaydi)', () => {
    const x = generateAsterisk([mod('voicemail', '5120', { forwardTo: '7777' })]);
    assert.match(x.extensions, /\[m5120\][\s\S]*same => n,Hangup\(\)/);
    assert.ok(!x.extensions.includes('m7777'));
  });

  test('queues.conf: strategiya, a`zolar ustuvorligi', () => {
    assert.match(r.queues, /\[qm5200\]\nstrategy=leastrecent\ntimeout=15/);
    assert.match(r.queues, /member => Local\/100@crm-user\/n,0\nmember => Local\/101@crm-user\/n,1/);
  });

  test('server: oldindan ko`rish parol chiqarmaydi', async () => {
    const T = await admin();
    const t = await ok('POST', '/pbx/modules', { type: 'trunk', number: uniq('9').slice(0, 10).replace(/\D/g, '') || '9001', config: { login: 'l', server: '1.2.3.4', password: 'maxfiy-parol-123' } }, T, 201);
    const pv = await ok('GET', '/pbx/asterisk/preview', undefined, T, 200);
    assert.ok(pv.pjsip.includes('type=registration'));
    assert.ok(!JSON.stringify(pv).includes('maxfiy-parol-123'), 'oldindan ko`rishda parol chiqib ketdi');
    await ok('DELETE', `/pbx/modules/${t.module.id}`, undefined, T, 200);
    void req;
  });

  test('qo`llash: fayllar yoziladi (haqiqiy parollar bilan), audio ko`chiriladi; CRM foydalanuvchisiz xodim bo`lsa 400', async () => {
    const T = await admin();
    const u = await userWithRole('sotuvchi');
    const wav = Buffer.concat([Buffer.from('RIFF....WAVEfmt '), Buffer.alloc(300, 1)]).toString('base64');
    const au = await ok('POST', '/pbx/audio', { name: 'salom.wav', mime: 'audio/wav', data: wav }, T, 201);
    const m1 = (await ok('POST', '/pbx/modules', { type: 'user', number: '9401', name: 'Apply Ali', config: { crmUserId: u.id } }, T, 201)).module;
    const m2 = (await ok('POST', '/pbx/modules', { type: 'user', number: '9402', name: 'Parolsiz' }, T, 201)).module;
    const g = (await ok('POST', '/pbx/modules', { type: 'greeting', number: '9450', config: { audioId: au.id } }, T, 201)).module;
    const tr = (await ok('POST', '/pbx/modules', { type: 'trunk', number: '0559900', config: { login: 'lg', server: '9.9.9.9', password: 'trunk-maxfiy-1', forwardTo: '9450' } }, T, 201)).module;
    // 9402 uchun SIP paroli yo'q → rad
    const bad = await req('POST', '/pbx/asterisk/apply', undefined, T);
    assert.equal(bad.status, 400);
    assert.match(bad.data.message, /9402/);
    await ok('DELETE', `/pbx/modules/${m2.id}`, undefined, T, 200);
    const r = await ok('POST', '/pbx/asterisk/apply', undefined, T, [200, 201]);
    assert.deepEqual(r.written.sort(), ['extensions_crm.conf', 'pjsip_crm.conf', 'queues_crm.conf']);
    assert.equal(r.reloaded, false, 'AMI yo`q — qayta yuklash o`tkazib yuboriladi');
    const dir = '/tmp/crm-e2e-asterisk/conf';
    const pj = readFileSync(`${dir}/pjsip_crm.conf`, 'utf8');
    assert.match(pj, /\[9401\]\ntype=endpoint/);
    assert.ok(!pj.includes('CHANGE_ME'), 'SIP paroli joyiga o`rin to`ldiruvchi yozilib qoldi');
    assert.match(pj, /password=trunk-maxfiy-1/, 'trunk paroli haqiqiy faylda bo`lishi kerak');
    assert.match(readFileSync(`${dir}/extensions_crm.conf`, 'utf8'), /Background\(custom\/[A-Za-z0-9]+\)/);
    assert.ok(existsSync(`/tmp/crm-e2e-asterisk/sounds/custom/${au.id}.wav`), 'audio fayl ko`chirilmadi');
    // oldindan ko'rishda parol yo'q
    const pv = await ok('GET', '/pbx/asterisk/preview', undefined, T, 200);
    assert.ok(!JSON.stringify(pv).includes('trunk-maxfiy-1'));
    assert.equal((await req('POST', '/pbx/asterisk/apply', undefined, (await userWithRole('sotuvchi')).token)).status, 403);
    for (const m of [tr, g, m1]) await ok('DELETE', `/pbx/modules/${m.id}`, undefined, T, 200);
    await ok('DELETE', `/pbx/audio/${au.id}`, undefined, T, 200);
  });

  test('trunk: IP bo`yicha (register=false) — ro`yxatdan o`tish yo`q; qo`shimcha kiruvchi raqamlar (DID) bir xil marshrutga', () => {
    const t = mod('trunk', '7000', { login: '7000', server: '89.0.0.9', password: 'pw-secret-1', register: false, dids: '+998712345678; 998712345679', forwardTo: '10' });
    const g = generateAsterisk([mod('user', '100', {}, 'Ali'), mod('group', '10', { members: ['100'], afterSec: 20 }), t], { sipSecrets: { 100: 'x100x100x100x100x100' } });
    assert.ok(!/type=registration/.test(g.pjsip), 'IP bo`yicha trunkda registration bo`lmasligi kerak');
    assert.match(g.pjsip, /\[trunk-7000\]\ntype=aor\ncontact=sip:89\.0\.0\.9/);
    for (const n of ['7000', '998712345678', '+998712345678', '998712345679']) assert.ok(g.extensions.includes('exten => ' + n + ',1,Gosub(blacklist-check,s,1)'), 'DID ' + n + ' marshruti yo`q');
    assert.throws(() => normalizeConfig('trunk', { login: 'a', server: '1.2.3.4', dids: 'abc' }), /Kiruvchi raqam/);
  });
});
