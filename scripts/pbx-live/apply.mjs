// Jonli sinov 1: ichki raqamlar + guruh → «Stansiyaga qo'llash» → haqiqiy Asterisk konfiguratsiyani yuklaganini tekshirish.
process.env.E2E_BASE ||= 'http://localhost:8031/api/v1';
process.env.E2E_EMAIL ||= 'live-admin@test.local';
process.env.E2E_PASSWORD ||= 'live-Passw0rd!2026';
import { execSync } from 'node:child_process';
const { ok, req, admin, uniq } = await import('../../backend/test/e2e/lib.mjs');

const sh = (c) => execSync(`docker exec crm-ast-live asterisk -rx "${c}"`, { encoding: 'utf8' });
const T = await admin();
await ok('PUT', '/crm/pbx/config', { provider: 'own', defaultExt: '100', popups: true }, T);
const users = [];
for (const n of ['Ali', 'Vali']) {
  const email = `${uniq('live')}@test.local`;
  const r = await ok('POST', '/settings/users', { name: n, email, password: 'live-Passw0rd!2026', roleKey: 'sotuvchi' }, T);
  users.push(r.user?.id || r.id);
}
const mods = await ok('GET', '/pbx/modules', undefined, T);
if (!(mods.modules || []).length) {
  await ok('POST', '/pbx/modules', { type: 'user', number: '100', name: 'Ali', config: { crmUserId: users[0] } }, T);
  await ok('POST', '/pbx/modules', { type: 'user', number: '101', name: 'Vali', config: { crmUserId: users[1] } }, T);
  await ok('POST', '/pbx/modules', { type: 'group', number: '10', name: 'Savdo', config: { members: ['100', '101'], afterSec: 20 } }, T);
}
const r = await ok('POST', '/pbx/asterisk/apply', {}, T);
console.log('apply:', JSON.stringify(r));
console.log(sh('pjsip show endpoints'));
console.log(sh('dialplan show from-internal'));
console.log(sh('dialplan show m10'));
