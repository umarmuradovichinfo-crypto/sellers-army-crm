import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export type ActivityType =
  | 'created'
  | 'updated'
  | 'stage'
  | 'note'
  | 'task_created'
  | 'task_done'
  | 'call'
  | 'field'
  | 'won'
  | 'lost'
  | 'assignee'
  | 'tag'
  | 'automation'
  | 'email';

/**
 * Lid faoliyat tarixi (timeline + audit log).
 * Har bir muhim o'zgarish shu yerga yoziladi va lid drawerda xronologik ko'rsatiladi.
 */
@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    leadId: string | null,
    type: ActivityType,
    opts: { actorId?: string | null; actorName?: string | null; text?: string; data?: Record<string, unknown> } = {},
  ) {
    try {
      await this.prisma.activity.create({
        data: {
          leadId: leadId || null,
          type,
          actorId: opts.actorId || null,
          actorName: opts.actorName || null,
          text: opts.text || null,
          dataJson: JSON.stringify(opts.data || {}),
        },
      });
      if (leadId) {
        await this.prisma.lead.update({ where: { id: leadId }, data: { lastActivityAt: new Date() } }).catch(() => {});
      }
    } catch {
      /* audit yozuvi asosiy oqimni buzmasligi kerak */
    }
  }

  async listForLead(leadId: string, take = 100) {
    const rows = await this.prisma.activity.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows.map((a) => ({
      id: a.id,
      type: a.type,
      actorName: a.actorName,
      text: a.text,
      data: safeParse(a.dataJson),
      at: a.createdAt.toISOString(),
    }));
  }
}

function safeParse(s: string): Record<string, unknown> {
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}
