import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { LeaderService } from '../../common/leader.service';
import { OwnPbxProvider } from '../../onlinepbx/own-pbx.provider';
import { PrismaService } from '../../prisma/prisma.service';
import { cleanName } from '../pbx-schema';
import { PbxService } from '../pbx.service';
import { phoneKey } from '../phone';
import { HHMM_RE, INFORMER_MAX_NUMBERS, afterAttempt, inWindow, parseNumbers, pickTargets, reasonText, tashkentDay } from './informer';

const CFG_KEY = 'pbx_informer';
const STATES = ['pending', 'calling', 'answered', 'noanswer', 'failed', 'dnd'] as const;
/** «calling» shuncha vaqtdan keyin ham natija kelmasa (rahbar almashdi, AMI uzildi) — qo'ng'iroqlar jurnali bo'yicha yakunlanadi. */
const STALE_MS = 10 * 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface InformerCfg { prefixes: string[] }

/**
 * Avtoinformator: kampaniya CRUD, raqam importi (normallashtirish, qora ro'yxat → dnd, takrorlar, ≤5000) va runner.
 * Runner faqat RAHBAR nusxada har 12 s: ish oynasi, maxParallel, kunlik limit; chaqiruvlar orasida ≥1 s (soniyasiga ≤1).
 * Toll-fraud: faqat mamlakat prefikslari oq ro'yxati (standart 998), dialplan konteksti faqat AMI Originate'dan chaqiriladi.
 */
@Injectable()
export class InformerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Informer');
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly own: OwnPbxProvider, private readonly leader: LeaderService, private readonly pbx: PbxService) {}

  onModuleInit() {
    this.own.onOriginate((r) => { if (r.kind === 'informer') this.onResult(r.uuid, r.answered, reasonText(r.reason)).catch((e) => this.logger.warn('natija: ' + (e as Error).message)); });
    if (process.env.NODE_ENV === 'test') return;
    const ms = Number(process.env.PBX_INFORMER_TICK_MS) || 12_000;
    this.timer = setInterval(() => { this.leader.guard(() => this.tick()).catch((e) => this.logger.warn('tick: ' + (e as Error).message)); }, ms);
    this.timer.unref?.();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  // ── Sozlama ──
  async config(): Promise<InformerCfg> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: CFG_KEY } });
    let v: Partial<InformerCfg> = {};
    try { v = row ? JSON.parse(row.value) : {}; } catch { /* */ }
    return { prefixes: Array.isArray(v.prefixes) ? v.prefixes.map(String) : ['998'] };
  }
  async saveConfig(dto: { prefixes?: unknown }) {
    const prefixes = (Array.isArray(dto.prefixes) ? dto.prefixes : String(dto.prefixes ?? '').split(/[;,\s]+/)).map((x) => String(x).replace(/\D/g, '')).filter(Boolean).slice(0, 30);
    if (!prefixes.length) throw new BadRequestException({ error: 'NO_PREFIX', message: "Kamida bitta mamlakat prefiksini kiriting (masalan 998)" });
    if (prefixes.some((x) => x.length > 4)) throw new BadRequestException({ error: 'BAD_PREFIX', message: "Mamlakat prefiksi 1–4 xonali bo'lsin (masalan 998)" });
    const value = JSON.stringify({ prefixes });
    await this.prisma.appSetting.upsert({ where: { key: CFG_KEY }, update: { value }, create: { key: CFG_KEY, value } });
    return { prefixes };
  }

  // ── Kampaniyalar ──
  private async counts(ids: string[]) {
    const g = ids.length ? await this.prisma.pbxInformerTarget.groupBy({ by: ['campaignId', 'state'], where: { campaignId: { in: ids } }, _count: { _all: true } }) : [];
    const out = new Map<string, Record<string, number>>();
    for (const id of ids) out.set(id, { total: 0, ...Object.fromEntries(STATES.map((s) => [s, 0])) });
    for (const r of g) { const c = out.get(r.campaignId)!; c[r.state] = (c[r.state] || 0) + r._count._all; c.total += r._count._all; }
    return out;
  }
  private view(c: any, counts?: Record<string, number>) {
    return {
      id: c.id, name: c.name, audioId: c.audioId, status: c.status, startAt: c.startAt ? c.startAt.toISOString() : null, windowFrom: c.windowFrom, windowTo: c.windowTo,
      maxParallel: c.maxParallel, retries: c.retries, retryMin: c.retryMin, dailyLimit: c.dailyLimit, todayCalls: c.dayKey === tashkentDay(Date.now()) ? c.dayCount : 0,
      createdAt: c.createdAt.toISOString(), counts: counts || null,
    };
  }
  async list() {
    const rows = await this.prisma.pbxInformer.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    const cnt = await this.counts(rows.map((r) => r.id));
    return { campaigns: rows.map((r) => this.view(r, cnt.get(r.id))), pbxReady: await this.own.enabled() };
  }
  private async find(id: string) {
    const c = await this.prisma.pbxInformer.findUnique({ where: { id } });
    if (!c) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Kampaniya topilmadi' });
    return c;
  }
  async get(id: string, q: { state?: string; limit?: string } = {}) {
    const c = await this.find(id);
    const cnt = await this.counts([id]);
    const state = q.state && (STATES as readonly string[]).includes(q.state) ? q.state : undefined;
    const targets = await this.prisma.pbxInformerTarget.findMany({ where: { campaignId: id, ...(state ? { state } : {}) }, orderBy: [{ lastAt: { sort: 'desc', nulls: 'last' } }, { phone: 'asc' }], take: Math.min(Number(q.limit) || 500, 5000) });
    return { campaign: this.view(c, cnt.get(id)), targets: targets.map((t) => ({ id: t.id, phone: t.phone, state: t.state, attempts: t.attempts, lastAt: t.lastAt ? t.lastAt.toISOString() : null, lastResult: t.lastResult, callLogId: t.callLogId })) };
  }

  private fields(dto: Record<string, any>, cur?: Record<string, any>) {
    const int = (k: string, d: number, min: number, max: number, label: string) => {
      const v = dto[k] === undefined || dto[k] === null || dto[k] === '' ? (cur ? cur[k] : d) : Number(dto[k]);
      if (!Number.isInteger(v) || v < min || v > max) throw new BadRequestException({ error: 'BAD_VALUE', message: `${label}: ${min}–${max}` });
      return v;
    };
    const hhmm = (k: string, d: string) => {
      const v = String(dto[k] ?? (cur ? cur[k] : d)).trim();
      if (!HHMM_RE.test(v)) throw new BadRequestException({ error: 'BAD_TIME', message: "Vaqt HH:MM ko'rinishida bo'lsin" });
      return v;
    };
    let startAt: Date | null | undefined = cur ? undefined : null;
    if (dto.startAt !== undefined) {
      if (!dto.startAt) startAt = null;
      else { const d = new Date(String(dto.startAt)); if (!Number.isFinite(d.getTime())) throw new BadRequestException({ error: 'BAD_DATE', message: "Boshlanish vaqti noto'g'ri" }); startAt = d; }
    }
    const name = dto.name !== undefined ? cleanName(dto.name, 100) : cur?.name;
    if (!name) throw new BadRequestException({ error: 'NO_NAME', message: 'Kampaniya nomini kiriting' });
    return {
      name, windowFrom: hhmm('windowFrom', '09:00'), windowTo: hhmm('windowTo', '20:00'),
      maxParallel: int('maxParallel', 2, 1, 10, 'Bir vaqtdagi qo\'ng\'iroqlar'), retries: int('retries', 1, 0, 3, 'Qayta urinishlar'), retryMin: int('retryMin', 30, 30, 1440, 'Urinishlar oralig\'i (daqiqa)'),
      dailyLimit: int('dailyLimit', 1000, 1, 5000, 'Kunlik limit'), ...(startAt !== undefined ? { startAt } : {}),
    };
  }
  private async assertAudio(id: unknown) {
    const a = typeof id === 'string' && /^[A-Za-z0-9]{1,80}$/.test(id) ? await this.prisma.pbxAudio.findUnique({ where: { id }, select: { id: true } }) : null;
    if (!a) throw new BadRequestException({ error: 'AUDIO_NOT_FOUND', message: 'Audio fayl tanlang (kutubxonadan yoki matndan yarating)' });
    return a.id;
  }

  async create(dto: Record<string, any>) {
    const f = this.fields(dto);
    const audioId = await this.assertAudio(dto.audioId);
    if ((await this.prisma.pbxInformer.count()) >= 200) throw new BadRequestException({ error: 'LIMIT', message: '200 tadan ortiq kampaniya bo\'lmaydi — eskilarini o\'chiring' });
    const c = await this.prisma.pbxInformer.create({ data: { ...f, audioId, startAt: f.startAt ?? null } });
    const imp = dto.numbers ? await this.addNumbers(c.id, { text: String(dto.numbers) }) : null;
    return { ...(await this.get(c.id, { limit: '0' })), import: imp };
  }

  async update(id: string, dto: Record<string, any>) {
    const cur = await this.find(id);
    if (cur.status === 'running') throw new ConflictException({ error: 'RUNNING', message: "Ishlayotgan kampaniyani o'zgartirib bo'lmaydi — avval pauza qiling" });
    const f = this.fields(dto, cur);
    const audioId = dto.audioId !== undefined ? await this.assertAudio(dto.audioId) : cur.audioId;
    await this.prisma.pbxInformer.update({ where: { id }, data: { ...f, audioId } });
    return this.get(id, { limit: '0' });
  }

  async remove(id: string) {
    const cur = await this.find(id);
    if (cur.status === 'running') throw new ConflictException({ error: 'RUNNING', message: "Ishlayotgan kampaniyani o'chirib bo'lmaydi — avval to'xtating" });
    await this.prisma.pbxInformer.delete({ where: { id } });
    return { ok: true };
  }

  /** Raqam importi: CSV/matn → normallashtirish, oq ro'yxat, takrorlar, qora ro'yxat (dnd), jami ≤ 5000. */
  async addNumbers(id: string, dto: { text?: string }) {
    const c = await this.find(id);
    if (c.status === 'done') throw new ConflictException({ error: 'DONE', message: 'Tugagan kampaniyaga raqam qo\'shilmaydi' });
    const text = String(dto.text ?? '');
    if (text.length > 400_000) throw new BadRequestException({ error: 'TOO_BIG', message: 'Matn juda katta' });
    const existing = (await this.prisma.pbxInformerTarget.findMany({ where: { campaignId: id }, select: { phone: true } })).map((t) => t.phone);
    const { prefixes } = await this.config();
    const p = parseNumbers(text, prefixes, existing);
    const room = Math.max(0, INFORMER_MAX_NUMBERS - existing.length);
    const take = p.numbers.slice(0, room);
    const blocked = new Set((await this.prisma.pbxBlacklist.findMany({ select: { number: true } })).map((b) => phoneKey(b.number)));
    const rows = take.map((phone) => ({ campaignId: id, phone, state: blocked.has(phoneKey(phone)) ? 'dnd' : 'pending' }));
    if (rows.length) await this.prisma.pbxInformerTarget.createMany({ data: rows, skipDuplicates: true });
    return { added: rows.length, dnd: rows.filter((r) => r.state === 'dnd').length, duplicates: p.duplicates, invalid: p.invalid, foreign: p.foreign, overLimit: p.numbers.length - take.length, total: existing.length + rows.length };
  }

  async setStatus(id: string, action: string) {
    const c = await this.find(id);
    if (action === 'start') {
      if (c.status === 'done') throw new ConflictException({ error: 'DONE', message: 'Kampaniya tugagan' });
      await this.assertAudio(c.audioId);
      const pending = await this.prisma.pbxInformerTarget.count({ where: { campaignId: id, state: 'pending' } });
      if (!pending) throw new BadRequestException({ error: 'NO_NUMBERS', message: "Qo'ng'iroq qilinadigan raqam yo'q" });
      const rules = ((await this.pbx.outgoing()).rules || []).filter((r: any) => r?.trunk);
      if (!rules.length) throw new BadRequestException({ error: 'NO_ROUTE', message: "Chiquvchi qoida (trunk) sozlanmagan: ATS → Chiquvchi" });
      await this.pbx.writeAudioFile(c.audioId).catch(() => false); // audio stansiyada bo'lsin («Stansiyaga qo'llash»ni kutmasdan)
      await this.prisma.pbxInformer.update({ where: { id }, data: { status: 'running' } });
    } else if (action === 'pause') {
      if (c.status !== 'running') throw new ConflictException({ error: 'NOT_RUNNING', message: 'Kampaniya ishlamayapti' });
      await this.prisma.pbxInformer.update({ where: { id }, data: { status: 'paused' } });
    } else if (action === 'stop') {
      await this.prisma.pbxInformer.update({ where: { id }, data: { status: 'done' } });
    } else throw new BadRequestException({ error: 'BAD_ACTION', message: "Amal noto'g'ri" });
    return { ...(await this.get(id, { limit: '0' })), pbxReady: await this.own.enabled() };
  }

  // ── Runner ──
  /** Originate natijasi (AMI OriginateResponse). */
  async onResult(uuid: string, answered: boolean, result: string) {
    const t = await this.prisma.pbxInformerTarget.findFirst({ where: { uuid, state: 'calling' }, include: { campaign: { select: { retries: true } } } });
    if (!t) return;
    const state = afterAttempt(t, t.campaign.retries, answered, result);
    await this.prisma.pbxInformerTarget.updateMany({ where: { id: t.id, state: 'calling' }, data: { state, lastResult: result } });
  }

  /** Natijasi kelmay qolgan «calling» — jurnal (CDR) bo'yicha yakunlash; yakunlanganlarga call_logs id bog'lash. */
  private async reconcile(now: number) {
    const stale = await this.prisma.pbxInformerTarget.findMany({ where: { state: 'calling', lastAt: { lt: new Date(now - STALE_MS) } }, include: { campaign: { select: { retries: true } } }, take: 200 });
    for (const t of stale) {
      const log = t.uuid ? await this.prisma.callLog.findUnique({ where: { externalId: t.uuid }, select: { id: true, talkSec: true } }) : null;
      const answered = !!log && log.talkSec > 0;
      await this.prisma.pbxInformerTarget.updateMany({ where: { id: t.id, state: 'calling' }, data: { state: afterAttempt(t, t.campaign.retries, answered, answered ? 'answered' : 'noanswer'), lastResult: answered ? 'answered' : 'timeout', callLogId: log?.id || null } });
    }
    const unlinked = await this.prisma.pbxInformerTarget.findMany({ where: { callLogId: null, uuid: { not: null }, state: { in: ['answered', 'noanswer', 'failed', 'pending'] }, lastAt: { gt: new Date(now - 86_400_000) } }, select: { id: true, uuid: true }, take: 300 });
    if (unlinked.length) {
      const logs = await this.prisma.callLog.findMany({ where: { externalId: { in: unlinked.map((u) => u.uuid!) } }, select: { id: true, externalId: true } });
      const by = new Map(logs.map((l) => [l.externalId, l.id]));
      for (const u of unlinked) { const lid = by.get(u.uuid); if (lid) await this.prisma.pbxInformerTarget.update({ where: { id: u.id }, data: { callLogId: lid } }); }
    }
  }

  async tick(now = Date.now()) {
    if (this.running) return { called: 0 };
    this.running = true;
    try {
      await this.reconcile(now);
      const camps = await this.prisma.pbxInformer.findMany({ where: { status: 'running' }, orderBy: { createdAt: 'asc' } });
      if (!camps.length) return { called: 0 };
      const ready = await this.own.enabled();
      const { prefixes } = await this.config();
      const blocked = new Set((await this.prisma.pbxBlacklist.findMany({ select: { number: true } })).map((b) => phoneKey(b.number)));
      let called = 0;
      for (const c of camps) {
        const open = await this.prisma.pbxInformerTarget.count({ where: { campaignId: c.id, state: { in: ['pending', 'calling'] } } });
        if (!open) { await this.prisma.pbxInformer.updateMany({ where: { id: c.id, status: 'running' }, data: { status: 'done' } }); continue; }
        if (!ready || (c.startAt && c.startAt.getTime() > now) || !inWindow(now, c.windowFrom, c.windowTo)) continue;
        const day = tashkentDay(now);
        let dayCount = c.dayKey === day ? c.dayCount : 0;
        if (dayCount >= c.dailyLimit) continue;
        const calling = await this.prisma.pbxInformerTarget.count({ where: { campaignId: c.id, state: 'calling' } });
        const slots = Math.min(c.maxParallel - calling, c.dailyLimit - dayCount);
        if (slots <= 0) continue;
        const rows = await this.prisma.pbxInformerTarget.findMany({ where: { campaignId: c.id, state: 'pending' }, orderBy: [{ attempts: 'asc' }, { lastAt: 'asc' }], take: 500 });
        for (const t of pickTargets(rows, c, now, slots)) {
          // qora ro'yxatga keyin qo'shilgan yoki prefiks oq ro'yxatidan chiqarilgan raqam — chaqirilmaydi
          if (blocked.has(phoneKey(t.phone))) { await this.prisma.pbxInformerTarget.update({ where: { id: t.id }, data: { state: 'dnd' } }); continue; }
          if (prefixes.length && !prefixes.some((p) => t.phone.startsWith(p))) { await this.prisma.pbxInformerTarget.update({ where: { id: t.id }, data: { state: 'failed', lastResult: 'country' } }); continue; }
          // band qilish (boshqa tik/nusxa bilan to'qnashmaslik uchun shartli yangilash)
          // uuid oldindan yoziladi: OriginateResponse (natija) javobdan oldin kelishi ham mumkin
          const uuid = randomUUID();
          const lock = await this.prisma.pbxInformerTarget.updateMany({ where: { id: t.id, state: 'pending', attempts: t.attempts }, data: { state: 'calling', attempts: { increment: 1 }, lastAt: new Date(now), uuid, callLogId: null } });
          if (!lock.count) continue;
          if (called > 0) await sleep(1100); // soniyasiga ≤ 1 chaqiruv
          const r = await this.own.informerCall(t.phone, c.audioId, 40, uuid);
          dayCount++;
          called++;
          if (!r.ok) await this.prisma.pbxInformerTarget.updateMany({ where: { id: t.id, state: 'calling' }, data: { state: afterAttempt({ attempts: t.attempts + 1 }, c.retries, false, 'error'), lastResult: 'error' } });
        }
        await this.prisma.pbxInformer.update({ where: { id: c.id }, data: { dayKey: day, dayCount } });
      }
      return { called };
    } finally { this.running = false; }
  }
}
