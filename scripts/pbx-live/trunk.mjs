// Jonli sinov 4: trunk (soxta provayderga ro'yxatdan o'tish) + kiruvchi marshrut (guruh 10) + chiquvchi qoida → «Stansiyaga qo'llash».
process.env.E2E_BASE ||= 'http://localhost:8031/api/v1';
process.env.E2E_EMAIL ||= 'live-admin@test.local';
process.env.E2E_PASSWORD ||= 'live-Passw0rd!2026';
const { ok, req, admin } = await import('../../backend/test/e2e/lib.mjs');
const { execSync } = await import('node:child_process');
const prov = process.argv[2] || execSync("docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' crm-ast-prov", { encoding: 'utf8' }).trim();
const T = await admin();
const mods = (await ok('GET', '/pbx/modules?type=trunk', undefined, T)).modules || [];
let tr = mods.find((m) => m.number === '0552233');
const config = { server: prov, login: '0552233', password: 'trunkpass', forwardTo: '10' };
if (!tr) tr = (await ok('POST', '/pbx/modules', { type: 'trunk', number: '0552233', name: 'Provayder', config }, T)).module;
else await ok('PUT', `/pbx/modules/${tr.id}`, { config }, T);
await ok('PUT', '/pbx/outgoing', { rules: [{ name: 'Hammasi', mask: '', trunk: '0552233', externalNumber: '', users: [] }] }, T);
const v = await ok('GET', '/pbx/flow/validate', undefined, T);
console.log('validate:', JSON.stringify(v).slice(0, 300));
const r = await ok('POST', '/pbx/asterisk/apply', {}, T);
console.log('apply:', JSON.stringify(r));
