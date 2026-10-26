// Qurilma konfiguratori: generator formatlari va endpoint (MAC, liniya, SIP paroli).
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { generateDeviceConfig, normMac } from '../../dist/pbx/configurator.js';
import { req, ok, admin, userWithRole } from './lib.mjs';

const lines = [{ ext: '100', name: 'Ali', password: 'pw100' }, { ext: '101', name: 'Vali', password: 'pw101' }];
let T;
before(async () => { T = await admin(); });

describe('Konfigurator', () => {
  test('Yealink: har liniya account.N.* qatorlari, fayl nomi MAC bo`yicha', () => {
    const f = generateDeviceConfig('yealink', '00:15:65:AA:BB:CC', lines, 'pbx.example.uz');
    assert.equal(f.filename, '001565aabbcc.cfg');
    assert.match(f.content, /account\.1\.user_name = 100/);
    assert.match(f.content, /account\.2\.password = pw101/);
    assert.match(f.content, /account\.1\.sip_server\.1\.address = pbx\.example\.uz/);
  });
  test('Panasonic, Cisco, PhonerLite formatlari', () => {
    assert.match(generateDeviceConfig('panasonic600', '001565AABBCC', lines, 'h').content, /SIP_URI_1="100@h"[\s\S]*SIP_PASS_2="pw101"/);
    const c = generateDeviceConfig('cisco', '00-15-65-aa-bb-cc', lines, 'h');
    assert.equal(c.filename, 'spa001565aabbcc.cfg');
    assert.match(c.content, /<User_ID_1_>100<\/User_ID_1_>/);
    assert.match(generateDeviceConfig('phonerlite', '', lines, 'h').content, /Username=100/);
  });
  test('maxsus belgilar (qo`shtirnoq, qator uzilishi) konfiguratsiyani buzmaydi', () => {
    const f = generateDeviceConfig('panasonic500', 'aabbccddeeff', [{ ext: '1"0\n0', name: 'A"B', password: 'p"w' }], 'h');
    assert.equal(f.content.split('\n').filter(Boolean).every((l) => (l.match(/"/g) || []).length === 2), true);
  });
  test('normMac', () => assert.equal(normMac('00:15-65:AA:bb:CC'), '001565aabbcc'));

  test('endpoint: foydalanuvchi moduli + SIP paroli bilan fayl; noto`g`ri MAC/qurilma/raqam 400', async () => {
    const u = await userWithRole('sotuvchi');
    const mod = (await ok('POST', '/pbx/modules', { type: 'user', number: '9301', name: 'Cfg Ali', config: { crmUserId: u.id } }, T, 201)).module;
    const bare = (await ok('POST', '/pbx/modules', { type: 'user', number: '9302', name: 'Parolsiz' }, T, 201)).module;
    const r = await ok('POST', '/pbx/configurator', { device: 'yealink', mac: '00:15:65:AA:BB:CC', lines: [{ ext: '9301' }] }, T, [200, 201]);
    assert.equal(r.filename, '001565aabbcc.cfg');
    assert.match(r.content, /account\.1\.user_name = 9301/);
    assert.match(r.content, /account\.1\.password = \S{6,}/);
    assert.equal((await req('POST', '/pbx/configurator', { device: 'yealink', mac: 'zz', lines: [{ ext: '9301' }] }, T)).status, 400);
    assert.equal((await req('POST', '/pbx/configurator', { device: 'yoq', mac: '001565aabbcc', lines: [{ ext: '9301' }] }, T)).status, 400);
    assert.equal((await req('POST', '/pbx/configurator', { device: 'yealink', mac: '001565aabbcc', lines: [{ ext: '0000' }] }, T)).status, 400);
    assert.equal((await req('POST', '/pbx/configurator', { device: 'yealink', mac: '001565aabbcc', lines: [{ ext: '9302' }] }, T)).status, 400, 'CRM foydalanuvchisiz liniya parolsiz fayl bermasligi kerak');
    assert.equal((await req('POST', '/pbx/configurator', { device: 'yealink', mac: '001565aabbcc', lines: [] }, T)).status, 400);
    const S = await userWithRole('sotuvchi');
    assert.equal((await req('POST', '/pbx/configurator', { device: 'yealink', mac: '001565aabbcc', lines: [{ ext: '9301' }] }, S.token)).status, 403);
    for (const m of [mod, bare]) await ok('DELETE', `/pbx/modules/${m.id}`, undefined, T, 200);
  });
});
