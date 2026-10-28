// Jonli sinov 10: IVR (salomlashish) + ovozli pochta + vaqt qoidasi modullari → «Stansiyaga qo'llash».
//   node flow.mjs                 — IVR 5000 (1 → guruh 10, 2 → 101, ichki raqam terish, kutish 4 s → ovozli pochta 5120)
//   node flow.mjs time <rejim>    — vaqt qoidasi 5100 (ish → 101, dam → 5120, bayram → 100); rejim: work | off | holiday | night
//     work — bugun hozir ish vaqti; off — bugun dam olish kuni; holiday — bugun bayram; night — tunni kesib o'tuvchi oraliq (hozir ichida);
//     night3 — faqat BUGUN tungi smena (H+2:00 → ertaga H+1:00): hozir ish vaqti EMAS;
//     night2 — faqat KECHA yoqilgan tungi smena (23:00 → bugun H+1:00): hozir ish vaqti bo'lishi kerak (kun almashishi)
process.env.E2E_BASE ||= 'http://localhost:8031/api/v1';
process.env.E2E_EMAIL ||= 'live-admin@test.local';
process.env.E2E_PASSWORD ||= 'live-Passw0rd!2026';
const { ok, admin } = await import('../../backend/test/e2e/lib.mjs');
const { execSync } = await import('node:child_process');
const T = await admin();
const mods = (await ok('GET', '/pbx/modules', undefined, T)).modules || [];
const upsert = async (type, number, name, config) => {
  const m = mods.find((x) => x.number === number);
  if (m) return ok('PUT', `/pbx/modules/${m.id}`, { name, config }, T);
  return ok('POST', '/pbx/modules', { type, number, name, config }, T);
};
await upsert('voicemail', '5120', 'Pochta', { recordSec: 20, silenceSec: 3, forwardTo: '' });
await upsert('greeting', '5000', 'IVR', { menu: [{ key: '1', to: '10' }, { key: '2', to: '101' }], allowExt: true, delaySec: 4, forwardTo: '5120' });
if (process.argv[2] === 'time') {
  const mode = process.argv[3] || 'work';
  // Toshkent vaqti (UTC+5): bugungi kun nomi va soat
  const now = new Date(Date.now() + 5 * 3600_000);
  const day = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getUTCDay()];
  const hh = (h) => String((h + 24) % 24).padStart(2, '0');
  const H = now.getUTCHours();
  const days = {};
  for (const d of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) days[d] = { on: false, from: '09:00', to: '18:00' };
  if (mode === 'work') days[day] = { on: true, from: `${hh(H - 1)}:00`, to: `${hh(H + 1)}:59` };
  if (mode === 'night') days[day] = { on: true, from: `${hh(H - 1)}:00`, to: `${hh(H - 2)}:00` }; // masalan 16:00–15:00 — kun almashib o'tadi
  if (mode === 'holiday') days[day] = { on: true, from: '00:00', to: '23:59' };
  // kechagi tungi smena bugun ertalabgacha davom etadi (kecha 23:00 → bugun H+1:00), bugun o'zi — dam: hozir «ish vaqti» bo'lishi kerak
  const yday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][(now.getUTCDay() + 6) % 7];
  // bugungi tungi smena (H+2:00 → ertaga H+1:00), kecha — dam: hozir (bugun H:xx) ish vaqti EMAS (eski generator «ish» der edi)
  if (mode === 'night3') days[day] = { on: true, from: `${hh(H + 2)}:00`, to: `${hh(H + 1)}:00` };
  if (mode === 'night2') days[yday] = { on: true, from: '23:00', to: `${hh(H + 1)}:00` };
  const holidays = mode === 'holiday' ? [now.toISOString().slice(0, 10)] : [];
  await upsert('timerule', '5100', 'Ish vaqti', { timezone: 'UTC+5', days, holidays, workTo: '101', offTo: '5120', holidayTo: '100' });
  console.log('rejim:', mode, 'kun:', day, JSON.stringify(days[day]), 'kecha:', yday, JSON.stringify(days[yday]), holidays);
}
console.log('apply:', JSON.stringify(await ok('POST', '/pbx/asterisk/apply', {}, T)));
await new Promise((r) => setTimeout(r, 2500));
const sh = (c) => execSync(`docker exec crm-ast-live asterisk -rx "${c}"`, { encoding: 'utf8' });
// Colima (macOS → VM) fayl sinxroni kechikadi: CRM yozgan zahoti qayta yuklash eski/yarim faylni o'qishi mumkin — yana bir bor yuklaymiz
for (const c of ['module reload res_pjsip.so', 'dialplan reload']) sh(c);
for (const c of ['dialplan show m5000', 'dialplan show m5120', 'dialplan show m5100']) console.log(sh(c).split('\n').filter((l) => /=>|\d\./.test(l)).join('\n'));
