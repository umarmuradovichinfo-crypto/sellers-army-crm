# Narx va foyda hisobi (26.10.2026)

Asos: amoCRM «Счет и оплата» sahifasi (decopoluzz, so'm / foydalanuvchi / oy): Базовый 79 000, Расширенный 179 000, Профессиональный 259 000.
Bizning narx = amoCRM'ning 50%. Dono tarifga kirmaydi (mijoz o'z kalitini qo'yib yoqadi).

| Tarif | Bizning narx (so'm/foyd./oy) | USD (1$=12 500) |
|---|---|---|
| Bazoviy | 39 500 | 3,16 |
| Kengaytirilgan | 89 500 | 7,16 |
| Professional | 129 500 | 10,36 |

Eng kam davr: 3 oy (amoCRM'da 6 oy; foydalanuvchi qarori 26.10). Davrlar: 3, 6 oy — chegirmasiz; 9 oy — 8 oy haqi (1 sovg'a); 1 yil — 10 oy haqi; 2 yil — 18 oy haqi.
amoCRM 1 foydalanuvchi uchun (tekshirilgan, «Счет и оплата»): Bazoviy 6 oy 474 000 / 9 oy 632 000 / 1 yil 790 000 / 2 yil 1 422 000; Kengaytirilgan 179 000×; Professional 259 000× (xuddi shu koeffitsientlar).

## Qo'lda to'lov oqimi (amalga oshirilgan: PLAN 42)
Mijoz Sozlamalar → «Hisob va to'lov» da tarif/foydalanuvchi/davrni tanlaydi → kartaga o'tkazadi → chekni Telegramga yuboradi →
biz tasdiqlab litsenziya kodi beramiz: `LICENSE_SECRET=… node scripts/license.mjs --plan pro --users 10 --months 12 --customer "Nom"` →
mijoz (super admin) kodni kiritadi, obuna uzayadi (kod bir marta ishlaydi, muddat oxiridan davom etadi).
Server o'zgaruvchilari: LICENSE_SECRET (maxfiy), BILLING_CARD_NUMBER, BILLING_CARD_HOLDER, BILLING_TELEGRAM (@username), BILLING_ENFORCE=1 (cheklovni yoqish; hozir o'chiq).
Sinov: 14 kun (5 foydalanuvchi). Muddat tugagach 3 kun qo'shimcha, keyin faqat o'qish (BILLING_ENFORCE=1 bo'lsa).

Xarajat (1-daraja, bitta VPS): server ~$10 + backup ~$3 + domen ~$1 = ~$14/oy, ~15 mijozgacha; 16–30 mijoz uchun 2-server (~$28).
Aralash mijoz: 50% Bazoviy, 35% Kengaytirilgan, 15% Professional, o'rtacha 5 foydalanuvchi → ~$28/mijoz/oy.
Soliq (taxminiy 4% aylanma) va ish vaqti (qo'llab-quvvatlash) hisobga olinmagan — buxgalter bilan aniqlash kerak.
