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

## Bosqichlar

1. [x] Asos: rang tokenlari (yorug'/qorong'i), PT Sans shriftlari, tugma/input/checkbox/switch
2. [x] Qobiq: chap menyu, Bitimlar flyout, akkaunt paneli, bildirishnomalar paneli, amoCRM URL'lari
3. [~] Bitimlar
   - [x] Voronka: ustunlar, kartalar, saralanmagan, tez qo'shish, drag-and-drop, yopish zonalari, yo'qotish sababi
   - [x] Filtr paneli (presetlar, xususiyatlar, teglar)
   - [ ] Lid kartasi (/leads/detail/:id): chap maydonlar paneli, status dropdown, tablar, lenta, composer (chat/eslatma/vazifa), "…" menyu
   - [ ] Yangi bitim (/leads/add)
   - [ ] Ro'yxat ko'rinishi (/leads/list): jadval, ommaviy amallar
   - [ ] Import sahifasi ("…" menyudan)
4. [ ] Vazifalar: kun/hafta/oy, ro'yxat, kalendar, vazifa qo'shish oynasi
5. [~] Ro'yxatlar: [x] kontaktlar/kompaniyalar jadvali; [ ] kontakt/kompaniya kartochkasi (/contacts/detail, /companies/detail, /contacts/add); [ ] backend: kontakt/kompaniyaga assigneeId va teglar, bulk endpoint, 200 ta limitni olib tashlash (sahifalash), import sahifasi
6. [ ] imBox: suhbatlar ro'yxati + chat lentasi
7. [ ] Analitika: sotuv tahlili, umumiy hisobot, xodimlar hisoboti, voqealar ro'yxati, qo'ng'iroqlar, maqsadlar
8. [ ] Ish stoli: vidjetlar, davr tanlagich, voronka statistikasi
9. [ ] Sozlamalar: umumiy (til tanlash shu yerda), foydalanuvchilar, chatlar, voronka sozlash (bitim manbalari, digital pipeline)
10. [ ] Eski kodni tozalash: eski CRM.jsx, styles.css'dagi .amo-* va .crmsa-*, ishlatilmaydigan komponentlar
11. [ ] Yakuniy solishtirish: har bir ekran amoCRM bilan yonma-yon (desktop + mobil)

## Kutilayotgan so'rovlar (navbati kelganda)
- Ruscha til — asos qo'shildi (i18n.jsx, uz/ru, akkaunt panelida almashtirish). Qolgani: har bir yangi bo'lim
  matnlari tarjimasi; Sozlamalar → Umumiy sozlamalarga "Til" maydoni (9-bosqich).
