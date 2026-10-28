# Server kuni — VPS va SIP raqam kelganda qadamlar

Hammasi mahalliy Docker'da sinalgan (27–28.10.2026): deploy kit (Postgres + Caddy HTTPS + mijoz konteyneri), zaxira/tiklash, haqiqiy Asterisk 23 bilan
ichki/kiruvchi/chiquvchi qo'ng'iroq (soxta provayder trunk), yozuv, CDR → CRM, audio (ffmpeg → 8 kHz wav), IVR tugmalari (DTMF), ovozli pochta,
vaqt qoidasi (tunni kesib o'tuvchi smena ham), NAT (SDP/Contact almashishi), brauzer telefoni — haqiqiy Chromium'da ovozli qo'ng'iroq (DTLS-SRTP, ICE).
Haqiqiy serverda faqat quyidagilar yangi: DNS, Let's Encrypt, haqiqiy operator trunki, haqiqiy NAT/firewall, fail2ban (Linux).

## Sizdan kerak
1. VPS (Ubuntu 24.04, 4 vCPU/8 GB tavsiya), SSH kalit.
2. Domen: `*.crm.<domen>` → server IP (mijoz sahifalari) va `pbx.<domen>` → server IP (telefonlar va brauzer telefoni).
3. SIP operator ma'lumotlari: server (host:port), login, parol, raqam(lar); ro'yxatdan o'tish talab qilinadimi yoki IP bo'yichami (operator bizning server IP'ni oq ro'yxatga qo'shadi).
4. `deploy/.env` (DOMAIN, ACME_EMAIL, POSTGRES_PASSWORD, LICENSE_SECRET, karta, Telegram, AGE_PUBLIC_KEY, RCLONE_REMOTE, PBX_SIP_HOST=pbx.<domen>, AMI_SECRET,
   **PBX_EXTERNAL_IP=<server tashqi IPv4>**, ixtiyoriy PBX_LOCAL_NET).

## Qadamlar (serverda, root)
1. `deploy/harden.sh` (Docker, devor, fail2ban + **asterisk-crm jail**, logrotate) → devor: 22, 80, 443 (TCP) + **5060/udp** va **10000–10200/udp** (SIP/RTP).
   5038 (AMI) va 5432 hech qachon ochilmaydi. Tekshiruv: `fail2ban-client status asterisk-crm`.
2. `git clone … /opt/crm && cd /opt/crm && docker build -t crm:latest .` → `cd deploy && docker compose --env-file .env up -d`.
3. Stansiya: `AMI_SECRET=… PBX_SIP_HOST=pbx.<domen> asterisk/init.sh ./asterisk-data` (standart ruscha ovozlar ~10 MB yuklanadi: signal, ovozli pochta, IVR jimligi —
   `andrius/asterisk` tasvirida ovoz fayli YO'Q) → `docker compose --profile pbx up -d asterisk` → `docker exec crm-caddy caddy reload --config /etc/caddy/Caddyfile`
   → brauzer telefoni uchun: `PBX_EXTERNAL_IP=<IP> asterisk/ice-nat.sh` (asterisk konteyneri har qayta yaratilganda takrorlang).
4. Mijoz: `./new-customer.sh <nom> --pbx` (SETUP_TOKEN chiqadi — mijozga alohida kanal orqali; PBX_EXTERNAL_IP/PBX_LOCAL_NET mijoz .env ga o'tadi).
5. CRM → Telefoniya: ichki raqamlar (har biriga CRM foydalanuvchisi), guruh; **Telefoniya → ATS sozlamalari → Raqam qo'shish → Trunk**: server/login/parol, «Operatorda ro'yxatdan o'tish» (IP bo'yicha bo'lsa o'chiring), kiruvchi marshrut (guruh/IVR) → Chiquvchi qoida (maska + trunk) → **Diagnostika → «Stansiyaga qo'llash»**.
6. Telefonlar: `Konfigurator` (Yealink/Panasonic/…) yoki MicroSIP: server `pbx.<domen>`, login = ichki raqam, parol — Diagnostika/Foydalanuvchi sahifasidan. Brauzer telefoni: CRM ichida avtomatik (`wss://pbx.<domen>/ws`).
7. Sinov: ichki ↔ ichki, tashqi → DID, ichki → tashqi; Qo'ng'iroqlar jurnalida paydo bo'lishi va yozuv tinglanishi; `./backup.sh` + `restore-drill.sh`.

## NAT (qisqacha)
Asterisk Docker konteynerida ichki IP (172.x) bilan ishlaydi; telefon va operator esa tashqi IP'ni ko'rishi kerak. CRM `PBX_EXTERNAL_IP` berilsa
pjsip `transport-udp` ga `external_media_address`/`external_signaling_address` va `local_net` yozadi («Stansiyaga qo'llash», Asterisk qayta ishga tushmaydi).
- `PBX_LOCAL_NET` (vergul bilan, masalan `172.16.0.0/12,10.8.0.0/16`) — shu tarmoqlardagi manzillarga almashtirish qilinmaydi. Berilmasa: `127.0.0.0/8, 172.16.0.0/12` (Docker).
- Qoida (Asterisk 23 manbasi va jonli sinov): almashtirish faqat qarshi tomon `local_net` dan TASHQARIDA, bizning manzil esa ICHIDA bo'lsa bo'ladi.
- Brauzer telefoni (WebRTC) SDP emas, ICE nomzodlaridan foydalanadi — `asterisk/ice-nat.sh` rtp.conf `[ice_host_candidates]` ga `<konteyner IP> => <tashqi IP>` yozadi.
- Qiymatlar tekshiriladi: IPv4/IPv6/domen, tarmoq `a.b.c.d/nn`; `;`, qator uzilishi — rad (konfiguratsiyaga tushmaydi).

## Xavfsizlik: fail2ban (SIP parol tanlash)
- Asterisk `logger.conf`: `security.log => security` → `asterisk-data/log/security.log`.
- Filtr `deploy/fail2ban/filter.d/asterisk-crm.conf` (Asterisk 23 formatiga mos; stock filtrdagi `ReceivedHash…$` 23-versiyada tutmaydi), jail `deploy/fail2ban/jail.d/asterisk-crm.local`:
  10 xato / 10 daqiqa → 1 soat (takrorlansa oshib boradi, 1 haftagacha). Bloklash **DOCKER-USER** zanjirida (Docker portlari INPUT'dan o'tmaydi).
- WS (brauzer telefoni) xatolari bloklanmaydi — ular Caddy IP'sidan keladi; Docker tarmog'i `ignoreip` da.
- Mahalliy tekshiruv: `python3 deploy/fail2ban/test-filter.py` (jonli Asterisk 23 jurnali namunalari); serverda: `fail2ban-regex asterisk-data/log/security.log /etc/fail2ban/filter.d/asterisk-crm.conf`.

## Yozuvlar
- Fayllar: `asterisk-data/recordings/<id>.wav` (suhbat, MixMonitor) va `<id>-vm.wav` (ovozli pochta xabari). Jurnalda ovozli pochta «Ovozli pochta» natijasi bilan.
- Saqlash muddati: **Telefoniya → Suhbatlarni yozib olish → Saqlash muddati** (standart 90 kun, 0 — o'chirilmaydi). Har sutka rahbar nusxa eski yozuvlarni o'chiradi;
  qo'ng'iroq jurnalda qoladi, yozuv «mavjud emas». CRM konteyneri recordings papkasini yozish ruxsati bilan ulaydi (new-customer.sh).

## Tekshiruv ro'yxati (haqiqiy serverda)
- [ ] `pjsip show registrations` — Registered (trunk); `pjsip show contacts` — telefonlar Avail.
- [ ] NAT: telefon uydan/ofisdan ulanganda ovoz ikki tomonlama; `pjsip show transport transport-udp` — external_* va local_net to'g'ri; brauzer telefoni ovozi (ice-nat.sh).
- [ ] Operator caller-id/DID formati (kiruvchi raqam `+998…` yoki `998…`): trunk modulida «Qo'shimcha kiruvchi raqamlar» ga yozing.
- [ ] Toll-fraud: chiquvchi qoidalarda faqat kerakli prefikslar; `fail2ban-client status asterisk-crm` (noto'g'ri parol bilan sinab ko'ring — IP bloklanadi).
- [ ] Yozuvlar hajmi: `asterisk-data/recordings` (wav ~ 1 MB/daqiqa) — saqlash muddati sozlamasi.

## Mahalliy qayta sinash
`scripts/pbx-live/`: `up.sh` (Asterisk + CRM), `backend.sh` (faqat CRM'ni qayta ishga tushirish; env bilan, masalan `PBX_EXTERNAL_IP=… backend.sh`), `prov.sh` (soxta provayder),
`apply.mjs`, `trunk.mjs` (`FORWARD=5000` — kiruvchini IVR'ga), `flow.mjs` (IVR + ovozli pochta; `flow.mjs time work|off|holiday|night|night2|night3` — vaqt qoidasi),
`dtmf-call.sh` (tugma bosish bilan qo'ng'iroq), `time-check.sh`, `call.sh`, `trunk-call.sh in|out`, `ext-call.sh`, `audio.mjs`, `ws-reg.mjs`,
`webrtc-call.sh` (headless Chromium + soxta mikrofon → brauzer telefoni → 101), `calls.mjs`, `down.sh`. Talab: Docker (Colima), baresip konteyner ichida o'rnatiladi.
