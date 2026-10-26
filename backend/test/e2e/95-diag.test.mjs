// Diagnostika regressiyalari: bitimga kontakt/kompaniya biriktirish tekshiruvi, birlashtirish yaxlitligi.
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { req, ok, admin, newLead, uniq, stages } from './lib.mjs';

let T;
before(async () => { T = await admin(); });

describe('Diagnostika', () => {
  test('bitimga mavjud bo`lmagan kontakt/kompaniya biriktirib bo`lmaydi (500 emas, 404)', async () => {
    const l = await newLead(T);
    assert.equal((await req('PUT', `/crm/leads/${l.id}`, { contactId: 'yoq-kontakt' }, T)).status, 404);
    assert.equal((await req('PUT', `/crm/leads/${l.id}`, { companyId: 'yoq-kompaniya' }, T)).status, 404);
    const c = (await ok('POST', '/crm/contacts', { name: uniq('Kontakt') }, T)).contact;
    await ok('PUT', `/crm/leads/${l.id}`, { contactId: c.id }, T, 200);
    const back = await ok('GET', `/crm/leads/${l.id}`, undefined, T, 200);
    assert.equal((back.lead || back).contactId || (back.lead || back).contact?.id, c.id);
    // olib tashlash (bo'sh) tekshiruvsiz ishlaydi
    await ok('PUT', `/crm/leads/${l.id}`, { contactId: null }, T, 200);
  });

  test('birlashtirish: bir nechta bitim + vazifalar tranzaksiyada, o`chirilganlar yo`qoladi', async () => {
    const keep = await newLead(T);
    const o1 = await newLead(T);
    const o2 = await newLead(T);
    await ok('POST', `/crm/leads/${o1.id}/tasks`, { title: uniq('m1') }, T);
    await ok('POST', `/crm/leads/${o2.id}/tasks`, { title: uniq('m2') }, T);
    await ok('POST', '/crm/leads/merge', { keepId: keep.id, mergeIds: [o1.id, o2.id] }, T);
    for (const id of [o1.id, o2.id]) assert.equal((await req('GET', `/crm/leads/${id}`, undefined, T)).status, 404);
    const lt = await ok('GET', `/crm/leads/${keep.id}/tasks`, undefined, T, 200);
    assert.equal((lt.tasks || lt).length, 2);
  });

  test('bosqich turini o`zgartirish: oxirgi yutuq/yo`qotish bosqichi turini almashtirib bo`lmaydi, bitimlar sanasi yangilanadi', async () => {
    const p = (await ok('POST', '/crm/pipelines', { name: uniq('TurV'), stages: [{ name: 'A', kind: 'open' }, { name: 'B', kind: 'open' }, { name: 'W', kind: 'won' }, { name: 'L', kind: 'lost' }] }, T)).pipeline;
    const ST = (await stages(T)).filter((x) => x.pipelineId === p.id);
    const won = ST.find((x) => x.kind === 'won');
    const open = ST.find((x) => x.kind === 'open');
    assert.ok(won && open, 'voronka bosqichlari topilmadi');
    // oxirgi yutuq bosqichini ochiqqa aylantirib bo'lmaydi
    assert.equal((await req('PUT', `/crm/stages/${won.key}`, { kind: 'open' }, T)).status, 400);
    // ochiq bosqichni yutuqqa aylantirsa — undagi bitim yutilgan sanasini oladi
    const l = await newLead(T, { stage: open.key, pipelineId: p.id });
    await ok('PUT', `/crm/stages/${open.key}`, { kind: 'won' }, T, 200);
    const got = await ok('GET', `/crm/leads/${l.id}`, undefined, T, 200);
    assert.equal((got.lead || got).won, true, `bitim yutilgan deb belgilanmadi`);
  });
});
