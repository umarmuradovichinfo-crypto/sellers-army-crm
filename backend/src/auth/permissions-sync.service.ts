import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

import { PERMISSION_KEYS } from '../common/constants/permissions';
import { PrismaService } from '../prisma/prisma.service';

/**
 * super_admin'ga HAR DOIM berilishi kerak bo'lgan ruxsatlar.
 *
 * MUHIM: bu YERGA faqat "doim ko'rinsin" deb qaror qilingan bo'limlar qo'shiladi.
 * Qolgan bo'limlar ataylab yashirilgan (fokus rejimi) — ularga TEGILMAYDI, ya'ni
 * bu servis ularni avtomatik ochib yubormaydi.
 */
const ALWAYS_GRANT_SUPER_ADMIN: string[] = [];

/**
 * Ruxsat katalogini ilova ishga tushganda sinxronlaydi.
 *
 * Nega kerak: deploy faqat `prisma migrate deploy` ishlatadi — seed ISHLAMAYDI.
 * Shuning uchun kodga yangi ruxsat (masalan `tasks.view`) qo'shilsa ham, prod
 * DB'dagi `permissions` jadvali eskirib qoladi va Sozlamalardagi rol matritsasida
 * u umuman ko'rinmaydi (yoqib bo'lmaydi).
 *
 * Bu servis har boot'da:
 *  1) PERMISSION_KEYS dagi har bir kalitni upsert qiladi (katalog to'liq bo'ladi);
 *  2) ALWAYS_GRANT_SUPER_ADMIN dagi ruxsatlarni super_admin'ga qo'shadi (faqat
 *     qo'shadi — hech narsa o'chirmaydi). Boshqa ruxsatlarga TEGMAYDI, shuning
 *     uchun fokus uchun yashirilgan bo'limlar yashirinligicha qoladi.
 */
@Injectable()
export class PermissionsSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionsSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    try {
      await this.sync();
    } catch (e) {
      // Sinxronizatsiya xatosi ilovani to'xtatmasligi kerak — faqat log qilamiz.
      this.logger.error('Ruxsat sinxronizatsiyasi muvaffaqiyatsiz', e as Error);
    }
  }

  private async sync() {
    // 1) Katalogni to'ldirish (yangi kalitlar Sozlamalar matritsasida paydo bo'lsin)
    for (const key of PERMISSION_KEYS) {
      await this.prisma.permission.upsert({
        where: { key },
        update: {},
        create: { key },
      });
    }

    if (ALWAYS_GRANT_SUPER_ADMIN.length === 0) return;

    // 2) super_admin'ga majburiy ruxsatlarni berish (faqat yetishmayotganini)
    const role = await this.prisma.role.findUnique({
      where: { key: 'super_admin' },
      include: { permissions: { select: { permission: { select: { key: true } } } } },
    });
    if (!role) {
      this.logger.warn("'super_admin' roli topilmadi — ruxsat bog'lash o'tkazib yuborildi");
      return;
    }

    const have = new Set(role.permissions.map((p) => p.permission.key));
    const wanted = ALWAYS_GRANT_SUPER_ADMIN.filter((k) => !have.has(k));
    if (wanted.length === 0) {
      this.logger.log('super_admin majburiy ruxsatlarga ega — o`zgarish yo`q');
      return;
    }

    const perms = await this.prisma.permission.findMany({
      where: { key: { in: wanted } },
      select: { id: true },
    });
    await this.prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
    this.logger.log(`super_admin roliga qo'shildi: ${wanted.join(', ')}`);
  }
}
