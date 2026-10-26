import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { assertSafeWebhookUrl, webhookUrlProblem } from './webhook-guard';

export type ActivityType =
  | 'created'
  | 'updated'
  | 'stage'
  | 'note'
  | 'team_chat'
  | 'link'
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
        const ev = ActivityService.EVENT_OF[type];
        if (ev) void this.hook(ev, { leadId, type, text: opts.text || null, actor: opts.actorName || null, data: opts.data || {} });
      }
    } catch {
      /* audit yozuvi asosiy oqimni buzmasligi kerak */
    }
  }

  // ── Account Web hooks (amoCRM Market → "WEB HOOKS"): hodisada sozlangan URL'larga JSON POST ──
  static readonly EVENTS = ['add_lead', 'update_lead', 'status_lead', 'delete_lead', 'note_lead', 'add_task'] as const;
  private static readonly EVENT_OF: Partial<Record<ActivityType, string>> = {
    created: 'add_lead', stage: 'status_lead', won: 'status_lead', lost: 'status_lead',
    updated: 'update_lead', field: 'update_lead', assignee: 'update_lead', tag: 'update_lead',
    note: 'note_lead', task_created: 'add_task',
  };
  private static readonly KEY = 'account_webhooks';
  private hooksCache: { at: number; list: { id: string; url: string; events: string[]; active: boolean }[] } | null = null;

  async getWebhooks() {
    const row = await this.prisma.appSetting.findUnique({ where: { key: ActivityService.KEY } });
    let list: any[] = [];
    try { const v = JSON.parse(row?.value || '[]'); list = Array.isArray(v) ? v : []; } catch { /* */ }
    return { webhooks: list, events: ActivityService.EVENTS };
  }
  async saveWebhooks(body: { webhooks?: unknown }) {
    const raw = Array.isArray(body?.webhooks) ? body.webhooks : [];
    const list = raw.slice(0, 20).map((x: any, i: number) => {
      const url = String(x?.url || '').trim().slice(0, 500);
      const pr = webhookUrlProblem(url);
      if (pr) throw new Error(`${url || '—'}: ${pr}`);
      return { id: String(x?.id || `wh${Date.now()}${i}`).slice(0, 40), url, active: x?.active !== false,
        events: (Array.isArray(x?.events) ? x.events : []).filter((e: string) => (ActivityService.EVENTS as readonly string[]).includes(e)) };
    }).filter((x) => x.events.length);
    const value = JSON.stringify(list);
    await this.prisma.appSetting.upsert({ where: { key: ActivityService.KEY }, update: { value }, create: { key: ActivityService.KEY, value } });
    this.hooksCache = null;
    return { webhooks: list, events: ActivityService.EVENTS };
  }
  /** Hodisani obunachilarga yuborish (fon rejimida, xato asosiy oqimga ta'sir qilmaydi). */
  async hook(event: string, payload: Record<string, unknown>) {
    try {
      if (!this.hooksCache || Date.now() - this.hooksCache.at > 30000) this.hooksCache = { at: Date.now(), list: (await this.getWebhooks()).webhooks };
      const subs = this.hooksCache.list.filter((h) => h.active !== false && h.events.includes(event));
      for (const h of subs) {
        try {
          const u = await assertSafeWebhookUrl(h.url);
          const ctrl = new AbortController();
          const to = setTimeout(() => ctrl.abort(), 5000);
          await fetch(u, { method: 'POST', redirect: 'manual', signal: ctrl.signal, headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ event, at: new Date().toISOString(), ...payload }) }).catch(() => {});
          clearTimeout(to);
        } catch { /* xavfsiz bo'lmagan yoki javobsiz URL — o'tkazib yuboriladi */ }
      }
    } catch { /* */ }
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
      actorId: a.actorId,
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
