// amoCRM «Чат с <hamkasb>»: bitim ichidagi ichki xabar — lentada (activity team_chat), oluvchiga bildirishnoma.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { req, ok, admin, newLead, userWithRole } from './lib.mjs';

describe('Ichki chat (amoCRM «Чат с …»)', () => {
  test("xabar lentaga yoziladi va oluvchiga bildirishnoma boradi", async () => {
    const A = await admin();
    const S = await userWithRole('sotuvchi');
    const l = await newLead(A, { assigneeId: S.id });
    await ok('POST', `/crm/leads/${l.id}/team-chat`, { toUserId: S.id, text: 'Shartnomani yuboring' }, A);
    const lead = await ok('GET', `/crm/leads/${l.id}`, undefined, A, 200);
    const act = ((lead.lead || lead).activity || []).find((a) => a.type === 'team_chat');
    assert.ok(act && act.text === 'Shartnomani yuboring' && act.data?.toId === S.id && act.actorId, JSON.stringify(act));
    const n = await ok('GET', '/notifications', undefined, S.token, 200);
    assert.ok(n.items.some((x) => x.type === 'mention' && x.text.includes('Shartnomani yuboring')), "oluvchiga bildirishnoma kelmadi");
    assert.equal((await req('POST', `/crm/leads/${l.id}/team-chat`, { toUserId: 'yoq', text: 'x' }, A)).status, 400);
    assert.equal((await req('POST', `/crm/leads/${l.id}/team-chat`, { toUserId: S.id, text: '  ' }, A)).status, 400);
  });
});

describe('Dono (amoCRM «Агент внутри продукта»)', () => {
  test("ma'lumot: oxirgi 7 kun ishlangan bitimlar, token sarfi va kunlar ro'yxati qaytadi", async () => {
    const r = await ok('GET', '/crm/dono', undefined, await admin(), 200);
    assert.equal(typeof r.processed7, 'number');
    assert.ok(r.tokens7 && typeof r.tokens7.input === 'number' && typeof r.tokens7.output === 'number', JSON.stringify(r));
    assert.ok(Array.isArray(r.days));
  });
});

describe('Обращения: suhbatni avtomatik yopish', () => {
  test("sozlama saqlanadi, noto'g'ri qiymat qabul qilinmaydi, yangi suhbatlar yopilmaydi", async () => {
    const A = await admin();
    let c = await ok('PUT', '/crm/chat-settings', { autoCloseHours: 24 }, A, 200);
    assert.equal(c.autoCloseHours, 24);
    c = await ok('PUT', '/crm/chat-settings', { autoCloseHours: 5 }, A, 200);
    assert.equal(c.autoCloseHours, 24, "ruxsat etilmagan qiymat qabul qilindi");
    const before = (await ok('GET', '/crm/conversations', undefined, A, 200)).conversations.filter((x) => !x.closed).length;
    const r = await ok('POST', '/crm/chat-settings/auto-close-run', {}, A);
    assert.equal(typeof r.closed, 'number');
    const after = (await ok('GET', '/crm/conversations', undefined, A, 200)).conversations.filter((x) => !x.closed).length;
    assert.equal(after, before - r.closed);
    await ok('PUT', '/crm/chat-settings', { autoCloseHours: 0 }, A, 200);
    assert.equal((await ok('POST', '/crm/chat-settings/auto-close-run', {}, A)).closed, 0);
  });
});
