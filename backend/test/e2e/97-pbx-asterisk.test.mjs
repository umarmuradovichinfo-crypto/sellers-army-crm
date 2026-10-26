// Asterisk sozlama generatori: modullar → pjsip.conf / extensions.conf / queues.conf (matn tuzilishi).
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { generateAsterisk } from '../../dist/pbx/asterisk.generator.js';
import { req, ok, admin, uniq } from './lib.mjs';

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
    assert.match(r.extensions, /"\$\{CALLERID\(num\)\}" = "\+998900000000"\]\?blocked,1/);
    assert.match(r.extensions, /\[m5100\][\s\S]*GotoIfTime\(09:00-18:00,mon,\*,\*,Etc\/GMT-5\?work\)/);
    assert.ok(!/GotoIfTime\([^)]*,sun,/.test(r.extensions), 'o`chirilgan kun uchun vaqt sharti bo`lmasligi kerak');
    assert.match(r.extensions, /2026-01-01"\]\?holiday/);
    assert.match(r.extensions, /\[m10\]\nexten => s,1,Dial\(PJSIP\/100&PJSIP\/101,20\)[\s\S]*Goto\(m5200,s,1\)/);
    assert.match(r.extensions, /\[m5000\][\s\S]*exten => 1,1,Goto\(m10,s,1\)[\s\S]*exten => 100,1,Goto\(m100,s,1\)/);
    assert.match(r.extensions, /\[m101\]\nexten => s,1,Dial\(PJSIP\/101,20\)[\s\S]*Goto\(m5120,s,1\)/);
    assert.match(r.extensions, /exten => _X\.,1,Set\(CALLERID\(num\)=0552233\)\n same => n,Dial\(PJSIP\/\$\{EXTEN\}@trunk-0552233,60\)/);
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
    assert.match(r.queues, /member => PJSIP\/100,0\nmember => PJSIP\/101,1/);
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
});
