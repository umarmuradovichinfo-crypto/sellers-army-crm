import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/** Sotuv rejasi / maqsadlar — oylik, hodim yoki jamoa bo'yicha + bajarilish. */
@Injectable()
export class GoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(period?: string) {
    const p = period || new Date().toISOString().slice(0, 7);
    const [goals, users, stages] = await Promise.all([
      this.prisma.salesGoal.findMany({ where: { period: p } }),
      this.prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      this.prisma.crmStage.findMany({ where: { kind: 'won' }, select: { key: true } }),
    ]);
    const wonKeys = stages.map((s) => s.key);
    // shu oyda yutilgan lidlar (wonAt period ichida)
    const start = new Date(p + '-01T00:00:00');
    const end = new Date(start); end.setMonth(end.getMonth() + 1);
    const wonLeads = await this.prisma.lead.findMany({
      where: { stage: { in: wonKeys.length ? wonKeys : ['__none__'] }, wonAt: { gte: start, lt: end } },
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
    const existing = await this.prisma.salesGoal.findFirst({ where: { userId, period, metric } });
    const goal = existing
      ? await this.prisma.salesGoal.update({ where: { id: existing.id }, data: { target: Number(dto.target) || 0 } })
      : await this.prisma.salesGoal.create({ data: { userId, period, metric, target: Number(dto.target) || 0 } });
    return { goal };
  }

  async remove(id: string) {
    await this.prisma.salesGoal.delete({ where: { id } });
    return { ok: true };
  }
}
