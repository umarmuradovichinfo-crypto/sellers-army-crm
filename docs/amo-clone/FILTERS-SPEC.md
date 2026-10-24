# Bitimlar bo'limi — amoCRM filtrlari, saralash, statistika (akkauntdan olingan to'liq ro'yxat)

Manba: foydalanuvchining amoCRM akkaunti (faqat ko'rib olingan). Hamma narsa server tomonida ishlashi shart
(backend/src/crm/list-query.ts + crm.service.ts listLeads/getPipeline/bulk allaqachon server sahifalash bilan).

## 1. Filtr paneli (.filter-search) — chap ustun: presetlar
Открытые сделки · Только мои сделки · Успешно завершенные · Нереализованные сделки · Сделки без задач (sariq nuqta) ·
Сделки c просроченными задачами (qizil nuqta) · Требующие внимания (binafsha yulduz).
Har preset tahrirlanadi (qalam) → saqlangan filtr (SavedFilter modeli bor: crm/filters endpointlari) — foydalanuvchi o'z
filtrini nom bilan saqlaydi, ro'yxatda presetlar ostida chiqadi, o'chirish mumkin.

## 2. O'rta ustun "Свойства сделок" (Bitim xususiyatlari) — tartib aynan shu:
1. Название сделки — matn (filter[name], contains).
2. Sana bloki — ikki tugma: "created" (yaratilgan) / "closed" (yopilgan) switch + date_preset ro'yxati:
   За все время, За сегодня, За вчера, За эту неделю, За прошлую неделю, За этот месяц, За прошлый месяц, За квартал,
   За этот год, + aniq oraliq (date_from / date_to) — hamma "sana" maydonlari (custom date maydonlar: masalan "Uchrashuv sanasi",
   "Shartnoma tuzilgan sana") ham switch ro'yxatida chiqadi.
3. Статусы (bosqichlar) — multi-select, har voronka alohida guruh (filter[pipe][pipelineId][]=stageId), tepasida "Активные статусы"
   (barcha ochiq bosqichlar), "Выбрать всё", "Снять выделение"; Неразобранное ham bosqich sifatida; yutuq (142) va yo'qotish (143).
4. Причины отказа — multi-select (lost reasons + "Без причины").
5. Категория неразобранного — Тел. / Чат / Форма / Почта (unsorted_category 1..4) — bizda: Telefon, Chat, Forma, Import.
6. Источник сделки — multi-select (lead_source: ulangan manbalar — Instagram DM, Instagram comments, Facebook forma,
   Web forma, Import, Telegram, Qo'ng'iroqlar, API) — bizda Lead.source qiymatlari + integratsiya manbalari.
7. Менеджеры (mas'ul) — multi-select (suggest-manager).
8. Кем создана — multi-select foydalanuvchilar.
9. Кем изменена — multi-select foydalanuvchilar (Activity actorId bo'yicha).
10. Задачи — today / tomorrow / week / month / quarter / no_tasks / failed_tasks (muddati o'tgan).
11. Бюджет — from / to.
12. Требующие внимания — Не учитывать / Нет / Есть (problematic_leads).
13. Har bir CUSTOM maydon (bitim): select/multiselect → qiymatlar + "empty" (bo'sh); text → contains; number → from/to;
    date → yuqoridagi sana bloki; checkbox → ha/yo'q.
14. UTM maydonlari — "Выберите поле" tanlab utm_content, utm_medium, utm_campaign, utm_source, utm_term, utm_referrer, roistat,
    referrer, openstat_*, from, gclientid, _ym_uid, _ym_counter, gclid, yclid, fbclid — matn contains. (bizda Lead.customJson ichida
    utm_* kalitlari; backend forma/Facebook/sayt orqali kelganda UTM'larni customJson'ga yozishi kerak — tekshirib qo'shing).
15. Kontakt/kompaniya maydonlari bo'yicha ham filtr (amoCRM pastda "Свойства контактов", "Свойства компаний" bloklari bor):
    kontakt ismi, telefon, email, lavozim; kompaniya nomi.
Pastda: "Применить" / "Сбросить"; filtr qo'llangach yuqori qidiruv satrida tanlangan filtrlar chip ko'rinishida (x bilan olib tashlash).

## 3. O'ng ustun "Теги" — teglar ro'yxati (nechta bitimda), tanlanganlar AND; "Найти тег" qidiruv; "Управление" → /settings/tags.

## 4. Saralash (yuqori "…" menyu → Сортировка): По последнему сообщению · По последнему событию · По дате создания ·
По названию · По бюджету (asc/desc). Voronka ustunlari ham shu tartibda.

## 5. "…" menyu (Еще): Настроить воронку · Импорт · Экспорт · Внешний вид карточки (karta ko'rinishi — qaysi maydonlar
kartada: avatar, kontakt, kompaniya, telefon, email, sana, byudjet, teglar, manba, vazifa, mas'ul, custom maydonlar — localStorage
emas, foydalanuvchi sozlamasi backend'da) · Поиск дублей (dublikatlarni qidirish sahifasi: telefon/email/nom bo'yicha guruhlar,
birlashtirish) · Массовые действия (ommaviy rejim) · Автообновление (switch).

## 6. Voronka statistikasi (pipeline tepasidagi .pipeline__stats — har ustun sarlavhasi)
Har bosqich: N сделок: SUMMA (filtr qo'llanganda — filtrlangan). Yuqori o'ngda: jami "N сделок: SUMMA".
Saralanmagan: "Заявок: N".
Ro'yxat ko'rinishida ustunlar sozlanadi (ustunlar tanlash: nom, kontakt, kompaniya, telefon, email, bosqich, byudjet, mas'ul,
yaratilgan, o'zgartirilgan, yopilgan, manba, teglar, custom maydonlar), saralash har ustun bo'yicha.

## 7. Analitika → Сводный отчет/Анализ продаж filtrlari (Фильтр › paneli)
Sana bloki (yuqoridagi presetlar + oraliq), voronka(lar), menejerlar, bosqichlar, teglar, manba, custom maydonlar — ya'ni bitimlar
filtri bilan bir xil to'plam; natija: yaratilgan/yutilgan/yo'qotilgan soni va summasi, konversiya (bosqichdan bosqichga foiz),
o'rtacha chek, o'rtacha davomiylik (kun), menejerlar kesimida, manbalar kesimida, kunlar/haftalar/oylar dinamikasi.

## 8. Tekshirish talabi
Har bir filtr va statistika uchun test: demo bazada ma'lum natija (psql bilan to'g'ridan-to'g'ri hisoblab) ↔ API javobi bir xil.
