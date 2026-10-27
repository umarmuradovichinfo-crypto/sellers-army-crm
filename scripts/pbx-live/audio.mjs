// Jonli sinov 7: audio kutubxona → salomlashish (IVR) → «Stansiyaga qo'llash» (ffmpeg → 8 kHz wav) → Asterisk'da fayl bor va o'ynaladi.
process.env.E2E_BASE ||= 'http://localhost:8031/api/v1';
process.env.E2E_EMAIL ||= 'live-admin@test.local';
process.env.E2E_PASSWORD ||= 'live-Passw0rd!2026';
const { ok, admin } = await import('../../backend/test/e2e/lib.mjs');
const { execSync } = await import('node:child_process');
const T = await admin();
// 44.1 kHz stereo mp3 (Asterisk to'g'ridan-to'g'ri o'ynata olmaydigan format) — ffmpeg bilan yasaymiz
execSync('ffmpeg -y -v error -f lavfi -i "sine=frequency=330:duration=2" -ar 44100 -ac 2 /tmp/live-greet.mp3');
const { readFileSync } = await import('node:fs');
const a = await ok('POST', '/pbx/audio', { name: 'Salom', mime: 'audio/mpeg', data: readFileSync('/tmp/live-greet.mp3').toString('base64') }, T);
await ok('POST', '/pbx/modules', { type: 'greeting', number: '5000', name: 'IVR', config: { audioId: a.id, menu: [{ key: '1', to: '100' }], allowExt: true, delaySec: 5, forwardTo: '100' } }, T);
console.log('apply:', JSON.stringify(await ok('POST', '/pbx/asterisk/apply', {}, T)));
await new Promise((r) => setTimeout(r, 2500));
console.log(execSync(`docker exec crm-ast-live sh -c "ls -la /var/lib/asterisk/sounds/custom/; asterisk -rx 'file convert /var/lib/asterisk/sounds/custom/${a.id}.wav /tmp/x.gsm' 2>&1 | tail -2; asterisk -rx 'dialplan show m5000' | head -12"`, { encoding: 'utf8' }));
