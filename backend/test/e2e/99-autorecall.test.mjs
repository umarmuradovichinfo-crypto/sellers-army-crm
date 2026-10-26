// Avto-qayta qo'ng'iroq: tanlash mantiqi (sof funksiya) va sozlama API.
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { pickRecalls, DEFAULT_RECALL } from '../../dist/pbx/autorecall.service.js';
import { req, ok, admin } from './lib.mjs';

const MIN = 60_000;
// 2026-10-26 12:00 Toshkent = 07:00 UTC
const NOON = Date.UTC(2026, 9, 26, 7, 0, 0);
const cfg = { ...DEFAULT_RECALL, enabled: true, ext: '100', delayMin: 5, attempts: 2, retryMin: 15, fromHour: 9, toHour: 20 };

describe('Avto-qayta qo`ng`iroq mantiqi', () => {
  test('kechikish o`tgach chaqiriladi; hali o`tmagan — yo`q', () => {
    const m = [{ id: 'a', phone: '998901112233', at: NOON - 6 * MIN }];
    assert.deepEqual(pickRecalls(m, [], {}, cfg, NOON).map((x) => x.id), ['a']);
    assert.deepEqual(pickRecalls([{ ...m[0], at: NOON - 2 * MIN }], [], {}, cfg, NOON), []);
  });

  test('ish vaqtidan tashqarida (Toshkent) chaqirilmaydi', () => {
    const night = Date.UTC(2026, 9, 26, 20, 0, 0); // 01:00 Toshkent
    assert.deepEqual(pickRecalls([{ id: 'a', phone: '1', at: night - 30 * MIN }], [], {}, cfg, night), []);
    const early = Date.UTC(2026, 9, 26, 3, 30, 0); // 08:30 Toshkent
    assert.deepEqual(pickRecalls([{ id: 'a', phone: '1', at: early - 30 * MIN }], [], {}, cfg, early), []);
  });

  test('allaqachon qayta qo`ng`iroq qilingan raqamga — yo`q; boshqa raqamga ta`sir qilmaydi', () => {
    const m = [{ id: 'a', phone: '998901112233', at: NOON - 20 * MIN }, { id: 'b', phone: '998909998877', at: NOON - 20 * MIN }];
    const outs = [{ phone: '998901112233', at: NOON - 10 * MIN }];
    assert.deepEqual(pickRecalls(m, outs, {}, cfg, NOON).map((x) => x.id), ['b']);
    // qo'ng'iroqdan OLDINGI chiquvchi hisobga olinmaydi
    assert.deepEqual(pickRecalls([m[0]], [{ phone: '998901112233', at: NOON - 30 * MIN }], {}, cfg, NOON).map((x) => x.id), ['a']);
  });

  test('urinishlar: oraliq (retry) kutiladi va limitdan keyin to`xtaydi', () => {
    const m = [{ id: 'a', phone: '998901112233', at: NOON - 60 * MIN }];
    assert.deepEqual(pickRecalls(m, [], { a: { n: 1, last: NOON - 5 * MIN } }, cfg, NOON), [], 'oraliq o`tmagan');
    assert.deepEqual(pickRecalls(m, [], { a: { n: 1, last: NOON - 20 * MIN } }, cfg, NOON).map((x) => x.id), ['a']);
    assert.deepEqual(pickRecalls(m, [], { a: { n: 2, last: NOON - 120 * MIN } }, cfg, NOON), [], 'urinishlar tugagan');
  });

  test('bir raqamdan bir nechta o`tkazib yuborilgan — faqat bitta urinish; juda eski — yo`q', () => {
    const m = [{ id: 'a', phone: '1', at: NOON - 60 * MIN }, { id: 'b', phone: '1', at: NOON - 30 * MIN }, { id: 'old', phone: '2', at: NOON - 30 * 3_600_000 }];
    assert.deepEqual(pickRecalls(m, [], {}, cfg, NOON).map((x) => x.id), ['b']);
  });
});

describe('Avto-qayta qo`ng`iroq sozlamasi', () => {
  test('standart o`chiq; yoqish uchun ichki raqam shart; noto`g`ri qiymatlar 400', async () => {
    const T = await admin();
    const c = await ok('GET', '/pbx/autorecall', undefined, T, 200);
    assert.equal(c.enabled, false);
    assert.equal((await req('PUT', '/pbx/autorecall', { enabled: true }, T)).status, 400, 'raqamsiz yoqib bo`lmaydi');
    assert.equal((await req('PUT', '/pbx/autorecall', { delayMin: 0 }, T)).status, 400);
    assert.equal((await req('PUT', '/pbx/autorecall', { fromHour: 20, toHour: 10 }, T)).status, 400);
    const on = await ok('PUT', '/pbx/autorecall', { enabled: true, ext: '100', attempts: 3 }, T, 200);
    assert.equal(on.enabled, true);
    assert.equal(on.attempts, 3);
    await ok('PUT', '/pbx/autorecall', { enabled: false }, T, 200);
  });
});
