# QA: avtomatik testlar va yaxlitlik tekshiruvi

## Ishga tushirish (loyiha ildizida yoki backend papkasida)

| Buyruq | Nima qiladi |
|---|---|
| `npm run build && npm run test:e2e` | Alohida test bazasi (`sellers_crm_test`) yaratiladi, backend 8010-portda ishga tushadi, barcha API testlari va oxirida yaxlitlik tekshiruvi yuradi. Ishchi bazaga tegmaydi. |
| `npm run build && npm run test:qa` | Yuqoridagi + UI testlari (kompyuterdagi Chrome, frontend 5199-portda). |
| `npm run check:integrity` | Joriy bazada (`.env` DATABASE_URL) mantiqiy ziddiyatlarni qidiradi, faqat hisobot. |
| `npm run check:integrity -- --fix` | Xavfsiz tuzatishlar: yetim yozuvlar, yopilish sanalari, noto'g'ri bosqich/voronka. |

Bitta faylni yurgizish: `E2E_FILES=test/e2e/10-leads.test.mjs npm run test:e2e`.

## Nimalar tekshiriladi

- **API (98 test)** — `backend/test/e2e/`:
  - `00-auth`: login, token, refresh, ruxsatlar;
  - `10-leads`: bitim yaratish, validatsiya, bosqichlar, yopish, vazifalar, ommaviy amallar, birlashtirish, dublikat, qidiruv, SQL injection, CSV eksport/import, sotuvchi ruxsatlari;
  - `20-security`: parol tanlash (429), Telegram webhook kaliti, ommaviy forma va spam, iCal tokeni, boshqa foydalanuvchi ma'lumotlari;
  - `30-settings`: voronkalar, bosqichlar, majburiy maydonlar, teglar, yo'qotish sabablari;
  - `40-flows`: kontakt/kompaniya, chat, avtomatlashtirish (sikl, SSRF), Salesbot, analitika, ish stoli, foydalanuvchilar.
- **UI** — `frontend/test/ui/smoke.mjs`:
  - 33 sahifa × (UZ, RU, telefon 375px) rejimida JS xatolari, console.error, API 5xx, oq ekran, telefonda gorizontal siljish (sababchi element bilan) va RU'da tarjima qilinmagan matnlar tekshiriladi;
  - qo'shimcha amallar: izoh yozish, voronka, Amma paneli.
- **Yaxlitlik** — `backend/scripts/check-integrity.ts`, 25 ta tekshiruv:
  - noma'lum bosqichdagi bitim, voronka/bosqich nomuvofiqligi;
  - yopilish sanalari, manfiy byudjet;
  - yetim xabar, vazifa, bot va avtomatlashtirish yozuvlari;
  - o'chirilgan kontakt, kompaniya yoki mas'ulga havolalar;
  - to'liq bo'lmagan voronka, buzilgan JSON.

## Topilgan va tuzatilgan xatolar (2026-10-25)

1. Email katta harf bilan yozilsa login bo'lmasdi (telefon klaviaturasi birinchi harfni katta qiladi).
2. Bo'shliqdan iborat nom bilan bitim yaratilardi.
3. Mavjud bo'lmagan bosqichli bitim saqlanib qolar va voronkada ko'rinmasdi; bosqichsiz yaratilgan bitim tanlangan voronkaga emas, asosiy voronkaga tushardi.
4. Qayta ochilgan bitimda yo'qotish sababi qolib, statistikani buzardi; yutilgan bosqichda yaratilgan bitimga `wonAt` qo'yilmasdi. Yopilish mantig'i 5 joyda takrorlangan edi, endi `stage-close.ts` da.
5. Sotuvchiga umumiy sozlamalar yuklanmasdi (403), shuning uchun «chap menyuni rolga qarab sozlash» sotuvchilarga qo'llanmasdi.
6. Telegram webhook maxfiy kalitsiz soxta mijoz xabarlarini qabul qilardi; endi kalit avtomatik va mavjud webhook o'zi yangilanadi.
7. Login'da parol tanlashdan himoya yo'q edi; endi 10 ta xato urinishdan keyin 15 daqiqa kutish kerak.
8. Ommaviy formada spamdan himoya yo'q edi; endi bitta IP'dan 10 daqiqada 20 tagacha ariza.
9. Voronka 4 ta alohida so'rov bilan yaratilar va «yarim» qolishi mumkin edi; endi bitta tranzaksiyada.
10. Voronka o'chirilganda uning bosqichlari asosiy voronkaga qo'shilib, uni buzardi; endi bitimi bor voronkani o'chirib bo'lmaydi.
11. Ommaviy bosqich o'zgartirish majburiy maydonlarni chetlab o'tardi.
12. Telefonda 20 ta sahifada butun ekran gorizontal siljirdi (yopiq filtr panellari, keng jadvallar, statistika bloklari).
13. RU interfeysda «Bosqich: …» va avtomatlashtirish natijalari o'zbekcha qolardi.

14. OnlinePBX webhook secret berilmasa ochiq qolardi. Endi PBX ulanmagan bo'lsa hech narsa qabul qilmaydi; ulanganda secret API kalitidan avtomatik hosil qilinadi va sozlamalardagi manzilda ko'rsatiladi.
15. Paket zaifliklari (`npm audit`) ikkala tomonda 0 ga tushirildi:
    - multer 2.5.0;
    - react-router-dom 7.18.4;
    - Vite 6.4.5 (esbuild);
    - xlsx 0.20.3 (SheetJS rasmiy manbasi, chunki npm'da tuzatilgani yo'q).
16. Asosiy JS fayl 1031 KB edi. Endi sahifalar alohida yuklanadi: asosiy fayl 351 KB, React vendor 183 KB (keshlanadi).

## Eslatma

- Rate limit (login, forma) server xotirasida. Hozir 1 nusxa ishlaydi; bir nechta nusxaga o'tilsa, Redis kerak bo'ladi.
- `xlsx` paketi cdn.sheetjs.com'dan o'rnatiladi (SheetJS'ning rasmiy tarqatish manzili).
