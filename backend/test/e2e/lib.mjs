// E2E test yordamchilari: login, so'rov, foydalanuvchi/rol yaratish. run.sh orqali ishga tushiriladi.
import assert from 'node:assert/strict';

export const BASE = process.env.E2E_BASE || 'http://localhost:8010/api/v1';

export async function req(method, path, body, token, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  const text = await res.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* matn (CSV, iCal) */ }
  return { status: res.status, data, headers: res.headers };
}

// kutilgan status bo'lmasa — tushunarli xato bilan yiqiladi
export async function ok(method, path, body, token, expect = [200, 201]) {
  const r = await req(method, path, body, token);
  const exp = Array.isArray(expect) ? expect : [expect];
  assert.ok(exp.includes(r.status), `${method} ${path} → ${r.status} (kutilgan ${exp.join('/')}): ${JSON.stringify(r.data).slice(0, 400)}`);
  return r.data;
}

export async function login(email = process.env.E2E_EMAIL, password = process.env.E2E_PASSWORD) {
  const d = await ok('POST', '/auth/login', { email, password }, null, 200);
  const token = d.accessToken || d.access_token || d.token;
  assert.ok(token, `login javobida token yo'q: ${Object.keys(d)}`);
  return token;
}

let adminTok;
export const admin = async () => (adminTok ??= await login());

let seq = 0;
export const uniq = (p = 'qa') => `${p}-${Date.now().toString(36)}-${++seq}`;

// berilgan rol bilan yangi foydalanuvchi yaratib, tokenini qaytaradi
export async function userWithRole(roleKey) {
  const email = `${uniq(roleKey)}@test.local`;
  const password = 'qa-test-Passw0rd!';
  const r = await ok('POST', '/settings/users', { name: `QA ${roleKey}`, email, password, roleKey }, await admin());
  const id = r.user?.id || r.id;
  return { id, email, token: await login(email, password) };
}

export async function me(token) { return ok('GET', '/auth/me', undefined, token, 200); }

export async function newLead(token, extra = {}) {
  const d = await ok('POST', '/crm/leads', { name: uniq('Lead'), ...extra }, token);
  const lead = d.lead || d;
  assert.ok(lead.id, `lead id yo'q: ${JSON.stringify(d).slice(0, 200)}`);
  return lead;
}

export async function stages(token) {
  const d = await ok('GET', '/crm/stages', undefined, token, 200);
  return d.stages || d;
}
