// Ovoz sintezi (TTS) provayderlari: espeak-ng (mahalliy, kalitsiz), Azure (AZURE_TTS_KEY/AZURE_TTS_REGION), Google (GOOGLE_TTS_API_KEY).
// Sof funksiyalar (matn tozalash, SSML, provayder tanlash) e2e testlarda tekshiriladi; tarmoq/jarayon chaqiruvlari — shu faylda.
import { spawn } from 'child_process';

export type TtsLang = 'uz' | 'ru' | 'en';
export const TTS_LANGS: TtsLang[] = ['uz', 'ru', 'en'];
export const TTS_MAX = 500;
export type TtsProviderId = 'espeak' | 'azure' | 'google' | 'mock';
export interface TtsVoice { id: string; lang: TtsLang; name: string; gender?: 'f' | 'm' }
export class TtsError extends Error { constructor(msg: string, readonly code = 'TTS_FAILED') { super(msg); } }

/**
 * Matn tozalash: nazorat belgilari, teglar (`<…>` — SSML injeksiyasi), espeak fonema kiritmasi (`[[…]]`) olib tashlanadi; bo'shliqlar siqiladi.
 * SSML'ga qo'yishdan oldin baribir `xmlEsc` qilinadi (ikki qatlam).
 */
export function cleanTtsText(v: unknown): string {
  return String(v ?? '').normalize('NFC')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, ' ')
    .replace(/\[\[|\]\]/g, ' ')
    .replace(/[\x00-\x1f\x7f\u2028\u2029]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
export const xmlEsc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

const LOCALE: Record<TtsLang, string> = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-US' };

export const ESPEAK_VOICES: TtsVoice[] = [
  { id: 'uz', lang: 'uz', name: "eSpeak — o'zbek (erkak)", gender: 'm' }, { id: 'uz+f3', lang: 'uz', name: "eSpeak — o'zbek (ayol)", gender: 'f' },
  { id: 'ru', lang: 'ru', name: 'eSpeak — rus (erkak)', gender: 'm' }, { id: 'ru+f3', lang: 'ru', name: 'eSpeak — rus (ayol)', gender: 'f' },
  { id: 'en-us', lang: 'en', name: 'eSpeak — ingliz (erkak)', gender: 'm' }, { id: 'en-us+f3', lang: 'en', name: 'eSpeak — ingliz (ayol)', gender: 'f' },
];
export const AZURE_VOICES: TtsVoice[] = [
  { id: 'uz-UZ-MadinaNeural', lang: 'uz', name: 'Madina (Azure)', gender: 'f' }, { id: 'uz-UZ-SardorNeural', lang: 'uz', name: 'Sardor (Azure)', gender: 'm' },
  { id: 'ru-RU-SvetlanaNeural', lang: 'ru', name: 'Svetlana (Azure)', gender: 'f' }, { id: 'ru-RU-DariyaNeural', lang: 'ru', name: 'Dariya (Azure)', gender: 'f' }, { id: 'ru-RU-DmitryNeural', lang: 'ru', name: 'Dmitry (Azure)', gender: 'm' },
  { id: 'en-US-JennyNeural', lang: 'en', name: 'Jenny (Azure)', gender: 'f' }, { id: 'en-US-GuyNeural', lang: 'en', name: 'Guy (Azure)', gender: 'm' },
];
/** Google: til bo'yicha standart ovoz (name bo'sh — Google o'zi tanlaydi). O'zbek ovozi Google'da bo'lmasa — xizmat xato qaytaradi (foydalanuvchiga ko'rsatiladi). */
export const GOOGLE_VOICES: TtsVoice[] = [
  { id: 'uz-UZ', lang: 'uz', name: "Google — o'zbek (standart)" },
  { id: 'ru-RU-Wavenet-A', lang: 'ru', name: 'Google Wavenet A (ru)', gender: 'f' }, { id: 'ru-RU-Wavenet-B', lang: 'ru', name: 'Google Wavenet B (ru)', gender: 'm' },
  { id: 'en-US-Wavenet-F', lang: 'en', name: 'Google Wavenet F (en)', gender: 'f' }, { id: 'en-US-Wavenet-D', lang: 'en', name: 'Google Wavenet D (en)', gender: 'm' },
];
export const MOCK_VOICES: TtsVoice[] = TTS_LANGS.map((l) => ({ id: `mock-${l}`, lang: l, name: `Sinov ovozi (${l})` }));

export const VOICES: Record<TtsProviderId, TtsVoice[]> = { espeak: ESPEAK_VOICES, azure: AZURE_VOICES, google: GOOGLE_VOICES, mock: MOCK_VOICES };

/** Azure SSML (matn tozalangan va XML-ekranlangan; ovoz faqat oq ro'yxatdan). */
export function azureSsml(text: string, lang: TtsLang, voice: string): string {
  return `<speak version='1.0' xml:lang='${LOCALE[lang]}'><voice name='${xmlEsc(voice)}'>${xmlEsc(cleanTtsText(text))}</voice></speak>`;
}

export interface TtsEnv { [k: string]: string | undefined }
export function providerAvailable(id: TtsProviderId, env: TtsEnv, espeakOk: boolean): boolean {
  if (id === 'azure') return !!(env.AZURE_TTS_KEY && (env.AZURE_TTS_REGION || env.AZURE_TTS_ENDPOINT));
  if (id === 'google') return !!env.GOOGLE_TTS_API_KEY;
  if (id === 'mock') return env.PBX_TTS_MOCK === '1' && env.NODE_ENV !== 'production';
  return espeakOk;
}
/** Tanlash: sozlamada aniq provayder (mavjud bo'lsa) yoki «auto» — kalit bo'lsa Azure → Google, aks holda espeak (sinov muhitida — mock). */
export function pickProvider(pref: string | undefined, env: TtsEnv, espeakOk: boolean): TtsProviderId | null {
  const ids: TtsProviderId[] = ['azure', 'google', 'espeak', 'mock'];
  if (pref && (ids as string[]).includes(pref) && providerAvailable(pref as TtsProviderId, env, espeakOk)) return pref as TtsProviderId;
  return ids.find((p) => providerAvailable(p, env, espeakOk)) || null;
}
/** Ovoz tanlash: berilgan ovoz shu provayder va tilga tegishli bo'lsa — u; aks holda tilning birinchi ovozi. */
export function pickVoice(provider: TtsProviderId, lang: TtsLang, voice?: string): TtsVoice | null {
  const list = VOICES[provider].filter((v) => v.lang === lang);
  return list.find((v) => v.id === voice) || list[0] || null;
}

const MAX_AUDIO = 5 * 1024 * 1024;
async function readLimited(res: Response): Promise<Buffer> {
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_AUDIO) throw new TtsError('Audio juda katta');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_AUDIO) throw new TtsError('Audio juda katta');
  return buf;
}

/** espeak-ng: matn stdin orqali (shell yo'q, argumentlar massiv), wav stdout'ga. Bin — ESPEAK_BIN (sinovda Docker o'rami). */
export function espeakSynth(text: string, voice: string, env: TtsEnv = process.env): Promise<Buffer> {
  if (!/^[a-z]{2,3}(-[a-z]{2})?(\+[a-z0-9]{1,4})?$/.test(voice)) return Promise.reject(new TtsError("Ovoz noto'g'ri"));
  const bin = env.ESPEAK_BIN || 'espeak-ng';
  return new Promise((resolve, reject) => {
    let p: ReturnType<typeof spawn>;
    try { p = spawn(bin, ['-v', voice, '-s', '140', '--stdin', '--stdout'], { stdio: ['pipe', 'pipe', 'ignore'] }); } catch (e) { reject(new TtsError('espeak-ng ishga tushmadi')); return; }
    const chunks: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new TtsError('espeak-ng javob bermadi')); }, 30_000);
    p.stdout!.on('data', (d: Buffer) => { size += d.length; if (size > MAX_AUDIO) { p.kill('SIGKILL'); return; } chunks.push(d); });
    p.on('error', () => { clearTimeout(timer); reject(new TtsError('espeak-ng topilmadi', 'TTS_UNAVAILABLE')); });
    p.on('close', (code) => {
      clearTimeout(timer);
      const out = Buffer.concat(chunks);
      if (code !== 0 || out.length < 100) reject(new TtsError('espeak-ng xato qaytardi')); else resolve(out);
    });
    p.stdin!.on('error', () => undefined);
    p.stdin!.end(cleanTtsText(text) + '\n');
  });
}

let espeakCache: { ok: boolean; at: number } | null = null;
/** espeak-ng o'rnatilganmi (natija 5 daqiqa keshlanadi). */
export async function espeakAvailable(env: TtsEnv = process.env): Promise<boolean> {
  if (espeakCache && Date.now() - espeakCache.at < 300_000) return espeakCache.ok;
  const ok = await new Promise<boolean>((resolve) => {
    try {
      const p = spawn(env.ESPEAK_BIN || 'espeak-ng', ['--version'], { stdio: 'ignore' });
      const t = setTimeout(() => { p.kill('SIGKILL'); resolve(false); }, 15_000);
      p.on('error', () => { clearTimeout(t); resolve(false); });
      p.on('close', (c) => { clearTimeout(t); resolve(c === 0); });
    } catch { resolve(false); }
  });
  espeakCache = { ok, at: Date.now() };
  return ok;
}

/** Azure Speech REST: 8 kHz 16-bit mono PCM wav (Asterisk formati) qaytaradi. */
export async function azureSynth(text: string, lang: TtsLang, voice: string, env: TtsEnv = process.env): Promise<Buffer> {
  if (!AZURE_VOICES.some((v) => v.id === voice)) throw new TtsError("Ovoz noto'g'ri");
  const region = String(env.AZURE_TTS_REGION || '').trim();
  if (!env.AZURE_TTS_ENDPOINT && !/^[a-z0-9]{2,40}$/.test(region)) throw new TtsError("AZURE_TTS_REGION noto'g'ri", 'TTS_UNAVAILABLE');
  const url = env.AZURE_TTS_ENDPOINT || `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST', signal: AbortSignal.timeout(20_000),
      headers: { 'Ocp-Apim-Subscription-Key': String(env.AZURE_TTS_KEY || ''), 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'riff-8khz-16bit-mono-pcm', 'User-Agent': 'sellers-crm' },
      body: azureSsml(text, lang, voice),
    });
  } catch { throw new TtsError('Azure TTS bilan ulanib bo\'lmadi'); }
  if (!res.ok) throw new TtsError(res.status === 401 || res.status === 403 ? 'Azure TTS kaliti noto\'g\'ri' : `Azure TTS xatosi (${res.status})`);
  return readLimited(res);
}

/** Google Cloud TTS: LINEAR16 8 kHz (javobda wav sarlavhasi bilan). Kalit sarlavhada (URL'da emas — jurnalga tushmasin). */
export async function googleSynth(text: string, lang: TtsLang, voice: string, env: TtsEnv = process.env): Promise<Buffer> {
  const v = GOOGLE_VOICES.find((x) => x.id === voice);
  if (!v) throw new TtsError("Ovoz noto'g'ri");
  const base = env.GOOGLE_TTS_ENDPOINT || 'https://texttospeech.googleapis.com';
  let res: Response;
  try {
    res = await fetch(`${base}/v1/text:synthesize`, {
      method: 'POST', signal: AbortSignal.timeout(20_000),
      headers: { 'X-Goog-Api-Key': String(env.GOOGLE_TTS_API_KEY || ''), 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { text: cleanTtsText(text) }, voice: { languageCode: LOCALE[lang], ...(v.id.split('-').length > 2 ? { name: v.id } : {}) }, audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 8000 } }),
    });
  } catch { throw new TtsError('Google TTS bilan ulanib bo\'lmadi'); }
  if (!res.ok) throw new TtsError(res.status === 400 ? "Google TTS bu til/ovozni qo'llamaydi" : res.status === 401 || res.status === 403 ? "Google TTS kaliti noto'g'ri" : `Google TTS xatosi (${res.status})`);
  const j = (await res.json().catch(() => null)) as { audioContent?: string } | null;
  const b64 = String(j?.audioContent || '');
  if (!b64 || b64.length > MAX_AUDIO * 1.4) throw new TtsError("Google TTS javobi noto'g'ri");
  return Buffer.from(b64, 'base64');
}

/** Sinov provayderi (faqat PBX_TTS_MOCK=1 va production emas): matn uzunligiga mos ton (8 kHz wav). */
export function mockSynth(text: string): Buffer {
  const secs = Math.min(10, Math.max(1, Math.ceil(cleanTtsText(text).length / 15)));
  const n = 8000 * secs;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(4000 * Math.sin((2 * Math.PI * 440 * i) / 8000)), 44 + i * 2);
  return b;
}
