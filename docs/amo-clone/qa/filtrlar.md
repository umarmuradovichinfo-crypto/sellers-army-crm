# Bitimlar filtrlari, saralash va statistika — QA (psql <-> API <-> UI)

Sana: 2026-10-24. Baza: `sellers_crm_dev` (demo + QA-TEST yozuvlari; oxirida o'chirildi). Biznes vaqti: Asia/Tashkent (UTC+5).

## Usul
- Har tekshiruvda **kutilgan natija psql bilan to'g'ridan-to'g'ri** (`leads` jadvaliga mustaqil SQL, `date_trunc`/`AT TIME ZONE`, `EXISTS`, `jsonb`) hisoblandi.
  Backend kodidagi SQL qayta ishlatilmadi — shartlar alohida yozilgan.
- API: `GET /crm/leads?limit=200` (id to'plami + `total` + `totalSum` bir xil bo'lishi shart), `/crm/pipeline`, `/crm/pipeline/stage-leads`, `/crm/unsorted`,
  `/crm/analytics`, `/crm/analytics/timeline`, `/crm/analytics/employees`, `/crm/leads-export`, `POST /crm/leads/bulk` (all+filter), `/crm/leads-duplicates`, `/crm/card-layout`, `/crm/filters`.
- UI: headless Chrome (CDP) bilan `/leads/pipeline?...` URL'lari ochilib, ustun sarlavhalari ("N bitim: SUMMA"), "Saralanmagan: So'rovlar N" va yuqori hisoblagich o'qildi va psql bilan solishtirildi.
- Test ma'lumotlar: `QA-TEST ...` nomli 17 ta bitim (turli sana, bosqich, mas'ul, UTM, maxsus maydonlar, vazifalar, faoliyat, xabarlar), 6 ta `qa_*` maxsus maydon (select, multiselect, text, number, date, checkbox),
  3 kontakt + 1 kompaniya. Ular demo bitimlar (62 ta) bilan aralash holda tekshirildi (jami 79 ta). Test oxirida hammasi o'chirildi.
- Skriptlar: `qa_setup.sql`, `qa_run.py`, `qa_ui.py`, `qa_cleanup.sql` (vaqtinchalik papkada; hisobotga kiritilmagan).

## Xulosa
| Guruh | Tekshiruv soni | OK |
|---|---|---|
| Preset | 8 | 8 |
| Nom | 4 | 4 |
| Sana (yaratilgan) | 13 | 13 |
| Sana (yopilgan) | 6 | 6 |
| Sana (yangilangan) | 1 | 1 |
| Sana (maxsus maydon) | 5 | 5 |
| Bosqich | 7 | 7 |
| Rad etish sababi | 3 | 3 |
| Saralanmagan kategoriya | 5 | 5 |
| Manba | 4 | 4 |
| Mas'ul | 5 | 5 |
| Yaratgan | 2 | 2 |
| O'zgartirgan | 3 | 3 |
| Vazifalar | 9 | 9 |
| Byudjet | 3 | 3 |
| E'tibor talab | 3 | 3 |
| Teglar | 2 | 2 |
| Maxsus maydon | 18 | 18 |
| UTM | 5 | 5 |
| Kontakt/kompaniya | 8 | 8 |
| Kombinatsiya | 4 | 4 |
| Saralash | 16 | 16 |
| Voronka statistikasi | 9 | 9 |
| Voronka ustuni (stage-leads) | 6 | 6 |
| Saralanmagan ustuni | 4 | 4 |
| Analitika (overview) | 13 | 13 |
| Analitika (timeline) | 4 | 4 |
| Analitika (employees) | 3 | 3 |
| Eksport (CSV) | 3 | 3 |
| Ommaviy amal (all+filter) | 4 | 4 |
| Dublikatlar | 3 | 3 |
| Karta ko'rinishi | 1 | 1 |
| Ro'yxat ustunlari | 1 | 1 |
| Saqlangan filtr | 1 | 1 |
| UTM yozilishi | 2 | 2 |
| Dublikat birlashtirish | 1 | 1 |
| Xavfsizlik/validatsiya | 3 | 3 |
| UI sarlavhalar/hisoblagich (headless Chrome) | 64 | 64 |
| Facebook lid -> utm (createExternalLead, qo'lda) | 1 | 1 |

API: **192 ta tekshiruv, hammasi OK**; UI: **64 ta, hammasi OK**.

## Topilgan va tuzatilgan nomuvofiqliklar
1. **Analitika timeline** — kunlik/haftalik bucket kaliti server vaqt zonasi bo'yicha hisoblanib, UTC+5 da bitim bir kun oldinga siljib ketardi
   (psql bilan kunma-kun solishtirishda 4 ta timeline testi yiqildi). Endi bucket biznes vaqti (UTC+5) bo'yicha; haftalik bucket — dushanba.
2. **Analitika overview/employees davr chegarasi** — `to` server vaqtida `T23:59:59` edi; endi barcha filtrlar bilan bir xil parser (`list-query.ts`) va biznes kuni chegarasi.
3. **Filtr paneli teg soni** — frontend `count` maydonini o'qirdi, backend `usage` qaytaradi (teg soni ko'rinmasdi) — tuzatildi.
4. **Filtr paneli maydonlari** — `.ac-top__search input` qoidalari (flex:1; height:100%; border:0) panel ichidagi maydonlarga o'tib, input/checkbox'lar cho'zilib ketardi (UI skrinshotida aniqlandi) — `leads.css`da bekor qilindi.
5. **"…" menyu submenyusi** — kursor kirganda ochilib, bosganda yopilib qolardi (toggle) — tuzatildi.
6. **Eksport** — `window.open('/api/v1/crm/leads-export')` Authorization sarlavhasisiz edi va filtrni olmasdi; endi `getBlob` bilan (auth) va filtr/saralash parametrlari bilan.
7. Eski "Dublikatlarni qidirish" `?duplicates=1` havolasi hech narsa qilmasdi — endi `/leads/duplicates` sahifasi.

## Qabul qilingan semantika (amoCRM bilan farq bo'lishi mumkin joylar)
- `quarter` = joriy kalendar chorak; `this_week` = dushanba-yakshanba; barcha sana chegaralari UTC+5.
- `dateField=closed` = `coalesce(wonAt, lostAt)`; `updated` = `updatedAt`; maxsus sana maydoni — `customJson` ichidagi `YYYY-MM-DD` matni sana qismi bo'yicha.
- `tasks`: `today|tomorrow|week|month|quarter` — shu oraliqda muddati bor OCHIQ vazifa (muddati o'tganlar `failed_tasks`); bir nechta qiymat YOKI.
- `attention=yes` = ochiq bosqichdagi (saralanmagan emas) bitim va (muddati o'tgan ochiq vazifa YOKI `coalesce(lastActivityAt, updatedAt, createdAt)` 7 kundan eski). `no` = `yes`ning inkori (yopilgan bitimlar ham "yo'q"), `ignore` = e'tiborga olinmaydi.
- `updatedByIds` = bitimdagi OXIRGI faoliyat (`crm_activities`) bajaruvchisi (amoCRM "Кем изменена" kabi, har qanday faoliyat emas).
- `stages`: `pipelineId:stageKey` (asosiy voronka `main:key`), `unsorted`, `won|lost|open` (shu turdagi hamma bosqich); tanlanganlar YOKI; oddiy bosqich saralanmagan emas.
- `lostReasons=none` = yo'qotilgan bosqichdagi, sababi bo'sh bitimlar. `sources=none` = manbasiz.
- `unsortedCategory` faqat `unsorted=true` bitimlarda, `Lead.source`/`formId` bo'yicha: phone (qo'ng'iroq/telefon), chat (telegram/instagram/whatsapp/chat), form (formId yoki forma/sayt/web/facebook/meta/google), import.
- `cf` turlari: select/multiselect (+`empty`), text (contains), number (from/to), date (preset yoki from/to), checkbox (yes/no). `utm`: kalit bo'yicha contains (AND).
- Kontakt/kompaniya filtrlari: bitimning asosiy kontakti (`contactId`) va kompaniyasi; telefon/email bitimning o'z maydonida ham qidiriladi.
- Saralash: `last_message` = `crm_messages` eng so'nggi xabar; `last_event` = eng so'nggi `crm_activities` (yo'q bo'lsa `updatedAt`); bo'shlar oxirida (NULLS LAST).

## Natijalar: API <-> psql
| # | Guruh | Tekshiruv | psql (kutilgan: soni / summa) | API | Natija |
|---|---|---|---|---|---|
| 1 | Preset | open | 57 / 644043900 | 57 / 644043900 | OK |
| 2 | Preset | mine (admin) | 15 / 220500000 | 15 / 220500000 | OK |
| 3 | Preset | won | 15 / 299016000 | 15 / 299016000 | OK |
| 4 | Preset | lost | 7 / 44503100 | 7 / 44503100 | OK |
| 5 | Preset | notask (vazifasiz) | 20 / 75003500 | 20 / 75003500 | OK |
| 6 | Preset | overdue (muddati o'tgan) | 9 / 99505000 | 9 / 99505000 | OK |
| 7 | Preset | attention (e'tibor) | 10 / 99505000 | 10 / 99505000 | OK |
| 8 | Preset | hammasi (filtrsiz) | 79 / 987563000 | 79 / 987563000 | OK |
| 9 | Nom | name=Bitim 0 | 8 / 38600 | 8 / 38600 | OK |
| 10 | Nom | search=QA-TEST Unsorted | 4 / 0 | 4 / 0 | OK |
| 11 | Nom | search=kontakt nomi (Kontakt Ikki) | 1 / 5000 | 1 / 5000 | OK |
| 12 | Nom | search=telefon raqami 777 66 | 2 / 0 | 2 / 0 | OK |
| 13 | Sana (yaratilgan) | datePreset=all | 79 / 987563000 | 79 / 987563000 | OK |
| 14 | Sana (yaratilgan) | datePreset=today | 9 / 1000 | 9 / 1000 | OK |
| 15 | Sana (yaratilgan) | datePreset=yesterday | 2 / 5000 | 2 / 5000 | OK |
| 16 | Sana (yaratilgan) | datePreset=this_week | 22 / 46541400 | 22 / 46541400 | OK |
| 17 | Sana (yaratilgan) | datePreset=last_week | 8 / 99000000 | 8 / 99000000 | OK |
| 18 | Sana (yaratilgan) | datePreset=this_month | 47 / 499544400 | 47 / 499544400 | OK |
| 19 | Sana (yaratilgan) | datePreset=last_month | 30 / 488007100 | 30 / 488007100 | OK |
| 20 | Sana (yaratilgan) | datePreset=quarter | 47 / 499544400 | 47 / 499544400 | OK |
| 21 | Sana (yaratilgan) | datePreset=this_year | 78 / 987554000 | 78 / 987554000 | OK |
| 22 | Sana (yaratilgan) | dateField=created from/to oraliq | 15 / 320003000 | 15 / 320003000 | OK |
| 23 | Sana (yaratilgan) | faqat from | 20 / 46521400 | 20 / 46521400 | OK |
| 24 | Sana (yaratilgan) | faqat to | 20 / 204518600 | 20 / 204518600 | OK |
| 25 | Sana (yaratilgan) | legacy period=today | 9 / 1000 | 9 / 1000 | OK |
| 26 | Sana (yopilgan) | dateField=closed datePreset=today | 1 / 100 | 1 / 100 | OK |
| 27 | Sana (yopilgan) | dateField=closed datePreset=this_month | 20 / 343503100 | 20 / 343503100 | OK |
| 28 | Sana (yopilgan) | dateField=closed datePreset=last_month | 1 / 7000 | 1 / 7000 | OK |
| 29 | Sana (yopilgan) | dateField=closed datePreset=quarter | 20 / 343503100 | 20 / 343503100 | OK |
| 30 | Sana (yopilgan) | dateField=closed datePreset=this_year | 21 / 343510100 | 21 / 343510100 | OK |
| 31 | Sana (yopilgan) | closed from/to | 21 / 343510100 | 21 / 343510100 | OK |
| 32 | Sana (yangilangan) | dateField=updated today | 68 / 987501100 | 68 / 987501100 | OK |
| 33 | Sana (maxsus maydon) | dateField=qa_date datePreset=today | 1 / 1000 | 1 / 1000 | OK |
| 34 | Sana (maxsus maydon) | dateField=qa_date datePreset=yesterday | 1 / 5000 | 1 / 5000 | OK |
| 35 | Sana (maxsus maydon) | dateField=qa_date datePreset=last_month | 1 / 15000 | 1 / 15000 | OK |
| 36 | Sana (maxsus maydon) | dateField=qa_date datePreset=this_month | 2 / 6000 | 2 / 6000 | OK |
| 37 | Sana (maxsus maydon) | qa_date from/to | 2 / 6000 | 2 / 6000 | OK |
| 38 | Bosqich | stages=main:new | 6 / 24001400 | 6 / 24001400 | OK |
| 39 | Bosqich | stages=unsorted | 9 / 0 | 9 / 0 | OK |
| 40 | Bosqich | stages=won (barcha voronkalar) | 15 / 299016000 | 15 / 299016000 | OK |
| 41 | Bosqich | stages=lost | 7 / 44503100 | 7 / 44503100 | OK |
| 42 | Bosqich | stages=kurs_new + main:contact (YOKI) | 10 / 172007500 | 10 / 172007500 | OK |
| 43 | Bosqich | stages=main:new,unsorted | 15 / 24001400 | 15 / 24001400 | OK |
| 44 | Bosqich | pipelineId=KURS (voronka) | 22 / 119011500 | 22 / 119011500 | OK |
| 45 | Rad etish sababi | lostReasons=Narx qimmat | 2 / 7003000 | 2 / 7003000 | OK |
| 46 | Rad etish sababi | lostReasons=none (Sababsiz) | 1 / 100 | 1 / 100 | OK |
| 47 | Rad etish sababi | Raqobatchini tanladi + none | 4 / 28000100 | 4 / 28000100 | OK |
| 48 | Saralanmagan kategoriya | phone | 1 / 0 | 1 / 0 | OK |
| 49 | Saralanmagan kategoriya | chat | 4 / 0 | 4 / 0 | OK |
| 50 | Saralanmagan kategoriya | form | 3 / 0 | 3 / 0 | OK |
| 51 | Saralanmagan kategoriya | import | 1 / 0 | 1 / 0 | OK |
| 52 | Saralanmagan kategoriya | phone+chat | 5 / 0 | 5 / 0 | OK |
| 53 | Manba | sources=QA-Src-A | 7 / 24500 | 7 / 24500 | OK |
| 54 | Manba | sources=Telegram,Instagram | 23 / 399500000 | 23 / 399500000 | OK |
| 55 | Manba | sources=none (manbasiz) | 2 / 500 | 2 / 500 | OK |
| 56 | Manba | sources=Meta Ads,none | 9 / 69500500 | 9 / 69500500 | OK |
| 57 | Mas'ul | assigneeIds=B | 19 / 266043400 | 19 / 266043400 | OK |
| 58 | Mas'ul | assigneeIds=B,C | 31 / 471051400 | 31 / 471051400 | OK |
| 59 | Mas'ul | assigneeIds=none | 12 / 0 | 12 / 0 | OK |
| 60 | Mas'ul | assigneeIds=D,none | 23 / 86011600 | 23 / 86011600 | OK |
| 61 | Mas'ul | legacy assigneeId=C | 12 / 205008000 | 12 / 205008000 | OK |
| 62 | Yaratgan | createdByIds=A | 58 / 987504000 | 58 / 987504000 | OK |
| 63 | Yaratgan | createdByIds=B,C | 4 / 47000 | 4 / 47000 | OK |
| 64 | O'zgartirgan | updatedByIds=D (oxirgi faoliyat) | 2 / 35000 | 2 / 35000 | OK |
| 65 | O'zgartirgan | updatedByIds=B | 1 / 1000 | 1 / 1000 | OK |
| 66 | O'zgartirgan | updatedByIds=A,C | 29 / 444005000 | 29 / 444005000 | OK |
| 67 | Vazifalar | tasks=today | 13 / 213015000 | 13 / 213015000 | OK |
| 68 | Vazifalar | tasks=tomorrow | 5 / 90520000 | 5 / 90520000 | OK |
| 69 | Vazifalar | tasks=week | 27 / 403040000 | 27 / 403040000 | OK |
| 70 | Vazifalar | tasks=month | 36 / 569040000 | 36 / 569040000 | OK |
| 71 | Vazifalar | tasks=quarter | 36 / 569040000 | 36 / 569040000 | OK |
| 72 | Vazifalar | tasks=no_tasks | 42 / 418522600 | 42 / 418522600 | OK |
| 73 | Vazifalar | tasks=failed_tasks | 9 / 99505000 | 9 / 99505000 | OK |
| 74 | Vazifalar | tasks=today,failed_tasks (YOKI) | 22 / 312520000 | 22 / 312520000 | OK |
| 75 | Vazifalar | legacy task=overdue | 9 / 99505000 | 9 / 99505000 | OK |
| 76 | Byudjet | budgetFrom=5000 | 61 / 987556000 | 61 / 987556000 | OK |
| 77 | Byudjet | budgetTo=3000 | 18 / 7000 | 18 / 7000 | OK |
| 78 | Byudjet | budgetFrom=1000 & budgetTo=7000 | 5 / 18500 | 5 / 18500 | OK |
| 79 | E'tibor talab | attention=yes | 10 / 99505000 | 10 / 99505000 | OK |
| 80 | E'tibor talab | attention=no | 69 / 888058000 | 69 / 888058000 | OK |
| 81 | E'tibor talab | attention=ignore | 79 / 987563000 | 79 / 987563000 | OK |
| 82 | Teglar | tags=qa-a | 2 / 6000 | 2 / 6000 | OK |
| 83 | Teglar | tags=qa-a,qa-b (AND) | 1 / 5000 | 1 / 5000 | OK |
| 84 | Maxsus maydon | select=opt1 | 2 / 16000 | 2 / 16000 | OK |
| 85 | Maxsus maydon | select=opt1,opt2 | 3 / 21000 | 3 / 21000 | OK |
| 86 | Maxsus maydon | select=empty | 76 / 987542000 | 76 / 987542000 | OK |
| 87 | Maxsus maydon | select=opt3,empty | 76 / 987542000 | 76 / 987542000 | OK |
| 88 | Maxsus maydon | multiselect=m2 | 2 / 6000 | 2 / 6000 | OK |
| 89 | Maxsus maydon | multiselect=m1,m3 (YOKI) | 1 / 1000 | 1 / 1000 | OK |
| 90 | Maxsus maydon | multiselect=empty | 77 / 987557000 | 77 / 987557000 | OK |
| 91 | Maxsus maydon | text contains "ell" | 1 / 1000 | 1 / 1000 | OK |
| 92 | Maxsus maydon | number 15..25 | 1 / 5000 | 1 / 5000 | OK |
| 93 | Maxsus maydon | number from 25 | 1 / 15000 | 1 / 15000 | OK |
| 94 | Maxsus maydon | date preset=today | 1 / 1000 | 1 / 1000 | OK |
| 95 | Maxsus maydon | date preset=last_month | 1 / 15000 | 1 / 15000 | OK |
| 96 | Maxsus maydon | date oraliq | 2 / 6000 | 2 / 6000 | OK |
| 97 | Maxsus maydon | checkbox=yes | 1 / 1000 | 1 / 1000 | OK |
| 98 | Maxsus maydon | checkbox=no | 78 / 987562000 | 78 / 987562000 | OK |
| 99 | Maxsus maydon | yassi cf[qa_select]=opt2 (querystring uslubi) | 1 / 5000 | 1 / 5000 | OK |
| 100 | Maxsus maydon | yassi cf[qa_num][from]=15&[to]=25 | 1 / 5000 | 1 / 5000 | OK |
| 101 | Maxsus maydon | ikki maydon (select=opt1 & num>=20) | 1 / 15000 | 1 / 15000 | OK |
| 102 | UTM | utm_source contains "goo" | 1 / 1000 | 1 / 1000 | OK |
| 103 | UTM | utm_medium=cpc | 1 / 15000 | 1 / 15000 | OK |
| 104 | UTM | gclid=abc | 1 / 15000 | 1 / 15000 | OK |
| 105 | UTM | yassi utm[utm_campaign]=spr | 1 / 1000 | 1 / 1000 | OK |
| 106 | UTM | utm_source=facebook & utm_campaign (AND, natija 0) | 0 / 0 | 0 / 0 | OK |
| 107 | Kontakt/kompaniya | contactName=Bir | 1 / 1000 | 1 / 1000 | OK |
| 108 | Kontakt/kompaniya | contactPhone=901110002 | 1 / 5000 | 1 / 5000 | OK |
| 109 | Kontakt/kompaniya | contactPhone=+998 90 777 (lid telefoni) | 2 / 0 | 2 / 0 | OK |
| 110 | Kontakt/kompaniya | contactEmail=k1@ | 1 / 1000 | 1 / 1000 | OK |
| 111 | Kontakt/kompaniya | contactEmail=dup@ (lid emaili) | 2 / 0 | 2 / 0 | OK |
| 112 | Kontakt/kompaniya | contactPosition=Direktor | 5 / 96001000 | 5 / 96001000 | OK |
| 113 | Kontakt/kompaniya | companyName=QA-TEST Komp (entitet + kontakt kompaniyasi) | 2 / 6000 | 2 / 6000 | OK |
| 114 | Kontakt/kompaniya | companyName=Own (lid matn maydoni) | 1 / 20000 | 1 / 20000 | OK |
| 115 | Kombinatsiya | open + assigneeIds=B + budgetFrom=1000 | 12 / 138536000 | 12 / 138536000 | OK |
| 116 | Kombinatsiya | this_month + sources=QA-Src-A,QA-Src-B + attention=no | 6 / 39000 | 6 / 39000 | OK |
| 117 | Kombinatsiya | cf select + tasks + tags + utm | 1 / 15000 | 1 / 15000 | OK |
| 118 | Kombinatsiya | stages kurs + dateField closed + lostReasons | 3 / 25500000 | 3 / 25500000 | OK |
| 119 | Saralash | sort=last_message desc | 79 ta tartib | 79 ta tartib | OK |
| 120 | Saralash | sort=last_event desc | 79 ta tartib | 79 ta tartib | OK |
| 121 | Saralash | sort=createdAt desc | 79 ta tartib | 79 ta tartib | OK |
| 122 | Saralash | sort=name desc | 79 ta tartib | 79 ta tartib | OK |
| 123 | Saralash | sort=value desc | 79 ta tartib | 79 ta tartib | OK |
| 124 | Saralash | sort=closedAt desc | 79 ta tartib | 79 ta tartib | OK |
| 125 | Saralash | sort=cf:qa_num desc | 79 ta tartib | 79 ta tartib | OK |
| 126 | Saralash | sort=source desc | 79 ta tartib | 79 ta tartib | OK |
| 127 | Saralash | sort=last_message asc | 79 ta tartib | 79 ta tartib | OK |
| 128 | Saralash | sort=last_event asc | 79 ta tartib | 79 ta tartib | OK |
| 129 | Saralash | sort=createdAt asc | 79 ta tartib | 79 ta tartib | OK |
| 130 | Saralash | sort=name asc | 79 ta tartib | 79 ta tartib | OK |
| 131 | Saralash | sort=value asc | 79 ta tartib | 79 ta tartib | OK |
| 132 | Saralash | sort=closedAt asc | 79 ta tartib | 79 ta tartib | OK |
| 133 | Saralash | sort=cf:qa_num asc | 79 ta tartib | 79 ta tartib | OK |
| 134 | Saralash | sort=source asc | 79 ta tartib | 79 ta tartib | OK |
| 135 | Voronka statistikasi | filtrsiz, asosiy voronka | 48 / 868551500 | 48 / 868551500 | OK |
| 136 | Voronka statistikasi | preset=open | 33 / 576041400 | 33 / 576041400 | OK |
| 137 | Voronka statistikasi | assigneeIds=B | 14 / 234043400 | 14 / 234043400 | OK |
| 138 | Voronka statistikasi | datePreset=this_month | 27 / 430544400 | 27 / 430544400 | OK |
| 139 | Voronka statistikasi | sources=QA-Src-A (kurs voronka) | 2 / 11500 | 2 / 11500 | OK |
| 140 | Voronka statistikasi | cf select=opt1 | 2 / 16000 | 2 / 16000 | OK |
| 141 | Voronka statistikasi | tasks=failed_tasks + budgetFrom=1000 | 4 / 75505000 | 4 / 75505000 | OK |
| 142 | Voronka statistikasi | attention=yes | 5 / 75505000 | 5 / 75505000 | OK |
| 143 | Voronka statistikasi | stages=main:new,main:contact | 14 / 192506400 | 14 / 192506400 | OK |
| 144 | Voronka ustuni (stage-leads) | new, default (queue) tartib | 6 ta | 6 ta / 2 sahifa | OK |
| 145 | Voronka ustuni (stage-leads) | new, sort=value desc | 6 ta | 6 ta / 2 sahifa | OK |
| 146 | Voronka ustuni (stage-leads) | new, sort=name asc | 6 ta | 6 ta / 2 sahifa | OK |
| 147 | Voronka ustuni (stage-leads) | new, sort=createdAt asc + assigneeIds=B | 2 ta | 2 ta / 1 sahifa | OK |
| 148 | Voronka ustuni (stage-leads) | contact, sort=last_message desc | 8 ta | 8 ta / 3 sahifa | OK |
| 149 | Voronka ustuni (stage-leads) | new, sort=last_event desc | 6 ta | 6 ta / 2 sahifa | OK |
| 150 | Saralanmagan ustuni | filtrsiz | 9 ta | 9 ta | OK |
| 151 | Saralanmagan ustuni | unsortedCategory=chat | 4 ta | 4 ta | OK |
| 152 | Saralanmagan ustuni | sources=Telegram | 4 ta | 4 ta | OK |
| 153 | Saralanmagan ustuni | stages=main:new (unsorted chiqmaydi) | 0 ta | 0 ta | OK |
| 154 | Analitika (overview) | filtrsiz | total 70, won 15/299016000 | total 70, won 15/299016000 | OK |
| 155 | Analitika (overview) | datePreset=this_month | total 38, won 7/175000000 | total 38, won 7/175000000 | OK |
| 156 | Analitika (overview) | from/to 2026-09-01..2026-09-30 | total 30, won 7/124007000 | total 30, won 7/124007000 | OK |
| 157 | Analitika (overview) | assigneeIds=B,C | total 31, won 8/180007000 | total 31, won 8/180007000 | OK |
| 158 | Analitika (overview) | userIds=B (eski parametr) | total 19, won 5/118507000 | total 19, won 5/118507000 | OK |
| 159 | Analitika (overview) | pipelineId=KURS | total 22, won 4/25509000 | total 22, won 4/25509000 | OK |
| 160 | Analitika (overview) | pipelineId=main | total 48, won 11/273507000 | total 48, won 11/273507000 | OK |
| 161 | Analitika (overview) | sources=QA-Src-A,Telegram | total 17, won 3/8016000 | total 17, won 3/8016000 | OK |
| 162 | Analitika (overview) | dateField=closed this_month | total 20, won 13/299000000 | total 20, won 13/299000000 | OK |
| 163 | Analitika (overview) | cf select=opt1 + tags=qa-a | total 1, won 0/0 | total 1, won 0/0 | OK |
| 164 | Analitika (overview) | utm_source=goo | total 1, won 0/0 | total 1, won 0/0 | OK |
| 165 | Analitika (overview) | stages=main:won,main:lost + lostReasons=Narx qimmat | total 1, won 0/0 | total 1, won 0/0 | OK |
| 166 | Analitika (overview) | tasks=failed_tasks | total 9, won 0/0 | total 9, won 0/0 | OK |
| 167 | Analitika (timeline) | filtrsiz, 2026-09-01..2026-10-24 | created 68, won 14 | created 68, won 14 | OK |
| 168 | Analitika (timeline) | assigneeIds=B | created 19, won 5 | created 19, won 5 | OK |
| 169 | Analitika (timeline) | sources=QA-Src-A | created 7, won 2 | created 7, won 2 | OK |
| 170 | Analitika (timeline) | pipelineId=KURS | created 22, won 4 | created 22, won 4 | OK |
| 171 | Analitika (employees) | filtrsiz | 6 mas'ul | 6 mas'ul | OK |
| 172 | Analitika (employees) | datePreset=this_month | 6 mas'ul | 6 mas'ul | OK |
| 173 | Analitika (employees) | sources=QA-Src-A,QA-Src-B | 4 mas'ul | 4 mas'ul | OK |
| 174 | Eksport (CSV) | filtrsiz | 79 qator | 79 qator | OK |
| 175 | Eksport (CSV) | sources=QA-Src-A | 7 qator | 7 qator | OK |
| 176 | Eksport (CSV) | cf select=opt1 + assigneeIds=B | 2 qator | 2 qator | OK |
| 177 | Ommaviy amal (all+filter) | cf select=opt1 | 2 ta | 2 ta | OK |
| 178 | Ommaviy amal (all+filter) | assigneeIds=B + budgetFrom=1000 | 4 ta | 4 ta | OK |
| 179 | Ommaviy amal (all+filter) | stages=unsorted | 4 ta | 4 ta | OK |
| 180 | Ommaviy amal (all+filter) | datePreset=today | 5 ta | 5 ta | OK |
| 181 | Dublikatlar | by=phone | 10 guruh, QA juftligi bor | 10 guruh, QA juftligi 1 | OK |
| 182 | Dublikatlar | by=email | 6 guruh, QA juftligi bor | 6 guruh, QA juftligi 1 | OK |
| 183 | Dublikatlar | by=name | 10 guruh, QA juftligi bor | 10 guruh, QA juftligi 1 | OK |
| 184 | Karta ko'rinishi | PUT/GET /crm/card-layout | fields 4 ta, AppSettingda | fields 4 ta | OK |
| 185 | Ro'yxat ustunlari | PUT/GET /crm/card-layout?kind=list | name,budget | name,budget | OK |
| 186 | Saqlangan filtr | yaratish -> ro'yxat -> o'chirish | 1 -> 0 | 1 -> 0 | OK |
| 187 | UTM yozilishi | forma yuborish (querystring + body.utm + referrer) | 7 kalit customJson'da | 7 kalit | OK |
| 188 | UTM yozilishi | yozilgan UTM bo'yicha filtr (gclid=G1) | 1 | 1 | OK |
| 189 | Dublikat birlashtirish | POST /crm/leads/merge | 2 -> 1 | 2 -> 1 | OK |
| 190 | Xavfsizlik/validatsiya | analytics from=abc -> 400 | 400 | 400 | OK |
| 191 | Xavfsizlik/validatsiya | cf kalitida SQL injection urinishi (ignor qilinadi) | jadval butun | 79 lid, status ok | OK |
| 192 | Xavfsizlik/validatsiya | utm kalitida injection | ignor | 79 | OK |

## Natijalar: voronka sarlavhalari va hisoblagich (UI <-> psql)
| # | URL (filtr holati) | Ustun / hisoblagich | psql (soni, summa) | UI sarlavhasi | Natija |
|---|---|---|---|---|---|
| 1 | `/leads/pipeline` | Saralanmagan: Заявок | 10 | 10 | OK |
| 2 | `/leads/pipeline` | YANGI SO'ROV | [5, 24001400] | [5, 24001400] | OK |
| 3 | `/leads/pipeline` | ALOQA O'RNATILDI | [8, 168505000] | [8, 168505000] | OK |
| 4 | `/leads/pipeline` | EHTIYOJ ANIQLANDI | [6, 137500000] | [6, 137500000] | OK |
| 5 | `/leads/pipeline` | TAKLIF YUBORILDI | [7, 143020000] | [7, 143020000] | OK |
| 6 | `/leads/pipeline` | MUZOKARALAR | [6, 103015000] | [6, 103015000] | OK |
| 7 | `/leads/pipeline` | YUQORI HISOBLAGICH | [32, 576041400] | [32, 576041400] | OK |
| 8 | `/leads/pipeline?preset=open&assigneeIds=cmvmcc7d20000ngd4j4b8cuoz` | YANGI SO'ROV | [2, 1400] | [2, 1400] | OK |
| 9 | `/leads/pipeline?preset=open&assigneeIds=cmvmcc7d20000ngd4j4b8cuoz` | ALOQA O'RNATILDI | [2, 52500000] | [2, 52500000] | OK |
| 10 | `/leads/pipeline?preset=open&assigneeIds=cmvmcc7d20000ngd4j4b8cuoz` | EHTIYOJ ANIQLANDI | [0, 0] | [0, 0] | OK |
| 11 | `/leads/pipeline?preset=open&assigneeIds=cmvmcc7d20000ngd4j4b8cuoz` | TAKLIF YUBORILDI | [3, 44020000] | [3, 44020000] | OK |
| 12 | `/leads/pipeline?preset=open&assigneeIds=cmvmcc7d20000ngd4j4b8cuoz` | MUZOKARALAR | [3, 27015000] | [3, 27015000] | OK |
| 13 | `/leads/pipeline?preset=open&assigneeIds=cmvmcc7d20000ngd4j4b8cuoz` | YUQORI HISOBLAGICH | [10, 123536400] | [10, 123536400] | OK |
| 14 | `/leads/pipeline?preset=&datePreset=this_month` | Saralanmagan: Заявок | 10 | 10 | OK |
| 15 | `/leads/pipeline?preset=&datePreset=this_month` | YANGI SO'ROV | [5, 24001400] | [5, 24001400] | OK |
| 16 | `/leads/pipeline?preset=&datePreset=this_month` | ALOQA O'RNATILDI | [4, 64005000] | [4, 64005000] | OK |
| 17 | `/leads/pipeline?preset=&datePreset=this_month` | EHTIYOJ ANIQLANDI | [4, 66000000] | [4, 66000000] | OK |
| 18 | `/leads/pipeline?preset=&datePreset=this_month` | TAKLIF YUBORILDI | [4, 70520000] | [4, 70520000] | OK |
| 19 | `/leads/pipeline?preset=&datePreset=this_month` | MUZOKARALAR | [3, 48515000] | [3, 48515000] | OK |
| 20 | `/leads/pipeline?preset=&datePreset=this_month` | YUQORI HISOBLAGICH | [20, 273041400] | [20, 273041400] | OK |
| 21 | `/leads/pipeline?preset=&cf=%7B%22qa_select%22%3A%5B%22opt1%22%5D%7D` | YANGI SO'ROV | [1, 1000] | [1, 1000] | OK |
| 22 | `/leads/pipeline?preset=&cf=%7B%22qa_select%22%3A%5B%22opt1%22%5D%7D` | ALOQA O'RNATILDI | [0, 0] | [0, 0] | OK |
| 23 | `/leads/pipeline?preset=&cf=%7B%22qa_select%22%3A%5B%22opt1%22%5D%7D` | EHTIYOJ ANIQLANDI | [0, 0] | [0, 0] | OK |
| 24 | `/leads/pipeline?preset=&cf=%7B%22qa_select%22%3A%5B%22opt1%22%5D%7D` | TAKLIF YUBORILDI | [0, 0] | [0, 0] | OK |
| 25 | `/leads/pipeline?preset=&cf=%7B%22qa_select%22%3A%5B%22opt1%22%5D%7D` | MUZOKARALAR | [1, 15000] | [1, 15000] | OK |
| 26 | `/leads/pipeline?preset=&cf=%7B%22qa_select%22%3A%5B%22opt1%22%5D%7D` | YUQORI HISOBLAGICH | [2, 16000] | [2, 16000] | OK |
| 27 | `/leads/pipeline?preset=overdue` | YANGI SO'ROV | [0, 0] | [0, 0] | OK |
| 28 | `/leads/pipeline?preset=overdue` | ALOQA O'RNATILDI | [1, 5000] | [1, 5000] | OK |
| 29 | `/leads/pipeline?preset=overdue` | EHTIYOJ ANIQLANDI | [1, 21500000] | [1, 21500000] | OK |
| 30 | `/leads/pipeline?preset=overdue` | TAKLIF YUBORILDI | [1, 26500000] | [1, 26500000] | OK |
| 31 | `/leads/pipeline?preset=overdue` | MUZOKARALAR | [1, 27500000] | [1, 27500000] | OK |
| 32 | `/leads/pipeline?preset=overdue` | YUQORI HISOBLAGICH | [4, 75505000] | [4, 75505000] | OK |
| 33 | `/leads/pipeline?preset=&tasks=failed_tasks,today&budgetFrom=1000` | YANGI SO'ROV | [1, 24000000] | [1, 24000000] | OK |
| 34 | `/leads/pipeline?preset=&tasks=failed_tasks,today&budgetFrom=1000` | ALOQA O'RNATILDI | [3, 41505000] | [3, 41505000] | OK |
| 35 | `/leads/pipeline?preset=&tasks=failed_tasks,today&budgetFrom=1000` | EHTIYOJ ANIQLANDI | [4, 102000000] | [4, 102000000] | OK |
| 36 | `/leads/pipeline?preset=&tasks=failed_tasks,today&budgetFrom=1000` | TAKLIF YUBORILDI | [3, 70500000] | [3, 70500000] | OK |
| 37 | `/leads/pipeline?preset=&tasks=failed_tasks,today&budgetFrom=1000` | MUZOKARALAR | [3, 44515000] | [3, 44515000] | OK |
| 38 | `/leads/pipeline?preset=&tasks=failed_tasks,today&budgetFrom=1000` | YUQORI HISOBLAGICH | [14, 282520000] | [14, 282520000] | OK |
| 39 | `/leads/pipeline?preset=&attention=yes` | YANGI SO'ROV | [0, 0] | [0, 0] | OK |
| 40 | `/leads/pipeline?preset=&attention=yes` | ALOQA O'RNATILDI | [1, 5000] | [1, 5000] | OK |
| 41 | `/leads/pipeline?preset=&attention=yes` | EHTIYOJ ANIQLANDI | [2, 21500000] | [2, 21500000] | OK |
| 42 | `/leads/pipeline?preset=&attention=yes` | TAKLIF YUBORILDI | [1, 26500000] | [1, 26500000] | OK |
| 43 | `/leads/pipeline?preset=&attention=yes` | MUZOKARALAR | [1, 27500000] | [1, 27500000] | OK |
| 44 | `/leads/pipeline?preset=&attention=yes` | YUQORI HISOBLAGICH | [5, 75505000] | [5, 75505000] | OK |
| 45 | `/leads/pipeline?preset=&stages=main%3Anew,main%3Acontact,unsorted` | Saralanmagan: Заявок | 10 | 10 | OK |
| 46 | `/leads/pipeline?preset=&stages=main%3Anew,main%3Acontact,unsorted` | YANGI SO'ROV | [5, 24001400] | [5, 24001400] | OK |
| 47 | `/leads/pipeline?preset=&stages=main%3Anew,main%3Acontact,unsorted` | ALOQA O'RNATILDI | [8, 168505000] | [8, 168505000] | OK |
| 48 | `/leads/pipeline?preset=&stages=main%3Anew,main%3Acontact,unsorted` | YUQORI HISOBLAGICH | [13, 192506400] | [13, 192506400] | OK |
| 49 | `/leads/pipeline?preset=&unsortedCategory=chat` | Saralanmagan: Заявок | 4 | 4 | OK |
| 50 | `/leads/pipeline?preset=&unsortedCategory=chat` | YANGI SO'ROV | [0, 0] | [0, 0] | OK |
| 51 | `/leads/pipeline?preset=&unsortedCategory=chat` | ALOQA O'RNATILDI | [0, 0] | [0, 0] | OK |
| 52 | `/leads/pipeline?preset=&unsortedCategory=chat` | EHTIYOJ ANIQLANDI | [0, 0] | [0, 0] | OK |
| 53 | `/leads/pipeline?preset=&unsortedCategory=chat` | TAKLIF YUBORILDI | [0, 0] | [0, 0] | OK |
| 54 | `/leads/pipeline?preset=&unsortedCategory=chat` | MUZOKARALAR | [0, 0] | [0, 0] | OK |
| 55 | `/leads/pipeline?preset=&unsortedCategory=chat` | YUQORI HISOBLAGICH | [0, 0] | [0, 0] | OK |
| 56 | `/leads/pipeline/cmvmcc7ho000bngd4fs60fepa?preset=open&sources=QA-Src-A` | YANGI ARIZA | [1, 2500] | [1, 2500] | OK |
| 57 | `/leads/pipeline/cmvmcc7ho000bngd4fs60fepa?preset=open&sources=QA-Src-A` | BOG'LANILDI | [0, 0] | [0, 0] | OK |
| 58 | `/leads/pipeline/cmvmcc7ho000bngd4fs60fepa?preset=open&sources=QA-Src-A` | SINOV DARSI | [0, 0] | [0, 0] | OK |
| 59 | `/leads/pipeline/cmvmcc7ho000bngd4fs60fepa?preset=open&sources=QA-Src-A` | TO'LOV KUTILMOQDA | [0, 0] | [0, 0] | OK |
| 60 | `/leads/pipeline/cmvmcc7ho000bngd4fs60fepa?preset=open&sources=QA-Src-A` | YUQORI HISOBLAGICH | [1, 2500] | [1, 2500] | OK |
| 61 | `/leads/pipeline?preset=won` | MUVAFFAQIYATLI YOPILDI | [11, 273507000] | [11, 273507000] | OK |
| 62 | `/leads/pipeline?preset=won` | YUQORI HISOBLAGICH | [11, 273507000] | [11, 273507000] | OK |
| 63 | `/leads/pipeline?preset=&dateField=closed&datePreset=this_month&stages=won` | MUVAFFAQIYATLI YOPILDI | [10, 273500000] | [10, 273500000] | OK |
| 64 | `/leads/pipeline?preset=&dateField=closed&datePreset=this_month&stages=won` | YUQORI HISOBLAGICH | [10, 273500000] | [10, 273500000] | OK |

## Qo'lda tekshirilganlar
- Facebook Lead Ads oqimi: `createExternalLead({ custom: { utm_campaign, fbclid }, utm: { utm_content }, source: 'Facebook' })` -> `customJson` = `utm_campaign`, `fbclid`, `utm_content` + avtomatik `utm_source=facebook`, `utm_medium=lead_ads` (OK).
- UI: filtr paneli (Bosqichlar multi-select, "Faol bosqichlar", Qo'llash), URL query (`?preset=open&stages=...`), sahifani yangilaganda chip'lar tiklanishi, chip (x) olib tashlash, "…" -> Saralash (Byudjet bo'yicha: ustun kartalari kamayish tartibida), Kartochka ko'rinishi (saqlash -> yangilashda saqlanishi), Ommaviy amallar (kartada checkbox + pastki panel), ro'yxatda Ustunlarni sozlash va ustun sarlavhasi bo'yicha saralash, `/leads/duplicates`.
