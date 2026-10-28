# Asterisk (o'z stansiyamiz) — o'rnatish

> **27.10.2026: haqiqiy Asterisk 23 (Docker) bilan mahalliy sinalgan** (`scripts/pbx-live/`): konfiguratsiyani qo'llash, SIP telefonlar (baresip) ro'yxatdan o'tishi, ichki/kiruvchi/chiquvchi qo'ng'iroq (soxta provayder trunk), navbat, qora ro'yxat, yozuv, CDR → CRM jurnali. Haqiqiy operator trunk'i va haqiqiy serverda hali sinalmagan.
> Birinchi o'rnatishni bo'sh serverda, ichki raqamlar bilan boshlang (tashqi liniyasiz), keyin trunk ulang.

## Tuzilma
- `etc/` — Asterisk asosiy konfiguratsiyasi. CRM yaratadigan `pjsip_crm.conf`, `extensions_crm.conf`, `queues_crm.conf` fayllarini `#include` qiladi.
- CRM `ASTERISK_CONF_DIR` papkasiga shu uch faylni yozadi, so'ng AMI orqali `module reload res_pjsip.so`, `dialplan reload`, `queue reload all` bajaradi
  (Telefoniya → ATS sozlamalari → Diagnostika → «Stansiyaga qo'llash»).
- Audio fayllar `ASTERISK_SOUNDS_DIR/custom/<id>.wav` ga ko'chiriladi (Asterisk MP3 uchun `format_mp3` moduli kerak; eng ishonchlisi — WAV 8 kHz mono).
- Yozuvlar `ASTERISK_RECORDINGS_DIR/<uniqueid>.wav` (dialplan MixMonitor) va ovozli pochta `<uniqueid>-vm.wav` — CRM ularni «Qo'ng'iroqlar jurnali»da tinglatadi;
  saqlash muddati (standart 90 kun) o'tganlarini CRM o'zi o'chiradi (Telefoniya → Suhbatlarni yozib olish).
- Standart ovozlar (`beep`, `vm-intro`, `silence/1`…): `init.sh` Asterisk core-sounds paketini `sounds/ru` ga yuklaydi va `defaultlanguage = ru` qo'yadi
  (`ASTERISK_SOUNDS_LANG=en|none`). Tasvirning o'zida ovoz fayli yo'q.
- NAT: `PBX_EXTERNAL_IP`/`PBX_LOCAL_NET` (CRM env) → pjsip transport; brauzer telefoni uchun `ice-nat.sh` (docs/amo-clone/SERVER-DAY.md → NAT).

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
PBX_EXTERNAL_IP=203.0.113.10        # (ixtiyoriy) server tashqi IP — NAT: pjsip external_* (Docker'da kerak)
PBX_LOCAL_NET=172.16.0.0/12         # (ixtiyoriy) ichki tarmoqlar, vergul bilan; standart 127.0.0.0/8,172.16.0.0/12
```
CRM konteyneriga `asterisk/etc`, `asterisk/sounds`, `asterisk/recordings` papkalarini ulang (compose `volumes`), Telefoniya sozlamasida provayderni «own» ga o'tkazing.

## Birinchi ishga tushirish (qadamlar)
1. `AMI_SECRET=<tasodifiy parol> ./init.sh /opt/crm/deploy/asterisk-data` — konteynerning standart konfiguratsiyasini (asterisk.conf, modules.conf …) ko'chirib, ustiga bizning fayllarni yozadi va `manager.conf` dagi parolni qo'yadi (papkani butunlay mount qilish uchun standart fayllar shart).
2. `docker compose --profile pbx up -d asterisk` (compose.yml dagi `asterisk` xizmati).
3. CRM'da ichki raqamlar (foydalanuvchi modullari, har biriga CRM foydalanuvchisi biriktirilgan) va marshrutni tuzing → «Stansiyaga qo'llash».
4. Brauzer telefoni yoki stol telefoni bilan ro'yxatdan o'ting (Konfigurator), ichki raqamlar orasida sinang.
5. Trunk (operator) ma'lumotlarini kiriting, tashqi qo'ng'iroqni sinang.

## Xavfsizlik
- SIP portini (5060/udp) va RTP (10000–10200/udp) faqat kerak bo'lsa oching; kuchli parollar (CRM o'zi hosil qiladi).
- fail2ban: `etc/logger.conf` → `security.log` (asterisk-data/log); filtr va jail — `deploy/fail2ban/` (harden.sh o'rnatadi, DOCKER-USER zanjirida bloklaydi).
  Filtrni tekshirish: `python3 deploy/fail2ban/test-filter.py`.
- AMI (5038) internetga ochilmaydi — faqat `crm-net` ichida.
- Toll-fraud: chiquvchi qoidalarda faqat kerakli mamlakat prefikslarini qoldiring.
