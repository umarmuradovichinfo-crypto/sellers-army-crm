# Sellers Army CRM

"Sellers Army Academy" platformasidan ajratib olingan **mustaqil CRM**: lidlar voronkasi (kanban), vazifalar,
kontaktlar/kompaniyalar, suhbatlar (Telegram), analitika, avtomatlashtirish, lid formalari, mahsulotlar,
sotuv maqsadlari, **OnlinePBX telefoniyasi** (qo'ng'iroqlar, yozuvlar, brauzer-telefon, webhook) va
**Facebook Lead Ads** orqali lid kelishi. Foydalanuvchilar, rollar va ruxsatlar ham shu loyihada.

Tuzilma: `backend/` (NestJS 11 + Prisma 7 + PostgreSQL) va `frontend/` (React 18 + Vite).
Ishlab chiqarishda bitta xizmat (monolit): frontend `backend/dist/public` ga ko'chiriladi va backend uni uzatadi.

## Nima bor

Backend modullari (`backend/src`):
- `crm` — lidlar, voronka/bosqichlar, maydonlar, teglar, yo'qotish sabablari, vazifalar, faoliyat jurnali, avtomatlashtirish,
  kontakt/kompaniya, formalar (ochiq `/lead/:slug`), mahsulotlar, sotuv maqsadlari, analitika, bildirishnomalar,
  Telegram suhbati (`telegram.client.ts`, `chat.*`), eslatmalar (`reminder.service.ts`)
- `onlinepbx` — qo'ng'iroqlar ro'yxati, click-to-call, yozuvlar, webhook, PBX sozlamalari
- `settings` — foydalanuvchilar (login/parol/ichki raqam), rollar va ruxsatlar matritsasi
- `auth` — login, JWT access+refresh, `/auth/me`, ruxsatlarni bootda sinxronlash
- `facebook` — Lead Ads: OAuth, sahifa/forma ulash, webhook, forma -> CRM voronka moslash
- `common` (guard, dekoratorlar, filtr, constants/permissions), `config` (env tekshiruvi), `prisma` (servis)

Frontend (`frontend/src`): `CrmApp.jsx` (chap panel: Ish stoli, Lidlar, Vazifalar, Ro'yxatlar, Suhbatlar, Qo'ng'iroqlar,
Analitika, Sozlamalar, Foydalanuvchilar), `pages/` (Login, CRM, LeadForm, Settings), `components/crm`, `components/forms`,
`components/ui`, `CallWidget`, `Dialog`, `Icon`, `services` (crm, forms, facebook, settings), `context/AuthContext`,
`lib` (apiClient, useApi, webrtcPhone), `config/permissions`, `mocks/data.js`, stillar.

## Olib tashlangan modullar (CRM'ga aloqasi yo'q)
Backend: `ai`, `attendance`, `business`, `checklist`, `forms-media`, `hr`, `onboarding`, `smm`, `stubs`, `tasks`, `video`,
**`telegram`** (bu davomat/payslip boti edi, `attendance` ga bog'liq; CRM o'zining `crm/telegram.client.ts` idan foydalanadi).
Frontend: `App.jsx` (LMS ilovasi), Dashboard, AIInsights, Marketing, SMM, VideoContent, Tasks, Checklist, HR, Finance, LMS,
Onboarding, Vision, Attendance, History, Apply, FormsManager sahifalari, `layout/*`, `config/nav.js`, `lib/socket.js` va tegishli servislar.
Ruxsatlar `crm.*`, `settings.*` ga qisqartirildi; rollar: `super_admin`, `sotuvchi`, `traffic`.
Bog'liqlikdan chiqarildi: `@anthropic-ai/sdk`, `openai`, `@napi-rs/canvas`, `ffmpeg-static`, `ffprobe-static`.

Saqlab qolingan va sababi:
- `facebook` — CRM lid manbai. Faqat bitta o'zgarish: HR (nomzod) yo'nalishi olib tashlandi, lidlar faqat CRM'ga tushadi (`hr` moduliga bog'liqlik yo'q).
- `settings` + `auth` — CRM foydalanuvchilari va ruxsatlari uchun shart.

## Prisma modellari (26)
`Role, Permission, RolePermission, User, RefreshToken` (auth/RBAC) · `CrmPipeline, CrmStage, Lead, LeadTask, CallLog, CrmField, Automation,
Activity, LostReason, CrmTag, Notification, SavedFilter, Company, Contact, CrmForm, Message, SalesGoal, Product` (CRM) ·
`FbLeadForm, FbProcessedLead` (Facebook) · `AppSetting` (UI'dan saqlanadigan sozlamalar: OnlinePBX, Facebook, Telegram va h.k.).
Migratsiya: bitta toza boshlang'ich `backend/prisma/migrations/20260101000000_init`.

## O'rnatish va ishga tushirish

Talab: Node.js 20+ va PostgreSQL 14+ (yoki Docker).

### A) Docker (eng oson)
```bash
cp .env.example .env
# .env da to'ldiring: JWT_ACCESS_SECRET, JWT_REFRESH_SECRET (har biri `openssl rand -hex 32`), SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
docker compose up --build        # postgres + ilova (frontend backend ichida uzatiladi)
```
Ochiladi: http://localhost:8000 . Kirish: `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
`SEED_ADMIN_PASSWORD` berilmasa tasodifiy parol yaratiladi va **faqat birinchi ishga tushishda** konsolga (`docker compose logs app`) chiqadi.
(`docker-compose.yml` va `Dockerfile` yozilgan, lekin muallif muhitida Docker yo'q edi, shuning uchun konteynerda sinalmagan.)

### B) Lokal PostgreSQL
```bash
cp .env.example backend/.env      # DATABASE_URL, JWT_*_SECRET, SEED_ADMIN_* ni to'ldiring
cd backend && npm install         # prisma generate avtomatik ishlaydi
npx prisma migrate deploy         # jadvallar + standart voronka bosqichlari
npm run db:seed                   # rollar, ruxsatlar, birinchi super admin
npm run start:dev                 # http://localhost:8000/api/v1

cd ../frontend && npm install
npm run dev                       # http://localhost:5173 (/api -> localhost:8000 proxy)
```

Production (monolit, Railway yoki istalgan hosting):
```bash
npm run build   # frontend + backend yig'iladi, frontend backend/dist/public ga ko'chadi
npm start       # prisma migrate deploy -> seed -> node dist/main
```
`railway.json` tayyor (Railpack). Barcha o'zgaruvchilar `.env.example` da izohlangan.

### Smoke test
Bo'sh (throwaway) baza bilan: `DATABASE_URL=postgresql://user:pass@localhost:5432/crm_smoke npm run smoke`
(migratsiya, seed, build, serverni ko'tarish va ~150 ta tekshiruv: auth, RBAC, CRM, forma, analitika, telefoniya/Telegram/Facebook sozlanmagan holat va webhooklar).

### Muhim o'zgaruvchilar
- Majburiy: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (>= 32 belgi, bir-biridan farqli).
- Seed: `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (>= 8 belgi; yo'q bo'lsa tasodifiy parol bir marta chop etiladi; standart parol yo'q), `SEED_ADMIN_NAME`.
- Webhook manzillari uchun: `PUBLIC_URL` (masalan `https://crm.example.com`).
- Ixtiyoriy: `ONLINEPBX_*`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `FB_APP_ID/FB_APP_SECRET/FB_VERIFY_TOKEN`, `CORS_ORIGIN`, `PORT`.
- Frontend (build vaqtida): `VITE_API_BASE`, `VITE_USE_MOCKS` (demo, backend'siz), `VITE_API_URL` (dev proxy).

## OnlinePBX (telefoniya) ulash
1. CRM'ga super admin sifatida kiring -> **Sozlamalar -> Telefoniya (OnlinePBX)**: domen (`pbxNNNNN.onpbx.ru`), API kaliti, standart ichki raqam,
   rejim (`callback` yoki `softphone`) ni kiriting. (Yoki `ONLINEPBX_*` env; UI'dagi qiymat ustun.)
2. **Foydalanuvchilar** bo'limida har operatorga ichki raqam (`extension`) bering; brauzer-telefon (WebRTC/JsSIP) uchun SIP paroli ham saqlanadi.
3. OnlinePBX kabinetida webhook (qo'ng'iroq hodisalari) manzilini qo'ying:
   `https://<PUBLIC_URL>/api/v1/onlinepbx/webhook?secret=<ONLINEPBX_WEBHOOK_SECRET>` (secret ixtiyoriy).
4. Qo'ng'iroqlar `Qo'ng'iroqlar` bo'limida, kiruvchi qo'ng'iroqda lid telefon bo'yicha topilib oyna chiqadi.

## Telegram va Facebook
- Telegram (mijoz bilan suhbat + yangi lid): `TELEGRAM_BOT_TOKEN` ni kiriting, `TELEGRAM_WEBHOOK_SECRET` ni (tavsiya) o'ylab toping, so'ng
  CRM -> Suhbatlar sozlamasidagi tugma yoki `POST /api/v1/crm/telegram-webhook-setup {"url":"https://<PUBLIC_URL>/api/v1/telegram/webhook"}`
  webhookni o'rnatadi (secret ham yuboriladi). Bot yozishmasi yangi "Saralanmagan" lid yaratadi, javob CRM'dan botga ketadi.
- Facebook Lead Ads: developers.facebook.com'da ilova yarating, App ID/Secret/Verify Token ni **Sozlamalar -> Facebook** da saqlang (yoki `FB_*` env),
  Meta'da webhook: `https://<PUBLIC_URL>/api/v1/facebook/webhook` (Verify Token bir xil), OAuth redirect: `https://<PUBLIC_URL>/api/v1/facebook/oauth/callback`.
  So'ng "Ulash" (OAuth) yoki Page ID + Page Access Token bilan qo'lda ulang, formani tanlab maydonlarni CRM maydonlariga moslang.
  Takroriy webhooklar `leadgenId` bo'yicha e'tiborsiz qoldiriladi; Graph xatosi bo'lsa lid keyingi qayta yuborishda qayta uriniladi.

## Cheklovlar
- Telegram/OnlinePBX/Facebook haqiqiy serverlari bilan sinalmagan: ular mock server (OnlinePBX uchun `ONLINEPBX_BASE`, Facebook uchun `FB_GRAPH_BASE`) bilan
  tekshirilgan; Telegram sendMessage faqat noto'g'ri token bilan xatoni to'g'ri qaytarishi tekshirilgan. WebRTC (JsSIP) qo'ng'iroq vidjeti haqiqiy SIP bilan sinalmagan.
- OnlinePBX webhook secret berilmasa webhook ochiq qoladi — productionda `ONLINEPBX_WEBHOOK_SECRET` ni belgilang. Facebook webhook `X-Hub-Signature` tekshirilmaydi.
- OnlinePBX/Facebook kalitlari (`AppSetting`) bazada oddiy matn sifatida saqlanadi — bazaga kirishni cheklang. Frontend bundle ~650 kB (code-splitting yo'q). Interfeys tili — o'zbekcha.
