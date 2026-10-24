# Voronka sozlamalari (amoCRM Digital Pipeline) — to'liq spetsifikatsiya

Manba: foydalanuvchining amoCRM akkaunti (faqat ko'rib olingan). Skrinshotlar: amo-ref/15, 26–34.
O'zbekcha nom → amoCRM ruscha nomi.

## 1. Sahifa tuzilmasi (/settings/pipeline/leads/:id)
- Yuqori chap: voronka nomi + ⌄ (voronkalar ro'yxati, yangi voronka, nomini o'zgartirish, o'chirish).
- Yuqori o'ng: "Chiqish" (Выйти) — saqlamasdan chiqadi; "Saqlash" (Сохранить).
- Chap 290px panel "BITIM MANBALARI" (ИСТОЧНИКИ СДЕЛОК):
  - "Saralanmagan" (Неразобранное) + switch: "Kelgan so'rovlar 'Saralanmagan' bosqichida so'rov ko'rinishida tushadi".
    O'chirilsa — kiruvchi lidlar to'g'ridan-to'g'ri birinchi bosqichga bitim bo'lib tushadi (backend'da amal qilishi shart).
  - "Dublikatlar nazorati" (Контроль дублей) + switch + "Qoidalarni sozlash" (Настроить правила) → modal, 2 tab:
    - "Manbalar" (Источники): har bir ulangan manba uchun switch — qaysi manbalarda dublikat qoidasi ishlaydi.
    - "Qoidalarni sozlash" (Настройка правил):
      - Parametrlar: ☐ Telefon raqamlari mos kelishi (shu voronka bitimlarida), ☐ Email mos kelishi, "Maydon qo'shish" (custom maydon bo'yicha moslik).
        (amoCRM'dagi "Big Data" va "Piksel" — bizda yo'q, qo'shilmaydi.)
      - "Dublikat qidiriladigan voronka va bosqichlar" — multi-tanlov (default: barcha voronkalar, barcha bosqichlar).
      - "Bitim va kiruvchi so'rov ma'lumotlari to'qnashganda": ◉ Kiruvchi so'rov ma'lumotlari bilan yangilash / ○ Joriy bitim ma'lumotlarini qoldirish.
      - "Bir nechta dublikat topilganda" (3 tadan ko'p bo'lsa birlashtirilmaydi): Eng yangi bitimni yangilash / Eng eski bitimni yangilash.
      - "Birlashtirgandan keyin": ☐ Vazifa yaratish (kimga, matn).
      - Bekor qilish / Saqlash.
    - Backend: kiruvchi lid (forma, Facebook, Telegram, API) kelganda shu qoidalar bo'yicha dublikat qidiriladi va birlashtiriladi.
  - Ulangan manbalar kartochkalari (ikonka + nom + tur, bosilsa sozlamasi).
  - "+ Qo'shish" → "Bitim manbalari" katalogi modali: Telegram, Facebook, Instagram, WhatsApp, Forma konstruktori,
    Sayt-vizitka/CRM plugin (sayt formasi), Pochta, Jadvallar (import) — bizda mavjud integratsiyalar faol, qolganlari "tez orada" emas,
    ko'rsatilmaydi (amoCRM'da bo'lmaganini qo'shmaymiz, bizda ishlamaydiganini ko'rsatmaymiz).

## 2. Bosqich ustunlari
- Sarlavha: nom uppercase (bosilsa: nom tahrirlash + rang palitrasi + o'chirish), ostida rangli chiziq.
- Ustunlar orasida "⊕" — yangi bosqich qo'shish; "⠿" bilan sudrab tartiblash.
- Har bosqich ostida "Tavsif qo'shish" (Добавить подсказки) → modal "«X» bosqichi uchun tavsiflar":
  Yangi boshlovchi (Новичок) / Tajribali foydalanuvchi (Пользователь с опытом) / Usta (Мастер) — har biri uchun matn.
  Bu tavsif bitim kartochkasida bosqich ostida (foydalanuvchi darajasiga qarab) ko'rsatiladi. Backend: stage.hintsJson.
- Muvaffaqiyatli / Muvaffaqiyatsiz bosqichlari oxirida. Muvaffaqiyatsiz ustunida "YO'QOTISH SABABLARI" (ПРИЧИНЫ ОТКАЗА):
  izoh + "Sozlash" → ro'yxat (⠿ sudrab tartiblash, nomni tahrirlash, o'chirish), "Sabab qo'shish".

## 3. Triggerlar (har bosqich katagida, "⊕ Trigger qo'shish")
Katalog modali (qidiruv + kartochkalar):
1. Salesbot — bizda bot konstruktori yo'q → hozircha "Xabar yuborish" (shablon matn, kanal: bitimning chat kanali) sifatida.
2. Vazifa yaratish (Создать задачу)
3. Bitim yaratish (Создать сделку) — boshqa voronka/bosqichda nusxa bitim (kontakt bilan)
4. Xat yuborish (Отправить письмо) — SMTP sozlanmagan bo'lsa ko'rsatilmaydi
5. Webhook yuborish (Отправить webhook) — URL, POST JSON bitim ma'lumoti bilan
6. Bosqichni o'zgartirish (Смена статуса) — voronka + bosqich
7. Teglarni tahrirlash (Редактировать теги) — qo'shish / olib tashlash
8. Vazifalarni yakunlash (Завершить задачи) — bitimning ochiq vazifalarini yopish (natija matni)
9. Mas'ulni o'zgartirish (Сменить ответственного) — foydalanuvchi yoki navbat bilan (round-robin) guruh ichida
10. Maydonni o'zgartirish (Изменить поле) — maydon + qiymat
11. Fayllarni o'chirish — bizda fayl yo'q, qo'shilmaydi. Businessbot, Anketa generatsiyasi — yo'q.

Har bir trigger formasi (umumiy qism):
- "Quyidagi bitimlar uchun:" (Для всех сделок, у которых) — "Shart qo'shish": Teglar, Mas'ul, Byudjet, Manba,
  UTM maydonlari (utm_source, utm_medium, utm_campaign, utm_content, utm_term), barcha custom maydonlar. Har shart: maydon + qiymat.
- "Bajarish:" (Выполнить) — guruhlangan ro'yxat:
  - VORONKA TRIGGERLARI: [Darhol ⌄] bosqichda yaratilgandan keyin / bosqichga o'tgandan keyin / o'tgan yoki yaratilgandan keyin;
    Mas'ul o'zgarganda. ("Darhol" o'rnida kechikish: 5 daqiqa, 10 daqiqa, 1 soat, 1 kun, boshqa)
  - VAQT TRIGGERLARI: [maydon-sana]dan N soat oldin; Aniq vaqtda; Har kuni soat X da.
  - MIJOZ HARAKATLARI: Kiruvchi qo'ng'iroqda; (anketa, xat, sayt — bizda yo'q).
  - SUHBAT TRIGGERLARI: Kiruvchi xabar bilan suhbat yaratilganda (istalgan manba / tanlangan); oxirgi kiruvchi xabardan N soat o'tganda;
    birinchi kiruvchi xabarda.
- Amalga xos maydonlar (masalan "Vazifa yaratish"): Muddat (Darhol / kun oxirigacha / N kun / N soat), Kimga (joriy mas'ul / foydalanuvchi),
  Tur (Bog'lanish, Uchrashuv, ...), ☐ Foydalanuvchilar uchun tavsif qo'shish, Izoh matni.
- Tugmalar: Tayyor / Bekor qilish / O'chirish; switch (faol/faol emas).
- Katakdagi kartochka: ikonka + "Bosqichga o'tgandan keyin" + qalin amal nomi + qisqa parametr (masalan "Teg qo'shish: Marketing").

## 4. Backend talablari
- Automation modeli: trigger (event + delay + schedule), conditions[], action{type, params}, stage/pipeline, active.
- Dvigatel: event'lar (lead_created, stage_enter, assignee_changed, message_in, conversation_created, call_in) → shartlar → kechikish navbati
  (DB jadval + cron tick) → amal. Vaqt triggerlari cron orqali.
- Har bajarilish Activity'ga yoziladi ("Avtomatlashtirish: ...") — bitim lentasida ko'rinadi.
- Dublikat qoidalari va "Saralanmagan" switch — AppSetting (har voronka uchun) va kiruvchi lid oqimida qo'llanadi.
- Bosqich tavsiflari — CrmStage.hintsJson.

## 5. Umumiy sozlamalar (/settings/general) — amoCRM bilan 1:1
amoCRM: Asosiy sozlamalar bloki (Akkaunt nomi, Manzil (subdomen), Vaqt mintaqasi, Mamlakat, Sana formati, Vaqt formati, Valyuta,
Kontakt ismlari tartibi) + pastda switch'li bloklar: "Davriy xaridlar", "Hisob/xaridlar", ... (bizda yo'qlari ko'rsatilmaydi).
Bizda qo'shimcha: Til (O'zbekcha/Русский). Saqlangan sana/vaqt formati, valyuta va vaqt mintaqasi BUTUN ilovada qo'llanadi (format.js).
