import { ForbiddenException } from '@nestjs/common';

import type { AuthUser } from '../common/decorators/current-user.decorator';
import type { PrismaService } from '../prisma/prisma.service';

// amoCRM «Запретить пользователям создавать новые теги» (Управление тегами)
export const TAGS_LOCK_KEY = 'tags_locked';

export async function tagsLocked(prisma: PrismaService): Promise<boolean> {
  const row = await prisma.appSetting.findUnique({ where: { key: TAGS_LOCK_KEY } });
  return row?.value === '1';
}

/** Taqiq yoqilgan bo'lsa, sozlamalar huquqi yo'q foydalanuvchi faqat katalogdagi (yoki allaqachon qo'yilgan) teglarni qo'ya oladi. */
export async function assertNewTagsAllowed(prisma: PrismaService, names: string[], user?: AuthUser, keep: string[] = []) {
  if (!user || user.permissions?.includes('crm.settings')) return;
  const list = [...new Set(names.map((n) => String(n || '').trim()).filter((n) => n && !keep.includes(n)))];
  if (!list.length || !(await tagsLocked(prisma))) return;
  const known = new Set((await prisma.crmTag.findMany({ where: { name: { in: list } }, select: { name: true } })).map((t) => t.name));
  const fresh = list.filter((n) => !known.has(n));
  if (fresh.length) throw new ForbiddenException({ error: 'TAGS_LOCKED', message: `Yangi teg yaratish taqiqlangan: ${fresh.join(', ')}` });
}
