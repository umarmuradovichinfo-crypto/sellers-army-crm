# Asterisk (o'z stansiyamiz) — o'rnatish

> **27.10.2026: haqiqiy Asterisk 23 (Docker) bilan mahalliy sinalgan** (`scripts/pbx-live/`): konfiguratsiyani qo'llash, SIP telefonlar (baresip) ro'yxatdan o'tishi, ichki/kiruvchi/chiquvchi qo'ng'iroq (soxta provayder trunk), navbat, qora ro'yxat, yozuv, CDR → CRM jurnali. Haqiqiy operator trunk'i va haqiqiy serverda hali sinalmagan.
> Birinchi o'rnatishni bo'sh serverda, ichki raqamlar bilan boshlang (tashqi liniyasiz), keyin trunk ulang.

## Tuzilma
- `etc/` — Asterisk asosiy konfiguratsiyasi. CRM yaratadigan `pjsip_crm.conf`, `extensions_crm.conf`, `queues_crm.conf` fayllarini `#include` qiladi.
- CRM `ASTERISK_CONF_DIR` papkasiga shu uch faylni yozadi, so'ng AMI orqali `module reload res_pjsip.so`, `dialplan reload`, `queue reload all` bajaradi
  (Telefoniya → ATS sozlamalari → Diagnostika → «Stansiyaga qo'llash»).
- Audio fayllar `ASTERISK_SOUNDS_DIR/custom/<id>.wav` ga ko'chiriladi (Asterisk MP3 uchun `format_mp3` moduli kerak; eng ishonchlisi — WAV 8 kHz mono).
- Yozuvlar `ASTERISK_RECORDINGS_DIR/<uniqueid>.wav` (dialplan MixMonitor) — CRM ularni «Qo'ng'iroqlar jurnali»da tinglatadi.

## CRM o'zgaruvchilari (mijoz konteyneri .env)
```
ASTERISK_AMI_HOST=asterisk          # konteyner nomi (crm-net tarmog'ida)
ASTERISK_AMI_PORT=5038
ASTERISK_AMI_USER=crm
ASTERISK_AMI_SECRET=<tasodifiy parol>
ASTERISK_CONF_DIR=/asterisk/etc
ASTERISK_SOUNDS_DIR=/asterisk/sounds
ASTERISK_RECORDINGS_DIR=/asterisk/recordings
PBX_SIP_HOST=sip.sizning-domen.uz   # telefonlar ro'yxatdan o'tadigan manzil
```
CRM konteyneriga `asterisk/etc`, `asterisk/sounds`, `asterisk/recordings` papkalarini ulang (compose `volumes`), Telefoniya sozlamasida provayderni «own» ga o'tkazing.

## Birinchi ishga tushirish (qadamlar)
1. `AMI_SECRET=<tasodifiy parol> ./init.sh /opt/crm/deploy/asterisk-data` — konteynerning standart konfiguratsiyasini (asterisk.conf, modules.conf …) ko'chirib, ustiga bizning fayllarni yozadi va `manager.conf` dagi parolni qo'yadi (papkani butunlay mount qilish uchun standart fayllar shart).
2. `docker compose --profile pbx up -d asterisk` (compose.yml dagi `asterisk` xizmati).
3. CRM'da ichki raqamlar (foydalanuvchi modullari, har biriga CRM foydalanuvchisi biriktirilgan) va marshrutni tuzing → «Stansiyaga qo'llash».
4. Brauzer telefoni yoki stol telefoni bilan ro'yxatdan o'ting (Konfigurator), ichki raqamlar orasida sinang.
5. Trunk (operator) ma'lumotlarini kiriting, tashqi qo'ng'iroqni sinang.

## Xavfsizlik
- SIP portini (5060/udp) va RTP (10000–10200/udp) faqat kerak bo'lsa oching; kuchli parollar (CRM o'zi hosil qiladi); `fail2ban` Asterisk jurnalini kuzatsin.
- AMI (5038) internetga ochilmaydi — faqat `crm-net` ichida.
- Toll-fraud: chiquvchi qoidalarda faqat kerakli mamlakat prefikslarini qoldiring.
