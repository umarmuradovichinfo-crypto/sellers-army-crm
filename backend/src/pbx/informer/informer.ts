// Avtoinformator — sof funksiyalar (e2e testlarda tekshiriladi): raqam importi, ish oynasi, navbatdagi raqamlarni tanlash, urinish natijasi.
import { phoneKey } from '../phone';

export const INFORMER_MAX_NUMBERS = 5000;
const TZ = 5 * 3_600_000;
export const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface ParsedNumbers { numbers: string[]; invalid: number; duplicates: number; foreign: number }

/**
 * CSV yoki erkin matn → normallashtirilgan raqamlar (faqat raqamlar, mamlakat prefiksi bilan). Har qator `,` `;` tab bilan bo'linadi —
 * 7–15 raqamli har katak raqam deb olinadi (ism/izoh ustunlari e'tiborsiz). O'zbekiston uchun 9 xonali (90 123 45 67) — 998 qo'shiladi.
 * Takrorlar (oxirgi 9 raqam bo'yicha ham) olib tashlanadi; prefikslar oq ro'yxatidan tashqari — `foreign`.
 */
export function parseNumbers(text: string, prefixes: string[], existing: string[] = []): ParsedNumbers {
  const seen = new Set(existing.map((p) => phoneKey(p)));
  const out: string[] = [];
  let invalid = 0, duplicates = 0, foreign = 0;
  for (const line of String(text || '').split(/\r?\n/)) {
    const cells = line.split(/[,;\t|]/).map((c) => c.trim()).filter(Boolean);
    let found = false;
    for (const cell of cells) {
      if (!/^[+\d\s().-]+$/.test(cell)) continue; // ism, izoh
      let d = cell.replace(/\D/g, '');
      if (d.length < 7) continue;
      found = true;
      if (d.length === 9 && prefixes.includes('998')) d = '998' + d;
      if (d.length < 7 || d.length > 15) { invalid++; continue; }
      if (prefixes.length && !prefixes.some((p) => d.startsWith(p))) { foreign++; continue; }
      const k = phoneKey(d);
      if (seen.has(k)) { duplicates++; continue; }
      seen.add(k);
      out.push(d);
    }
    if (!found && cells.some((c) => /\d{3,}/.test(c))) invalid++;
  }
  return { numbers: out, invalid, duplicates, foreign };
}

/** Ish oynasi (Toshkent vaqti, HH:MM): from < to — oddiy; from > to — tunni kesib o'tadi; from = to — butun sutka. */
export function inWindow(now: number, from: string, to: string): boolean {
  const d = new Date(now + TZ);
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  const f = toMin(from), t = toMin(to);
  if (f === t) return true;
  return f < t ? m >= f && m < t : m >= f || m < t;
}
const toMin = (s: string) => { const [h, m] = String(s).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export const tashkentDay = (now: number) => new Date(now + TZ).toISOString().slice(0, 10);

export interface TargetRow { id: string; phone: string; state: string; attempts: number; lastAt: Date | null }
/** Hozir qo'ng'iroq qilinadiganlar: pending; birinchi urinish yoki oxirgisidan ≥ retryMin o'tgan; urinishlar tugamagan. */
export function pickTargets(rows: TargetRow[], c: { retries: number; retryMin: number }, now: number, slots: number): TargetRow[] {
  if (slots <= 0) return [];
  return rows
    .filter((r) => r.state === 'pending' && r.attempts <= c.retries && (r.attempts === 0 || !r.lastAt || now - r.lastAt.getTime() >= c.retryMin * 60_000))
    .sort((a, b) => a.attempts - b.attempts || (a.lastAt?.getTime() || 0) - (b.lastAt?.getTime() || 0))
    .slice(0, slots);
}

/** Originate Reason → qisqa sabab. */
export function reasonText(reason: string): string {
  return ({ '4': 'answered', '5': 'busy', '8': 'congestion', '3': 'noanswer', '1': 'noanswer', '0': 'error' } as Record<string, string>)[String(reason)] || 'noanswer';
}

/** Urinish tugadi: javob berildi — answered; aks holda urinishlar qolgan bo'lsa — pending (qayta), qolmasa — noanswer/failed. */
export function afterAttempt(t: { attempts: number }, retries: number, answered: boolean, result: string): string {
  if (answered) return 'answered';
  if (t.attempts <= retries) return 'pending';
  return result === 'error' || result === 'congestion' ? 'failed' : 'noanswer';
}
