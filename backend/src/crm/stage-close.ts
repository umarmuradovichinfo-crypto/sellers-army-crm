/**
 * Bitim bosqichi o'zgarganda yopilish maydonlari — barcha yo'llar (kartochka, voronkada sudrash, ommaviy amal,
 * avtomatlashtirish, yaratish) bir xil mantiqda: yutilgan → wonAt, yo'qotilgan → lostAt (+ sabab),
 * ochiq bosqichga qaytganda sanalar va yo'qotish sababi tozalanadi (statistikada qayta ochilgan bitim yo'qotilgan sanalmasin).
 */
export function stageCloseData(kind: string | null | undefined, lostReason?: string | null): Record<string, unknown> {
  if (kind === 'won') return { wonAt: new Date(), lostAt: null, lostReason: null };
  if (kind === 'lost') {
    const d: Record<string, unknown> = { lostAt: new Date(), wonAt: null };
    if (lostReason !== undefined) d.lostReason = lostReason || null;
    return d;
  }
  return { wonAt: null, lostAt: null, lostReason: null };
}
