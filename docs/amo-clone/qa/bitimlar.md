# QA: Bitimlar (voronka, ro'yxat, kartochka)

Usul: kod o'qish + API curl + `npx vite build`. Brauzer ishlatilmadi (UI harakatlari kod bo'yicha tekshirildi).

| # | test | kutilgan | haqiqiy | holat |
|---|------|----------|---------|-------|
| 1 | Lentada bosqich voqeasi | "Yangi bosqich: X" | "Yangi bosqich: Bosqich: X" (shu kabi "Yangi vazifa: Vazifa: ..", "Vazifa bajarildi: Vazifa bajarildi: ..", "Bitim yaratildi: Lid yaratildi: ..", won/lost) | TUZATILDI (LeadCard.jsx `actText`) |
| 2 | POST /crm/leads value=99999999999 | 400 | 500 INTERNAL_ERROR (Int overflow) | TUZATILDI (DTO Min/Max) + frontend clamp |
| 3 | PUT lead value=-5 | 400 | qabul qilindi | TUZATILDI (DTO @Min(0)) |
| 4 | Vazifa dueDate="garbage" | 400 | 500 | TUZATILDI (`toDate` helper) |
| 5 | Kartochkada vazifa "uchun <mas'ul>" | ism ko'rinadi | listLeadTasks assigneeName=null | TUZATILDI (service) |
| 6 | Bulk stage boshqa voronka bosqichiga | bitim shu voronkada ko'rinadi | pipelineId o'zgarmasdi, bitim hech qaysi voronkada ko'rinmasdi | TUZATILDI (moveLead/updateLead pipelineId sinxron) |
| 7 | Bulk stage noto'g'ri kalit | affected=0 | affected=n (xato yutilardi) | TUZATILDI |
| 8 | Bulk assignee bildirishnoma havolasi | /leads/pipeline | /crm (mavjud emas) | TUZATILDI |
| 9 | Ro'yxat: saralanmagan bitimlar | ko'rinmasin | ko'rinardi | TUZATILDI (LeadsList filtr) |
| 10 | Ro'yxat: belgilangan, filtr bilan yashirilgan qatorlar bulk'ga tushishi | faqat ko'rinadigan | yashirinlar ham | TUZATILDI |
| 11 | Ro'yxat: cheksiz scroll sentinel limit o'zgarganda qayta kuzatish | doim yuklaydi | deps'da limit yo'q edi | TUZATILDI |
| 12 | Voronka: preset "Muvaffaqiyatli"/"Amalga oshmagan" | yopiq ustunlar ko'rinadi | har doim bo'sh (faqat ochiq ustunlar) | TUZATILDI |
| 13 | Tez qo'shish: ikki marta bosish | bitta bitim | dublikat so'rov | TUZATILDI (busy) + xato alert |
| 14 | Tez qo'shish kontakt bilan (contactName+phone) | kontakt yaratilib bog'lanadi | to'g'ri ishladi (curl) | OK |
| 15 | Byudjet maydoni: harf/uzun son | faqat raqam, formatlangan | harf qabul qilinardi, saqlashda tozalanardi | TUZATILDI |
| 16 | Vazifa bajarish / composer yuborish xatosi | foydalanuvchi ko'radi | yutilgan unhandled rejection | TUZATILDI (alert); ikki marta bosish himoyasi |
| 17 | Composer vazifa: bo'sh/noto'g'ri sana | xabar | `toISOString` RangeError | TUZATILDI |
| 18 | Status tanlagich: yo'qotish sababi prompt "Bekor" | ko'chirmaslik | baribir ko'chirardi; voronka o'zgargach move xatosi holatni buzardi | TUZATILDI |
| 19 | CallNote audio blob URL | unmount'da bo'shatiladi | leak | TUZATILDI |
| 20 | Kutilgan: yangi bitim /leads/add?pipeline=.. | pipeline/birinchi ochiq bosqich | to'g'ri (kod) | OK |
| 21 | Kontakt: bog'lash/yangi/uzish/tahrirlash (kod + curl) | Saqlashda contactId | to'g'ri | OK |
| 22 | Ko'chirish API (move), vazifa yaratish, eslatma (bo'sh matn 400) | | to'g'ri | OK |

## Tuzatilmagan (boshqa soha fayllari)
| # | muammo | fayl |
|---|--------|------|
| A | Voronka/ro'yxat "Import" menyusi `/leads/import` ga olib boradi — route yo'q, `/leads/*` voronkaga yo'naltiradi | CrmApp.jsx |
| B | Filtrdagi "Boshqarish" havolasi `<a href="/settings/tags">` — route yo'q (→ general) va to'liq sahifa qayta yuklanadi | CrmApp.jsx (route) / LeadsFilter.jsx |
| C | Backend lenta matnlari faqat o'zbekcha (BUGS.md i18n/backend) — frontend faqat prefiksni tozalaydi | backend activity |
| D | Rad etish (saralanmagan) bitimni o'chiradi, tasdiqsiz | dizayn qarori, tegmadim |
| E | `tsc` scripts/seed-demo.ts da xato beradi (mening sohamdan tashqarida) | backend/scripts |

Build: `npx vite build` xatosiz. Backend `tsc` crm fayllarida xato yo'q.
Test yozuvlari (QA-TEST quick bitim, QA-TEST Kontakt) o'chirildi.
