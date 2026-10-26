import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RightsService } from '../common/rights/rights.service';

/** Sotuv rejasi / maqsadlar — oylik, hodim yoki jamoa bo'yicha + bajarilish. */
@Injectable()
export class GoalsService {
  constructor(private readonly prisma: PrismaService, private readonly rights: RightsService) {}

  async list(period?: string, userId?: string) {
    if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new BadRequestException({ error: 'INVALID_PERIOD', message: 'Davr YYYY-MM ko\'rinishida bo\'lishi kerak' });
    // hisob vaqt mintaqasi Toshkent (UTC+5): oy chegarasi server (UTC) vaqtiga emas
    const TZ = 5 * 3_600_000;
    const p = period || new Date(Date.now() + TZ).toISOString().slice(0, 7);
    const [goals, users, stages] = await Promise.all([
      this.prisma.salesGoal.findMany({ where: { period: p } }),
      this.prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      this.prisma.crmStage.findMany({ where: { kind: 'won' }, select: { key: true } }),
    ]);
    const wonKeys = stages.map((s) => s.key);
    // shu oyda yutilgan lidlar (wonAt period ichida)
    const [yy, mm] = p.split('-').map(Number);
    const start = new Date(Date.UTC(yy, mm - 1, 1) - TZ);
    const end = new Date(Date.UTC(yy, mm, 1) - TZ);
    // amoCRM «Права доступа»: faqat ko'rish huquqi bor bitimlar hisobga olinadi (boshqalarning tushumi ko'rinmasin)
    const own = await this.rights.ownersById(userId, 'leads', 'view');
    const wonLeads = await this.prisma.lead.findMany({
      where: { stage: { in: wonKeys.length ? wonKeys : ['__none__'] }, wonAt: { gte: start, lt: end }, ...(own ? { assigneeId: { in: own.length ? own : ['__none__'] } } : {}) },
      select: { assigneeId: true, value: true },
    });
    const revByUser = new Map<string, number>();
    const cntByUser = new Map<string, number>();
    let teamRev = 0, teamCnt = 0;
    for (const l of wonLeads) {
      const k = l.assigneeId || '—';
      revByUser.set(k, (revByUser.get(k) || 0) + l.value);
      cntByUser.set(k, (cntByUser.get(k) || 0) + 1);
      teamRev += l.value; teamCnt += 1;
    }
    const nameById = new Map(users.map((u) => [u.id, u.name]));
    const rows = goals.map((g) => {
      const actual = g.userId
        ? (g.metric === 'count' ? cntByUser.get(g.userId) || 0 : revByUser.get(g.userId) || 0)
        : (g.metric === 'count' ? teamCnt : teamRev);
      return {
        id: g.id,
        userId: g.userId,
        name: g.userId ? nameById.get(g.userId) || g.userId : 'Butun jamoa',
        period: g.period,
        metric: g.metric,
        target: g.target,
        actual,
        pct: g.target ? Math.round((actual / g.target) * 100) : 0,
      };
    });
    return { period: p, goals: rows, members: users };
  }

  async upsert(dto: { userId?: string; period: string; metric?: string; target: number }) {
    const userId = dto.userId || null;
    const metric = dto.metric || 'revenue';
    const period = dto.period;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(period || ''))) throw new BadRequestException({ error: 'INVALID_PERIOD', message: 'Davr YYYY-MM ko\'rinishida bo\'lishi kerak' });
    if (!['revenue', 'count'].includes(metric)) throw new BadRequestException({ error: 'INVALID_METRIC', message: 'metric: revenue yoki count' });
    const tgt = Number(dto.target);
    if (!Number.isFinite(tgt) || tgt < 0 || tgt > 2000000000) throw new BadRequestException({ error: 'INVALID_TARGET', message: 'Maqsad 0 dan 2 000 000 000 gacha son bo\'lishi kerak' });
    dto.target = Math.round(tgt);
    if (userId && !(await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) throw new NotFoundException({ error: 'USER_NOT_FOUND', message: 'Foydalanuvchi topilmadi' });
    const existing = await this.prisma.salesGoal.findFirst({ where: { userId, period, metric } });
    const goal = existing
      ? await this.prisma.salesGoal.update({ where: { id: existing.id }, data: { target: Number(dto.target) || 0 } })
      : await this.prisma.salesGoal.create({ data: { userId, period, metric, target: Number(dto.target) || 0 } });
    return { goal };
  }

  async remove(id: string) {
    const g = await this.prisma.salesGoal.findUnique({ where: { id } });
    if (!g) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Maqsad topilmadi' });
    await this.prisma.salesGoal.delete({ where: { id } });
    return { ok: true };
  }
}
