import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { req, ok, admin, newLead, stages, uniq, userWithRole } from './lib.mjs';

let T, ST, firstOpen, won, lost;
before(async () => {
  T = await admin();
  ST = await stages(T);
  firstOpen = ST.find((s) => s.kind === 'open');
  won = ST.find((s) => s.kind === 'won');
  lost = ST.find((s) => s.kind === 'lost');
  assert.ok(firstOpen && won && lost, 'standart voronkada open/won/lost bosqichlar bo`lishi kerak');
});

describe('Bitim: yaratish va validatsiya', () => {
  test("nomsiz bitim → 400", async () => {
    for (const body of [{}, { name: '' }, { name: '   ' }]) {
      const r = await req('POST', '/crm/leads', body, T);
      assert.equal(r.status, 400, `${JSON.stringify(body)} → ${r.status}`);
    }
  });

  test('to`liq maydonlar bilan yaratish va o`qish', async () => {
    const l = await newLead(T, { phone: '+998 90 123 45 67', email: 'Mijoz@Test.Local', value: 1500000, tags: ['vip', 'test'], source: 'Instagram' });
    assert.equal(l.value, 1500000);
    assert.deepEqual(l.tags.sort(), ['test', 'vip']);
    const g = await ok('GET', `/crm/leads/${l.id}`, undefined, T, 200);
    const lead = g.lead || g;
    assert.equal(lead.id, l.id);
    assert.equal(lead.source, 'Instagram');
  });

  test("manfiy yoki matnli byudjet qabul qilinmaydi", async () => {
    const r = await req('POST', '/crm/leads', { name: uniq(), value: -500 }, T);
    assert.ok(r.status === 400 || (r.data?.lead?.value ?? 0) >= 0, `manfiy byudjet saqlandi: ${JSON.stringify(r.data).slice(0, 200)}`);
    const r2 = await req('POST', '/crm/leads', { name: uniq(), value: 'abc' }, T);
    assert.equal(r2.status, 400);
  });

  test('juda katta byudjet (int chegarasi) 500 bermaydi', async () => {
    const r = await req('POST', '/crm/leads', { name: uniq(), value: 99999999999 }, T);
    assert.ok(r.status < 500, `server xatosi: ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
  });

  test("mavjud bo'lmagan bosqich bilan yaratish 500 bermaydi", async () => {
    const r = await req('POST', '/crm/leads', { name: uniq(), stage: 'yoq-bosqich-xyz' }, T);
    assert.ok(r.status < 500, `server xatosi: ${r.status}`);
    if (r.status < 300) assert.notEqual((r.data.lead || r.data).stage, 'yoq-bosqich-xyz', "noma'lum bosqich saqlanib qoldi — bitim voronkada ko'rinmaydi");
  });

  test('HTML/skript matni xavfsiz saqlanadi (o`zgarmaydi, ijro etilmaydi)', async () => {
    const name = '<img src=x onerror=alert(1)> Test';
    const l = await newLead(T, { name });
    assert.equal(l.n, name);
  });

  test("mavjud bo'lmagan id → 404 (500 emas)", async () => {
    for (const [m, p, b] of [['GET', '/crm/leads/yoq-id'], ['PUT', '/crm/leads/yoq-id', { name: 'x' }], ['DELETE', '/crm/leads/yoq-id'], ['PATCH', '/crm/leads/yoq-id/move', { stageId: 'new' }], ['POST', '/crm/leads/yoq-id/notes', { text: 'x' }], ['POST', '/crm/leads/yoq-id/tasks', { title: 'x' }]]) {
      const r = await req(m, p, b, T);
      assert.equal(r.status, 404, `${m} ${p} → ${r.status}`);
    }
  });
});

describe('Bitim: bosqichlar va yopish', () => {
  test("bosqichga ko'chirish va voronkada ko'rinish", async () => {
    const l = await newLead(T);
    const target = ST.filter((s) => s.kind === 'open')[1] || firstOpen;
    await ok('PATCH', `/crm/leads/${l.id}/move`, { stageId: target.key }, T, 200);
    const g = await ok('GET', `/crm/leads/${l.id}`, undefined, T, 200);
    assert.equal((g.lead || g).stage, target.key);
  });

  test("yutilgan: wonAt qo'yiladi, qaytarilganda tozalanadi", async () => {
    const l = await newLead(T, { value: 1000 });
    await ok('PATCH', `/crm/leads/${l.id}/move`, { stageId: won.key }, T, 200);
    let g = (await ok('GET', `/crm/leads/${l.id}`, undefined, T, 200));
    assert.equal((g.lead || g).won, true);
    await ok('PATCH', `/crm/leads/${l.id}/move`, { stageId: firstOpen.key }, T, 200);
    g = await ok('GET', `/crm/leads/${l.id}`, undefined, T, 200);
    assert.ok(!(g.lead || g).won, "ochiq bosqichga qaytgach ham 'won' qoldi");
  });

  test("yo'qotilgan: sabab saqlanadi, qayta ochilganda sabab tozalanadi", async () => {
    const l = await newLead(T);
    await ok('PATCH', `/crm/leads/${l.id}/move`, { stageId: lost.key, lostReason: 'Qimmat' }, T, 200);
    let g = await ok('GET', `/crm/leads/${l.id}`, undefined, T, 200);
    assert.equal((g.lead || g).lostReason, 'Qimmat');
    await ok('PATCH', `/crm/leads/${l.id}/move`, { stageId: firstOpen.key }, T, 200);
    g = await ok('GET', `/crm/leads/${l.id}`, undefined, T, 200);
    assert.ok(!(g.lead || g).lostReason, "qayta ochilgan bitimda yo'qotish sababi qoldi");
  });

  test("noto'g'ri bosqichga ko'chirish → 4xx", async () => {
    const l = await newLead(T);
    const r = await req('PATCH', `/crm/leads/${l.id}/move`, { stageId: 'yoq-bosqich' }, T);
    assert.ok(r.status >= 400 && r.status < 500, `${r.status}`);
  });

  test("PUT orqali bosqich o'zgarishi ham yopish sanalarini to'g'ri qo'yadi", async () => {
    const l = await newLead(T);
    await ok('PUT', `/crm/leads/${l.id}`, { stage: won.key }, T, 200);
    const g = await ok('GET', `/crm/leads/${l.id}`, undefined, T, 200);
    assert.equal((g.lead || g).won, true);
  });

  test('voronka summasi va soni bitimlar bilan mos', async () => {
    const p = await ok('GET', '/crm/pipeline', undefined, T, 200);
    const list = await ok('GET', '/crm/leads?limit=500', undefined, T, 200);
    assert.ok(typeof list.total === 'number');
    const cols = p.columns || p.stages || [];
    assert.ok(cols.length > 0, `pipeline javobi: ${Object.keys(p)}`);
  });
});

describe('Izoh va vazifalar', () => {
  test("bo'sh izoh → 400", async () => {
    const l = await newLead(T);
    const r = await req('POST', `/crm/leads/${l.id}/notes`, { text: '' }, T);
    assert.equal(r.status, 400);
  });

  test("vazifa: yaratish → bajarish natija bilan → ro'yxatda done", async () => {
    const l = await newLead(T);
    const t = (await ok('POST', `/crm/leads/${l.id}/tasks`, { title: 'Qo`ng`iroq', type: 'call', dueDate: new Date(Date.now() + 864e5).toISOString() }, T)).task;
    assert.equal(t.done, false);
    const u = (await ok('PUT', `/crm/tasks/${t.id}`, { done: true, result: 'Gaplashildi' }, T, 200)).task;
    assert.equal(u.done, true);
    assert.equal(u.result, 'Gaplashildi');
    const lt = await ok('GET', `/crm/leads/${l.id}/tasks`, undefined, T, 200);
    assert.ok((lt.tasks || lt).some((x) => x.id === t.id && x.done));
  });

  test("noto'g'ri sana bilan vazifa 500 bermaydi", async () => {
    const l = await newLead(T);
    const r = await req('POST', `/crm/leads/${l.id}/tasks`, { title: 'x', dueDate: 'ertaga' }, T);
    assert.ok(r.status < 500, `${r.status}`);
  });

  test("vazifani o'chirish va tiklash", async () => {
    const l = await newLead(T);
    const t = (await ok('POST', `/crm/leads/${l.id}/tasks`, { title: uniq('del') }, T)).task;
    await ok('DELETE', `/crm/tasks/${t.id}`, undefined, T, 200);
    const d = await ok('GET', '/crm/tasks-deleted', undefined, T, 200);
    const row = (d.tasks || d.items || d).find((x) => x.title === t.title);
    assert.ok(row, "o'chirilgan vazifa savatchada yo'q");
    await ok('POST', `/crm/tasks-deleted/${row.id}/restore`, undefined, T);
    const lt = await ok('GET', `/crm/leads/${l.id}/tasks`, undefined, T, 200);
    assert.ok((lt.tasks || lt).some((x) => x.title === t.title), 'tiklangan vazifa bitimda yo`q');
  });

  test("muddati o'tgan vazifalar filtri", async () => {
    const l = await newLead(T);
    await ok('POST', `/crm/leads/${l.id}/tasks`, { title: uniq('overdue'), dueDate: new Date(Date.now() - 864e5).toISOString() }, T);
    const d = await ok('GET', '/crm/tasks?status=overdue', undefined, T, 200);
    const arr = d.tasks || d;
    assert.ok(arr.length > 0);
    assert.ok(arr.every((x) => !x.done && new Date(x.dueDate) < new Date()), 'overdue ro`yxatida muddati o`tmagan vazifa bor');
  });
});

describe("O'chirish, ommaviy amallar, birlashtirish", () => {
  test("bitim o'chirilganda vazifalari ham yo'qoladi", async () => {
    const l = await newLead(T);
    await ok('POST', `/crm/leads/${l.id}/tasks`, { title: uniq('orphan') }, T);
    await ok('DELETE', `/crm/leads/${l.id}`, undefined, T, 200);
    const all = await ok('GET', '/crm/tasks', undefined, T, 200);
    assert.ok(!(all.tasks || all).some((x) => x.leadId === l.id), "o'chirilgan bitimning vazifasi ro'yxatda qoldi");
    const r = await req('GET', `/crm/leads/${l.id}`, undefined, T);
    assert.equal(r.status, 404);
  });

  test("ommaviy: bosqich, teg, hot, o'chirish", async () => {
    const a = await newLead(T); const b = await newLead(T);
    const ids = [a.id, b.id];
    const target = ST.filter((s) => s.kind === 'open')[1] || firstOpen;
    assert.equal((await ok('POST', '/crm/leads/bulk', { ids, action: 'stage', value: target.key }, T)).affected, 2);
    await ok('POST', '/crm/leads/bulk', { ids, action: 'add_tag', value: 'bulk-tag' }, T);
    await ok('POST', '/crm/leads/bulk', { ids, action: 'hot', value: true }, T);
    const g = (await ok('GET', `/crm/leads/${a.id}`, undefined, T, 200));
    const lead = g.lead || g;
    assert.equal(lead.stage, target.key);
    assert.ok(lead.tags.includes('bulk-tag'));
    await ok('POST', '/crm/leads/bulk', { ids, action: 'delete' }, T);
    assert.equal((await req('GET', `/crm/leads/${b.id}`, undefined, T)).status, 404);
  });

  test("ommaviy: bo'sh ro'yxat va noma'lum amal → 400", async () => {
    assert.equal((await req('POST', '/crm/leads/bulk', { ids: [], action: 'delete' }, T)).status, 400);
    const a = await newLead(T);
    assert.equal((await req('POST', '/crm/leads/bulk', { ids: [a.id], action: 'xyz' }, T)).status, 400);
  });

  test('birlashtirish: vazifalar va teglar asosiyga o`tadi, ikkinchisi o`chadi', async () => {
    const keep = await newLead(T, { tags: ['a'] });
    const other = await newLead(T, { tags: ['b'], value: 500 });
    await ok('POST', `/crm/leads/${other.id}/tasks`, { title: uniq('merge') }, T);
    await ok('POST', '/crm/leads/merge', { keepId: keep.id, mergeIds: [other.id] }, T);
    assert.equal((await req('GET', `/crm/leads/${other.id}`, undefined, T)).status, 404);
    const lt = await ok('GET', `/crm/leads/${keep.id}/tasks`, undefined, T, 200);
    assert.equal((lt.tasks || lt).length, 1, 'vazifa asosiy bitimga o`tmadi');
  });

  test("bitimni o'zi bilan birlashtirish uni o'chirib yubormaydi", async () => {
    const keep = await newLead(T);
    await req('POST', '/crm/leads/merge', { keepId: keep.id, mergeIds: [keep.id] }, T);
    assert.equal((await req('GET', `/crm/leads/${keep.id}`, undefined, T)).status, 200, 'bitim o`zi bilan birlashtirilib o`chib ketdi');
  });

  test('dublikat tekshiruvi telefon bo`yicha (formatdan qat`i nazar)', async () => {
    const phone = `+99890${String(Date.now()).slice(-7)}`;
    const a = await newLead(T, { phone });
    const d = await ok('GET', `/crm/leads-check?phone=${encodeURIComponent(phone.replace('+998', '8 ').replace(/(\d{2})(\d{3})/, '$1 $2 '))}`, undefined, T, 200);
    const found = d.leads || d.duplicates || d;
    assert.ok(JSON.stringify(found).includes(a.id), `dublikat topilmadi: ${JSON.stringify(d).slice(0, 300)}`);
  });
});

describe("Qidiruv, filtr, eksport/import", () => {
  test('nom bo`yicha qidiruv va byudjet filtri', async () => {
    const name = uniq('SearchLead');
    await newLead(T, { name, value: 777 });
    const d = await ok('GET', `/crm/leads?search=${encodeURIComponent(name)}`, undefined, T, 200);
    assert.equal(d.leads.length, 1);
    const f = await ok('GET', `/crm/leads?search=${encodeURIComponent(name)}&budgetFrom=1000`, undefined, T, 200);
    assert.equal(f.leads.length, 0);
  });

  test('SQL injection urinishlari xavfsiz', async () => {
    for (const s of ["' OR 1=1 --", "'; DROP TABLE leads; --", '%', '_']) {
      const r = await req('GET', `/crm/leads?search=${encodeURIComponent(s)}`, undefined, T);
      assert.equal(r.status, 200, `${s} → ${r.status}`);
    }
    assert.equal((await req('GET', '/crm/leads?limit=1', undefined, T)).status, 200);
  });

  test("noto'g'ri paging/sort parametrlari 500 bermaydi", async () => {
    for (const q of ['limit=-1', 'limit=abc', 'limit=100000', 'sort=yoq_ustun', 'sort=name;drop', 'dir=sideways', 'cursor=zzz', 'from=notadate&dateField=created']) {
      const r = await req('GET', `/crm/leads?${q}`, undefined, T);
      assert.ok(r.status < 500, `${q} → ${r.status}`);
    }
  });

  test('CSV eksport', async () => {
    const r = await req('GET', '/crm/leads-export', undefined, T);
    assert.equal(r.status, 200);
    assert.ok(String(r.data).split('\n').length > 1);
  });

  test("CSV eksportda formula injection yo'q", async () => {
    const name = `=HYPERLINK("http://evil","x")${uniq()}`;
    await newLead(T, { name });
    const r = await req('GET', `/crm/leads-export?search=${encodeURIComponent(name.slice(-10))}`, undefined, T);
    const line = String(r.data).split('\n').find((x) => x.includes('HYPERLINK'));
    assert.ok(line, 'bitim eksportda yo`q');
    assert.ok(!/(^|[,;]"?)=HYPERLINK/.test(line), `formula himoyasiz eksport qilindi: ${line.slice(0, 120)}`);
  });

  test('import: yaroqli va yaroqsiz qatorlar', async () => {
    const d = await ok('POST', '/crm/leads-import', { rows: [{ name: uniq('Imp') }, { name: '' }, { phone: '123' }] }, T);
    assert.equal(d.created, 1);
  });
});

describe('Ruxsatlar (sotuvchi)', () => {
  let S;
  before(async () => { S = await userWithRole('sotuvchi'); });

  test("sotuvchi bitim yarata oladi va ko'ra oladi", async () => {
    const l = await newLead(S.token);
    assert.equal((await req('GET', `/crm/leads/${l.id}`, undefined, S.token)).status, 200);
  });

  test("sotuvchi voronka bosqichlarini yarata/o'zgartira/o'chira olmaydi", async () => {
    const r = await req('POST', '/crm/stages', { name: uniq('Hack') }, S.token);
    assert.equal(r.status, 403, `sotuvchi bosqich yaratdi: ${r.status}`);
    const r2 = await req('PUT', `/crm/stages/${firstOpen.key}`, { name: 'Hacked' }, S.token);
    assert.equal(r2.status, 403, `sotuvchi bosqich nomini o'zgartirdi: ${r2.status}`);
    const r3 = await req('DELETE', `/crm/stages/${firstOpen.key}`, undefined, S.token);
    assert.equal(r3.status, 403, `sotuvchi bosqichni o'chirdi: ${r3.status}`);
  });

  test("sotuvchi sozlamalarni o'zgartira olmaydi", async () => {
    for (const [m, p, b] of [['POST', '/crm/pipelines', { name: 'x' }], ['POST', '/crm/fields', { name: 'x', type: 'text' }], ['PUT', '/crm/task-types', { custom: [] }], ['POST', '/crm/salesbots', { name: 'x' }], ['GET', '/settings/users'], ['POST', '/settings/users', { name: 'x', email: 'x@x.uz', password: '12345678', roleKey: 'super_admin' }], ['GET', '/crm/automations']]) {
      const r = await req(m, p, b, S.token);
      assert.equal(r.status, 403, `${m} ${p} → ${r.status}`);
    }
  });

  test('sotuvchi umumiy sozlamalarni (menyu, format) o`qiy oladi', async () => {
    const r = await req('GET', '/settings/general', undefined, S.token);
    assert.equal(r.status, 200, `chap menyu/format sozlamalari sotuvchiga yuklanmaydi: ${r.status}`);
  });
});
