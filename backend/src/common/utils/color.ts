// Karta avatari uchun barqaror rang (ism/id'dan).
const PALETTE = [
  '#3F77DD',
  '#46B17B',
  '#D9952E',
  '#9b59b6',
  '#DE5147',
  '#2BB3C0',
  '#E0699F',
];

export function colorFromString(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}
