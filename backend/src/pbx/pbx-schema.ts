// Qo'ng'iroq oqimi modullari: turlar, standart qiymatlar, tozalash va «keyingi qadam» (forward) havolalari.
// Maydonlar OnlinePBX paneli bilan 1:1 (docs/amo-clone/PBX-CLONE.md).
export const MODULE_TYPES = ['user', 'trunk', 'telegram', 'numrule', 'timerule', 'greeting', 'voicemail', 'http', 'alias', 'postcall', 'group', 'queue'] as const;
export type ModuleType = (typeof MODULE_TYPES)[number];

/** Yangi modul raqami shu qiymatdan boshlab birinchi bo'sh raqam. */
export const NUMBER_BASE: Record<ModuleType, number> = {
  user: 100, group: 10, greeting: 5000, timerule: 5100, voicemail: 5120, queue: 5200, http: 5300, postcall: 5400, alias: 5500, telegram: 5600, numrule: 6200, trunk: 7000,
};

// `_` bilan boshlanmaydi (Asterisk'da `_…` — naqsh/pattern bo'lib qoladi); faqat xavfsiz belgilar
export const NUMBER_RE = /^(?!_)[0-9A-Za-z_+*#-]{1,32}$/;
/** Xodim (user) moduli raqami — faqat 2–5 xonali raqam (pjsip bo'lim nomi, PJSIP/<raqam>). Tizim bo'ylab ichki raqam chegarasi bilan bir xil. */
export const USER_NUMBER_RE = /^\d{2,5}$/;
/** Server/login (pjsip server_uri, client_uri, from_domain…): harf, raqam, `_ . : -` */
const HOST_RE = /^[\w.:-]+$/;
/** Raqam maskasi (numrule): raqamlar, X/Z/N, `+ * # . ! [ ] -`; `_` bilan boshlanmaydi. */
export const MASK_RE = /^[0-9XZN+*#.!\[\]-]+$/;
/** Konfiguratsiyani buzadigan belgilar: nazorat belgilari (\n, \r…), `;` (izoh), `"`. */
const UNSAFE = /[\x00-\x1f\x7f;"]/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export class SchemaError extends Error {}
const bad = (msg: string): never => { throw new SchemaError(msg); };

const str = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
/** Ko'rinadigan nom (callerid, displayName): xavfli belgilar olib tashlanadi. */
export const cleanName = (v: unknown, max = 100) => String(v ?? '').replace(/[\x00-\x1f\x7f;"<>\[\]\\]/g, '').trim().slice(0, max);
/** Qat'iy maydon: bo'sh bo'lmasa naqshga mos kelishi shart. */
const strict = (v: unknown, max: number, re: RegExp, label: string) => {
  const s = str(v, max);
  if (s && !re.test(s)) bad(`${label} noto'g'ri belgilar bor: ${s.replace(/[\x00-\x1f]/g, '?')}`);
  return s;
};
/** Erkin matn (parol, email): nazorat belgilari va `;` `"` rad etiladi. */
const safe = (v: unknown, max: number, label: string) => {
  const s = str(v, max);
  if (UNSAFE.test(s)) bad(`${label}: ruxsat etilmagan belgi (qator uzilishi, ; yoki ")`);
  return s;
};
const bool = (v: unknown, d = false) => (v === undefined || v === null ? d : !!v);
const int = (v: unknown, d: number, min: number, max: number) => {
  const n = v === undefined || v === null || v === '' ? d : Number(v);
  if (!Number.isFinite(n)) return bad('Son bo\'lishi kerak');
  return Math.min(max, Math.max(min, Math.round(n)));
};
const num = (v: unknown) => {
  const s = str(v, 32);
  if (s && !NUMBER_RE.test(s)) bad(`Noto'g'ri raqam: ${s}`);
  return s;
};
/** «101;102:2;103» yoki massiv → ['101','102','103'] (prioritet alohida). */
const list = (v: unknown): string[] => (Array.isArray(v) ? v : String(v ?? '').split(/[;,\s]+/)).map((x) => str(typeof x === 'object' && x ? (x as any).ext : x, 32).split(':')[0]).filter(Boolean).map((x) => num(x));

export interface Normalized { config: Record<string, unknown>; targets: string[]; members: string[] }

type Cfg = Record<string, any>;

export function normalizeConfig(type: ModuleType, raw: Cfg = {}): Normalized {
  const c = raw || {};
  switch (type) {
    case 'user': {
      const forward = (Array.isArray(c.forward) ? c.forward : []).slice(0, 3).map((f: Cfg) => ({ afterSec: int(f?.afterSec, 15, 1, 600), to: num(f?.to) }));
      while (forward.length < 3) forward.push({ afterSec: 15, to: '' });
      const acc = c.access || {};
      const notif = c.notify || {};
      const NOTIFS = ['missed', 'callback', 'license', 'failures', 'weekly', 'quality', 'news', 'balance'];
      return {
        config: {
          crmUserId: strict(c.crmUserId, 60, /^[\w-]+$/, 'CRM foydalanuvchi') || null, email: safe(c.email, 120, 'Email'), acceptSip: bool(c.acceptSip, true), forward,
          // brauzer (WebRTC) telefoni; stol telefoni (UDP) uchun false — pjsip'da webrtc=yes yozilmaydi
          webrtc: bool(c.webrtc, true),
          access: { calls: str(acc.calls, 32), ats: bool(acc.ats), analytics: bool(acc.analytics), quality: bool(acc.quality), clients: bool(acc.clients, true), billing: bool(acc.billing), profile: bool(acc.profile) },
          notify: Object.fromEntries(NOTIFS.map((k) => [k, { email: bool(notif[k]?.email), push: bool(notif[k]?.push) }])),
        },
        targets: forward.map((f: Cfg) => f.to).filter(Boolean), members: [],
      };
    }
    case 'trunk': {
      const forwardTo = num(c.forwardTo);
      return {
        config: {
          displayName: cleanName(c.displayName, 80), operator: strict(c.operator, 40, /^[\w-]+$/, 'Operator') || 'other',
          login: strict(c.login, 80, HOST_RE, 'Login'), server: strict(c.server, 120, HOST_RE, 'Server'), sipProxy: strict(c.sipProxy, 120, HOST_RE, 'SIP proxy'),
          forwardTo, forwardViaNumber: bool(c.forwardViaNumber, true), ...(c.password ? { password: safe(c.password, 120, 'Parol') } : {}),
        },
        targets: forwardTo ? [forwardTo] : [], members: [],
      };
    }
    case 'telegram':
      return { config: { phone: strict(c.phone, 20, /^\+?\d+$/, 'Telefon') }, targets: [], members: [] };
    case 'numrule': {
      const matchTo = num(c.matchTo), noMatchTo = num(c.noMatchTo);
      return { config: { mask: strict(c.mask, 64, MASK_RE, 'Maska'), matchTo, noMatchTo }, targets: [matchTo, noMatchTo].filter(Boolean), members: [] };
    }
    case 'timerule': {
      const days: Cfg = {};
      for (const d of DAYS) {
        const x = c.days?.[d] || {};
        const from = str(x.from, 5) || '09:00', to = str(x.to, 5) || '18:00';
        if (!HHMM.test(from) || !HHMM.test(to)) bad(`Vaqt HH:MM bo'lishi kerak (${d})`);
        days[d] = { on: bool(x.on, true), from, to };
      }
      const holidays = (Array.isArray(c.holidays) ? c.holidays : []).map((h: unknown) => str(h, 10)).filter((h: string) => /^\d{4}-\d{2}-\d{2}$/.test(h)).slice(0, 400);
      const workTo = num(c.workTo), offTo = num(c.offTo), holidayTo = num(c.holidayTo);
      const tz = str(c.timezone, 10) || 'UTC+5';
      if (!/^UTC[+-]\d{1,2}$/.test(tz)) bad("Vaqt mintaqasi 'UTC+5' ko'rinishida bo'lishi kerak");
      return { config: { timezone: tz, type: 'weekly', days, holidays, workTo, offTo, holidayTo }, targets: [workTo, offTo, holidayTo].filter(Boolean), members: [] };
    }
    case 'greeting': {
      const forwardTo = num(c.forwardTo);
      const menu = (Array.isArray(c.menu) ? c.menu : []).slice(0, 12).map((m: Cfg) => ({ key: str(m?.key, 1), to: num(m?.to) })).filter((m: Cfg) => /^[0-9*#]$/.test(m.key) && m.to);
      return { config: { audioId: str(c.audioId, 80) || null, allowExt: bool(c.allowExt, true), delaySec: int(c.delaySec, 15, 0, 120), forwardTo, menu }, targets: [forwardTo, ...menu.map((m: Cfg) => m.to)].filter(Boolean), members: [] };
    }
    case 'voicemail': {
      const forwardTo = num(c.forwardTo);
      return { config: { audioBefore: str(c.audioBefore, 80) || null, audioAfter: str(c.audioAfter, 80) || null, recordSec: int(c.recordSec, 15, 3, 300), silenceSec: int(c.silenceSec, 5, 1, 30), forwardTo, email: safe(c.email, 120, 'Email') }, targets: forwardTo ? [forwardTo] : [], members: [] };
    }
    case 'http': {
      const forwardTo = num(c.forwardTo);
      const url = str(c.url, 500);
      if (url && !/^https?:\/\/[^\s]+$/i.test(url)) bad("Adres http(s):// bilan boshlanishi kerak");
      if (UNSAFE.test(url) || /[`'\\]/.test(url)) bad("Adresda ruxsat etilmagan belgi bor");
      return { config: { timeoutSec: int(c.timeoutSec, 5, 1, 30), url, forwardTo }, targets: forwardTo ? [forwardTo] : [], members: [] };
    }
    case 'alias': {
      const forwardTo = num(c.forwardTo);
      return { config: { sipNumber: strict(c.sipNumber, 64, /^[\w.+@:-]+$/, 'SIP raqam'), forwardTo }, targets: forwardTo ? [forwardTo] : [], members: [] };
    }
    case 'postcall':
      return { config: { staff: list(c.staff), handleSec: int(c.handleSec, 180, 5, 3600) }, targets: [], members: list(c.staff) };
    case 'group': {
      const forwardTo = num(c.forwardTo);
      const members = list(c.members);
      return { config: { members, afterSec: int(c.afterSec, 20, 1, 600), forwardTo }, targets: forwardTo ? [forwardTo] : [], members };
    }
    case 'queue': {
      const forwardTo = num(c.forwardTo);
      const raw: unknown[] = Array.isArray(c.members) ? c.members : String(c.members ?? '').split(/[;,\s]+/);
      const members = raw.map((m) => {
        if (m && typeof m === 'object') return { ext: num((m as Cfg).ext), priority: int((m as Cfg).priority, 1, 1, 9) };
        const [ext, pr] = String(m).split(':');
        return { ext: num(ext), priority: int(pr, 1, 1, 9) };
      }).filter((m) => m.ext);
      const strategy = ['count', 'ringall', 'roundrobin', 'random'].includes(str(c.strategy)) ? str(c.strategy) : 'count';
      return {
        config: { audioId: str(c.audioId, 80) || null, ringSec: int(c.ringSec, 15, 3, 120), members, strategy, smartTransfer: bool(c.smartTransfer), countCalls: ['all', 'in', 'out'].includes(str(c.countCalls)) ? str(c.countCalls) : 'all', greetingId: str(c.greetingId, 80) || null, announcePosition: bool(c.announcePosition), lang: str(c.lang, 5) || 'ru', repeatSec: int(c.repeatSec, 0, 0, 600), queueSec: int(c.queueSec, 180, 5, 3600), forwardTo },
        targets: forwardTo ? [forwardTo] : [], members: members.map((m) => m.ext),
      };
    }
  }
}
