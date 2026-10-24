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
3. [~] Bitimlar
   - [x] Voronka: ustunlar, kartalar, saralanmagan, tez qo'shish, drag-and-drop, yopish zonalari, yo'qotish sababi
   - [x] Filtr paneli (presetlar, xususiyatlar, teglar)
   - [x] Lid kartasi (/leads/detail/:id): chap maydonlar paneli, status dropdown, tablar, lenta, composer (chat/eslatma/vazifa), "…" menyu
   - [x] Yangi bitim (/leads/add)
   - [x] Ro'yxat ko'rinishi (/leads/list): jadval, ommaviy amallar
   - [ ] Import sahifasi ("…" menyudan)
4. [x] Vazifalar: kun/hafta/oy, ro'yxat, kalendar, vazifa qo'shish oynasi
5. [~] Ro'yxatlar: [x] kontaktlar/kompaniyalar jadvali; [ ] kontakt/kompaniya kartochkasi (/contacts/detail, /companies/detail, /contacts/add); [ ] backend: kontakt/kompaniyaga assigneeId va teglar, bulk endpoint, 200 ta limitni olib tashlash (sahifalash), import sahifasi
6. [ ] imBox: suhbatlar ro'yxati + chat lentasi
7. [x] Analitika: sotuv tahlili, umumiy hisobot, xodimlar hisoboti, voqealar ro'yxati, qo'ng'iroqlar, maqsadlar
   - [ ] Tuzatish: sotuv tahlilida o'rtacha davomiylik "11k." chiqyapti (avgDays birligi), tor ekranda bloklar ustma-ust
   - [ ] Voqealar: "qiymat oldin/keyin" uchun backend activity'da before/after saqlash
8. [ ] Ish stoli: vidjetlar, davr tanlagich, voronka statistikasi
9. [~] Sozlamalar: [x] umumiy (til tanlash), foydalanuvchilar, chatlar, xavfsizlik; [x] Market/Integratsiyalar (OnlinePBX, Facebook, Telegram, formalar); [ ] voronka sozlash (bitim manbalari, digital pipeline); [ ] maydonlar sozlash (/settings/fields/leads)
   - [ ] Integratsiyalar: "O'rnatilganlar" tabida ulangan integratsiyalar ko'rinmayapti
   - [ ] O'z parolini o'zgartirish uchun /settings/me/password (joriy parol tekshiruvi bilan)
   - [ ] Umumiy sozlamalardagi sana/vaqt/valyuta formatlarini format.js ishlatishi
10. [ ] Eski kodni tozalash: eski CRM.jsx, styles.css'dagi .amo-* va .crmsa-*, ishlatilmaydigan komponentlar
11. [ ] Yakuniy to'liq test va diagnostika: butun tizim, barcha bo'limlar o'zaro bog'liqligi (bitim → kontakt → vazifa → analitika), xatolar ro'yxati va tuzatish
12. [ ] Funksiyalar pariteti: amoCRM'dagi har bir bo'lim, funksiya, tugma, detal ro'yxati (FEATURES.md) — bizda bor/yo'q;
    yo'qlari qo'shiladi
13. [ ] Bog'liq mantiq testi: funksiyalar bir-biriga ta'siri (bitim bosqichi → avtomatlashtirish → vazifa → bildirishnoma → analitika;
    kontakt ↔ bitim ↔ kompaniya; foydalanuvchi huquqlari → har bir bo'lim)
14. [x] Voronka sozlamalari (Digital Pipeline) amoCRM'dagi BARCHA funksiyalari bilan: manbalar, saralanmagan, dublikat qoidalari,
    har bosqich uchun barcha trigger/amal turlari, bosqich tavsiflari (podskazki), yo'qotish sabablari va h.k. — avval amoCRM'dan
    to'liq ro'yxat olinadi; umumiy sozlamalar ham 1:1
15. [ ] Integratsiyalar amoCRM mantiqi bilan 1:1 (amoCRM'da qanday ulansa — xuddi shunday):
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
    [~] Facebook Lead Ads — connector + bir tugma (ishlanmoqda)
    [ ] Instagram Direct/izohlar va Messenger — xuddi shu connector orqali
16. [ ] amoCRM akkauntini Chrome orqali TO'LIQ ko'rib chiqish (har bo'lim, har oyna, har menyu, har tugma, hover/ochilish holatlari,
    sozlamalarning har bir sahifasi) — FEATURES.md'ga ro'yxat; bizda yo'q/boshqacha bo'lgan har bir narsa amoCRM'dagi mantiq,
    dizayn, joylashuv va ko'rinish bilan 1:1 qo'shiladi; so'ng hammasi qayta test qilinadi (faqat ko'rish, akkauntda hech narsa o'zgartirilmaydi)
17. [ ] Yakuniy dizayn solishtirish 1:1: har bir ekran amoCRM bilan yonma-yon (o'lcham, rang, shrift, joylashuv, animatsiya; desktop + mobil), farqlar tuzatiladi

## Kutilayotgan so'rovlar (navbati kelganda)
- Ruscha til — asos qo'shildi (i18n.jsx, uz/ru, akkaunt panelida almashtirish). Qolgani: har bir yangi bo'lim
  matnlari tarjimasi; Sozlamalar → Umumiy sozlamalarga "Til" maydoni (9-bosqich).
