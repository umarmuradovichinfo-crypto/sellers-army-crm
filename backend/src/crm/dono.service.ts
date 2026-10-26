import { RightsService } from '../common/rights/rights.service';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

import type { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { CrmService } from './crm.service';

/**
 * amoCRM «Доно» — mahsulot ichidagi AI yordamchi. Bitimni tahlil qiladi («Что не так с этой сделкой?»),
 * vazifa qo'yadi («Поставь задачу на сегодня»), mijozga javob loyihasini yozadi («Что ответить клиенту?»).
 * Claude API (tool use): model CRM ma'lumotlarini vositalar orqali o'qiydi va yozadi, kalit — ANTHROPIC_API_KEY.
 */
type ChatMsg = { role: 'user' | 'assistant'; content: string };

const MODEL = process.env.DONO_MODEL || 'claude-opus-5-5';
const MAX_TURNS = 8;
const STATS_KEY = 'amma:stats';
type DayUsage = { input: number; output: number; cacheRead: number; cacheWrite: number; requests: number };
type DonoStats = { leads: string[]; requests: number; leadsAt?: Record<string, string>; days?: Record<string, DayUsage> };

const SYSTEM = `Siz «Dono» — CRM tizimi ichidagi sotuv ustoz-maslahatchisisiz (dono = donishmand).
Xarakteringiz: Samarqand va Buxoro savdo an'analari ruhidagi sabrli, kuzatuvchan, mehribon ustoz. «Savdo — avval ishonch» qoidasiga amal qilasiz: mijozni hurmat qilasiz, menejerga dalda berasiz.
Ohang: «siz»lab, iliq va hurmat bilan; qisqa va aniq; har javobda keyingi qadam bo'lsin. Ba'zan (har javobda emas, ko'pi bilan bitta) o'rinli maqol/hikmat keltiring («Ish ko'rgan — el ko'rgan»). Muvaffaqiyatni birinchi bo'lib tabriklang («Barakalla!»); kamchilikni qoralamang, tuzatish yo'lini ko'rsating. Hazil — mayin. Rus tilida ham shu ohang («Здравствуйте! Я Доно — ваш наставник по продажам»).
Foydalanuvchi — sotuv menejeri. Bitimlar (lidlar), vazifalar, chat yozishmalari bilan ishlaysiz.
- Ma'lumotni faqat vositalardan oling; taxmin qilmang. Bitim ID kerak bo'lsa avval search_leads yoki get_lead ishlating.
- «Bitimda nima muammo?» savolida: bosqichda qancha turgani, ochiq/muddati o'tgan vazifalar, javobsiz xabarlar, byudjet, mas'ul, oxirgi faoliyat — aniq kamchiliklar va keyingi qadamlarni ayting.
- «Mijozga nima javob beray?» savolida: yozishmani o'qib, qisqa, xushmuomala javob loyihasini mijoz yozgan tilda bering. Xabarni o'zingiz yubormaysiz.
- Vazifa yoki izoh yaratishdan oldin foydalanuvchi so'raganiga ishonch hosil qiling; yaratgach nima qilinganini qisqa ayting.
- Foydalanuvchi qaysi tilda yozsa (o'zbek yoki rus), o'sha tilda javob bering. Javoblar qisqa va amaliy bo'lsin, markdown ro'yxatlar mumkin.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_lead',
    description: "Bitim (lid) haqida to'liq ma'lumot: bosqich, byudjet, mas'ul, teglar, izohlar, vazifalar va oxirgi 30 ta chat xabari.",
    input_schema: { type: 'object', properties: { leadId: { type: 'string' } }, required: ['leadId'], additionalProperties: false },
  },
  {
    name: 'search_leads',
    description: "Bitimlarni nom, telefon yoki kompaniya bo'yicha qidirish (10 tagacha). Bo'sh so'rov — oxirgi faol bitimlar.",
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
  },
  {
    name: 'list_tasks',
    description: "Joriy foydalanuvchining vazifalari: today (bugungi), overdue (muddati o'tgan) yoki open (barcha ochiq).",
    input_schema: { type: 'object', properties: { scope: { type: 'string', enum: ['today', 'overdue', 'open'] } }, required: ['scope'], additionalProperties: false },
  },
  {
    name: 'create_task',
    description: "Bitimga vazifa qo'yish. dueDate — ISO 8601 vaqt (masalan bugun 18:00). type: call | meeting | message | task.",
    input_schema: {
      type: 'object',
      properties: { leadId: { type: 'string' }, title: { type: 'string' }, dueDate: { type: 'string' }, type: { type: 'string', enum: ['call', 'meeting', 'message', 'task'] } },
      required: ['leadId', 'title', 'dueDate', 'type'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_note',
    description: "Bitimga izoh (примечание) qo'shish.",
    input_schema: { type: 'object', properties: { leadId: { type: 'string' }, text: { type: 'string' } }, required: ['leadId', 'text'], additionalProperties: false },
  },
  {
    name: 'pipeline_summary',
    description: "Voronka bo'yicha qisqa statistika: har bosqichdagi bitimlar soni va summasi, bu oy yutilgan/yo'qotilgan.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'unanswered_chats',
    description: "Javob berilmagan chatlar (oxirgi xabar mijozdan) — 15 tagacha, eng eskisi birinchi.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

@Injectable()
export class DonoService {
  private readonly log = new Logger('Dono');
  private client: Anthropic | null = null;

  constructor(private readonly prisma: PrismaService, private readonly crm: CrmService, private readonly rights: RightsService) {}

  configured() { return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN); }

  private api() {
    if (!this.configured()) throw new ServiceUnavailableException({ error: 'DONO_NOT_CONFIGURED', message: "Dono sozlanmagan: serverda ANTHROPIC_API_KEY o'rnatilmagan" });
    return (this.client ??= new Anthropic());
  }

  async info() {
    const row = await this.prisma.appSetting.findUnique({ where: { key: STATS_KEY } });
    let stats: DonoStats = { leads: [], requests: 0 };
    try { stats = row ? { ...stats, ...JSON.parse(row.value) } : stats; } catch { /* bo'sh */ }
    const unanswered = (await this.unanswered()).length;
    // amoCRM «За последние 7 дней»: ishlangan bitimlar va token sarfi (kunlar bo'yicha)
    const since = Date.now() - 7 * 86400_000;
    const processed7 = Object.values(stats.leadsAt || {}).filter((iso) => Date.parse(iso) >= since).length;
    const days = Object.entries(stats.days || {}).sort(([a], [b]) => a.localeCompare(b)).slice(-30)
      .map(([day, d]) => ({ day, ...d }));
    const week = days.filter((d) => Date.parse(d.day) >= since - 86400_000);
    const sum = (k: keyof DayUsage) => week.reduce((a, d) => a + (Number(d[k]) || 0), 0);
    return {
      configured: this.configured(), processedLeads: stats.leads?.length || 0, requests: stats.requests || 0, unanswered,
      processed7, tokens7: { input: sum('input'), output: sum('output'), cacheRead: sum('cacheRead'), cacheWrite: sum('cacheWrite'), requests: sum('requests') },
      days,
    };
  }

  async chat(dto: { messages?: ChatMsg[]; leadId?: string }, user: AuthUser) {
    const client = this.api();
    const history = (Array.isArray(dto?.messages) ? dto.messages : [])
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
    if (!history.length || history[history.length - 1].role !== 'user') return { reply: '', actions: [] };
    while (history[0]?.role !== 'user') history.shift();

    const now = new Date();
    // o'zgaruvchan kontekst tizim promptidan keyin, oxirgi foydalanuvchi xabari oldida (kesh prefiksi barqaror qoladi)
    const ctx = `[Kontekst] Foydalanuvchi: ${user.name || '—'} (id ${user.id}). Hozir: ${now.toISOString()} (Toshkent, UTC+5).` +
      (dto.leadId ? ` Foydalanuvchi hozir bitim kartochkasida: leadId=${dto.leadId}.` : '');
    const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m, i) =>
      i === history.length - 1 ? { role: 'user', content: `${ctx}\n\n${m.content}` } : m);

    const actions: { type: string; leadId?: string; text: string }[] = [];
    const touched = new Set<string>();
    if (dto.leadId) touched.add(dto.leadId);
    let reply = '';
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      let res: Anthropic.Beta.BetaMessage;
      try {
        res = await client.beta.messages.create({
          model: MODEL,
          max_tokens: 8000,
          system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
          tools: TOOLS,
          messages,
          output_config: { effort: 'medium' },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        } as any) as Anthropic.Beta.BetaMessage;
      } catch (e) {
        if (e instanceof Anthropic.AuthenticationError) throw new ServiceUnavailableException({ error: 'DONO_AUTH', message: "Dono: API kaliti noto'g'ri" });
        if (e instanceof Anthropic.RateLimitError) throw new ServiceUnavailableException({ error: 'DONO_RATE', message: "Dono band, birozdan keyin urinib ko'ring" });
        if (e instanceof Anthropic.APIError) { this.log.warn(`API ${e.status}: ${e.message}`); throw new ServiceUnavailableException({ error: 'DONO_API', message: 'Dono vaqtincha ishlamayapti' }); }
        throw e;
      }
      usage.input += res.usage?.input_tokens || 0;
      usage.output += res.usage?.output_tokens || 0;
      usage.cacheRead += res.usage?.cache_read_input_tokens || 0;
      usage.cacheWrite += res.usage?.cache_creation_input_tokens || 0;
      messages.push({ role: 'assistant', content: res.content });
      reply = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (res.stop_reason === 'refusal') { reply = reply || "Kechirasiz, bu so'rovga javob bera olmayman."; break; }
      if (res.stop_reason !== 'tool_use') break;
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const b of res.content) {
        if (b.type !== 'tool_use') continue;
        try {
          const out = await this.runTool(b.name, (b.input || {}) as Record<string, any>, user, actions, touched);
          results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out).slice(0, 30000) });
        } catch (e: any) {
          results.push({ type: 'tool_result', tool_use_id: b.id, content: String(e?.response?.message || e?.message || 'xato'), is_error: true });
        }
      }
      messages.push({ role: 'user', content: results });
    }
    await this.bumpStats(touched, usage).catch(() => null);
    return { reply, actions };
  }

  private async runTool(name: string, input: Record<string, any>, user: AuthUser, actions: { type: string; leadId?: string; text: string }[], touched: Set<string>) {
    const str = (k: string) => (typeof input[k] === 'string' ? input[k].trim() : '');
    switch (name) {
      case 'get_lead': { const id = str('leadId'); await this.rights.assertLead(user, id, 'view'); touched.add(id); return this.leadInfo(id); }
      case 'search_leads': return this.search(str('query'), user.id);
      case 'list_tasks': return this.tasks(str('scope'), user.id);
      case 'create_task': {
        const leadId = str('leadId'); const title = str('title');
        await this.rights.assertLead(user, leadId, 'view');
        const due = new Date(str('dueDate'));
        const r = await this.crm.createTask(leadId, { title, type: str('type') || 'task', dueDate: isNaN(+due) ? undefined : due.toISOString() } as any, user);
        touched.add(leadId);
        actions.push({ type: 'task', leadId, text: title });
        return { ok: true, task: r.task };
      }
      case 'add_note': {
        const leadId = str('leadId'); const text = str('text');
        await this.rights.assertLead(user, leadId, 'view');
        if (!text) throw new Error("Izoh matni bo'sh");
        await this.crm.addNote(leadId, { text } as any, user);
        touched.add(leadId);
        actions.push({ type: 'note', leadId, text });
        return { ok: true };
      }
      case 'pipeline_summary': return this.summary();
      case 'unanswered_chats': return { chats: await this.unanswered(user.id) };
      default: throw new Error(`Noma'lum vosita: ${name}`);
    }
  }

  private async userNames() {
    const users = await this.prisma.user.findMany({ select: { id: true, name: true } });
    return new Map(users.map((u: any) => [u.id, u.name]));
  }

  private async stageNames() {
    const st = await this.prisma.crmStage.findMany({ select: { key: true, name: true, kind: true } });
    return new Map(st.map((s) => [s.key, s]));
  }

  private async leadInfo(id: string) {
    const l = await this.prisma.lead.findUnique({ where: { id }, include: { tasks: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    if (!l) throw new Error('Bitim topilmadi');
    const [names, stages, msgs, enter] = await Promise.all([
      this.userNames(),
      this.stageNames(),
      this.prisma.message.findMany({ where: { leadId: id }, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.prisma.activity.findFirst({ where: { leadId: id, type: { in: ['stage', 'won', 'lost'] } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }).catch(() => null),
    ]);
    const parse = (s: string, d: any) => { try { return JSON.parse(s); } catch { return d; } };
    return {
      id: l.id, name: l.name, phone: l.phone, email: l.email, company: l.company, source: l.source, budget: l.value,
      stage: stages.get(l.stage)?.name || l.stage, stageKind: stages.get(l.stage)?.kind,
      inStageSince: (enter?.createdAt || l.createdAt).toISOString(),
      assignee: l.assigneeId ? names.get(l.assigneeId) || l.assigneeId : null,
      tags: parse(l.tagsJson, []), notes: parse(l.notesJson, []).slice(0, 10),
      lostReason: l.lostReason, createdAt: l.createdAt.toISOString(), lastActivityAt: l.lastActivityAt?.toISOString() || null,
      tasks: l.tasks.map((t) => ({ title: t.title, type: t.type, due: t.dueDate?.toISOString() || null, done: t.done, result: t.result })),
      messages: msgs.reverse().map((m) => ({ at: m.createdAt.toISOString(), from: m.direction === 'in' ? 'client' : 'manager', channel: m.channel, text: m.text.slice(0, 1000) })),
    };
  }

  private async search(q: string, userId?: string) {
    const own = await this.rights.ownersById(userId, 'leads', 'view'); // amoCRM «Права доступа»
    const where: any = q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { company: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : {};
    if (own) where.assigneeId = { in: own.length ? own : ['__none__'] };
    const [rows, stages] = await Promise.all([
      this.prisma.lead.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 10, select: { id: true, name: true, stage: true, value: true, company: true } }),
      this.stageNames(),
    ]);
    return { leads: rows.map((r) => ({ ...r, stage: stages.get(r.stage)?.name || r.stage })) };
  }

  private async tasks(scope: string, userId: string) {
    const now = new Date();
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    const where: any = { done: false, assigneeId: userId };
    if (scope === 'today') where.dueDate = { lte: end };
    else if (scope === 'overdue') where.dueDate = { lt: now };
    const rows = await this.prisma.leadTask.findMany({ where, orderBy: { dueDate: 'asc' }, take: 30, include: { lead: { select: { id: true, name: true } } } });
    return { tasks: rows.map((t) => ({ title: t.title, type: t.type, due: t.dueDate?.toISOString() || null, leadId: t.lead.id, lead: t.lead.name })) };
  }

  private async summary() {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const [groups, stages, won, lost] = await Promise.all([
      this.prisma.lead.groupBy({ by: ['stage'], where: { unsorted: false }, _count: { _all: true }, _sum: { value: true } }),
      this.stageNames(),
      this.prisma.lead.count({ where: { wonAt: { gte: monthStart } } }),
      this.prisma.lead.count({ where: { lostAt: { gte: monthStart } } }),
    ]);
    return { stages: groups.map((g) => ({ stage: stages.get(g.stage)?.name || g.stage, count: g._count._all, sum: g._sum.value || 0 })), wonThisMonth: won, lostThisMonth: lost };
  }

  private async unanswered(userId?: string) {
    const last = await this.prisma.message.findMany({ distinct: ['leadId'], orderBy: [{ leadId: 'asc' }, { createdAt: 'desc' }], take: 500, select: { leadId: true, direction: true, createdAt: true, text: true } });
    const vis = await this.rights.visibleLeadIds(userId, last.map((m) => m.leadId));
    const open = last.filter((m) => m.direction === 'in' && (!vis || vis.has(m.leadId))).sort((a, b) => +a.createdAt - +b.createdAt).slice(0, 15);
    if (!open.length) return [];
    const leads = await this.prisma.lead.findMany({ where: { id: { in: open.map((m) => m.leadId) } }, select: { id: true, name: true } });
    const nm = new Map(leads.map((l) => [l.id, l.name]));
    return open.filter((m) => nm.has(m.leadId)).map((m) => ({ leadId: m.leadId, lead: nm.get(m.leadId), since: m.createdAt.toISOString(), text: m.text.slice(0, 200) }));
  }

  private async bumpStats(touched: Set<string>, usage?: { input: number; output: number; cacheRead: number; cacheWrite: number }) {
    const row = await this.prisma.appSetting.findUnique({ where: { key: STATS_KEY } });
    let s: DonoStats = { leads: [], requests: 0 };
    try { if (row) s = { leads: [], requests: 0, ...JSON.parse(row.value) }; } catch { /* bo'sh */ }
    s.requests += 1;
    s.leads = [...new Set([...s.leads, ...[...touched].filter(Boolean)])].slice(-5000);
    const nowIso = new Date().toISOString();
    s.leadsAt = { ...(s.leadsAt || {}) };
    for (const id of touched) if (id) s.leadsAt[id] = nowIso;
    const keepLeads = Object.entries(s.leadsAt).sort(([, a], [, b]) => b.localeCompare(a)).slice(0, 5000);
    s.leadsAt = Object.fromEntries(keepLeads);
    const day = nowIso.slice(0, 10);
    const d: DayUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 0, ...(s.days?.[day] || {}) };
    d.requests += 1;
    if (usage) { d.input += usage.input; d.output += usage.output; d.cacheRead += usage.cacheRead; d.cacheWrite += usage.cacheWrite; }
    s.days = Object.fromEntries(Object.entries({ ...(s.days || {}), [day]: d }).sort(([a], [b]) => a.localeCompare(b)).slice(-60));
    const value = JSON.stringify(s);
    await this.prisma.appSetting.upsert({ where: { key: STATS_KEY }, create: { key: STATS_KEY, value }, update: { value } });
  }
}
