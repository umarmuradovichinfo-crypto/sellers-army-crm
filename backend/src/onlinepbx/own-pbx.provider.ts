import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

import { AmiClient, type AmiMsg } from './asterisk-ami';
import type { PbxCall, PbxKind, PbxProvider } from './pbx-provider';

/** AMI `Cdr` hodisasi → CRM webhook formati (calls.processCallEvent tushunadigan maydonlar). Sof funksiya — testlanadi. */
export function cdrToCallBody(e: AmiMsg): Record<string, unknown> | null {
  const uuid = e.UniqueID || e.Uniqueid;
  if (!uuid) return null;
  const isInt = (s: string) => /^\d{2,5}$/.test(s);
  const src = e.Source || e.CallerID || '';
  const dst = e.Destination || '';
  const ctx = (e.DestinationContext || e.DstContext || '').toLowerCase();
  // yo'nalish: tashqi raqamdan ichkiga — kiruvchi; ichkidan tashqiga — chiquvchi; ikkalasi ichki — ichki
  let accountcode = 'inbound';
  if (isInt(src) && !isInt(dst)) accountcode = 'outbound';
  else if (isInt(src) && isInt(dst)) accountcode = 'local';
  else if (/from-internal/.test(ctx) && !isInt(dst)) accountcode = 'outbound';
  const disp = String(e.Disposition || '').toUpperCase();
  const hangup = disp === 'ANSWERED' ? 'normal_clearing' : disp === 'BUSY' ? 'user_busy' : disp === 'FAILED' ? 'call_rejected' : 'no_answer';
  return {
    uuid, accountcode, caller: src, callee: dst,
    dialog_duration: Number(e.BillableSeconds) || 0, call_duration: Number(e.Duration) || 0, hangup_cause: hangup, event: 'call_end',
    ...(uuid ? { download_url: `own:${uuid}` } : {}),
  };
}

/**
 * O'z stansiyamiz (Asterisk) provayderi: AMI orqali qo'ng'iroq boshlash va CDR hodisalarini olish; yozuvlar umumiy papkadan.
 * Sozlama (env): ASTERISK_AMI_HOST, ASTERISK_AMI_PORT (5038), ASTERISK_AMI_USER, ASTERISK_AMI_SECRET, ASTERISK_RECORDINGS_DIR.
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
  onModuleDestroy() { if (this.retry) clearTimeout(this.retry); this.ami?.close(); }

  private ensure(): Promise<void> {
    if (this.ami?.isReady()) return Promise.resolve();
    if (this.connecting) return this.connecting;
    const c = this.cfg();
    const ami = new AmiClient({ host: c.host, port: c.port, user: c.user, secret: c.secret });
    ami.on('error', () => undefined);
    ami.on('event', (e: AmiMsg) => {
      if (e.Event !== 'Cdr') return;
      const body = cdrToCallBody(e);
      if (body) for (const l of this.listeners) { try { l(body); } catch (err) { this.logger.warn('CDR: ' + (err as Error).message); } }
    });
    ami.on('close', () => {
      this.ami = null;
      if (this.configured() && !this.retry) this.retry = setTimeout(() => { this.retry = null; this.ensure().catch(() => undefined); }, 10_000);
    });
    this.connecting = ami.connect().then(() => { this.ami = ami; }).finally(() => { this.connecting = null; });
    return this.connecting;
  }

  /** AMI «Command» (masalan `dialplan reload`). */
  async command(cmd: string): Promise<string> {
    if (!this.configured()) throw new Error('Asterisk AMI sozlanmagan');
    await this.ensure();
    const r = await this.ami!.action('Command', { Command: cmd });
    return r.Message || 'ok';
  }

  async enabled() { return this.configured(); }

  async testConnection() {
    if (!this.configured()) return { ok: false, message: "Asterisk AMI sozlanmagan (ASTERISK_AMI_HOST va ASTERISK_AMI_SECRET)" };
    try { await this.ensure(); await this.ami!.action('Ping'); return { ok: true, message: 'Asterisk bilan ulanish muvaffaqiyatli.' }; } catch (e) { return { ok: false, message: (e as Error).message }; }
  }

  async call(from: string, to: string, extra: Record<string, string> = {}) {
    if (!this.configured()) return { ok: false, comment: "Asterisk sozlanmagan", raw: null };
    const uuid = randomUUID();
    try {
      await this.ensure();
      const res = await this.ami!.action('Originate', {
        Channel: `PJSIP/${from}`, Context: 'from-internal', Exten: to, Priority: '1', CallerID: `${to} <${from}>`, Async: 'true', Timeout: '30000',
        Variable: `CRM_UUID=${uuid}`, ...extra,
      });
      return { ok: true, uuid, comment: res.Message, raw: res };
    } catch (e) {
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
