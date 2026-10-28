// Jonli sinov 11 (tayyorlov): sifat bahosi — so'rov va rahmat audiolari (espeak TTS), sozlama, «Stansiyaga qo'llash». Argument: in | all
process.env.E2E_BASE ||= 'http://localhost:8031/api/v1';
process.env.E2E_EMAIL ||= 'live-admin@test.local';
process.env.E2E_PASSWORD ||= 'live-Passw0rd!2026';
const { ok, admin } = await import('../../backend/test/e2e/lib.mjs');
const T = await admin();
const files = (await ok('GET', '/pbx/audio', undefined, T)).files;
const get = async (name, text) => files.find((f) => f.name === name) || ok('POST', '/pbx/tts', { text, lang: 'uz', name }, T);
const p = await get('Baho: so`rov', "Xizmat sifatini birdan beshgacha baholang. Besh, a'lo. Bir, juda yomon.");
const th = await get('Baho: rahmat', 'Rahmat! Bahoingiz qabul qilindi.');
console.log('quality:', JSON.stringify(await ok('PUT', '/pbx/quality', { enabled: true, promptAudioId: p.id, thanksAudioId: th.id, scope: process.argv[2] === 'all' ? 'all' : 'in' }, T)));
console.log('apply:', JSON.stringify(await ok('POST', '/pbx/asterisk/apply', {}, T)));
