// amoCRM «Права доступа»: profil matritsasi — Если ответственный / Для группы / Запрещено; ro'yxat, kartochka,
// eksport, ommaviy amal, vazifalar, kontaktlar, imBox va «Неразобранное» shu huquqqa bo'ysunadi.
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { req, ok, admin, uniq, login, newLead } from './lib.mjs';

let A, roleKey, U1, U2;
const mkUser = async (rk) => {
  const email = `${uniq('rm')}@test.local`;
  const r = await ok('POST', '/settings/users', { name: uniq('RM'), email, password: 'qa-test-Passw0rd!', roleKey: rk }, A);
  return { id: r.user.id, token: await login(email, 'qa-test-Passw0rd!') };
};
const setRights = (rights) => ok('PUT', `/settings/roles/${roleKey}/rights`, { rights }, A, 200);
const ids = (r) => (r.leads || r.items || []).map((x) => x.id);

before(async () => {
  A = await admin();
  roleKey = (await ok('POST', '/settings/roles', { name: uniq('Profil') }, A)).role.key;
  await ok('PATCH', '/settings/access', { roleKey, permission: 'crm.view', allowed: true }, A, 200);
  U1 = await mkUser(roleKey);
  U2 = await mkUser(roleKey);
});

describe("Huquqlar matritsasi (amoCRM «Права доступа»)", () => {
  test("standart — hammasi ruxsat (eski xatti-harakat saqlanadi), matritsa access'da qaytadi", async () => {
    const acc = await ok('GET', '/settings/access', undefined, A, 200);
    const r = acc.roles.find((x) => x.key === roleKey);
    assert.equal(r.rights.leads.view, 'A');
    assert.deepEqual(acc.levels.leads.view, ['D', 'M', 'G', 'A']);
    assert.equal((await req('PUT', '/settings/roles/super_admin/rights', { rights: {} }, A)).status, 400);
    assert.equal((await req('PUT', `/settings/roles/${roleKey}/rights`, { rights: {} }, U1.token)).status, 403);
  });

  test("«Если ответственный»: faqat o'z bitimlari ro'yxatda/kartochkada; o'chirish taqiqlangan; eksport ham cheklangan", async () => {
    const l1 = await newLead(A, { assigneeId: U1.id, name: uniq('RM-own') });
    const l2 = await newLead(A, { assigneeId: U2.id, name: uniq('RM-other') });
    await setRights({ leads: { add: 'A', view: 'M', edit: 'M', delete: 'D', export: 'M' }, contacts: { view: 'M' } });
    const list = await ok('GET', '/crm/leads?limit=200&search=RM-', undefined, U1.token, 200);
    assert.ok(ids(list).includes(l1.id), "o'z bitimi ko'rinmadi");
    assert.ok(!ids(list).includes(l2.id), "boshqaning bitimi ko'rinib qoldi");
    assert.equal((await req('GET', `/crm/leads/${l2.id}`, undefined, U1.token)).status, 403);
    assert.equal((await req('PUT', `/crm/leads/${l2.id}`, { name: 'x' }, U1.token)).status, 403);
    await ok('GET', `/crm/leads/${l1.id}`, undefined, U1.token, 200);
    assert.equal((await req('DELETE', `/crm/leads/${l1.id}`, undefined, U1.token)).status, 403, "o'chirish taqiqlangan edi");
    const csv = (await req('GET', '/crm/leads-export?search=RM-', undefined, U1.token)).data;
    assert.ok(!String(csv).includes(l2.name), "eksportda boshqaning bitimi bor");
    const bulk = await req('POST', '/crm/leads/bulk', { ids: [l2.id], action: 'delete' }, U1.token);
    assert.equal(bulk.status, 403);
    const pipe = await ok('GET', '/crm/pipeline', undefined, U1.token, 200);
    assert.ok(!JSON.stringify(pipe).includes(l2.id), "voronkada boshqaning bitimi bor");
    // sarlavha statistikasi (Faol lidlar soni) ham faqat ko'rinadigan bitimlardan: administratorniki ko'proq
    const adminPipe = await ok('GET', '/crm/pipeline', undefined, A, 200);
    const openCount = (p) => Number(String((p.stats || []).find((x) => x.lab === 'Faol lidlar')?.v || '0').replace(/\D/g, ''));
    assert.ok(openCount(adminPipe) > openCount(pipe), `statistika begona bitimlarni ham sanadi: admin=${openCount(adminPipe)} xodim=${openCount(pipe)}`);
    // administrator hamma narsani ko'radi
    await ok('GET', `/crm/leads/${l2.id}`, undefined, A, 200);
  });

  test("«Для группы»: bir guruhdagi hamkasbning bitimi ko'rinadi, boshqa guruhniki yo'q", async () => {
    const g = (await ok('POST', '/settings/groups', { name: uniq('RMG') }, A)).group;
    await ok('PATCH', `/settings/users/${U1.id}`, { groupId: g.id }, A, 200);
    await ok('PATCH', `/settings/users/${U2.id}`, { groupId: g.id }, A, 200);
    const l2 = await newLead(A, { assigneeId: U2.id });
    const lx = await newLead(A, {}); // admin mas'ul — boshqa guruh
    await setRights({ leads: { view: 'G', edit: 'G' } });
    await ok('GET', `/crm/leads/${l2.id}`, undefined, U1.token, 200);
    assert.equal((await req('GET', `/crm/leads/${lx.id}`, undefined, U1.token)).status, 403);
  });

  test("vazifalar: tahrir «Если ответственный» — boshqaning vazifasini tahrirlab bo'lmaydi; ro'yxat bitim huquqi bo'yicha", async () => {
    await setRights({ leads: { view: 'M' }, tasks: { edit: 'M', delete: 'D' } });
    const l = await newLead(A, { assigneeId: U2.id });
    const t = (await ok('POST', `/crm/leads/${l.id}/tasks`, { title: uniq('RMT'), assigneeId: U2.id, dueDate: new Date(Date.now() + 3600e3).toISOString() }, A)).task;
    assert.equal((await req('PUT', `/crm/tasks/${t.id}`, { title: 'x' }, U1.token)).status, 403);
    assert.equal((await req('DELETE', `/crm/tasks/${t.id}`, undefined, U2.token)).status, 403, "o'chirish taqiqlangan edi");
    const tl = await ok('GET', '/crm/tasks', undefined, U1.token, 200);
    assert.ok(!tl.tasks.some((x) => x.id === t.id), "boshqaning bitimi vazifasi ro'yxatda");
  });

  test("kontaktlar: «Если ответственный» va «Создание: Запрещено»", async () => {
    await setRights({ contacts: { add: 'D', view: 'M' } });
    assert.equal((await req('POST', '/crm/contacts', { name: uniq('K') }, U1.token)).status, 403);
    const c = (await ok('POST', '/crm/contacts', { name: uniq('RMK') }, A)).contact;
    assert.equal((await req('GET', `/crm/contacts/${c.id}`, undefined, U1.token)).status, 403);
    const list = await ok('GET', '/crm/entities?kind=contacts&search=RMK', undefined, U1.token, 200);
    assert.ok(!JSON.stringify(list).includes(c.id));
  });

  test("«Неразобранное» asosiy voronkada taqiqlansa ro'yxatda ko'rinmaydi va qabul qilib bo'lmaydi", async () => {
    await setRights({ unsorted: { '': { view: 'D', edit: 'D', delete: 'D' } } });
    const u = await ok('GET', '/crm/unsorted', undefined, A, 200);
    const mine = await ok('GET', '/crm/unsorted', undefined, U1.token, 200);
    const firstMain = (u.leads || []).find((x) => !x.pipelineId);
    if (firstMain) {
      assert.ok(!(mine.leads || []).some((x) => x.id === firstMain.id), "taqiqlangan saralanmagan ko'rindi");
      assert.equal((await req('POST', `/crm/unsorted/${firstMain.id}/accept`, {}, U1.token)).status, 403);
    }
    await setRights({});
  });

  test("ikkilamchi yo'llar ham cheklanadi: dublikatlar, o'chirilgan vazifalar, Salesbot, voqealar ro'yxati", async () => {
    await setRights({ leads: { view: 'M', edit: 'M' }, tasks: { edit: 'M', delete: 'M' } });
    const phone = `+99890${Math.floor(1e6 + Math.random() * 8e6)}`;
    const nm = uniq('SEC');
    const a = await newLead(A, { name: nm + '-a', phone });
    const b = await newLead(A, { name: nm + '-b', phone });
    // dublikat guruhlari va tekshiruv: boshqaning bitimlari ko'rinmaydi
    const g = await ok('GET', '/crm/leads-duplicates?by=phone', undefined, U1.token, 200);
    assert.ok(!JSON.stringify(g).includes(nm), "dublikatlar ro'yxatida boshqaning bitimi");
    const gAdmin = await ok('GET', '/crm/leads-duplicates?by=phone', undefined, A, 200);
    assert.ok(JSON.stringify(gAdmin).includes(nm), 'administrator dublikatni ko\'rmadi');
    const chk = await ok('GET', `/crm/leads-check?phone=${encodeURIComponent(phone)}`, undefined, U1.token, 200);
    assert.equal(chk.duplicates.length, 0, 'leads-check boshqaning bitimini qaytardi');
    // o'chirilgan vazifalar
    const t = (await ok('POST', `/crm/leads/${a.id}/tasks`, { title: nm + '-task', assigneeId: U2.id, dueDate: new Date(Date.now() + 3600e3).toISOString() }, A)).task;
    await ok('DELETE', `/crm/tasks/${t.id}`, undefined, A, 200);
    assert.ok(!JSON.stringify(await ok('GET', '/crm/tasks-deleted', undefined, U1.token, 200)).includes(nm), "o'chirilgan vazifalar ro'yxatida boshqaning vazifasi");
    assert.equal((await req('POST', `/crm/tasks-deleted/${t.id}/restore`, {}, U1.token)).status, 403);
    // Salesbot
    assert.equal((await req('GET', `/crm/leads/${a.id}/salesbot-runs`, undefined, U1.token)).status, 403);
    assert.equal((await req('POST', `/crm/leads/${a.id}/salesbot-stop`, {}, U1.token)).status, 403);
    assert.equal((await req('POST', `/crm/salesbots/x/run`, { leadId: a.id }, U1.token)).status, 403);
    // voqealar ro'yxati
    const ev = await ok('GET', '/crm/analytics/events?limit=300', undefined, U1.token, 200);
    assert.ok(!JSON.stringify(ev).includes(nm), "voqealar ro'yxatida boshqaning bitimi");
    assert.ok(JSON.stringify(await ok('GET', '/crm/analytics/events?limit=300', undefined, A, 200)).includes(nm), "administrator voqealarni ko'rmadi");
    await setRights({});
  });
});
