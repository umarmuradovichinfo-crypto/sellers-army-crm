# amoCRM klon — ish rejasi

Maqsad: Sellers Army CRM'ni nom va logodan tashqari hamma narsada amoCRM bilan 1:1 qilish —
bo'limlar, joylashuv, har bir detal, animatsiyalar, ochilish/yopilish harakatlari, funksiyalar.
Manba: foydalanuvchining amoCRM akkaunti (decopoluzz.amocrm.ru, faqat ko'rish), uning CSS'i va skrinshotlar.

Qoidalar
- amoCRM'da boshqa joyda turgan narsa → amoCRM'dagi joyiga ko'chiriladi.
- amoCRM'da yo'q narsa → olib tashlanadi. Istisno: biznes uchun zarur integratsiyalar
  (Facebook Lead Ads, OnlinePBX, lid formalari) — amoCRM'dagi joyiga (voronka sozlamalari →
  "Bitim manbalari", integratsiyalar) ko'chiriladi.
- Interfeys ikki tilda: o'zbekcha va ruscha (amoCRM'dagi asl ruscha nomlar).
- Yangi so'rovlar shu rejaga qo'shiladi va navbati kelganda bajariladi.

## QA (foydalanuvchi talabi)
Dev jamoadagi tester kabi: har bir tugma, funksiya, detal alohida test-keys sifatida sinaladi; natija `docs/amo-clone/QA.md` da
(bo'lim → test-keys → kutilgan → haqiqiy → holat). Xatolar BUGS.md ga, tuzatilgach qayta sinaladi.

## Har bir bosqichdan keyin (majburiy)
Kod yozilgach shu bo'lim uchun:
1. Test: brauzerda har bir tugma, forma, drag-and-drop, filtr, modal, ochilish/yopilish, ikki til, ikki mavzu, mobil o'lcham.
2. Diagnostika: build, konsol xatolari, tarmoq so'rovlari (4xx/5xx), backend loglari.
3. Topilgan xatolar `docs/amo-clone/BUGS.md` ga yoziladi (qayerda, qanday takrorlanadi, holati) va tuzatiladi.
4. amoCRM bilan yonma-yon solishtirish (joylashuv, o'lcham, rang, matn, animatsiya, funksiya) — farqlar ham BUGS.md ga.
Bo'lim faqat shu to'rttasi o'tgandan keyin [x] bo'ladi.

## Bosqichlar

1. [x] Asos: rang tokenlari (yorug'/qorong'i), PT Sans shriftlari, tugma/input/checkbox/switch
2. [x] Qobiq: chap menyu, Bitimlar flyout, akkaunt paneli, bildirishnomalar paneli, amoCRM URL'lari
3. [x] Bitimlar
   - [x] Voronka: ustunlar, kartalar, saralanmagan, tez qo'shish, drag-and-drop, yopish zonalari, yo'qotish sababi
   - [x] Filtr paneli (presetlar, xususiyatlar, teglar)
   - [x] Lid kartasi (/leads/detail/:id): chap maydonlar paneli, status dropdown, tablar, lenta, composer (chat/eslatma/vazifa), "…" menyu
   - [x] Yangi bitim (/leads/add)
   - [x] Ro'yxat ko'rinishi (/leads/list): jadval, ommaviy amallar
   - [x] Import sahifasi ("…" menyudan)
4. [x] Vazifalar: kun/hafta/oy, ro'yxat, kalendar, vazifa qo'shish oynasi
5. [x] Ro'yxatlar: [x] kontaktlar/kompaniyalar jadvali; [x] kontakt/kompaniya kartochkasi (/contacts/detail, /companies/detail, /contacts/add); [x] backend: kontakt/kompaniyaga assigneeId va teglar, bulk endpoint, 200 ta limitni olib tashlash (sahifalash), import sahifasi
6. [x] imBox: suhbatlar ro'yxati + chat lentasi
7. [x] Analitika: sotuv tahlili, umumiy hisobot, xodimlar hisoboti, voqealar ro'yxati, qo'ng'iroqlar, maqsadlar
   - [x] Tuzatish: sotuv tahlilida o'rtacha davomiylik "11k." chiqyapti (avgDays birligi), tor ekranda bloklar ustma-ust
   - [x] Voqealar: "qiymat oldin/keyin" uchun backend activity'da before/after saqlash
8. [x] Ish stoli: vidjetlar, davr tanlagich, voronka statistikasi
9. [x] Sozlamalar: [x] umumiy (til tanlash), foydalanuvchilar, chatlar, xavfsizlik; [x] Market/Integratsiyalar (OnlinePBX, Facebook, Telegram, formalar); [x] voronka sozlash (bitim manbalari, digital pipeline); [x] maydonlar sozlash (/settings/fields/leads)
   - [x] Integratsiyalar: "O'rnatilganlar" tabi ulangan integratsiyalarni ko'rsatadi (holat tekshiruvi bor)
   - [x] O'z parolini o'zgartirish uchun /settings/me/password (joriy parol tekshiruvi bilan)
   - [x] Umumiy sozlamalardagi sana/vaqt/valyuta formatlarini format.js ishlatishi
10. [x] Eski kodni tozalash: 14 ta ishlatilmaydigan fayl (CRM.jsx, Settings.jsx, components/crm/*, FormBuilder), eski CSS 55KB→12KB (faqat Login/LeadForm/CallWidget/Dialog ishlatadigan qoidalar qoldi)
    - [x] Login sahifasi va CallWidget (telefoniya, dial-pad bilan) amoCRM uslubida
11. [x] (31-banddan keyin) Yakuniy to'liq test va diagnostika: butun tizim, barcha bo'limlar o'zaro bog'liqligi (bitim → kontakt → vazifa → analitika), xatolar ro'yxati va tuzatish
12. [x] Funksiyalar pariteti: amoCRM'dagi har bir bo'lim, funksiya, tugma, detal ro'yxati (FEATURES.md) — bizda bor/yo'q;
    yo'qlari qo'shiladi
13. [x] Bog'liq mantiq testi: funksiyalar bir-biriga ta'siri (bitim bosqichi → avtomatlashtirish → vazifa → bildirishnoma → analitika;
    kontakt ↔ bitim ↔ kompaniya; foydalanuvchi huquqlari → har bir bo'lim)
14. [x] Voronka sozlamalari (Digital Pipeline) amoCRM'dagi BARCHA funksiyalari bilan: manbalar, saralanmagan, dublikat qoidalari,
    har bosqich uchun barcha trigger/amal turlari, bosqich tavsiflari (podskazki), yo'qotish sabablari va h.k. — avval amoCRM'dan
    to'liq ro'yxat olinadi; umumiy sozlamalar ham 1:1
15. [x] Integratsiyalar amoCRM mantiqi bilan 1:1 (amoCRM'da qanday ulansa — xuddi shunday):
    - Facebook Lead Ads: Meta OAuth → sahifa → formalar → maydon moslash → voronka/bosqich/mas'ul/teglar → lidlar real vaqtda (webhook),
      dublikat qoidalari, manba sifatida voronka sozlamalarida ko'rinishi
    - Instagram: Direct va izohlar (Meta Graph API, webhook) → imBox suhbatlari, saralanmaganga lid, javob yozish, manba kartochkasi
    - Facebook Messenger: xuddi shunday
    - Forma konstruktori (Конструктор форм) va sayt-vizitka: maydonlar, dizayn, saytga joylash kodi/havola, voronka/mas'ul/teglar,
      dublikat nazorati, "rahmat" xabari, UTM yig'ish
    - Telegram: amoCRM'dagi ulanish oqimi bilan bir xil
    (Meta ilovasi va ruxsatlari foydalanuvchi bilan kelishiladi)
    ARXITEKTURA: CRM har mijozga alohida o'rnatiladi → vendor'ning BITTA markaziy Meta ilovasi + markaziy
    "Meta Connector" xizmati (connector/). Har yangi mijoz hech narsa sozlamasdan bitta tugma bilan ulaydi (amoCRM kabi):
    OAuth va webhook connector orqali, sahifa tokenlari va lid hodisalari imzolangan so'rov bilan mijoz CRM'iga uzatiladi.
    [x] Facebook Lead Ads — connector + bir tugma (ishladi, formalar sahifa ostida, voronka/bosqich tanlanadi)
    [x] Instagram Direct/izohlar va Messenger — xuddi shu connector orqali
16. [ ] amoCRM akkauntini Chrome orqali TO'LIQ ko'rib chiqish (har bo'lim, har oyna, har menyu, har tugma, hover/ochilish holatlari,
    sozlamalarning har bir sahifasi) — FEATURES.md'ga ro'yxat; bizda yo'q/boshqacha bo'lgan har bir narsa amoCRM'dagi mantiq,
    dizayn, joylashuv va ko'rinish bilan 1:1 qo'shiladi; so'ng hammasi qayta test qilinadi (faqat ko'rish, akkauntda hech narsa o'zgartirilmaydi)
17. [x] (31-banddan keyin) Yakuniy dizayn solishtirish 1:1: har bir ekran amoCRM bilan yonma-yon (o'lcham, rang, shrift, joylashuv, animatsiya; desktop + mobil), farqlar tuzatiladi

18. [x] Tarmoq nazoratchisi / offline rejim: /health ping, GET retry, yozuvlar navbati (Idempotency-Key), banner, PWA app-shell
19. [x] Bitimlar filtrlari/saralash/statistika amoCRM bilan 1:1 (FILTERS-SPEC.md) — 256 ta tekshiruv psql bilan mos (qa/filtrlar.md)
    - [x] Analitika sahifasiga ham to'liq filtr paneli (amoCRM .analytics-sidebar: davr, voronka, menejerlar, qo'shimcha maydonlar, UTM, «Применить»)
20. [x] Meta Connector Railway'da (sellers-army-crm-production.up.railway.app) — FB_APP_SECRET foydalanuvchi kiritadi

21. [x] Instagram Direct/izohlar + Facebook Messenger connector orqali (bir tugma) → imBox; Meta obunalari ok
23. [x] CRM'ni Railway'ga joylash (HTTPS, Postgres): https://crm-production-5e25.up.railway.app (servis `crm`, branch amo-clone)
    - [x] Foydalanuvchi birinchi admin yaratadi va "Facebook bilan ulash"ni haqiqiy sahifa bilan sinaydi
24. [x] Lid kartochkasi amoCRM bilan 1:1: akkauntdan har bir detal (sarlavha, teglar, status, tablar, maydonlar tartibi va ko'rinishi,
    kontakt/kompaniya bloklari, lenta turlari, composer rejimlari, "…" menyu, pastki panel, hover/tahrirlash holatlari) olinadi;
    yetishmaganlari qo'shiladi, amoCRM'da yo'q ortiqcha narsalar olib tashlanadi; so'ng test
    - [x] Sarlavha (nomsiz bo'lsa "Bitim #id" kulrang), teglar rangi, bosqichlar rangidagi bo'lakli progress
    - [x] Kontakt bloki ("…": kartochkaga o'tish/ismni nusxalash/uzish; Kompaniya, Ish tel. havola, "yana"), kompaniya bloki
    - [x] Statistika tabi (manba, ishdagi kunlar, qo'ng'iroq/vazifa/eslatma/chat sonlari, 19 ta UTM belgisi)
    - [x] Saralanmagan bitimda pastki "Qabul qilish | Rad etish" paneli
    - [x] Lenta: vaqt soniya.ms bilan, bir turdagi 3+ voqea "N voqea — Yoyish"; ochiq vazifalar composer ustida
    - [x] Composer: rejim menyusida belgi, "qo'shish" havolasi vazifa rejimini ochadi
    - [x] Bitimga bir nechta kontakt (crm_lead_contacts; "Asosiy qilish", uzishda keyingisi asosiy bo'ladi; kontakt filtri ham hisobga oladi)
    - [x] Uzun lenta yozuvi bir qatorda, "⌄" bilan yoyiladi
    - [x] Lenta qatorining o'ng tomonida obyekt havolasi (kontakt nomi) — kontakt voqealari lentaga tushganda
    - [x] Vazifa turi ikonkalari
    - [x] Composer'da sana tanlagich amoCRM uslubida ("31.10.2026" tugmasi, tezkor variantlar, sana+vaqt)
25. [x] (USTUVOR, foydalanuvchi so'rovi 24.10) amoCRM'ni qaytadan to'liq ko'rib chiqish va CRM'ni har bo'lim bo'yicha
    1:1 solishtirish: joylashuv, dizayn, funksiya, mantiq; har bir farq/xato docs/amo-clone/AUDIT.md ga yoziladi va tuzatiladi.
    Tartib: qobiq/menyu → Bitimlar voronka → ro'yxat → kartochka → Vazifalar → Ro'yxatlar (kontakt/kompaniya + kartochkalar)
    → imBox → Analitika → Ish stoli → Sozlamalar (har sahifa)
27. [x] Facebook ulash ishladi (domen/redirect, Instagram ruxsatlari, pages_manage_ads; formalar sahifa ostida ko'rinadi) — foydalanuvchi tasdiqladi: "Invalid Scopes: instagram_basic, instagram_manage_messages, instagram_manage_comments".
    Sabab: Meta ilovasida Instagram ruxsatlari (use case "Instagram'da xabar va kontentni boshqarish") qo'shilmagan.
    Tuzatish: ilovaga Instagram use case/ruxsatlarini qo'shish; connector so'raydigan scope'larni ilovada yoqilganlari bilan
    moslash (yoqilmaganini so'ramaslik), shunda Facebook Lead Ads ulanishi Instagram'siz ham ishlasin. Qilingan: App Domains va
    Valid OAuth Redirect URI (connector /fb/callback) qo'shildi.
28. [x] Vazifalar: "Удаленные" (vazifalarni soft-delete + tiklash), "Управление типами задач" (o'z turlari + ikonka), kalendar sinxronizatsiyasi (iCal havola)
26. [x] (25-banddan keyin) Har bir qurilma ekraniga moslashish: avval amoCRM turli o'lchamlarda (desktop 1920/1440/1280,
    planshet 1024/768, telefon 414/375) qanday moslashishi ko'riladi (menyu, voronka ustunlari, kartochka, jadval, modallar),
    so'ng bizniki xuddi shunday qilinadi va har o'lchamda test qilinadi
22. [x] Sozlamalar → Chatlar va messenjerlar: "Javob shablonlari" (nom, holat, matn; chat composer'da tanlash) va "Беседы" qoidasi (yangi bitim qachon ochiladi) — imBox/notif switch'lari keraksiz (imBox doim yoqiq)

29. [x] (25.10 audit) «AI-агенты и боты» bo'limi (/agents-and-bots): «Ваши боты — Список ботов» (nom, triggerlar, konversiya,
    jami ishga tushish), Salesbot konstruktori (xabar yuborish, tugmalar, javobni kutish, shartlar, harakatlar: bosqich/teg/vazifa/maydon)
    — Telegram/Instagram/Messenger chatlarida ishlaydi, voronka triggerlarida «Salesbot» harakati. Taxminan 6–10 soat. FOYDALANUVCHI TASDIG'I KUTILMOQDA.
30. [x] (25.10) amoCRM «Амма» AI-yordamchisi: ish stolidagi chat qutisi, o'ng pastdagi avatar → o'ng panel (takliflar, ogohlantirish),
    «AI-агенты» sahifasida «Агент внутри продукта — АММА» kartasi (ishlangan bitimlar, javobsiz chatlar). Backend: crm/amma (Claude API,
    tool use: get_lead, search_leads, list_tasks, create_task, add_note, pipeline_summary, unanswered_chats). Railway'da
    ANTHROPIC_API_KEY o'rnatilishi kerak (ixtiyoriy AMMA_MODEL); kalitsiz «sozlanmagan» xabari chiqadi.
    («Покупатели» bo'limi bu akkauntda o'chirilgan — ochilganda ish stoliga qaytaradi, shuning uchun klonlanmaydi.)

31. [x] (foydalanuvchi so'rovi 25.10) Ish stoli amoCRM bilan TO'LIQ 1:1: amoCRM'da ish stoli qanday ishlashini to'liq o'rganish —
    «Настроить» rejimi, vidjet qo'shish/o'chirish/surish, istalgan statistikani vidjet qilib yaratish (vidjet turlari, manba,
    filtrlar, davr, voronka/xodim), joylashuvni saqlash — hammasini bizga ko'chirish.
    31b. [x] (foydalanuvchi so'rovi 25.10) Voronkadagi istalgan filtr natijasini ish stoliga qo'shish (amoCRM: filtrdan
    «добавить на рабочий стол»), 2-3 xil ko'rinishda (son, bosqichlar bo'yicha ro'yxat, diagramma) — amoCRM'dagi barcha ko'rinishlar.
32. [x] (foydalanuvchi so'rovi 26.10) Eski CRM qoldiqlarini tozalash, eski versiyadagi kerakli funksiyalar yangisida bo'lishi:
    - [x] kartochkadan qo'ng'iroq (telefon menyusi), mahsulotlar katalogi va bitimdagi mahsulotlar, forma «rahmat» xabari va rangi,
      teglarni birlashtirish; eski demo (mock) rejim, ishlatilmaydigan metod/komponentlar olib tashlandi
    - [x] eski scripts/smoke tekshiruvlari E2E'ga ko'chirildi (birinchi sozlash, FB webhook), skript o'chirildi
33. [x] (foydalanuvchi so'rovi 26.10) Telefoniya eski versiyadagidek ishlashi: OnlinePBX + MicroSIP + tel:.
    CRM'da raqam yonidagi «Qo'ng'iroq qilish» bosilganda MicroSIP (OnlinePBX'ga ulangan) avtomatik qo'ng'iroq qiladi
    (softphone rejimi, tel:/sip:/callto: sxemasi), qo'ng'iroq jurnalga yoziladi, kiruvchi/chiquvchi qo'ng'iroqlar
    OnlinePBX webhook orqali bitimga bog'lanadi. Eski versiya (ae16497) bilan solishtirib tekshirish, xatolarni topib tuzatish.
    Bajarildi: raqam yonida bir bosishli qo'ng'iroq tugmasi (MicroSIP tel:), qo'ng'iroq usuli sotuvchiga ham ko'rinadi;
    qo'ng'iroq bitimga KONTAKT telefoni bo'yicha ham bog'lanadi (oldin faqat bitim telefoni — mavjud mijozga dublikat yaratilardi),
    bitim kartochkasi lentasi qo'ng'iroq/xabarlarni o'zi yangilaydi; test/e2e/50-telephony (7 test).
    OnlinePBX panelidagi webhook manzili — Sozlamalar → Telefoniya'da ko'rsatilgan manzil (?secret= bilan).

34. [x] (foydalanuvchi so'rovi 26.10) Telefoniya amoCRM + OnlinePBX vidjeti mantig'ida (eski CRM'dan to'g'ridan-to'g'ri ko'chirmasdan).
    amoCRM'da o'rganildi (Маркет → onlinePBX vidjeti tavsifi va sozlamasi):
    - bir bosishda qo'ng'iroq (bor: raqam yonidagi tugma / raqam menyusi);
    - kiruvchi qo'ng'iroqda qalqib chiquvchi oyna: mijoz nomi, kartochkaga o'tish; sozlama «Показывать всплывающие уведомления?»;
    - yangi raqamdan kiruvchi → kontakt avtomatik yaratiladi (+ «Неразобранное»); o'tkazib yuborilgan → mas'ulga vazifa;
    - qo'ng'iroqlar tarixi va yozuv kartochkada (bor);
    - kiruvchi qo'ng'iroqni kontakt mas'uliga yo'naltirish — OnlinePBX tomonidagi funksiya (CRM'dan mas'ul ichki raqamini berish imkoniyatini o'rganish).
    Eski CRM'dagi «Qo'ng'iroqlar» ro'yxatining amoCRM'dagi o'rni: Аналитика → Список событий → Типы событий → «Звонки»
    (Входящий/Исходящий звонок) — alohida sahifa emas (35-band).
    Bajarildi: kiruvchi qo'ng'iroq oynasi (mijoz nomi, «Перейти в карточку», ovoz; Sozlamalar → Telefoniya'da yoqish/o'chirish);
    jiringlayotgan qo'ng'iroq «ringing» (oldin darhol «o'tkazib yuborilgan» bo'lardi); yangi raqam → kontakt + Saralanmagan bitim;
    o'tkazib yuborilgan → mas'ulga «Qayta qo'ng'iroq qiling» vazifasi (takrorlanmaydi; eski tarix sinxronida faqat so'nggi sutka).
    Ochiq: qo'ng'iroqni mas'ulga yo'naltirish OnlinePBX panelida sozlanadi (CRM'da API yo'q).
35. [x] Аналитика → Список событий amoCRM kabi: filtr paneli (Все события / Мои события / Сегодня / Вчера / Месяц / За все время,
    «Все сущности», «Типы событий» guruhlari bilan), ro'yxatga qo'ng'iroqlar (yozuvni tinglash/yuklab olish) va chat voqealari
    (Входящее/Исходящее сообщение, Беседа создана/закрыта, Внутреннее сообщение) ham tushadi.
    Bajarildi: filtr paneli (5 preset, davr, menejerlar, obyekt, turlar qidiruv/hammasini tanlash bilan, oldin/keyin qiymat),
    qo'ng'iroqlar (davomiylik, raqam, xodim, tinglash/yuklab olish), kiruvchi/chiquvchi xabarlar, yopilgan suhbatlar, bitimga havola,
    umumiy son. MultiSelect uslublari endi har sahifada yuklanadi.
36. [x] Bitim lentasi (chat tarixi) amoCRM mantig'ida. amoCRM'da: tepada «Поиск и фильтр» — chapda «Все события / Только чаты /
    Только чаты с клиентами», o'ngda «Сообщения чатов», «Связанные объекты», «Типы событий» (Активные задачи, Входящий звонок,
    Выполненные задачи, …); oy/kun bo'yicha guruhlash; tizim voqealari yig'ilgan «Создание: N события — Развернуть»;
    xabarlar «Беседа № A8176» suhbatlariga bog'langan, «Закрыть», yopilgan suhbat bir qatorga yig'iladi; xabarda vaqt, muallif,
    kanal va holat («Доставлено»). Bizda bor: suhbat bloki va «Yopish», xato belgisi. Yo'q: lenta filtri, yig'ilgan tizim
    voqealari, suhbat raqami, yetkazildi/o'qildi holati, oy ajratgichlari.
    Bajarildi: «Поиск и фильтр» paneli (3 preset, xabarlar, bog'langan obyektlar, 11 tur; «…: Все»), haqiqiy suhbat raqami
    (migratsiya: crm_conversations.number, crm_messages.convNo; yopilgan suhbatga mijoz yozsa — yangi raqam), eski/yopilgan suhbat
    bitta qatorga yig'iladi, xabar holati (Отправлено/Доставлено/Прочитано; Messenger/Instagram message_reads), oy sarlavhalari,
    chat jurnali (email) lentada va voqealarda takrorlanmaydi; IMBOX ham shu raqamlar bilan. test/e2e/60-chat.
37. [ ] (foydalanuvchi so'rovi 26.10) Sozlamalar bo'limi amoCRM bilan har bir detalda bir xil: amoCRM «Настройки»dagi har bir sahifa
    (Общие, Пользователи, Чаты и мессенджеры, Безопасность, Коммуникации, …) bilan bizdagini birma-bir solishtirib, farqlar
    ro'yxatini tuzish va bir xil qilish.
    Farqlar (amoCRM ko'rildi 26.10):
    a) [ ] Profil: amoCRM'da alohida sahifa /settings/profile «Настройки профиля» (akkaunt paneli → «профиль»): avatar, ID
       пользователя (nusxalash), Language/Язык, Имя, Телефон, Email, Пароль (••••• → almashtirish), Примечание; «Безопасность» →
       «Сеансы» (brauzer+OS, oxirgi kirish, IP, «Текущий», har biri «Выйти»); «Настройки уведомлений» (tur × kanal jadvali);
       «Доступ к аккаунту». Bizda: kichik modal (til + parol). → Profil sahifasi, sessiyalar (refresh-token oilasi = sessiya).
    b) [ ] Общие: amoCRM'da «Язык» yo'q (u profilda) → olib tashlash. «Товары» (katalog yoqish/o'chirish) qo'shish — o'chsa
       Ro'yxatlar → Mahsulotlar va kartochkadagi «Mahsulotlar» yashiriladi. Yo'q (keyinroq, tarif/katta funksiya): Периодические
       покупки, Счета/покупки, Личные чаты, Кабинет клиента, Автоматическая загрузка больших файлов, Удаление файлов.
    c) [ ] Безопасность: amoCRM'da faqat «Белый список IP-адресов» + «Резервное копирование». Bizdagi «Смена пароля» → profilga.
       «Резервное копирование» qo'shish (admin barcha ma'lumotni JSON arxiv qilib yuklab oladi).
    d) [ ] Чаты и мессенджеры: amoCRM'da kanal ulash bloki yo'q (u amoМаркет'da) → Telegram blokini olib tashlash (Integratsiyalarda
       bor). Qo'shish: «Меню imBox + центр нотификаций» / «Центр нотификаций» tanlovi, «Отмечать событие, если превышено время
       ответа на сообщение» (daqiqa). Beseda qoidalari matni amoCRM'dagidek («…в последнем созданном покупателе…» bizda покупатели
       yo'q — sdelka). Pro-tarif bloklari (Список ботов, Онлайн чаты, Сокращать ссылки, Типовые вопросы, Обращения и NPS) — keyin.
    e) [ ] Пользователи: amoCRM'da guruhlar (otdel: ADMINS, CALL CENTRE…) rollardan alohida; «ГРУППА» ustuni guruhni ko'rsatadi.
    f) [ ] Chap panel: amoCRM tartibi — Общие настройки, Счет и оплата, Пользователи, Чаты и мессенджеры, Безопасность, amoAI,
       keyin o'rnatilgan vidjetlar (Telegram, WhatsApp…). Bizda Счет и оплата / amoAI kerak emas (o'z serverimiz) — qolgani bir xil.

38. [ ] (foydalanuvchi so'rovi 26.10) BARCHA bo'limlar amoCRM bilan har bir detalda — 34-37-bandlardagi usulda: avval amoCRM'da
    bo'lim qanday ishlashini, nomlar, joylashuv, filtrlar, menyular, holatlar, bo'sh holat matnlarini o'rganish (faqat ko'rish),
    keyin bizdagi bilan birma-bir solishtirib farqlar ro'yxatini shu yerga yozish va bir xil qilish. Navbat:
    a) Ish stoli  b) Bitimlar (voronka, ro'yxat, kartochka, saralanmagan, dublikatlar, import)  c) imBox  d) Vazifalar (ro'yxat,
    kalendar)  e) Ro'yxatlar (kontaktlar, kompaniyalar, mahsulotlar, kartochkalar)  f) Analitika (barcha hisobotlar, Список
    событий, Звонки, Цели)  g) AI-agentlar va botlar  h) amoМаркет / integratsiyalar  i) Sozlamalar (37-band)  j) umumiy: chap menyu,
    bildirishnomalar, akkaunt paneli, qidiruv.

## Kutilayotgan so'rovlar (navbati kelganda)
- Ruscha til — asos qo'shildi (i18n.jsx, uz/ru, akkaunt panelida almashtirish). Qolgani: har bir yangi bo'lim
  matnlari tarjimasi; Sozlamalar → Umumiy sozlamalarga "Til" maydoni (9-bosqich).
