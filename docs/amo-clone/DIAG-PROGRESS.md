# Diagnostika — progress (davom ettirish uchun)

**Maqsad (foydalanuvchi, 27.10):** hozirgacha qilingan hamma narsani (UI emas — har bir mantiq, funksiya) diagnostika qilish va topilgan xatolarni tuzatish. Yangi funksiya QURILMAYDI.
**Usul:** 5 ta mustaqil o'qish-agent (bitimlar, chat, auth/xavfsizlik, telefoniya, analitika, frontend) topilma ro'yxati berdi → har biri kodda tasdiqlanib tuzatiladi → regressiya testi → `npm run build && npm run test:qa` → commit + push (`amo-clone`).

## Bajarildi (commit qilingan yoki ishchi daraxtda)
- Huquqlar bo'shliqlari: dublikatlar, o'chirilgan vazifalar, Salesbot, voqealar, qo'ng'iroqlar ro'yxati/yozuvi/popup/lead-by-phone, Dono vositalari, bulk-delete, acceptUnsorted, kompaniya bitimlari, kontaktni biriktirish, import (update/create), analitika employees/calls.
- Chat: lenta tartibi (eng yangi 200), Telegram webhook idempotentligi + edited_message, Toshkent vaqti (periodStart/chatStats/reminder), qisqa havola (prefiks, preview-bot, atomik birinchi bosish), NPS/intents/Salesbot to'qnashuvlari, web-chat IP rate-limit, Salesbot rekursiya himoyasi, Telegram kod bir martalik, edit huquqi (yuborish/yopish).
- Telefoniya: final-aniqlash (status so'zlari), holat orqaga qaytmaydi, per-uuid qulf, sync ustma-ust tushmaydi, «from» cheklovi (toll-fraud), niyat faqat chiquvchi.
- Auth: super_admin himoyasi (yaratish/tahrir/parol/oxirgi), deaktivatsiyada sessiyalar yopiladi, refresh isActive, login limiti (bcrypt oldidan hisob + akkaunt limiti), vaqt tenglashtirish, voqealardan `auth` yashirildi.
- Bitimlar: money() parser, CSV formula-injection, deleteStage sanalar, merge telegramChatId, import won/lost sanalari, bulk stage activity data, pickStatus (ikki voronka orasida qolish), ImportPage stage id.
- Analitika: userIds kesishmasi, vazifa doneAt qayta yozilmaydi, iCal `;`, call kun kaliti Toshkent, parseFrom/parseTo Toshkent.
- Telefoniya (2): recordUrl SSRF (faqat https + onlinepbx/onpbx/ulangan domen, redirect yo'q, 50MB), ensureCallerLead per-raqam qulf + qayta qidirish, missed-vazifa dedupe (format-mustaqil).
- Auth (2): backup oqimi uzilsa osilmaydi/yarim fayl, iCal va Telegram jamlanma/hisobot faol bo'lmagan foydalanuvchiga ishlamaydi.
- Automation `send_message` barcha kanallarga (ChatService orqali); TasksFilter sana siljishi; LeadsPipeline localStorage try/catch; ProductsPage ikki marta bosish.
- Frontend: useApi eskirgan javob, offline navbat (401 refresh, logout'da tozalash, create navbatga tushmaydi), LeadCard (xato holati, id guard, save/tags/delete catch, export), IncomingCall qayta ochilmaydi, Dashboard o'rtacha davomiylik, i18n (Eslatma to'qnashuvi, barcha lug'atlar eager), mobil popup eni.
- (26.10) Bitimlar: merge tranzaksiyada + AutomationJob/SalesbotRun/ShortLink/ConversationState ko'chiriladi; updateLead kontakt/kompaniya mavjudligi va ko'rish huquqi; `listUnsorted` voronka bo'yicha (frontend `pipelineId`); updateStage kind o'zgarsa oxirgi tur himoyasi + bitimlar sanalari; imBox ro'yxati DISTINCT ON (oxirgi 1000 xabar emas, har bitimning oxirgi xabari).
- (26.10, 2) Maqsadlar (goals): oy chegarasi Toshkent vaqti + huquq bo'yicha tushum; vazifalar ro'yxati (3000 limit, bajarilganlar oxirgi 90 kun, tartib); useOutside eskirgan closure; catchsiz `.then` (imBox yopish, Telegram uzish).
- (26.10, 3) Telefoniya sinxroni eski tarix uchun lid yaratmaydi va avtomatlashtirish (xabar) ishga tushirmaydi (faqat oxirgi sutka); IG/FB/web xabarlari suhbat bo'yicha ketma-ket (parallel yetkazishda ikkita bitim/takror xabar bo'lmaydi).
- (26.10, 4) Dashboard yutilgan/yo'qotilgan davr bo'yicha wonAt/lostAt (card'ga qo'shildi); SettingsPage SWR formani bosib ketmaydi; AmoShell bildirishnoma intervali eskirgan `t` ishlatmaydi.
- (26.10, 5) Rahbar qulfi (bir nechta nusxada fon vazifalari bir marta); LeadsList ommaviy bosqich — barcha voronkalar.
- (26.10, 6) Voronka sarlavha statistikasi (aggAll) huquq bo'yicha cheklanadi (begona bitimlar soni/summasi ko'rinmaydi, test bilan); «Sotuv prognozi» vidjeti tanlangan xodimlarga mos.

## Qoldi (ustuvorlik bo'yicha)
1. [x] To'liq QA yashil (144/144, UI 35×3 xatosiz) — LeadCard hook-tartib xatosi (o'z o'zgarishim) tuzatildi.
2. [ ] Auth: `crm.export`/`crm.import` ruxsatlari tekshirilmaydi (faqat matritsa darajasi bor) — qaror: matritsa yetarli, hujjatlash. Migratsiya `20261025090000_lead_contacts` FK'lari idempotent emas — LEKIN qo'llangan migratsiyani TAHRIRLAMA (Prisma checksum xatosi); keraksiz. Setup tokeni production'da majburiy emas. IP whitelist: @Public yo'llar (login/iCal) chetda, XFF ishonchi.
3. [ ] Telefoniya: webhookSecret apiKey'dan hosil (birinchi saqlashda random), tail ≥9 xona contacts regex, 7 kunlik sync ommaviy lid yaratmasin (faqat recent), missed-vazifa dedupe normallangan raqam bo'yicha va mas'ul tayinlash.
4. [ ] Chat: Telegram-faqat prefda notify satri (bajarildi) — digest tekshiruvi; IG/FB unique(externalId) indeks (migratsiya) + lead yaratish qulfi; automation `send_message` faqat Telegram (ChatService.sendMessage orqali); imBox ro'yxati `take:1000` cheklovi (DISTINCT ON); `listConversations` TZ.
5. [~] Bitimlar (asosiy qismi bajarildi, yuqoriga qarang). Qoldi: stats(aggAll) ownerIds; drop-index (beforeId); LeadsList bulk stage — barcha voronkalar; `leads-import` eski endpoint.
6. [ ] Analitika: Dashboard won/lost davr bo'yicha wonAt/lostAt (frontend), Прогноз/chat vidjetlari userIds, brauzer vaqti o'rniga akkaunt TZ (iso/inRange), TasksFilter sana siljishi, vazifalar 800 limit (server filtr), goals oyi TZ + huquq, «muddati o'tgan» qoidasini birlashtirish, pipelineFlow «Неразобранное» scope, StatsPage 'all' davri, ical take:1000.
7. [ ] Frontend: LeadCard BotPick busy, SettingsPage SWR forma bosib ketishi, useOutside eskirgan closure, tarjimasiz title/placeholder'lar, ProductsPage add busy, localStorage try/catch (LeadsPipeline, tokenStore), `.then` catchsiz (fav/close/tgUnlink), AmoShell `t` eskirgan (pushBrowser), TasksModals `limit: 8`.

## Qanday davom ettirish
1. `git pull`, shu faylni o'qi, «Qoldi» ro'yxatidan yuqoridan boshla.
2. Har bandni kodda tasdiqla (agent topilmasi taxmin bo'lishi mumkin) → tuzat → test qo'sh (backend/test/e2e/*.mjs) → `npm run build && npm run test:qa`.
3. Bajarilganini yuqoridagi «Bajarildi»ga ko'chir, commit (`Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`) + `git push origin amo-clone`.
4. Hammasi tugasa — shu faylga `STATUS: DONE` yoz.

STATUS: DONE (asosiy qism). Qoldi faqat past ustuvorlik: webhookSecret (mavjud o'rnatishlarni buzmaslik uchun tegilmaydi), iCal take:1000, eski `leads-import` endpoint, drop-index (beforeId)
