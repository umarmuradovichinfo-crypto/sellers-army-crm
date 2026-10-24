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
11. [ ] Yakuniy to'liq test va diagnostika: butun tizim, barcha bo'limlar o'zaro bog'liqligi (bitim → kontakt → vazifa → analitika), xatolar ro'yxati va tuzatish
12. [x] Funksiyalar pariteti: amoCRM'dagi har bir bo'lim, funksiya, tugma, detal ro'yxati (FEATURES.md) — bizda bor/yo'q;
    yo'qlari qo'shiladi
13. [ ] Bog'liq mantiq testi: funksiyalar bir-biriga ta'siri (bitim bosqichi → avtomatlashtirish → vazifa → bildirishnoma → analitika;
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
17. [ ] Yakuniy dizayn solishtirish 1:1: har bir ekran amoCRM bilan yonma-yon (o'lcham, rang, shrift, joylashuv, animatsiya; desktop + mobil), farqlar tuzatiladi

18. [x] Tarmoq nazoratchisi / offline rejim: /health ping, GET retry, yozuvlar navbati (Idempotency-Key), banner, PWA app-shell
19. [x] Bitimlar filtrlari/saralash/statistika amoCRM bilan 1:1 (FILTERS-SPEC.md) — 256 ta tekshiruv psql bilan mos (qa/filtrlar.md)
    - [x] Analitika sahifasiga ham to'liq filtr paneli (amoCRM .analytics-sidebar: davr, voronka, menejerlar, qo'shimcha maydonlar, UTM, «Применить»)
20. [x] Meta Connector Railway'da (sellers-army-crm-production.up.railway.app) — FB_APP_SECRET foydalanuvchi kiritadi

21. [x] Instagram Direct/izohlar + Facebook Messenger connector orqali (bir tugma) → imBox; Meta obunalari ok
23. [x] CRM'ni Railway'ga joylash (HTTPS, Postgres): https://crm-production-5e25.up.railway.app (servis `crm`, branch amo-clone)
    - [x] Foydalanuvchi birinchi admin yaratadi va "Facebook bilan ulash"ni haqiqiy sahifa bilan sinaydi
24. [~] Lid kartochkasi amoCRM bilan 1:1: akkauntdan har bir detal (sarlavha, teglar, status, tablar, maydonlar tartibi va ko'rinishi,
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
25. [~] (USTUVOR, foydalanuvchi so'rovi 24.10) amoCRM'ni qaytadan to'liq ko'rib chiqish va CRM'ni har bo'lim bo'yicha
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

29. [ ] (25.10 audit) «AI-агенты и боты» bo'limi (/agents-and-bots): «Ваши боты — Список ботов» (nom, triggerlar, konversiya,
    jami ishga tushish), Salesbot konstruktori (xabar yuborish, tugmalar, javobni kutish, shartlar, harakatlar: bosqich/teg/vazifa/maydon)
    — Telegram/Instagram/Messenger chatlarida ishlaydi, voronka triggerlarida «Salesbot» harakati. Taxminan 6–10 soat. FOYDALANUVCHI TASDIG'I KUTILMOQDA.
30. [ ] (25.10 audit) amoCRM «Амма» AI-yordamchisi (ish stolidagi chat oynasi + o'ng pastdagi avatar): CRM bo'yicha savollarga javob,
    statistikalar. LLM API kaliti kerak. FOYDALANUVCHI TASDIG'I KUTILMOQDA.
    («Покупатели» bo'limi bu akkauntda o'chirilgan — ochilganda ish stoliga qaytaradi, shuning uchun klonlanmaydi.)

## Kutilayotgan so'rovlar (navbati kelganda)
- Ruscha til — asos qo'shildi (i18n.jsx, uz/ru, akkaunt panelida almashtirish). Qolgani: har bir yangi bo'lim
  matnlari tarjimasi; Sozlamalar → Umumiy sozlamalarga "Til" maydoni (9-bosqich).
