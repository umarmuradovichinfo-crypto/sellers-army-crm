import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from './activity.service';
import { NotificationService } from './notification.service';

function parse<T>(s: string | null | undefined, fb: T): T {
  try { return JSON.parse(s || '') as T; } catch { return fb; }
}
function digits(p?: string | null): string {
  return (p || '').replace(/\D/g, '');
}

export type DupSettings = {
  enabled: boolean;
  sources: Record<string, boolean>; // 'telegram' | 'fb:<formId>' | 'form:<id>' | 'call'
  matchPhone: boolean;
  matchEmail: boolean;
  fields: string[]; // custom maydon kalitlari bo'yicha moslik
  pipelines: string[] | null; // null = barcha voronkalar ('main' = asosiy)
  stages: string[] | null; // null = barcha bosqichlar
  onConflict: 'update' | 'keep';
  onMultiple: 'newest' | 'oldest';
  afterTask: { enabled: boolean; assignee: string; text: string };
};
export type PipeSettings = { unsortedEnabled: boolean; dups: DupSettings };

export type Origin = { kind: 'telegram' | 'facebook' | 'form' | 'call'; id?: string | null; label?: string };
export type Incoming = {
  name?: string | null; phone?: string | null; email?: string | null;
  custom?: Record<string, unknown>; pipelineId?: string | null; origin: Origin;
};

const DEFAULTS = (): PipeSettings => ({
  unsortedEnabled: true,
  dups: {
    enabled: false, sources: {}, matchPhone: true, matchEmail: true, fields: [], pipelines: null, stages: null,
    onConflict: 'update', onMultiple: 'newest', afterTask: { enabled: false, assignee: 'lead', text: '' },
  },
});

export function originKey(o: Origin): string {
  if (o.kind === 'facebook') return `fb:${o.id || ''}`;
  if (o.kind === 'form') return `form:${o.id || ''}`;
  return o.kind;
}

/**
 * Voronka sozlamalari (har voronka uchun AppSetting JSON): "Saralanmagan" switch va dublikatlar nazorati.
 * Kiruvchi lid oqimlari (forma, Facebook, Telegram, qo'ng'iroq) shu servis orqali joylashtiriladi va dublikatga tekshiriladi.
 */
@Injectable()
export class PipelineSettingsService {
  private readonly logger = new Logger(PipelineSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly notif: NotificationService,
  ) {}

  private key(pid?: string | null) { return `crm.pipeline.${pid && pid !== 'main' ? pid : 'main'}.settings`; }

  async get(pid?: string | null): Promise<PipeSettings> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: this.key(pid) } });
    const d = DEFAULTS();
    const v = parse<Partial<PipeSettings>>(row?.value, {});
    return { unsortedEnabled: v.unsortedEnabled !== false, dups: { ...d.dups, ...(v.dups || {}), afterTask: { ...d.dups.afterTask, ...(v.dups?.afterTask || {}) } } };
  }

  async save(pid: string | null | undefined, patch: any): Promise<PipeSettings> {
    const cur = await this.get(pid);
    const p = patch || {};
    if (p.unsortedEnabled !== undefined) cur.unsortedEnabled = !!p.unsortedEnabled;
    if (p.dups && typeof p.dups === 'object') {
      const d = p.dups;
      if (d.enabled !== undefined) cur.dups.enabled = !!d.enabled;
      if (d.sources && typeof d.sources === 'object') {
        const src: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(d.sources)) src[String(k).slice(0, 100)] = !!v;
        cur.dups.sources = src;
      }
      if (d.matchPhone !== undefined) cur.dups.matchPhone = !!d.matchPhone;
      if (d.matchEmail !== undefined) cur.dups.matchEmail = !!d.matchEmail;
      if (d.fields !== undefined) cur.dups.fields = Array.isArray(d.fields) ? [...new Set<string>(d.fields.map((x: any) => String(x)).filter(Boolean))].slice(0, 30) : [];
      if (d.pipelines !== undefined) cur.dups.pipelines = Array.isArray(d.pipelines) ? d.pipelines.map((x: any) => String(x)) : null;
      if (d.stages !== undefined) cur.dups.stages = Array.isArray(d.stages) ? d.stages.map((x: any) => String(x)) : null;
      if (d.onConflict !== undefined) {
        if (!['update', 'keep'].includes(d.onConflict)) throw new BadRequestException({ error: 'BAD_VALUE', message: "onConflict noto'g'ri" });
        cur.dups.onConflict = d.onConflict;
      }
      if (d.onMultiple !== undefined) {
        if (!['newest', 'oldest'].includes(d.onMultiple)) throw new BadRequestException({ error: 'BAD_VALUE', message: "onMultiple noto'g'ri" });
        cur.dups.onMultiple = d.onMultiple;
      }
      if (d.afterTask && typeof d.afterTask === 'object') {
        cur.dups.afterTask = {
          enabled: !!d.afterTask.enabled,
          assignee: String(d.afterTask.assignee || 'lead').slice(0, 60),
          text: String(d.afterTask.text || '').slice(0, 500),
        };
      }
    }
    await this.prisma.appSetting.upsert({
      where: { key: this.key(pid) },
      create: { key: this.key(pid), value: JSON.stringify(cur) },
      update: { value: JSON.stringify(cur) },
    });
    return cur;
  }

  // ── Joylashtirish: "Saralanmagan" switch'ga qarab bosqich + unsorted bayrog'i ──
  async place(pipelineId: string | null | undefined, preferredStage?: string | null): Promise<{ stage: string; pipelineId: string | null; unsorted: boolean; queue: number }> {
    const pid = pipelineId && pipelineId !== 'main' ? pipelineId : null;
    const s = await this.get(pid);
    const stages = await this.prisma.crmStage.findMany({ where: { pipelineId: pid }, orderBy: { order: 'asc' } });
    const firstOpen = stages.find((x) => x.kind === 'open');
    const preferred = preferredStage ? stages.find((x) => x.key === preferredStage && x.kind === 'open') : undefined;
    const stage = preferred?.key || firstOpen?.key || preferredStage || 'new';
    const agg = await this.prisma.lead.aggregate({ where: { stage }, _max: { queue: true } });
    // Manba sozlamasida aniq bosqich tanlangan bo'lsa — lid to'g'ridan-to'g'ri o'sha ustunga (amoCRM: forma/Lead Ads "Этап");
    // tanlanmagan bo'lsa — voronkaning "Saralanmagan" sozlamasi bo'yicha
    return { stage, pipelineId: pid, unsorted: preferred ? false : s.unsortedEnabled, queue: (agg._max.queue ?? -1) + 1 };
  }

  // ── Dublikat qidirish va birlashtirish (kiruvchi lid oqimi) ──
  // Dublikat topilib birlashtirilsa — yangilangan (qoldirilgan) bitimni qaytaradi; aks holda null (chaqiruvchi yangi lid yaratadi).
  async mergeIncoming(input: Incoming, actorName?: string): Promise<any | null> {
    try {
      const pid = input.pipelineId && input.pipelineId !== 'main' ? input.pipelineId : null;
      const s = (await this.get(pid)).dups;
      if (!s.enabled || !s.sources[originKey(input.origin)]) return null;

      const tail = digits(input.phone).slice(-9);
      const email = (input.email || '').trim().toLowerCase();
      const custom = input.custom || {};
      const fieldVals = s.fields.map((k) => [k, String(custom[k] ?? '').trim().toLowerCase()] as const).filter(([, v]) => v);
      const canPhone = s.matchPhone && tail.length >= 7;
      const canEmail = s.matchEmail && !!email;
      if (!canPhone && !canEmail && !fieldVals.length) return null;

      // Indekslangan oldindan saralash (phoneTail / emailNorm / customJson) — barcha lidlarni yuklamaymiz
      const or: Record<string, unknown>[] = [];
      if (canPhone) or.push({ phoneTail: tail });
      if (canEmail) or.push({ emailNorm: email });
      for (const [, v] of fieldVals) or.push({ customJson: { contains: JSON.stringify(v).slice(1, -1), mode: 'insensitive' } });
      const all = await this.prisma.lead.findMany({ where: { OR: or }, orderBy: { createdAt: 'asc' } });
      const matches = all.filter((l) => {
        const lp = l.pipelineId || 'main';
        if (s.pipelines && !s.pipelines.includes(lp)) return false;
        if (s.stages && !s.stages.includes(l.stage)) return false;
        if (canPhone && digits(l.phone).slice(-9) === tail) return true;
        if (canEmail && (l.email || '').trim().toLowerCase() === email) return true;
        if (fieldVals.length) {
          const lc = parse<Record<string, unknown>>(l.customJson, {});
          if (fieldVals.some(([k, v]) => String(lc[k] ?? '').trim().toLowerCase() === v)) return true;
        }
        return false;
      });
      if (!matches.length || matches.length > 3) return null; // 3 tadan ko'p bo'lsa birlashtirilmaydi

      const target = s.onMultiple === 'oldest' ? matches[0] : matches[matches.length - 1];
      const others = matches.filter((m) => m.id !== target.id);
      const label = input.origin.label || input.origin.kind;
      const upd: Record<string, unknown> = {};

      if (others.length) {
        const ids = others.map((o) => o.id);
        await this.prisma.leadTask.updateMany({ where: { leadId: { in: ids } }, data: { leadId: target.id } });
        await this.prisma.activity.updateMany({ where: { leadId: { in: ids } }, data: { leadId: target.id } });
        await this.prisma.callLog.updateMany({ where: { leadId: { in: ids } }, data: { leadId: target.id } });
        await this.prisma.message.updateMany({ where: { leadId: { in: ids } }, data: { leadId: target.id } });
        const tags = new Set(parse<string[]>(target.tagsJson, []));
        const notes = parse<{ text: string; at: string; by: string }[]>(target.notesJson, []);
        for (const o of others) {
          for (const k of ['phone', 'email', 'company', 'source', 'telegramChatId', 'contactId', 'companyId'] as const) {
            if (!(target as any)[k] && o[k] && !upd[k]) upd[k] = o[k];
          }
          if (!target.value && o.value && !upd.value) upd.value = o.value;
          parse<string[]>(o.tagsJson, []).forEach((t) => tags.add(t));
          notes.push(...parse<{ text: string; at: string; by: string }[]>(o.notesJson, []));
        }
        upd.tagsJson = JSON.stringify([...tags]);
        upd.notesJson = JSON.stringify(notes.sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 100));
        await this.prisma.lead.deleteMany({ where: { id: { in: ids } } });
      }

      // Kiruvchi ma'lumotlar bilan to'qnashuv
      const overwrite = s.onConflict === 'update';
      const curCustom = parse<Record<string, unknown>>(target.customJson, {});
      const nextCustom = { ...curCustom };
      for (const [k, v] of Object.entries(custom)) {
        if (v === undefined || v === null || String(v) === '') continue;
        if (overwrite || curCustom[k] === undefined || curCustom[k] === '') nextCustom[k] = v;
      }
      upd.customJson = JSON.stringify(nextCustom);
      const put = (k: 'phone' | 'email', v?: string | null) => {
        const cur = (upd[k] as string | undefined) ?? (target as any)[k];
        if (v && (overwrite || !cur)) upd[k] = v;
      };
      put('phone', input.phone); put('email', input.email);
      const nm = (input.name || '').trim();
      if (nm && nm !== 'Nomsiz lid' && (overwrite || !target.name)) upd.name = nm.slice(0, 200);
      await this.prisma.lead.update({ where: { id: target.id }, data: upd });

      await this.activity.record(target.id, 'updated', {
        actorName: actorName || label,
        text: `Dublikat: ${label} so'rovi mavjud bitim bilan birlashtirildi${others.length ? ` (+${others.length} dublikat)` : ''}`,
        data: { duplicate: true, origin: originKey(input.origin) },
      });

      if (s.afterTask.enabled) {
        let assigneeId = s.afterTask.assignee === 'lead' || !s.afterTask.assignee ? target.assigneeId : s.afterTask.assignee;
        if (assigneeId && assigneeId !== target.assigneeId && !(await this.prisma.user.findFirst({ where: { id: assigneeId, isActive: true }, select: { id: true } }))) assigneeId = target.assigneeId;
        const t = await this.prisma.leadTask.create({
          data: { leadId: target.id, title: s.afterTask.text || 'Dublikat birlashtirildi — tekshiring', type: 'task', dueDate: new Date(Date.now() + 3600_000), assigneeId: assigneeId || null },
        });
        await this.activity.record(target.id, 'task_created', { actorName: actorName || label, text: `Vazifa: ${t.title}` });
        if (t.assigneeId) await this.notif.notify(t.assigneeId, `Dublikat: ${t.title}`, { type: 'task', link: `/leads/${target.id}` });
      }
      return await this.prisma.lead.findUnique({ where: { id: target.id } });
    } catch (e) {
      this.logger.warn('Dublikat qoidasi xato: ' + (e as Error).message);
      return null; // xato bo'lsa — yangi lid yaratiladi (lid yo'qolmasin)
    }
  }
}
