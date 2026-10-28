// Telefoniya servislari: ovoz sintezi (TTS), sifat bahosi (IVR), avtoinformator. Sof funksiyalar, soxta HTTP/AMI serverlar va API.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanTtsText, azureSsml, pickProvider, pickVoice, azureSynth, googleSynth, espeakSynth, mockSynth, TTS_MAX } from '../../dist/pbx/tts/tts.js';
import { parseNumbers, inWindow, pickTargets, afterAttempt, reasonText } from '../../dist/pbx/informer/informer.js';
import { generateAsterisk } from '../../dist/pbx/asterisk.generator.js';
import { OwnPbxProvider, rateFromEvent, cdrToCallBody } from '../../dist/onlinepbx/own-pbx.provider.js';
import { parseAmiBlock } from '../../dist/onlinepbx/asterisk-ami.js';
import { CallsService } from '../../dist/onlinepbx/calls.service.js';
import { req, ok, admin, userWithRole, uniq } from './lib.mjs';

const mod = (type, number, config = {}, name = null, enabled = true) => ({ type, number, name, enabled, config });
const MODS = [
  mod('user', '100', { crmUserId: 'u1' }, 'Ali'), mod('user', '101', { crmUserId: 'u2' }, 'Vali'),
  mod('group', '10', { members: ['100', '101'], afterSec: 20 }), mod('queue', '5200', { members: ['100'], forwardTo: '10' }),
  mod('trunk', '0552233', { server: 'sip.example.uz', login: '0552233', password: 'p', forwardTo: '10' }),
];
const OUT = { rules: [{ mask: '998XXXXXXXXX', trunk: '0552233', users: ['100'], externalNumber: '+998712000000' }] };
const wav = (n = 400) => { const b = Buffer.alloc(44 + n); b.write('RIFF', 0); b.write('WAVE', 8); return b; };

// ─────────────────────────── TTS ───────────────────────────
describe('Ovoz sintezi: sof funksiyalar', () => {
  test('matn tozalash: teglar (SSML injeksiya), nazorat belgilari, espeak fonema [[..]] olib tashlanadi', () => {
    assert.equal(cleanTtsText('  Salom <break time="9s"/> dunyo\n\t[[a:]]  '), 'Salom dunyo a:');
    assert.equal(cleanTtsText('</voice><voice name="x">hack'), 'hack');
    assert.equal(cleanTtsText('a\u0000b c'), 'a b c');
    assert.equal(cleanTtsText(null), '');
  });
  test('Azure SSML: matn XML-ekranlanadi, til va ovoz to`g`ri', () => {
    const s = azureSsml(`Narx & "chegirma" 'bugun' <b>`, 'uz', 'uz-UZ-MadinaNeural');
    assert.match(s, /^<speak version='1.0' xml:lang='uz-UZ'><voice name='uz-UZ-MadinaNeural'>/);
    assert.ok(s.includes('Narx &amp; &quot;chegirma&quot; &apos;bugun&apos;'));
    assert.ok(!s.includes('<b>'));
  });
  test('provayder tanlash: kalit bo`lsa Azure → Google, aks holda espeak; sozlama ustun (mavjud bo`lsa); mock faqat production emas', () => {
    assert.equal(pickProvider(undefined, { AZURE_TTS_KEY: 'k', AZURE_TTS_REGION: 'westeurope', GOOGLE_TTS_API_KEY: 'g' }, true), 'azure');
    assert.equal(pickProvider(undefined, { GOOGLE_TTS_API_KEY: 'g' }, true), 'google');
    assert.equal(pickProvider(undefined, {}, true), 'espeak');
    assert.equal(pickProvider(undefined, {}, false), null);
    assert.equal(pickProvider('espeak', { AZURE_TTS_KEY: 'k', AZURE_TTS_REGION: 'x' }, true), 'espeak');
    assert.equal(pickProvider('azure', {}, true), 'espeak', 'kalitsiz Azure tanlansa — mavjud provayder');
    assert.equal(pickProvider('mock', { PBX_TTS_MOCK: '1' }, false), 'mock');
    assert.equal(pickProvider('mock', { PBX_TTS_MOCK: '1', NODE_ENV: 'production' }, false), null);
    assert.equal(pickVoice('azure', 'uz', 'ru-RU-SvetlanaNeural').id, 'uz-UZ-MadinaNeural', 'boshqa til ovozi — tilning standart ovozi');
    assert.equal(pickVoice('azure', 'uz', 'uz-UZ-SardorNeural').id, 'uz-UZ-SardorNeural');
    assert.equal(pickVoice('espeak', 'ru').id, 'ru');
  });
  test('mock: 8 kHz mono wav', () => {
    const b = mockSynth('Salom');
    assert.equal(b.toString('ascii', 0, 4), 'RIFF');
    assert.equal(b.readUInt32LE(24), 8000);
    assert.equal(b.readUInt16LE(22), 1);
  });
});

describe('Ovoz sintezi: Azure/Google REST va espeak (soxta server / soxta bin)', () => {
  let server, port; const got = [];
  before(async () => {
    server = http.createServer((rq, rs) => {
      let body = ''; rq.on('data', (d) => (body += d)); rq.on('end', () => {
        got.push({ url: rq.url, headers: rq.headers, body });
        if (rq.headers['ocp-apim-subscription-key'] === 'bad' || rq.headers['x-goog-api-key'] === 'bad') { rs.writeHead(401); return rs.end(); }
        if (rq.url.startsWith('/azure')) { rs.writeHead(200, { 'Content-Type': 'audio/wav' }); return rs.end(wav()); }
        rs.writeHead(200, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify({ audioContent: wav().toString('base64') }));
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
  });
  after(() => server.close());

  test('Azure: kalit sarlavhada, 8 kHz PCM formati, SSML tanasi; noto`g`ri ovoz va kalit — xato', async () => {
    const env = { AZURE_TTS_KEY: 'k1', AZURE_TTS_ENDPOINT: `http://127.0.0.1:${port}/azure` };
    const b = await azureSynth('Salom <x>', 'uz', 'uz-UZ-MadinaNeural', env);
    assert.equal(b.toString('ascii', 0, 4), 'RIFF');
    const r = got.pop();
    assert.equal(r.headers['ocp-apim-subscription-key'], 'k1');
    assert.equal(r.headers['x-microsoft-outputformat'], 'riff-8khz-16bit-mono-pcm');
    assert.equal(r.headers['content-type'], 'application/ssml+xml');
    assert.match(r.body, /<voice name='uz-UZ-MadinaNeural'>Salom<\/voice>/);
    await assert.rejects(azureSynth('x', 'uz', "uz-UZ-MadinaNeural'/><evil", env), /Ovoz/);
    await assert.rejects(azureSynth('x', 'uz', 'uz-UZ-MadinaNeural', { ...env, AZURE_TTS_KEY: 'bad' }), /kaliti/);
    await assert.rejects(azureSynth('x', 'uz', 'uz-UZ-MadinaNeural', { AZURE_TTS_KEY: 'k', AZURE_TTS_REGION: 'west europe/../x' }), /REGION/);
  });

  test('Google: kalit URL`da emas, sarlavhada; LINEAR16 8000 Hz', async () => {
    const env = { GOOGLE_TTS_API_KEY: 'g1', GOOGLE_TTS_ENDPOINT: `http://127.0.0.1:${port}` };
    const b = await googleSynth('Привет', 'ru', 'ru-RU-Wavenet-A', env);
    assert.equal(b.toString('ascii', 0, 4), 'RIFF');
    const r = got.pop();
    assert.equal(r.url, '/v1/text:synthesize');
    assert.equal(r.headers['x-goog-api-key'], 'g1');
    const j = JSON.parse(r.body);
    assert.deepEqual(j.audioConfig, { audioEncoding: 'LINEAR16', sampleRateHertz: 8000 });
    assert.equal(j.voice.name, 'ru-RU-Wavenet-A');
    await googleSynth('Salom', 'uz', 'uz-UZ', env);
    assert.equal(JSON.parse(got.pop().body).voice.name, undefined, 'o`zbek — til bo`yicha standart ovoz');
  });

  test('espeak: argumentlar massiv (shell yo`q), matn stdin orqali — `$(...)` bajarilmaydi', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'espk-'));
    const bin = join(dir, 'espeak-ng');
    const pwn = join(dir, 'pwned');
    writeFileSync(join(dir, 'out.wav'), wav(800));
    writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' "$@" > "${dir}/args"\ncat > "${dir}/stdin"\ncat "${dir}/out.wav"\n`);
    chmodSync(bin, 0o755);
    const b = await espeakSynth(`Salom $(touch ${pwn}); \`touch ${pwn}\``, 'uz+f3', { ESPEAK_BIN: bin });
    assert.equal(b.length, 844);
    assert.equal(existsSync(pwn), false, 'shell in`ektsiyasi bajarilmasligi kerak');
    assert.deepEqual(readFileSync(join(dir, 'args'), 'utf8').trim().split('\n'), ['-v', 'uz+f3', '-s', '140', '--stdin', '--stdout']);
    assert.ok(readFileSync(join(dir, 'stdin'), 'utf8').includes('$(touch'));
    await assert.rejects(espeakSynth('x', 'uz; rm -rf /', { ESPEAK_BIN: bin }), /Ovoz/);
    await assert.rejects(espeakSynth('x', 'uz', { ESPEAK_BIN: join(dir, 'yoq') }), /topilmadi/);
  });
});

describe('Ovoz sintezi: API (sinov provayderi PBX_TTS_MOCK=1)', () => {
  let T;
  before(async () => { T = await admin(); });

  test('ovozlar ro`yxati va provayder sozlamasi', async () => {
    const v = await ok('PUT', '/pbx/tts/settings', { provider: 'mock' }, T);
    assert.equal(v.provider, 'mock');
    assert.ok(v.voices.some((x) => x.lang === 'uz'));
    assert.deepEqual(v.langs, ['uz', 'ru', 'en']);
    assert.equal(v.maxLength, TTS_MAX);
    assert.ok(v.providers.find((p) => p.id === 'azure').available === false, 'kalitsiz Azure faol emas');
    await ok('PUT', '/pbx/tts/settings', { provider: 'sox' }, T, 400);
  });

  test('matn → audio kutubxona yozuvi (8 kHz wav), tinglash; tozalangan nom', async () => {
    const a = await ok('POST', '/pbx/tts', { text: 'Assalomu alaykum <prosody rate="x-fast">!</prosody>', lang: 'uz' }, T);
    assert.equal(a.mime, 'audio/wav');
    assert.equal(a.provider, 'mock');
    assert.ok(a.size > 1000);
    assert.equal(a.name, 'Assalomu alaykum !');
    const list = await ok('GET', '/pbx/audio', undefined, T);
    assert.ok(list.files.some((f) => f.id === a.id));
    const res = await fetch(`${process.env.E2E_BASE}/pbx/audio/${a.id}/file`, { headers: { Authorization: `Bearer ${T}` } });
    const buf = Buffer.from(await res.arrayBuffer());
    assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
    assert.equal(buf.readUInt32LE(24), 8000, 'ffmpeg bilan 8 kHz');
  });

  test('validatsiya: bo`sh, 500 dan uzun, noto`g`ri til', async () => {
    assert.equal((await req('POST', '/pbx/tts', { text: '   <b></b> ', lang: 'uz' }, T)).status, 400);
    assert.equal((await req('POST', '/pbx/tts', { text: 'a'.repeat(501), lang: 'uz' }, T)).status, 400);
    assert.equal((await req('POST', '/pbx/tts', { text: 'Salom', lang: 'de' }, T)).status, 400);
  });

  test('huquq: sotuvchi ovoz sintezi va avtoinformatorga kira olmaydi', async () => {
    const u = await userWithRole('sotuvchi');
    assert.equal((await req('POST', '/pbx/tts', { text: 'Salom', lang: 'uz' }, u.token)).status, 403);
    assert.equal((await req('GET', '/pbx/informer', undefined, u.token)).status, 403);
    assert.equal((await req('PUT', '/pbx/quality', { enabled: false }, u.token)).status, 403);
  });
});

// ─────────────────────────── Sifat bahosi ───────────────────────────
describe('Sifat bahosi: dialplan', () => {
  const q = { enabled: true, promptAudioId: 'promptA1', thanksAudioId: 'thanksB2', scope: 'in' };
  test('o`chiq — hech narsa o`zgarmaydi (crm-rate yo`q, Dial `g`siz)', () => {
    const e = generateAsterisk(MODS, { outgoing: OUT }).extensions;
    assert.ok(!e.includes('[crm-rate]'));
    assert.ok(e.includes('Dial(PJSIP/100&PJSIP/100-web,15)'));
    assert.ok(!e.includes('CRM_RATE_ON'));
  });
  test('kiruvchi: trunkda bayroq + CRM_RATE_ID, Dial `g`, javobdan keyin crm-rate; navbat `c` va CONTINUE', () => {
    const e = generateAsterisk(MODS, { outgoing: OUT, quality: q }).extensions;
    const trunk = e.split('[from-trunk]')[1].split('\n[')[0];
    assert.ok(trunk.includes('same => n,Set(CRM_RATE_ON=1)'));
    assert.ok(trunk.includes('Set(__CRM_RATE_ID=${IF($["${CRM_UUID}" != ""]?${CRM_UUID}:${UNIQUEID})})'));
    assert.ok(e.includes('Dial(PJSIP/100&PJSIP/100-web,15,g)'));
    assert.ok(e.includes('Dial(PJSIP/100&PJSIP/100-web&PJSIP/101&PJSIP/101-web,20,g)'));
    assert.ok(e.includes(' same => n(done),GotoIf($["${CRM_RATE_ON}" = "1"]?crm-rate,s,1)'));
    assert.ok(e.includes('Queue(qm5200,tc,,,180)'));
    assert.ok(e.includes('GotoIf($["${QUEUESTATUS}" = "CONTINUE"]?done)'));
    const rate = e.split('[crm-rate]')[1];
    assert.ok(rate.includes('Set(CDR_PROP(disable)=1)'), 'so`rov qismi alohida CDR bo`lmasin');
    assert.ok(rate.includes('Read(CRM_RATE,custom/promptA1,1,,2,6)'));
    assert.ok(rate.includes('GotoIf($[${REGEX("^[1-5]$" ${CRM_RATE})}]?ok)'));
    assert.ok(rate.includes('UserEvent(CrmRate,Uuid: ${CRM_RATE_ID},Rating: ${CRM_RATE})'));
    assert.ok(rate.includes('Playback(custom/thanksB2)'));
    assert.ok(!e.includes('F(crm-rate'), 'faqat kiruvchi — chiquvchida F yo`q');
  });
  test('hammasi: chiquvchi Dial `F(crm-rate^s^1)`; audio berilmasa standart ovozlar; noto`g`ri id ishlatilmaydi', () => {
    const e = generateAsterisk(MODS, { outgoing: OUT, quality: { enabled: true, scope: 'all', promptAudioId: '../x', thanksAudioId: null } }).extensions;
    assert.ok(e.includes('Dial(PJSIP/${EXTEN}@trunk-0552233,60,F(crm-rate^s^1))'));
    assert.ok(e.includes('Read(CRM_RATE,beep,1,,2,6)'));
    assert.ok(e.includes('Playback(auth-thankyou)'));
  });
});

describe('Sifat bahosi: AMI hodisasi va CRM yozuvi', () => {
  test('rateFromEvent: faqat CrmRate, 1–5, xavfsiz uuid', () => {
    assert.deepEqual(rateFromEvent({ Event: 'UserEvent', UserEvent: 'CrmRate', Uuid: '1761650000.12', Rating: '4' }), { uuid: '1761650000.12', rating: 4 });
    assert.equal(rateFromEvent({ Event: 'UserEvent', UserEvent: 'CrmRate', Uuid: '1761650000.12', Rating: '6' }), null);
    assert.equal(rateFromEvent({ Event: 'UserEvent', UserEvent: 'CrmRate', Uuid: '1761650000.12', Rating: '' }), null);
    assert.equal(rateFromEvent({ Event: 'UserEvent', UserEvent: 'CrmRate', Uuid: "x'; drop", Rating: '3' }), null);
    assert.equal(rateFromEvent({ Event: 'UserEvent', UserEvent: 'CrmRing', Uuid: '1761650000.12', Rating: '3' }), null);
  });

  test('applyRating: yozuv bo`lsa darhol; bo`lmasa kutadi va CDR yozilgach qo`llanadi; idempotent; 1–5 tashqarisi rad', async () => {
    const rows = new Map();
    const prisma = { callLog: { updateMany: async ({ where, data }) => { if (!rows.has(where.externalId)) return { count: 0 }; rows.set(where.externalId, { ...rows.get(where.externalId), ...data }); return { count: 1 }; } } };
    const s = new CallsService({}, prisma, {}, { onCall() {}, onRate() {} }, {}, {}, {}, {}, {});
    rows.set('1761650000.1', { rating: null });
    assert.deepEqual(await s.applyRating('1761650000.1', 5), { ok: true, updated: 1 });
    assert.deepEqual(await s.applyRating('1761650000.1', 5), { ok: true, updated: 1 });
    assert.equal(rows.get('1761650000.1').rating, 5);
    assert.equal((await s.applyRating('1761650000.1', 9)).ok, false);
    assert.equal((await s.applyRating('../x', 3)).ok, false);
    const p = await s.applyRating('1761650000.2', 2);
    assert.equal(p.pending, true);
    rows.set('1761650000.2', { rating: null }); // CDR keldi
    await s.flushRating('1761650000.2');
    assert.equal(rows.get('1761650000.2').rating, 2);
  });

  test('API: yoqish uchun so`rov audiosi shart; audio mavjud bo`lsin; preview`da crm-rate; ishlatilgan audio o`chmaydi', async () => {
    const T = await admin();
    const prev = await ok('GET', '/pbx/quality', undefined, T);
    assert.equal((await req('PUT', '/pbx/quality', { enabled: true, promptAudioId: null }, T)).status, 400);
    assert.equal((await req('PUT', '/pbx/quality', { enabled: true, promptAudioId: 'yoqid123' }, T)).status, 400);
    assert.equal((await req('PUT', '/pbx/quality', { scope: 'hech' }, T)).status, 400);
    const a = await ok('POST', '/pbx/tts', { text: 'Xizmat sifatini 1 dan 5 gacha baholang', lang: 'uz', name: 'Baho so`rovi' }, T);
    const q = await ok('PUT', '/pbx/quality', { enabled: true, promptAudioId: a.id, scope: 'in' }, T);
    assert.deepEqual(q, { enabled: true, promptAudioId: a.id, thanksAudioId: null, scope: 'in' });
    const pv = await ok('GET', '/pbx/asterisk/preview', undefined, T);
    assert.ok(pv.extensions.includes(`Read(CRM_RATE,custom/${a.id},1,,2,6)`));
    const del = await req('DELETE', `/pbx/audio/${a.id}`, undefined, T);
    assert.equal(del.status, 409);
    assert.match(del.data.message, /sifat bahosi/);
    await ok('PUT', '/pbx/quality', { ...prev, enabled: false }, T);
  });

  test('provayder: CrmRate UserEvent → onRate; informer Originate (Local/…@crm-informer-out, __CRM_UUID) → onOriginate', async () => {
    const seen = [];
    const block = (o) => Object.entries(o).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n';
    const srv = net.createServer((sock) => {
      sock.write('Asterisk Call Manager/9.0.0\r\n');
      let buf = '';
      sock.on('data', (d) => {
        buf += d.toString();
        let i;
        while ((i = buf.indexOf('\r\n\r\n')) >= 0) {
          const m = parseAmiBlock(buf.slice(0, i)); buf = buf.slice(i + 4); seen.push(m);
          if (m.Action === 'Login') {
            sock.write(block({ Response: 'Success', ActionID: m.ActionID }));
            sock.write(block({ Event: 'UserEvent', UserEvent: 'CrmRate', Uuid: '1761650000.77', Rating: '7' })); // noto'g'ri — e'tiborsiz
            sock.write(block({ Event: 'UserEvent', UserEvent: 'CrmRate', Uuid: '1761650000.77', Rating: '3' }));
          } else if (m.Action === 'Originate') {
            sock.write(block({ Response: 'Success', ActionID: m.ActionID, Message: 'Originate successfully queued' }));
            sock.write(block({ Event: 'OriginateResponse', ActionID: m.ActionID, Response: m.Exten.endsWith('3') ? 'Failure' : 'Success', Reason: m.Exten.endsWith('3') ? '3' : '4', Uniqueid: m.ChannelId }));
          } else if (m.ActionID) sock.write(block({ Response: 'Success', ActionID: m.ActionID }));
        }
      });
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const keep = { ...process.env };
    Object.assign(process.env, { ASTERISK_AMI_HOST: '127.0.0.1', ASTERISK_AMI_PORT: String(srv.address().port), ASTERISK_AMI_USER: 'crm', ASTERISK_AMI_SECRET: 's' });
    const p = new OwnPbxProvider();
    const rates = []; const origs = []; const calls = [];
    p.onRate((r) => rates.push(r)); p.onOriginate((r) => origs.push(r)); p.onCall((b) => calls.push(b));
    try {
      const r1 = await p.informerCall('+998 90 111 22 34', 'aud1x', 40, 'preset-uuid-1');
      assert.equal(r1.ok, true, r1.comment);
      assert.equal(r1.uuid, 'preset-uuid-1');
      const o = seen.find((m) => m.Action === 'Originate');
      assert.equal(o.Channel, 'Local/998901112234@crm-informer-out/n');
      assert.equal(o.Context, 'crm-informer-play');
      assert.equal(o.Exten, '998901112234');
      assert.equal(o.ChannelId, 'preset-uuid-1');
      assert.equal(o.Variable, '__CRM_UUID=preset-uuid-1,CRM_AUDIO=aud1x');
      await p.informerCall('998901112233', 'aud1x');
      await new Promise((r) => setTimeout(r, 200));
      assert.deepEqual(rates, [{ uuid: '1761650000.77', rating: 3 }]);
      assert.deepEqual(origs.map((x) => [x.answered, x.reason, x.kind]), [[true, '4', 'informer'], [false, '3', 'informer']]);
      assert.equal(calls.length, 1, 'javobsiz informer urinishi jurnalga «failed» bo`lib tushadi');
      assert.equal(calls[0].accountcode, 'outbound');
      // in'ektsiya: raqam/audio — faqat raqam/harf
      assert.equal((await p.informerCall('998901112233@evil', 'aud1x')).ok, false);
      assert.equal((await p.informerCall('998901112233', 'a,CRM_X=1')).ok, false);
      assert.equal((await p.informerCall('12345', 'aud1x')).ok, false, 'ichki raqamga informer yo`q');
    } finally {
      p.onModuleDestroy();
      for (const k of ['ASTERISK_AMI_HOST', 'ASTERISK_AMI_PORT', 'ASTERISK_AMI_USER', 'ASTERISK_AMI_SECRET']) { if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k]; }
      srv.close();
    }
  });

  test('CDR: sifat bahosi qismi (crm-rate) alohida qo`ng`iroq emas — e`tiborsiz (jonli sinovda «kiruvchi o`tkazib yuborilgan» bo`lib tushardi)', () => {
    assert.equal(cdrToCallBody({ Event: 'Cdr', UniqueID: '1793195431.3', Source: '998907770005', Destination: 's', DestinationContext: 'crm-rate', Disposition: 'ANSWERED', Duration: '5' }), null);
  });

  test('CDR: avtoinformator konteksti — chiquvchi', () => {
    const b = cdrToCallBody({ Event: 'Cdr', UniqueID: 'u-inf-1', UserField: 'crm:abcdef12 inf:1', Source: '0552233', Destination: '998901112234', DestinationContext: 'crm-informer-out', DestinationChannel: 'PJSIP/trunk-0552233-0001', Disposition: 'ANSWERED', Duration: '12', BillableSeconds: '9' });
    assert.equal(b.uuid, 'abcdef12');
    assert.equal(b.accountcode, 'outbound');
    assert.equal(b.dialog_duration, 9);
  });

  test('hisobot: o`rtacha baho, taqsimot, past baholar; guruh filtri tekshiruvi', async () => {
    const T = await admin();
    const day = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
    const tag = uniq('rt').replace(/[^a-z0-9-]/gi, '');
    const vals = [5, 4, 1, 2, 5];
    const sql = vals.map((r, i) => `('${tag}-${i}','99890700${String(i).padStart(4, '0')}','in','completed',60,50,${r},'${tag}-x${i}',(now() at time zone 'utc'))`).join(',');
    execFileSync('psql', [process.env.DATABASE_URL, '-qc', `INSERT INTO call_logs (id, phone, direction, status, "durationSec", "talkSec", rating, "externalId", "startedAt") VALUES ${sql}`]);
    const s = await ok('GET', `/crm/calls/stats?from=${day}&to=${day}`, undefined, T);
    assert.ok(s.quality.count >= 5);
    for (const k of ['1', '2', '4', '5']) assert.ok(s.quality.dist[k] >= 1);
    assert.ok(s.quality.low.some((x) => x.phone === '998907000002' && x.rating === 1));
    assert.ok(s.quality.low.every((x) => x.rating <= 2));
    assert.ok(s.quality.avg >= 1 && s.quality.avg <= 5);
    assert.equal((await req('GET', `/crm/calls/stats?from=${day}&to=${day}&group=${encodeURIComponent('1;x')}`, undefined, T)).status, 400);
    const g = await ok('GET', `/crm/calls/stats?from=${day}&to=${day}&group=yoq99`, undefined, T);
    assert.equal(g.quality.count, 0, 'mavjud bo`lmagan guruh — bo`sh');
    const r = await ok('GET', `/crm/calls/report?from=${day}&to=${day}&rating=1`, undefined, T);
    assert.ok(r.calls.some((c) => c.phone === '998907000002'));
  });
});

// ─────────────────────────── Avtoinformator ───────────────────────────
describe('Avtoinformator: sof funksiyalar', () => {
  test('raqam importi: 9 xonali → 998, takrorlar (+998/998/9 xona), CSV ism ustuni, chet el, noto`g`ri', () => {
    const text = '+998 90 123-45-67\n998901234567\n901234567;Ali\nIsm,Telefon\nVali,+998 (91) 765 43 21\n+7 912 345 67 89\n12345\n998 9\n';
    const r = parseNumbers(text, ['998']);
    assert.deepEqual(r.numbers, ['998901234567', '998917654321']);
    assert.equal(r.duplicates, 2);
    assert.equal(r.foreign, 1);
    assert.ok(r.invalid >= 1);
    assert.deepEqual(parseNumbers('901234567', ['998'], ['+998 90 123 45 67']).numbers, [], 'mavjud raqam takror');
    assert.deepEqual(parseNumbers('79123456789', []).numbers, ['79123456789'], 'oq ro`yxat bo`sh — hammasi');
  });
  test('ish oynasi (Toshkent): oddiy, tunni kesib o`tuvchi, butun sutka', () => {
    const at = (h, m = 0) => Date.UTC(2026, 9, 28, h - 5, m);
    assert.equal(inWindow(at(9), '09:00', '20:00'), true);
    assert.equal(inWindow(at(8, 59), '09:00', '20:00'), false);
    assert.equal(inWindow(at(20), '09:00', '20:00'), false);
    assert.equal(inWindow(at(23), '22:00', '02:00'), true);
    assert.equal(inWindow(at(1, 30) + 86_400_000, '22:00', '02:00'), true);
    assert.equal(inWindow(at(12), '22:00', '02:00'), false);
    assert.equal(inWindow(at(3), '00:00', '00:00'), true);
  });
  test('navbat: birinchi urinishlar oldin; qayta urinish oraliq o`tgach; urinishlar tugasa — yo`q; slot cheklovi', () => {
    const now = Date.UTC(2026, 9, 28, 8);
    const rows = [
      { id: 'a', phone: '1', state: 'pending', attempts: 1, lastAt: new Date(now - 31 * 60_000) },
      { id: 'b', phone: '2', state: 'pending', attempts: 0, lastAt: null },
      { id: 'c', phone: '3', state: 'pending', attempts: 1, lastAt: new Date(now - 10 * 60_000) },
      { id: 'd', phone: '4', state: 'pending', attempts: 3, lastAt: new Date(now - 99 * 60_000) },
      { id: 'e', phone: '5', state: 'answered', attempts: 1, lastAt: null },
    ];
    assert.deepEqual(pickTargets(rows, { retries: 2, retryMin: 30 }, now, 5).map((x) => x.id), ['b', 'a']);
    assert.deepEqual(pickTargets(rows, { retries: 2, retryMin: 30 }, now, 1).map((x) => x.id), ['b']);
    assert.deepEqual(pickTargets(rows, { retries: 2, retryMin: 30 }, now, 0), []);
    assert.equal(afterAttempt({ attempts: 1 }, 1, false, 'noanswer'), 'pending');
    assert.equal(afterAttempt({ attempts: 2 }, 1, false, 'noanswer'), 'noanswer');
    assert.equal(afterAttempt({ attempts: 1 }, 0, false, 'congestion'), 'failed');
    assert.equal(afterAttempt({ attempts: 1 }, 0, true, 'answered'), 'answered');
    assert.equal(reasonText('4'), 'answered');
    assert.equal(reasonText('5'), 'busy');
  });
  test('dialplan: crm-informer-out faqat chiquvchi qoida maskasi bo`yicha trunk; telefon/trunk kontekstlaridan kirish yo`q', () => {
    const e = generateAsterisk(MODS, { outgoing: OUT }).extensions;
    const inf = e.split('[crm-informer-out]')[1].split('\n[')[0];
    assert.ok(inf.includes('Set(CDR(userfield)=crm:${CRM_UUID} inf:1)'));
    assert.ok(inf.includes('GotoIf($[${REGEX("^998[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]" ${EXTEN})}]?r1)'));
    assert.ok(inf.includes(' same => n,Hangup(21)'));
    assert.ok(inf.includes('Set(CALLERID(num)=+998712000000)'));
    assert.ok(inf.includes('Dial(PJSIP/${EXTEN}@trunk-0552233,45)'));
    assert.ok(e.includes('[crm-informer-play]') && e.includes('Playback(custom/${FILTER(0-9A-Za-z,${CRM_AUDIO})})'));
    assert.equal((e.match(/crm-informer-out/g) || []).length, 1, 'boshqa kontekstdan Goto yo`q');
    assert.ok(!generateAsterisk(MODS, {}).extensions.includes('[crm-informer-out]'), 'qoida yo`q — kontekst yo`q');
  });
});

describe('Avtoinformator: API', () => {
  let T, audio, prevOut, prevCfg, blId;
  before(async () => {
    T = await admin();
    audio = await ok('POST', '/pbx/tts', { text: 'Hurmatli mijoz, to`lov muddati ertaga tugaydi', lang: 'uz', name: 'Informer' }, T);
    prevOut = await ok('GET', '/pbx/outgoing', undefined, T);
    prevCfg = await ok('GET', '/pbx/informer/settings', undefined, T);
    blId = (await ok('POST', '/pbx/blacklist', { number: '+998 93 000 11 22', note: 'informer test' }, T)).id;
  });
  after(async () => {
    await ok('PUT', '/pbx/outgoing', { rules: prevOut.rules }, T);
    await ok('PUT', '/pbx/informer/settings', prevCfg, T);
    await req('DELETE', `/pbx/blacklist/${blId}`, undefined, T);
  });

  test('sozlama: prefikslar (standart 998), bo`sh/uzun — rad', async () => {
    assert.deepEqual(prevCfg.prefixes.length > 0, true);
    assert.equal((await req('PUT', '/pbx/informer/settings', { prefixes: '' }, T)).status, 400);
    assert.equal((await req('PUT', '/pbx/informer/settings', { prefixes: '99812' }, T)).status, 400);
    assert.deepEqual((await ok('PUT', '/pbx/informer/settings', { prefixes: '998, +7' }, T)).prefixes, ['998', '7']);
    await ok('PUT', '/pbx/informer/settings', { prefixes: ['998'] }, T);
  });

  test('yaratish: validatsiya (audio, nom, maxParallel ≤10, retries ≤3, oraliq ≥30, vaqt)', async () => {
    const base = { name: 'Test', audioId: audio.id };
    for (const bad of [{ audioId: 'yoq1' }, { name: '' }, { maxParallel: 11 }, { retries: 4 }, { retryMin: 10 }, { windowFrom: '25:00' }, { dailyLimit: 0 }, { startAt: 'ertaga' }]) {
      const r = await req('POST', '/pbx/informer', { ...base, ...bad }, T);
      assert.equal(r.status, 400, JSON.stringify(bad));
    }
  });

  test('import: normallashtirish, takror, qora ro`yxat → dnd, chet el; holatlar: start/pauza/to`xtatish; ishlayotganini o`zgartirib/o`chirib bo`lmaydi', async () => {
    const c = await ok('POST', '/pbx/informer', { name: 'To`lov eslatmasi <b>', audioId: audio.id, numbers: '901112233\n+998 90 111 22 33\n998931234567\n+998 93 000 11 22\n+7 912 000 00 00', windowFrom: '00:00', windowTo: '00:00', maxParallel: 3, retries: 2 }, T);
    const id = c.campaign.id;
    assert.equal(c.campaign.name, 'To`lov eslatmasi b');
    assert.equal(c.campaign.status, 'draft');
    assert.deepEqual({ added: c.import.added, dnd: c.import.dnd, dup: c.import.duplicates, foreign: c.import.foreign }, { added: 3, dnd: 1, dup: 1, foreign: 1 });
    assert.deepEqual({ total: c.campaign.counts.total, pending: c.campaign.counts.pending, dnd: c.campaign.counts.dnd }, { total: 3, pending: 2, dnd: 1 });
    const more = await ok('POST', `/pbx/informer/${id}/numbers`, { text: '998931234567\n998941112233' }, T);
    assert.deepEqual([more.added, more.duplicates, more.total], [1, 1, 4]);
    // chiquvchi qoida yo'q — start rad etiladi
    await ok('PUT', '/pbx/outgoing', { rules: [] }, T);
    const noRoute = await req('POST', `/pbx/informer/${id}/start`, undefined, T);
    assert.equal(noRoute.status, 400);
    assert.equal(noRoute.data.error, 'NO_ROUTE');
    await ok('PUT', '/pbx/outgoing', { rules: [{ name: 'Hammasi', mask: '', trunk: '0552233', users: [] }] }, T);
    const st = await ok('POST', `/pbx/informer/${id}/start`, undefined, T);
    assert.equal(st.campaign.status, 'running');
    assert.equal(st.pbxReady, false, 'sinov muhitida AMI yo`q');
    assert.equal((await req('PUT', `/pbx/informer/${id}`, { name: 'x' }, T)).status, 409);
    assert.equal((await req('DELETE', `/pbx/informer/${id}`, undefined, T)).status, 409);
    const del = await req('DELETE', `/pbx/audio/${audio.id}`, undefined, T);
    assert.equal(del.status, 409, 'kampaniyadagi audio o`chmaydi');
    assert.equal((await ok('POST', `/pbx/informer/${id}/pause`, undefined, T)).campaign.status, 'paused');
    assert.equal((await req('POST', `/pbx/informer/${id}/pause`, undefined, T)).status, 409);
    assert.equal((await req('POST', `/pbx/informer/${id}/boom`, undefined, T)).status, 400);
    await ok('PUT', `/pbx/informer/${id}`, { maxParallel: 5, windowFrom: '10:00' }, T);
    const g = await ok('GET', `/pbx/informer/${id}?state=dnd`, undefined, T);
    assert.equal(g.campaign.maxParallel, 5);
    assert.deepEqual(g.targets.map((t) => t.phone), ['998930001122']);
    assert.equal((await ok('POST', `/pbx/informer/${id}/stop`, undefined, T)).campaign.status, 'done');
    assert.equal((await req('POST', `/pbx/informer/${id}/start`, undefined, T)).status, 409);
    assert.equal((await req('POST', `/pbx/informer/${id}/numbers`, { text: '998901234560' }, T)).status, 409);
    const list = await ok('GET', '/pbx/informer', undefined, T);
    assert.ok(list.campaigns.some((x) => x.id === id && x.counts.total === 4));
    await ok('DELETE', `/pbx/informer/${id}`, undefined, T);
    assert.equal((await req('GET', `/pbx/informer/${id}`, undefined, T)).status, 404);
  });

  test('chegara: kampaniyada 5000 tadan ortiq raqam bo`lmaydi; raqamsiz kampaniya boshlanmaydi', async () => {
    const c = await ok('POST', '/pbx/informer', { name: 'Katta', audioId: audio.id }, T);
    assert.equal((await req('POST', `/pbx/informer/${c.campaign.id}/start`, undefined, T)).data.error, 'NO_NUMBERS');
    const nums = Array.from({ length: 5003 }, (_, i) => `99890${String(1000000 + i)}`).join('\n');
    const r = await ok('POST', `/pbx/informer/${c.campaign.id}/numbers`, { text: nums }, T);
    assert.equal(r.added, 5000);
    assert.equal(r.overLimit, 3);
    await ok('DELETE', `/pbx/informer/${c.campaign.id}`, undefined, T);
  });

  test('ovoz sintezi: sutkalik limit (PBX_TTS_DAILY) — oshsa 429', async () => {
    let last;
    for (let i = 0; i < 40; i++) { last = await req('POST', '/pbx/tts', { text: `Limit ${i}`, lang: 'ru' }, T); if (last.status !== 201 && last.status !== 200) break; }
    assert.equal(last.status, 429);
    assert.equal(last.data.error, 'DAILY_LIMIT');
  });
});
