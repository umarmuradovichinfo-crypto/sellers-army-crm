import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { req, ok, admin, uniq, newLead, stages } from './lib.mjs';

let T;
before(async () => { T = await admin(); });

describe('Voronkalar', () => {
  test("yangi voronka standart bosqichlari bilan yaratiladi (open/won/lost)", async () => {
    const p = (await ok('POST', '/crm/pipelines', { name: uniq('Voronka') }, T)).pipeline;
    const st = (await stages(T)).filter((s) => s.pipelineId === p.id);
    assert.deepEqual(st.map((s) => s.kind).sort(), ['lost', 'open', 'won']);
  });

  test("bitim yangi voronkaga bosqichsiz yaratilsa — shu voronkaning birinchi bosqichiga tushadi", async () => {
    const p = (await ok('POST', '/crm/pipelines', { name: uniq('V') }, T)).pipeline;
    const l = await newLead(T, { pipelineId: p.id });
    const st = (await stages(T)).find((s) => s.key === l.stage);
    assert.equal(st.pipelineId, p.id, `bitim boshqa voronka bosqichiga tushdi: ${l.stage}`);
    const pv = await ok('GET', `/crm/pipeline?pipelineId=${p.id}`, undefined, T, 200);
    assert.ok(JSON.stringify(pv).includes(l.id), "bitim o'z voronkasida ko'rinmaydi");
  });

  test("bitimi bor voronkani o'chirib bo'lmaydi; bo'shini o'chirsa bosqichlari ham ketadi", async () => {
    const p = (await ok('POST', '/crm/pipelines', { name: uniq('Del') }, T)).pipeline;
    const l = await newLead(T, { pipelineId: p.id });
    const r = await req('DELETE', `/crm/pipelines/${p.id}`, undefined, T);
    assert.equal(r.status, 400);
    await ok('DELETE', `/crm/leads/${l.id}`, undefined, T, 200);
    await ok('DELETE', `/crm/pipelines/${p.id}`, undefined, T, 200);
    const left = (await stages(T)).filter((s) => s.pipelineId === p.id);
    assert.equal(left.length, 0);
    const main = (await stages(T)).filter((s) => !s.pipelineId);
    assert.equal(main.filter((s) => s.kind === 'won').length, 1, "asosiy voronkada bir nechta 'yutildi' bosqichi paydo bo'ldi");
  });

  test('nomsiz voronka → 400, mavjud bo`lmagani → 404', async () => {
    assert.equal((await req('POST', '/crm/pipelines', { name: ' ' }, T)).status, 400);
    assert.equal((await req('PUT', '/crm/pipelines/yoq', { name: 'x' }, T)).status, 404);
    assert.equal((await req('DELETE', '/crm/pipelines/yoq', undefined, T)).status, 404);
  });

  test('arxivlangan voronka ro`yxatda alohida', async () => {
    const p = (await ok('POST', '/crm/pipelines', { name: uniq('Arx') }, T)).pipeline;
    await ok('PUT', `/crm/pipelines/${p.id}`, { archived: true }, T, 200);
    const d = await ok('GET', '/crm/pipelines', undefined, T, 200);
    const all = JSON.stringify(d);
    assert.ok(all.includes(p.id));
  });
});

describe('Bosqichlar', () => {
  test("bosqich turi faqat open/won/lost", async () => {
    assert.equal((await req('POST', '/crm/stages', { name: uniq('S'), kind: 'banana' }, T)).status, 400);
  });

  test("bosqich o'chirilganda bitimlari yo'qolmaydi", async () => {
    const s = (await ok('POST', '/crm/stages', { name: uniq('Tmp'), kind: 'open' }, T)).stage;
    const l = await newLead(T, { stage: s.key });
    await ok('DELETE', `/crm/stages/${s.key}`, undefined, T, 200);
    const g = await ok('GET', `/crm/leads/${l.id}`, undefined, T, 200);
    const lead = g.lead || g;
    const exists = (await stages(T)).some((x) => x.key === lead.stage);
    assert.ok(exists, `bitim mavjud bo'lmagan bosqichda qoldi: ${lead.stage}`);
  });

  test("tizim bosqichini o'chirib bo'lmaydi", async () => {
    const sys = (await stages(T)).find((s) => s.isSystem);
    assert.equal((await req('DELETE', `/crm/stages/${sys.key}`, undefined, T)).status, 400);
  });
});

describe("Maxsus maydonlar va majburiy maydonlar", () => {
  test("ro'yxat turidagi maydon variantsiz → 400; noma'lum tur → 400", async () => {
    assert.equal((await req('POST', '/crm/fields', { label: uniq('F'), type: 'select', options: [] }, T)).status, 400);
    assert.equal((await req('POST', '/crm/fields', { label: uniq('F'), type: 'xyz' }, T)).status, 400);
  });

  test("bosqich uchun majburiy maydon to'ldirilmasa o'tkazilmaydi, to'ldirilsa o'tadi", async () => {
    const st = (await stages(T)).filter((s) => !s.pipelineId && s.kind === 'open');
    const target = st[st.length - 1];
    const f = (await ok('POST', '/crm/fields', { label: uniq('Shartnoma'), type: 'text', entity: 'lead' }, T)).field;
    await ok('PUT', `/crm/fields/${f.id}`, { requiredStages: [target.key] }, T, 200);
    const l = await newLead(T);
    const r = await req('PATCH', `/crm/leads/${l.id}/move`, { stageId: target.key }, T);
    assert.equal(r.status, 400, `majburiy maydonsiz o'tkazildi: ${r.status}`);
    const rb = await req('POST', '/crm/leads/bulk', { ids: [l.id], action: 'stage', value: target.key }, T);
    const g1 = await ok('GET', `/crm/leads/${l.id}`, undefined, T, 200);
    assert.notEqual((g1.lead || g1).stage, target.key, `ommaviy amal majburiy maydonni chetlab o'tdi (${rb.status})`);
    await ok('PUT', `/crm/leads/${l.id}`, { custom: { [f.key]: 'SH-1' } }, T, 200);
    await ok('PATCH', `/crm/leads/${l.id}/move`, { stageId: target.key }, T, 200);
    await ok('DELETE', `/crm/fields/${f.id}`, undefined, T, 200);
  });
});

describe('Teglar', () => {
  test('teglarni birlashtirish bitimlardagi teglarni almashtiradi', async () => {
    const a = uniq('tagA'), b = uniq('tagB');
    const l = await newLead(T, { tags: [a] });
    const ta = (await ok('POST', '/crm/tags', { name: a }, T)).tag;
    const tb = (await ok('POST', '/crm/tags', { name: b }, T)).tag;
    await ok('POST', '/crm/tags/merge', { ids: [ta.id], into: tb.id, fromIds: [ta.id], intoId: tb.id }, T);
    const g = await ok('GET', `/crm/leads/${l.id}`, undefined, T, 200);
    const tags = (g.lead || g).tags;
    assert.ok(tags.includes(b) && !tags.includes(a), `teglar: ${tags}`);
  });

  test("teg o'chirilganda bitimlardan ham olinadi", async () => {
    const a = uniq('tagDel');
    const l = await newLead(T, { tags: [a] });
    const ta = (await ok('POST', '/crm/tags', { name: a }, T)).tag;
    await ok('DELETE', `/crm/tags/${ta.id}`, undefined, T, 200);
    const g = await ok('GET', `/crm/leads/${l.id}`, undefined, T, 200);
    assert.ok(!(g.lead || g).tags.includes(a));
  });

  test("teglar qulflanganda sotuvchi yangi teg qo'sha olmaydi", async () => {
    const { userWithRole } = await import('./lib.mjs');
    const S = await userWithRole('sotuvchi');
    await ok('PUT', '/crm/tags-settings', { locked: true }, T, 200);
    try {
      const r = await req('POST', '/crm/leads', { name: uniq(), tags: [uniq('yangi')] }, S.token);
      assert.ok(r.status >= 400 && r.status < 500, `qulf ishlamadi: ${r.status}`);
    } finally {
      await ok('PUT', '/crm/tags-settings', { locked: false }, T, 200);
    }
  });
});

describe("Yo'qotish sabablari va vazifa turlari", () => {
  test("sabab yaratish/o'chirish", async () => {
    const r = (await ok('POST', '/crm/lost-reasons', { name: uniq('Sabab') }, T)).reason;
    await ok('DELETE', `/crm/lost-reasons/${r.id}`, undefined, T, 200);
    assert.equal((await req('POST', '/crm/lost-reasons', { name: '' }, T)).status, 400);
  });

  test("vazifa turlari: noto'g'ri formatdagi ma'lumot 500 bermaydi", async () => {
    for (const body of [{ custom: 'abc' }, { custom: [{}] }, { custom: [{ key: '../x', name: 1 }] }, {}]) {
      const r = await req('PUT', '/crm/task-types', body, T);
      assert.ok(r.status < 500, `${JSON.stringify(body)} → ${r.status}`);
    }
  });
});
