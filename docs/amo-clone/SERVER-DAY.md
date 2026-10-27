# Server kuni — VPS va SIP raqam kelganda qadamlar

Hammasi mahalliy Docker'da sinalgan (27.10.2026): deploy kit (Postgres + Caddy HTTPS + mijoz konteyneri), zaxira/tiklash, haqiqiy Asterisk 23 bilan
ichki/kiruvchi/chiquvchi qo'ng'iroq (soxta provayder trunk), yozuv, CDR → CRM, audio (ffmpeg → 8 kHz wav), brauzer telefoni ro'yxatdan o'tishi (JsSIP, ws).
Haqiqiy serverda faqat quyidagilar yangi: DNS, Let's Encrypt, haqiqiy operator trunki, NAT/firewall.

## Sizdan kerak
1. VPS (Ubuntu 24.04, 4 vCPU/8 GB tavsiya), SSH kalit.
2. Domen: `*.crm.<domen>` → server IP (mijoz sahifalari) va `pbx.<domen>` → server IP (telefonlar va brauzer telefoni).
3. SIP operator ma'lumotlari: server (host:port), login, parol, raqam(lar); ro'yxatdan o'tish talab qilinadimi yoki IP bo'yichami (operator bizning server IP'ni oq ro'yxatga qo'shadi).
4. `deploy/.env` (DOMAIN, ACME_EMAIL, POSTGRES_PASSWORD, LICENSE_SECRET, karta, Telegram, AGE_PUBLIC_KEY, RCLONE_REMOTE, PBX_SIP_HOST=pbx.<domen>, AMI_SECRET).

## Qadamlar (serverda, root)
1. `deploy/harden.sh` (Docker, devor, fail2ban) → devor: 22, 80, 443 (TCP) + **5060/udp** va **10000–10200/udp** (SIP/RTP). 5038 (AMI) va 5432 hech qachon ochilmaydi.
2. `git clone … /opt/crm && cd /opt/crm && docker build -t crm:latest .` → `cd deploy && docker compose --env-file .env up -d`.
3. Stansiya: `AMI_SECRET=… PBX_SIP_HOST=pbx.<domen> asterisk/init.sh ./asterisk-data` → `docker compose --profile pbx up -d asterisk` → `docker exec crm-caddy caddy reload --config /etc/caddy/Caddyfile`.
4. Mijoz: `./new-customer.sh <nom> --pbx` (SETUP_TOKEN chiqadi — mijozga alohida kanal orqali).
5. CRM → Telefoniya: ichki raqamlar (har biriga CRM foydalanuvchisi), guruh; **Telefoniya → ATS sozlamalari → Raqam qo'shish → Trunk**: server/login/parol, «Operatorda ro'yxatdan o'tish» (IP bo'yicha bo'lsa o'chiring), kiruvchi marshrut (guruh/IVR) → Chiquvchi qoida (maska + trunk) → **Diagnostika → «Stansiyaga qo'llash»**.
6. Telefonlar: `Konfigurator` (Yealink/Panasonic/…) yoki MicroSIP: server `pbx.<domen>`, login = ichki raqam, parol — Diagnostika/Foydalanuvchi sahifasidan. Brauzer telefoni: CRM ichida avtomatik (`wss://pbx.<domen>/ws`).
7. Sinov: ichki ↔ ichki, tashqi → DID, ichki → tashqi; Qo'ng'iroqlar jurnalida paydo bo'lishi va yozuv tinglanishi; `./backup.sh` + `restore-drill.sh`.

## Tekshiruv ro'yxati (haqiqiy serverda)
- [ ] `pjsip show registrations` — Registered (trunk); `pjsip show contacts` — telefonlar Avail.
- [ ] NAT: telefonlar uydan/ofisdan ulanganda ovoz ikki tomonlama (bir tomonlama bo'lsa — `external_media_address`/`external_signaling_address` pjsip transportiga, RTP diapazoni ochiqligi).
- [ ] Operator caller-id/DID formati (kiruvchi raqam `+998…` yoki `998…`): trunk modulida «Qo'shimcha kiruvchi raqamlar» ga yozing.
- [ ] Toll-fraud: chiquvchi qoidalarda faqat kerakli prefikslar; fail2ban Asterisk jurnalini kuzatadi.
- [ ] Yozuvlar hajmi: `asterisk-data/recordings` (wav ~ 1 MB/daqiqa) — tozalash/arxiv rejasi.

## Mahalliy qayta sinash
`scripts/pbx-live/`: `up.sh` (Asterisk + CRM), `prov.sh` (soxta provayder), `apply.mjs`, `trunk.mjs`, `call.sh`, `trunk-call.sh in|out`, `ext-call.sh`, `audio.mjs`, `ws-reg.mjs`, `calls.mjs`, `down.sh`. Talab: Docker (Colima), baresip konteyner ichida o'rnatiladi.
