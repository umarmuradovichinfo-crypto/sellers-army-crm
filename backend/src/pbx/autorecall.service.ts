import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { LeaderService } from '../common/leader.service';
import { PbxGateway } from '../onlinepbx/pbx.gateway';
import { PrismaService } from '../prisma/prisma.service';

const CFG_KEY = 'pbx_autorecall';
const STATE_KEY = 'pbx_autorecall_state';
const TZ = 5 * 3_600_000;

export interface AutoRecallCfg { enabled: boolean; ext: string; delayMin: number; attempts: number; retryMin: number; fromHour: number; toHour: number; withinHours: number }
export const DEFAULT_RECALL: AutoRecallCfg = { enabled: false, ext: '', delayMin: 5, attempts: 3, retryMin: 15, fromHour: 9, toHour: 20, withinHours: 24 };
type State = Record<string, { n: number; last: number }>;

/**
 * Qaysi o'tkazib yuborilgan kiruvchilarga hozir qayta qo'ng'iroq qilish kerak (sof funksiya — testlanadi).
 * Shartlar: ish vaqti (Toshkent), kechikish o'tgan, urinishlar tugamagan, oraliq o'tgan, shu raqamga keyinroq chiquvchi qo'ng'iroq bo'lmagan.
 */
export function pickRecalls(
  missed: { id: string; phone: string; at: number }[], outs: { phone: string; at: number }[], state: State, cfg: AutoRecallCfg, now: number,
): { id: string; phone: string }[] {
  const hour = new Date(now + TZ).getUTCHours();
  if (hour < cfg.fromHour || hour >= cfg.toHour) return [];
  const seenPhone = new Set<string>();
  const out: { id: string; phone: string }[] = [];
  for (const m of [...missed].sort((a, b) => b.at - a.at)) { // yangidan eskiga: bir raqamga bitta urinish
    if (seenPhone.has(m.phone)) continue;
    seenPhone.add(m.phone);
    if (now - m.at > cfg.withinHours * 3_600_000) continue;
    if (outs.some((o) => o.phone === m.phone && o.at > m.at)) continue; // allaqachon qayta qo'ng'iroq qilingan
    const st = state[m.id];
    if (st && st.n >= cfg.attempts) continue;
    const due = (st ? st.last + cfg.retryMin * 60_000 : m.at + cfg.delayMin * 60_000);
    if (now >= due) out.push({ id: m.id, phone: m.phone });
  }
  return out;
}

@Injectable()
export class AutoRecallService implements OnModuleInit {
  private readonly logger = new Logger('AutoRecall');
  constructor(private readonly prisma: PrismaService, private readonly pbx: PbxGateway, private readonly leader: LeaderService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    const t = setInterval(() => { this.leader.guard(() => this.tick()).catch((e) => this.logger.warn('tick: ' + (e as Error).message)); }, 60_000);
    t.unref?.();
  }

  private async read<T>(key: string, d: T): Promise<T> {
    const row = await this.prisma.appSetting.findUnique({ where: { key } });
    try { return row ? (JSON.parse(row.value) as T) : d; } catch { return d; }
  }
  private async write(key: string, v: unknown) {
    const value = JSON.stringify(v);
    await this.prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }

  async config(): Promise<AutoRecallCfg> { return { ...DEFAULT_RECALL, ...(await this.read<Partial<AutoRecallCfg>>(CFG_KEY, {})) }; }

  async save(dto: Partial<AutoRecallCfg>): Promise<AutoRecallCfg> {
    const cur = await this.config();
    const n = (v: unknown, d: number, min: number, max: number) => { const x = v === undefined ? d : Number(v); if (!Number.isFinite(x) || x < min || x > max) throw new BadRequestException({ error: 'BAD_VALUE', message: `Qiymat ${min}–${max} oralig'ida bo'lsin` }); return Math.round(x); };
    const next: AutoRecallCfg = {
      enabled: dto.enabled === undefined ? cur.enabled : !!dto.enabled,
      ext: String(dto.ext ?? cur.ext).trim().slice(0, 32),
      delayMin: n(dto.delayMin, cur.delayMin, 1, 240), attempts: n(dto.attempts, cur.attempts, 1, 10), retryMin: n(dto.retryMin, cur.retryMin, 1, 720),
      fromHour: n(dto.fromHour, cur.fromHour, 0, 23), toHour: n(dto.toHour, cur.toHour, 1, 24), withinHours: n(dto.withinHours, cur.withinHours, 1, 168),
    };
    if (next.toHour <= next.fromHour) throw new BadRequestException({ error: 'BAD_HOURS', message: "Tugash soati boshlanishdan keyin bo'lsin" });
    if (next.enabled && !next.ext) throw new BadRequestException({ error: 'NO_EXT', message: "Yoqish uchun ichki raqam ko'rsating (qo'ng'iroq shu raqamdan boshlanadi)" });
    await this.write(CFG_KEY, next);
    return next;
  }

  async tick(now = Date.now()) {
    const cfg = await this.config();
    if (!cfg.enabled || !cfg.ext) return { called: 0 };
    if (!(await this.pbx.enabled().catch(() => false))) return { called: 0 };
    const since = new Date(now - cfg.withinHours * 3_600_000);
    const rows = await this.prisma.callLog.findMany({ where: { startedAt: { gte: since } }, select: { id: true, phone: true, direction: true, status: true, startedAt: true }, orderBy: { startedAt: 'desc' }, take: 3000 });
    const digits = (p: string) => p.replace(/\D/g, '');
    const missed = rows.filter((r) => r.direction === 'in' && r.status === 'missed' && digits(r.phone).length > 4).map((r) => ({ id: r.id, phone: r.phone, at: r.startedAt.getTime() }));
    const outs = rows.filter((r) => r.direction === 'out').map((r) => ({ phone: r.phone, at: r.startedAt.getTime() }));
    const state = await this.read<State>(STATE_KEY, {});
    const due = pickRecalls(missed, outs, state, cfg, now);
    let called = 0;
    for (const d of due.slice(0, 5)) { // bir tikda ko'pi bilan 5 ta (stansiyani bosmaslik uchun)
      const r = await this.pbx.call(cfg.ext, d.phone).catch(() => null);
      state[d.id] = { n: (state[d.id]?.n || 0) + 1, last: now };
      if (r?.ok) called++;
    }
    if (due.length) {
      const keep = Object.entries(state).filter(([, v]) => now - v.last < 7 * 86_400_000).slice(-500);
      await this.write(STATE_KEY, Object.fromEntries(keep));
    }
    return { called };
  }
}
