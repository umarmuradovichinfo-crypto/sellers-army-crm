import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';
import {
  PERMISSION_KEYS,
  ROLE_DEFS,
} from '../src/common/constants/permissions';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // 1) Ruxsatlar
  for (const key of PERMISSION_KEYS) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key },
    });
  }
  const perms = await prisma.permission.findMany();
  const permId = new Map(perms.map((p) => [p.key, p.id]));

  // 2) Rollar + ruxsatlar
  for (const def of ROLE_DEFS) {
    const role = await prisma.role.upsert({
      where: { key: def.key },
      update: { name: def.name, isSystem: def.isSystem },
      create: { key: def.key, name: def.name, isSystem: def.isSystem },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: def.permissions.map((pk) => ({
        roleId: role.id,
        permissionId: permId.get(pk)!,
      })),
      skipDuplicates: true,
    });
  }

  // 3) Super admin foydalanuvchi — FAQAT SEED_ADMIN_EMAIL va SEED_ADMIN_PASSWORD ikkalasi berilgan bo'lsa.
  // Aks holda foydalanuvchi yaratilmaydi: birinchi ochilganda frontend "Birinchi sozlash" ekranini ko'rsatadi.
  const email = process.env.SEED_ADMIN_EMAIL?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  let adminStatus: 'created' | 'exists' | 'skipped' = 'skipped';
  if (email && password) {
    if (password.length < 8) {
      throw new Error("SEED_ADMIN_PASSWORD kamida 8 belgi bo'lishi kerak");
    }
    const superRole = await prisma.role.findUniqueOrThrow({
      where: { key: 'super_admin' },
    });
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      adminStatus = 'exists';
    } else {
      await prisma.user.create({
        data: {
          name: process.env.SEED_ADMIN_NAME || 'Admin',
          email,
          passwordHash: await bcrypt.hash(password, 10),
          roleId: superRole.id,
        },
      });
      adminStatus = 'created';
    }
  }

  // 4) Standart voronka bosqichlari (migratsiya kiritgan bo'lishi kerak; bo'sh bo'lsa to'ldiramiz)
  if ((await prisma.crmStage.count({ where: { pipelineId: null } })) === 0) {
    const defs: [string, string, string, string][] = [
      ['new', 'Yangi lid', '#3F77DD', 'open'],
      ['contact', "Aloqa o'rnatildi", '#D9952E', 'open'],
      ['offer', 'Taklif yuborildi', '#9b59b6', 'open'],
      ['payment', "To'lov kutilmoqda", '#E6A33C', 'open'],
      ['won', 'Sotuv yopildi', '#46B17B', 'won'],
      ['lost', "Yo'qotilgan", '#8B8E84', 'lost'],
    ];
    for (const [i, [key, name, color, kind]] of defs.entries()) {
      await prisma.crmStage.upsert({
        where: { key },
        update: {},
        create: { key, name, color, kind, order: i, isSystem: true },
      });
    }
  }

  console.log('✓ Seed tayyor.');
  if (adminStatus === 'created') {
    console.log(`  Super admin yaratildi: ${email} (parol SEED_ADMIN_PASSWORD dan)`);
  } else if (adminStatus === 'exists') {
    console.log(`  Super admin allaqachon mavjud: ${email} (parol o'zgartirilmadi)`);
  } else {
    console.log("  Super admin yaratilmadi (SEED_ADMIN_* berilmagan): birinchi ochilganda 'Birinchi sozlash' ekrani chiqadi.");
  }
  console.log('  Rollar:', ROLE_DEFS.map((r) => r.key).join(', '));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
