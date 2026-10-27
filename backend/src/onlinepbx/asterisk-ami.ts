// Asterisk Manager Interface (AMI) mijozi: matn protokoli (Key: Value bloklari, bo'sh qator bilan ajratilgan).
// Faqat kerakli qismi: Login, action (Originate, Command, Ping), hodisalarni tinglash, keepalive. Tashqi kutubxonasiz.
import { EventEmitter } from 'events';
import { connect, type Socket } from 'net';
import { randomUUID } from 'crypto';

export type AmiMsg = Record<string, string>;
export interface AmiOpts { host: string; port: number; user: string; secret: string; timeoutMs?: number; /** keepalive Ping oralig'i (0 — o'chiq). Standart 30 s. */ pingMs?: number }

/**
 * Blokni o'qiydi. Takrorlanuvchi kalitlar (masalan `Output:` — Command javobi, `ChanVariable:`) yangi qator bilan birlashtiriladi;
 * «Response: Follows» (eski Asterisk) ichidagi kalitsiz qatorlar `Output` ga qo'shiladi.
 */
export function parseAmiBlock(block: string): AmiMsg {
  const m: AmiMsg = {};
  const add = (k: string, v: string) => { m[k] = m[k] !== undefined ? `${m[k]}\n${v}` : v; };
  for (const line of block.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0 && !/\s/.test(line.slice(0, i))) add(line.slice(0, i).trim(), line.slice(i + 1).trim());
    else if (line.trim() && line.trim() !== '--END COMMAND--' && m.Response !== undefined) add('Output', line.replace(/\s+$/, ''));
  }
  return m;
}

export class AmiClient extends EventEmitter {
  private sock: Socket | null = null;
  private buf = '';
  private pending = new Map<string, { resolve: (m: AmiMsg) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private ready = false;
  private bannerSeen = false;
  private pinger: NodeJS.Timeout | null = null;

  constructor(private readonly opts: AmiOpts) { super(); }

  isReady() { return this.ready && !!this.sock && !this.sock.destroyed; }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const to = this.opts.timeoutMs ?? 8000;
      const s = connect({ host: this.opts.host, port: this.opts.port });
      this.sock = s;
      this.buf = '';
      this.bannerSeen = false;
      let done = false;
      const fail = (e: Error) => { if (!done) { done = true; clearTimeout(timer); reject(e); } };
      const timer = setTimeout(() => { fail(new Error('AMI: ulanish vaqti tugadi')); s.destroy(); }, to);
      s.setEncoding('utf8');
      s.setKeepAlive(true, 15_000); // OS darajasidagi keepalive (NAT/firewall uzilgan ulanishni aniqlash)
      s.on('error', (e) => { fail(e); this.emit('error', e); });
      s.on('close', () => {
        this.ready = false;
        this.stopPing();
        for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('AMI: ulanish uzildi')); }
        this.pending.clear();
        fail(new Error('AMI: ulanish uzildi'));
        this.emit('close');
      });
      s.on('data', (d: string) => this.onData(d));
      this.once('banner', () => {
        this.action('Login', { Username: this.opts.user, Secret: this.opts.secret, Events: 'on' })
          .then(() => { this.ready = true; this.startPing(); if (!done) { done = true; clearTimeout(timer); resolve(); } })
          .catch((e) => { fail(e); s.destroy(); });
      });
    });
  }

  /** Har `pingMs` da Ping; javob bo'lmasa (action timeout) ulanish yopiladi → provayder qayta ulanadi. */
  private startPing() {
    const ms = this.opts.pingMs ?? 30_000;
    if (!ms) return;
    this.stopPing();
    this.pinger = setInterval(() => { this.action('Ping').catch(() => undefined); }, ms);
    this.pinger.unref?.();
  }
  private stopPing() { if (this.pinger) { clearInterval(this.pinger); this.pinger = null; } }

  private onData(d: string) {
    this.buf += d;
    // banner: «Asterisk Call Manager/x.y.z\r\n» — birinchi qator, bir marta
    if (!this.bannerSeen) {
      const nl = this.buf.indexOf('\n');
      if (nl < 0) return;
      if (/^Asterisk Call Manager/.test(this.buf)) this.buf = this.buf.slice(nl + 1);
      this.bannerSeen = true;
      this.emit('banner');
    }
    let idx: number;
    while ((idx = this.buf.search(/\r?\n\r?\n/)) >= 0) {
      const m = /\r?\n\r?\n/.exec(this.buf)!;
      const block = this.buf.slice(0, idx);
      this.buf = this.buf.slice(idx + m[0].length);
      if (!block.trim()) continue;
      const msg = parseAmiBlock(block);
      // hodisa birinchi: OriginateResponse kabi hodisalarda ham `Response:` maydoni bor
      if (msg.Event) {
        this.emit('event', msg);
      } else if (msg.Response !== undefined) {
        const p = msg.ActionID ? this.pending.get(msg.ActionID) : undefined;
        if (p) {
          this.pending.delete(msg.ActionID);
          clearTimeout(p.timer);
          if (/^(success|goodbye|pong|follows)$/i.test(msg.Response)) p.resolve(msg); else p.reject(new Error(`AMI: ${msg.Message || msg.Response}`));
        }
      }
    }
  }

  /** `fields.ActionID` berilsa — shu ishlatiladi (masalan OriginateResponse hodisasini bog'lash uchun). */
  action(name: string, fields: Record<string, string> = {}): Promise<AmiMsg> {
    return new Promise((resolve, reject) => {
      if (!this.sock || this.sock.destroyed) return reject(new Error('AMI: ulanmagan'));
      const { ActionID, ...rest } = fields;
      const id = ActionID && /^[\w.:-]{1,80}$/.test(ActionID) ? ActionID : randomUUID();
      const clean = (v: string) => String(v).replace(/[\r\n]/g, ' ');
      const lines = [`Action: ${clean(name)}`, `ActionID: ${id}`, ...Object.entries(rest).map(([k, v]) => `${clean(k).replace(/:/g, '')}: ${clean(v)}`)];
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`AMI: «${name}» javob bermadi`));
        // javob kelmadi — ulanish «osilib» qolgan: yopamiz (provayder qayta ulanadi)
        try { this.sock?.destroy(); } catch { /* */ }
      }, this.opts.timeoutMs ?? 8000);
      this.pending.set(id, { resolve, reject, timer });
      this.sock.write(lines.join('\r\n') + '\r\n\r\n');
    });
  }

  close() { this.stopPing(); try { this.sock?.destroy(); } catch { /* */ } this.ready = false; }
}
