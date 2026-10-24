#!/usr/bin/env node
// Smoke test: running backend'ga qarshi asosiy endpointlarni tekshiradi.
// Ishlatish:  SMOKE_BASE=http://localhost:8000 SMOKE_EMAIL=... SMOKE_PASSWORD=... node scripts/smoke.mjs
// (scripts/smoke.sh bazani/serverni o'zi ko'taradi.)
const BASE = (process.env.SMOKE_BASE || 'http://localhost:8000').replace(/\/$/, '') + '/api/v1';
const EMAIL = process.env.SMOKE_EMAIL || process.env.SEED_ADMIN_EMAIL;
const PASSWORD = process.env.SMOKE_PASSWORD || process.env.SEED_ADMIN_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('SMOKE_EMAIL va SMOKE_PASSWORD (yoki SEED_ADMIN_*) kerak'); process.exit(2); }

let token = '', pass = 0, fail = 0;
async function call(method, path, body, { auth = true, raw = false } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (auth && token) headers.authorization = 'Bearer ' + token;
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, text, res };
}
function check(name, ok, extra = '') {
  if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
}
async function expect(name, method, path, body, status, opts) {
  const r = await call(method, path, body, opts);
  const okSt = Array.isArray(status) ? status.includes(r.status) : r.status === status;
  check(`${method} ${path} -> ${status}`, okSt, `got ${r.status} ${r.text.slice(0, 200)}`);
  return r.data;
}

console.log('# auth');
await expect('no token', 'GET', '/crm/pipeline', undefined, 401, { auth: false });
await expect('bad login', 'POST', '/auth/login', { email: EMAIL, password: 'wrong-password-x' }, [400, 401], { auth: false });
await expect('invalid body', 'POST', '/auth/login', { email: 'nope' }, 400, { auth: false });
const login = await expect('login', 'POST', '/auth/login', { email: EMAIL, password: PASSWORD }, [200, 201], { auth: false });
token = login.token;
check('login returns token/refresh/permissions', !!(login.token && login.refreshToken && login.permissions?.length));
const me = await expect('me', 'GET', '/auth/me', undefined, 200);
check('me.user.email', me?.user?.email === EMAIL);
const ref = await expect('refresh', 'POST', '/auth/refresh', { refreshToken: login.refreshToken }, [200, 201], { auth: false });
check('refresh returns token', !!ref.token);
await expect('bad refresh', 'POST', '/auth/refresh', { refreshToken: 'garbage' }, 401, { auth: false });

console.log('# settings');
await expect('access', 'GET', '/settings/access', undefined, 200);
const role = await expect('create role', 'POST', '/settings/roles', { name: 'Smoke Role ' + Date.now() }, [200, 201]);
await expect('role invalid', 'POST', '/settings/roles', {}, 400);
const roleKey = role?.role?.key;
await expect('set permission', 'PATCH', '/settings/access', { roleKey, permission: 'crm.view', allowed: true }, 200);
await expect('permission invalid', 'PATCH', '/settings/access', { roleKey }, 400);
const uEmail = `smoke${Date.now()}@example.com`;
const nu = await expect('create user', 'POST', '/settings/users', { name: 'Smoke User', email: uEmail, password: 'SmokePass123', roleKey: 'sotuvchi', extension: '101' }, [200, 201]);
await expect('create user dup', 'POST', '/settings/users', { name: 'Smoke User', email: uEmail, password: 'SmokePass123', roleKey: 'sotuvchi' }, [400, 409]);
await expect('create user invalid', 'POST', '/settings/users', { name: 'x', email: 'bad', password: '1', roleKey: 'sotuvchi' }, 400);
await expect('list users', 'GET', '/settings/users', undefined, 200);
const uid = nu?.user?.id;
await expect('update user', 'PATCH', `/settings/users/${uid}`, { name: 'Smoke User 2', extension: '102' }, 200);
await expect('reset password', 'POST', `/settings/users/${uid}/password`, { password: 'NewSmokePass123' }, [200, 201]);
const l2 = await expect('new user logs in', 'POST', '/auth/login', { email: uEmail, password: 'NewSmokePass123' }, [200, 201], { auth: false });
const adminToken = token;
token = l2.token;
await expect('RBAC: seller cannot open settings', 'GET', '/settings/users', undefined, 403);
await expect('RBAC: seller cannot edit pbx', 'PUT', '/crm/pbx/config', { domain: 'x.onpbx.ru' }, 403);
token = adminToken;

console.log('# crm: pipeline / stages');
const pipe = await expect('pipeline', 'GET', '/crm/pipeline', undefined, 200);
check('pipeline has stages', Array.isArray(pipe.stages) && pipe.stages.length > 0, JSON.stringify(pipe).slice(0, 150));
await expect('members', 'GET', '/crm/members', undefined, 200);
const stg = await expect('create stage', 'POST', '/crm/stages', { name: 'Smoke stage', color: '#ff0000', kind: 'open' }, [200, 201]);
await expect('create stage invalid', 'POST', '/crm/stages', {}, 400);
const stKey = stg?.stage?.key || stg?.stage?.id;
await expect('update stage', 'PUT', `/crm/stages/${stKey}`, { name: 'Smoke stage 2' }, 200);
const pl = await expect('create pipeline', 'POST', '/crm/pipelines', { name: 'Smoke pipeline' }, [200, 201]);
await expect('list pipelines', 'GET', '/crm/pipelines', undefined, 200);
await expect('update pipeline', 'PUT', `/crm/pipelines/${pl?.pipeline?.id}`, { name: 'Smoke pipeline 2' }, 200);

console.log('# crm: leads');
const lead = await expect('create lead', 'POST', '/crm/leads', { name: 'Smoke Lead', phone: '+998900000001', email: 'lead@example.com', value: 1000, tags: ['smoke'] }, [200, 201]);
const leadId = lead?.lead?.id;
check('lead id', !!leadId, JSON.stringify(lead).slice(0, 150));
await expect('create lead invalid', 'POST', '/crm/leads', { phone: '1' }, 400);
await expect('get lead', 'GET', `/crm/leads/${leadId}`, undefined, 200);
await expect('get lead 404', 'GET', '/crm/leads/doesnotexist', undefined, [404]);
await expect('update lead', 'PUT', `/crm/leads/${leadId}`, { name: 'Smoke Lead 2', value: 2000 }, 200);
await expect('list leads', 'GET', '/crm/leads', undefined, 200);
await expect('list leads search', 'GET', '/crm/leads?q=Smoke', undefined, 200);
await expect('check duplicate', 'GET', '/crm/leads-check?phone=%2B998900000001', undefined, 200);
await expect('add note', 'POST', `/crm/leads/${leadId}/notes`, { text: 'hello' }, [200, 201]);
await expect('add note invalid', 'POST', `/crm/leads/${leadId}/notes`, {}, 400);
const stagesNow = (await call('GET', '/crm/pipeline')).data.stages;
const targetStage = stagesNow[stagesNow.length - 1];
await expect('move lead', 'PATCH', `/crm/leads/${leadId}/move`, { stageId: stKey || targetStage.key || targetStage.id, position: 0 }, 200);
const lead2 = await expect('create lead 2', 'POST', '/crm/leads', { name: 'Smoke Dup', phone: '+998900000001' }, [200, 201]);
await expect('bulk', 'POST', '/crm/leads/bulk', { ids: [lead2?.lead?.id], action: 'add_tag', value: 'bulk' }, [200, 201]);
await expect('merge', 'POST', '/crm/leads/merge', { keepId: leadId, mergeIds: [lead2?.lead?.id] }, [200, 201]);
await expect('import', 'POST', '/crm/leads-import', { rows: [{ name: 'Imported', phone: '+998900000002' }] }, [200, 201]);
{
  const r = await fetch(BASE + '/crm/leads-export', { headers: { authorization: 'Bearer ' + token } });
  check('export csv', r.status === 200, 'got ' + r.status);
}
await expect('unsorted', 'GET', '/crm/unsorted', undefined, 200);

console.log('# crm: tasks');
const tk = await expect('create task', 'POST', `/crm/leads/${leadId}/tasks`, { title: 'Call back', type: 'call', dueDate: new Date(Date.now() + 86400000).toISOString() }, [200, 201]);
await expect('create task invalid', 'POST', `/crm/leads/${leadId}/tasks`, { type: 'bogus' }, 400);
await expect('list tasks', 'GET', '/crm/tasks', undefined, 200);
await expect('list lead tasks', 'GET', `/crm/leads/${leadId}/tasks`, undefined, 200);
await expect('update task', 'PUT', `/crm/tasks/${tk?.task?.id}`, { done: true, result: 'ok' }, 200);
await expect('delete task', 'DELETE', `/crm/tasks/${tk?.task?.id}`, undefined, [200, 204]);

console.log('# crm: settings entities');
const fld = await expect('create field', 'POST', '/crm/fields', { entity: 'lead', label: 'Smoke field', type: 'text' }, [200, 201]);
await expect('list fields', 'GET', '/crm/fields?entity=lead', undefined, 200);
await expect('update field', 'PUT', `/crm/fields/${fld?.field?.id}`, { label: 'Smoke field 2' }, 200);
await expect('reorder fields', 'POST', '/crm/fields/reorder', { ids: [fld?.field?.id] }, [200, 201]);
await expect('delete field', 'DELETE', `/crm/fields/${fld?.field?.id}`, undefined, [200, 204]);
const lr = await expect('create lost reason', 'POST', '/crm/lost-reasons', { name: 'Smoke reason' }, [200, 201]);
await expect('list lost reasons', 'GET', '/crm/lost-reasons', undefined, 200);
await expect('delete lost reason', 'DELETE', `/crm/lost-reasons/${lr?.reason?.id}`, undefined, [200, 204]);
const tg = await expect('create tag', 'POST', '/crm/tags', { name: 'smoketag', color: '#00ff00' }, [200, 201]);
await expect('list tags', 'GET', '/crm/tags', undefined, 200);
await expect('delete tag', 'DELETE', `/crm/tags/${tg?.tag?.id}`, undefined, [200, 204]);
const fl = await expect('create filter', 'POST', '/crm/filters', { name: 'Smoke filter', params: { q: 'x' } }, [200, 201]);
await expect('list filters', 'GET', '/crm/filters', undefined, 200);
await expect('delete filter', 'DELETE', `/crm/filters/${fl?.filter?.id}`, undefined, [200, 204]);
const au = await expect('create automation', 'POST', '/crm/automations', { name: 'Smoke auto', trigger: 'lead_created', action: 'add_tag', config: {} }, [200, 201, 400]);
await expect('list automations', 'GET', '/crm/automations', undefined, 200);
if (au?.automation?.id) {
  await expect('update automation', 'PUT', `/crm/automations/${au.automation.id}`, { name: 'Smoke auto 2' }, 200);
  await expect('delete automation', 'DELETE', `/crm/automations/${au.automation.id}`, undefined, [200, 204]);
}
const co = await expect('create company', 'POST', '/crm/companies', { name: 'Smoke Co' }, [200, 201]);
await expect('list companies', 'GET', '/crm/companies', undefined, 200);
await expect('get company', 'GET', `/crm/companies/${co?.company?.id}`, undefined, 200);
await expect('update company', 'PUT', `/crm/companies/${co?.company?.id}`, { name: 'Smoke Co 2' }, 200);
const ct = await expect('create contact', 'POST', '/crm/contacts', { name: 'Smoke Contact', phone: '+998900000003' }, [200, 201]);
await expect('list contacts', 'GET', '/crm/contacts', undefined, 200);
await expect('update contact', 'PUT', `/crm/contacts/${ct?.contact?.id}`, { name: 'Smoke Contact 2' }, 200);
await expect('delete contact', 'DELETE', `/crm/contacts/${ct?.contact?.id}`, undefined, [200, 204]);
await expect('delete company', 'DELETE', `/crm/companies/${co?.company?.id}`, undefined, [200, 204]);
const pr = await expect('create product', 'POST', '/crm/products', { name: 'Smoke product', price: 100 }, [200, 201]);
await expect('list products', 'GET', '/crm/products', undefined, 200);
await expect('update product', 'PUT', `/crm/products/${pr?.product?.id}`, { name: 'Smoke product 2' }, 200);
await expect('delete product', 'DELETE', `/crm/products/${pr?.product?.id}`, undefined, [200, 204]);
const gl = await expect('upsert goal', 'POST', '/crm/goals', { userId: me?.user?.id, period: '2026-10', target: 5000000, metric: 'revenue' }, [200, 201, 400]);
await expect('list goals', 'GET', '/crm/goals?period=2026-10', undefined, 200);
if (gl?.goal?.id) await expect('delete goal', 'DELETE', `/crm/goals/${gl.goal.id}`, undefined, [200, 204]);
await expect('notifications', 'GET', '/notifications', undefined, 200);
await expect('notifications read-all', 'POST', '/notifications/read-all', {}, [200, 201]);

console.log('# crm: forms (public)');
const fm = await expect('create form', 'POST', '/crm/forms', { name: 'Smoke form', title: 'Smoke form', fields: [{ key: 'name', label: 'Ism', type: 'text', required: true }, { key: 'phone', label: 'Telefon', type: 'phone', required: true }] }, [200, 201]);
await expect('list forms', 'GET', '/crm/forms', undefined, 200);
const slug = fm?.form?.slug;
check('form slug', !!slug, JSON.stringify(fm).slice(0, 200));
if (slug) {
  await expect('public form get', 'GET', `/public/crm-forms/${slug}`, undefined, 200, { auth: false });
  await expect('public form submit', 'POST', `/public/crm-forms/${slug}`, { answers: { name: 'Public Lead', phone: '+998900000004' } }, [200, 201], { auth: false });
  await expect('public form 404', 'GET', '/public/crm-forms/nope-nope', undefined, 404, { auth: false });
  await expect('delete form', 'DELETE', `/crm/forms/${fm.form.id}`, undefined, [200, 204]);
}

console.log('# analytics');
for (const p of ['', '/calls', '/events', '/timeline', '/employees']) await expect('analytics' + p, 'GET', '/crm/analytics' + p, undefined, 200);

console.log('# chat / telegram (unconfigured)');
const cs = await expect('chat status', 'GET', '/crm/chat-status', undefined, 200);
check('telegram disabled', cs?.telegram === false, JSON.stringify(cs));
await expect('conversations', 'GET', '/crm/conversations', undefined, 200);
await expect('lead messages', 'GET', `/crm/leads/${leadId}/messages`, undefined, 200);
await expect('send message (graceful)', 'POST', `/crm/leads/${leadId}/messages`, { text: 'hi' }, [200, 201, 400, 409, 503]);
await expect('telegram webhook (public, junk update)', 'POST', '/telegram/webhook', { update_id: 1, message: { chat: { id: 1, type: 'private' }, from: { id: 1, first_name: 'T' }, text: 'hello' } }, [200, 201]);
await expect('telegram webhook empty', 'POST', '/telegram/webhook', {}, [200, 201]);
await expect('telegram setup (graceful)', 'POST', '/crm/telegram-webhook-setup', { url: 'https://example.com/api/v1/telegram/webhook' }, [200, 201, 400, 503]);

console.log('# onlinepbx (unconfigured)');
const pbx = await expect('pbx config', 'GET', '/crm/pbx/config', undefined, 200);
check('pbx disabled', pbx?.enabled === false, JSON.stringify(pbx));
await expect('pbx test (graceful)', 'POST', '/crm/pbx/test', {}, [200, 201, 400]);
await expect('call lead (graceful)', 'POST', `/crm/leads/${leadId}/call`, {}, [200, 201, 400, 409, 503]);
await expect('dial (graceful)', 'POST', '/crm/calls/dial', { to: '+998900000001' }, [200, 201, 400, 409, 503]);
await expect('sync calls (graceful)', 'POST', '/crm/calls/sync', {}, [200, 201, 400, 409, 503]);
await expect('list calls', 'GET', '/crm/calls', undefined, 200);
await expect('lead calls', 'GET', `/crm/leads/${leadId}/calls`, undefined, 200);
await expect('incoming', 'GET', '/crm/calls/incoming', undefined, 200);
await expect('my-extension get', 'GET', '/crm/my-extension', undefined, 200);
await expect('my-extension put', 'PUT', '/crm/my-extension', { extension: '100' }, 200);
await expect('webrtc config', 'GET', '/crm/webrtc/config', undefined, 200);
await expect('webrtc config put', 'PUT', '/crm/webrtc/config', { enabled: false }, 200);
await expect('lead-by-phone', 'GET', '/crm/lead-by-phone?phone=%2B998900000001', undefined, 200);
await expect('soft-log', 'POST', '/crm/calls/soft-log', { leadId, to: '+998900000001' }, [200, 201]);
await expect('pbx config put', 'PUT', '/crm/pbx/config', { domain: 'example.onpbx.ru', defaultExt: '100', callMode: 'callback' }, 200);
await expect('pbx webhook (public, call event)', 'POST', '/onlinepbx/webhook', { event: 'call_start', direction: 'inbound', caller: '+998900000001', callee: '100', uuid: 'smoke-uuid-1' }, [200, 201]);
await expect('pbx webhook empty', 'POST', '/onlinepbx/webhook', {}, [200, 201]);
await expect('pbx test w/ unreachable PBX (graceful)', 'POST', '/crm/pbx/test', {}, [200, 201, 400]);
await expect('pbx config reset', 'PUT', '/crm/pbx/config', { domain: '', defaultExt: '' }, 200);

console.log('# facebook (unconfigured)');
const fb = await expect('fb config', 'GET', '/crm/facebook/config', undefined, 200);
await expect('fb oauth-url (graceful)', 'GET', '/crm/facebook/oauth-url', undefined, [200, 400]);
await expect('fb forms (graceful)', 'GET', '/crm/facebook/forms?pageId=1', undefined, [200, 400, 404]);
await expect('fb mappings', 'GET', '/crm/facebook/mappings', undefined, 200);
await expect('fb config put', 'PUT', '/crm/facebook/config', { appId: '123', appSecret: 'secret-placeholder', verifyToken: 'smoke-verify' }, 200);
const ch = await call('GET', '/facebook/webhook?hub.mode=subscribe&hub.verify_token=smoke-verify&hub.challenge=abc123', undefined, { auth: false });
check('fb webhook verify ok', ch.status === 200 && String(ch.text).includes('abc123'), `${ch.status} ${ch.text}`);
await expect('fb webhook verify bad token', 'GET', '/facebook/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc', undefined, [400, 403], { auth: false });
await expect('fb webhook post (no pages)', 'POST', '/facebook/webhook', { object: 'page', entry: [{ id: '1', changes: [{ field: 'leadgen', value: { leadgen_id: '1', form_id: '1', page_id: '1' } }] }] }, [200, 201], { auth: false });
await expect('fb connect invalid', 'POST', '/crm/facebook/connect', {}, [400]);
await expect('fb config reset', 'PUT', '/crm/facebook/config', { appId: '', appSecret: '', verifyToken: '' }, 200);

console.log('# cleanup');
await expect('delete lead', 'DELETE', `/crm/leads/${leadId}`, undefined, [200, 204]);
if (stKey) await expect('delete stage', 'DELETE', `/crm/stages/${stKey}`, undefined, [200, 204]);
if (pl?.pipeline?.id) await expect('delete pipeline', 'DELETE', `/crm/pipelines/${pl.pipeline.id}`, undefined, [200, 204]);
await expect('logout', 'POST', '/auth/logout', {}, [200, 201, 204]);

console.log(`\nSMOKE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
