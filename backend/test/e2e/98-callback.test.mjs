// Sayt «Callback» vidjeti: sozlama, skript, so'rov → lid + vazifa, validatsiya, tezlik cheklovi.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { req, ok, admin, userWithRole, uniq } from './lib.mjs';

let T;
const base = process.env.E2E_BASE;
const post = (key, body) => fetch(`${base}/callback/${key}/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
before(async () => { T = await admin(); });
after(async () => { await ok('PUT', '/pbx/callback', { enabled: false }, T, 200); });

describe('Callback vidjeti', () => {
  test("sozlama faqat administratorga; o'chiq vidjet skripti 404; yoqilgach kalit beriladi va o'zgarmaydi", async () => {
    const S = await userWithRole('sotuvchi');
    assert.equal((await req('GET', '/pbx/callback', undefined, S.token)).status, 403);
    const off = await ok('GET', '/pbx/callback', undefined, T, 200);
    assert.equal(off.enabled, false);
    const on = await ok('PUT', '/pbx/callback', { enabled: true, title: 'Qo`ng`iroq buyurtma', color: '#118833', ext: '' }, T, 200);
    assert.ok(on.key && on.key.length >= 8);
    const again = await ok('PUT', '/pbx/callback', { title: 'Boshqa nom' }, T, 200);
    assert.equal(again.key, on.key, 'kalit o`zgarmasligi kerak');
    assert.equal((await req('PUT', '/pbx/callback', { color: 'qizil' }, T)).status, 400);
    const js = await fetch(`${base}/callback/${on.key}/widget.js`);
    assert.equal(js.status, 200);
    const code = await js.text();
    assert.ok(code.includes(on.key));
    assert.doesNotThrow(() => new Function(code), 'vidjet skriptida sintaksis xatosi');
    assert.equal((await fetch(`${base}/callback/yoqkalit123/widget.js`)).status, 404);
  });

  test("so'rov: noto'g'ri raqam 400; to'g'ri raqam lid va vazifa yaratadi", async () => {
    const cfg = await ok('GET', '/pbx/callback', undefined, T, 200);
    assert.equal((await post(cfg.key, { name: 'x', phone: '12' })).status, 400);
    const n = String(900000000 + Math.floor(Math.random() * 99999999));
    const name = uniq('CbMijoz');
    const r = await post(cfg.key, { name, phone: `+998${n}` });
    const j = await r.json();
    assert.equal(r.status, 201, JSON.stringify(j));
    assert.equal(j.ok, true);
    assert.equal(j.task, true);
    // lid «Saralanmagan»da yoki voronkada: ismi bo'yicha qidiramiz
    const found = await ok('GET', `/crm/leads?search=${encodeURIComponent(name)}&limit=5`, undefined, T, 200);
    const unsorted = await ok('GET', `/crm/unsorted?search=${encodeURIComponent(name)}`, undefined, T, 200);
    const lead = [...(found.leads || []), ...(unsorted.leads || [])].find((l) => String(l.n || l.name) === name);
    assert.ok(lead, `callback lidi topilmadi: ${JSON.stringify(found).slice(0, 200)}`);
    const tasks = await ok('GET', `/crm/leads/${lead.id}/tasks`, undefined, T, 200);
    assert.ok((tasks.tasks || []).some((t) => /Qayta qo'ng'iroq qiling/.test(t.title)), 'qayta qo`ng`iroq vazifasi yaratilmadi');
  });

  test("tezlik cheklovi (IP bo'yicha daqiqada 5 ta) va o'chirilgach 404", async () => {
    const cfg = await ok('GET', '/pbx/callback', undefined, T, 200);
    const codes = [];
    for (let i = 0; i < 7; i++) codes.push((await post(cfg.key, { name: 'Tez', phone: `+99890${String(1000000 + i)}` })).status);
    assert.ok(codes.includes(429), `cheklov ishlamadi: ${codes}`);
    await ok('PUT', '/pbx/callback', { enabled: false }, T, 200);
    assert.equal((await fetch(`${base}/callback/${cfg.key}/widget.js`)).status, 404, 'o`chirilgan vidjet skripti berilmasligi kerak');
  });
});
