import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { req, ok, admin, uniq, newLead, stages, userWithRole } from './lib.mjs';

let T;
before(async () => { T = await admin(); });

const leadOf = async (id) => { const g = await ok('GET', `/crm/leads/${id}`, undefined, T, 200); return g.lead || g; };
const until = async (fn, ms = 4000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 150)); } return v; };

describe('Kontaktlar va kompaniyalar', () => {
  test('kontakt → bitimga bog`lash → kontakt o`chirilsa bitim qoladi, bog`lanish uziladi', async () => {
    const c = (await ok('POST', '/crm/contacts', { name: uniq('Kontakt'), phone: '+998901234567' }, T)).contact;
    const l = await newLead(T);
    await ok('POST', `/crm/leads/${l.id}/contacts`, { contactId: c.id }, T);
    const g = await ok('GET', `/crm/leads/${l.id}`, undefined, T, 200);
    assert.ok(JSON.stringify(g).includes(c.id), 'kontakt bitimga bog`lanmadi');
    await ok('DELETE', `/crm/contacts/${c.id}`, undefined, T, 200);
    const g2 = await ok('GET', `/crm/leads/${l.id}`, undefined, T, 200);
    assert.ok(!JSON.stringify(g2).includes(c.id), "o'chirilgan kontakt bitimda qoldi");
  });

  test("kompaniya o'chirilsa kontaktlari va bitimlari qoladi", async () => {
    const co = (await ok('POST', '/crm/companies', { name: uniq('MChJ') }, T)).company;
    const c = (await ok('POST', '/crm/contacts', { name: uniq('K'), companyId: co.id }, T)).contact;
    await ok('DELETE', `/crm/companies/${co.id}`, undefined, T, 200);
    const cc = await ok('GET', `/crm/contacts/${c.id}`, undefined, T, 200);
    assert.equal((cc.contact || cc).companyId ?? null, null);
  });

  test("mavjud bo'lmagan kompaniyaga kontakt bog'lab bo'lmaydi", async () => {
    assert.equal((await req('POST', '/crm/contacts', { name: 'x', companyId: 'yoq' }, T)).status, 404);
  });

  test("nomsiz kontakt/kompaniya standart nom oladi (amoCRM kabi faqat telefon bilan ham yaratiladi)", async () => {
    const c = (await ok('POST', '/crm/contacts', { name: '  ', phone: '+998900000001' }, T)).contact;
    assert.ok(c.name && c.name.trim());
  });

  test("ro'yxat va qidiruv", async () => {
    const name = uniq('SearchK');
    await ok('POST', '/crm/contacts', { name }, T);
    const d = await ok('GET', `/crm/contacts?search=${encodeURIComponent(name)}`, undefined, T, 200);
    assert.ok(JSON.stringify(d).includes(name));
  });
});

describe('Chat (IMBOX)', () => {
  test("kanal yo'q bitimga xabar yuborish 500 bermaydi", async () => {
    const l = await newLead(T);
    const r = await req('POST', `/crm/leads/${l.id}/messages`, { text: 'Salom' }, T);
    assert.ok(r.status < 500, `${r.status} ${JSON.stringify(r.data)}`);
  });

  test("bo'sh xabar → 400", async () => {
    const l = await newLead(T);
    assert.equal((await req('POST', `/crm/leads/${l.id}/messages`, { text: '   ' }, T)).status, 400);
  });

  test("suhbatni yopish/qayta ochish/sevimli; noma'lum amal → 400", async () => {
    const l = await newLead(T);
    for (const a of ['close', 'reopen', 'fav', 'fav']) {
      const r = await req('POST', `/crm/conversations/${l.id}/${a}`, undefined, T);
      assert.ok(r.status < 300, `${a} → ${r.status}`);
    }
    assert.equal((await req('POST', `/crm/conversations/${l.id}/hack`, undefined, T)).status, 400);
  });

  test('suhbatlar ro`yxati filtrlari 500 bermaydi', async () => {
    for (const q of ['', 'preset=unanswered', 'preset=open', 'preset=fav', 'preset=mine', 'period=week', 'sort=old', 'stages=new,contact', 'preset=xyz']) {
      const r = await req('GET', `/crm/conversations?${q}`, undefined, T);
      assert.equal(r.status, 200, `${q} → ${r.status}`);
    }
  });
});

describe('Avtomatlashtirish', () => {
  let P, S;
  before(async () => {
    P = (await ok('POST', '/crm/pipelines', { name: uniq('AutoV'), stages: [{ name: 'A', kind: 'open' }, { name: 'B', kind: 'open' }, { name: 'C', kind: 'open' }, { name: 'Won', kind: 'won' }, { name: 'Lost', kind: 'lost' }] }, T)).pipeline;
    S = (await stages(T)).filter((s) => s.pipelineId === P.id).sort((a, b) => a.order - b.order);
  });
  const autos = [];
  after(async () => { for (const id of autos) await req('DELETE', `/crm/automations/${id}`, undefined, T); });

  test("bosqichga kirganda vazifa yaratadi", async () => {
    const a = await ok('POST', '/crm/automations', { name: uniq('Auto'), trigger: 'stage_enter', stageKey: S[1].key, pipelineId: P.id, actions: [{ type: 'create_task', text: 'Avto vazifa', dueMode: 'days', dueValue: 1 }] }, T);
    autos.push((a.automation || a).id);
    const l = await newLead(T, { pipelineId: P.id });
    await ok('PATCH', `/crm/leads/${l.id}/move`, { stageId: S[1].key }, T, 200);
    const tasks = await until(async () => { const t = await ok('GET', `/crm/leads/${l.id}/tasks`, undefined, T, 200); return (t.tasks || t).find((x) => x.title === 'Avto vazifa'); });
    assert.ok(tasks, 'avtomatik vazifa yaratilmadi');
  });

  test("ikki avtomatlashtirish bir-birini chaqirsa — cheksiz aylanmaydi, server javob beradi", async () => {
    const a1 = await ok('POST', '/crm/automations', { name: uniq('Loop1'), trigger: 'stage_enter', stageKey: S[2].key, pipelineId: P.id, actions: [{ type: 'change_stage', stageKey: S[0].key }] }, T);
    const a2 = await ok('POST', '/crm/automations', { name: uniq('Loop2'), trigger: 'stage_enter', stageKey: S[0].key, pipelineId: P.id, actions: [{ type: 'change_stage', stageKey: S[2].key }] }, T);
    autos.push((a1.automation || a1).id, (a2.automation || a2).id);
    const l = await newLead(T, { pipelineId: P.id, stage: S[1].key });
    const t0 = Date.now();
    await ok('PATCH', `/crm/leads/${l.id}/move`, { stageId: S[2].key }, T, 200);
    assert.ok(Date.now() - t0 < 8000, 'juda sekin — aylanish');
    await new Promise((r) => setTimeout(r, 800));
    assert.equal((await req('GET', '/health')).status, 200);
    const lead = await leadOf(l.id);
    assert.ok([S[0].key, S[2].key].includes(lead.stage));
  });

  test("noma'lum trigger/amal → 400; bosqichsiz stage_enter → 400", async () => {
    assert.equal((await req('POST', '/crm/automations', { name: 'x', trigger: 'xyz', actions: [] }, T)).status, 400);
    assert.equal((await req('POST', '/crm/automations', { name: 'x', trigger: 'lead_created', actions: [{ type: 'rm_rf' }] }, T)).status, 400);
    assert.equal((await req('POST', '/crm/automations', { name: 'x', trigger: 'stage_enter', actions: [] }, T)).status, 400);
  });

  test("webhook amali ichki manzillarga (SSRF) ruxsat bermaydi", async () => {
    for (const url of ['http://127.0.0.1:8010/api/v1/health', 'http://localhost/x', 'http://169.254.169.254/latest/meta-data', 'file:///etc/passwd', 'http://10.0.0.1/']) {
      const r = await req('POST', '/crm/automations', { name: 'x', trigger: 'lead_created', actions: [{ type: 'webhook', url }] }, T);
      assert.equal(r.status, 400, `${url} qabul qilindi`);
    }
  });
});

describe('Salesbot', () => {
  test("bot: izoh qadami → bitim lentasiga yoziladi; chatsiz xabar yiqitmaydi; run tugaydi", async () => {
    const b = await ok('POST', '/crm/salesbots', {
      name: uniq('Bot'), startId: 's1',
      steps: [{ id: 's1', type: 'message', text: 'Salom {{name}}', next: 's2' }, { id: 's2', type: 'note', text: 'Bot izohi', next: 's3' }, { id: 's3', type: 'stop' }],
    }, T);
    const bot = b.bot || b;
    const l = await newLead(T);
    await ok('POST', `/crm/salesbots/${bot.id}/run`, { leadId: l.id }, T);
    const runs = await until(async () => { const r = await ok('GET', `/crm/leads/${l.id}/salesbot-runs`, undefined, T, 200); const x = (r.runs || r); return x.length && x.every((y) => y.state !== 'running') ? x : null; });
    assert.ok(runs, 'bot ishi tugamadi');
    await ok('DELETE', `/crm/salesbots/${bot.id}`, undefined, T, 200);
    const r2 = await ok('GET', `/crm/leads/${l.id}/salesbot-runs`, undefined, T, 200);
    assert.equal((r2.runs || r2).length, 0, "o'chirilgan botning yozuvlari qoldi");
  });

  test("o'z-o'ziga ulangan qadamlar (sikl) serverni osib qo'ymaydi", async () => {
    const b = await ok('POST', '/crm/salesbots', { name: uniq('LoopBot'), startId: 'a', steps: [{ id: 'a', type: 'note', text: 'x', next: 'b' }, { id: 'b', type: 'note', text: 'y', next: 'a' }] }, T);
    const bot = b.bot || b;
    const l = await newLead(T);
    const t0 = Date.now();
    await req('POST', `/crm/salesbots/${bot.id}/run`, { leadId: l.id }, T);
    assert.ok(Date.now() - t0 < 10000);
    assert.equal((await req('GET', '/health')).status, 200);
    await ok('DELETE', `/crm/salesbots/${bot.id}`, undefined, T, 200);
  });

  test("mavjud bo'lmagan bitim/botda ishga tushirish 4xx", async () => {
    const b = (await ok('POST', '/crm/salesbots', { name: uniq('B') }, T));
    const bot = b.bot || b;
    assert.ok([400, 404].includes((await req('POST', `/crm/salesbots/${bot.id}/run`, { leadId: 'yoq' }, T)).status));
    assert.ok([400, 404].includes((await req('POST', '/crm/salesbots/yoq/run', { leadId: 'yoq' }, T)).status));
    await ok('DELETE', `/crm/salesbots/${bot.id}`, undefined, T, 200);
  });
});

describe('Analitika va ish stoli', () => {
  test('analitika endpointlari turli davrlarda 200', async () => {
    for (const p of ['/crm/analytics', '/crm/analytics?period=week', '/crm/analytics?from=2020-01-01&to=2030-01-01', '/crm/analytics/flow', '/crm/analytics/calls', '/crm/analytics/events', '/crm/analytics/timeline', '/crm/analytics/employees', '/crm/chat-stats', '/crm/dashboard', '/crm/amma']) {
      const r = await req('GET', p, undefined, T);
      assert.equal(r.status, 200, `${p} → ${r.status} ${JSON.stringify(r.data).slice(0, 150)}`);
    }
  });

  test('vidjet maʼlumotlari (har xil ko`rinish va guruhlash)', async () => {
    for (const q of ['view=number', 'view=chart&compareBy=stage', 'view=list', 'view=chart&compareBy=assignee', 'view=chart&compareBy=lostReason', 'view=xyz']) {
      const r = await req('GET', `/crm/dashboard/widget?${q}`, undefined, T);
      assert.ok(r.status < 500, `${q} → ${r.status}`);
    }
  });

  test("yutilgan bitim summasi analitikada hisoblanadi", async () => {
    const won = (await stages(T)).find((s) => !s.pipelineId && s.kind === 'won');
    const before = await ok('GET', '/crm/analytics?period=month', undefined, T, 200);
    const l = await newLead(T, { value: 12345 });
    await ok('PATCH', `/crm/leads/${l.id}/move`, { stageId: won.key }, T, 200);
    const afterA = await ok('GET', '/crm/analytics?period=month', undefined, T, 200);
    assert.notDeepEqual(JSON.stringify(before), JSON.stringify(afterA), 'yutilgan bitimdan keyin analitika o`zgarmadi');
  });

  test("ish stoli joylashuvini saqlash; sotuvchi hammaga qo'llay olmaydi", async () => {
    const S = await userWithRole('sotuvchi');
    await ok('PUT', '/crm/dashboard', { layout: { theme: 'white' } }, S.token, 200);
    const g = await ok('GET', '/crm/dashboard', undefined, S.token, 200);
    assert.equal(g.layout.theme, 'white');
    assert.equal((await req('PUT', '/crm/dashboard', { layout: {}, applyAll: true }, S.token)).status, 403);
  });
});

describe('Foydalanuvchilar', () => {
  test("bir xil email bilan ikkinchi foydalanuvchi → 400", async () => {
    const email = `${uniq('dup')}@test.local`;
    await ok('POST', '/settings/users', { name: 'A', email, password: 'Passw0rd!!', roleKey: 'sotuvchi' }, T);
    const r = await req('POST', '/settings/users', { name: 'B', email: email.toUpperCase(), password: 'Passw0rd!!', roleKey: 'sotuvchi' }, T);
    assert.equal(r.status, 400);
  });

  test("o'chirilgan (nofaol) foydalanuvchi kira olmaydi va eski tokeni ishlamaydi", async () => {
    const U = await userWithRole('sotuvchi');
    await ok('PATCH', `/settings/users/${U.id}`, { isActive: false }, T, 200);
    assert.equal((await req('POST', '/auth/login', { email: U.email, password: 'qa-test-Passw0rd!' })).status, 401);
    const r = await req('GET', '/crm/leads?limit=1', undefined, U.token);
    assert.equal(r.status, 401, `nofaol foydalanuvchi tokeni hali ishlaydi: ${r.status}`);
  });

  test("admin o'zini nofaol qila olmaydi / oxirgi super adminni yo'qotib bo'lmaydi", async () => {
    const me = await ok('GET', '/auth/me', undefined, T, 200);
    const r = await req('PATCH', `/settings/users/${me.user.id}`, { isActive: false }, T);
    assert.ok(r.status >= 400, `admin o'zini o'chirib qo'ydi: ${r.status}`);
    const r2 = await req('PATCH', `/settings/users/${me.user.id}`, { roleKey: 'sotuvchi' }, T);
    assert.ok(r2.status >= 400, `oxirgi super admin rolini yo'qotdi: ${r2.status}`);
  });

  test("sotuvchi boshqa foydalanuvchi parolini o'zgartira olmaydi", async () => {
    const S = await userWithRole('sotuvchi');
    const me = await ok('GET', '/auth/me', undefined, T, 200);
    assert.equal((await req('POST', `/settings/users/${me.user.id}/password`, { password: 'Hacked123!' }, S.token)).status, 403);
  });

  test("o'z parolini o'zgartirish eski parolni talab qiladi", async () => {
    const U = await userWithRole('sotuvchi');
    const r = await req('POST', '/settings/me/password', { password: 'NewPassw0rd!' }, U.token);
    assert.ok(r.status >= 400, `eski parolsiz o'zgardi: ${r.status}`);
  });
});
