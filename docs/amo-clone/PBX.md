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
