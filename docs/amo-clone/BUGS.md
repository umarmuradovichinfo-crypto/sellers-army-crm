# Xatolar va amoCRM'dan farqlar ro'yxati

Format: `- [ ] [bo'lim] tavsif — qanday takrorlanadi` · tuzatilgach `[x]` + qisqa izoh.

## Ochiq
- [ ] [Analitika/Sotuv tahlili] Tor ekranda (≤800px) bloklar ustma-ust — /stats/pipeline
- [ ] [Market] "O'rnatilganlar" tabi bo'sh, ulangan integratsiyalar ko'rinmaydi — /amo-market
- [ ] [Analitika/Voqealar] "Qiymat oldin" ustuni bo'sh — backend activity before/after saqlamaydi
- [ ] [Ro'yxatlar] Kontakt/kompaniyada mas'ul (assigneeId) va teglar yo'q; ro'yxat 200 ta bilan cheklangan
- [ ] [Bildirishnomalar] Panel ochilganda avtomatik o'qilgan qilinmaydi (amoCRM qiladi) — tekshirish kerak
- [ ] [Bitim kartochkasi] "Sozlash" tabi /settings/fields/leads ga o'tadi — sahifa yozilmoqda

## Tuzatilgan
- [x] [Analitika] O'rtacha davomiylik "11k." (ming deb o'qilardi) — "11 kun" / ru "11д."
- [x] [Qobiq] Yopiq akkaunt paneli chap menyuni qoplab turardi — visibility bilan yashirildi
- [x] [Voronka] Ustun sarlavhalari 65px pastga siljigan edi (sticky konteyner) — scroll konteyner tuzatildi
- [x] [Umumiy] Yangi `.amo-*` klasslar eski styles.css bilan to'qnashdi — `ac-` prefiksiga o'tkazildi
