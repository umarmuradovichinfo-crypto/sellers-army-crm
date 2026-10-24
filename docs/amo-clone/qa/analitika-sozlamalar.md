# QA: Analitika, Sozlamalar, Integratsiyalar, Voronka/Maydon sozlash, Ish stoli

Usul: kod o'qish + curl (admin va sotuvchi tokenlari) + psql bilan solishtirish + `vite build`. Brauzer ishlatilmadi (UI oqimlari kod bo'yicha tekshirildi).
Holat: TUZATILDI / OCHIQ (sababi) / OK.

| # | Test | Kutilgan | Haqiqiy | Holat |
|---|------|----------|---------|-------|
| 1 | Analitika `?from=abc` / `?to=2026-13-45` (overview, calls, timeline, employees) | 400 yoki e'tiborsiz | 500 INTERNAL_ERROR | TUZATILDI (400 INVALID_DATE) |
| 2 | `events?limit=-5` | 1..300 oralig'i | take manfiy -> teskari sahifalash, ko'p qator | TUZATILDI (clamp) |
| 3 | `timeline?from=1900-01-01` | cheklangan | ~46 000 bucket | TUZATILDI (800 kun cheklov) |
| 4 | Bitimlar soni/summa/bosqich/xodim: analytics vs DB (psql) | teng | 62/987.5 mln, bosqichlar, qo'ng'iroqlar 32/in5/missed9/7667s mos | OK |
| 5 | Analitika vs voronka doskasi (Ish stoli) | teng | analitika «Saralanmagan» (6 ta) larni ham sanardi: 42 vs 36 | TUZATILDI (unsorted=false) |
| 6 | Voronka filtri: asosiy voronkani tanlash | mumkin | ro'yxatda faqat qo'shimcha voronkalar; «Barcha» ikki voronka bosqichlarini aralashtirardi | TUZATILDI (`pipelineId=main`, Sotuv tahlili doim bitta voronka) |
| 7 | Menejer filtri (Umumiy hisobot) | voronka/dinamika ham filtrlansin | faqat jadvallar filtrlanardi | TUZATILDI (`userIds` backend: overview, timeline) |
| 8 | Filtr o'zgarganda keshdan eski filtr natijasi | yangi natija | `useApi` qat'iy cacheKey ('stats-per' va b.) -> boshqa filtr natijasi ko'rinardi/qolardi | TUZATILDI (kalit deps'dan) |
| 9 | Bo'sh ma'lumot (2030 davri) overview/employees | 200, nol | 200, grafiklar «Ma'lumot yo'q» | OK |
| 10 | Maqsadlar: period=abc, metric=bad, target=-5/"abc"/99999999999 | 400 | 500 yoki Int overflow | TUZATILDI (validatsiya) |
| 11 | Maqsad o'chirish (mavjud emas id) | 404 | 500 | TUZATILDI |
| 12 | Maqsadlar modal: server xatosi | xabar ko'rinsin | jim (unhandled), harf kiritish «1.5»->15 | TUZATILDI (xato matni, faqat raqam) |
| 13 | Maqsad saqlash/yangilash/o'chirish (curl) | ishlaydi | OK, actual=13 yutilgan | OK |
| 14 | Sotuvchi: GET/PUT settings/general, settings/users, access, crm/goals POST, pbx/facebook config PUT, automations | 403 | 403 | OK |
| 15 | Sotuvchi: analytics GET | 200 (crm.view) | 200 | OK |
| 16 | Sozlamalar «Umumiy»: faqat super_admin roli qattiq kodlangan | `settings.roles.manage` ruxsati bo'yicha | `user.role==='super_admin'` | TUZATILDI (SettingsPage, SettingsUsers) |
| 17 | Sotuvchi «Umumiy sozlamalar»da tilni almashtirish | ishlaydi | Saqlash 403 bergach til o'zgarmasdi; GET 403 | TUZATILDI (til mahalliy, saqlash faqat ruxsatli) |
| 18 | Sotuvchi o'z parolini o'zgartirishi (Xavfsizlik) | ishlaydi | `users/:id/password` 403 (admin ruxsati) | TUZATILDI (yangi `POST /settings/me/password`, joriy parol talab qilinadi) |
| 19 | Foydalanuvchi yaratish: dublikat email (katta-kichik harf), noto'g'ri email, qisqa parol, noma'lum rol | 400/404 | to'g'ri xabarlar | OK |
| 20 | Admin o'z rolini o'zgartirishi (lockout) | taqiqlansin | ruxsat berilardi | TUZATILDI (400 SELF; UI da select/«Faol» o'chiq) |
| 21 | Faolsizlantirilgan foydalanuvchi tokeni | 401 | 401 | OK |
| 22 | Foydalanuvchilar ro'yxati xato (sotuvchi/403) | xabar | «Foydalanuvchi yo'q» deb jim | TUZATILDI |
| 23 | Ism uzunligi (>100) | 400 | cheklov yo'q | TUZATILDI |
| 24 | Integratsiyalar «O'rnatilganlar» (BUGS.md) | ulanganlar ko'rinsin | PBX domen+kalit saqlanganda `enabled=true` -> karta ko'rinadi (curl bilan tasdiqlandi). Demo bazada hech narsa ulanmagan, shu sabab bo'sh edi. Yuklanguncha «Hali o'rnatilmagan» yonib-o'chardi, unmount'dan keyin setState | TUZATILDI (yuklash holati, alive-guard). Funksional xato topilmadi |
| 25 | Facebook ulash vizardi: boshqa voronka tanlansa bosqichlar | tanlangan voronka bosqichlari | doim asosiy voronka bosqichlari | TUZATILDI |
| 26 | Facebook/Forma: toggle/o'chirish xatosi | xabar | jim | TUZATILDI |
| 27 | Forma muharriri: maydonsiz / variantsiz tanlov | validatsiya | saqlanardi, ikki marta bosish | TUZATILDI |
| 28 | Voronka: yaratish/nom/o'chirish (curl) | ishlaydi | OK; mavjud emas id 500 | TUZATILDI (404; bo'sh nom 400) |
| 29 | Voronka o'chirilganda trigger (automation) | asosiy voronkaga o'tsin | pipelineId eskicha qolib, ishlamay qolardi | TUZATILDI (tranzaksiya) |
| 30 | Ichida bitimi bor bosqichni o'chirish | bitimlar o'sha voronkaning 1-ochiq bosqichiga | bitimlar `new` (asosiy) bosqichiga, lekin pipelineId eskicha -> hech bir doskada ko'rinmasdi; triggerlar yetim qolardi | TUZATILDI |
| 31 | Voronkadagi oxirgi ochiq/yutuq/yo'qotish bosqichini o'chirish | taqiqlansin | ruxsat | TUZATILDI (400 LAST_OF_KIND) |
| 32 | Bosqich: bo'sh nom bilan yangilash | 400 | ruxsat | TUZATILDI |
| 33 | Bosqich qo'shish paytida saqlanmagan nom/rang tahriri | saqlansin/dirty qolsin | «saqlangan» deb belgilanib yo'qolardi | TUZATILDI |
| 34 | Voronka menyusi/yo'qotish sabablari xatolari | xabar | unhandled rejection | TUZATILDI |
| 35 | Trigger: bitimni bosqichga o'tkazish -> teg, vazifa, maydon | bajarilsin | to'g'ri (tag, task, value=5555) | OK |
| 36 | Trigger: mavjud bo'lmagan mas'ul | e'tiborsiz | assigneeId='nonexistent' yozilardi; bitta action xatosi qolganini to'xtatardi | TUZATILDI |
| 37 | «Yaratilganda» trigger boshqa voronka lidlariga ham ishlardi | faqat o'z voronkasi (null=asosiy) | hamma voronkaga | TUZATILDI |
| 38 | Trigger CRUD: noma'lum trigger, mavjud emas id | 400/404 | 500 | TUZATILDI |
| 39 | Trigger modal: bo'sh matn/teg/URL | validatsiya | bo'sh qoida saqlanardi; xatoda tugma qotardi | TUZATILDI |
| 40 | Webhook action: file:// va boshqa protokollar | faqat http(s) | har qanday | TUZATILDI (ichki manzillarga SSRF himoyasi OCHIQ — dizayn qarori) |
| 41 | Maydonlar: barcha 9 tur + textarea, variantlar dublikat/bo'sh, tartib | ishlaydi | OK; noma'lum tur, variantsiz select saqlanardi; mavjud emas id 500 | TUZATILDI |
| 42 | Maydon o'chirish/tahrir/reorder (mavjud emas id) | 404 / e'tiborsiz | 500 | TUZATILDI |
| 43 | Maydon modal: xato, variantsiz ro'yxat, bo'sh yangi guruh | xabar | jim | TUZATILDI |
| 44 | Ish stoli «Meniki» | barcha vidjetlar filtrlansin | manbalar va qo'ng'iroqlar filtrlanmasdi | TUZATILDI (userIds / byEmployee) |
| 45 | Ish stoli: asosiy voronka manbalari | faqat asosiy | barcha voronkalar aralash | TUZATILDI (`pipelineId=main`) |
| 46 | Ish stoli: teskari «Davr» sanalari | almashtirilsin | bo'sh natija | TUZATILDI |
| 47 | Ish stoli fon tanlash (localStorage), voqealar paneli | ishlaydi | OK (qorong'i fon — oq matn ataylab) | OK |
| 48 | Mavzu: qattiq kodlangan ranglar | palette | logotip/status/diagramma ranglari va dashboard (rasmli fon) qattiq; o'qiladi | OK (eslatma) |

## Tuzatilmay qolganlar
- Sotuv tahlili «Yo'qotilgan» ustuni har bosqichda `0 , 0 so'm` — backend bosqich bo'yicha yo'qotish tarixini saqlamaydi (BUGS.md «Qiymat oldin» bilan bir ildiz).
- Analitika `from` UTC yarim tun, `to` server mahalliy 23:59:59 — vaqt mintaqasi farqi (kichik).
- Parol almashganda eski refresh-tokenlar bekor qilinmaydi (auth moduli, mening sohamdan tashqarida).
- Webhook action ichki tarmoq manzillariga (SSRF) ruxsat — dizayn qarori kerak.
- Forma muharriri/Facebook: voronka bo'yicha forma bosqichlari (Forma) faqat asosiy voronka bosqichlarini ko'rsatadi (IntegrationsPage `stages` asosiy voronkadan) — Forma uchun hal qilinmadi.
- Brauzerda vizual tekshiruv o'tkazilmadi (brauzer band).
- Demo bazada PBX `apiKey` test qiymati app_settings'dan o'chirildi, ammo backend xotira keshida «qa» qolishi mumkin (domen bo'sh, integratsiya o'chiq) — backend qayta ishga tushganda tozalanadi.
- Ruscha: yangi matnlar `stats.ru.js`, `settings.ru.js`, `pipesetup.ru.js` ga qo'shildi.
