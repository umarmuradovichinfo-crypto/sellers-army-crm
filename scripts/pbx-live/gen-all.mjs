// Jonli sinov 6: barcha modul turlari bilan to'liq konfiguratsiya generatsiyasi → haqiqiy Asterisk yuklay oladimi (xatolarsiz).
import { generateAsterisk } from '../../backend/dist/pbx/asterisk.generator.js';
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
const mod = (type, number, config = {}, name = null, enabled = true) => ({ type, number, name, enabled, config });
const MODS = [
  mod('user', '100', {}, 'Ali'), mod('user', '101', { forward: [{ afterSec: 20, to: '5120' }] }, 'Vali'), mod('user', '102', { webrtc: false }, 'Stol'),
  mod('group', '10', { members: ['100', '101'], afterSec: 20, forwardTo: '5200' }, 'Savdo'),
  mod('queue', '5200', { members: [{ ext: '100', priority: 1 }, { ext: '102', priority: 2 }], strategy: 'count', ringSec: 15, queueSec: 120, forwardTo: '5120' }),
  mod('voicemail', '5120', { recordSec: 20, forwardTo: '' }),
  mod('timerule', '5100', { timezone: 'UTC+5', holidays: ['2026-01-01'], days: { mon: { on: true, from: '09:00', to: '18:00' }, tue: { on: true, from: '09:00', to: '18:00' }, sun: { on: false, from: '09:00', to: '18:00' } }, workTo: '5000', offTo: '5120' }),
  mod('greeting', '5000', { menu: [{ key: '1', to: '10' }, { key: '2', to: '5200' }], allowExt: true, delaySec: 6, forwardTo: '5120' }),
  mod('http', '5300', { url: 'https://example.com/hook?token=abc', forwardTo: '10' }),
  mod('alias', '5400', { target: '100' }),
  mod('trunk', '0552233', { login: '0552233', server: '172.17.0.3', password: 'trunkpass', forwardTo: '5100' }),
];
const r = generateAsterisk(MODS, { blacklist: ['+998900000000'], outgoing: { rules: [{ mask: '998', trunk: '0552233', users: ['100', '101'] }, { mask: '', trunk: '0552233', users: [] }] }, sipSecrets: { 100: 'secret100aaaaaaaaaaaa', 101: 'secret101aaaaaaaaaaaa', 102: 'secret102aaaaaaaaaaaa' }, recordingDir: '/var/spool/asterisk/monitor' });
const d = `${homedir()}/.crm-live/etc/`;
writeFileSync(d + 'pjsip_crm.conf', r.pjsip); writeFileSync(d + 'extensions_crm.conf', r.extensions); writeFileSync(d + 'queues_crm.conf', r.queues);
const sh = (c) => execSync(`docker exec crm-ast-live asterisk -rx "${c}" 2>&1`, { encoding: 'utf8' });
await new Promise((r) => setTimeout(r, 2500)); // host → VM fayl sinxroni
for (const c of ['module reload res_pjsip.so', 'dialplan reload', 'queue reload all']) console.log(c, '→', sh(c).trim().split('\n')[0]);
const since = execSync('docker logs --since 6s crm-ast-live 2>&1', { encoding: 'utf8' }).replace(/\x1b\[[0-9;]*m/g, '').split('\n').filter((l) => /WARNING|ERROR/.test(l) && /crm|pjsip|pbx_config|queue|extensions/i.test(l));
console.log(since.length ? 'XATOLAR:\n' + since.join('\n') : 'yuklash xatolarsiz');
for (const c of ['dialplan show m5100', 'dialplan show m5000', 'queue show 5200']) console.log(sh(c).split('\n').slice(0, 12).join('\n'));
