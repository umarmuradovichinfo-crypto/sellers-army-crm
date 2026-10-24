import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

export const IP_WHITELIST_KEY = 'ip_whitelist';

/** So'rov IP manzili: Railway kabi proksi orqasida X-Forwarded-For'ning eng o'ngdagi (proksi qo'shgan) qiymati. */
export function clientIp(req: { ip?: string; headers?: Record<string, unknown>; socket?: { remoteAddress?: string } }): string {
  const xf = String(req?.headers?.['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  const raw = xf.length ? xf[xf.length - 1] : req?.ip || req?.socket?.remoteAddress || '';
  return raw.replace(/^::ffff:/, '');
}

/**
 * Sozlamalar → Xavfsizlik → "IP manzillar oq ro'yxati" (amoCRM "Белый список IP-адресов"):
 * ro'yxat bo'sh bo'lmasa, himoyalangan API'ga faqat shu IP'lardan kirish mumkin. Ochiq yo'llar (webhook, health) tegilmaydi.
 */
@Injectable()
export class IpWhitelistGuard implements CanActivate {
  private static cache: { at: number; ips: string[] } | null = null;
  static invalidate() { IpWhitelistGuard.cache = null; }

  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  private async list(): Promise<string[]> {
    const c = IpWhitelistGuard.cache;
    if (c && Date.now() - c.at < 30000) return c.ips;
    let ips: string[] = [];
    try {
      const row = await this.prisma.appSetting.findUnique({ where: { key: IP_WHITELIST_KEY } });
      const v = JSON.parse(row?.value || '{}');
      ips = Array.isArray(v.ips) ? v.ips.map(String) : [];
    } catch { /* jadval yo'q/buzuq — cheklov yo'q */ }
    IpWhitelistGuard.cache = { at: Date.now(), ips };
    return ips;
  }

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const ips = await this.list();
    if (!ips.length) return true;
    const ip = clientIp(context.switchToHttp().getRequest());
    if (ips.includes(ip)) return true;
    throw new ForbiddenException({ error: 'IP_BLOCKED', message: `Bu IP manzildan (${ip}) kirish taqiqlangan` });
  }
}
