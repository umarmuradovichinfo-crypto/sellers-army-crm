/** UTM / reklama izlari: forma, Facebook va sayt orqali kelgan lidning customJson'iga yoziladigan kalitlar. */
export const UTM_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_referrer',
  'roistat', 'referrer', 'from', 'gclientid', '_ym_uid', '_ym_counter', 'gclid', 'yclid', 'fbclid',
];
const UTM_RE = /^(utm_[a-z0-9_]+|openstat_[a-z0-9_]+)$/i;

export function isUtmKey(k: string): boolean {
  return UTM_KEYS.includes(k) || UTM_RE.test(k);
}

/** Obyekt (querystring, body.utm, javoblar) ichidan UTM kalitlarini ajratib oladi (qiymat matn, <= 300 belgi). */
export function pickUtm(src: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!src || typeof src !== 'object') return out;
  for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
    const key = k.toLowerCase();
    if (!isUtmKey(key) || v == null || typeof v === 'object') continue;
    const s = String(v).trim().slice(0, 300);
    if (s) out[key] = s;
  }
  return out;
}
