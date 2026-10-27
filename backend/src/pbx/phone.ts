// Telefon raqami yordamchilari (PBX, qo'ng'iroqlar jurnali, qora ro'yxat, avto-qayta qo'ng'iroq) — hamma joyda bir xil qoida.

/** Ichki raqam (xodim/extension): 2–5 xonali. Tizim bo'ylab yagona chegara: ≤5 xona — ichki, undan uzun — tashqi. */
export const EXT_RE = /^\d{2,5}$/;
export const EXT_MAX_DIGITS = 5;

export const digitsOf = (p?: string | null) => String(p ?? '').replace(/\D/g, '');

/** Ichki raqammi (raqamlari 1..5 xona). */
export const isInternalNumber = (p?: string | null) => { const d = digitsOf(p); return d.length > 0 && d.length <= EXT_MAX_DIGITS; };

/**
 * Raqamni solishtirish kaliti: oxirgi 9 raqam (+998 90 123 45 67 / 998901234567 / 901234567 / 8901234567 bir xil).
 * 9 tadan qisqa raqam — o'zi (to'liq raqamlari).
 */
export const phoneKey = (p?: string | null) => { const d = digitsOf(p); return d.length > 9 ? d.slice(-9) : d; };

/**
 * Terish uchun normallashtirish (Originate `Exten`): bo'shliq, chiziqcha, qavs va boshidagi `+` olib tashlanadi — faqat raqamlar.
 * Noto'g'ri belgi (harf, `@`, `/`, `;` …) bo'lsa yoki uzunlik 3..20 bo'lmasa — null.
 */
export function dialable(p?: string | null): string | null {
  const s = String(p ?? '').trim().replace(/[\s().-]/g, '');
  if (!/^\+?\d{3,20}$/.test(s)) return null;
  return s.replace(/^\+/, '');
}
