// Asterisk AMI mijozi va «o'z stansiya» provayderi: soxta AMI server bilan (haqiqiy Asterisk talab qilinmaydi).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { AmiClient, parseAmiBlock } from '../../dist/onlinepbx/asterisk-ami.js';
import { OwnPbxProvider, cdrToCallBody } from '../../dist/onlinepbx/own-pbx.provider.js';

let server, port;
const seen = [];
const block = (o) => Object.entries(o).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n';
before(async () => {
  server = net.createServer((sock) => {
    sock.write('Asterisk Call Manager/9.0.0\r\n');
    let buf = '';
    sock.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\r\n\r\n')) >= 0) {
        const m = parseAmiBlock(buf.slice(0, i));
        buf = buf.slice(i + 4);
        seen.push(m);
        if (m.Action === 'Login') {
          if (m.Secret === 'togri') { sock.write(block({ Response: 'Success', ActionID: m.ActionID, Message: 'Authentication accepted' })); sock.write(block({ Event: 'FullyBooted', Status: 'Fully Booted' })); }
          else { sock.write(block({ Response: 'Error', ActionID: m.ActionID, Message: 'Authentication failed' })); }
        } else if (m.Action === 'Ping') sock.write(block({ Response: 'Success', ActionID: m.ActionID, Ping: 'Pong' }));
        else if (m.Action === 'Originate') {
          if (m.Channel === 'PJSIP/999') sock.write(block({ Response: 'Error', ActionID: m.ActionID, Message: 'Channel not found' }));
          else {
            sock.write(block({ Response: 'Success', ActionID: m.ActionID, Message: 'Originate successfully queued' }));
            // qo'ng'iroq tugagach CDR hodisasi (tashqi → ichki)
            sock.write(block({ Event: 'Cdr', UniqueID: 'u-1700000000.1', Source: '998901234567', Destination: '100', DestinationContext: 'm100', Duration: '25', BillableSeconds: '18', Disposition: 'ANSWERED' }));
          }
        }
      }
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
after(() => server.close());

describe('AMI mijozi', () => {
  test('parseAmiBlock: kalit-qiymat bloki', () => {
    assert.deepEqual(parseAmiBlock('Event: Cdr\r\nSource: 100\r\nMessage: a: b'), { Event: 'Cdr', Source: '100', Message: 'a: b' });
  });

  test('login muvaffaqiyatli; noto`g`ri parol rad etiladi; action javobi ActionID bo`yicha', async () => {
    const bad = new AmiClient({ host: '127.0.0.1', port, user: 'crm', secret: 'xato' });
    bad.on('error', () => undefined);
    await assert.rejects(() => bad.connect(), /Authentication failed/);
    const c = new AmiClient({ host: '127.0.0.1', port, user: 'crm', secret: 'togri' });
    await c.connect();
    assert.equal(c.isReady(), true);
    const pong = await c.action('Ping');
    assert.equal(pong.Ping, 'Pong');
    await assert.rejects(() => c.action('Originate', { Channel: 'PJSIP/999' }), /Channel not found/);
    c.close();
  });

  test('ulanib bo`lmaydigan manzil — aniq xato', async () => {
    const c = new AmiClient({ host: '127.0.0.1', port: 1, user: 'x', secret: 'y', timeoutMs: 1500 });
    c.on('error', () => undefined);
    await assert.rejects(() => c.connect());
  });
});

describe('O`z stansiya provayderi', () => {
  test('cdrToCallBody: yo`nalish, davomiylik, holat va yozuv havolasi', () => {
    const inb = cdrToCallBody({ UniqueID: 'u1', Source: '998901234567', Destination: '100', Duration: '25', BillableSeconds: '18', Disposition: 'ANSWERED' });
    assert.equal(inb.accountcode, 'inbound');
    assert.equal(inb.dialog_duration, 18);
    assert.equal(inb.call_duration, 25);
    assert.equal(inb.download_url, 'own:u1');
    const out = cdrToCallBody({ UniqueID: 'u2', Source: '100', Destination: '998909998877', Disposition: 'NO ANSWER' });
    assert.equal(out.accountcode, 'outbound');
    assert.equal(out.hangup_cause, 'no_answer');
    assert.equal(cdrToCallBody({ UniqueID: 'u3', Source: '100', Destination: '101', Disposition: 'BUSY' }).accountcode, 'local');
    assert.equal(cdrToCallBody({ Source: '1' }), null);
  });

  test('sozlanmagan bo`lsa o`chiq; sozlansa call() Originate yuboradi va CDR hodisasini tinglovchiga beradi', async () => {
    delete process.env.ASTERISK_AMI_HOST;
    const off = new OwnPbxProvider();
    assert.equal(await off.enabled(), false);
    assert.equal((await off.call('100', '998901234567')).ok, false);

    Object.assign(process.env, { ASTERISK_AMI_HOST: '127.0.0.1', ASTERISK_AMI_PORT: String(port), ASTERISK_AMI_USER: 'crm', ASTERISK_AMI_SECRET: 'togri' });
    const p = new OwnPbxProvider();
    assert.equal(await p.enabled(), true);
    const got = new Promise((res) => p.onCall(res));
    const r = await p.call('100', '998901234567');
    assert.equal(r.ok, true, r.comment);
    assert.ok(r.uuid);
    const o = seen.filter((m) => m.Action === 'Originate').pop();
    assert.equal(o.Channel, 'PJSIP/100');
    assert.equal(o.Exten, '998901234567');
    assert.equal(o.Context, 'from-internal');
    assert.match(o.Variable, /^CRM_UUID=/);
    const body = await Promise.race([got, new Promise((_, rej) => setTimeout(() => rej(new Error('CDR hodisasi kelmadi')), 3000))]);
    assert.equal(body.uuid, 'u-1700000000.1');
    assert.equal(body.accountcode, 'inbound');
    assert.equal((await p.call('999', '1')).ok, false, 'AMI xatosi ok:false bo`lishi kerak');
    assert.equal((await p.testConnection()).ok, true);
    p.onModuleDestroy();
    delete process.env.ASTERISK_AMI_HOST; delete process.env.ASTERISK_AMI_SECRET;
  });

  test('yozuv fayli: faqat ruxsat etilgan papka va xavfsiz nom (yo`l o`tish rad etiladi)', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'rec-'));
    writeFileSync(join(dir, 'abc12345.wav'), Buffer.alloc(200, 1));
    process.env.ASTERISK_RECORDINGS_DIR = dir;
    const p = new OwnPbxProvider();
    const r = await p.fetchRecording('own:abc12345');
    assert.equal(r.contentType, 'audio/wav');
    assert.equal(r.buffer.length, 200);
    assert.equal(await p.fetchRecording('own:../../etc/passwd'), null);
    assert.equal(await p.fetchRecording('own:yoq-fayl-123'), null);
    delete process.env.ASTERISK_RECORDINGS_DIR;
  });
});
