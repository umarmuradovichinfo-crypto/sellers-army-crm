// «ИИ-менеджер» — nutqni matnga o'girish (STT) provayderlari: OpenAI (Whisper / gpt-4o-*-transcribe), Deepgram, Azure (fast transcription), mock (sinov).
// Kalitlar faqat env'dan o'qiladi va faqat so'rov sarlavhasiga qo'yiladi: xato matnlari, loglar va API javoblariga hech qachon tushmaydi.
// Tashqi jarayon (ffmpeg) faqat spawn(massiv) bilan — shell yo'q.
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export type SttLang = 'uz' | 'ru' | 'en';
export type SttLangPref = SttLang | 'auto';
export const STT_LANGS: SttLangPref[] = ['auto', 'uz', 'ru', 'en'];
export type SttProviderId = 'openai' | 'deepgram' | 'azure' | 'mock';
export const STT_PROVIDERS: SttProviderId[] = ['openai', 'deepgram', 'azure', 'mock'];
/** Audio cheklovlari: 20 daqiqa, 25 MB (OpenAI cheklovi; boshqalarga ham yetarli). */
export const STT_MAX_SEC = 20 * 60;
export const STT_MAX_BYTES = 25 * 1024 * 1024;

export interface SttEnv { [k: string]: string | undefined }
export interface SttResult { text: string; lang: SttLang | null; durationSec: number | null }
export class SttError extends Error { constructor(msg: string, readonly code = 'STT_FAILED', readonly retry = true) { super(msg); } }

export function sttAvailable(id: SttProviderId, env: SttEnv): boolean {
  if (id === 'openai') return !!env.OPENAI_API_KEY;
  if (id === 'deepgram') return !!env.DEEPGRAM_API_KEY;
  if (id === 'azure') return !!(env.AZURE_STT_KEY && (env.AZURE_STT_REGION || env.AZURE_STT_ENDPOINT));
  return env.PBX_STT_MOCK === '1' && env.NODE_ENV !== 'production';
}
/** Sozlamadagi provayder (mavjud bo'lsa) yoki «auto»: OpenAI → Deepgram → Azure → (sinovda) mock. */
export function pickStt(pref: string | undefined, env: SttEnv): SttProviderId | null {
  if (pref && (STT_PROVIDERS as string[]).includes(pref) && sttAvailable(pref as SttProviderId, env)) return pref as SttProviderId;
  return STT_PROVIDERS.find((p) => sttAvailable(p, env)) || null;
}

/** RIFF/WAVE sarlavhasidan davomiylik (soniya); wav bo'lmasa null. */
export function wavDuration(b: Buffer): number | null {
  if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') return null;
  let off = 12, byteRate = 0;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === 'fmt ' && off + 16 <= b.length) byteRate = b.readUInt32LE(off + 16);
    if (id === 'data') {
      if (!byteRate) return null;
      const len = Math.min(size, b.length - off - 8);
      return Math.round((len / byteRate) * 10) / 10;
    }
    off += 8 + size + (size % 2);
  }
  return null;
}
export const isWav = (b: Buffer) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WAVE';

/**
 * Audio tayyorlash: ≤25 MB bo'lsa — o'zi; katta bo'lsa ffmpeg bilan 16 kHz mono mp3 (32 kbit/s, 20 daqiqagacha kesiladi).
 * ffmpeg yo'q / siqib bo'lmadi — SttError(TOO_LARGE, qayta urinilmaydi).
 */
export async function prepareAudio(buf: Buffer, mime: string, env: SttEnv = process.env): Promise<{ data: Buffer; mime: string }> {
  if (buf.length <= STT_MAX_BYTES) return { data: buf, mime };
  const out = await ffmpegMp3(buf, env).catch(() => null);
  if (!out || out.length > STT_MAX_BYTES) throw new SttError('Audio fayl juda katta (25 MB dan oshadi)', 'TOO_LARGE', false);
  return { data: out, mime: 'audio/mpeg' };
}
async function ffmpegMp3(buf: Buffer, env: SttEnv): Promise<Buffer | null> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'crm-stt-'));
  try {
    await fs.writeFile(join(dir, 'in'), buf, { mode: 0o600 });
    const ok = await new Promise<boolean>((resolve) => {
      let p: ReturnType<typeof spawn>;
      try {
        p = spawn(env.FFMPEG_BIN || 'ffmpeg', ['-v', 'error', '-y', '-i', join(dir, 'in'), '-t', String(STT_MAX_SEC), '-ar', '16000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '32k', '-f', 'mp3', join(dir, 'out.mp3')], { stdio: 'ignore' });
      } catch { resolve(false); return; }
      const timer = setTimeout(() => { p.kill('SIGKILL'); resolve(false); }, 120_000);
      p.on('error', () => { clearTimeout(timer); resolve(false); });
      p.on('close', (c) => { clearTimeout(timer); resolve(c === 0); });
    });
    return ok ? await fs.readFile(join(dir, 'out.mp3')) : null;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

const clean = (s: unknown) => String(s ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, 100_000);
const langOf = (v: unknown): SttLang | null => {
  const s = String(v || '').toLowerCase();
  if (/^(uz|uzbek)/.test(s)) return 'uz';
  if (/^(ru|russian)/.test(s)) return 'ru';
  if (/^(en|english)/.test(s)) return 'en';
  return null;
};
/** Provayder HTTP xatosi → foydalanuvchiga tushunarli matn (javob tanasi/kalit qo'shilmaydi). */
function httpErr(name: string, status: number): SttError {
  if (status === 401 || status === 403) return new SttError(`${name}: API kaliti noto'g'ri yoki ruxsat yo'q`, 'STT_AUTH', false);
  if (status === 413) return new SttError(`${name}: audio juda katta`, 'TOO_LARGE', false);
  if (status === 429) return new SttError(`${name}: limit (429), keyinroq qayta urinish`, 'STT_RATE');
  if (status === 400 || status === 415 || status === 422) return new SttError(`${name}: audio yoki til qo'llanmaydi (${status})`, 'STT_BAD_REQUEST', false);
  return new SttError(`${name}: xizmat xatosi (${status})`);
}
async function post(name: string, url: string, init: RequestInit, timeoutMs = 180_000): Promise<any> {
  let res: Response;
  try { res = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) }); } catch { throw new SttError(`${name} bilan ulanib bo'lmadi`); }
  if (!res.ok) { await res.arrayBuffer().catch(() => null); throw httpErr(name, res.status); }
  const j = await res.json().catch(() => null);
  if (!j || typeof j !== 'object') throw new SttError(`${name}: javob noto'g'ri`);
  return j;
}
const fileName = (mime: string) => (/mpeg|mp3/.test(mime) ? 'audio.mp3' : /ogg/.test(mime) ? 'audio.ogg' : 'audio.wav');

/** OpenAI: POST /v1/audio/transcriptions (multipart). Model — OPENAI_STT_MODEL (standart whisper-1; gpt-4o-mini-transcribe ham mumkin). */
export async function openaiTranscribe(audio: Buffer, mime: string, lang: SttLangPref, env: SttEnv = process.env): Promise<SttResult> {
  const model = /^[\w.-]{1,60}$/.test(String(env.OPENAI_STT_MODEL || '')) ? String(env.OPENAI_STT_MODEL) : 'whisper-1';
  const base = String(env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array(audio)], { type: mime }), fileName(mime));
  fd.append('model', model);
  if (lang !== 'auto') fd.append('language', lang);
  // whisper-1: verbose_json aniqlangan tilni ham qaytaradi; gpt-4o-*-transcribe faqat json/text
  fd.append('response_format', model === 'whisper-1' ? 'verbose_json' : 'json');
  const j = await post('OpenAI STT', `${base}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY || ''}` }, body: fd });
  return { text: clean(j.text), lang: langOf(j.language) || (lang === 'auto' ? null : lang), durationSec: Number.isFinite(Number(j.duration)) ? Number(j.duration) : null };
}

/** Deepgram: POST /v1/listen (xom audio). Model — DEEPGRAM_MODEL (standart nova-3); auto — detect_language. */
export async function deepgramTranscribe(audio: Buffer, mime: string, lang: SttLangPref, env: SttEnv = process.env): Promise<SttResult> {
  const model = /^[\w.-]{1,40}$/.test(String(env.DEEPGRAM_MODEL || '')) ? String(env.DEEPGRAM_MODEL) : 'nova-3';
  const base = String(env.DEEPGRAM_BASE_URL || 'https://api.deepgram.com').replace(/\/+$/, '');
  const q = new URLSearchParams({ model, punctuate: 'true', smart_format: 'true' });
  if (lang === 'auto') q.set('detect_language', 'true'); else q.set('language', lang);
  const j = await post('Deepgram', `${base}/v1/listen?${q}`, { method: 'POST', headers: { Authorization: `Token ${env.DEEPGRAM_API_KEY || ''}`, 'Content-Type': mime }, body: new Uint8Array(audio) });
  const ch = j?.results?.channels?.[0];
  return { text: clean(ch?.alternatives?.[0]?.transcript), lang: langOf(ch?.detected_language) || (lang === 'auto' ? null : lang), durationSec: Number.isFinite(Number(j?.metadata?.duration)) ? Number(j.metadata.duration) : null };
}

const AZ_LOCALE: Record<SttLang, string> = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-US' };
/** Azure AI Speech «fast transcription» (multipart: audio + definition). auto — bir nechta locale (til aniqlash). */
export async function azureTranscribe(audio: Buffer, mime: string, lang: SttLangPref, env: SttEnv = process.env): Promise<SttResult> {
  const region = String(env.AZURE_STT_REGION || '').trim();
  if (!env.AZURE_STT_ENDPOINT && !/^[a-z0-9]{2,40}$/.test(region)) throw new SttError("AZURE_STT_REGION noto'g'ri", 'STT_UNAVAILABLE', false);
  const url = env.AZURE_STT_ENDPOINT || `https://${region}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2024-11-15`;
  const fd = new FormData();
  fd.append('audio', new Blob([new Uint8Array(audio)], { type: mime }), fileName(mime));
  fd.append('definition', JSON.stringify({ locales: lang === 'auto' ? ['uz-UZ', 'ru-RU', 'en-US'] : [AZ_LOCALE[lang]] }));
  const j = await post('Azure STT', url, { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': String(env.AZURE_STT_KEY || '') }, body: fd });
  const text = Array.isArray(j.combinedPhrases) ? j.combinedPhrases.map((p: any) => p?.text).filter(Boolean).join('\n') : '';
  const loc = Array.isArray(j.phrases) && j.phrases[0]?.locale;
  return { text: clean(text), lang: langOf(loc) || (lang === 'auto' ? null : lang), durationSec: Number.isFinite(Number(j.durationMilliseconds)) ? Number(j.durationMilliseconds) / 1000 : null };
}

/** Sinov STT (faqat PBX_STT_MOCK=1 va production emas): audio ichidagi `CRM-MOCK-TEXT:` belgisi ortidagi matn yoki standart suhbat. */
export const MOCK_DEFAULT_TEXT = "Assalomu alaykum, kompaniyamiz xizmatlari bo'yicha qo'ng'iroq qilyapman. Narxi biroz qimmat ekan. Mayli, ertaga qayta qo'ng'iroq qiling, rahmat.";
export function mockTranscribe(audio: Buffer, lang: SttLangPref): SttResult {
  const s = audio.toString('utf8');
  const i = s.indexOf('CRM-MOCK-TEXT:');
  const text = clean(i >= 0 ? s.slice(i + 'CRM-MOCK-TEXT:'.length) : MOCK_DEFAULT_TEXT);
  const detected: SttLang = /[а-яё]/i.test(text) ? 'ru' : 'uz';
  return { text, lang: lang === 'auto' ? detected : lang, durationSec: wavDuration(audio) };
}

export async function transcribe(provider: SttProviderId, audio: Buffer, mime: string, lang: SttLangPref, env: SttEnv = process.env): Promise<SttResult> {
  if (!sttAvailable(provider, env)) throw new SttError('STT provayderi sozlanmagan', 'STT_UNAVAILABLE', false);
  if (provider === 'mock') return mockTranscribe(audio, lang);
  const a = await prepareAudio(audio, mime, env);
  if (provider === 'openai') return openaiTranscribe(a.data, a.mime, lang, env);
  if (provider === 'deepgram') return deepgramTranscribe(a.data, a.mime, lang, env);
  return azureTranscribe(a.data, a.mime, lang, env);
}
