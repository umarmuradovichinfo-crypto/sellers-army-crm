import { RightsService } from '../common/rights/rights.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';

import type { AuthUser } from '../common/decorators/current-user.decorator';
import { ActivityService } from '../crm/activity.service';
import { AutomationService } from '../crm/automation.service';
import { PipelineSettingsService } from '../crm/pipeline-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { LeaderService } from '../common/leader.service';
import { PbxGateway } from './pbx.gateway';
import { OwnPbxProvider } from './own-pbx.provider';
import type { PbxCall } from './pbx-provider';
import { OnlinePbxConfigService, PbxConfig } from './onlinepbx-config.service';
import { createHash, timingSafeEqual } from 'crypto';
import { Prisma } from '../generated/prisma/client';
import { EXT_RE, dialable, isInternalNumber, phoneKey } from '../pbx/phone';

const isP2002 = (e: unknown) => (e as { code?: string } | null)?.code === 'P2002';
const DAY_MS = 86_400_000;
const TZ_MS = 5 * 3_600_000; // akkaunt vaqti — Toshkent (UTC+5)
/** 'YYYY-MM-DD' (Toshkent kuni) → kun boshi (UTC ms). Berilmagan — null; noto'g'ri — 400. */
function parseDay(v: string | undefined, field: string): number | null {
  if (v === undefined || v === '') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  const ms = m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
  // 2026-13-45 / 2026-02-30 kabi sanalar rad etiladi (Date.UTC ularni keyingi oyga «aylantirib» yuboradi)
  if (!m || !Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== v) throw new BadRequestException({ error: 'BAD_DATE', message: `Sana noto'g'ri (${field}): YYYY-MM-DD bo'lishi kerak` });
  return ms - TZ_MS;
}

function digits(p?: string | null): string {
  return (p || '').replace(/\D/g, '');
}

// OnlinePBX vaqt belgisini (unix yoki "YYYY-MM-DD HH:mm:ss" GMT) Date'ga aylantiradi
@Injectable()
export class CallsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CallsService.name);
  private lastHistorySync = 0;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  // "Qo'ng'iroq" bosilganda qaysi liddan ekanini eslab qolamiz — webhook/sync o'sha lidga bog'laydi
  // (dublikat raqamli lidlar bo'lganda to'g'ri lidga tushishi uchun).
  private pendingIntents: Array<{ leadId: string; tail: string; at: number }> = [];

  constructor(
    private readonly leader: LeaderService,
    private readonly prisma: PrismaService,
    private readonly pbx: PbxGateway,
    private readonly own: OwnPbxProvider,
    private readonly cfg: OnlinePbxConfigService,
    private readonly automation: AutomationService,
    private readonly pset: PipelineSettingsService,
    private readonly activity: ActivityService,
    private readonly rights: RightsService,
  ) {}

  // Fon rejimida OnlinePBX tarixini muntazam tortib turadi — operator gaplashib
  // bo'lishi bilan qo'ng'iroq/yozuv ~15-20s ichida platformada avtomatik ko'rinadi.
  onModuleInit() {
    // o'z stansiyamiz (Asterisk) CDR hodisalari xuddi webhook kabi qayta ishlanadi (faqat «own» provayder faol bo'lsa)
    // AMI hodisalari har nusxaga keladi — faqat rahbar nusxa qayta ishlaydi (ikki marta yozilmasin); baza darajasida externalId noyob
    this.own.onCall((body) => {
      this.leader.guard(async () => ((await this.cfg.get()).provider === 'own' ? this.processCallEvent(body) : undefined)).catch((e) => this.logger.warn('CDR: ' + (e as Error).message));
    });
    this.syncTimer = setInterval(() => {
      this.leader.guard(() => this.syncHistory({ force: true, minutes: 30 })).catch(() => {});
    }, 10_000);
    if (typeof this.syncTimer.unref === 'function') this.syncTimer.unref();
  }
  onModuleDestroy() {
    if (this.syncTimer) clearInterval(this.syncTimer);
  }

  private webhookUrl(): string {
    const base = (process.env.PUBLIC_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')).replace(/\/+$/, '');
    return (base || 'https://<backend-domeningiz>') + '/api/v1/onlinepbx/webhook';
  }

  // ── Sozlama (UI: CRM → Sozlamalar → Telefoniya) ──
  async getConfig() {
    const c = await this.cfg.get();
    return {
      provider: c.provider === 'own' ? 'own' : 'onlinepbx',
      domain: c.domain || '',
      defaultExt: c.defaultExt || '',
      apiKeySet: !!c.apiKey, // kalit ko'rsatilmaydi, faqat mavjudligi
      webhookSecretSet: !!c.webhookSecret,
      callMode: c.callMode || 'callback',
      dialScheme: c.dialScheme || 'tel',
      popups: c.popups !== false,
      enabled: !!c.domain && !!c.apiKey,
      webhookUrl: this.webhookUrl() + (this.effectiveSecret(c) ? `?secret=${encodeURIComponent(this.effectiveSecret(c))}` : ''),
    };
  }

  async saveConfig(patch: Partial<PbxConfig>) {
    await this.cfg.update(patch);
    return this.getConfig();
  }

  async testConnection() {
    if (!(await this.pbx.enabled())) {
      return { ok: false, message: 'Avval domen va API kalitni saqlang.' };
    }
    return this.pbx.testConnection();
  }

  // Telefon bo'yicha lidni topish (oxirgi 9 raqam bo'yicha)
  // Raqam bo'yicha bitim: avval bitimning o'z telefoni, keyin kontakt telefonlari (asosiy + qo'shimcha) — yangi interfeysda
  // telefon odatda kontaktda turadi. Ochiq (yopilmagan) va oxirgi o'zgargan bitim afzal. Indekslangan ustunlar bilan.
  private async findLeadByPhone(phone: string): Promise<{ id: string; name: string } | null> {
    const tail = digits(phone).slice(-9);
    if (tail.length < 7) return null;
    const own = await this.prisma.$queryRaw<{ id: string; name: string }[]>(Prisma.sql`
      SELECT l.id, l.name FROM leads l WHERE l."phoneTail" = ${tail}
      ORDER BY (l."wonAt" IS NULL AND l."lostAt" IS NULL) DESC, l."updatedAt" DESC LIMIT 1`);
    if (own[0]) return own[0];
    const re = `(^| )[0-9]*${tail}( |$)`;
    const viaContact = await this.prisma.$queryRaw<{ id: string; name: string }[]>(Prisma.sql`
      SELECT l.id, l.name FROM crm_contacts c
      JOIN leads l ON l."contactId" = c.id
        OR EXISTS (SELECT 1 FROM crm_lead_contacts lc WHERE lc."leadId" = l.id AND lc."contactId" = c.id)
      WHERE c."phoneDigits" ~ ${re}
      ORDER BY (l."wonAt" IS NULL AND l."lostAt" IS NULL) DESC, l."updatedAt" DESC LIMIT 1`);
    return viaContact[0] || null;
  }


  // Ikki raqamdan (caller/callee) yo'nalish + mijoz (tashqi) raqamini aniqlaydi.
  // Ichki raqam (extension) qisqa (<=5 raqam); mijoz raqami uzun.
  private parties(caller: string, callee: string, account: string): { direction: string; phone: string; other: string } {
    const isInternal = (n: string) => { const d = digits(n); return d.length > 0 && d.length <= 5; };
    if (isInternal(caller) && !isInternal(callee)) return { direction: 'out', phone: callee, other: caller };
    if (isInternal(callee) && !isInternal(caller)) return { direction: 'in', phone: caller, other: callee };
    const direction = /out|исход/.test(account) ? 'out' : 'in';
    return { direction, phone: direction === 'in' ? caller : callee, other: direction === 'in' ? callee : caller };
  }
  private async leadByEither(phone: string, other: string) {
    return (await this.findLeadByPhone(phone)) || (other ? await this.findLeadByPhone(other) : null);
  }

  // Ko'tarilmagan (missed) KIRUVCHI qo'ng'iroq noma'lum raqamdan bo'lsa — Saralanmagan lid
  // yaratamiz (raqam CRMда qolsin, menejer qayta qo'ng'iroq qilsin). amoCRM'dagidek.
  // amoCRM onlinePBX vidjeti: yangi raqamdan kiruvchi qo'ng'iroq — kontakt avtomatik yaratiladi va «Неразобранное»ga
  // (Saralanmagan sozlamasiga qarab) bitim tushadi; qo'ng'iroq jiringlayotgan paytdayoq — oynada mijoz kartochkasi bo'lsin.
  private async ensureCallerLead(direction: string, phone: string, lead: { id: string; name: string } | null): Promise<{ id: string; name: string } | null> {
    if (lead) return lead;
    if (direction !== 'in') return null;
    if (digits(phone).length < 7) return null;
    if (await this.isBlacklisted(phone)) return null; // qora ro'yxatdagi raqam uchun lid yaratilmaydi
    // bir xil yangi raqamdan parallel webhooklar (har xil uuid) — navbatma-navbat; ikkinchisi birinchisi yaratgan bitimni topadi
    return this.withLock(`caller:${digits(phone).slice(-9)}`, async () => {
      const again = await this.findLeadByPhone(phone);
      return again || this.createCallerLead(phone);
    });
  }
  /** Qora ro'yxat: raqamlar normallashtirib (oxirgi 9 raqam) solishtiriladi. */
  private async isBlacklisted(phone: string) {
    const key = phoneKey(phone);
    if (!key) return false;
    const rows = await this.prisma.pbxBlacklist.findMany({ select: { number: true } });
    return rows.some((b) => phoneKey(b.number) === key);
  }

  /** Ichki raqam egasi (CRM foydalanuvchisi). */
  private async userIdByExt(ext: string): Promise<string | null> {
    const e = digits(ext);
    if (!EXT_RE.test(e)) return null;
    const u = await this.prisma.user.findFirst({ where: { extension: e }, select: { id: true } });
    return u?.id || null;
  }

  private async createCallerLead(phone: string): Promise<{ id: string; name: string }> {
    const place = await this.pset.place(null, null);
    const contact = await this.prisma.contact.create({ data: { name: phone, phone, customJson: '{}' } });
    const created = await this.prisma.lead.create({
      data: {
        name: phone, phone, contactId: contact.id, source: "Kiruvchi qo'ng'iroq", stage: place.stage, pipelineId: place.pipelineId,
        unsorted: place.unsorted, customJson: '{}', queue: place.queue,
      },
    });
    await this.activity.record(created.id, 'created', { actorName: 'OnlinePBX', text: `Lid yaratildi: Kiruvchi qo'ng'iroq ${phone}` });
    this.logger.log(`Yangi raqamdan kiruvchi qo'ng'iroq: kontakt va bitim yaratildi (${phone})`);
    return { id: created.id, name: created.name };
  }

  // O'tkazib yuborilgan kiruvchi qo'ng'iroq — bitim mas'uliga «qayta qo'ng'iroq» vazifasi (amoCRM vidjeti kabi).
  // Bitimda shunday ochiq vazifa bo'lsa — yangisi qo'shilmaydi.
  private async missedCallTask(leadId: string, phone: string) {
    const title = `Qayta qo'ng'iroq qiling: ${phone}`;
    // raqam formati (+998… / 998…) har xil kelishi mumkin — ochiq «qayta qo'ng'iroq» vazifasi bo'lsa yangisi qo'shilmaydi
    const open = await this.prisma.leadTask.findFirst({ where: { leadId, done: false, type: 'call', title: { startsWith: "Qayta qo'ng'iroq qiling" } }, select: { id: true } });
    if (open) return;
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId }, select: { assigneeId: true } });
    await this.prisma.leadTask.create({ data: { leadId, title, type: 'call', dueDate: new Date(), assigneeId: lead?.assigneeId || null } });
    await this.activity.record(leadId, 'task_created', { actorName: 'OnlinePBX', text: `Vazifa: ${title}` });
  }


  // ── Click-to-call ──
  async clickToCall(user: AuthUser, leadId: string, fromOverride?: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Lid topilmadi' });
    if (!lead.phone) throw new BadRequestException({ error: 'NO_PHONE', message: 'Lidda telefon raqami yo`q' });

    if (!(await this.pbx.enabled())) {
      throw new ServiceUnavailableException({
        error: 'PBX_DISABLED',
        message: 'OnlinePBX sozlanmagan: CRM → Sozlamalar → Telefoniya\'dan domen va API kalitni kiriting.',
      });
    }

    const dbUser = await this.prisma.user.findUnique({ where: { id: user.id }, select: { extension: true } });
    const cfg = await this.cfg.get();
    // «from» — faqat o'z ichki raqami (administrator — istalgan ichki raqam); tashqi/xalqaro raqamga qo'ng'iroq (toll-fraud) taqiqlanadi
    const wanted = String(fromOverride || '').trim();
    const okOverride = EXT_RE.test(wanted) && (user.role === 'super_admin' || wanted === (dbUser?.extension || ''));
    const from = ((okOverride ? wanted : '') || dbUser?.extension || cfg.defaultExt || '').trim();
    if (!from) {
      throw new BadRequestException({
        error: 'NO_EXTENSION',
        message: 'Operator ichki raqami (extension) belgilanmagan. Sozlamalardan qo`shing.',
      });
    }
    if (!EXT_RE.test(from)) throw new BadRequestException({ error: 'BAD_EXTENSION', message: "Ichki raqam 2–5 xonali bo'lishi kerak" });
    if (!dialable(lead.phone)) throw new BadRequestException({ error: 'BAD_PHONE', message: "Lid telefon raqami noto'g'ri" });

    let res: { ok: boolean; uuid?: string; comment?: string };
    try {
      res = await this.pbx.call(from, lead.phone);
    } catch (e) {
      this.logger.error('OnlinePBX call xatosi: ' + (e as Error).message);
      throw new ServiceUnavailableException({ error: 'PBX_ERROR', message: 'OnlinePBX bilan bog`lanib bo`lmadi' });
    }

    const log = await this.logOutgoing({ leadId: lead.id, userId: user.id, phone: lead.phone, status: res.ok ? 'ringing' : 'failed', externalId: res.uuid || null });
    if (!res.ok) throw new ServiceUnavailableException({ error: 'PBX_REJECTED', message: 'OnlinePBX: ' + (res.comment || 'qo`ng`iroq boshlanmadi') });
    return { ok: true, call: log };
  }

  /**
   * Chiquvchi qo'ng'iroq yozuvi (click-to-call / dialer). Provayder hodisasi (CDR/webhook) shu uuid bilan oldinroq kelib yozuv yaratgan bo'lishi mumkin —
   * unda dublikat emas, mavjudiga lid/xodim bog'lanadi (holat o'zgarmaydi).
   */
  private async logOutgoing(d: { leadId: string | null; userId: string; phone: string; status: string; externalId: string | null }) {
    const data = { leadId: d.leadId, userId: d.userId, phone: d.phone, direction: 'out', status: d.status, externalId: d.externalId, handled: true };
    if (!d.externalId) return this.prisma.callLog.create({ data });
    const upd = { userId: d.userId, handled: true, ...(d.leadId ? { leadId: d.leadId } : {}) };
    try {
      return await this.prisma.callLog.upsert({ where: { externalId: d.externalId }, create: data, update: upd });
    } catch (e) {
      if (!isP2002(e)) throw e;
      return this.prisma.callLog.update({ where: { externalId: d.externalId }, data: upd });
    }
  }

  // ── Dialer (widget) — ixtiyoriy raqamga qo'ng'iroq (callback). Lid topilса — bog'lanadi. ──
  async dial(user: AuthUser, to: string) {
    const num = (to || '').trim();
    if (!num) throw new BadRequestException({ error: 'NO_PHONE', message: 'Raqam kiriting' });
    // faqat raqam (ixtiyoriy +, bo'shliq/chiziqcha): `100@trunk`, `;`, harflar — rad (toll-fraud / in'ektsiya)
    if (!dialable(num)) throw new BadRequestException({ error: 'BAD_PHONE', message: "Raqam noto'g'ri (faqat raqamlar, ixtiyoriy +)" });
    if (!(await this.pbx.enabled())) {
      throw new ServiceUnavailableException({ error: 'PBX_DISABLED', message: 'OnlinePBX sozlanmagan: CRM → Sozlamalar → Telefoniya.' });
    }
    const dbUser = await this.prisma.user.findUnique({ where: { id: user.id }, select: { extension: true } });
    const cfg = await this.cfg.get();
    const from = (dbUser?.extension || cfg.defaultExt || '').trim();
    if (!from) throw new BadRequestException({ error: 'NO_EXTENSION', message: 'Ichki raqamingiz belgilanmagan.' });
    if (!EXT_RE.test(from)) throw new BadRequestException({ error: 'BAD_EXTENSION', message: "Ichki raqam 2–5 xonali bo'lishi kerak" });

    let res: { ok: boolean; uuid?: string; comment?: string };
    try {
      res = await this.pbx.call(from, num);
    } catch (e) {
      this.logger.error('OnlinePBX dial xatosi: ' + (e as Error).message);
      throw new ServiceUnavailableException({ error: 'PBX_ERROR', message: 'OnlinePBX bilan bog`lanib bo`lmadi' });
    }
    const lead = await this.findLeadByPhone(num);
    const log = await this.logOutgoing({ leadId: lead?.id || null, userId: user.id, phone: num, status: res.ok ? 'ringing' : 'failed', externalId: res.uuid || null });
    if (!res.ok) throw new ServiceUnavailableException({ error: 'PBX_REJECTED', message: 'OnlinePBX: ' + (res.comment || 'qo`ng`iroq boshlanmadi') });
    return { ok: true, call: log, leadId: lead?.id || null, leadName: lead?.name || null };
  }

  // ── Softphone rejim: MicroSIP o'zi teradi. CallLog YARATMAYMIZ — qo'ng'iroq OnlinePBX
  // tarixidan O'Z uuid'i (va aynan o'z yozuvi) bilan keladi. Bu yerda faqat raqamni
  // qaytaramiz. (Oldin oldindan log yozardik va uuid'ni taxminan biriktirardik — bu
  // bir raqamga bir necha qo'ng'iroqда yozuvlar almashib ketishiga sabab bo'lardi.) ──
  async softLog(_user: AuthUser, opts: { leadId?: string; to?: string }) {
    let phone = (opts.to || '').trim();
    if (opts.leadId && !phone) {
      const lead = await this.prisma.lead.findUnique({ where: { id: opts.leadId }, select: { phone: true } });
      phone = lead?.phone || '';
    }
    // Qaysi liddan qo'ng'iroq boshlangani — webhook shu lidga bog'lasin (dublikat raqamlar uchun)
    if (opts.leadId && phone) {
      const tail = digits(phone).slice(-9);
      if (tail.length >= 7) {
        this.pendingIntents.push({ leadId: opts.leadId, tail, at: Date.now() });
        if (this.pendingIntents.length > 100) this.pendingIntents = this.pendingIntents.slice(-50);
      }
    }
    return { ok: true, phone };
  }

  // Qo'ng'iroqni to'g'ri lidga bog'laydi: avval "Qo'ng'iroq" bosilgan lid (intent), keyin raqam bo'yicha.
  private async resolveLead(phone: string, other: string, direction?: string): Promise<{ id: string; name: string } | null> {
    const tails = [digits(phone).slice(-9), digits(other).slice(-9)].filter((t) => t.length >= 7);
    const cutoff = Date.now() - 5 * 60_000;
    // «Qo'ng'iroq» bosilgan niyat faqat CHIQUVCHI qo'ng'iroqqa tegishli va webhook uuid'i uchun bir marta ishlatiladi
    for (let i = this.pendingIntents.length - 1; i >= 0 && direction !== 'in'; i--) {
      const p = this.pendingIntents[i];
      if (p.at < cutoff) continue;
      if (tails.includes(p.tail)) {
        const l = await this.prisma.lead.findUnique({ where: { id: p.leadId }, select: { id: true, name: true } });
        if (l) return l;
      }
    }
    return this.leadByEither(phone, other);
  }

  // ── OnlinePBX tarixidan sync (yozuvlar webhooksiz ham chiqishi uchun) ──
  // mongo_history/search.json — so'nggi qo'ng'iroqlarni tortib, CallLog'ga yozadi (uuid → yozuv).
  async syncHistory(opts?: { force?: boolean; days?: number; minutes?: number }) {
    if (!(await this.pbx.enabled())) return { ok: false, synced: 0 };
    const now = Date.now();
    if (!opts?.force && now - this.lastHistorySync < 2_500) return { ok: true, synced: 0, skipped: true };
    if (this.syncing) return { ok: true, synced: 0, skipped: true }; // oldingi sinxronlash tugamagan — ustma-ust tushmasin
    this.syncing = true;
    try { return await this.syncHistoryRun(opts, now); } finally { this.syncing = false; }
  }
  private syncing = false;
  private async syncHistoryRun(opts: { force?: boolean; days?: number; minutes?: number } | undefined, now: number) {
    this.lastHistorySync = now;

    const nowSec = Math.floor(now / 1000);
    const span = opts?.minutes && opts.minutes > 0
      ? opts.minutes * 60
      : Math.min((opts?.days && opts.days > 0 ? opts.days : 1) * 24 * 3600, 7 * 24 * 3600);
    const fromSec = nowSec - span;

    let records: PbxCall[] = [];
    try {
      records = await this.pbx.history({ start_stamp_from: String(fromSec), start_stamp_to: String(nowSec), limit: '500' });
    } catch (e) {
      const msg = (e as Error).message;
      this.logger.warn('OnlinePBX history sync xato: ' + msg);
      return { ok: false, synced: 0, error: msg };
    }

    let synced = 0;
    let linked = 0;
    for (const r of records) {
      const uuid = r.uuid;
      if (!uuid) continue;
      const { direction, phone: xphone, other } = this.parties(r.caller, r.callee, r.accountHint);
      const phone = xphone || r.callee || r.caller;
      if (!phone) continue;

      const talk = r.talkSec;
      const durationSec = r.durationSec || talk || 0;
      const hangup = r.hangup;
      // Gaplashildi -> completed; band/rad -> failed; aks holda (gaplashilmagan) -> o'tkazib yuborilgan.
      let status: string;
      if (talk > 0) status = 'completed';
      else if (/busy|reject|fail|занят|отклон|congestion/.test(hangup)) status = 'failed';
      else status = 'missed';
      const recordUrl = r.recordUrl;
      const startedAt = r.startedAt;

      // Lidga bog'lash — avval "Qo'ng'iroq" bosilgan lid, keyin raqam bo'yicha (dublikat uchun)
      const lead0 = await this.resolveLead(phone, other);

      // eski tarix (birinchi ulanishda) uchun vazifa yaratmaymiz — faqat so'nggi sutka
      const recent = !startedAt || Date.now() - +startedAt < 86_400_000;
      const existing = await this.prisma.callLog.findUnique({ where: { externalId: uuid } });
      if (existing) {
        // eski tarix (birinchi ulanish / 7 kunlik sinxron) uchun yangi lid YARATILMAYDI — faqat mavjud lidga bog'lanadi
        const relink = existing.leadId || lead0?.id || (recent ? (await this.ensureCallerLead(direction, phone, null))?.id : null) || null;
        await this.prisma.callLog.update({
          where: { id: existing.id },
          data: { status, durationSec: durationSec || existing.durationSec, talkSec: talk || existing.talkSec, hangup: hangup || existing.hangup, recordUrl: recordUrl || existing.recordUrl, leadId: relink, handled: true },
        });
        if (relink && direction === 'in' && status === 'missed' && existing.status !== 'missed' && recent) await this.missedCallTask(relink, phone);
        if (relink) linked++;
        continue;
      }
      const lead = recent ? await this.ensureCallerLead(direction, phone, lead0) : lead0;
      try {
        await this.prisma.callLog.create({
          data: { externalId: uuid, phone, direction, status, durationSec, talkSec: talk, hangup: hangup || null, recordUrl, leadId: lead?.id || null, userId: await this.userIdByExt(other), handled: true, startedAt },
        });
      } catch (e) {
        if (isP2002(e)) continue; // parallel webhook allaqachon yozdi
        throw e;
      }
      synced++;
      if (lead) linked++;
      if (lead && direction === 'in' && status === 'missed' && recent) await this.missedCallTask(lead.id, phone);
      // avtomatlashtirish (xabar yuborish va h.k.) faqat yangi qo'ng'iroqlarda — eski tarix uchun mijozga xabar ketmasin
      if (lead && direction === 'in' && recent) await this.automation.fire('call_in', lead.id, { actorName: 'OnlinePBX' });
    }
    if (synced) this.logger.log(`OnlinePBX history sync: jami ${records.length}, yangi ${synced}, lidga bog'langan ${linked}`);
    return { ok: true, synced, total: records.length, linked };
  }

  // ── Barcha qo'ng'iroqlar ro'yxati (CRM "Qo'ng'iroqlar" bo'limi) ──
  async listCalls(opts?: { filter?: string; limit?: number }, userId?: string) {
    await this.syncHistory({ minutes: 60 }).catch(() => {}); // yangi qo'ng'iroqlarni tortamiz (throttle)
    const where = opts?.filter === 'missed' ? { status: 'missed', direction: 'in' } : {};
    let rows = await this.prisma.callLog.findMany({
      where, orderBy: { startedAt: 'desc' }, take: Math.min(opts?.limit || 200, 500),
    });
    // amoCRM «Права доступа»: cheklangan foydalanuvchi faqat ko'rinadigan bitimlar yoki o'z qo'ng'iroqlarini ko'radi
    const vis = await this.rights.visibleLeadIds(userId, [...new Set(rows.map((r) => r.leadId).filter(Boolean) as string[])]);
    if (vis) rows = rows.filter((r) => r.userId === userId || (r.leadId && vis.has(r.leadId)));
    const leadIds = [...new Set(rows.map((r) => r.leadId).filter(Boolean) as string[])];
    const leads = leadIds.length
      ? await this.prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, name: true } })
      : [];
    const nameMap = new Map(leads.map((l) => [l.id, l.name]));
    // «O'tkazib yuborilganlar» soni ham huquq bo'yicha (cheklangan foydalanuvchi boshqalarnikini sanamaydi)
    let missedCount: number;
    if (!vis) missedCount = await this.prisma.callLog.count({ where: { status: 'missed', direction: 'in' } });
    else {
      const ms = await this.prisma.callLog.findMany({ where: { status: 'missed', direction: 'in' }, select: { leadId: true, userId: true }, orderBy: { startedAt: 'desc' }, take: 5000 });
      const v2 = await this.rights.visibleLeadIds(userId, [...new Set(ms.map((r) => r.leadId).filter(Boolean) as string[])]);
      missedCount = ms.filter((r) => r.userId === userId || (r.leadId && (!v2 || v2.has(r.leadId)))).length;
    }
    const recs = await this.recMap(rows, await this.ownProvider());
    return {
      calls: rows.map((c) => ({
        ...c,
        leadName: c.leadId ? nameMap.get(c.leadId) || null : null,
        hasRecording: recs.get(c.id) || false,
      })),
      missedCount,
    };
  }

  private async ownProvider() { return (await this.cfg.get()).provider === 'own'; }
  /**
   * Yozuv bormi: o'z stansiyamizda — saqlangan havola (recordUrl) bo'lsa VA fayl hali diskda bo'lsa (saqlash muddati o'tib o'chirilgan bo'lsa —
   * «yozuv mavjud emas»); OnlinePBX'da — uuid bo'yicha ham olinadi.
   */
  private async recMap(rows: { id: string; externalId: string | null; recordUrl: string | null }[], own: boolean): Promise<Map<string, boolean>> {
    const out = new Map<string, boolean>();
    await Promise.all(rows.map(async (c) => {
      out.set(c.id, own ? !!c.recordUrl && (await this.own.hasRecordingFile(c.recordUrl).catch(() => false)) : !!(c.externalId || c.recordUrl));
    }));
    return out;
  }

  /** Hisobot davri: noto'g'ri sana / from>to / juda uzun davr — 400. */
  private range(q: Record<string, string | undefined>, defFromDays: number, maxDays: number) {
    const today = parseDay(new Date(Date.now() + TZ_MS).toISOString().slice(0, 10), 'today')!;
    const f = parseDay(q.from, 'from'), t = parseDay(q.to, 'to');
    const fromMs = f ?? (t ?? today) - defFromDays * DAY_MS;
    const toMs = (t ?? (defFromDays === 0 ? fromMs : today)) + DAY_MS;
    if (toMs <= fromMs) throw new BadRequestException({ error: 'BAD_RANGE', message: "Boshlanish sanasi tugash sanasidan keyin bo'lmasin" });
    if (toMs - fromMs > maxDays * DAY_MS) throw new BadRequestException({ error: 'RANGE', message: `Davr ${maxDays} kundan oshmasin` });
    return { fromMs, toMs };
  }

  /**
   * «Звонки» jurnali (OnlinePBX uslubida): davr/xodim/telefon/davomiylik filtrlari, plitalar (Hammasi, Kiruvchi, Chiquvchi, Ichki, O'tkazib yuborilgan,
   * Qayta qo'ng'iroq qilinmagan, Dodozvon bo'lmagan, Baholi) va jami. Kunlar akkaunt vaqti (Toshkent, UTC+5) bo'yicha.
   */
  async callsReport(q: Record<string, string | undefined>, userId?: string) {
    const TZ = TZ_MS;
    const { fromMs, toMs } = this.range(q, 0, 366);
    const n = (v?: string) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : undefined);
    const where: Record<string, any> = { startedAt: { gte: new Date(fromMs), lt: new Date(toMs) } };
    const ph = String(q.phone || '').replace(/\D/g, '');
    if (ph.length >= 3) where.phone = { contains: ph };
    if (q.ext) {
      if (!EXT_RE.test(String(q.ext))) throw new BadRequestException({ error: 'BAD_EXTENSION', message: "Ichki raqam 2–5 xonali bo'lishi kerak" });
      const u = await this.prisma.user.findFirst({ where: { extension: String(q.ext) }, select: { id: true } });
      where.userId = u?.id ?? '__none__';
    }
    const dMin = n(q.durMin), dMax = n(q.durMax), tMin = n(q.talkMin), tMax = n(q.talkMax);
    if (dMin !== undefined || dMax !== undefined) where.durationSec = { ...(dMin !== undefined ? { gte: dMin } : {}), ...(dMax !== undefined ? { lte: dMax } : {}) };
    if (tMin !== undefined || tMax !== undefined) where.talkSec = { ...(tMin !== undefined ? { gte: tMin } : {}), ...(tMax !== undefined ? { lte: tMax } : {}) };
    if (q.rating && Number(q.rating) >= 1 && Number(q.rating) <= 5) where.rating = Number(q.rating);

    // Juda ko'p yozuv bo'lsa — kesiladi va javobda `truncated: true` (plitalar shu qism bo'yicha); davrni toraytirish kerak
    const LIMIT = 5000;
    let rows = await this.prisma.callLog.findMany({ where, orderBy: { startedAt: 'desc' }, take: LIMIT + 1 });
    const truncated = rows.length > LIMIT;
    if (truncated) rows = rows.slice(0, LIMIT);
    const vis = await this.rights.visibleLeadIds(userId, [...new Set(rows.map((r) => r.leadId).filter(Boolean) as string[])]);
    if (vis) rows = rows.filter((r) => r.userId === userId || (r.leadId && vis.has(r.leadId)));

    const isInternal = (r: { phone: string }) => isInternalNumber(r.phone);
    // «Qayta qo'ng'iroq qilinmagan»: o'tkazib yuborilgan kiruvchidan keyin shu raqamga chiquvchi qo'ng'iroq bo'lmagan.
    // Raqamlar normallashtirib solishtiriladi (+998… / 998… / 90…): oxirgi 9 raqam (phoneTail ustuni yo'q — `endsWith` bilan tanlab, keyin kalit bo'yicha)
    const missedIn = rows.filter((r) => r.direction === 'in' && r.status === 'missed');
    const keys = [...new Set(missedIn.map((r) => phoneKey(r.phone)).filter((k) => k.length >= 3))];
    const outs = keys.length
      ? (await this.prisma.callLog.findMany({ where: { direction: 'out', startedAt: { gte: new Date(fromMs) }, OR: keys.slice(0, 500).map((k) => ({ phone: { endsWith: k } })) }, select: { phone: true, startedAt: true }, take: 20000 }))
      : [];
    const outsBy = new Map<string, Date[]>();
    for (const o of outs) { const k = phoneKey(o.phone); const a = outsBy.get(k) || []; a.push(o.startedAt); outsBy.set(k, a); }
    const calledBack = (r: { phone: string; startedAt: Date }) => (outsBy.get(phoneKey(r.phone)) || []).some((d) => d > r.startedAt);
    const kindOf = (r: (typeof rows)[number]): string[] => {
      const k = ['all'];
      if (isInternal(r)) k.push('internal'); else k.push(r.direction === 'in' ? 'in' : 'out');
      if (r.direction === 'in' && r.status === 'missed') { k.push('missed'); if (!calledBack(r)) k.push('notcalledback'); }
      if (r.direction === 'out' && r.talkSec === 0 && r.status !== 'ringing') k.push('notanswered');
      if (r.rating) k.push('rated');
      return k;
    };
    const tiles: Record<string, number> = { all: 0, in: 0, out: 0, internal: 0, missed: 0, notcalledback: 0, notanswered: 0, rated: 0 };
    const tagged = rows.map((r) => ({ r, kinds: kindOf(r) }));
    for (const t of tagged) for (const k of t.kinds) tiles[k]++;
    const kind = q.kind && q.kind in tiles ? q.kind : 'all';
    let list = tagged.filter((t) => t.kinds.includes(kind)).map((t) => t.r);
    if (q.tab === 'talks') list = list.filter((r) => r.talkSec > 0);

    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(list.map((r) => r.userId).filter(Boolean) as string[])] } }, select: { id: true, name: true, extension: true } });
    const uMap = new Map(users.map((u) => [u.id, u]));
    const leadIds = [...new Set(list.map((r) => r.leadId).filter(Boolean) as string[])];
    const leads = leadIds.length ? await this.prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, name: true } }) : [];
    const lMap = new Map(leads.map((l) => [l.id, l.name]));
    const talk = list.reduce((a, r) => a + r.talkSec, 0);
    const roundedMin = list.reduce((a, r) => a + (r.talkSec > 0 ? Math.ceil(r.talkSec / 60) : 0), 0);
    const total = list.reduce((a, r) => a + r.durationSec, 0);
    const RESULT: [RegExp, string][] = [[/voicemail/, 'Ovozli pochta'], [/busy|занят/, 'Band'], [/reject|отклон/, 'Rad etildi'], [/fail|congestion/, 'Xato'], [/cancel|no.?answer|не отвеч/, 'Javob berilmadi']];
    const page = list.slice(0, Math.min(Number(q.limit) || 200, 500));
    const recs = await this.recMap(page, await this.ownProvider());
    return {
      range: { from: new Date(fromMs + TZ).toISOString().slice(0, 10), to: new Date(toMs - 86_400_000 + TZ).toISOString().slice(0, 10) },
      truncated,
      tiles,
      calls: page.map((r) => {
        const u = r.userId ? uMap.get(r.userId) : undefined;
        return {
          id: r.id, kind: isInternal(r) ? 'internal' : r.direction, status: r.status, at: r.startedAt.toISOString(), phone: r.phone,
          userName: u?.name || null, ext: u?.extension || null, leadId: r.leadId, leadName: r.leadId ? lMap.get(r.leadId) || null : null,
          ringSec: Math.max(0, r.durationSec - r.talkSec), talkSec: r.talkSec, rating: r.rating,
          result: r.hangup ? (RESULT.find(([re]) => re.test(r.hangup!))?.[1] || null) : null, hasRecording: recs.get(r.id) || false,
        };
      }),
      totals: { count: list.length, talkSec: talk, roundedMinutes: roundedMin, totalSec: total },
    };
  }

  /**
   * Qo'ng'iroq hisobotlari (OnlinePBX «Отчёты» uslubida): xodimlar guruhi, bitta xodim, o'tkazib yuborilganlar, muvaffaqiyatli/muvaffaqiyatsiz.
   * Davr — Toshkent kunlari (from/to), ixtiyoriy ext (ichki raqam). Huquq: faqat ko'rinadigan qo'ng'iroqlar.
   */
  async callsStats(q: Record<string, string | undefined>, userId?: string) {
    const TZ = TZ_MS;
    const { fromMs, toMs } = this.range(q, 6, 93);
    if (q.ext && !EXT_RE.test(String(q.ext))) throw new BadRequestException({ error: 'BAD_EXTENSION', message: "Ichki raqam 2–5 xonali bo'lishi kerak" });
    const LIMIT = 20000;
    let rows = await this.prisma.callLog.findMany({ where: { startedAt: { gte: new Date(fromMs), lt: new Date(toMs) } }, orderBy: { startedAt: 'asc' }, take: LIMIT + 1 });
    const truncated = rows.length > LIMIT;
    if (truncated) rows = rows.slice(0, LIMIT);
    const vis = await this.rights.visibleLeadIds(userId, [...new Set(rows.map((r) => r.leadId).filter(Boolean) as string[])]);
    if (vis) rows = rows.filter((r) => r.userId === userId || (r.leadId && vis.has(r.leadId)));
    const users = await this.prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, extension: true } });
    const uById = new Map(users.map((u) => [u.id, u]));
    let scope = rows;
    if (q.ext) { const u = users.find((x) => x.extension === q.ext); scope = u ? rows.filter((r) => r.userId === u.id) : []; }
    const dayKey = (d: Date) => new Date(d.getTime() + TZ).toISOString().slice(0, 10);
    const isInt = (r: { phone: string }) => isInternalNumber(r.phone);
    const days: string[] = [];
    for (let t = fromMs; t < toMs; t += 86_400_000) days.push(new Date(t + TZ).toISOString().slice(0, 10));
    const series = days.map((d) => ({ day: d, in: 0, out: 0, internal: 0, missed: 0, talkMin: 0 }));
    const sIdx = new Map(series.map((x) => [x.day, x]));
    const perUser = new Map<string, { id: string; name: string; ext: string | null; in: number; out: number; missed: number; answered: number; talkSec: number; ratings: number[] }>();
    for (const r of scope) {
      const s = sIdx.get(dayKey(r.startedAt));
      if (s) { if (isInt(r)) s.internal++; else if (r.direction === 'in') s.in++; else s.out++; if (r.direction === 'in' && r.status === 'missed') s.missed++; s.talkMin += r.talkSec / 60; }
      const u = r.userId ? uById.get(r.userId) : undefined;
      const key = u?.id || '—';
      const e = perUser.get(key) || { id: key, name: u?.name || '—', ext: u?.extension || null, in: 0, out: 0, missed: 0, answered: 0, talkSec: 0, ratings: [] as number[] };
      if (r.direction === 'in') e.in++; else e.out++;
      if (r.direction === 'in' && r.status === 'missed') e.missed++;
      if (r.talkSec > 0) e.answered++;
      e.talkSec += r.talkSec;
      if (r.rating) e.ratings.push(r.rating);
      perUser.set(key, e);
    }
    const employees = [...perUser.values()].map((e) => ({
      id: e.id, name: e.name, ext: e.ext, in: e.in, out: e.out, missed: e.missed, total: e.in + e.out, answered: e.answered, talkSec: e.talkSec,
      avgTalkSec: e.answered ? Math.round(e.talkSec / e.answered) : 0, avgRating: e.ratings.length ? Math.round((e.ratings.reduce((a, b) => a + b, 0) / e.ratings.length) * 10) / 10 : null, ratings: e.ratings.length,
    })).sort((a, b) => b.total - a.total);
    // o'tkazib yuborilganlar: qayta qo'ng'iroq kechikishi
    const outsByPhone = new Map<string, Date[]>();
    for (const r of rows) if (r.direction === 'out') { const k = phoneKey(r.phone); const a = outsByPhone.get(k) || []; a.push(r.startedAt); outsByPhone.set(k, a); }
    const missed = scope.filter((r) => r.direction === 'in' && r.status === 'missed' && !isInt(r)).map((r) => {
      const next = (outsByPhone.get(phoneKey(r.phone)) || []).find((d) => d > r.startedAt);
      return { id: r.id, at: r.startedAt.toISOString(), phone: r.phone, waitSec: r.durationSec, callbackSec: next ? Math.round((next.getTime() - r.startedAt.getTime()) / 1000) : null };
    });
    const cb = missed.filter((m) => m.callbackSec !== null) as (typeof missed[number] & { callbackSec: number })[];
    const real = scope.filter((r) => !isInt(r) && r.status !== 'ringing');
    return {
      range: { from: days[0], to: days[days.length - 1] }, truncated, series, employees,
      missed: { list: missed.slice(-200).reverse(), count: missed.length, calledBack: cb.length, calledBack15: cb.filter((m) => m.callbackSec <= 900).length, avgCallbackSec: cb.length ? Math.round(cb.reduce((a, m) => a + m.callbackSec, 0) / cb.length) : null, avgWaitSec: missed.length ? Math.round(missed.reduce((a, m) => a + m.waitSec, 0) / missed.length) : 0 },
      outcomes: { success: real.filter((r) => r.talkSec > 0).length, missedIn: real.filter((r) => r.direction === 'in' && r.talkSec === 0).length, failedOut: real.filter((r) => r.direction === 'out' && r.talkSec === 0).length, total: real.length },
    };
  }

  // ── Lid qo'ng'iroqlari tarixi ──
  async leadCalls(leadId: string) {
    await this.syncHistory({ minutes: 15 }).catch(() => {}); // har pollда OnlinePBX'dan tortamiz (throttle ~2.5s)
    const calls = await this.prisma.callLog.findMany({ where: { leadId }, orderBy: { startedAt: 'desc' }, take: 100 });
    // hasRecording — yozuvni server orqali olib bo'ladimi (uuid yoki havola bor)
    const recs = await this.recMap(calls, await this.ownProvider());
    return { calls: calls.map((c) => ({ ...c, hasRecording: recs.get(c.id) || false })) };
  }

  // ── Qo'ng'iroq yozuvini server orqali olib berish (chatda ijro uchun) ──
  async getRecording(callId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const call = await this.prisma.callLog.findUnique({ where: { id: callId } });
    if (!call) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Qo`ng`iroq topilmadi' });
    if (!(await this.pbx.enabled())) {
      throw new ServiceUnavailableException({ error: 'PBX_DISABLED', message: 'OnlinePBX sozlanmagan' });
    }
    let rec: { buffer: Buffer; contentType: string } | null = null;
    // 1) uuid bo'yicha yangi havola (muddati o'tmaydi)
    if (call.externalId) rec = await this.pbx.fetchRecording(call.externalId);
    // 2) bo'lmasa — saqlangan to'g'ridan-to'g'ri havola
    if (!rec && call.recordUrl) rec = await this.pbx.fetchRecording(call.recordUrl);
    if (!rec) throw new NotFoundException({ error: 'NO_RECORDING', message: 'Bu qo`ng`iroq uchun yozuv topilmadi' });
    return rec;
  }

  // ── Kiruvchi qo'ng'iroq (popup uchun poll) ──
  // So'nggi 45 soniyadagi belgilanmagan kiruvchi qo'ng'iroqni qaytaradi.
  async incoming(userId?: string) {
    const since = new Date(Date.now() - 45_000);
    const calls = await this.prisma.callLog.findMany({
      where: { direction: 'in', handled: false, startedAt: { gte: since } },
      orderBy: { startedAt: 'desc' },
      take: 5,
    });
    // amoCRM «Права доступа»: cheklangan foydalanuvchiga faqat ko'ra oladigan bitim (yoki hali saralanmagan yangi raqam) qo'ng'irog'i
    let call: (typeof calls)[number] | null = calls[0] ?? null;
    const own = await this.rights.ownersById(userId, 'leads', 'view');
    if (own && calls.length) {
      const leads = await this.prisma.lead.findMany({ where: { id: { in: calls.map((c) => c.leadId).filter(Boolean) as string[] } }, select: { id: true, assigneeId: true, unsorted: true } });
      const okIds = new Set(leads.filter((l) => l.unsorted || (l.assigneeId && own.includes(l.assigneeId))).map((l) => l.id));
      call = calls.find((c) => !c.leadId || okIds.has(c.leadId)) || null;
    }
    if (!call) return { call: null };
    let leadName: string | null = null;
    if (call.leadId) {
      const l = await this.prisma.lead.findUnique({ where: { id: call.leadId }, select: { name: true } });
      leadName = l?.name || null;
    }
    return { call: { ...call, leadName } };
  }

  // Kiruvchi oynani "ko'rsatilgan" deb belgilash
  async dismissIncoming(id: string) {
    await this.prisma.callLog.updateMany({ where: { id }, data: { handled: true } });
    return { ok: true };
  }

  // ── Operator ichki raqami (extension) ──
  async getMyExtension(user: AuthUser) {
    const u = await this.prisma.user.findUnique({ where: { id: user.id }, select: { extension: true } });
    // qo'ng'iroq usuli ham shu yerda: pbx/config faqat admin uchun, sotuvchi esa kartochkadan qo'ng'iroq qilishi kerak
    const c = await this.cfg.get();
    return { extension: u?.extension || null, pbxEnabled: await this.pbx.enabled(), callMode: c.callMode || 'callback', dialScheme: c.dialScheme || 'tel', popups: c.popups !== false };
  }
  async setMyExtension(user: AuthUser, extension: string) {
    const ext = await this.checkExtension(user, extension);
    await this.prisma.user.update({ where: { id: user.id }, data: { extension: ext } });
    return { ok: true, extension: ext };
  }

  /**
   * Ichki raqamni tekshirish (toll-fraud: raqam Originate `Channel: PJSIP/<ext>` ga tushadi):
   * 2–5 xonali son; boshqa foydalanuvchida bo'lmasin; o'z stansiyamizda — shu foydalanuvchiga biriktirilgan «Пользователь» moduli bo'lishi shart.
   */
  private async checkExtension(user: AuthUser, raw: unknown): Promise<string | null> {
    const ext = String(raw ?? '').trim();
    if (!ext) return null;
    if (!EXT_RE.test(ext)) throw new BadRequestException({ error: 'BAD_EXTENSION', message: "Ichki raqam 2–5 xonali son bo'lishi kerak" });
    const taken = await this.prisma.user.findFirst({ where: { extension: ext, id: { not: user.id } }, select: { id: true } });
    if (taken) throw new ConflictException({ error: 'EXTENSION_TAKEN', message: 'Bu ichki raqam boshqa xodimga biriktirilgan' });
    if (await this.ownProvider()) {
      const m = await this.prisma.pbxModule.findUnique({ where: { number: ext }, select: { type: true, configJson: true } });
      let owner: unknown = null;
      try { owner = m ? JSON.parse(m.configJson).crmUserId : null; } catch { /* */ }
      if (!m || m.type !== 'user') throw new BadRequestException({ error: 'NO_SUCH_EXTENSION', message: 'Bunday ichki raqam (Пользователь moduli) yo`q' });
      if (owner !== user.id) throw new ForbiddenException({ error: 'EXTENSION_NOT_YOURS', message: 'Ichki raqam sizga biriktirilmagan (Telefoniya → Пользователь modulida biriktiriladi)' });
    }
    return ext;
  }

  // Telefon raqami bo'yicha lid (WebRTC kiruvchi kartasida nomni ko'rsatish uchun)
  async leadByPhonePublic(phone: string, userId?: string) {
    const m = await this.findLeadByPhone(phone || '');
    const vis = m ? await this.rights.visibleLeadIds(userId, [m.id]) : null;
    if (m && vis && !vis.has(m.id)) return { leadId: null, leadName: null }; // ko'rish huquqi yo'q bitim nomi chiqmasin
    return { leadId: m?.id || null, leadName: m?.name || null };
  }

  // ── Brauzer WebRTC-telefoni (JsSIP) sozlamasi ──
  // wss://{domen}:7443, sip:{ext}@{domen}, operator SIP paroli. Faqat egasiga qaytariladi.
  async getWebrtcConfig(user: AuthUser) {
    const cfg = await this.cfg.get();
    const u = await this.prisma.user.findUnique({ where: { id: user.id }, select: { extension: true, sipPassword: true } });
    // o'z stansiyamiz (Asterisk) tanlangan bo'lsa — brauzer telefoni shu serverning WSS (PJSIP WebSocket) manziliga ulanadi
    const own = cfg.provider === 'own';
    const ownHost = (process.env.PBX_SIP_HOST || (() => { try { return new URL(process.env.PUBLIC_URL || '').hostname; } catch { return ''; } })()).trim();
    const domain = own ? ownHost : cfg.domain || '';
    const ext = (u?.extension || cfg.defaultExt || '').trim();
    const enabled = !!domain && !!ext && !!u?.sipPassword;
    return {
      enabled,
      domain,
      wss: domain ? (own ? `wss://${domain}${Number(process.env.PBX_WSS_PORT) ? ':' + Number(process.env.PBX_WSS_PORT) : ''}/ws` : `wss://${domain}:7443`) : '',
      // o'z stansiyada brauzer telefoni alohida «<raqam>-web» endpoint'ga ro'yxatdan o'tadi (WebRTC); OnlinePBX — oddiy raqam
      uri: domain && ext ? `sip:${ext}${own ? '-web' : ''}@${domain}` : '',
      extension: ext,
      password: u?.sipPassword || '',
      sipPasswordSet: !!u?.sipPassword,
      displayName: user.name,
    };
  }
  async saveWebrtcConfig(user: AuthUser, dto: { extension?: string; sipPassword?: string }) {
    const data: Record<string, unknown> = {};
    if (dto.extension !== undefined) data.extension = await this.checkExtension(user, dto.extension);
    if (dto.sipPassword) {
      // o'z stansiyamizda SIP parolini server yaratadi (Пользователь moduli biriktirilganda) — foydalanuvchi o'zgartira olmaydi
      if (await this.ownProvider()) throw new BadRequestException({ error: 'SIP_PASSWORD_MANAGED', message: "O'z stansiyada SIP paroli avtomatik yaratiladi" });
      // OnlinePBX: parol OnlinePBX panelidan olinadi — kamida 8 belgi, bo'shliq/nazorat belgilarisiz
      const pw = String(dto.sipPassword).trim();
      if (pw.length < 8 || pw.length > 64 || /[\x00-\x20\x7f;"\\]/.test(pw)) throw new BadRequestException({ error: 'WEAK_SIP_PASSWORD', message: "SIP paroli 8–64 belgi, bo'shliq va ; \" \\ belgilarisiz bo'lsin" });
      data.sipPassword = pw;
    }
    await this.prisma.user.update({ where: { id: user.id }, data });
    return this.getWebrtcConfig(user);
  }

  // ── Webhook (OnlinePBX hodisalari) ──
  // webhook maxfiy kaliti: sozlamadagi secret yoki API kalitidan hosil qilingan (secret berilmasa ham webhook ochiq qolmasin)
  private effectiveSecret(c: { webhookSecret?: string; apiKey?: string }): string {
    if (c.webhookSecret) return c.webhookSecret;
    return c.apiKey ? createHash('sha256').update(`crm-pbx-webhook:${c.apiKey}`).digest('hex').slice(0, 32) : '';
  }

  async handleWebhook(body: any, secret?: string) {
    const cfg = await this.cfg.get();
    // PBX ulanmagan bo'lsa — begona so'rovlar CRM'da qo'ng'iroq/bitim yarata olmasin
    if (!cfg.domain || !cfg.apiKey) return { ok: true, skipped: true };
    const want = Buffer.from(this.effectiveSecret(cfg));
    const got = Buffer.from(String(secret || ''));
    if (!want.length || want.length !== got.length || !timingSafeEqual(want, got)) {
      this.logger.warn('OnlinePBX webhook: secret mos emas — rad etildi');
      return { ok: false, error: 'BAD_SECRET' };
    }
    return this.processCallEvent(body);
  }

  /** Qo'ng'iroq hodisasini qayta ishlash (OnlinePBX webhook yoki o'z stansiyamiz CDR'si). Autentifikatsiya chaqiruvchi tomonda. */
  async processCallEvent(body: any) {
    // OnlinePBX turli formatda yuborishi mumkin — bir nechta kalitni tekshiramiz.
    const get = (...keys: string[]) => {
      for (const k of keys) {
        const v = k.split('.').reduce((o: any, p) => (o == null ? o : o[p]), body);
        if (v !== undefined && v !== null && v !== '') return v;
      }
      return undefined;
    };

    // OnlinePBX docs maydonlari: accountcode (inbound|outbound|missed),
    // caller_id_number, destination_number, duration, user_talk_time, hangup_cause, uuid.
    const account = String(get('accountcode', 'type', 'call_type', 'direction', 'event') || '').toLowerCase();
    // OnlinePBX call_end webhook: caller/callee, call_duration/dialog_duration, download_url.
    const caller = String(get('caller', 'caller_id_number', 'caller_id', 'from', 'src', 'from_number') || '');
    const callee = String(get('callee', 'destination_number', 'callee_id', 'to', 'dst', 'did', 'to_number') || '');
    // Ichki/tashqi raqamни ajratib yo'nalish va mijoz raqamini aniqlaymiz (syncHistory bilan bir xil).
    const { direction, phone: xphone, other } = this.parties(caller, callee, account);
    const phone = xphone || callee || caller;

    const talk = Number(get('dialog_duration', 'user_talk_time', 'billsec')) || 0;
    const durationSec = Number(get('call_duration', 'duration')) || talk || 0;
    const hangup = String(get('hangup_cause', 'disposition', 'status', 'result') || '').toLowerCase();

    const externalId = get('uuid', 'call_id', 'callid', 'id') ? String(get('uuid', 'call_id', 'callid', 'id')) : null;
    const recordUrl = get('download_url', 'download', 'record', 'records', 'record_url', 'file') ? String(get('download_url', 'download', 'record', 'records', 'record_url', 'file')) : null;
    // qo'ng'iroq boshlangan vaqt (o'z stansiyamiz CDR StartTime → ISO, Toshkent vaqti hisobga olingan); noto'g'ri/kelajakdagi — e'tiborsiz
    const st = get('start_time') ? new Date(String(get('start_time'))) : null;
    const startedAt = st && Number.isFinite(st.getTime()) && st.getTime() <= Date.now() + 3_600_000 && st.getTime() > Date.now() - 30 * DAY_MS ? st : null;

    // Qo'ng'iroq yakunlanganmi (call_end) yoki hali jiringlayaptimi (call_start / ringing): jiringlayotganini
    // «o'tkazib yuborilgan» demaymiz — aks holda javob berilgan qo'ng'iroqqa ham vazifa tushardi.
    // Gaplashildi -> completed; band/rad -> failed; yakunlangan, gaplashilmagan -> o'tkazib yuborilgan.
    const event = String(get('event', 'event_type', 'state', 'call_state') || '').toLowerCase();
    // «status/result» maydonida jiringlash/javob/ulanish holatlari yakun emas (aks holda gaplashayotgan qo'ng'iroq «o'tkazib yuborilgan» bo'lardi)
    const LIVE = /^(ring(ing)?|start(ed)?|progress|early|trying|answer(ed)?|connect(ed)?|bridg(e|ed)|talking|up|active|in[-_ ]?progress)$/;
    const final = /end|hangup|finish|complete|missed/.test(event) || /[a-z]/.test(hangup) && !LIVE.test(hangup) || durationSec > 0 || !!recordUrl;
    let status: string;
    if (talk > 0) status = 'completed';
    else if (!final) status = 'ringing';
    else if (/busy|reject|fail|занят|отклон|congestion/.test(hangup)) status = 'failed';
    else status = 'missed';

    if (!phone) {
      this.logger.warn('OnlinePBX webhook: telefon topilmadi, body: ' + JSON.stringify(body).slice(0, 300));
      return { ok: true, skipped: true };
    }

    // bir xil uuid bo'yicha parallel webhook/sync bir-birini kutadi (ikki CallLog / ikki lid yaratilmasin)
    const args = { phone, other, direction, status, durationSec, talkSec: talk, hangup, recordUrl, externalId, final, startedAt };
    if (externalId) {
      return this.withLock(`call:${externalId}`, async () => {
        try { return await this.applyCall(args); } catch (e) {
          // boshqa nusxa/jarayon shu uuid'ni bir lahza oldin yozdi (externalId noyob) — endi yangilash sifatida qayta ishlaymiz
          if (isP2002(e)) return this.applyCall(args);
          throw e;
        }
      });
    }
    return this.applyCall(args);
  }

  private locks = new Map<string, Promise<unknown>>();
  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) || Promise.resolve();
    const run = prev.catch(() => undefined).then(fn);
    this.locks.set(key, run);
    try { return await run; } finally { if (this.locks.get(key) === run) this.locks.delete(key); }
  }

  private async applyCall(a: { phone: string; other: string; direction: string; status: string; durationSec: number; talkSec: number; hangup: string; recordUrl: string | null; externalId: string | null; final: boolean; startedAt?: Date | null }) {
    const { phone, other, direction, status, durationSec, talkSec, hangup, recordUrl, externalId, final, startedAt } = a;
    const lead0 = await this.resolveLead(phone, other, direction);
    // operator: ichki raqam (kiruvchida — javob bergan/chaqirilgan, chiquvchida — chaqiruvchi) egasi
    const opUserId = await this.userIdByExt(other);

    // externalId bo'lsa — yangilaymiz (ringing -> answered -> completed); bo'lmasa yangi yozuv.
    if (externalId) {
      const existing = await this.prisma.callLog.findUnique({ where: { externalId } });
      if (existing) {
        const relink = existing.leadId || lead0?.id || (await this.ensureCallerLead(direction, phone, null))?.id || null;
        // holat orqaga qaytmaydi: yakuniy (completed/missed/failed) → ringing emas; gaplashilgan (completed) → missed emas
        const FINAL = ['completed', 'missed', 'failed'];
        const keepOld = FINAL.includes(existing.status) && (status === 'ringing' || (existing.status === 'completed' && status === 'missed'));
        const nextStatus = keepOld ? existing.status : status;
        await this.prisma.callLog.update({
          where: { id: existing.id },
          data: {
            status: nextStatus,
            durationSec: Math.max(durationSec, existing.durationSec),
            talkSec: Math.max(talkSec, existing.talkSec),
            hangup: keepOld ? existing.hangup || hangup || null : hangup || existing.hangup,
            recordUrl: recordUrl || existing.recordUrl,
            leadId: relink,
            ...(!existing.userId && opUserId ? { userId: opUserId } : {}),
            ...(final ? { handled: true } : {}), // yakunlangach kiruvchi oyna yopiladi
          },
        });
        if (relink && direction === 'in' && nextStatus === 'missed' && existing.status !== 'missed') await this.missedCallTask(relink, phone);
        return { ok: true, updated: true };
      }
    }

    // yangi raqamdan kiruvchi — kontakt + bitim (jiringlayotgan paytdayoq, oynada mijoz kartochkasi bo'lsin)
    const lead = await this.ensureCallerLead(direction, phone, lead0);
    const call = await this.prisma.callLog.create({
      data: { leadId: lead?.id || null, userId: opUserId, phone, direction, status, durationSec, talkSec, hangup: hangup || null, recordUrl, externalId, handled: direction === 'out' || final, ...(startedAt ? { startedAt } : {}) },
    });
    if (lead && direction === 'in' && status === 'missed') await this.missedCallTask(lead.id, phone);
    if (lead && direction === 'in') await this.automation.fire('call_in', lead.id, { actorName: 'OnlinePBX' });
    return { ok: true, callId: call.id, matchedLead: lead?.name || null };
  }
}
