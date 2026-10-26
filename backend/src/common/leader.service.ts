import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * «Rahbar» qulfi: bir nechta nusxa (asosiy + zaxira server) bir bazaga ulansa, fon vazifalari (eslatma, avtomatlashtirish, Salesbot,
 * OnlinePBX sinxron, hisobotlar) faqat BITTA nusxada ishlaydi. Ijara (lease) qatori `app_settings`da: egasi muddatni uzaytiradi,
 * egasi o'chsa ~45 soniyadan keyin boshqa nusxa egallaydi. Bitta nusxada har doim rahbar.
 */
const LEASE_MS = 45_000;
const RECHECK_MS = 10_000;

@Injectable()
export class LeaderService {
  private readonly logger = new Logger('Leader');
  private readonly me = randomUUID();
  private last = 0;
  private leader = false;

  constructor(private readonly prisma: PrismaService) {}

  /** Bu nusxa hozir rahbarmi (natija 10 soniya keshlanadi). Baza xatosida — emas (eski holatni saqlamaydi). */
  async isLeader(): Promise<boolean> {
    if (Date.now() - this.last < RECHECK_MS) return this.leader;
    this.last = Date.now();
    try {
      const rows = await this.prisma.$queryRaw<{ key: string }[]>(Prisma.sql`
        INSERT INTO app_settings (key, value, "updatedAt")
        VALUES ('leader_lease', json_build_object('owner', ${this.me}::text, 'until', (extract(epoch from now()) * 1000)::bigint + ${LEASE_MS})::text, now())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()
        WHERE (app_settings.value::json ->> 'owner') = ${this.me}::text
           OR (app_settings.value::json ->> 'until')::bigint < (extract(epoch from now()) * 1000)::bigint
        RETURNING key`);
      const now = rows.length > 0;
      if (now !== this.leader) this.logger.log(now ? 'Bu nusxa RAHBAR bo\'ldi (fon vazifalari shu yerda ishlaydi)' : 'Rahbarlik boshqa nusxada');
      this.leader = now;
    } catch (e) {
      this.leader = false;
      this.logger.warn('Rahbar tekshiruvi xato: ' + (e as Error).message);
    }
    return this.leader;
  }

  /** Fon vazifasini faqat rahbar nusxada ishga tushiradi. */
  async guard<T>(fn: () => Promise<T> | T): Promise<T | undefined> {
    if (await this.isLeader()) return fn();
    return undefined;
  }
}

@Global()
@Module({ providers: [LeaderService], exports: [LeaderService] })
export class LeaderModule {}
