// Litsenziya kodi: SA1.<payload base64url>.<imzo base64url>. Imzo = HMAC-SHA256(LICENSE_SECRET), 16 bayt.
// Kodni faqat sirni biladigan kishi (biz) yarata oladi: scripts/license.mjs. Server sirni faqat tekshirish uchun ishlatadi.
import { createHmac, timingSafeEqual } from 'crypto';

export interface LicensePayload {
  i: string; // noyob id (qayta ishlatishdan himoya)
  p: string; // tarif
  u: number; // foydalanuvchilar soni
  m: number; // necha oy beriladi (sovg'a oylar bilan)
  c?: string; // mijoz nomi (faqat tarix uchun)
  d?: string; // o'rnatish id (installId): kod faqat shu o'rnatishda ishlaydi
}

const b64 = (b: Buffer) => b.toString('base64url');

export function signLicense(payload: LicensePayload, secret: string): string {
  const body = b64(Buffer.from(JSON.stringify(payload)));
  const sig = b64(createHmac('sha256', secret).update(body).digest().subarray(0, 16));
  return `SA1.${body}.${sig}`;
}

export function verifyLicense(code: string, secret: string): LicensePayload | null {
  const parts = String(code || '').trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'SA1') return null;
  const expected = createHmac('sha256', secret).update(parts[1]).digest().subarray(0, 16);
  let got: Buffer;
  try { got = Buffer.from(parts[2], 'base64url'); } catch { return null; }
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as LicensePayload;
    if (!p || typeof p.i !== 'string' || typeof p.p !== 'string' || !Number.isInteger(p.u) || !Number.isInteger(p.m) || (p.d !== undefined && typeof p.d !== 'string')) return null;
    return p;
  } catch { return null; }
}
