const UZ_MONTHS = [
  'Yan',
  'Fev',
  'Mar',
  'Apr',
  'May',
  'Iyn',
  'Iyl',
  'Avg',
  'Sen',
  'Okt',
  'Noy',
  'Dek',
];

/** "27 Iyn 14:00" ko'rinishida (Asia/Tashkent, UTC+5). */
export function formatUzShort(date: Date): string {
  // UTC+5 (Asia/Tashkent) ga o'tkazamiz
  const t = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  const day = t.getUTCDate();
  const month = UZ_MONTHS[t.getUTCMonth()];
  const hh = String(t.getUTCHours()).padStart(2, '0');
  const mm = String(t.getUTCMinutes()).padStart(2, '0');
  return `${day} ${month} ${hh}:${mm}`;
}

/** Ikki sana orasidagi to'liq kunlar soni. */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

// Tashkent (UTC+5) bo'yicha YYYY-MM-DD kun kaliti
function tashkentDayKey(date: Date): string {
  const t = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  return `${t.getUTCFullYear()}-${t.getUTCMonth()}-${t.getUTCDate()}`;
}

/** Muddat yorlig'i: "Bugun" | "Ertaga" | "28 Iyn". */
export function formatDueUz(date: Date): string {
  const now = new Date();
  const today = tashkentDayKey(now);
  const tomorrow = tashkentDayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const key = tashkentDayKey(date);
  if (key === today) return 'Bugun';
  if (key === tomorrow) return 'Ertaga';
  const t = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  return `${t.getUTCDate()} ${UZ_MONTHS[t.getUTCMonth()]}`;
}
