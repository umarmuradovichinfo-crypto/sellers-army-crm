import { promises as dns } from 'dns';
import { isIP } from 'net';

// Webhook URL xavfsizligi (SSRF): localhost, 127.*, 10.*, 172.16-31.*, 192.168.*, 169.254.*, 0.*, ::1 va ichki IPv6 manzillar BLOKLANADI.

function blockedV4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 127 || a === 10) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function blockedV6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === '::1' || s === '::') return true;
  if (s.startsWith('::ffff:') || s.startsWith('64:ff9b:')) return true; // IPv4-mapped / NAT64 — butunlay bloklanadi
  if (/^f[cd]/.test(s)) return true; // fc00::/7
  if (/^fe[89ab]/.test(s)) return true; // fe80::/10
  if (s.startsWith('ff')) return true; // multicast
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return blockedV4(ip);
  if (v === 6) return blockedV6(ip);
  return true;
}

/** Sinxron tekshiruv (saqlash vaqtida): sxema va literal host. Xato bo'lsa matn qaytaradi. */
export function webhookUrlProblem(raw: unknown): string | null {
  let u: URL;
  try { u = new URL(String(raw || '').trim()); } catch { return "URL noto'g'ri"; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'Faqat http/https';
  if (u.username || u.password) return "URL'da login/parol bo'lmasligi kerak";
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) return "Host ko'rsatilmagan";
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return 'Ichki manzilga webhook yuborib bo\'lmaydi';
  if (isIP(host) && isBlockedIp(host)) return 'Ichki manzilga webhook yuborib bo\'lmaydi';
  return null;
}

/** To'liq tekshiruv (yuborishdan oldin): DNS'ni ham yechib, barcha manzillar ommaviyligini tekshiradi. */
export async function assertSafeWebhookUrl(raw: unknown): Promise<URL> {
  const pr = webhookUrlProblem(raw);
  if (pr) throw new Error(pr);
  const u = new URL(String(raw).trim());
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!isIP(host)) {
    const addrs = await dns.lookup(host, { all: true });
    if (!addrs.length || addrs.some((a) => isBlockedIp(a.address))) throw new Error('Ichki manzilga webhook yuborib bo\'lmaydi');
  }
  return u;
}
