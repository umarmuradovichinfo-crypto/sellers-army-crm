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
