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
- **Vaqt qoidasi tunni kesib o'tsa** (masalan 22:00–02:00): `GotoIfTime(22:00-02:00,…)` bitta qator bilan to'g'ri ishlashi va kun almashishi (sat 23:00 → sun 01:00) tekshirilsin.
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
