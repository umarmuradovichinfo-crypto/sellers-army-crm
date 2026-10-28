// Jonli sinov 3: CRM qo'ng'iroqlar jurnalida nima paydo bo'lganini ko'rsatadi.
process.env.E2E_BASE ||= 'http://localhost:8031/api/v1';
process.env.E2E_EMAIL ||= 'live-admin@test.local';
process.env.E2E_PASSWORD ||= 'live-Passw0rd!2026';
const { ok, admin } = await import('../../backend/test/e2e/lib.mjs');
const T = await admin();
const r = await ok('GET', '/crm/calls?limit=10', undefined, T);
for (const c of r.calls || r.items || []) console.log(JSON.stringify({ dir: c.direction, from: c.caller, to: c.callee, status: c.status, hangup: c.hangup, talk: c.talkSec, started: c.startedAt, user: c.userId ? 'bor' : '—', rec: c.hasRecording, ext: c.externalId }));
if (!(r.calls || r.items || []).length) console.log('(jurnal bo\'sh)', JSON.stringify(r).slice(0, 300));
