import { BadRequestException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PbxService, transcodeWav } from '../pbx.service';
import {
  TTS_LANGS, TTS_MAX, TtsError, VOICES, azureSynth, cleanTtsText, espeakAvailable, espeakSynth, googleSynth, mockSynth, pickProvider, pickVoice, providerAvailable,
  type TtsLang, type TtsProviderId,
} from './tts';

const CFG_KEY = 'pbx_tts';
const USAGE_KEY = 'pbx_tts_usage';
const TZ = 5 * 3_600_000;
const dayKey = (now = Date.now()) => new Date(now + TZ).toISOString().slice(0, 10);

/** «Синтез речи»: matndan audio fayl (audio kutubxonaga `audioAdd` orqali yoziladi). Sutkalik limit — PBX_TTS_DAILY (standart 100). */
@Injectable()
export class TtsService {
  constructor(private readonly prisma: PrismaService, private readonly pbx: PbxService) {}

  private async cfg(): Promise<{ provider: string }> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: CFG_KEY } });
    try { return { provider: 'auto', ...(row ? JSON.parse(row.value) : {}) }; } catch { return { provider: 'auto' }; }
  }
  private limit() { const n = Number(process.env.PBX_TTS_DAILY ?? 100); return Number.isInteger(n) && n > 0 ? n : 100; }

  async voices() {
    const espeak = await espeakAvailable();
    const c = await this.cfg();
    const active = pickProvider(c.provider === 'auto' ? undefined : c.provider, process.env, espeak);
    const ids: TtsProviderId[] = ['azure', 'google', 'espeak', ...(providerAvailable('mock', process.env, espeak) ? (['mock'] as TtsProviderId[]) : [])];
    const usage = await this.usage();
    return {
      setting: c.provider, provider: active, langs: TTS_LANGS, maxLength: TTS_MAX, dailyLimit: this.limit(), usedToday: usage,
      providers: ids.map((id) => ({ id, available: providerAvailable(id, process.env, espeak) })),
      voices: active ? VOICES[active] : [],
    };
  }

  async saveSettings(dto: { provider?: string }) {
    const p = String(dto.provider || 'auto');
    if (!['auto', 'espeak', 'azure', 'google', 'mock'].includes(p)) throw new BadRequestException({ error: 'BAD_PROVIDER', message: "Provayder noto'g'ri" });
    const value = JSON.stringify({ provider: p });
    await this.prisma.appSetting.upsert({ where: { key: CFG_KEY }, update: { value }, create: { key: CFG_KEY, value } });
    return this.voices();
  }

  private async usage(): Promise<number> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: USAGE_KEY } });
    try { const v = row ? JSON.parse(row.value) : null; return v?.day === dayKey() ? Number(v.count) || 0 : 0; } catch { return 0; }
  }
  /** Atomik hisoblagich (bir nechta nusxada ham to'g'ri): yangi kun — 1 dan; qaytaradi — bugungi urinishlar soni. */
  private async bump(): Promise<number> {
    const day = dayKey();
    const rows = await this.prisma.$queryRaw<{ value: string }[]>(Prisma.sql`
      INSERT INTO app_settings (key, value, "updatedAt") VALUES (${USAGE_KEY}, json_build_object('day', ${day}::text, 'count', 1)::text, now())
      ON CONFLICT (key) DO UPDATE SET "updatedAt" = now(), value = CASE
        WHEN (app_settings.value::json ->> 'day') = ${day}::text THEN json_build_object('day', ${day}::text, 'count', COALESCE((app_settings.value::json ->> 'count')::int, 0) + 1)::text
        ELSE json_build_object('day', ${day}::text, 'count', 1)::text END
      RETURNING value`);
    try { return Number(JSON.parse(rows[0]?.value || '{}').count) || 1; } catch { return 1; }
  }

  /** Matn → audio (8 kHz wav) → audio kutubxona yozuvi. */
  async create(dto: { text?: string; lang?: string; voice?: string; name?: string }) {
    const text = cleanTtsText(dto.text);
    if (!text) throw new BadRequestException({ error: 'EMPTY_TEXT', message: 'Matn kiriting' });
    if (text.length > TTS_MAX) throw new BadRequestException({ error: 'TOO_LONG', message: `Matn ${TTS_MAX} belgidan oshmasin` });
    const lang = String(dto.lang || 'uz') as TtsLang;
    if (!TTS_LANGS.includes(lang)) throw new BadRequestException({ error: 'BAD_LANG', message: "Til noto'g'ri (uz, ru, en)" });
    const espeak = await espeakAvailable();
    const c = await this.cfg();
    const provider = pickProvider(c.provider === 'auto' ? undefined : c.provider, process.env, espeak);
    if (!provider) throw new ServiceUnavailableException({ error: 'TTS_UNAVAILABLE', message: "Ovoz sintezi sozlanmagan: serverda espeak-ng o'rnating yoki AZURE_TTS_KEY / GOOGLE_TTS_API_KEY bering" });
    const voice = pickVoice(provider, lang, dto.voice ? String(dto.voice) : undefined);
    if (!voice) throw new BadRequestException({ error: 'BAD_LANG', message: 'Bu til uchun ovoz yo\'q' });
    if ((await this.bump()) > this.limit()) throw new HttpException({ error: 'DAILY_LIMIT', message: `Bugungi ovoz sintezi limiti (${this.limit()} ta) tugadi` }, 429);
    let raw: Buffer;
    try {
      raw = provider === 'azure' ? await azureSynth(text, lang, voice.id)
        : provider === 'google' ? await googleSynth(text, lang, voice.id)
        : provider === 'espeak' ? await espeakSynth(text, voice.id)
        : mockSynth(text);
    } catch (e) {
      if (e instanceof TtsError) throw new HttpException({ error: e.code, message: e.message }, e.code === 'TTS_UNAVAILABLE' ? 503 : 502);
      throw e;
    }
    const wav = (await transcodeWav(raw)) || raw;
    const name = String(dto.name || '').trim() || text.slice(0, 40);
    const audio = await this.pbx.audioAdd({ name, mime: 'audio/wav', data: wav.toString('base64') });
    return { ...audio, provider, voice: voice.id, lang };
  }
}
