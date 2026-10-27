// Asterisk AMI mijozi va «o'z stansiya» provayderi: soxta AMI server bilan (haqiqiy Asterisk talab qilinmaydi).
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { AmiClient, parseAmiBlock } from '../../dist/onlinepbx/asterisk-ami.js';
import { OwnPbxProvider, cdrToCallBody, ringToCallBody, mergeCdrBodies, cdrTime } from '../../dist/onlinepbx/own-pbx.provider.js';

process.env.ASTERISK_CDR_MERGE_MS = '150';

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
        } else if (m.Action === 'Ping') { if (!sock.noPong) sock.write(block({ Response: 'Success', ActionID: m.ActionID, Ping: 'Pong' })); }
        else if (m.Action === 'Command') sock.write(`Response: Follows\r\nActionID: ${m.ActionID}\r\nPrivilege: Command\r\nOutput: birinchi qator\r\nOutput: ikkinchi qator\r\n--END COMMAND--\r\n\r\n`);
        else if (m.Action === 'Hang') sock.noPong = true;
        else if (m.Action === 'Originate') {
          if (m.Channel === 'PJSIP/999') sock.write(block({ Response: 'Error', ActionID: m.ActionID, Message: 'Channel not found' }));
          else if (m.Channel === 'PJSIP/555') {
            // xodim telefoni javob bermadi: navbatga qo'yildi, keyin OriginateResponse Failure (hodisada ham Response: bor)
            sock.write(block({ Response: 'Success', ActionID: m.ActionID, Message: 'Originate successfully queued' }));
            sock.write(block({ Event: 'OriginateResponse', ActionID: m.ActionID, Response: 'Failure', Channel: 'PJSIP/555', Reason: '3', Uniqueid: '<null>' }));
          } else if (m.Channel === 'PJSIP/556') {
            // CRM_UUID bilan bog'langan ikki CDR (IVR + operator) — bittaga birlashadi
            sock.write(block({ Response: 'Success', ActionID: m.ActionID, Message: 'Originate successfully queued' }));
            const uuid = m.Variable.replace('CRM_UUID=', '');
            sock.write(block({ Event: 'Cdr', UniqueID: m.ChannelId, UserField: `crm:${uuid}`, Source: '556', Destination: '998901112233', DestinationContext: 'crm-outbound', DestinationChannel: 'PJSIP/trunk-1-00000001', Duration: '40', BillableSeconds: '30', Disposition: 'ANSWERED', StartTime: '2026-10-27 12:00:00' }));
          }
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
  test('parseAmiBlock: kalit-qiymat bloki; takroriy Output birlashtiriladi; Follows ichidagi matn', () => {
    assert.deepEqual(parseAmiBlock('Event: Cdr\r\nSource: 100\r\nMessage: a: b'), { Event: 'Cdr', Source: '100', Message: 'a: b' });
    assert.equal(parseAmiBlock('Response: Success\r\nOutput: a\r\nOutput: b').Output, 'a\nb');
    assert.equal(parseAmiBlock('Response: Follows\r\nPrivilege: Command\r\nName  Host  Status\r\n--END COMMAND--').Output, 'Name  Host  Status');
  });

  test('«Response: Follows» xato emas; Ping javob bermasa ulanish yopiladi (keepalive)', async () => {
    const c = new AmiClient({ host: '127.0.0.1', port, user: 'crm', secret: 'togri', timeoutMs: 400, pingMs: 150 });
    c.on('error', () => undefined);
    await c.connect();
    const r = await c.action('Command', { Command: 'core show version' });
    assert.equal(r.Output, 'birinchi qator\nikkinchi qator');
    const closed = new Promise((res) => c.once('close', res));
    c.action('Hang').catch(() => undefined); // server Ping'ga javob bermay qo'yadi
    await Promise.race([closed, new Promise((_, rej) => setTimeout(() => rej(new Error('javobsiz ulanish yopilmadi')), 3000))]);
    assert.equal(c.isReady(), false);
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
    const inb = cdrToCallBody({ UniqueID: 'u1', Source: '998901234567', Destination: '100', DestinationChannel: 'PJSIP/100-0000000a', Duration: '25', BillableSeconds: '18', Disposition: 'ANSWERED' });
    assert.equal(inb.accountcode, 'inbound');
    assert.equal(inb.dialog_duration, 18);
    assert.equal(inb.call_duration, 25);
    assert.equal(inb.download_url, undefined, 'yozuv fayli topilmagan bo`lsa havola bo`lmasligi kerak');
    assert.equal(cdrToCallBody({ UniqueID: 'u1', Source: '1', Disposition: 'ANSWERED' }, { recording: true }).download_url, 'own:u1');
    // IVR/ovozli pochta o'zi javob bergan (operator kanali yo'q) — gaplashilmagan (missed)
    const ivr = cdrToCallBody({ UniqueID: 'u5', Source: '998901234567', Destination: 's', Duration: '30', BillableSeconds: '28', Disposition: 'ANSWERED' });
    assert.equal(ivr.dialog_duration, 0);
    assert.equal(ivr.hangup_cause, 'no_answer');
    // CRM_UUID (userfield) bo'lsa — shu uuid; IVR 's' o'rniga javob bergan xodim raqami
    const lnk = cdrToCallBody({ UniqueID: '1700.5', UserField: 'crm:abc-123-def', Source: '998901234567', Destination: 's', DestinationChannel: 'PJSIP/101-00000001', Disposition: 'ANSWERED', BillableSeconds: '5', StartTime: '2026-10-27 12:00:00' });
    assert.equal(lnk.uuid, 'abc-123-def');
    assert.equal(lnk.callee, '101');
    assert.equal(lnk.start_time, '2026-10-27T07:00:00.000Z', 'CDR vaqti Toshkent (UTC+5) deb o`qilishi kerak');
    assert.equal(cdrTime('yomon'), null);
    const out = cdrToCallBody({ UniqueID: 'u2', Source: '100', Destination: '998909998877', Disposition: 'NO ANSWER' });
    assert.equal(out.accountcode, 'outbound');
    assert.equal(out.hangup_cause, 'no_answer');
    assert.equal(cdrToCallBody({ UniqueID: 'u3', Source: '100', Destination: '101', Disposition: 'BUSY' }).accountcode, 'local');
    assert.equal(cdrToCallBody({ Source: '1' }), null);
  });

  test('mergeCdrBodies: IVR (javobsiz) + operator javobi → bitta «gaplashildi»; ikkalasi javobsiz → javobsiz', () => {
    const ivr = cdrToCallBody({ UniqueID: 'm1', Source: '998901234567', Destination: 's', Duration: '20', BillableSeconds: '20', Disposition: 'ANSWERED' });
    const op = cdrToCallBody({ UniqueID: 'm1', Source: '998901234567', Destination: 's', DestinationChannel: 'PJSIP/100-00000002', Duration: '15', BillableSeconds: '9', Disposition: 'ANSWERED' });
    for (const m of [mergeCdrBodies(ivr, op), mergeCdrBodies(op, ivr)]) {
      assert.equal(m.dialog_duration, 9);
      assert.equal(m.hangup_cause, 'normal_clearing');
      assert.equal(m.callee, '100');
      assert.equal(m.call_duration, 20);
    }
    const na = cdrToCallBody({ UniqueID: 'm1', Source: '998901234567', Destination: 's', DestinationChannel: 'PJSIP/100-00000003', Duration: '15', Disposition: 'NO ANSWER' });
    assert.equal(mergeCdrBodies(ivr, na).dialog_duration, 0);
    assert.equal(mergeCdrBodies(ivr, na).hangup_cause, 'no_answer');
  });

  test('ringToCallBody: jiringlash hodisasi (tugamagan) — kiruvchi/ichki yo`nalish', () => {
    const r = ringToCallBody({ Event: 'UserEvent', UserEvent: 'CrmRing', Caller: '998901234567', Called: '100', Uuid: 'u9' });
    assert.equal(r.accountcode, 'inbound');
    assert.equal(r.event, 'call_start');
    assert.equal(r.uuid, 'u9');
    assert.equal(ringToCallBody({ Event: 'UserEvent', UserEvent: 'CrmRing', Caller: '101', Called: '100', Uuid: 'u8' }).accountcode, 'local');
    assert.equal(ringToCallBody({ Event: 'Cdr', UniqueID: 'x' }), null);
    assert.equal(ringToCallBody({ Event: 'UserEvent', UserEvent: 'Boshqa', Caller: '1' }), null);
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
    assert.equal((await p.call('999', '998901234567')).ok, false, 'AMI xatosi ok:false bo`lishi kerak');
    // toll-fraud / in'ektsiya: from faqat 2–5 xonali, to faqat raqam — AMI'ga yuborilmaydi
    const before = seen.filter((m) => m.Action === 'Originate').length;
    for (const [f, t] of [['100@trunk', '998901234567'], ['+88213000000', '998901234567'], ['100', '998901234567@trunk-x'], ['100', 'abc'], ['100', '1;Dial']]) {
      assert.equal((await p.call(f, t)).ok, false, `${f} → ${t}`);
    }
    assert.equal(seen.filter((m) => m.Action === 'Originate').length, before, 'noto`g`ri raqamlar AMI`ga yuborildi');
    // + va bo'shliqlar olib tashlanadi; ChannelId = CRM uuid
    const r2 = await p.call('100', '+998 90 123-45-67');
    const o2 = seen.filter((m) => m.Action === 'Originate').pop();
    assert.equal(o2.Exten, '998901234567');
    assert.equal(o2.ChannelId, r2.uuid);
    assert.equal(o2.ActionID, `crm-${r2.uuid}`);
    // OriginateResponse Failure → shu uuid «call_rejected» bilan yakunlanadi
    const failed = new Promise((res) => p.onCall((b) => { if (b.hangup_cause === 'call_rejected') res(b); }));
    const r3 = await p.call('555', '998901234567');
    assert.equal(r3.ok, true);
    const fb = await Promise.race([failed, new Promise((_, rej) => setTimeout(() => rej(new Error('OriginateResponse qayta ishlanmadi')), 3000))]);
    assert.equal(fb.uuid, r3.uuid);
    // CDR CRM_UUID bilan → CallLog uuid'i bilan bir xil
    const linked = new Promise((res) => p.onCall((b) => { if (b.accountcode === 'outbound' && b.dialog_duration === 30) res(b); }));
    const r4 = await p.call('556', '998901112233');
    const lb = await Promise.race([linked, new Promise((_, rej) => setTimeout(() => rej(new Error('CDR kelmadi')), 3000))]);
    assert.equal(lb.uuid, r4.uuid);
    assert.equal(lb.start_time, '2026-10-27T07:00:00.000Z');
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
