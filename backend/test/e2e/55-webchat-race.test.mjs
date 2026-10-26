// Onlayn chat: yangi mehmonning bir vaqtda kelgan xabarlari bitta bitim yaratadi (IP limiti 60-chat sinovlaridan oldin).
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ok, admin, uniq } from './lib.mjs';

let T;
before(async () => { T = await admin(); });

describe('Onlayn chat poygasi', () => {
  test('onlayn chat: yangi mehmonning bir vaqtda kelgan xabarlari bitta bitim yaratadi', async () => {
    const saved = await ok('PUT', '/crm/chat-settings', { webChats: [{ id: 'wq2', name: 'Poyga sayti', greeting: 'Salom' }] }, T, 200);
    const w = saved.webChats[0];
    const base = process.env.E2E_BASE;
    const vid = 'vis' + Math.random().toString(36).slice(2, 12);
    const name = uniq('Poyga');
    const send = (text) => fetch(`${base}/webchat/${w.key}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitorId: vid, name, text }) });
    const rs = await Promise.all(['bir', 'ikki', 'uch', 'tort'].map(send));
    assert.ok(rs.every((r) => r.status === 201), rs.map((r) => r.status).join());
    const convs = (await ok('GET', '/crm/conversations', undefined, T, 200)).conversations.filter((c) => c.name === name);
    assert.equal(convs.length, 1, `bir mehmon uchun ${convs.length} ta bitim yaratildi`);
  });
});
