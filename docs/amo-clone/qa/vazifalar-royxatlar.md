# QA: Vazifalar, Ro'yxatlar, kontakt/kompaniya kartochkalari, imBox

Usul: kod o'qish + curl (akmal@crm.local sotuvchi tokeni bilan; admin parol fayli o'qishga ruxsat berilmadi) + `vite build`. Brauzer ishlatilmadi (UI xatti-harakatlari kod bo'yicha tekshirildi, jonli bosib ko'rilmagan). Test yozuvlari o'chirildi.

| # | test | kutilgan | haqiqiy | holat |
|---|------|----------|---------|-------|
| 1 | POST /crm/leads/:id/tasks, title "   " | 400 | 201, bo'sh nomli vazifa yaratilardi | TUZATILDI (crm.service createTask/updateTask: trim, bo'sh va >1000 belgi rad) |
| 2 | Vazifa dueDate "garbage" | 400 | 400 BAD_DATE | OK |
| 3 | Vazifa yangilash/o'chirish mavjud bo'lmagan id | 404 | 404 | OK |
| 4 | Vazifa: drag bilan boshqa kunga ko'chirish, vaqt saqlanishi | soat:daqiqa saqlanadi | saqlanadi (setHours old). O'sha kunga tashlash keraksiz so'rov yuborardi | TUZATILDI (bir kunga tashlash e'tiborsiz) |
| 5 | Drag/bajarish/o'chirish so'rovi xato bersa | foydalanuvchi xatoni ko'radi, UI qaytadi | jim unhandled rejection, optimistik holat qolardi | TUZATILDI (banner + reload) |
| 6 | Bajarish modali xato bersa | modal ochiq, xato matni | modal yopilmasdi, xato ko'rinmasdi; ikki marta bosish mumkin | TUZATILDI |
| 7 | Qo'shish modali: sana bo'sh | xato matni | `toISOString` RangeError "Invalid time value" | TUZATILDI (Muddatni kiriting) |
| 8 | Qo'shish modali: bitim qidiruvi ro'yxati | tashqariga bosganda yopiladi | doim ochiq qolardi | TUZATILDI (blur) |
| 9 | Qo'shish modali xato matni | t() orqali | `'Error'` qattiq yozilgan | TUZATILDI |
| 10 | Vazifa o'chirish trash ikonasi | tasdiq so'raladi | darrov o'chirardi | TUZATILDI (confirm) |
| 11 | Yuklanish/xato holati (tasklar) | spinner / xato | bo'sh sahifa | TUZATILDI |
| 12 | Kalendar "bugun" katagi, yorug' mavzu | o'qiladi | qattiq `#284e7d` fon (qora matn ustida) | TUZATILDI (--palette-tasks-date-today-element) |
| 13 | Ro'yxat: "Mas'ul" ustuni | customJson._assigneeId | faqat createdById ko'rsatilardi (kartochkada tanlangan mas'ul ko'rinmasdi) | TUZATILDI (custom._assigneeId, zaxira createdById; filtr va "Faqat mening" ham) |
| 14 | Ro'yxat: telefon filtri "99890" vs "+998 90.." | topiladi | formatga bog'liq edi | TUZATILDI (raqamlar bo'yicha, qo'shimcha telefonlar ham) |
| 15 | CSV: UTF-8 BOM, ruscha/o'zbekcha belgilar | BOM bor | BOM bor (literal U+FEFF) | OK, '﻿' ga aniq yozildi |
| 16 | CSV: `=`,`@` bilan boshlanuvchi qiymat | formula ishlamaydi | himoya yo'q edi; satr ajratgich `\n` | TUZATILDI (' prefiks, telefon "+998.." buzilmaydi; `\r\n`; revoke kechiktirildi) |
| 17 | Ommaviy o'chirish, ba'zilari xato | foydalanuvchi biladi | xatolar jim yutilardi | TUZATILDI (alert son bilan) |
| 18 | Ro'yxat menyusi "Import" | sahifa ochiladi | /contacts/import route yo'q -> dashboard'ga qaytadi | TUZATILDI (band olib tashlandi); route CrmApp.jsx'da yo'q — ilova darajasida hal qilinishi kerak |
| 19 | Ro'yxat yuklash xatosi | xato matni | cheksiz spinner | TUZATILDI |
| 20 | Kartochka: o'chirishdan keyin navigatsiya | /contacts/list | navigate('/contacts') -> route yo'q -> dashboard | TUZATILDI |
| 21 | Kartochka: mavjud bo'lmagan id | "topilmadi" | cheksiz spinner | TUZATILDI |
| 22 | Kartochka: saqlash/uzish/bog'lash/bitim qo'shish xatosi | xato banneri | unhandled rejection | TUZATILDI (guard + ac-ec-err) |
| 23 | Kartochka: noto'g'ri email, bo'sh nom (tahrir) | rad etiladi | server'ga ketardi, bo'sh nom saqlanardi | TUZATILDI (frontend + backend 400) |
| 24 | Qo'shimcha telefonlar: bo'sh maydonlar | saqlanmaydi | bo'sh qatorlar customJson'da qolardi | TUZATILDI (tozalanadi) |
| 25 | Lentada "Bitim #" havolasi raqami | LeadCard sarlavhasi (#slice(-8)) bilan bir xil | slice(-6) | TUZATILDI |
| 26 | "+ Bitim qo'shish" ikki marta bosish | bitta bitim | dublikat bitim mumkin edi | TUZATILDI (busy) |
| 27 | Lenta yuklanishi poyga (id almashganda) | eski natija yozilmaydi | yozilardi | TUZATILDI (seq) |
| 28 | PUT/DELETE /crm/contacts|companies/:id mavjud bo'lmagan id | 404 | 500 INTERNAL_ERROR | TUZATILDI (contacts.service) |
| 29 | POST /crm/contacts companyId mavjud emas | 404 | 201 (osilgan havola) | TUZATILDI |
| 30 | Kontakt/kompaniya nomi 5000 belgi, bo'sh nom bilan yangilash | 400 | 201 / bo'sh nom | TUZATILDI (<=255, tahrirda majburiy) |
| 31 | Kompaniya qidiruvi telefon bo'yicha | topiladi | faqat nom | TUZATILDI |
| 32 | Kompaniya o'chirilganda kontakt/bitim companyId tozalanadi | tozalanadi | tozalanadi | OK |
| 33 | imBox: status dropdown "yo'qotilgan" da prompt Bekor | holat o'zgarmaydi | Bekor bosilsa ham bitim yopilardi | TUZATILDI |
| 34 | imBox: yuborish/eslatma/status xatosi | xato ko'rinadi | jim unhandled | TUZATILDI (ac-imbox-err) |
| 35 | imBox: /imbox/:leadId mavjud emas | "Bitim topilmadi" | cheksiz spinner | TUZATILDI |
| 36 | imBox: xabar yuborilgach chap ro'yxat | yangilanadi | 15s gacha eskirgan | TUZATILDI (onChanged) |
| 37 | imBox: suhbatlar bo'sh (Telegram ulangan) | bo'sh holat matni | hech narsa | TUZATILDI ("Suhbatlar yo'q") |
| 38 | imBox: 15s interval tozalanadi | clearInterval | list va Conversation'da cleanup bor; unmount'dan keyin setState himoyasi qo'shildi | OK |
| 39 | imBox: POST messages lidda Telegram yo'q | 400 NO_CHAT, UI faqat "Eslatma" rejimi | shunday | OK |
| 40 | Ranglar: lists.css/entitycard.css `#1691ff`, kartochkadagi inline | --palette-link-primary | qattiq | TUZATILDI |
| 41 | i18n: barcha t() kalitlari ruscha lug'atda | bor | yetishmaydigan kalit yo'q (skript bilan tekshirildi); yangi kalitlar qo'shildi | OK |
| 42 | Hisoblagich (TopBar count) va qidiruv (vazifalar) | filtrlangan son | to'g'ri | OK |

## Tuzatilmay qolganlar / eslatmalar
- Sana/vaqt brauzer mintaqasida (format.js `hm`, `setHours`) ko'rsatiladi; UTC+5 bo'lmagan brauzerda vaqt siljiydi. format.js umumiy fayl — tegilmadi. UTC+5 brauzerda drag vaqtni saqlaydi (DST yo'q).
- /contacts/import marshruti yo'q (CrmApp.jsx, umumiy). Hozircha menyu bandi olib tashlandi.
- Ro'yxat backend'i `take: 200` (kontakt/kompaniya) — 200 dan ortig'i ko'rinmaydi; cheksiz scroll faqat mijoz tomonida. Pagination backend o'zgarishini talab qiladi (minimal doirada qilinmadi).
- Kartochka lentasi barcha bitimlarni `listLeads({})` bilan yuklab mijozda filtrlaydi (katta bazada sekin); backend `contactId` filtri qo'shilsa yaxshi.
- LeadCard.jsx (boshqa soha): `SysLine` faqat `link` prop'ini bitta qatorga qo'yadi; TaskNote ichida `Enter` bilan natija yuborilganda trim qilinmaydi (kichik).
- Admin tokeni bilan ruxsatlar testi o'tkazilmadi (parol fayliga kirish rad etildi); faqat sotuvchi (akmal) bilan.
- Jonli brauzer testi o'tkazilmadi (brief bo'yicha band).

## O'zgargan fayllar
frontend/src/amo/pages/TasksPage.jsx, TasksModals.jsx, ListsPage.jsx, ContactCard.jsx, ImboxPage.jsx;
frontend/src/amo/todo.css, lists.css, entitycard.css, imbox.css;
frontend/src/amo/i18n/todo.ru.js, lists.ru.js, entitycard.ru.js, imbox.ru.js;
backend/src/crm/crm.service.ts (createTask/updateTask), backend/src/crm/contacts.service.ts.
