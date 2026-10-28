// Jonli Asterisk 23 sinovi (scripts/pbx-live) topilmalari: tunni kesib o'tuvchi vaqt qoidasi, IVR raqam kutishi, ovozli pochta (CRM'da),
// brauzer telefoni kodeklari, NAT, yozuvlarni saqlash muddati (fon tozalash + «yozuv mavjud emas»).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync, utimesSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { generateAsterisk, natFromEnv, isHostAddress, isLocalNet } from '../../dist/pbx/asterisk.generator.js';
import { normalizeConfig } from '../../dist/pbx/pbx-schema.js';
import { OwnPbxProvider } from '../../dist/onlinepbx/own-pbx.provider.js';
import { RECORDING_FILE_RE } from '../../dist/pbx/recording-retention.service.js';
import { req, ok, admin, userWithRole } from './lib.mjs';

const mod = (type, number, config = {}, name = null, enabled = true) => ({ type, number, name, enabled, config });
const days = (over) => Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, over[d] || { on: false, from: '09:00', to: '18:00' }]));
const REC = process.env.ASTERISK_RECORDINGS_DIR || '/tmp/crm-e2e-asterisk/rec';
const wav = (n) => Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(40), Buffer.alloc(n, 7)]);

describe('Generator: jonli sinov topilmalari', () => {
  test('vaqt qoidasi: tunni kesib o`tuvchi oraliq ikkiga bo`linadi (yak 22:00 → dush 06:00); from=to — butun kun', () => {
    const x = generateAsterisk([mod('user', '101'), mod('timerule', '5100', { timezone: 'UTC+5', days: days({ sun: { on: true, from: '22:00', to: '06:00' }, wed: { on: true, from: '09:00', to: '09:00' }, mon: { on: true, from: '09:00', to: '18:00' } }), workTo: '101' })]).extensions;
    assert.match(x, /GotoIfTime\(22:00-23:59,sun,\*,\*,Etc\/GMT-5\?work\)/);
    assert.match(x, /GotoIfTime\(00:00-06:00,mon,\*,\*,Etc\/GMT-5\?work\)/, 'kun almashgach (dushanba ertalab) ham ish vaqti bo`lishi kerak');
    assert.ok(!/GotoIfTime\(22:00-06:00/.test(x), 'bitta qator 22:00-06:00 Asterisk`da o`sha kunning o`zida aylanadi (noto`g`ri)');
    assert.match(x, /GotoIfTime\(09:00-18:00,mon,/);
    assert.match(x, /GotoIfTime\(00:00-23:59,wed,/);
  });

  test('vaqt mintaqasi: faqat Asterisk`da bor Etc/GMT zonalari (UTC-12 … UTC+14)', () => {
    assert.throws(() => normalizeConfig('timerule', { timezone: 'UTC+15' }), /UTC-12/);
    assert.throws(() => normalizeConfig('timerule', { timezone: 'UTC-13' }), /UTC-12/);
    const x = generateAsterisk([mod('user', '101'), mod('timerule', '5101', { timezone: 'UTC+14', days: days({ mon: { on: true, from: '09:00', to: '18:00' } }), workTo: '101' }), mod('timerule', '5102', { timezone: 'UTC-12', days: days({ mon: { on: true, from: '09:00', to: '18:00' } }), workTo: '101' })]).extensions;
    assert.match(x, /Etc\/GMT-14\?work/);
    assert.match(x, /Etc\/GMT\+12\?work/);
  });

  test('vaqt qoidasi va raqam qoidasi ichki raqamdan ham teriladi (from-internal)', () => {
    const x = generateAsterisk([mod('user', '101'), mod('timerule', '5100', { workTo: '101' }), mod('numrule', '6200', { mask: '99X', matchTo: '101' })]).extensions;
    const fi = x.slice(x.indexOf('[from-internal]'));
    assert.match(fi, /exten => 5100,1,NoOp\(Ichki\)\n same => n,Goto\(m5100,s,1\)/);
    assert.match(fi, /exten => 6200,1,NoOp\(Ichki\)/);
  });

  test('IVR: menyu tugmasi ichki raqam boshlanishi bilan bir xil bo`lsa raqam kutishi 2 s (aks holda 5 s jimlik)', () => {
    const users = [mod('user', '101'), mod('user', '200')];
    const amb = generateAsterisk([...users, mod('greeting', '5000', { menu: [{ key: '1', to: '101' }], allowExt: true, delaySec: 4 })]).extensions;
    assert.match(amb, /\[m5000\]\nexten => s,1,Answer\(\)\n same => n,Set\(CRM_TRIES=0\)\n same => n,Set\(TIMEOUT\(digit\)=2\)\n same => n\(menu\),Background/);
    const noExt = generateAsterisk([...users, mod('greeting', '5000', { menu: [{ key: '1', to: '101' }], allowExt: false })]).extensions;
    assert.ok(!noExt.includes('TIMEOUT(digit)'));
    const noClash = generateAsterisk([...users, mod('greeting', '5000', { menu: [{ key: '9', to: '101' }], allowExt: true })]).extensions;
    assert.ok(!noClash.includes('TIMEOUT(digit)'));
  });

  test('ovozli pochta: xabar yozuvlar papkasiga `<id>-vm.wav` (yozish o`chiq bo`lsa ham), CDR userfield vm:1', () => {
    const vm = mod('voicemail', '5120', { recordSec: 30, silenceSec: 4 });
    const x = generateAsterisk([vm], { recording: { enabled: false, dir: '/data/rec/' } }).extensions;
    assert.ok(!x.includes('MixMonitor'));
    assert.match(x, /Set\(CRM_VM=\$\{IF\(\$\["\$\{CRM_UUID\}" != ""\]\?\$\{CRM_UUID\}:\$\{UNIQUEID\}\)\}\)/);
    assert.match(x, /Set\(CDR\(userfield\)=\$\{CDR\(userfield\)\} vm:1\)/);
    assert.match(x, /Record\(\/data\/rec\/\$\{CRM_VM\}-vm\.wav,4,30,k\)/);
    assert.match(generateAsterisk([vm]).extensions, /Record\(\/var\/spool\/asterisk\/monitor\/\$\{CRM_VM\}-vm\.wav,/);
    assert.throws(() => generateAsterisk([vm], { recording: { enabled: false, dir: '/a/../etc' } }), /papkasi/);
  });

  test('brauzer telefoni (-web): opus YO`Q (codec_opus o`rnatilmagan — stol telefoni bilan ko`prik uzilardi), ulaw/alaw', () => {
    const p = generateAsterisk([mod('user', '100')]).pjsip;
    const web = p.slice(p.indexOf('[100-web]'));
    assert.match(web, /allow=ulaw,alaw\n/);
    assert.ok(!p.includes('opus'));
    assert.match(web, /webrtc=yes/);
  });

  test('NAT: faqat berilganda transport-udp ga external_* va local_net; noto`g`ri qiymat — xato', () => {
    const plain = generateAsterisk([mod('user', '100')]).pjsip;
    assert.ok(!/external_|local_net/.test(plain));
    const n = generateAsterisk([mod('user', '100')], { nat: { externalAddress: '203.0.113.10', localNets: ['172.16.0.0/12', '10.0.0.0/255.0.0.0'] } }).pjsip;
    assert.match(n, /\[transport-udp\]\ntype=transport\nprotocol=udp\nbind=0\.0\.0\.0:5060\nexternal_media_address=203\.0\.113\.10\nexternal_signaling_address=203\.0\.113\.10\nlocal_net=172\.16\.0\.0\/12\nlocal_net=10\.0\.0\.0\/255\.0\.0\.0\n\n\[transport-ws\]/);
    assert.match(generateAsterisk([], { nat: { externalAddress: 'pbx.example.uz' } }).pjsip, /external_signaling_address=pbx\.example\.uz/);
    for (const bad of ['1.2.3.4;x', '1.2.3.4\nlocal_net=0.0.0.0/0', '300.1.1.1', '-x-.uz', 'a b', 'pbx.uz;']) {
      assert.throws(() => generateAsterisk([], { nat: { externalAddress: bad } }), /PBX_EXTERNAL_IP|Ruxsat etilmagan|qator uzilishi/, bad);
    }
    for (const bad of ['10.0.0.0/33', '10.0.0/8', 'fd00::/129', '1.2.3.4/8;x', 'abc']) {
      assert.throws(() => generateAsterisk([], { nat: { externalAddress: '1.2.3.4', localNets: [bad] } }), /PBX_LOCAL_NET|Ruxsat etilmagan/, bad);
    }
    assert.ok(isHostAddress('2001:db8::1') && isHostAddress('8.8.8.8') && !isHostAddress('1.2.3') && !isHostAddress(''));
    assert.ok(isLocalNet('192.168.0.0/16') && isLocalNet('fd00::/8') && isLocalNet('10.1.2.3') && !isLocalNet('10.0.0.0/8/1'));
  });

  test('NAT env: PBX_EXTERNAL_IP + PBX_LOCAL_NET; ichki tarmoq berilmasa — Docker/localhost', () => {
    assert.equal(natFromEnv({}), undefined);
    assert.deepEqual(natFromEnv({ PBX_EXTERNAL_IP: ' 203.0.113.10 ' }), { externalAddress: '203.0.113.10', localNets: ['127.0.0.0/8', '172.16.0.0/12'] });
    assert.deepEqual(natFromEnv({ PBX_EXTERNAL_IP: '203.0.113.10', PBX_LOCAL_NET: '10.0.0.0/8, 192.168.1.0/24' }).localNets, ['10.0.0.0/8', '192.168.1.0/24']);
  });
});

describe('O`z stansiya: yozuv fayllari (ovozli pochta, bo`sh MixMonitor fayli)', () => {
  const dir = join(REC, 'provider-' + process.pid);
  before(() => { mkdirSync(dir, { recursive: true }); process.env.ASTERISK_RECORDINGS_DIR = dir; });
  after(() => { rmSync(dir, { recursive: true, force: true }); process.env.ASTERISK_RECORDINGS_DIR = REC; });

  test('MixMonitor `b` bo`sh fayli (44 bayt) e`tiborsiz — ovozli pochta xabari (-vm.wav) beriladi; fayl yo`q — yozuv yo`q', async () => {
    const p = new OwnPbxProvider();
    writeFileSync(join(dir, '1793191367.31.wav'), Buffer.alloc(44));
    assert.equal(await p.hasRecordingFile('own:1793191367.31'), false, 'faqat bo`sh sarlavha — yozuv yo`q');
    writeFileSync(join(dir, '1793191367.31-vm.wav'), wav(4000));
    assert.equal(await p.hasRecordingFile('own:1793191367.31'), true);
    const f = await p.fetchRecording('own:1793191367.31');
    assert.equal(f.buffer.length, 4044, 'bo`sh .wav emas, ovozli pochta fayli qaytishi kerak');
    assert.equal(f.contentType, 'audio/wav');
    assert.equal(await p.hasRecordingFile('own:../etc/passwd'), false);
    assert.equal(await p.hasRecordingFile('own:nonexistent1'), false);
  });
});

describe('Yozuvlarni saqlash muddati (keepDays) va «yozuv mavjud emas»', () => {
  let T;
  before(async () => { T = await admin(); mkdirSync(REC, { recursive: true }); });
  after(async () => { await ok('PUT', '/pbx/recording', { keepDays: 90 }, T, 200); });

  test('sozlama: standart 90; 0–3650 butun son; noto`g`ri — 400; faqat sozlama huquqi bilan', async () => {
    const cur = await ok('GET', '/pbx/recording', undefined, T, 200);
    assert.equal(cur.keepDays, 90);
    assert.equal((await ok('PUT', '/pbx/recording', { keepDays: 30 }, T, 200)).keepDays, 30);
    assert.equal((await ok('PUT', '/pbx/recording', { enabled: true }, T, 200)).keepDays, 30, 'boshqa maydon saqlanganda muddat o`zgarmasin');
    assert.equal((await ok('PUT', '/pbx/recording', { keepDays: '0' }, T, 200)).keepDays, 0);
    for (const bad of [-1, 3651, 1.5, 'abc', '7;rm']) assert.equal((await req('PUT', '/pbx/recording', { keepDays: bad }, T)).status, 400, String(bad));
    const S = await userWithRole('sotuvchi');
    assert.equal((await req('PUT', '/pbx/recording', { keepDays: 1 }, S.token)).status, 403);
    assert.equal((await req('POST', '/pbx/recording/cleanup', undefined, S.token)).status, 403);
  });

  test('fon tozalash: faqat muddati o`tgan `<uuid|uniqueid>[-vm].wav/mp3`; boshqa fayllar, simlinklar, yangi yozuvlar — tegilmaydi; 0 — o`chirmaydi', async () => {
    const old = Date.now() / 1000 - 100 * 86400;
    const u1 = randomUUID(), u2 = randomUUID(), u3 = randomUUID();
    const files = { oldUuid: `${u1}.wav`, oldVm: '1793000000.7-vm.wav', oldMp3: `${u2}.mp3`, fresh: `${u3}.wav`, tone: 'tone.wav', txt: `${u1}.txt`, weird: `x${u1}.wav` };
    for (const f of Object.values(files)) writeFileSync(join(REC, f), wav(100));
    for (const k of ['oldUuid', 'oldVm', 'oldMp3', 'tone', 'txt', 'weird']) utimesSync(join(REC, files[k]), old, old);
    // simlink nomi naqshga mos, lekin ortida boshqa fayl — o'chirilmasin (na simlink, na nishon)
    const target = join(REC, '..', `keep-${process.pid}.wav`);
    writeFileSync(target, wav(100)); utimesSync(target, old, old);
    const link = `${randomUUID()}.wav`;
    symlinkSync(target, join(REC, link));
    await ok('PUT', '/pbx/recording', { keepDays: 0 }, T, 200);
    const zero = await ok('POST', '/pbx/recording/cleanup', undefined, T, [200, 201]);
    assert.equal(zero.deleted, 0);
    assert.ok(existsSync(join(REC, files.oldUuid)), 'keepDays=0 — hech narsa o`chirilmaydi');
    await ok('PUT', '/pbx/recording', { keepDays: 90 }, T, 200);
    const r = await ok('POST', '/pbx/recording/cleanup', undefined, T, [200, 201]);
    assert.equal(r.ok, true);
    assert.ok(r.deleted >= 3, JSON.stringify(r));
    for (const k of ['oldUuid', 'oldVm', 'oldMp3']) assert.ok(!existsSync(join(REC, files[k])), `${k} o'chirilishi kerak edi`);
    for (const k of ['fresh', 'tone', 'txt', 'weird']) assert.ok(existsSync(join(REC, files[k])), `${k} o'chirilmasligi kerak edi`);
    assert.ok(existsSync(join(REC, link)) && existsSync(target), 'simlink va nishon saqlanishi kerak');
    for (const f of [files.fresh, files.tone, files.txt, files.weird, link]) rmSync(join(REC, f), { force: true });
    rmSync(target, { force: true });
    assert.ok(RECORDING_FILE_RE.test(`${u1}-vm.wav`) && !RECORDING_FILE_RE.test('../x.wav') && !RECORDING_FILE_RE.test(`${u1}.wav.bak`));
  });

  test('jurnal: fayl o`chirilgach «yozuv mavjud emas» (hasRecording=false), recordUrl saqlanadi; ovozli pochta natijasi', async () => {
    const cfg = await ok('PUT', '/crm/pbx/config', { domain: 'e2e.onpbx.ru', apiKey: 'e2e-test-key', defaultExt: '100' }, T, 200);
    const secret = decodeURIComponent(cfg.webhookUrl.match(/[?&]secret=([^&]+)/)[1]);
    const id = randomUUID();
    const n = String(900000000 + Math.floor(Math.random() * 99999999)).slice(0, 9);
    writeFileSync(join(REC, `${id}-vm.wav`), wav(2000));
    const h = await req('POST', `/onlinepbx/webhook?secret=${encodeURIComponent(secret)}`, { accountcode: 'inbound', caller: `998${n}`, callee: '100', uuid: id, dialog_duration: 0, call_duration: 25, hangup_cause: 'voicemail', download_url: `own:${id}` });
    assert.ok([200, 201].includes(h.status), JSON.stringify(h.data));
    try {
      await ok('PUT', '/crm/pbx/config', { provider: 'own' }, T, 200);
      const a = (await ok('GET', `/crm/calls/report?phone=${n}`, undefined, T, 200)).calls[0];
      assert.equal(a.hasRecording, true);
      assert.equal(a.result, 'Ovozli pochta');
      assert.equal(a.status, 'missed');
      rmSync(join(REC, `${id}-vm.wav`));
      const b = (await ok('GET', `/crm/calls/report?phone=${n}`, undefined, T, 200)).calls[0];
      assert.equal(b.hasRecording, false, 'fayl yo`q — tinglash tugmasi chiqmasin');
      const raw = (await ok('GET', '/crm/calls?limit=50', undefined, T, 200)).calls.find((c) => c.externalId === id);
      assert.equal(raw.recordUrl, `own:${id}`, 'recordUrl o`chirilmaydi');
      assert.equal(raw.hasRecording, false);
      assert.notEqual((await req('GET', `/crm/calls/${raw.id}/recording`, undefined, T)).status, 200, 'o`chirilgan yozuv berilmasin');
    } finally {
      await ok('PUT', '/crm/pbx/config', { provider: 'onlinepbx', domain: '', apiKey: '', callMode: 'callback' }, T, 200);
    }
  });
});
