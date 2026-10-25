# amoCRM ↔ CRM qayta audit (PLAN 25-band)

Har bo'lim: amoCRM'da ko'rilgan (faqat ko'rish) → bizdagi farq → holat.

## 1. Bitimlar → voronka
| # | amoCRM | Bizda edi | Holat |
|---|--------|-----------|-------|
| 1 | Rejalashtirilgan (muddati o'tmagan) vazifali kartochkada belgi yo'q | "Bugun", "28.10" + nuqta | tuzatildi |
| 2 | Vazifa yo'q: sariq nuqta; teglar bo'lmasa "Нет задач" matni ham | har doim matn | tuzatildi |
| 3 | Kompaniya nomi bitim nomi ustida kulrang | nomdan keyingi qatorda | tuzatildi |
| 4 | Teglar: 2 ta + "+N", teg rangi (tungi: xira fon, rangli chegara) | 3 ta, rangsiz | tuzatildi |
| 5 | Forma/Lead Ads saralanmagan arizasi: avatar yo'q, "nom — sana", so'ng forma maydonlari ro'yxati | avatar + "от:" + telefon | tuzatildi |
| 6 | "Сделки" menyusida asosiy voronka ham, joriy voronka ko'k | asosiy voronka yo'q edi | tuzatildi |
| 7 | Tugma "НАСТРОИТЬ" | "НАСТРОИТЬ ВОРОНКУ" | tuzatildi |
| 8 | "Архивные воронки" bo'limi | voronka arxivi yo'q | qo'shildi (sozlamalarda Arxivlash/Arxivdan chiqarish, menyuda «Архивные воронки ›») |
| 9 | Chap menyu: "AI-агенты и боты", "Покупатели" | yo'q | amoCRM'ning alohida mahsulotlari — qo'shilmaydi |
| 10 | "…" menyu tartibi: Настроить воронку, Импорт, Экспорт, Внешний вид карточки, Поиск дублей, Массовые действия, Сортировка, Автообновление | "Voronkani sozlash" yo'q, saralash 3-o'rinda | tuzatildi |
| 11 | Filtr o'rta ustuni: sarlavhasiz ixcham qatorlar ("Причины отказа: Все значения", kvadrat belgi), sana — bitta "📅 За все время" boshqaruvi, "Активные статусы", "Требующие внимания: Не учитывать" | sarlavhali bloklar, sana alohida tugmalar | tuzatildi |
| 12 | UTM maydonlari ro'yxatda ochiq (har biri placeholder bilan) | "maydonni tanlang" orqali qo'shish | tuzatildi |
| 13 | Teglar ustunida "Остальные теги" (ko'p bo'lsa), teglar rangli | rangsiz chegara | tuzatildi |
| 14 | Saqlash (filtr nomi) qatori faqat filtr o'zgarganda | doim ko'rinardi | tuzatildi |
| 15 | Internet uzilganda chap pastda "Нет подключения [Переподключиться]" | yuqorida rangli chiziq; dev proxy 500 da server o'chganini sezmasdi | tuzatildi (/health ok bo'lmasa — aloqa yo'q) |

## 2. Bitimlar → ro'yxat (Все сделки)
| # | amoCRM | Bizda edi | Holat |
|---|--------|-----------|-------|
| 1 | "Все сделки" yonida faqat ro'yxat belgisi | voronka belgisi ham bor edi | tuzatildi |
| 2 | Tugma "НАСТРОИТЬ" | "НАСТРОИТЬ ВОРОНКУ" | tuzatildi |
| 3 | Saralanmagan bitimlar ro'yxatda: kulrang nom + "Веб Форма"/manba belgisi | ro'yxatdan chiqarilgan edi | tuzatildi |
| 4 | Teglar rangli | rangsiz | tuzatildi |

## 3. Vazifalar
| # | amoCRM | Bizda edi | Holat |
|---|--------|-----------|-------|
| 1 | Filtr: presetlar (Только мои задачи — standart, Просроченные, Выполненные, Все задачи, Удаленные) + sana, Все типы, Воронки/этапы, Не завершенные, Ответственные, Авторы | filtr paneli yo'q edi, hammaning vazifalari ko'rinardi | tuzatildi ("Удаленные" — vazifalar soft-delete qilinmaydi, rejada) |
| 2 | "…": Управление типами задач, Экспорт, Синхронизировать | "bajarilganlarni ko'rsatish" | Eksport qo'shildi; turlarni boshqarish va kalendar sinxronizatsiyasi rejada |

## 4. Ro'yxatlar → kontaktlar/kompaniyalar
| # | amoCRM | Bizda edi | Holat |
|---|--------|-----------|-------|
| 1 | Ustun "НАИМЕНОВАНИЕ", standart tartib — eng yangisi tepada (strelkasiz) | "НАЗВАНИЕ ▲", nom bo'yicha | tuzatildi |
| 2 | Kontakt oldida belgi yo'q, kompaniyada belgi | kontaktda nuqta | tuzatildi |
| 3 | Telefon formatlangan "+998 93 307 77 07" (ro'yxat, kartochka, voronka, bitim kartochkasi) | xom raqam | tuzatildi (format.js phoneFmt) |

## 5. Kontakt / kompaniya kartochkasi (+ bitim kartochkasi umumiy)
| # | amoCRM | Bizda edi | Holat |
|---|--------|-----------|-------|
| 1 | Chap panel kengligi 30% (min 340px, max 50%), chegarani surib o'zgartiriladi | qat'iy 520px | tuzatildi (CardResizer, localStorage) |
| 2 | Maydon yorlig'i ~32% kenglik | 159px | tuzatildi |
| 3 | Tablar: "Основное", "Сделки" (sonsiz) | "Основная", "Сделки 1", "Настроить" | tuzatildi |
| 4 | "#ТЕГИРОВАТЬ", "Отв-ный", qiymat yo'q bo'lsa "..." | "#ТЕГИ", "Ответственный", "—" | tuzatildi (kontekstli i18n kalitlari "card§…") |
| 5 | Telefon: "+" (yana telefon) + formatlangan havola, qalam bilan tahrirlash | input + "добавить" | tuzatildi |
| 6 | Kompaniya bloki: "КОМПАНИЯ" yorlig'i, "…" (Перейти в карточку, Скопировать имя, Открепить) | faqat "Uzish" | tuzatildi |
| 7 | i18n: bir xil o'zbekcha kalit turli bo'limda turlicha tarjima — oxirgi yuklangan yutardi | tasodifiy natija | tuzatildi ("ctx§matn" kalitlari) |

## 6. imBox
| # | amoCRM | Bizda edi | Holat |
|---|--------|-----------|-------|
| 1 | Ochilganda eng so'nggi suhbat avtomatik ochiladi | "Suhbatni tanlang" bo'sh ekran | tuzatildi (keng ekranda) |
| 2 | Ro'yxatda oxirgi xabar "Yuboruvchi ismi: matn" | "Mijoz:/Siz:" | tuzatildi (senderName) |
| 3 | Chat xabarlari "suhbat bloki"da: kanal sarlavhasi, pastda "Беседа № A6703" (lenta va bitim kartochkasida ham) | alohida pufakchalar | tuzatildi |
| 4 | Xabar sarlavhasi: "13.07.2026 13:29:21.446 ISM" | "… · telegram" | tuzatildi |
| 5 | Blok pastida "Закрыть" (suhbatni yopish), xabar holati (Ошибка) | yo'q | «Закрыть» qo'shildi (yangi kiruvchi xabar qayta ochadi); filtr presetlari (Неотвеченные, Избранные, Открытые беседы, Требует ответа, Где я ответственный), davr, bosqichlar, saralash, sevimlilar. Xabar «Ошибка» holati — rejada |

## 7. Analitika
| # | amoCRM | Bizda edi | Holat |
|---|--------|-----------|-------|
| 1 | Chap menyu ☰ bilan yig'iladi (holat eslab qolinadi), yig'ilganda ☰ bosilsa kontent ustida ochiladi | doim ochiq | tuzatildi (SectionAside collapsible) |
| 2 | /stats oxirgi ochilgan hisobotni ochadi | doim "Анализ продаж" | tuzatildi |
| 3 | Sotuv tahlili pastki voronkasi: tanlangan bitimlar (Все/Активные/Закрытые) har bosqichga yetgani %, chapda bosqichda o'rtacha vaqt (Gantt), oxirida Успешно/не реализовано; davr filtriga bo'ysunadi | faqat yutilgan/yo'qotilgan, davr filtrisiz (10/2 vs 5/0 nomuvofiqlik) | tuzatildi (/crm/analytics/flow, bosqich tarixi Activity data.to) |
| 4 | "НЕРАЗОБРАННОЕ" bloki: o'rtacha ishlov vaqti, kiruvchi arizalar (kanal bo'yicha), bitimga o'tganlar | yo'q | qo'shildi |
| 5 | "ПРОГНОЗ ПРОДАЖ": hozir faol, 30/60/90 kun, sotuv sikli; kam ma'lumotda parda | yo'q | qo'shildi |
| 6 | Tab "АКТИВНЫЕ" | "АКТИВНА" | tuzatildi |

## 8. Ish stoli
| # | amoCRM | Bizda edi | Holat |
|---|--------|-----------|-------|
| 1 | "Среднее время ответа" (chatlar, davr uchun) va "Долго ждёт ответа" vidjetlari | yo'q | qo'shildi (/crm/chat-stats) |
| 2 | "Amma" AI yordamchisi, AI-агенты | — | amoCRM'ning alohida mahsuloti, qo'shilmaydi |

## 9. Sozlamalar → umumiy
| # | amoCRM | Bizda edi | Holat |
|---|--------|-----------|-------|
| 1 | Chap menyu ☰ bilan yig'iladi | doim ochiq | tuzatildi |
| 2 | "Сохранить" — kulrang, o'zgarish bo'lsa faol | doim faol "СОХРАНИТЬ" | tuzatildi |
| 3 | "Настройка левого меню с учетом роли пользователя" (Все пользователи + rollar, har bo'lim yoqish/o'chirish) | yo'q | qo'shildi (general.navHidden, chap menyu darhol yangilanadi) |
| 4 | Периодические покупки, Счета, Товары, Личные чаты, Кабинет клиента, fayllar, amoAI, Счет и оплата | — | amoCRM'ning alohida xizmatlari — qo'shilmaydi |

## 10. Sozlamalar → foydalanuvchilar
| # | amoCRM | Bizda edi | Holat |
|---|--------|-----------|-------|
| 1 | "…": Лог авторизаций (sana, foydalanuvchi, IP, brauzer, natija) | yo'q, kirishlar yozilmasdi | qo'shildi (crm_activities type=auth, GET /auth/log) |
| 2 | "…": Настройка групп | faqat foydalanuvchi oynasida | qo'shildi (guruhlar ro'yxati + yangi guruh) |

## 11. Sozlamalar → Chatlar va messenjerlar
| # | amoCRM | Bizda edi | Holat |
|---|--------|-----------|-------|
| 1 | "Шаблоны ответов": nom, holat, tur, matn; chatda tanlanadi | yo'q | qo'shildi (/crm/chat-settings, composer'da shablon tugmasi) |
| 2 | "Беседы": yangi suhbat qachon yangi bitimda (har doim / faol bitim bo'lmasa — standart / umuman bitim bo'lmasa) | Telegram har doim eski bitimga, Instagram/Messenger faqat ochiqqa | tuzatildi (bitta qoida barcha kanallar uchun) |
| 3 | Список ботов, Онлайн чаты, Сокращать ссылки, Типовые вопросы, NPS | — | bizda avtomatlashtirish (Digital Pipeline) bor; qolganlari amoCRM'ning pullik xizmatlari |

## 12. Sozlamalar → Xavfsizlik
| # | amoCRM | Bizda edi | Holat |
|---|--------|-----------|-------|
| 1 | "Белый список IP-адресов": faqat ro'yxatdagi IP'lardan kirish, joriy IP ko'rsatiladi va ro'yxatda bo'lishi shart | yo'q | qo'shildi (IpWhitelistGuard, X-Forwarded-For'ning proksi qo'shgan qiymati; ochiq yo'llar/webhook'lar tegilmaydi) |
| 2 | Резервное копирование | — | amoCRM Pro xizmati; bizda Excel eksportlari bor |
| 3 | Parolni o'zgartirish amoCRM'da profil oynasida | Xavfsizlikda | qoldirildi (qo'shimcha qulaylik) |

## 13. Akkaunt paneli
| # | amoCRM | Bizda edi | Holat |
|---|--------|-----------|-------|
| 1 | Yuqoridan tushadigan chiziq: ism, email (nusxalash), "профиль", "выйти", o'ngda mavzu auto/light/dark | chapdan yon panel, auto yo'q | tuzatildi (+ til UZ/RU shu chiziqda) |
| 2 | "профиль" oynasi | yo'q | qo'shildi (til, o'z parolini o'zgartirish) |
| 3 | Mavzu "auto" — tizim mavzusiga ergashadi | yo'q | qo'shildi |

## 14. Market (Integratsiyalar)
| # | amoCRM | Bizda edi | Holat |
|---|--------|-----------|-------|
| 1 | "+ WEB HOOKS (n)": hodisalarda (bitim qo'shildi/o'zgardi/bosqich/o'chirildi, eslatma, vazifa) tashqi URL'ga POST | yo'q | qo'shildi (crm/webhooks, SSRF himoyasi, fon rejimida) |
| 2 | Bannerlar, "Выбор amoCRM", "Амма и агенты", Email/SMS katalogi | — | amoCRM marketplace kontenti — qo'shilmaydi |

## 15. Maydonlar sozlamasi
| # | amoCRM | Bizda edi | Holat |
|---|--------|-----------|-------|
| 1 | Maydon ma'lum bosqichlarda majburiy ("Обязательно N"): bitim shu bosqichga o'tkazilganda bo'sh bo'lsa — o'tkazilmaydi | faqat umumiy "majburiy" belgisi (formalar uchun) | qo'shildi (requiredStagesJson, moveLead/updateLead tekshiruvi, "Yo'qotilgan"ga o'tish erkin) |
| 2 | Sozlash kartochka ichida ("Настроить" tabi — chap panelda: guruh tablari, maydonlar, "Обязательно N") | alohida sahifaga o'tardi | tuzatildi |

## 16. Ekran o'lchamlariga moslashish (PLAN 26)
amoCRM: media-qoidalar 1300–1000px oralig'ida, body min-width 768px (telefonda mobil ilova taklif qilinadi).
| # | amoCRM | Bizda edi | Holat |
|---|--------|-----------|-------|
| 1 | ≤1279px: Analitika/Sozlamalar ichki menyusi avtomatik yig'iladi, ☰ bilan ustidan ochiladi | doim ochiq | tuzatildi |
| 2 | <768px moslashmaydi | bizda telefon moslashuvi bor — saqlanadi, buzilgan joylar tuzatildi | — |
| 3 | Telefon: yuqori panel qirqilardi (tugmalar ko'rinmasdi) | — | ikki qator: sarlavha+tugmalar / qidiruv |
| 4 | Telefon: ichki menyu butunlay yashirilgan (Sozlamalar/Analitika bo'limlari orasida yurib bo'lmasdi) | — | ☰ bilan ochiladi |
| 5 | Telefon: sozlamalar qatorlari, analitika bloklari sig'masdi | — | ustma-ust, Gantt yashiriladi |

## 17. Teglarni boshqarish
- amoCRM'da `/settings/tags` sahifasi YO'Q (ish stoliga qaytaradi). Teglar bitimlar filtridagi «ТЕГИ — Управление» havolasidan
  ochiladigan «Управление тегами» modalida boshqariladi → bizdagi alohida sahifa olib tashlandi, eski manzil /leads/list'ga yo'naltiriladi.
- Modal: «Запретить пользователям создавать новые теги» o'chirgichi (backend'da majburiy: sozlamalar huquqi yo'q foydalanuvchi
  bitimga katalogda yo'q teg qo'ya olmaydi — yaratish, tahrirlash, ommaviy teg qo'shish), «Найти или добавить тег» (Enter — qo'shish),
  ro'yxat ko'p ishlatilganidan boshlab (teg + soni), hover'da rang nuqtasi va o'chirish (tasdiq oynasi), teg ustiga bosib nomini o'zgartirish.
- amoCRM'da teglarni birlashtirish yo'q → olib tashlandi.

## 18. Import
- amoCRM'da «…» → «Импорт» alohida sahifa emas, 765px modal: «Импорт из таблицы» kartochkasi (XLS belgisi, tavsif, «Загрузить файл»,
  «Скачать пример») → bizda ham shunday modal; fayl tanlansa darhol «Maydonlarni moslash» qadamiga o'tiladi (sahifa bevosita ochilsa — 1-qadam).
- Kontaktlar ro'yxatining «…» menyusiga ham «Импорт» qo'shildi (amoCRM'da bor edi, bizda yo'q edi).
- Xato: o'zimizning namuna faylimiz sarlavhalari («Kontakt: ism», «Kontakt: telefon») ruscha interfeysda avtomatik moslanmasdi → asl nom bilan ham solishtiriladi.
- Qilinmagan: «Импорт из Google таблиц» (Google OAuth integratsiyasi kerak) va «Посмотреть импортированные файлы» (import tarixi) — keyingi bosqich.

## 19. Dublikatlarni qidirish
- amoCRM: «…» → «Поиск дублей» — modal «Найти и объединить дубли · 1 из N»: guruhlar birma-bir; har bitim ustunida har maydon uchun
  radio («Выбрать всё», «Перейти в карточку»), teglar belgilanadi, o'ngda natija («Отменить всё»); yuqorida «Отменить / Не дубль / Объединить».
  Bizda alohida sahifa (telefon/email/nom tablari, faqat «asosiy» tanlash) edi → amoCRM kabi modal qilindi (telefon+email+nom birga).
- Backend: birlashtirishda tanlangan qiymatlar (nom, mas'ul, byudjet, bosqich, teglar, qo'shimcha maydonlar) qo'llanadi;
  «Yaratilgan sana» tanlovi — qaysi bitim saqlanishi. «Не дубль» ro'yxati saqlanadi (guruh qayta chiqmaydi).
- Xato tuzatildi: birlashtirishda chat xabarlari va o'chirilgan vazifalar arxivi ko'chirilmasdi (o'chirilgan bitimda qolib ketardi);
  boshqa bitimlarning kontaktlari endi asosiy bitimga qo'shimcha kontakt sifatida o'tadi.

## 20. Bitimlar ro'yxati — ustun sarlavhasi
- amoCRM: sarlavha bosilsa oynacha «Сортировка (По возрастанию / По убыванию) · Фильтр [maydon] · Применить / Отменить».
  Bizda bosish faqat saralashni almashtirardi → amoCRM kabi oynacha; matnli ustunlar (nom, kontakt, telefon, email, kompaniya,
  matnli qo'shimcha maydonlar) uchun filtr, natija filtr chipida ko'rinadi.
- «…» menyusi amoCRM tartibida: Импорт, Экспорт, Печать (yangi — chop etishda faqat jadval), Настройки таблицы, Поиск дублей;
  ortiqcha «Saralash» bandi olib tashlandi (saralash ustun sarlavhasida).

## 21. Yakuniy dizayn solishtirish (PLAN 17)
- Vazifalar (lenta): ustunlar 350px (ichki 10px, oraliqsiz) markazda — amoCRM .pipeline_status__head; standart «Только мои задачи»
  filtr maydonida chip sifatida ko'rsatilmaydi (amoCRM'da bo'sh «Фильтр») — tuzatildi.
- Ro'yxatlar: «Списки» standart holatda «КОНТАКТЫ» (amoCRM /contacts/list/contacts/), «Все контакты и компании» — tanlov orqali;
  faqat saralanmagan arizaga bog'langan kontakt nomi kulrang (amoCRM .list-row_unsorted) — tuzatildi.
