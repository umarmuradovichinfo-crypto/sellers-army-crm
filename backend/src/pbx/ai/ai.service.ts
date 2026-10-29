import { BadRequestException, ConflictException, HttpException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';

import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { LeaderService } from '../../common/leader.service';
import { RightsService } from '../../common/rights/rights.service';
import { CrmService } from '../../crm/crm.service';
import { Prisma } from '../../generated/prisma/client';
import { OwnPbxProvider } from '../../onlinepbx/own-pbx.provider';
import { PbxGateway } from '../../onlinepbx/pbx.gateway';
import { PrismaService } from '../../prisma/prisma.service';
import { isInternalNumber } from '../phone';
import { AI_MODEL, AnalyzeError, aiConfigured, aiMockAllowed, analyzeTranscript, type CallAnalysis } from './analyze';
import { STT_LANGS, STT_MAX_SEC, STT_PROVIDERS, SttError, pickStt, sttAvailable, transcribe, wavDuration, type SttLangPref, type SttProviderId } from './stt';

const CFG_KEY = 'pbx_ai';
const USAGE_KEY = 'pbx_ai_usage';
const DAY_MS = 86_400_000;
const TZ_MS = 5 * 3_600_000;
const MAX_PARALLEL = 2;
const MAX_ATTEMPTS = 3; // birinchi urinish + 2 qayta urinish
const ENQUEUE_WINDOW_MS = 3 * DAY_MS; // navbatga faqat so'nggi 3 kun (va yoqilgandan keyingi) qo'ng'iroqlar
const dayKey = (now = Date.now()) => new Date(now + TZ_MS).toISOString().slice(0, 10);

export interface AiCfg {
  enabled: boolean; language: SttLangPref; minTalkSec: number; dailyLimit: number; autoNote: boolean; autoTask: boolean;
  sttProvider: 'auto' | SttProviderId; retainDays: number; enabledAt: string | null;
}
export const AI_DEFAULTS: AiCfg = { enabled: false, language: 'auto', minTalkSec: 20, dailyLimit: 200, autoNote: true, autoTask: false, sttProvider: 'auto', retainDays: 90, enabledAt: null };

/** Navbat qarori (sof funksiya): null — navbatga; aks holda «skipped» sababi. */
export function queueDecision(c: { phone: string; talkSec: number; durationSec: number; hasRecording: boolean }, minTalkSec: number): null | 'internal' | 'short' | 'too_long' | 'no_recording' {
  if (isInternalNumber(c.phone)) return 'internal';
  if ((c.talkSec || 0) < minTalkSec) return 'short';
  if ((c.talkSec || 0) > STT_MAX_SEC) return 'too_long';
  if (!c.hasRecording) return 'no_recording';
  return null;
}

const SENT_UZ: Record<string, string> = { positive: 'ijobiy', neutral: 'neytral', negative: 'salbiy' };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
/** Bitim lentasi uchun «AI xulosa» izohi matni (≤2000 belgi). */
export function noteText(a: CallAnalysis, call: { direction: string; talkSec: number; startedAt: Date }): string {
  const when = new Date(call.startedAt.getTime() + TZ_MS).toISOString().slice(0, 16).replace('T', ' ');
  const lines = [
    `AI xulosa — ${call.direction === 'in' ? 'kiruvchi' : 'chiquvchi'} qo'ng'iroq ${when}, ${mmss(call.talkSec)}`,
    a.summary,
    `Kayfiyat: ${SENT_UZ[a.sentiment] || a.sentiment} · Operator bahosi: ${a.score}/10${a.intent ? ` · Maqsad: ${a.intent}` : ''}`,
    a.objections.length ? `E'tirozlar: ${a.objections.join('; ')}` : '',
    a.nextSteps.length ? `Keyingi qadamlar: ${a.nextSteps.join('; ')}` : '',
  ];
  return lines.filter(Boolean).join('\n').slice(0, 2000);
}

type JobRow = Prisma.CallAiGetPayload<{ include: { call: true } }>;

/**
 * «ИИ-менеджер»: yakunlangan qo'ng'iroq yozuvi → STT → Claude tahlili → call_ai; bitimga «AI xulosa» izohi (bir marta) va ixtiyoriy vazifa.
 * Fon ishchisi faqat RAHBAR nusxada (har 30 s, bir vaqtda ≤2, sutkalik limit, ≤2 qayta urinish); kunlik tozalash — retainDays.
 * Transkripsiya/tahlil matni loglarga yozilmaydi; kalitlar javoblarga chiqmaydi (faqat «ulangan/ulanmagan»).
 */
@Injectable()
export class PbxAiService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('PbxAi');
  private timers: NodeJS.Timeout[] = [];
  private running = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly leader: LeaderService,
    private readonly rights: RightsService,
    private readonly crm: CrmService,
    private readonly gw: PbxGateway,
    private readonly own: OwnPbxProvider,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    const tickMs = Number(process.env.PBX_AI_TICK_MS ?? 30_000);
    if (Number.isFinite(tickMs) && tickMs > 0) {
      const t = setInterval(() => { this.leader.guard(() => this.tick()).catch((e) => this.log.warn('tick: ' + (e as Error).name)); }, Math.max(5_000, tickMs));
      t.unref?.(); this.timers.push(t);
    }
    const clean = () => this.leader.guard(() => this.cleanup()).catch((e) => this.log.warn('tozalash: ' + (e as Error).name));
    const first = setTimeout(clean, 180_000); const daily = setInterval(clean, DAY_MS);
    first.unref?.(); daily.unref?.();
    this.timers.push(first, daily);
  }
  onModuleDestroy() { for (const t of this.timers) clearTimeout(t); }

  // ── Sozlama ──
  async cfg(): Promise<AiCfg> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: CFG_KEY } });
    try { return { ...AI_DEFAULTS, ...(row ? JSON.parse(row.value) : {}) }; } catch { return { ...AI_DEFAULTS }; }
  }
  private sttFor(c: AiCfg) { return pickStt(c.sttProvider === 'auto' ? undefined : c.sttProvider, process.env); }

  async info() {
    const c = await this.cfg();
    const env = process.env;
    const providers = STT_PROVIDERS.filter((p) => p !== 'mock' || sttAvailable('mock', env)).map((id) => ({ id, available: sttAvailable(id, env) }));
    const [usedToday, counts, days] = await Promise.all([this.usedToday(), this.prisma.callAi.groupBy({ by: ['status'], _count: { _all: true } }), this.days()]);
    const since = dayKey(Date.now() - 6 * DAY_MS);
    const week = days.filter((d) => d.day >= since);
    const sum = (k: 'done' | 'failed' | 'tokensIn' | 'tokensOut' | 'audioSec') => week.reduce((a, d) => a + d[k], 0);
    return {
      settings: { ...c },
      stt: { active: this.sttFor(c), providers },
      analysis: { configured: aiConfigured(env), mock: aiMockAllowed(env), model: aiConfigured(env) ? (aiMockAllowed(env) ? 'mock' : AI_MODEL(env)) : null },
      usage: { today: usedToday, dailyLimit: c.dailyLimit },
      counts: Object.fromEntries(counts.map((x) => [x.status, x._count._all])),
      stats7: { done: sum('done'), failed: sum('failed'), tokensIn: sum('tokensIn'), tokensOut: sum('tokensOut'), audioMin: Math.round(sum('audioSec') / 6) / 10 },
      days,
      limits: { maxAudioMin: STT_MAX_SEC / 60, maxFileMb: 25 },
    };
  }

  async saveSettings(dto: Record<string, unknown>) {
    const cur = await this.cfg();
    const next: AiCfg = { ...cur };
    const bad = (f: string, m: string) => new BadRequestException({ error: 'VALIDATION_ERROR', field: f, message: m });
    const int = (k: keyof AiCfg, lo: number, hi: number, m: string) => {
      if (dto[k] === undefined) return;
      const n = Number(dto[k]);
      if (!Number.isInteger(n) || n < lo || n > hi) throw bad(k, m);
      (next as any)[k] = n;
    };
    for (const k of ['enabled', 'autoNote', 'autoTask'] as const) if (dto[k] !== undefined) next[k] = dto[k] === true;
    if (dto.language !== undefined) { if (!(STT_LANGS as string[]).includes(String(dto.language))) throw bad('language', "Til noto'g'ri (auto, uz, ru, en)"); next.language = dto.language as SttLangPref; }
    if (dto.sttProvider !== undefined) {
      const p = String(dto.sttProvider);
      if (!['auto', ...STT_PROVIDERS].includes(p)) throw bad('sttProvider', "STT provayderi noto'g'ri");
      if (p === 'mock' && !sttAvailable('mock', process.env)) throw bad('sttProvider', 'Sinov provayderi faqat sinov muhitida');
      next.sttProvider = p as AiCfg['sttProvider'];
    }
    int('minTalkSec', 5, 600, "Minimal suhbat 5–600 soniya");
    int('dailyLimit', 1, 5000, 'Kunlik limit 1–5000');
    int('retainDays', 7, 365, "Saqlash muddati 7–365 kun");
    if (next.enabled && !cur.enabled) next.enabledAt = new Date().toISOString();
    const value = JSON.stringify(next);
    await this.prisma.appSetting.upsert({ where: { key: CFG_KEY }, update: { value }, create: { key: CFG_KEY, value } });
    return this.info();
  }

  // ── Sutkalik limit (atomik hisoblagich, Toshkent kuni) ──
  private async usedToday(): Promise<number> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: USAGE_KEY } });
    try { const v = row ? JSON.parse(row.value) : null; return v?.day === dayKey() ? Number(v.count) || 0 : 0; } catch { return 0; }
  }
  private async bump(delta = 1): Promise<number> {
    const day = dayKey();
    const rows = await this.prisma.$queryRaw<{ value: string }[]>(Prisma.sql`
      INSERT INTO app_settings (key, value, "updatedAt") VALUES (${USAGE_KEY}, json_build_object('day', ${day}::text, 'count', GREATEST(${delta}::int, 0))::text, now())
      ON CONFLICT (key) DO UPDATE SET "updatedAt" = now(), value = CASE
        WHEN (app_settings.value::json ->> 'day') = ${day}::text THEN json_build_object('day', ${day}::text, 'count', GREATEST(COALESCE((app_settings.value::json ->> 'count')::int, 0) + ${delta}::int, 0))::text
        ELSE json_build_object('day', ${day}::text, 'count', GREATEST(${delta}::int, 0))::text END
      RETURNING value`);
    try { return Number(JSON.parse(rows[0]?.value || '{}').count) || 0; } catch { return 0; }
  }

  private async days() {
    const rows = await this.prisma.$queryRaw<{ day: string; done: bigint; failed: bigint; tin: bigint | null; tout: bigint | null; sec: bigint | null }[]>(Prisma.sql`
      SELECT to_char(("updatedAt" + interval '5 hours')::date, 'YYYY-MM-DD') AS day,
        count(*) FILTER (WHERE status = 'done') AS done, count(*) FILTER (WHERE status = 'failed') AS failed,
        sum("costTokensIn") AS tin, sum("costTokensOut") AS tout, sum(COALESCE("audioSec", 0)) AS sec
      FROM call_ai WHERE "updatedAt" >= now() - interval '30 days' AND status IN ('done', 'failed') GROUP BY 1 ORDER BY 1`);
    return rows.map((r) => ({ day: r.day, done: Number(r.done), failed: Number(r.failed), tokensIn: Number(r.tin || 0), tokensOut: Number(r.tout || 0), audioSec: Number(r.sec || 0) }));
  }

  // ── Navbat ──
  private async hasRecording(c: { recordUrl: string | null; externalId: string | null }, ownActive: boolean): Promise<boolean> {
    if (c.recordUrl?.startsWith('own:')) return this.own.hasRecordingFile(c.recordUrl).catch(() => false);
    if (ownActive) return c.externalId ? this.own.hasRecordingFile(c.externalId).catch(() => false) : false;
    return !!(c.externalId || c.recordUrl);
  }
  private async ownActive() { try { return (await this.gw.activeKind()) === 'own'; } catch { return false; } }

  /** Yangi yakunlangan qo'ng'iroqlarni navbatga qo'yadi (yoki sababi bilan «skipped»). */
  async enqueue(c: AiCfg, now = Date.now()): Promise<number> {
    const since = new Date(Math.max(c.enabledAt ? Date.parse(c.enabledAt) || 0 : 0, now - ENQUEUE_WINDOW_MS));
    const rows = await this.prisma.$queryRaw<{ id: string; phone: string; talkSec: number; durationSec: number; recordUrl: string | null; externalId: string | null }[]>(Prisma.sql`
      SELECT c.id, c.phone, c."talkSec", c."durationSec", c."recordUrl", c."externalId" FROM call_logs c
      WHERE c.status = 'completed' AND c."startedAt" >= ${since}
        AND NOT EXISTS (SELECT 1 FROM call_ai a WHERE a."callLogId" = c.id)
      ORDER BY c."startedAt" ASC LIMIT 200`);
    if (!rows.length) return 0;
    const own = await this.ownActive();
    const data = await Promise.all(rows.map(async (r) => {
      const reason = queueDecision({ phone: r.phone, talkSec: r.talkSec, durationSec: r.durationSec, hasRecording: await this.hasRecording(r, own) }, c.minTalkSec);
      return { callLogId: r.id, status: reason ? 'skipped' : 'pending', reason };
    }));
    const res = await this.prisma.callAi.createMany({ data, skipDuplicates: true });
    return res.count;
  }

  /** Bitta fon sikli: navbatga qo'yish + bo'sh o'rinlar soni qadar ishlov. drain — navbat bo'shaguncha (qo'lda «hozir ishga tushirish»). */
  async tick(opts: { drain?: boolean } = {}) {
    const c = await this.cfg();
    if (!c.enabled) return { ok: true, disabled: true, enqueued: 0, processed: 0 };
    // uzilib qolgan ishlov (jarayon to'xtagan) — qayta navbatga yoki yakuniy xato
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE call_ai SET status = CASE WHEN attempts >= ${MAX_ATTEMPTS} THEN 'failed' ELSE 'pending' END, error = 'Ishlov uzilib qoldi', "updatedAt" = now()
      WHERE status = 'processing' AND "updatedAt" < now() - interval '20 minutes'`);
    const enqueued = await this.enqueue(c);
    let processed = 0;
    if (!this.sttFor(c)) return { ok: true, enqueued, processed, stt: false };
    for (let round = 0; round < (opts.drain ? 50 : 1); round++) {
      const slots = MAX_PARALLEL - this.running;
      const room = c.dailyLimit - (await this.usedToday());
      const n = Math.min(slots, room);
      if (n <= 0) break;
      const ids = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        UPDATE call_ai SET status = 'processing', attempts = attempts + 1, "updatedAt" = now()
        WHERE id IN (SELECT id FROM call_ai WHERE status = 'pending' AND ("nextAt" IS NULL OR "nextAt" <= now()) ORDER BY "createdAt" LIMIT ${n} FOR UPDATE SKIP LOCKED)
        RETURNING id`);
      if (!ids.length) break;
      const results = await Promise.all(ids.map(async ({ id }) => {
        // limit atomik: boshqa jarayon (qo'lda ishga tushirish) o'rnini egallagan bo'lsa — qaytariladi
        if ((await this.bump(1)) > c.dailyLimit) {
          await this.bump(-1);
          await this.prisma.callAi.update({ where: { id }, data: { status: 'pending', attempts: { decrement: 1 } } });
          return false;
        }
        await this.runJob(id, c);
        return true;
      }));
      processed += results.filter(Boolean).length;
      if (results.some((x) => !x)) break;
    }
    return { ok: true, enqueued, processed };
  }

  /** Yozuvni olish: o'z stansiyamiz — disk (own:<id>); OnlinePBX — uuid yoki saqlangan havola orqali. */
  private async recording(c: { recordUrl: string | null; externalId: string | null }) {
    if (c.recordUrl?.startsWith('own:')) return this.own.fetchRecording(c.recordUrl);
    if (await this.ownActive()) return c.externalId ? this.own.fetchRecording(c.externalId) : null;
    if (!(await this.gw.enabled())) return null;
    return (c.externalId ? await this.gw.fetchRecording(c.externalId) : null) || (c.recordUrl ? await this.gw.fetchRecording(c.recordUrl) : null);
  }

  /** Bitta ish: (STT, agar matn hali yo'q bo'lsa) → tahlil → saqlash → bitim lentasi. Qator allaqachon «processing» holatida. */
  private async runJob(id: string, c: AiCfg, opts: { restt?: boolean } = {}) {
    this.running++;
    let row: JobRow | null = null;
    try {
      row = await this.prisma.callAi.findUnique({ where: { id }, include: { call: true } });
      if (!row) return;
      const call = row.call;
      let transcript = opts.restt ? null : row.transcript;
      let lang = row.lang;
      if (!transcript) {
        const provider = this.sttFor(c);
        if (!provider) throw new SttError('STT provayderi sozlanmagan', 'STT_UNAVAILABLE', false);
        const rec = await this.recording(call).catch(() => null);
        if (!rec) throw new SttError('Yozuv topilmadi', 'NO_RECORDING');
        const dur = wavDuration(rec.buffer);
        if ((dur ?? 0) > STT_MAX_SEC) { await this.finish(id, { status: 'skipped', reason: 'too_long', error: null }); return; }
        const r = await transcribe(provider, rec.buffer, rec.contentType, c.language);
        transcript = r.text;
        lang = r.lang;
        const audioSec = Math.round(r.durationSec ?? dur ?? call.talkSec);
        if (!transcript) { await this.finish(id, { status: 'skipped', reason: 'empty', sttProvider: provider, audioSec, error: null }); return; }
        await this.prisma.callAi.update({ where: { id }, data: { transcript, lang, sttProvider: provider, audioSec, analysisJson: null, purgedAt: null } });
      }
      if (!aiConfigured()) { await this.finish(id, { status: 'done', error: null, reason: null }); return; }
      const a = await analyzeTranscript(transcript, { direction: call.direction, talkSec: call.talkSec, rating: call.rating, lang });
      await this.finish(id, { status: 'done', error: null, reason: null, analysisJson: JSON.stringify({ ...a.analysis, model: a.model }), costTokensIn: { increment: a.tokensIn }, costTokensOut: { increment: a.tokensOut } });
      if (call.leadId) await this.applyToLead(id, call, a.analysis, c).catch((e) => this.log.warn(`lenta (${id}): ${(e as Error).name}`));
    } catch (e) {
      const known = e instanceof SttError || e instanceof AnalyzeError;
      const code = known ? (e as SttError).code : 'INTERNAL';
      const msg = known ? (e as Error).message : 'Ichki xato';
      const retry = (!known || (e as SttError).retry !== false) && (row?.attempts ?? MAX_ATTEMPTS) < MAX_ATTEMPTS;
      this.log.warn(`call_ai ${id}: ${code}${retry ? ' (qayta urinish)' : ''}`); // matn/transkripsiya/kalit yozilmaydi
      await this.finish(id, { status: retry ? 'pending' : 'failed', error: msg.slice(0, 300), nextAt: retry ? new Date(Date.now() + 2 ** (row?.attempts || 1) * 60_000) : null }).catch(() => undefined);
    } finally {
      this.running--;
    }
  }
  private finish(id: string, data: Prisma.CallAiUpdateInput) { return this.prisma.callAi.update({ where: { id }, data: { ...data, updatedAt: new Date() } }); }

  /** Bitimga «AI xulosa» izohi (bir marta: noteAt atomik belgilanadi) va sozlama yoqilgan bo'lsa tavsiya etilgan vazifa (bir marta). */
  private async applyToLead(id: string, call: { leadId: string | null; direction: string; talkSec: number; startedAt: Date }, a: CallAnalysis, c: AiCfg) {
    const leadId = call.leadId!;
    const actor = { id: '', name: 'AI-menejer' } as AuthUser;
    if (c.autoNote) {
      const claim = await this.prisma.callAi.updateMany({ where: { id, noteAt: null }, data: { noteAt: new Date() } });
      if (claim.count === 1) await this.crm.addNote(leadId, { text: noteText(a, call) } as any, actor);
    }
    if (c.autoTask && a.suggestedTask) {
      const claim = await this.prisma.callAi.updateMany({ where: { id, taskId: null }, data: { taskId: 'pending' } });
      if (claim.count === 1) {
        const due = new Date(Date.now() + a.suggestedTask.dueInDays * DAY_MS);
        due.setUTCHours(13, 0, 0, 0); // 18:00 Toshkent
        const r = await this.crm.createTask(leadId, { title: `AI: ${a.suggestedTask.title}`.slice(0, 300), type: 'call', dueDate: due.toISOString() } as any);
        await this.prisma.callAi.update({ where: { id }, data: { taskId: r.task?.id || 'created' } });
      }
    }
  }

  // ── Ro'yxat va tafsilot (huquqlar bo'yicha) ──
  private parse(s: string | null): (CallAnalysis & { model?: string }) | null { try { return s ? JSON.parse(s) : null; } catch { return null; } }

  async list(q: Record<string, string | undefined>, userId: string) {
    const where: Prisma.CallAiWhereInput = {};
    if (q.status && ['pending', 'processing', 'done', 'failed', 'skipped'].includes(q.status)) where.status = q.status;
    const days = Math.min(366, Math.max(1, Number(q.days) || 30));
    where.call = { startedAt: { gte: new Date(Date.now() - days * DAY_MS) } };
    if (q.leadId) where.call = { ...(where.call as object), leadId: String(q.leadId) };
    let rows = await this.prisma.callAi.findMany({ where, include: { call: true }, orderBy: { createdAt: 'desc' }, take: 2000 });
    // amoCRM «Права доступа»: cheklangan foydalanuvchi faqat o'z qo'ng'iroqlari yoki ko'ra oladigan bitimlar qo'ng'iroqlari
    const vis = await this.rights.visibleLeadIds(userId, [...new Set(rows.map((r) => r.call.leadId).filter(Boolean) as string[])]);
    if (vis) rows = rows.filter((r) => r.call.userId === userId || (r.call.leadId && vis.has(r.call.leadId)));
    if (q.sentiment) rows = rows.filter((r) => this.parse(r.analysisJson)?.sentiment === q.sentiment);
    const total = rows.length;
    rows = rows.slice(0, Math.min(Number(q.limit) || 100, 500));
    const [users, leads] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.call.userId).filter(Boolean) as string[])] } }, select: { id: true, name: true, extension: true } }),
      this.prisma.lead.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.call.leadId).filter(Boolean) as string[])] } }, select: { id: true, name: true } }),
    ]);
    const uMap = new Map(users.map((u) => [u.id, u])); const lMap = new Map(leads.map((l) => [l.id, l.name]));
    return {
      total,
      calls: rows.map((r) => {
        const a = this.parse(r.analysisJson);
        const u = r.call.userId ? uMap.get(r.call.userId) : undefined;
        return {
          callLogId: r.callLogId, at: r.call.startedAt.toISOString(), phone: r.call.phone, direction: r.call.direction, talkSec: r.call.talkSec,
          leadId: r.call.leadId, leadName: r.call.leadId ? lMap.get(r.call.leadId) || null : null, userName: u?.name || null, ext: u?.extension || null,
          status: r.status, reason: r.reason, error: r.error, lang: r.lang, purged: !!r.purgedAt,
          sentiment: a?.sentiment || null, score: a?.score ?? null, summary: a?.summary ? a.summary.slice(0, 300) : null,
        };
      }),
    };
  }

  private async assertCallAccess(user: AuthUser, callLogId: string) {
    if (user.permissions?.includes('crm.settings')) return;
    await this.rights.assertCall(user, callLogId);
  }

  async get(callLogId: string, user: AuthUser) {
    const call = await this.prisma.callLog.findUnique({ where: { id: String(callLogId) }, select: { id: true } });
    if (!call) throw new NotFoundException({ error: 'NOT_FOUND', message: "Qo'ng'iroq topilmadi" });
    await this.assertCallAccess(user, call.id);
    const r = await this.prisma.callAi.findUnique({ where: { callLogId: call.id } });
    if (!r) return { callLogId: call.id, status: null };
    return {
      callLogId: r.callLogId, status: r.status, reason: r.reason, error: r.error, lang: r.lang, sttProvider: r.sttProvider, audioSec: r.audioSec,
      transcript: r.transcript, analysis: this.parse(r.analysisJson), tokens: { input: r.costTokensIn, output: r.costTokensOut },
      noteAdded: !!r.noteAt, taskId: r.taskId && r.taskId !== 'pending' ? r.taskId : null, purged: !!r.purgedAt, updatedAt: r.updatedAt.toISOString(),
    };
  }

  /** Qo'lda (qayta) ishga tushirish. Mavjud matn qayta ishlatiladi (faqat tahlil), `restt: true` — STT ham qaytadan. Izoh/vazifa takror yozilmaydi. */
  async run(callLogId: string, user: AuthUser, body: { restt?: boolean } = {}) {
    const call = await this.prisma.callLog.findUnique({ where: { id: String(callLogId) } });
    if (!call) throw new NotFoundException({ error: 'NOT_FOUND', message: "Qo'ng'iroq topilmadi" });
    await this.assertCallAccess(user, call.id);
    const c = await this.cfg();
    if (!c.enabled) throw new ConflictException({ error: 'AI_DISABLED', message: "AI-menejer o'chirilgan (Telefoniya → Servislar → AI-menejer)" });
    if (isInternalNumber(call.phone)) throw new BadRequestException({ error: 'INTERNAL_CALL', message: "Ichki qo'ng'iroq tahlil qilinmaydi" });
    if (!(call.talkSec > 0)) throw new BadRequestException({ error: 'NO_TALK', message: "Suhbat bo'lmagan qo'ng'iroq" });
    const existing = await this.prisma.callAi.findUnique({ where: { callLogId: call.id } });
    const needStt = body.restt === true || !existing?.transcript;
    if (needStt && !this.sttFor(c)) throw new ServiceUnavailableException({ error: 'STT_UNAVAILABLE', message: "STT provayderi ulanmagan (OPENAI_API_KEY / DEEPGRAM_API_KEY / AZURE_STT_KEY)" });
    if (existing?.status === 'processing') throw new ConflictException({ error: 'BUSY', message: 'Tahlil hozir bajarilmoqda' });
    if ((await this.bump(1)) > c.dailyLimit) { await this.bump(-1); throw new HttpException({ error: 'DAILY_LIMIT', message: `Bugungi AI tahlil limiti (${c.dailyLimit} ta) tugadi` }, 429); }
    let id: string;
    if (existing) {
      const u = await this.prisma.callAi.updateMany({ where: { id: existing.id, status: { not: 'processing' } }, data: { status: 'processing', attempts: MAX_ATTEMPTS, error: null, reason: null, nextAt: null, updatedAt: new Date() } });
      if (!u.count) { await this.bump(-1); throw new ConflictException({ error: 'BUSY', message: 'Tahlil hozir bajarilmoqda' }); }
      id = existing.id;
    } else {
      try { id = (await this.prisma.callAi.create({ data: { callLogId: call.id, status: 'processing', attempts: MAX_ATTEMPTS } })).id; } catch {
        await this.bump(-1); throw new ConflictException({ error: 'BUSY', message: 'Tahlil hozir bajarilmoqda' });
      }
    }
    await this.runJob(id, c, { restt: body.restt === true });
    return this.get(call.id, user);
  }

  // ── Saqlash muddati: retainDays dan eski matn/tahlil o'chiriladi (qator va token hisobi qoladi — qayta navbatga tushmaydi) ──
  async cleanup(now = Date.now()) {
    const c = await this.cfg();
    const cutoff = new Date(now - c.retainDays * DAY_MS);
    const r = await this.prisma.callAi.updateMany({
      where: { createdAt: { lt: cutoff }, purgedAt: null, status: { not: 'processing' } },
      data: { transcript: null, analysisJson: null, error: null, purgedAt: new Date(now) },
    });
    if (r.count) this.log.log(`AI transkripsiyalar tozalandi: ${r.count} ta (${c.retainDays} kundan eski)`);
    return { ok: true, retainDays: c.retainDays, purged: r.count };
  }
}
