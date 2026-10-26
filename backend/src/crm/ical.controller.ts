import { randomBytes } from 'crypto';

import { Controller, Get, Header, NotFoundException, Param, Post } from '@nestjs/common';

import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

const KEY = 'ical_tokens'; // { userId: token }

// iCal matnida maxsus belgilarni ekranlash (RFC 5545)
const esc = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * Vazifalar → "Синхронизировать": har foydalanuvchiga maxfiy iCal havola (Google/Apple/Outlook kalendariga obuna).
 * Havola faqat o'sha foydalanuvchining tugallanmagan vazifalarini beradi; "yangilash" eski havolani bekor qiladi.
 */
@Controller('crm')
export class IcalController {
  constructor(private readonly prisma: PrismaService) {}

  private async tokens(): Promise<Record<string, string>> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: KEY } });
    try { const v = JSON.parse(row?.value || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
  }
  private async saveTokens(v: Record<string, string>) {
    const value = JSON.stringify(v);
    await this.prisma.appSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  }

  @Get('ical-link')
  async link(@CurrentUser() user: AuthUser) {
    const all = await this.tokens();
    if (!all[user.id]) { all[user.id] = randomBytes(24).toString('hex'); await this.saveTokens(all); }
    return { path: `/api/v1/crm/ical/${all[user.id]}.ics` };
  }

  @Post('ical-link/reset')
  async reset(@CurrentUser() user: AuthUser) {
    const all = await this.tokens();
    all[user.id] = randomBytes(24).toString('hex');
    await this.saveTokens(all);
    return { path: `/api/v1/crm/ical/${all[user.id]}.ics` };
  }

  @Public()
  @Get('ical/:file')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  async feed(@Param('file') file: string) {
    const token = String(file || '').replace(/\.ics$/, '');
    if (!/^[a-f0-9]{48}$/.test(token)) throw new NotFoundException();
    const all = await this.tokens();
    const userId = Object.keys(all).find((k) => all[k] === token);
    if (!userId) throw new NotFoundException();
    const tasks = await this.prisma.leadTask.findMany({
      where: { assigneeId: userId, done: false, dueDate: { not: null } },
      include: { lead: { select: { name: true } } }, orderBy: { dueDate: 'asc' }, take: 1000,
    });
    const now = stamp(new Date());
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sellers Army CRM//Vazifalar//UZ', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:CRM vazifalar'];
    for (const t of tasks) {
      const start = t.dueDate as Date;
      const end = new Date(start.getTime() + 30 * 60000);
      lines.push('BEGIN:VEVENT', `UID:${t.id}@sellers-army-crm`, `DTSTAMP:${now}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
        `SUMMARY:${esc(t.title)}`, `DESCRIPTION:${esc(t.lead?.name ? `Bitim: ${t.lead.name}` : '')}`, 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }
}
