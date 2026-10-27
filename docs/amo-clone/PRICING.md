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
mijoz (super admin) kodni kiritadi, yangi litsenziya qatori qo'shiladi (kod bir marta ishlaydi; turlari pastda — «Litsenziyalar modeli»).
Server o'zgaruvchilari: LICENSE_SECRET (maxfiy), BILLING_CARD_NUMBER, BILLING_CARD_HOLDER, BILLING_TELEGRAM (@username), BILLING_ENFORCE=1 (cheklovni yoqish; hozir o'chiq).
Imkoniyatlar (BILLING_ENFORCE=1): Bazoviy — asosiy CRM; Kengaytirilgan — + avtomatlashtirish/Salesbot, KPI va rejalar, kataloglar; Professional (va «xarajat» tarifi) — + zaxira nusxa, mijoz savollariga avto-javob. Tarifda yo'q imkoniyatni o'zgartirish 402 «PLAN_FEATURE» qaytaradi (o'qish ochiq).
Sinov: 14 kun (5 foydalanuvchi, hamma imkoniyat ochiq). Muddat tugagach 3 kun qo'shimcha, keyin faqat o'qish (BILLING_ENFORCE=1 bo'lsa).

## Litsenziyalar modeli (OnlinePBX «Лицензии» kabi, 27.10.2026)
Obuna — bitta holat emas, **litsenziya qatorlari** ro'yxati: har kod = alohida qator `{id, plan, users, from, until, type, amount}`.
- **Faol** = `from ≤ hozir < until`. O'rindiqlar = faol qatorlar `users` yig'indisi (1 + 7 = 8). Tarif = faol qatorlardagi eng yuqori (Bazoviy < Kengaytirilgan < Professional = «xarajat»).
  Tugash sanasi (endsAt) = faol qatorlarning eng kech `until`i; `paidUntil` — unga ulanib ketadigan kelajak qatorlar bilan (banner shunga qaraydi).
- **Oldindan to'langan (kelajak)** = `from > hozir`: hech narsa bermaydi, vaqti kelganda o'zi faol bo'ladi (alohida jarayon yo'q — holat har so'rovda vaqtga qarab hisoblanadi).
- Holat: `active` (kamida bitta faol) → `grace` (faol yo'q, oxirgi qator < 3 kun oldin tugagan va kelajak qator yo'q; o'rindiq/tarif — tugash arafasidagi qatorlar) → `trial` (hech qachon litsenziya bo'lmagan, 14 kun) → `expired`.
- Eski holat (`plan/users/until`) o'qishda bitta qatorga aylanadi (from = tarixdagi birinchi to'lov sanasi yoki sinov boshlanishi); birinchi yangi kodda saqlanadi. `used`, `history`, `installId` saqlanadi; `plan/users/until` qisqa xulosa sifatida yozib boriladi (eski versiyaga qaytish mosligi).

### Kunlik narx
kunlik = oylik narx / 30 (so'm / foydalanuvchi / kun): Bazoviy 1 316,67; Kengaytirilgan 2 983,33; Professional 4 316,67.
Qator summasi: renew/new — to'langan narx (davr chegirmasi bilan, `quote().total`); addon — `users × kunlik × kun` (yaxlitlab). Eski ko'chirilgan qator — `users × kunlik × kun`.

### Kod turlari (`scripts/license.mjs --type`)
| `t` | Qachondan | Qachongacha | Misol |
|---|---|---|---|
| `renew` (standart, eski kodlar) | shu tarifdagi eng kech qator oxiri (kelajakda bo'lsa), aks holda bugun | from + N oy | Kengaytirilgan 7 foyd. 28.01 gacha faol → renew 12 oy = 28.01 dan 28.01 (keyingi yil) gacha kelajak qator |
| `new` | bugun | bugun + N oy | boshqa tarifga o'tish yoki alohida guruh uchun to'liq davr |
| `addon` | bugun | faol qatorlarning eng kech `until`i (`--months` kerak emas, m=0) | 30 kun qolganda +3 Professional: 3 × 4 316,67 × 30 = 388 500 so'm; faol qator bo'lmasa — 400 `NO_ACTIVE_LICENSE` |

```
node scripts/license.mjs --plan advanced --users 7 --months 12 --install <ID>              # renew
node scripts/license.mjs --plan pro --users 1 --months 3 --type new --install <ID>        # new
node scripts/license.mjs --plan advanced --users 2 --type addon --install <ID>            # addon
```
Kod formati o'zgarmadi: `SA1.<payload>.<imzo>`, payload `{i, p, u, m, c?, d, t?}` (`t` faqat renew'dan farqli bo'lsa yoziladi). Har kod bir marta, installId'ga bog'langan; faollashtirish tranzaksiya + advisory lock ichida.
Sahifada («Hisob va to'lov») uch rejim: Uzaytirish / Foydalanuvchi qo'shish (qolgan kun × kunlik, `addonQuotes`) / Yangi litsenziya; Telegram xabarida turi, tarif, foydalanuvchilar, davr/kun, summa va O'rnatish ID.

Xarajat (1-daraja, bitta VPS): server ~$10 + backup ~$3 + domen ~$1 = ~$14/oy, ~15 mijozgacha; 16–30 mijoz uchun 2-server (~$28).
Aralash mijoz: 50% Bazoviy, 35% Kengaytirilgan, 15% Professional, o'rtacha 5 foydalanuvchi → ~$28/mijoz/oy.
Soliq (taxminiy 4% aylanma) va ish vaqti (qo'llab-quvvatlash) hisobga olinmagan — buxgalter bilan aniqlash kerak.

## «Xarajat» tarifi (yashirin, eksklyuziv mijozlar)
Narx = haqiqiy xarajat, foyda yo'q: server ulushi ($14 / shu serverdagi mijozlar soni) + backup + domen; Dono mijozning o'z kaliti bilan.
Kod: `LICENSE_SECRET=… node scripts/license.mjs --plan cost --users 5 --months 3 --customer "Nom"` — faqat to'lov kelgach. Tarif menyuda ko'rinmaydi.
3 oyga oldindan to'laydi; muddat tugasa boshqa tariflar kabi cheklanadi. Har chorakda xarajatni qayta hisoblab, keyingi davr summasini belgilang.
