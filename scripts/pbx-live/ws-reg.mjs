// Jonli sinov 8: brauzer telefoni (JsSIP) ro'yxatdan o'tishi — ws://127.0.0.1:8088/ws, «<ext>-web» endpoint (WebRTC), haqiqiy Asterisk.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
const require = createRequire('/Users/umarmuradovich/CRM/frontend/package.json');
const JsSIP = require('jssip');
const conf = readFileSync(`${homedir()}/.crm-live/etc/pjsip_crm.conf`, 'utf8');
const ext = process.argv[2] || '100';
const pw = new RegExp(`\\[${ext}-web\\]\\ntype=auth[\\s\\S]*?password=(\\S+)`).exec(conf)?.[1];
if (!pw) { console.log('parol topilmadi'); process.exit(1); }
const socket = new JsSIP.WebSocketInterface('ws://127.0.0.1:8088/ws');
const ua = new JsSIP.UA({ sockets: [socket], uri: `sip:${ext}-web@127.0.0.1`, password: pw, register: true });
const done = (m, code) => { console.log(m); ua.stop(); setTimeout(() => process.exit(code), 300); };
ua.on('registered', () => done(`REGISTERED ${ext}-web (ws)`, 0));
ua.on('registrationFailed', (e) => done('registrationFailed: ' + (e.cause || '') + ' ' + (e.response?.status_code || ''), 1));
ua.start();
setTimeout(() => done('timeout', 2), 8000);
