// Jonli sinov 12: avtoinformator — soxta provayder (prov.sh) orqali 3 raqamga qo'ng'iroq (2 tasi javob beradi, 998901110003 — javob bermaydi).
// Oldin: prov.sh, trunk.mjs (trunk + chiquvchi qoida). Natija: kampaniya holati, qabul qiluvchilar, call_logs (direction=out).
process.env.E2E_BASE ||= 'http://localhost:8031/api/v1';
process.env.E2E_EMAIL ||= 'live-admin@test.local';
process.env.E2E_PASSWORD ||= 'live-Passw0rd!2026';
const { ok, admin } = await import('../../backend/test/e2e/lib.mjs');
const T = await admin();
const a = await ok('POST', '/pbx/tts', { text: "Hurmatli mijoz! To'lov muddati ertaga tugaydi. Rahmat.", lang: 'uz', name: 'Informer: tolov' }, T);
const c = await ok('POST', '/pbx/informer', { name: `Jonli sinov ${new Date().toISOString().slice(11, 19)}`, audioId: a.id, numbers: '998901110001\n+998 90 111 00 02\n998901110003', windowFrom: '00:00', windowTo: '00:00', maxParallel: 2, retries: 0 }, T);
console.log('import:', JSON.stringify(c.import));
const id = c.campaign.id;
const s = await ok('POST', `/pbx/informer/${id}/start`, undefined, T);
console.log('start:', s.campaign.status, 'pbxReady:', s.pbxReady);
const t0 = Date.now();
let g;
for (;;) {
  await new Promise((r) => setTimeout(r, 5000));
  g = await ok('GET', `/pbx/informer/${id}`, undefined, T);
  const n = g.campaign.counts;
  console.log(`${Math.round((Date.now() - t0) / 1000)}s`, g.campaign.status, JSON.stringify({ pending: n.pending, calling: n.calling, answered: n.answered, noanswer: n.noanswer, failed: n.failed }));
  if (g.campaign.status === 'done' || Date.now() - t0 > 180_000) break;
}
for (const t of g.targets) console.log(' ', t.phone, t.state, `urinish=${t.attempts}`, t.lastResult, t.callLogId ? 'jurnal:bor' : 'jurnal:—');
await new Promise((r) => setTimeout(r, 13000)); // reconcile → callLogId
g = await ok('GET', `/pbx/informer/${id}`, undefined, T);
console.log('callLogId bog`langan:', g.targets.filter((t) => t.callLogId).length);
const r = await ok('GET', '/crm/calls/report?kind=out&limit=10', undefined, T);
for (const x of r.calls.filter((x) => /^99890111000/.test(x.phone))) console.log('  jurnal:', x.phone, x.kind, x.status, `talk=${x.talkSec}`, x.result || '');
