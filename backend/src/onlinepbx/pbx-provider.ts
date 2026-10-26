// Telefoniya provayderi interfeysi: CRM (CallsService) faqat shu interfeysga tayanadi — OnlinePBX yoki o'z stansiyamiz (Asterisk) ulanadi.
export type PbxKind = 'onlinepbx' | 'own';

/** Provayderdan mustaqil, normallangan qo'ng'iroq yozuvi (tarix sinxroni uchun). */
export interface PbxCall {
  uuid: string;
  /** provayder bergan yo'nalish/turi belgisi (accountcode/type) — kichik harfda; yo'nalishni aniqlashga yordam beradi */
  accountHint: string;
  caller: string;
  callee: string;
  talkSec: number;
  durationSec: number;
  hangup: string;
  recordUrl: string | null;
  startedAt: Date;
}

export interface PbxProvider {
  readonly kind: PbxKind;
  enabled(): Promise<boolean>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
  /** Click-to-call: `from` (ichki raqam) ringaydi, so'ng `to` (mijoz) ga ulanadi. */
  call(from: string, to: string, extra?: Record<string, string>): Promise<{ ok: boolean; uuid?: string; comment?: string; raw: unknown }>;
  /** Tarix: normallangan qo'ng'iroqlar (params — provayder bo'yicha filtr: start_stamp_from/to, limit, uuid). */
  history(params: Record<string, string>): Promise<PbxCall[]>;
  recordUrl(uuid: string): Promise<string | null>;
  fetchRecording(uuidOrUrl: string): Promise<{ buffer: Buffer; contentType: string } | null>;
}

/** Vaqt belgisini (soniya/millisoniya/ISO/'YYYY-MM-DD hh:mm:ss') Date'ga aylantiradi; bo'lmasa — hozir. */
export function parseStamp(v: unknown): Date {
  if (v == null || v === '') return new Date();
  if (typeof v === 'number') return new Date(v > 1e12 ? v : v * 1000);
  const s = String(v).trim();
  if (/^\d+$/.test(s)) { const n = Number(s); return new Date(n > 1e12 ? n : n * 1000); }
  const iso = s.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z');
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date() : d;
}
