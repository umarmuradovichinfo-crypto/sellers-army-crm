// Jonli sinov 10: ovoz sintezi (espeak-ng, sinov konteynerida) → audio kutubxona → «Stansiyaga qo'llash» → Asterisk faylni o'qiy oladi.
// Backend ESPEAK_BIN bilan ishga tushirilgan bo'lsin:  ESPEAK_BIN=$PWD/scripts/pbx-live/espeak-docker.sh scripts/pbx-live/backend.sh
process.env.E2E_BASE ||= 'http://localhost:8031/api/v1';
process.env.E2E_EMAIL ||= 'live-admin@test.local';
process.env.E2E_PASSWORD ||= 'live-Passw0rd!2026';
const { ok, req, admin } = await import('../../backend/test/e2e/lib.mjs');
const { execSync } = await import('node:child_process');
const T = await admin();
const v = await ok('PUT', '/pbx/tts/settings', { provider: 'espeak' }, T);
console.log('provayder:', v.provider, '| ovozlar:', v.voices.map((x) => x.id).join(', '));
const out = {};
for (const [lang, text, voice] of [['uz', "Assalomu alaykum! Xizmat sifatini birdan beshgacha baholang.", 'uz+f3'], ['ru', 'Здравствуйте! Оцените качество обслуживания от одного до пяти.', 'ru'], ['en', 'Thank you for calling.', 'en-us']]) {
  const a = await ok('POST', '/pbx/tts', { text, lang, voice, name: `TTS ${lang}` }, T);
  const f = await fetch(`${process.env.E2E_BASE}/pbx/audio/${a.id}/file`, { headers: { Authorization: `Bearer ${T}` } });
  const b = Buffer.from(await f.arrayBuffer());
  out[lang] = a.id;
  console.log(`${lang}: id=${a.id} provider=${a.provider} voice=${a.voice} size=${a.size} rate=${b.readUInt32LE(24)}Hz ch=${b.readUInt16LE(22)} bits=${b.readUInt16LE(34)} sec≈${((b.length - 44) / 16000).toFixed(1)}`);
}
const bad = await req('POST', '/pbx/tts', { text: '<speak><audio src="http://x"/></speak>', lang: 'uz' }, T);
console.log('faqat teg (bo`sh matn):', bad.status);
console.log('apply:', JSON.stringify(await ok('POST', '/pbx/asterisk/apply', {}, T)));
for (const [lang, id] of Object.entries(out)) console.log(lang, execSync(`docker exec crm-ast-live sh -c "ls -la /var/lib/asterisk/sounds/custom/${id}.wav | awk '{print \\$5}'; asterisk -rx 'file convert /var/lib/asterisk/sounds/custom/${id}.wav /tmp/${id}.gsm' | tail -1"`, { encoding: 'utf8' }).replace(/\n/g, ' '));
