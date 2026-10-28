import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join, resolve, sep } from 'path';

import { LeaderService } from '../common/leader.service';
import { PbxService } from './pbx.service';

/**
 * Yozuv fayli nomi: qo'ng'iroq identifikatori — CRM uuid (click-to-call, Originate ChannelId) yoki Asterisk UniqueID (`1793190280.12`);
 * ixtiyoriy `-vm` (ovozli pochta xabari); kengaytma wav/mp3. Boshqa hech qanday fayl (tone.wav, papkalar, yashirin fayllar) o'chirilmaydi.
 */
export const RECORDING_FILE_RE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{9,12}\.\d{1,9})(?:-vm)?\.(?:wav|mp3)$/i;
const DAY_MS = 86_400_000;

/**
 * Yozuvlarni saqlash muddati: har sutkada (va ishga tushgandan ~2 daqiqa keyin) ASTERISK_RECORDINGS_DIR dagi `keepDays` kundan eski yozuvlar o'chiriladi.
 * Faqat RAHBAR nusxada (LeaderService.guard). call_logs.recordUrl o'zgartirilmaydi — fayl yo'q bo'lsa jurnal «yozuv mavjud emas» ko'rsatadi (hasRecording).
 */
@Injectable()
export class RecordingRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('RecordingRetention');
  private timers: NodeJS.Timeout[] = [];

  constructor(private readonly pbx: PbxService, private readonly leader: LeaderService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    const run = () => this.leader.guard(() => this.cleanup()).catch((e) => this.logger.warn('tozalash: ' + (e as Error).message));
    const first = setTimeout(run, 120_000);
    const daily = setInterval(run, DAY_MS);
    first.unref?.(); daily.unref?.();
    this.timers.push(first, daily);
  }
  onModuleDestroy() { for (const t of this.timers) clearTimeout(t); }

  /** Bir martalik tozalash. `now` — sinov uchun. Natija: o'chirilgan/qoldirilgan fayllar soni. */
  async cleanup(now = Date.now()): Promise<{ ok: boolean; keepDays: number; deleted: number; kept: number; skipped?: string }> {
    const { keepDays } = await this.pbx.recording();
    const dirEnv = process.env.ASTERISK_RECORDINGS_DIR;
    if (!keepDays) return { ok: true, keepDays, deleted: 0, kept: 0, skipped: 'keepDays=0' };
    if (!dirEnv) return { ok: true, keepDays, deleted: 0, kept: 0, skipped: 'ASTERISK_RECORDINGS_DIR yo`q' };
    const dir = resolve(dirEnv);
    const limit = now - keepDays * DAY_MS;
    let deleted = 0, kept = 0;
    let names: string[];
    try { names = await fs.readdir(dir); } catch (e) { return { ok: false, keepDays, deleted, kept, skipped: (e as Error).message }; }
    for (const name of names) {
      if (!RECORDING_FILE_RE.test(name)) continue;
      const p = join(dir, name);
      if (!p.startsWith(dir + sep)) continue; // yo'l o'tishi (nom oq ro'yxatdan o'tgani uchun bo'lmaydi — ikkinchi himoya)
      try {
        const st = await fs.lstat(p); // simlink ortidan bormaymiz
        if (!st.isFile()) continue;
        if (st.mtimeMs < limit) { await fs.unlink(p); deleted++; } else kept++;
      } catch { /* parallel o'chirilgan / ruxsat yo'q */ }
    }
    if (deleted) this.logger.log(`Eski yozuvlar o'chirildi: ${deleted} ta (${keepDays} kundan eski)`);
    return { ok: true, keepDays, deleted, kept };
  }
}
