# O'z telefon stansiyamiz (PBX) — dizayn (PLAN 45)

Maqsad: OnlinePBX o'rniga o'z PBX'imiz (CRM bilan chuqur bog'langan). Tashqi liniya (SIP trunk) — operatordan olinadi (litsenziya), uni yozib bo'lmaydi.

## Texnologiya
**Asterisk** (PJSIP + WebRTC + AMI/ARI) — ochiq manbali, eng keng tarqalgan, hujjati ko'p. Muqobil: FreeSWITCH. Tavsiya: Asterisk 20/22 LTS, Docker'da, o'sha VPS'da (`crm-net`).

## Mavjud bo'lgan (CRM tomoni)
- `User.extension`, `User.sipPassword` — har xodimning ichki raqami va SIP paroli (hozir OnlinePBX uchun)
- Brauzer WebRTC telefoni (SIP.js yoki shunga o'xshash), qo'ng'iroq jurnali (`CallLog`), yozuv URL, popup, avto-lid yaratish, bosib qo'ng'iroq qilish
- `OnlinePbxClient` (HTTP API) va webhook qabuli — buni **PbxProvider** interfeysiga ajratamiz

## Bosqichlar
1. **Provayder qatlami** (2–4 kun): `PbxProvider` interfeysi (originate, history, recordUrl, webhook normalizatsiyasi); OnlinePBX — bitta implementatsiya.
2. **Asterisk sinov** (3–5 kun): Docker konteyner, ichki raqamlar CRM'dagi `extension/sipPassword` dan avtomatik generatsiya (`pjsip.conf` shabloni), brauzer WebRTC (WSS orqali Caddy), ichki qo'ng'iroq, qo'ng'iroq hodisalari (AMI/ARI → CRM webhook), yozuvni diskka (MixMonitor) va CRM orqali berish.
3. **Trunk** (operatorga bog'liq): SIP trunk ulash, kiruvchi/chiquvchi marshrut (dialplan), kiruvchi raqam → lid (mavjud mantiq).
4. **Funksiyalar**: navbat (queue) va ringgroup, IVR menyu, ish vaqti, javob berilmasa ovozli pochta/qayta qo'ng'iroq vazifasi (CRM'da mavjud), qo'ng'iroq hisobotlari.
5. **Ishonchlilik**: monitoring, avtomatik qayta ishga tushirish, zaxira (konfiguratsiya + yozuvlar tashqi saqlashga shifrlab), kerak bo'lsa ikkinchi PBX.

## Xavflar
- Tovush sifati (NAT, jitter, kodek) — real operator va real xodim tarmog'ida sinash shart; faqat laboratoriyada ishonib bo'lmaydi.
- Yozuvlar hajmi (≈ 1 MB/daqiqa WAV; MP3 ≈ 0,15 MB/daqiqa) — disk va saqlash siyosati.
- Xavfsizlik: SIP brute-force/toll-fraud (fail2ban, kuchli parol, faqat kerakli davlatlarga chiqish), TLS/SRTP, yozuvga ruxsat (huquqlar matritsasi).
- Operator bilan shartnoma, raqamlar, daqiqa narxi — tashqi shart; narxlarni hali o'rganmadik.
- 24/7 qo'llab-quvvatlash: PBX tushsa — butun savdo bo'limi qo'ng'iroqsiz.

## Qaror kerak
Operator (SIP trunk) kim bo'ladi — shartlari/narxi aniqlanmaguncha 3–5-bosqichlarni boshlab bo'lmaydi. 1–2-bosqichlar operatorsiz bajariladi.

## Haqiqiy serverda tekshirish kerak (soxta AMI bilan sinab bo'lmaydi)
Kod testlari matn tuzilishini tekshiradi; quyidagilar faqat haqiqiy Asterisk (20/22) bilan tasdiqlanadi:
- **Audio transkodlash**: kutubxonadagi mp3/wav fayllar `custom/<id>` sifatida ko'chiriladi; Asterisk 8 kHz mono (wav/ulaw/gsm) kutadi — mp3 uchun `format_mp3` yoki oldindan `sox`/`ffmpeg` bilan 8 kHz'ga o'girish kerak bo'lishi mumkin.
- ~~Vaqt qoidasi tunni kesib o'tsa~~ — **28.10 jonli Asterisk 23 da tekshirildi**: `GotoIfTime(22:00-06:00,mon)` o'sha kunning o'zida aylanadi (dush 00–06 + 22–24), seshanba ertalabni bermaydi. Generator endi ikkiga bo'ladi: `22:00-23:59,mon` + `00:00-06:00,tue`. `Etc/GMT-5` = UTC+5 (`IFTIME` bilan tasdiqlangan).
- **28.10 jonli sinov topilmalari** (tuzatildi): brauzer telefoni `allow=opus` — `codec_opus` yo'q, stol telefoni bilan ko'prik «No path to translate» bilan uzilardi (endi ulaw/alaw);
  JsSIP ICE yig'ishni ~40 s kutardi (stun:<domen>:3478 yo'q) — endi 1 s; IVR menyu tugmasi ichki raqam boshi bilan bir xil bo'lsa 5 s jimlik (endi 2 s);
  `andrius/asterisk` tasvirida ovoz fayllari yo'q (init.sh endi core-sounds-ru o'rnatadi); ovozli pochta xabari CRM'ga ko'rinmasdi (endi `<id>-vm.wav`, jurnalda «Ovozli pochta»).
- **Originate `ChannelId`** = CRM uuid → CDR `UniqueID` shu bo'lishi; `CDR(userfield)=crm:<uuid>` Cdr AMI hodisasida `UserField` sifatida kelishi (cdr_manager.conf).
- **Bir qo'ng'iroq — bir nechta CDR** (IVR Answer + Dial): `DestinationChannel` bo'sh ANSWERED qismi «operator javob bermadi» deb hisoblanadi; CDR'lar 1,5 s ichida birlashtiriladi (ASTERISK_CDR_MERGE_MS).
- **CDR StartTime** GMT (UTC) da keladi (`cdr_manager.conf: usegmtime = yes`, haqiqiy Asterisk 23 da tekshirilgan); CRM `ASTERISK_TZ` standarti `+00:00`.
- **Chiquvchi qoidalar**: `CHANNEL(endpoint)` + `REGEX` bilan «kimga ruxsat» tekshiruvi, mos qoida bo'lmasa `Hangup(21)`.
- **MixMonitor**: `${IF(...)}` bilan fayl nomi, papka (`pbx_recording.dir`) CRM'dagi `ASTERISK_RECORDINGS_DIR` bilan bir xil (umumiy disk) bo'lishi; yozuv faqat fayl topilsa CRM'da ko'rinadi.
- **Qora ro'yxat**: `FILTER(0123456789,…)` va `${CRM_CN:-9}` (oxirgi 9 raqam) solishtirish.
- **AMI keepalive**: 30 s Ping, javob bo'lmasa qayta ulanish; eski Asterisk'dagi «Response: Follows» chiqishi.

## Xavfsizlik cheklovlari (PBX mustahkamlash)
- Modul maydonlari oq ro'yxat bilan tekshiriladi (server/login `^[\w.:-]+$`, maska, parol `;`/nazorat belgilarisiz); generator har qiymatda qator uzilishi bo'lsa to'xtaydi.
- Ichki raqam hamma joyda 2–5 xonali son; o'z stansiyada foydalanuvchi faqat o'ziga biriktirilgan raqamni oladi, SIP parolini server yaratadi (24 belgi).
- Callback vidjeti: mamlakat prefiksi oq ro'yxati (standart 998), bitta raqamga sutkasiga 3 ta va vidjetga 300 ta (bazada — `callback_requests`), honeypot `website`; daqiqalik IP limiti jarayon xotirasida (bir nechta nusxada har nusxaga alohida).
- AMI hodisalari faqat rahbar nusxada qayta ishlanadi; `call_logs.externalId` noyob.

## Servislar: ovoz sintezi, sifat bahosi, avtoinformator (28.10, jonli Asterisk 23 da sinalgan)
- **Ovoz sintezi (TTS)** — `backend/src/pbx/tts/`: provayderlar `espeak` (mahalliy, kalitsiz; Dockerfile'da `espeak-ng`; uz/ru/en), `azure` (env `AZURE_TTS_KEY` + `AZURE_TTS_REGION`, SSML, `riff-8khz-16bit-mono-pcm`; uz-UZ-Madina/Sardor, ru-RU-Svetlana/Dariya/Dmitry, en-US), `google` (env `GOOGLE_TTS_API_KEY`, kalit sarlavhada; o'zbek ovozi Google'da bo'lmasa xato qaytadi). Tanlash: sozlama `pbx_tts.provider` (`auto` — Azure → Google → espeak). API: `GET /pbx/tts/voices`, `PUT /pbx/tts/settings`, `POST /pbx/tts {text ≤500, lang, voice?, name?}` → `audioAdd` (ffmpeg 8 kHz wav). Himoya: matn tozalash (teglar, nazorat belgilari, `[[…]]`), SSML XML-ekranlash, ovoz oq ro'yxati, espeak `spawn` massiv + stdin (shell yo'q), sutkalik limit `PBX_TTS_DAILY` (standart 100, atomik hisoblagich). UI: Servislar → «Ovoz sintezi va audio fayllar» (matn, til, ovoz, nom, «Yaratish», tinglash).
- **Sifat bahosi** — sozlama `pbx_quality {enabled, promptAudioId, thanksAudioId, scope: in|all}`. Dialplan: trunk kirishida `CRM_RATE_ON=1` va `__CRM_RATE_ID` (CDR uuid bilan bir xil), xodim/guruh `Dial(...,g)`, navbat `Queue(...,tc)` + `QUEUESTATUS=CONTINUE`; javobdan keyin `crm-rate`: `CDR_PROP(disable)`, `Read(CRM_RATE,<prompt>,1,,2,6)`, 1–5 → `UserEvent(CrmRate,Uuid,Rating)` → rahmat. `scope=all` — chiquvchi `Dial(...,F(crm-rate^s^1))` (operator qo'ygach mijoz so'rovga o'tadi). CRM: `OwnPbxProvider.onRate` → `CallsService.applyRating` (rahbar nusxa, idempotent; CDR'dan oldin kelsa 30 daqiqa kutadi). Hisobot: `/crm/calls/stats` → `quality {avg, count, dist, low}`; UI: Servislar → Sifat bahosi (Sozlamalar / Hisobotlar).
- **AMI `read` ga `user` qo'shildi** (`deploy/asterisk/etc/manager.conf`): busiz dialplan `UserEvent` (CrmRing — kiruvchi oyna, CrmRate — baho) CRM'ga umuman kelmasdi. Mavjud serverlarda `init.sh` qayta ishga tushirilsin va `manager reload`.
- **Avtoinformator** — jadvallar `pbx_informers`, `pbx_informer_targets` (migratsiya `20261031090000_pbx_informer`). API `/pbx/informer` (CRUD, `/:id/numbers`, `/:id/start|pause|stop`, `/settings` — mamlakat prefikslari, standart 998). Runner faqat rahbar nusxada (12 s; `PBX_INFORMER_TICK_MS`): ish oynasi (Toshkent), maxParallel ≤10, retries ≤3 (oraliq ≥30 daq), kunlik limit, chaqiruvlar orasida ≥1,1 s. Originate: `Local/<raqam>@crm-informer-out/n` (trunk — chiquvchi qoida maskasi bo'yicha; kontekstga hech qaysi telefon/trunk kontekstidan Goto yo'q) + `crm-informer-play` (`Playback(custom/<audioId>)`), `ChannelId`/`__CRM_UUID` — CDR → call_logs (direction=out). Natija: `OriginateResponse` (Reason 4 — javob), zaxira — 10 daqiqadan keyin jurnal bo'yicha. Qora ro'yxat → `dnd`.
- **Jonli sinov 28.10** (`scripts/pbx-live`: `tts.mjs`, `quality.mjs`, `rate-call.sh in|out`, `informer.mjs`; `prov.sh` da `rate`, `998907770005`, `998901110003` kengaytmalari; backend `ESPEAK_BIN=scripts/pbx-live/espeak-docker.sh`): espeak uz/ru/en → 8 kHz wav → Asterisk `file convert` OK; kiruvchi: 101 javob berib qo'ydi → mijoz DTMF 4 → `call_logs.rating=4`; chiquvchi (scope=all): mijoz DTMF 5 → rating=5; avtoinformator 3 raqam: 2 answered (Playback eshittirildi, talk 6 s), 1 noanswer, kampaniya `done`, call_logs'da 3 ta chiquvchi.
  Topilgan va tuzatilgan: (1) AMI `user` huquqi yo'q edi; (2) `F()` bilan chiquvchida so'rov qismi mijoz kanalining alohida CDR'i bo'lib «kiruvchi o'tkazib yuborilgan» yozuv yaratardi — `CDR_PROP(disable)` + CRM'da `crm-rate` CDR e'tiborsiz.
- **Haqiqiy serverda tekshirish kerak**: Azure/Google haqiqiy kalit bilan (sinovda soxta HTTP server), `node:22-slim` dagi espeak-ng versiyasida `uz` ovozi (sinov tasvirida 1.52 — bor), haqiqiy operator trunkida DTMF (RFC 4733) va `F()` xatti-harakati.

## AI-menejer (OnlinePBX «ИИ-менеджер» analogi) — 29.10, sinov provayderlari bilan
- **Oqim**: yakunlangan qo'ng'iroq (`call_logs.status=completed`) → navbat (`call_ai`, migratsiya `20261102090000_pbx_ai`) → yozuv (o'z stansiya: `ASTERISK_RECORDINGS_DIR/<uuid>.wav`, `own:<id>`; OnlinePBX: uuid / `download_url` orqali `PbxGateway.fetchRecording`) → STT → Claude tahlili → `call_ai.analysisJson` → bitim lentasiga «AI xulosa» izohi (`CrmService.addNote`, `noteAt` atomik — bir marta) va `autoTask` yoqilgan bo'lsa vazifa (`taskId` — bir marta).
- **Navbat shartlari**: AI yoqilgan (standart O'CHIQ) va yoqilgandan keyingi (≤3 kun) qo'ng'iroqlar; ichki raqam (≤5 xona) — `skipped/internal`; suhbat < `minTalkSec` (20) — `short`; > 20 daqiqa — `too_long`; yozuv yo'q — `no_recording`; nutq aniqlanmasa — `empty`. Qo'lda ishga tushirishda `minTalkSec` hisobga olinmaydi.
- **Fon ishchisi**: faqat RAHBAR nusxada (`LeaderService.guard`), har 30 s (`PBX_AI_TICK_MS`, 0 — o'chiq), bir vaqtda ≤2, sutkalik limit `dailyLimit` (200, atomik hisoblagich `pbx_ai_usage`, Toshkent kuni), xatoda ≤2 qayta urinish (2/4 daqiqa oraliq), 20 daqiqadan ortiq «processing» — qayta navbatga. Matn bo'lsa qayta urinishda STT takrorlanmaydi (faqat tahlil).
- **STT provayderlari** (`backend/src/pbx/ai/stt.ts`, `sttProvider` sozlamasi yoki `auto`: OpenAI → Deepgram → Azure):
  - `openai` — env `OPENAI_API_KEY` (ixtiyoriy `OPENAI_STT_MODEL`: `whisper-1` standart, `gpt-4o-mini-transcribe`; `OPENAI_BASE_URL`), multipart `/v1/audio/transcriptions`.
  - `deepgram` — env `DEEPGRAM_API_KEY` (ixtiyoriy `DEEPGRAM_MODEL`, standart `nova-3`), `/v1/listen`, `auto` → `detect_language`. O'zbek tili Deepgram modelida qo'llanmasligi mumkin — xato «audio yoki til qo'llanmaydi» bo'lib qaytadi.
  - `azure` — env `AZURE_STT_KEY` + `AZURE_STT_REGION` (yoki `AZURE_STT_ENDPOINT`), fast transcription `speechtotext/transcriptions:transcribe?api-version=2024-11-15`, `auto` → `uz-UZ, ru-RU, en-US`.
  - `mock` — faqat `PBX_STT_MOCK=1` va `NODE_ENV≠production` (testlar).
  - Til: `auto | uz | ru | en`. Cheklov: ≤20 daqiqa, ≤25 MB (katta fayl ffmpeg bilan 16 kHz mono mp3 32k ga siqiladi; `spawn` massiv, shell yo'q; siqib bo'lmasa — `failed/TOO_LARGE`).
- **Tahlil** (`backend/src/pbx/ai/analyze.ts`): Anthropic Messages API (Dono'dagi SDK), model `PBX_AI_MODEL` → `DONO_MODEL` → `claude-opus-5-5`, `effort: low`, structured outputs (`output_config.format` JSON sxema; model qo'llamasa — oddiy so'rov). `ANTHROPIC_API_KEY` yo'q — tahlil o'chiq, faqat transkripsiya saqlanadi. Natija: `{summary, sentiment: positive|neutral|negative, intent, objections[], nextSteps[], suggestedTask {title, dueInDays}|null, score 1–10, keywords[]}`; mijozning IVR bahosi (`rating`) kontekstga beriladi. Sinov: `PBX_AI_MOCK=1` (production'da ishlamaydi).
- **Prompt-injection himoyasi**: transkripsiya user xabarida `<transcript>` ichida «faqat ma'lumot» sifatida (ichidagi `<transcript>`/`</transcript>` zararsizlantiriladi), tizim prompti ko'rsatmalarga amal qilmaslikni talab qiladi; chiqish `validateAnalysis` bilan qat'iy tekshiriladi (enum/ball/tur xato — `failed/BAD_OUTPUT`, lentaga yozilmaydi; ortiqcha maydonlar tashlanadi, HTML teglar tozalanadi, uzunlik cheklanadi, `dueInDays` 0–30). Model hech qanday vosita (tool) olmaydi — CRM'da amal bajara olmaydi.
- **API**: `GET/PUT /pbx/ai` (`crm.settings`; `{enabled, language, minTalkSec, dailyLimit, autoNote, autoTask, sttProvider, retainDays}` + provayder holati faqat `available: true/false`, kunlik sarf, 7 kunlik token/audio statistikasi), `POST /pbx/ai/tick` (navbatni hozir ishlash), `POST /pbx/ai/cleanup`, `GET /pbx/ai/calls?status=&days=&sentiment=&limit=` (crm.view, huquqlar matritsasi: o'z qo'ng'iroqlari yoki ko'ra oladigan bitimlar), `GET /pbx/ai/calls/:callLogId` (transkripsiya + tahlil; `rights.assertCall`), `POST /pbx/ai/calls/:callLogId/run {restt?}` (crm.settings yoki qo'ng'iroqni ko'ra oladigan; limitga kiradi, 429). `/crm/leads/:id/calls` va `/crm/calls/report` qatorlarida qisqa `ai` (transkripsiyasiz).
- **Xavfsizlik / shaxsiy ma'lumot**: kalitlar faqat env'da va faqat so'rov sarlavhasida (URL'da emas); xato matnlari/loglar/javoblarda kalit yo'q; loglarga transkripsiya va xulosa yozilmaydi (faqat `call_ai <id>: <kod>`). `retainDays` (standart 90, 7–365): kunlik tozalash (rahbarda) transkripsiya va tahlilni o'chiradi (`purgedAt`; qator va token hisobi qoladi, qayta navbatga tushmaydi). Bitim lentasidagi «AI xulosa» izohi oddiy CRM izohi sifatida qoladi.
- **UI**: Telefoniya → Servislar → AI-menejer (`/pbx/services/ai`: Qo'ng'iroqlar / Sozlamalar / Tavsif), bitim kartochkasida qo'ng'iroq ostida «AI xulosa» (+ transkripsiya), qo'ng'iroqlar jurnalida «AI» belgisi.
- **Serverga kerakli env**: STT uchun bittasi — `OPENAI_API_KEY` | `DEEPGRAM_API_KEY` | `AZURE_STT_KEY`+`AZURE_STT_REGION`; tahlil uchun `ANTHROPIC_API_KEY`. Keyin Servislar → AI-menejer → «Yoqilgan».
- **Haqiqiy kalit bilan sinalmagan**: OpenAI/Deepgram/Azure STT (so'rov shakli soxta HTTP server bilan testlangan), Claude structured outputs javobi, o'zbek tilida tanish sifati, ffmpeg siqish (25 MB dan katta fayl).
