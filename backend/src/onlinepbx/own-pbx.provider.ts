import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

import { EXT_RE, dialable } from '../pbx/phone';
import { AmiClient, type AmiMsg } from './asterisk-ami';
import type { PbxCall, PbxKind, PbxProvider } from './pbx-provider';

const isInt = (s: string) => /^\d{2,5}$/.test(s);
/** `PJSIP/100-0000001a` → `100` (kanal nomidan ichki raqam). */
const extOfChannel = (ch?: string) => { const m = /^PJSIP\/(\d{2,5})(?:-web)?-[0-9a-f]+$/i.exec(String(ch || '')); return m ? m[1] : ''; };
/** CRM qo'ng'iroq identifikatori: dialplan `CDR(userfield)=crm:<uuid>` yozadi (Originate'ga `CRM_UUID` o'zgaruvchisi bilan beriladi). */
/** CDR userfield'dagi `ext:<ichki raqam>` — chiquvchi qo'ng'iroqda CALLERID tashqi raqamga almashgani uchun xodim raqami shu yerdan olinadi. */
const crmExtOf = (e: AmiMsg) => { const m = /(?:^|[\s;,])ext:(\d{2,5})(?:$|[\s;,])/.exec(` ${e.UserField || ''}`); return m ? m[1] : ''; };
const crmUuidOf = (e: AmiMsg) => { const m = /(?:^|[\s;,])crm:([\w-]{6,64})/.exec(` ${e.UserField || ''}`); return m ? m[1] : ''; };

/**
 * CDR vaqti (`2026-10-27 08:00:00`, cdr_manager.conf `usegmtime = yes` — GMT) → ISO. Boshqa mintaqa kerak bo'lsa ASTERISK_TZ (standart +00:00).
 */
export function cdrTime(s?: string, tz = process.env.ASTERISK_TZ || '+00:00'): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(String(s || '').trim());
  if (!m || !/^[+-]\d{2}:\d{2}$/.test(tz)) return null;
  const d = new Date(`${m[1]}T${m[2]}${tz}`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * AMI `Cdr` hodisasi → CRM webhook formati (calls.processCallEvent tushunadigan maydonlar). Sof funksiya — testlanadi.
 * - uuid: CRM_UUID (userfield) bo'lsa — shu (click-to-call CallLog bilan bog'lanadi), aks holda Asterisk UniqueID.
 * - Javob: faqat operator (boshqa kanal — DestinationChannel) bilan bog'langan ANSWERED suhbat hisoblanadi; IVR/ovozli pochta
 *   o'zi Answer() qilgani (DestinationChannel bo'sh) — operator javob bermagan (missed).
 * - Yozuv havolasi faqat `opts.recording` (fayl haqiqatan topilgan) bo'lsa.
 */
export function cdrToCallBody(e: AmiMsg, opts: { recording?: boolean } = {}): Record<string, unknown> | null {
  const uuid = crmUuidOf(e) || e.UniqueID || e.Uniqueid;
  if (!uuid) return null;
  const extTok = crmExtOf(e);
  // chiquvchi (trunk orqali): CDR Source — tashqi caller-id; haqiqiy chaqiruvchi xodim raqami userfield'da
  const src = extTok && !isInt(String(e.Source || '')) ? extTok : e.Source || e.CallerID || '';
  // `s` (dialplan ichki kengaytmasi) — haqiqiy raqam emas: operator raqami kanal nomidan olinadi
  const dstRaw = e.Destination || '';
  const dstExt = extOfChannel(e.DestinationChannel);
  // kiruvchida (tashqi → DID/IVR) javob bergan xodim — kanal nomidan; aks holda raqamli Destination
  const dst = dstExt && !isInt(src) ? dstExt : /^\+?\d+$/.test(dstRaw) ? dstRaw : dstExt || dstRaw;
  const ctx = (e.DestinationContext || e.DstContext || '').toLowerCase();
  // yo'nalish: tashqi raqamdan ichkiga — kiruvchi; ichkidan tashqiga — chiquvchi; ikkalasi ichki — ichki
  let accountcode = 'inbound';
  if (isInt(src) && !isInt(dst)) accountcode = 'outbound';
  else if (isInt(src) && isInt(dst)) accountcode = 'local';
  else if (/from-internal|crm-outbound/.test(ctx) && !isInt(dst)) accountcode = 'outbound';
  const disp = String(e.Disposition || '').toUpperCase();
  const bridged = !!String(e.DestinationChannel || '').trim();
  const operatorAnswered = disp === 'ANSWERED' && bridged;
  const hangup = operatorAnswered ? 'normal_clearing' : disp === 'BUSY' ? 'user_busy' : disp === 'FAILED' ? 'call_rejected' : 'no_answer';
  const startedAt = cdrTime(e.StartTime);
  return {
    uuid, accountcode, caller: src, callee: dst,
    dialog_duration: operatorAnswered ? Number(e.BillableSeconds) || 0 : 0, call_duration: Number(e.Duration) || 0, hangup_cause: hangup, event: 'call_end',
    ...(startedAt ? { start_time: startedAt } : {}),
    ...(opts.recording ? { download_url: `own:${uuid}` } : {}),
  };
}

/**
 * Bitta qo'ng'iroq (uuid) uchun bir nechta CDR (IVR Answer + Dial + …) → bitta yakuniy natija. Sof funksiya — testlanadi.
 * Operator javob bergan qism bo'lsa — suhbat (completed); aks holda — javobsiz. Davomiylik — eng kattasi; raqamlar — tashqi/ichki aniqrog'i.
 */
export function mergeCdrBodies(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const talkA = Number(a.dialog_duration) || 0, talkB = Number(b.dialog_duration) || 0;
  const main = talkB > talkA ? b : a;
  const other = main === a ? b : a;
  const pick = (k: string) => (main[k] !== undefined && main[k] !== '' ? main[k] : other[k]);
  const inbound = a.accountcode === 'inbound' || b.accountcode === 'inbound';
  const extCallee = [main.callee, other.callee].find((x) => isInt(String(x || '')));
  const rank = (h: unknown) => (h === 'normal_clearing' ? 3 : h === 'user_busy' ? 2 : h === 'call_rejected' ? 1 : 0);
  return {
    ...other, ...main,
    accountcode: a.accountcode === 'local' ? b.accountcode : a.accountcode,
    caller: pick('caller'),
    callee: inbound ? extCallee || pick('callee') : pick('callee'),
    dialog_duration: Math.max(talkA, talkB),
    call_duration: Math.max(Number(a.call_duration) || 0, Number(b.call_duration) || 0),
    hangup_cause: rank(a.hangup_cause) >= rank(b.hangup_cause) ? a.hangup_cause : b.hangup_cause,
    start_time: [a.start_time, b.start_time].filter(Boolean).sort()[0],
    ...(a.download_url || b.download_url ? { download_url: a.download_url || b.download_url } : {}),
  };
}

/** Dialplan'dagi `UserEvent(CrmRing,…)` → jiringlayotgan (tugamagan) qo'ng'iroq hodisasi: CRM kiruvchi oynani darrov ko'rsatadi. */
export function ringToCallBody(e: AmiMsg): Record<string, unknown> | null {
  if (e.Event !== 'UserEvent' || e.UserEvent !== 'CrmRing') return null;
  const uuid = e.Uuid || e.UniqueID;
  if (!uuid || !e.Caller) return null;
  return { uuid, accountcode: isInt(e.Caller) ? (isInt(e.Called || '') ? 'local' : 'outbound') : 'inbound', caller: e.Caller, callee: e.Called || '', event: 'call_start' };
}

/**
 * O'z stansiyamiz (Asterisk) provayderi: AMI orqali qo'ng'iroq boshlash va CDR hodisalarini olish; yozuvlar umumiy papkadan.
 * Sozlama (env): ASTERISK_AMI_HOST, ASTERISK_AMI_PORT (5038), ASTERISK_AMI_USER, ASTERISK_AMI_SECRET, ASTERISK_RECORDINGS_DIR, ASTERISK_TZ (+05:00),
 * ASTERISK_CDR_MERGE_MS (bitta qo'ng'iroq CDR'larini yig'ish oynasi, standart 1500).
 * Haqiqiy Asterisk'da hali sinalmagan (PLAN 45, 3-bosqich) — AMI mijozi va CDR xaritasi soxta server bilan testlanadi.
 */
@Injectable()
export class OwnPbxProvider implements PbxProvider, OnModuleInit, OnModuleDestroy {
  readonly kind: PbxKind = 'own';
  private readonly logger = new Logger('OwnPbx');
  private ami: AmiClient | null = null;
  private connecting: Promise<void> | null = null;
  private listeners: ((body: Record<string, unknown>) => void)[] = [];
  private retry: NodeJS.Timeout | null = null;
  private destroyed = false;
  /** Originate → OriginateResponse bog'lanishi (ActionID → qo'ng'iroq). */
  private originates = new Map<string, { uuid: string; from: string; to: string; at: number }>();
  /** uuid → yig'ilayotgan CDR'lar (bir nechta CDR bitta natijaga birlashtiriladi). */
  private cdrBuf = new Map<string, { body: Record<string, unknown>; timer: NodeJS.Timeout }>();

  private cfg() {
    return { host: (process.env.ASTERISK_AMI_HOST || '').trim(), port: Number(process.env.ASTERISK_AMI_PORT) || 5038, user: process.env.ASTERISK_AMI_USER || 'crm', secret: process.env.ASTERISK_AMI_SECRET || '' };
  }
  private configured() { const c = this.cfg(); return !!c.host && !!c.secret; }

  /** CDR hodisalarini tinglovchi (CallsService shu orqali yozuvni oladi). */
  onCall(cb: (body: Record<string, unknown>) => void) { this.listeners.push(cb); }

  onModuleInit() {
    if (!this.configured() || process.env.NODE_ENV === 'test') return;
    this.ensure().catch((e) => this.logger.warn('AMI: ' + (e as Error).message));
  }
  onModuleDestroy() {
    this.destroyed = true;
    if (this.retry) clearTimeout(this.retry);
    for (const x of this.cdrBuf.values()) clearTimeout(x.timer);
    this.cdrBuf.clear();
    this.ami?.close();
  }

  private emit(body: Record<string, unknown>) {
    for (const l of this.listeners) { try { l(body); } catch (err) { this.logger.warn('CDR: ' + (err as Error).message); } }
  }

  /** Yozuv fayli haqiqatan bormi (MixMonitor yozgan). */
  private async recordingExists(uuid: string) {
    const dir = process.env.ASTERISK_RECORDINGS_DIR;
    if (!dir || !/^[\w.-]{6,64}$/.test(uuid)) return false;
    for (const ext of ['wav', 'mp3']) { try { const st = await fs.stat(join(dir, `${uuid}.${ext}`)); if (st.size > 44) return true; } catch { /* */ } }
    return false;
  }

  private onCdr(e: AmiMsg) {
    const body = cdrToCallBody(e);
    if (!body) return;
    const uuid = String(body.uuid);
    const cur = this.cdrBuf.get(uuid);
    if (cur) clearTimeout(cur.timer);
    const merged = cur ? mergeCdrBodies(cur.body, body) : body;
    const ms = Number(process.env.ASTERISK_CDR_MERGE_MS ?? 1500);
    const timer = setTimeout(() => {
      this.cdrBuf.delete(uuid);
      this.recordingExists(uuid).then((rec) => this.emit(rec ? { ...merged, download_url: `own:${uuid}` } : merged)).catch(() => this.emit(merged));
    }, Number.isFinite(ms) ? ms : 1500);
    timer.unref?.();
    this.cdrBuf.set(uuid, { body: merged, timer });
  }

  private onOriginateResponse(e: AmiMsg) {
    const o = this.originates.get(e.ActionID || '');
    if (!o) return;
    this.originates.delete(e.ActionID);
    if (/^success$/i.test(e.Response || '')) return; // keyin CDR keladi
    // xodim telefoni javob bermadi / ulanib bo'lmadi — CRM yozuvi «failed» (abadiy «ringing» bo'lib qolmasin)
    this.emit({ uuid: o.uuid, accountcode: 'outbound', caller: o.from, callee: o.to, dialog_duration: 0, call_duration: 0, hangup_cause: 'call_rejected', event: 'call_end' });
  }

  private ensure(): Promise<void> {
    if (this.ami?.isReady()) return Promise.resolve();
    if (this.connecting) return this.connecting;
    const c = this.cfg();
    const ami = new AmiClient({ host: c.host, port: c.port, user: c.user, secret: c.secret });
    ami.on('error', () => undefined);
    ami.on('event', (e: AmiMsg) => {
      if (e.Event === 'Cdr') return this.onCdr(e);
      if (e.Event === 'OriginateResponse') return this.onOriginateResponse(e);
      const body = ringToCallBody(e);
      if (body) this.emit(body);
    });
    ami.on('close', () => {
      // eski (almashtirilgan) klientning yopilishi yangi ulanishni o'chirib qo'ymasin
      if (this.ami !== ami && this.ami !== null) return;
      this.ami = null;
      if (this.configured() && !this.retry && !this.destroyed) {
        this.retry = setTimeout(() => { this.retry = null; this.ensure().catch(() => undefined); }, 10_000);
        this.retry.unref?.();
      }
    });
    this.connecting = ami.connect().then(() => { this.ami = ami; }).finally(() => { this.connecting = null; });
    return this.connecting;
  }

  /** AMI «Command» (masalan `dialplan reload`). */
  async command(cmd: string): Promise<string> {
    if (!this.configured()) throw new Error('Asterisk AMI sozlanmagan');
    await this.ensure();
    const r = await this.ami!.action('Command', { Command: cmd });
    return r.Output || r.Message || 'ok';
  }

  async enabled() { return this.configured(); }

  async testConnection() {
    if (!this.configured()) return { ok: false, message: "Asterisk AMI sozlanmagan (ASTERISK_AMI_HOST va ASTERISK_AMI_SECRET)" };
    try { await this.ensure(); await this.ami!.action('Ping'); return { ok: true, message: 'Asterisk bilan ulanish muvaffaqiyatli.' }; } catch (e) { return { ok: false, message: (e as Error).message }; }
  }

  /**
   * Click-to-call: `from` — faqat ichki raqam (2–5 xona), `to` — normallashtirilgan raqam (faqat raqamlar, `+` olib tashlanadi).
   * Kanalning UniqueID'si = CRM uuid (ChannelId) va CRM_UUID o'zgaruvchisi — CDR shu CallLog bilan bog'lanadi.
   */
  async call(from: string, to: string, extra: Record<string, string> = {}) {
    if (!this.configured()) return { ok: false, comment: "Asterisk sozlanmagan", raw: null };
    const f = String(from || '').trim();
    const t = dialable(to);
    if (!EXT_RE.test(f)) return { ok: false, comment: `Ichki raqam noto'g'ri: ${f.slice(0, 20)}`, raw: null };
    if (!t) return { ok: false, comment: "Raqam noto'g'ri", raw: null };
    const uuid = randomUUID();
    const actionId = `crm-${uuid}`;
    try {
      await this.ensure();
      this.originates.set(actionId, { uuid, from: f, to: t, at: Date.now() });
      for (const [k, v] of this.originates) if (Date.now() - v.at > 10 * 60_000) this.originates.delete(k);
      const safeExtra = Object.fromEntries(Object.entries(extra).filter(([k]) => /^[A-Za-z]+$/.test(k) && !['Channel', 'Context', 'Exten', 'Application', 'Data', 'ActionID'].includes(k)));
      const res = await this.ami!.action('Originate', {
        ...safeExtra,
        ActionID: actionId, Channel: `Local/${f}@crm-user/n`, Context: 'from-internal', Exten: t, Priority: '1', CallerID: `${t} <${f}>`, Async: 'true', Timeout: '30000',
        ChannelId: uuid, Variable: `CRM_UUID=${uuid}`,
      });
      return { ok: true, uuid, comment: res.Message, raw: res };
    } catch (e) {
      this.originates.delete(actionId);
      return { ok: false, comment: (e as Error).message, raw: null };
    }
  }

  /** Tarix CDR hodisalari orqali real vaqtda yoziladi; so'rov bo'yicha tortish yo'q. */
  async history(): Promise<PbxCall[]> { return []; }

  async recordUrl(uuid: string) { return /^[\w.-]{6,64}$/.test(uuid) ? `own:${uuid}` : null; }

  async fetchRecording(uuidOrUrl: string) {
    const id = String(uuidOrUrl).replace(/^own:/, '');
    const dir = process.env.ASTERISK_RECORDINGS_DIR;
    if (!dir || !/^[\w.-]{6,64}$/.test(id) || id.includes('..')) return null;
    for (const [ext, ct] of [['wav', 'audio/wav'], ['mp3', 'audio/mpeg']] as const) {
      try {
        const p = join(dir, `${id}.${ext}`);
        const st = await fs.stat(p);
        if (st.size > 50 * 1024 * 1024) return null;
        return { buffer: await fs.readFile(p), contentType: ct };
      } catch { /* keyingisi */ }
    }
    return null;
  }
}
