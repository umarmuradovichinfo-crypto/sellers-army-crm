// Asterisk Manager Interface (AMI) mijozi: matn protokoli (Key: Value bloklari, bo'sh qator bilan ajratilgan).
// Faqat kerakli qismi: Login, action (Originate, Command, Ping), hodisalarni tinglash. Tashqi kutubxonasiz.
import { EventEmitter } from 'events';
import { connect, type Socket } from 'net';
import { randomUUID } from 'crypto';

export type AmiMsg = Record<string, string>;
export interface AmiOpts { host: string; port: number; user: string; secret: string; timeoutMs?: number }

export function parseAmiBlock(block: string): AmiMsg {
  const m: AmiMsg = {};
  for (const line of block.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) m[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return m;
}

export class AmiClient extends EventEmitter {
  private sock: Socket | null = null;
  private buf = '';
  private pending = new Map<string, { resolve: (m: AmiMsg) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private ready = false;
  private bannerSeen = false;

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
      s.on('error', (e) => { fail(e); this.emit('error', e); });
      s.on('close', () => { this.ready = false; for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('AMI: ulanish uzildi')); } this.pending.clear(); this.emit('close'); });
      s.on('data', (d: string) => this.onData(d));
      this.once('banner', () => {
        this.action('Login', { Username: this.opts.user, Secret: this.opts.secret, Events: 'on' })
          .then(() => { this.ready = true; if (!done) { done = true; clearTimeout(timer); resolve(); } })
          .catch((e) => { fail(e); s.destroy(); });
      });
    });
  }

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
      if (msg.Response !== undefined) {
        const p = msg.ActionID ? this.pending.get(msg.ActionID) : undefined;
        if (p) {
          this.pending.delete(msg.ActionID);
          clearTimeout(p.timer);
          if (/^(success|goodbye|pong)$/i.test(msg.Response)) p.resolve(msg); else p.reject(new Error(`AMI: ${msg.Message || msg.Response}`));
        }
      } else if (msg.Event) {
        this.emit('event', msg);
      }
    }
  }

  action(name: string, fields: Record<string, string> = {}): Promise<AmiMsg> {
    return new Promise((resolve, reject) => {
      if (!this.sock || this.sock.destroyed) return reject(new Error('AMI: ulanmagan'));
      const id = randomUUID();
      const lines = [`Action: ${name}`, `ActionID: ${id}`, ...Object.entries(fields).map(([k, v]) => `${k}: ${String(v).replace(/[\r\n]/g, ' ')}`)];
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`AMI: «${name}» javob bermadi`)); }, this.opts.timeoutMs ?? 8000);
      this.pending.set(id, { resolve, reject, timer });
      this.sock.write(lines.join('\r\n') + '\r\n\r\n');
    });
  }

  close() { try { this.sock?.destroy(); } catch { /* */ } this.ready = false; }
}
