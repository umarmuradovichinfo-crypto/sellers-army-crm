# Serverga o'rnatish (Railway o'rniga o'z VPS) — PLAN 43

Bitta VPS (tavsiya: 4 vCPU / 8 GB, ~€9/oy) ichida: **umumiy Postgres + Caddy (avtomatik HTTPS)** va **har mijozga alohida konteyner + alohida baza**.
Mijoz manzili: `https://<nom>.<DOMEN>`. ~15–20 mijozgacha bitta server yetadi.

> Diqqat: bu skriptlar **haqiqiy serverda hali sinalmagan** (faqat sintaksis va fayl yaratish quruq yurgizilgan). Birinchi o'rnatishni
> bo'sh serverda, test mijoz bilan boshlang va quyidagi «Tekshiruv ro'yxati»ni bajaring.

## 1. Server tayyorlash (bir marta)
1. VPS oling (Hetzner CX33 / Contabo / Netcup). Ubuntu 24.04. SSH kalit bilan kiring.
2. DNS: `*.crm.example.uz` (yoki o'z domeningiz) → server IP (A yozuvi, wildcard).
3. Serverda (root): `curl -fsSL https://raw.githubusercontent.com/<repo>/amo-clone/deploy/harden.sh | bash` yoki repo'ni klonlab `deploy/harden.sh` ni yurgizing
   (Docker, devor, fail2ban, avto-yangilanish). Parol bilan SSH'ni SSH kalit ishlashini tekshirgach o'zingiz o'chiring.
4. `git clone <repo> /opt/crm && cd /opt/crm && git checkout amo-clone`
5. `cp deploy/.env.example deploy/.env` va to'ldiring (DOMAIN, ACME_EMAIL, POSTGRES_PASSWORD, LICENSE_SECRET, karta, Telegram, AGE_PUBLIC_KEY, RCLONE_REMOTE).
   `LICENSE_SECRET` macOS Keychain'da («crm-license-secret», `security find-generic-password -s crm-license-secret -w`) — serverga SSH orqali stdin bilan uzatiladi, faylga/chatga ochiq yozilmaydi. Qolgan sirlarni `openssl rand -hex 32` bilan yarating, **chatga yozmang**, repoga qo'shmang (`deploy/.gitignore` himoya qiladi).
6. `docker build -t crm:latest .` (repo ildizida), keyin `cd deploy && docker compose --env-file .env up -d`.

## 2. Yangi mijoz
```bash
cd /opt/crm/deploy && ./new-customer.sh decopol
```
Natija: baza `crm_decopol`, konteyner `crm-decopol`, `https://decopol.<DOMEN>`, chiqqan **SETUP_TOKEN** ni mijozga alohida kanal orqali bering —
u birinchi ochilganda shu kod bilan o'z admin login/parolini yaratadi. Obuna: sinov 14 kun; to'lovdan keyin litsenziya kodi (`scripts/license.mjs`).
Mijozning Telegram/OnlinePBX/AI kalitlari — CRM ichidagi Sozlamalar yoki `customers/<nom>/.env` (`ANTHROPIC_API_KEY` — Dono uchun, mijozning o'z kaliti).

## 3. Yangilash
```bash
cd /opt/crm/deploy && ./update.sh
```
`git pull` → yangi image → har mijoz ketma-ket qayta ishga tushadi (migratsiya o'zi ishlaydi) → sog'liq tekshiruvi. Biri ishlamasa — to'xtaydi, Telegramga xabar,
qolganlar eski versiyada qoladi.

## 4. Zaxira nusxa (ma'lumot yo'qolmasligi)
- `backup.sh` — har kecha: har mijoz bazasi → `pg_dump` → **age bilan shifrlanadi** (serverda faqat ommaviy kalit) → `rclone` orqali BOSHQA provayderga.
  Kunlik nusxalar 40 kun, har oyning 1-kuni nusxasi 12 oy saqlanadi.
- `check-backup.sh` — har kuni: har mijozning oxirgi zaxirasi borligi, yangiligi (26 soat), hajmini tekshiradi; muammo bo'lsa Telegramga.
- `restore-drill.sh <nom> <age-maxfiy-kalit>` — **oyiga bir marta**, o'zingizning kompyuteringizda: oxirgi zaxirani vaqtinchalik bazaga tiklab ko'radi.
  Tiklab ko'rilmagan zaxira — zaxira emas.
- `age-keygen -o ~/crm-backup.key` — maxfiy kalitni **serverga qo'ymang**, 2 joyda (parol menejeri + oflayn) saqlang; ommaviy kalit (`age1…`) `deploy/.env` ga.
- crontab (root):
```
17 3 * * *  /opt/crm/deploy/backup.sh >> /var/log/crm-backup.log 2>&1
47 7 * * *  /opt/crm/deploy/check-backup.sh >> /var/log/crm-backup.log 2>&1
```
- Qo'shimcha: provayderning avtomatik snapshot'ini yoqing (server narxining ~20%).

## 5. Server o'lsa
1. Yangi VPS, 1-bo'lim 1–6 qadamlar.
2. Har mijoz uchun: `./new-customer.sh <nom>` o'rniga mavjud `customers/` va `.env` fayllarini zaxiradan qaytaring (yoki skriptni yurgizib bazani tiklang):
   `age -d -i kalit.key nusxa.dump.age | docker exec -i crm-postgres pg_restore -U postgres --clean --if-exists --no-owner -d crm_<nom>`.
3. DNS ni yangi IP ga o'tkazing. Taxminan 1 soat.
> `backup.sh` bazalar bilan birga server sozlamalarini ham (`deploy/.env`, `customers/*/.env`, Caddy) shifrlab `config/` ga saqlaydi: `age -d -i kalit.key config-….tar.age | tar -x -C /opt/crm/deploy`.

## 6. Keyingi daraja (mijozlar ko'payganda)
Ikkinchi server (boshqa provayderda) + Postgres jonli replikatsiyasi + domen almashishi — qarang `docs/amo-clone/PLAN.md` 43 (B daraja).
Ilovada «rahbar qulfi» tayyor (`LeaderService`): ikkala nusxa bir bazaga ulansa fon vazifalari (eslatma, avtomatlashtirish, Salesbot, OnlinePBX sinxron, hisobotlar) faqat bittasida ishlaydi, rahbar o'chsa ~45 soniyada ikkinchisi egallaydi.

## Tekshiruv ro'yxati (birinchi o'rnatishdan keyin)
- [ ] `https://<nom>.<DOMEN>` ochiladi, HTTPS sertifikat bor
- [ ] «Birinchi sozlash» SETUP_TOKEN bilan ishlaydi, admin kirdi
- [ ] Sozlamalar → Hisob va to'lov: karta va Telegram ko'rinadi, sinov 14 kun
- [ ] `./backup.sh` qo'lda yurgizildi, tashqi joyda fayl paydo bo'ldi, `restore-drill.sh` bilan tiklandi
- [ ] `./update.sh` xatosiz o'tdi
- [ ] Postgres tashqaridan yopiq: `nmap <ip> -p 5432` → closed
