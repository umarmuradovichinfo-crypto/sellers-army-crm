# Xatolar va amoCRM'dan farqlar ro'yxati

Format: `- [ ] [bo'lim] tavsif — qanday takrorlanadi` · tuzatilgach `[x]` + qisqa izoh.

## Ochiq
- [ ] [Analitika/Voqealar] "Qiymat oldin" ustuni bo'sh — backend activity before/after saqlamaydi
- [ ] [Ro'yxatlar] Kontakt/kompaniyada mas'ul (assigneeId) va teglar yo'q; ro'yxat 200 ta bilan cheklangan
- [ ] [Bildirishnomalar] Panel ochilganda avtomatik o'qilgan qilinmaydi (amoCRM qiladi) — tekshirish kerak
- [ ] [Bitim kartochkasi] "Sozlash" tabi /settings/fields/leads ga o'tadi — sahifa yozilmoqda

- [ ] [i18n/backend] Server yasagan matnlar (bildirishnomalar "Kechikkan vazifa: …", lenta voqealari "Lid yaratildi", "Bosqich: …") faqat o'zbekcha — backend tur+parametr qaytarishi, frontend tarjima qilishi kerak
- [ ] [i18n] Bir xil kalit turli lug'atlarda turli tarjimada ('kun' → 'дня' / 'дн.') — global lug'atda oxirgisi yutadi
- [ ] [imBox] Suhbat raqami (A####) va xabar muallifi backend'dan kelmaydi — hisoblangan qiymat ishlatilyapti
- [ ] [Bitimlar] Import sahifasi (/leads/import) yo'q
- [ ] [Filtr] "Teglar → Boshqarish" havolasi /settings/tags — sahifa yo'q (amoCRM: teglarni boshqarish oynasi)
- [ ] [Saralanmagan] "Rad etish" tasdiqsiz o'chiradi — amoCRM'da rad etish sababi so'raladi, tekshirish kerak

- [ ] [Ro'yxatlar] Kontaktlar importi (/contacts/import) yo'q — menyu bandi vaqtincha olib tashlangan
- [ ] [Umumiy] Ba'zi sahifalar "bugun"ni hali brauzer vaqti bilan hisoblaydi (TasksPage, Dashboard) — format.dayKey ga o'tkazish
- [ ] [Sozlamalar] Umumiy sozlamalar saqlanganda setFormatPrefs chaqirilishi (sahifa yangilanmasdan qo'llanishi)
- [ ] [Backend] Ro'yxatlar 200/500 ta bilan cheklangan — server tomonida sahifalash kerak; kontakt kartochkasi lentasi uchun contactId filtri
- [ ] [Bitim kartochkasi] TaskNote natijani Enter bilan yuborganda trim qilmaydi

- [ ] [Xavfsizlik] Parol o'zgarganda eski refresh tokenlar bekor qilinmaydi (auth moduli)
- [ ] [Analitika] Sotuv tahlilida har bosqich "Yo'qotilgan" qatori 0 — bosqichlar tarixi saqlanmaydi (Activity before/after bilan bir ildiz)
- [ ] [Market/Formalar] Forma muharriri bosqichlarni faqat asosiy voronkadan oladi
- [ ] [Analitika] Davr chegaralari UTC/server vaqtida — akkaunt mintaqasiga moslash

- [ ] [Voronka sozlash] Vazifa triggerida "Foydalanuvchilar uchun tavsif" yo'q (LeadTask'da maydon yo'q)
- [ ] [Voronka sozlash] Dublikat qidiruvi barcha lidlarni yuklaydi — katta bazada indeks/so'rov kerak
- [ ] [Voronka sozlash] Manbalar katalogida Instagram/WhatsApp/Pochta kartochkalari yo'q (integratsiyalar bosqichi)

- [ ] [Ish stoli] Voronka blokida har bosqich ostidagi "yo'qotilganlar" 0 — bosqichlar tarixi kerak (Activity before/after)

## Tuzatilgan
- [x] [Ish stoli] Dizayn amoCRM'ga 1:1 qayta yozildi: 208px to'r, 430px vidjetlar, rgba(12,37,61,.95) fon, Open Sans 45px #8275ff raqamlar, voronka kartalari 151x92, davr tanlagich, tabiiy fon sahnalari + o'z rasmini yuklash
- [x] [Voronka sozlash] Digital Pipeline: barcha trigger/amallar, kechikish navbati, shartlar, saralanmagan switch va dublikat qoidalari backend'da ishlaydi
- [x] [Xavfsizlik] Webhook SSRF — ichki manzillar (localhost, 10/172.16/192.168/169.254, ::1, butun son IP) bloklandi, DNS tekshiruvi
- [x] [Formalar] Har yuborishda submissions 2 marta oshardi
- [x] [Analitika/Sotuv tahlili] "12 kun" bloki tablar ustiga chiqardi (ota blok balandligi 0); "Bosqichga o'tdi" o'qi bosqich qutisidan tashqarida edi — amoCRM tuzilmasiga moslandi
- [x] [Jadvallar] Checkbox ustunida yumaloq qo'sh ramka — eski styles.css `.chk` klassi; `ac-chk` ga o'tkazildi
- [x] [Umumiy] Eski CSS bilan to'qnashgan klasslar: `.dot` (qizil absolut nuqta), `.grid`, `.sb` — prefiksli nomlarga o'tkazildi
- [x] [Analitika/Sozlamalar/Market/Voronka sozlash/Ish stoli QA] 36 ta xato (batafsil: qa/analitika-sozlamalar.md) — keshdagi filtr natijalari, menejer filtri, ruxsatlar (sotuvchi o'z parolini /settings/me/password orqali), bosqich o'chirilganda bitimlar yo'qolishi, trigger xatolari, maydon validatsiyasi va h.k.
- [x] [Market] "O'rnatilganlar" bo'sh edi — demo bazada integratsiya ulanmagani sababli; ulangan integratsiya ko'rinadi (tasdiqlandi)
- [x] [Umumiy] Sana/vaqt akkaunt vaqt mintaqasida, sana/vaqt formati va valyuta Umumiy sozlamalardan (format.js setFormatPrefs)
- [x] [Vazifalar/Ro'yxatlar/Kartochkalar/imBox QA] 37 ta xato (batafsil: qa/vazifalar-royxatlar.md)
- [x] [Bitimlar QA] 18 ta xato (batafsil: qa/bitimlar.md) — lenta prefiks takrori, byudjet chegarasi, noto'g'ri sana 500, bosqich o'zgarganda voronka moslashuvi, ikki marta bosish, xato xabarlari va h.k.
- [x] [Qobiq] Akkaunt/bildirishnoma panellari Escape bilan yopilmasdi
- [x] [Bildirishnomalar] Vaqt ko'rinmasdi (frontend createdAt, backend `at` qaytaradi)
- [x] [Backend/eslatmalar] Bir vazifa uchun har kuni takroriy "Kechikkan vazifa" bildirishnomasi — har vazifa uchun bitta bugungi + bitta kechikkan
- [x] [Voronka] Tez sudrab tashlanganda karta joyidan siljimasdi (tinglovchilar React render'idan keyin ulanardi) — sinxron tinglovchilar
- [x] [i18n] "Maydonlar" ruscha tarjimasi yo'q edi
- [x] [Diagnostika] 27 ta sahifa: konsol xatosi, 4xx/5xx so'rov, bo'sh sahifa — topilmadi
- [x] [Analitika] O'rtacha davomiylik "11k." (ming deb o'qilardi) — "11 kun" / ru "11д."
- [x] [Qobiq] Yopiq akkaunt paneli chap menyuni qoplab turardi — visibility bilan yashirildi
- [x] [Voronka] Ustun sarlavhalari 65px pastga siljigan edi (sticky konteyner) — scroll konteyner tuzatildi
- [x] [Umumiy] Yangi `.amo-*` klasslar eski styles.css bilan to'qnashdi — `ac-` prefiksiga o'tkazildi
