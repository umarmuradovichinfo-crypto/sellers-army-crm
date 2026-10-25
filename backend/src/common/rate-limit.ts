import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Oddiy xotiradagi so'rov cheklagich (bitta server nusxasi uchun yetarli): kalit bo'yicha oyna ichidagi hodisalar soni.
 * Login'da parol tanlashga (brute-force) va ommaviy formada spamga qarshi.
 */
const hits = new Map<string, number[]>();
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, arr] of hits) if (!arr.length || now - arr[arr.length - 1] > 3_600_000) hits.delete(k);
}

/** oynadagi hodisalar soni (yangi hodisa qo'shmaydi) */
export function rateCount(key: string, windowMs: number): number {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length) hits.set(key, arr); else hits.delete(key);
  return arr.length;
}

export function rateHit(key: string) {
  const now = Date.now();
  sweep(now);
  const arr = hits.get(key) || [];
  arr.push(now);
  if (arr.length > 500) arr.splice(0, arr.length - 500);
  hits.set(key, arr);
}

export function rateReset(key: string) { hits.delete(key); }

/** limitdan oshgan bo'lsa 429 (aks holda hodisani hisoblaydi) */
export function rateLimit(key: string, max: number, windowMs: number, message: string) {
  if (rateCount(key, windowMs) >= max) throw new HttpException({ error: 'TOO_MANY_REQUESTS', message }, HttpStatus.TOO_MANY_REQUESTS);
  rateHit(key);
}
