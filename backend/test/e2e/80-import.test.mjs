// amoCRM «Импорт из таблицы»: bitimlar importi — izoh («Примечание») ustuni, «Создание» huquqi.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { req, ok, admin, uniq } from './lib.mjs';

describe('Import (amoCRM)', () => {
  test("bitim importida «Примечание» bitimga izoh bo'lib tushadi", async () => {
    const A = await admin();
    const name = uniq('Imp');
    const r = await ok('POST', '/crm/import/leads', { rows: [{ _row: 2, name, phone: `+99890${Math.floor(1e6 + Math.random() * 8e6)}`, note: 'Import izohi' }], options: {} }, A);
    assert.equal(r.created, 1, JSON.stringify(r));
    const list = await ok('GET', `/crm/leads?search=${encodeURIComponent(name)}`, undefined, A, 200);
    const id = (list.leads || list.items)[0].id;
    const lead = await ok('GET', `/crm/leads/${id}`, undefined, A, 200);
    const notes = (lead.lead || lead).notes || [];
    assert.ok(notes.some((n) => n.text === 'Import izohi'), JSON.stringify(notes));
  });

  test("«Создание: Запрещено» bo'lsa import taqiqlanadi", async () => {
    const A = await admin();
    const roleKey = (await ok('POST', '/settings/roles', { name: uniq('ImpRole') }, A)).role.key;
    await ok('PATCH', '/settings/access', { roleKey, permission: 'crm.view', allowed: true }, A, 200);
    await ok('PUT', `/settings/roles/${roleKey}/rights`, { rights: { leads: { add: 'D' } } }, A, 200);
    const email = `${uniq('imp')}@test.local`;
    await ok('POST', '/settings/users', { name: 'Imp', email, password: 'qa-test-Passw0rd!', roleKey }, A);
    const tok = (await req('POST', '/auth/login', { email, password: 'qa-test-Passw0rd!' })).data.token;
    assert.equal((await req('POST', '/crm/import/leads', { rows: [{ _row: 2, name: 'X' }], options: {} }, tok)).status, 403);
  });
});
