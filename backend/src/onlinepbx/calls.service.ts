import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';

import type { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { OnlinePbxClient } from './onlinepbx.client';
import { OnlinePbxConfigService, PbxConfig } from './onlinepbx-config.service';

function digits(p?: string | null): string {
  return (p || '').replace(/\D/g, '');
}

// OnlinePBX vaqt belgisini (unix yoki "YYYY-MM-DD HH:mm:ss" GMT) Date'ga aylantiradi
function parseStamp(v: any): Date {
  if (v == null || v === '') return new Date();
  if (typeof v === 'number') return new Date(v > 1e12 ? v : v * 1000);
  const s = String(v).trim();
  if (/^\d+$/.test(s)) { const n = Number(s); return new Date(n > 1e12 ? n : n * 1000); }
  const iso = s.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z');
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date() : d;
}

@Injectable()
export class CallsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CallsService.name);
  private lastHistorySync = 0;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  // "Qo'ng'iroq" bosilganda qaysi liddan ekanini eslab qolamiz — webhook/sync o'sha lidga bog'laydi
  // (dublikat raqamli lidlar bo'lganda to'g'ri lidga tushishi uchun).
  private pendingIntents: Array<{ leadId: string; tail: string; at: number }> = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly pbx: OnlinePbxClient,
    private readonly cfg: OnlinePbxConfigService,
  ) {}

  // Fon rejimida OnlinePBX tarixini muntazam tortib turadi — operator gaplashib
  // bo'lishi bilan qo'ng'iroq/yozuv ~15-20s ichida platformada avtomatik ko'rinadi.
  onModuleInit() {
    this.syncTimer = setInterval(() => {
      this.syncHistory({ force: true, minutes: 30 }).catch(() => {});
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
      domain: c.domain || '',
      defaultExt: c.defaultExt || '',
      apiKeySet: !!c.apiKey, // kalit ko'rsatilmaydi, faqat mavjudligi
      webhookSecretSet: !!c.webhookSecret,
      callMode: c.callMode || 'callback',
      dialScheme: c.dialScheme || 'tel',
      enabled: !!c.domain && !!c.apiKey,
      webhookUrl: this.webhookUrl() + (c.webhookSecret ? `?secret=${encodeURIComponent(c.webhookSecret)}` : ''),
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
  private async findLeadByPhone(phone: string): Promise<{ id: string; name: string } | null> {
    const tail = digits(phone).slice(-9);
    if (tail.length < 7) return null;
    const leads = await this.prisma.lead.findMany({ where: { phone: { not: null } }, select: { id: true, name: true, phone: true } });
    const m = leads.find((l) => digits(l.phone).slice(-9) === tail);
    return m ? { id: m.id, name: m.name } : null;
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
  private async ensureMissedLead(direction: string, status: string, phone: string, lead: { id: string; name: string } | null): Promise<{ id: string; name: string } | null> {
    if (lead) return lead;
    if (direction !== 'in' || status !== 'missed') return null;
    if (digits(phone).length < 7) return null;
    const queueAgg = await this.prisma.lead.aggregate({ where: { stage: 'new' }, _max: { queue: true } });
    const created = await this.prisma.lead.create({
      data: {
        name: phone, phone, source: "Kiruvchi qo'ng'iroq", stage: 'new',
        unsorted: true, customJson: '{}', queue: (queueAgg._max.queue ?? -1) + 1,
      },
    });
    this.logger.log(`O'tkazib yuborilgan qo'ng'iroqdan yangi lid: ${phone}`);
    return { id: created.id, name: created.name };
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
    const from = (fromOverride || dbUser?.extension || cfg.defaultExt || '').trim();
    if (!from) {
      throw new BadRequestException({
        error: 'NO_EXTENSION',
        message: 'Operator ichki raqami (extension) belgilanmagan. Sozlamalardan qo`shing.',
      });
    }

    let res: { ok: boolean; uuid?: string; comment?: string };
    try {
      res = await this.pbx.call(from, lead.phone);
    } catch (e) {
      this.logger.error('OnlinePBX call xatosi: ' + (e as Error).message);
      throw new ServiceUnavailableException({ error: 'PBX_ERROR', message: 'OnlinePBX bilan bog`lanib bo`lmadi' });
    }

    const log = await this.prisma.callLog.create({
      data: {
        leadId: lead.id,
        userId: user.id,
        phone: lead.phone,
        direction: 'out',
        status: res.ok ? 'ringing' : 'failed',
        externalId: res.uuid || null,
        handled: true,
      },
    });
    if (!res.ok) throw new ServiceUnavailableException({ error: 'PBX_REJECTED', message: 'OnlinePBX: ' + (res.comment || 'qo`ng`iroq boshlanmadi') });
    return { ok: true, call: log };
  }

  // ── Dialer (widget) — ixtiyoriy raqamga qo'ng'iroq (callback). Lid topilса — bog'lanadi. ──
  async dial(user: AuthUser, to: string) {
    const num = (to || '').trim();
    if (!num) throw new BadRequestException({ error: 'NO_PHONE', message: 'Raqam kiriting' });
    if (!(await this.pbx.enabled())) {
      throw new ServiceUnavailableException({ error: 'PBX_DISABLED', message: 'OnlinePBX sozlanmagan: CRM → Sozlamalar → Telefoniya.' });
    }
    const dbUser = await this.prisma.user.findUnique({ where: { id: user.id }, select: { extension: true } });
    const cfg = await this.cfg.get();
    const from = (dbUser?.extension || cfg.defaultExt || '').trim();
    if (!from) throw new BadRequestException({ error: 'NO_EXTENSION', message: 'Ichki raqamingiz belgilanmagan.' });

    let res: { ok: boolean; uuid?: string; comment?: string };
    try {
      res = await this.pbx.call(from, num);
    } catch (e) {
      this.logger.error('OnlinePBX dial xatosi: ' + (e as Error).message);
      throw new ServiceUnavailableException({ error: 'PBX_ERROR', message: 'OnlinePBX bilan bog`lanib bo`lmadi' });
    }
    const lead = await this.findLeadByPhone(num);
    const log = await this.prisma.callLog.create({
      data: { leadId: lead?.id || null, userId: user.id, phone: num, direction: 'out', status: res.ok ? 'ringing' : 'failed', externalId: res.uuid || null, handled: true },
    });
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
  private async resolveLead(phone: string, other: string): Promise<{ id: string; name: string } | null> {
    const tails = [digits(phone).slice(-9), digits(other).slice(-9)].filter((t) => t.length >= 7);
    const cutoff = Date.now() - 5 * 60_000;
    for (let i = this.pendingIntents.length - 1; i >= 0; i--) {
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
    this.lastHistorySync = now;

    const nowSec = Math.floor(now / 1000);
    const span = opts?.minutes && opts.minutes > 0
      ? opts.minutes * 60
      : Math.min((opts?.days && opts.days > 0 ? opts.days : 1) * 24 * 3600, 7 * 24 * 3600);
    const fromSec = nowSec - span;

    let records: any[] = [];
    try {
      records = await this.pbx.historySearch({ start_stamp_from: String(fromSec), start_stamp_to: String(nowSec), limit: '500' });
    } catch (e) {
      const msg = (e as Error).message;
      this.logger.warn('OnlinePBX history sync xato: ' + msg);
      return { ok: false, synced: 0, error: msg };
    }

    let synced = 0;
    let linked = 0;
    for (const r of records) {
      const uuid = String(r.uuid || r.call_uuid || r.id || '');
      if (!uuid) continue;
      const account = String(r.accountcode || r.type || r.call_type || r.direction || '').toLowerCase();
      const caller = String(r.caller || r.caller_id_number || r.from || r.src || '');
      const callee = String(r.callee || r.destination_number || r.callee_id_number || r.to || r.dst || r.did || '');
      const { direction, phone: xphone, other } = this.parties(caller, callee, account);
      const phone = xphone || callee || caller;
      if (!phone) continue;

      const talk = Number(r.dialog_duration || r.user_talk_time || r.billsec) || 0;
      const durationSec = Number(r.call_duration || r.duration) || talk || 0;
      const hangup = String(r.hangup_cause || r.disposition || '').toLowerCase();
      // Gaplashildi -> completed; band/rad -> failed; aks holda (gaplashilmagan) -> o'tkazib yuborilgan.
      let status: string;
      if (talk > 0) status = 'completed';
      else if (/busy|reject|fail|занят|отклон|congestion/.test(hangup)) status = 'failed';
      else status = 'missed';
      const recordUrl = (r.download_url || r.download || r.record || r.file) ? String(r.download_url || r.download || r.record || r.file) : null;
      const startedAt = parseStamp(r.start_stamp || r.start_stamp_gmt || r.created_at || r.start_time || r.date);

      // Lidga bog'lash — avval "Qo'ng'iroq" bosilgan lid, keyin raqam bo'yicha (dublikat uchun)
      const lead0 = await this.resolveLead(phone, other);

      const existing = await this.prisma.callLog.findFirst({ where: { externalId: uuid } });
      if (existing) {
        const relink = existing.leadId || lead0?.id || (await this.ensureMissedLead(direction, status, phone, null))?.id || null;
        await this.prisma.callLog.update({
          where: { id: existing.id },
          data: { status, durationSec: durationSec || existing.durationSec, recordUrl: recordUrl || existing.recordUrl, leadId: relink },
        });
        if (relink) linked++;
        continue;
      }
      // Noma'lum raqamdan o'tkazib yuborilgan kiruvchi bo'lsa — Saralanmagan lid yaratamiz.
      const lead = await this.ensureMissedLead(direction, status, phone, lead0);
      await this.prisma.callLog.create({
        data: { externalId: uuid, phone, direction, status, durationSec, recordUrl, leadId: lead?.id || null, handled: true, startedAt },
      });
      synced++;
      if (lead) linked++;
    }
    if (synced) this.logger.log(`OnlinePBX history sync: jami ${records.length}, yangi ${synced}, lidga bog'langan ${linked}`);
    return { ok: true, synced, total: records.length, linked };
  }

  // ── Barcha qo'ng'iroqlar ro'yxati (CRM "Qo'ng'iroqlar" bo'limi) ──
  async listCalls(opts?: { filter?: string; limit?: number }) {
    await this.syncHistory({ minutes: 60 }).catch(() => {}); // yangi qo'ng'iroqlarni tortamiz (throttle)
    const where = opts?.filter === 'missed' ? { status: 'missed' } : {};
    const rows = await this.prisma.callLog.findMany({
      where, orderBy: { startedAt: 'desc' }, take: Math.min(opts?.limit || 200, 500),
    });
    const leadIds = [...new Set(rows.map((r) => r.leadId).filter(Boolean) as string[])];
    const leads = leadIds.length
      ? await this.prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, name: true } })
      : [];
    const nameMap = new Map(leads.map((l) => [l.id, l.name]));
    const missedCount = await this.prisma.callLog.count({ where: { status: 'missed' } });
    return {
      calls: rows.map((c) => ({
        ...c,
        leadName: c.leadId ? nameMap.get(c.leadId) || null : null,
        hasRecording: !!(c.externalId || c.recordUrl),
      })),
      missedCount,
    };
  }

  // ── Lid qo'ng'iroqlari tarixi ──
  async leadCalls(leadId: string) {
    await this.syncHistory({ minutes: 15 }).catch(() => {}); // har pollда OnlinePBX'dan tortamiz (throttle ~2.5s)
    const calls = await this.prisma.callLog.findMany({ where: { leadId }, orderBy: { startedAt: 'desc' }, take: 100 });
    // hasRecording — yozuvni server orqali olib bo'ladimi (uuid yoki havola bor)
    return { calls: calls.map((c) => ({ ...c, hasRecording: !!(c.externalId || c.recordUrl) })) };
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
  async incoming() {
    const since = new Date(Date.now() - 45_000);
    const call = await this.prisma.callLog.findFirst({
      where: { direction: 'in', handled: false, startedAt: { gte: since } },
      orderBy: { startedAt: 'desc' },
    });
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
    return { extension: u?.extension || null, pbxEnabled: await this.pbx.enabled() };
  }
  async setMyExtension(user: AuthUser, extension: string) {
    await this.prisma.user.update({ where: { id: user.id }, data: { extension: (extension || '').trim() || null } });
    return { ok: true, extension: (extension || '').trim() || null };
  }

  // Telefon raqami bo'yicha lid (WebRTC kiruvchi kartasida nomni ko'rsatish uchun)
  async leadByPhonePublic(phone: string) {
    const m = await this.findLeadByPhone(phone || '');
    return { leadId: m?.id || null, leadName: m?.name || null };
  }

  // ── Brauzer WebRTC-telefoni (JsSIP) sozlamasi ──
  // wss://{domen}:7443, sip:{ext}@{domen}, operator SIP paroli. Faqat egasiga qaytariladi.
  async getWebrtcConfig(user: AuthUser) {
    const cfg = await this.cfg.get();
    const u = await this.prisma.user.findUnique({ where: { id: user.id }, select: { extension: true, sipPassword: true } });
    const domain = cfg.domain || '';
    const ext = (u?.extension || cfg.defaultExt || '').trim();
    const enabled = !!domain && !!ext && !!u?.sipPassword;
    return {
      enabled,
      domain,
      wss: domain ? `wss://${domain}:7443` : '',
      uri: domain && ext ? `sip:${ext}@${domain}` : '',
      extension: ext,
      password: u?.sipPassword || '',
      sipPasswordSet: !!u?.sipPassword,
      displayName: user.name,
    };
  }
  async saveWebrtcConfig(user: AuthUser, dto: { extension?: string; sipPassword?: string }) {
    const data: Record<string, unknown> = {};
    if (dto.extension !== undefined) data.extension = (dto.extension || '').trim() || null;
    if (dto.sipPassword) data.sipPassword = String(dto.sipPassword).trim(); // faqat yangi kiritilsa
    await this.prisma.user.update({ where: { id: user.id }, data });
    return this.getWebrtcConfig(user);
  }

  // ── Webhook (OnlinePBX hodisalari) ──
  async handleWebhook(body: any, secret?: string) {
    // Sozlamada webhookSecret bo'lsa — tekshiramiz (aks holda hamma qabul qilinadi)
    const cfg = await this.cfg.get();
    if (cfg.webhookSecret && cfg.webhookSecret !== (secret || '')) {
      this.logger.warn('OnlinePBX webhook: secret mos emas — rad etildi');
      return { ok: false, error: 'BAD_SECRET' };
    }
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

    // Gaplashildi -> completed; band/rad -> failed; aks holda (gaplashilmagan) -> o'tkazib yuborilgan.
    let status: string;
    if (talk > 0) status = 'completed';
    else if (/busy|reject|fail|занят|отклон|congestion/.test(hangup)) status = 'failed';
    else status = 'missed';

    const externalId = get('uuid', 'call_id', 'callid', 'id') ? String(get('uuid', 'call_id', 'callid', 'id')) : null;
    const recordUrl = get('download_url', 'download', 'record', 'records', 'record_url', 'file') ? String(get('download_url', 'download', 'record', 'records', 'record_url', 'file')) : null;

    if (!phone) {
      this.logger.warn('OnlinePBX webhook: telefon topilmadi, body: ' + JSON.stringify(body).slice(0, 300));
      return { ok: true, skipped: true };
    }

    const lead0 = await this.resolveLead(phone, other);

    // externalId bo'lsa — yangilaymiz (ringing -> answered -> completed); bo'lmasa yangi yozuv.
    if (externalId) {
      const existing = await this.prisma.callLog.findFirst({ where: { externalId } });
      if (existing) {
        const relink = existing.leadId || lead0?.id || (await this.ensureMissedLead(direction, status, phone, null))?.id || null;
        await this.prisma.callLog.update({
          where: { id: existing.id },
          data: {
            status,
            durationSec: durationSec || existing.durationSec,
            recordUrl: recordUrl || existing.recordUrl,
            leadId: relink,
          },
        });
        return { ok: true, updated: true };
      }
    }

    // Noma'lum raqamdan o'tkazib yuborilgan kiruvchi bo'lsa — Saralanmagan lid yaratamiz.
    const lead = await this.ensureMissedLead(direction, status, phone, lead0);
    const call = await this.prisma.callLog.create({
      data: { leadId: lead?.id || null, phone, direction, status, durationSec, recordUrl, externalId, handled: direction === 'out' },
    });
    return { ok: true, callId: call.id, matchedLead: lead?.name || null };
  }
}
