// «Rahbar» qulfi: ikki nusxa bir bazaga ulansa fon vazifalari faqat bittasida ishlaydi; rahbar o'chsa ikkinchisi egallaydi.
import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaService } from '../../dist/prisma/prisma.service.js';
import { LeaderService } from '../../dist/common/leader.service.js';

const cfg = { getOrThrow: () => process.env.DATABASE_URL };
const prisma = new PrismaService(cfg);
await prisma.$connect();
after(async () => { await prisma.$disconnect(); });

describe('Rahbar qulfi (ikki nusxa)', () => {
  test('bittasi rahbar, ikkinchisi emas; guard faqat rahbarda ishlaydi', async () => {
    await prisma.appSetting.deleteMany({ where: { key: 'leader_lease' } });
    const a = new LeaderService(prisma);
    const b = new LeaderService(prisma);
    // Shu bazaga ulangan haqiqiy e2e server ham (fon taymerlari) ijaraga da'vo qilishi mumkin — shuning uchun «aynan a» emas,
    // «ikkalasi bir vaqtda emas» deb tekshiramiz.
    const la = await a.isLeader();
    const lb = await b.isLeader();
    assert.ok(!(la && lb), 'ikki nusxa bir vaqtda rahbar bo\'ldi');
    let ranA = 0, ranB = 0;
    await a.guard(() => { ranA++; });
    await b.guard(() => { ranB++; });
    assert.deepEqual([ranA, ranB], [la ? 1 : 0, lb ? 1 : 0]);
    a.last = 0; b.last = 0;
    assert.ok(!((await a.isLeader()) && (await b.isLeader())), 'yangilashda ikkalasi rahbar bo\'lib qoldi');
  });

  test('rahbar o`chsa (ijara muddati o`tsa) ikkinchi nusxa egallaydi, eski rahbar qaytib tortib ololmaydi', async () => {
    const a = new LeaderService(prisma);
    const b = new LeaderService(prisma);
    await prisma.appSetting.deleteMany({ where: { key: 'leader_lease' } });
    assert.equal(await a.isLeader(), true);
    // A «o'ldi»: ijara muddati o'tib ketgan deb belgilaymiz
    await prisma.$executeRawUnsafe(`UPDATE app_settings SET value = json_build_object('owner', value::json->>'owner', 'until', 1)::text WHERE key = 'leader_lease'`);
    b.last = 0;
    assert.equal(await b.isLeader(), true, 'ikkinchi nusxa rahbarlikni egallamadi');
    a.last = 0;
    assert.equal(await a.isLeader(), false, 'eski rahbar yangi rahbarning ijarasini tortib oldi');
  });
});
