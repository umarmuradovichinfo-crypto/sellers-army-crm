# Xatolar va amoCRM'dan farqlar ro'yxati

Format: `- [ ] [bo'lim] tavsif — qanday takrorlanadi` · tuzatilgach `[x]` + qisqa izoh.

## Ochiq
- [ ] [Analitika/Sotuv tahlili] Tor ekranda (≤800px) bloklar ustma-ust — /stats/pipeline
- [ ] [Market] "O'rnatilganlar" tabi bo'sh, ulangan integratsiyalar ko'rinmaydi — /amo-market
- [ ] [Analitika/Voqealar] "Qiymat oldin" ustuni bo'sh — backend activity before/after saqlamaydi
- [ ] [Ro'yxatlar] Kontakt/kompaniyada mas'ul (assigneeId) va teglar yo'q; ro'yxat 200 ta bilan cheklangan
- [ ] [Bildirishnomalar] Panel ochilganda avtomatik o'qilgan qilinmaydi (amoCRM qiladi) — tekshirish kerak
- [ ] [Bitim kartochkasi] "Sozlash" tabi /settings/fields/leads ga o'tadi — sahifa yozilmoqda

- [ ] [i18n/backend] Server yasagan matnlar (bildirishnomalar "Kechikkan vazifa: …", lenta voqealari "Lid yaratildi", "Bosqich: …") faqat o'zbekcha — backend tur+parametr qaytarishi, frontend tarjima qilishi kerak
- [ ] [i18n] Bir xil kalit turli lug'atlarda turli tarjimada ('kun' → 'дня' / 'дн.') — global lug'atda oxirgisi yutadi
- [ ] [imBox] Suhbat raqami (A####) va xabar muallifi backend'dan kelmaydi — hisoblangan qiymat ishlatilyapti
- [ ] [Voronka sozlash] "Saralanmagan" va "Dublikatlar nazorati" switch'lari faqat localStorage'da, hech narsaga ta'sir qilmaydi
- [ ] [Bitimlar] Import sahifasi (/leads/import) yo'q
- [ ] [Filtr] "Teglar → Boshqarish" havolasi /settings/tags — sahifa yo'q (amoCRM: teglarni boshqarish oynasi)
- [ ] [Saralanmagan] "Rad etish" tasdiqsiz o'chiradi — amoCRM'da rad etish sababi so'raladi, tekshirish kerak

## Tuzatilgan
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
