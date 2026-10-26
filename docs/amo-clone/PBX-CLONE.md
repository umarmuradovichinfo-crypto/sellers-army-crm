# OnlinePBX klon katalogi (faqat o'qish bilan o'rganilgan; akkauntda HECH NARSA o'zgartirilmagan)

Manba: panel.onlinepbx.ru (akkaunt pbx36597.onpbx.ru). Maqsad: har funksiyani 1:1 klon (PLAN 45). Parollar/loginlar yozilmaydi.

## Asosiy menyu (yuqori)
Главная · Настройка АТС ▾ (Входящие, Исходящие, Диагностика, Конфигуратор, Чёрный список, Музыка) · Звонки · Чаты · Аналитика ▾ (Статистика, Дашборд, Отчёты) · Сервисы ▾ (ИИ-менеджер, Запись разговоров, Оценка качества, Автоперезвон, Автоинформатор, Callback, Интеграция, Синтез речи и аудиофайлы) · Лицензия (/billing/license, «Активный»), «Купить номер».
Manzillar: /ats/incoming, /ats/outgoing, /ats/diagnostic, /ats/configurator, /ats/black_list, /ats/music, /calls, /chats, /statistic, /dashboard, /reports, /services/{ai_manager,record,quality_scores,auto_recall,auto_informer,callback,tts}, /integration, /billing/license.

## Главная
Kartochkalar (balans/licenziya va h.k., ba'zilari xiralashtirilgan), «Новости» (haftalik hisobot), «Сервисы» tez havolalari, «Действия» (virtual raqam ulash, foydalanuvchi qo'shish, CRM integratsiya, «Клиенты» bo'limi), «База знаний».

## Настройка АТС → Входящие (modulli qo'ng'iroq oqimi, chap «Добавить модуль»)
Modul turlari: **Пользователь, Номер, Номер Telegram, Правило по номеру, Правило по времени, Приветствие, Голосовая почта, Умный перевод, HTTP-запрос, Псевдоним, Постобработка, Группа, Очередь**.
Ro'yxat bo'limlari: НОМЕРА (+«Купить номер»), ПРАВИЛА ПО ВРЕМЕНИ, ПРИВЕТСТВИЯ, ГРУППЫ, ПОЛЬЗОВАТЕЛИ («добавлено 10 / оплачено 8»; har qatorda ichki raqam, ism, onlayn holat nuqtasi, yoqish/o'chirish toggle). Qidiruv. Har modulning o'z raqami (5100, 5000, 10, 100…), rang chizig'i, o'ngda «куда перенаправить» (keyingi modul raqami). O'ng panel — tahrir formasi: «Сохранить / Отменить / Удалить», «Как настроить?» havola.
- **Номер** (trunk): Название, Отображаемое имя, Оператор связи (Другой…), Номер, Логин, Пароль, Адрес сервера, SIP-proxy, holat «Зарегистрирован», «Перенаправить на», «Переадресация через этот номер».
- **Правило по времени**: tablar График/Выходные; Номер, Название, Часовой пояс (UTC+5), График рабочего времени (Тип: Недельный; har kun uchun oraliq «05:00-23:00» + yoqish belgisi), «В рабочее время → X», «В нерабочее время → Y».
- **Приветствие**: tablar Настройки/Меню приветствия; Номер, Название, Аудиофайл (tanlash/play/yuklash/menyu), «Разрешить ввод добавочных», Переадресация: Задержка (15 сек.), Перенаправить на.
- **Группа**: Номер, Название, «Кому звонить» (101;102;…), Переадресация: «Через сколько» (20 сек.) → «Перенаправить на»; izoh: bir vaqtda bir necha xodim/telefonga.
- **Пользователь**: tablar Основное / Переадресация (3 qator: №, «Через сколько» 15 сек., «Куда») / Доступы (Звонки: ichki raqam tanlash; belgilar: АТС и интеграция, Бизнес-аналитика, Оценка качества, Клиенты, Оплата и номера, Профиль) / Уведомления (jadval: Пропущенные, Обратный звонок, Срок действия лицензии, Сбои, Еженедельный отчёт, Оценка качества, Новости, Баланс Voximplant × E-mail / Push). Основное: Добавочный, Пароль (yangilash tugmasi), SIP-id (100@pbx….onpbx.ru), Имя, E-mail, «Принимать звонки по SIP», «Пользователь в amoCRM» (tanlash), «Приложения для звонков» (PhonerLite, ko'rsatma yuborish, mobil ilova Google Play/App Store, FMC SIM).
- **Голосовая почта**: Номер (5120…), Название, Аудио до записи, Аудио после записи (tanlash/play/yuklash), Время записи (15 сек.), Время тишины (5 сек.), Переадресация: «Перенаправить на», «Отправлять на почту».
- **Умный перевод**: modul ro'yxatda xiralashgan (litsenziyasiz/yopiq).
- **HTTP-запрос**: Номер (5300), Название, Таймаут (5 сек.), Адрес (URL), «Перенаправить на»; izoh: marshrutga so'rov joylab, qo'ng'iroq haqida ma'lumot olish va marshrutni o'z serverdan boshqarish.
- **Псевдоним**: Псевдоним, SIP-номер (@pbx….onpbx.ru), «Перенаправить на».
- **Постобработка звонка**: Название, Сотрудники (421;424;301), Время на обработку (soniya) — qo'ng'iroqdan keyin kartochkani to'ldirish vaqti.
- **Очередь**: Номер (5200), Название, Аудиофайл; РАСПРЕДЕЛЕНИЕ: Дозвон до пользователя (15 сек.), Пользователи (100:1;101:1;102:2 — prioritet bilan), Тип распределения (По количеству…), Умный перевод (toggle), Учитывать звонки (Входящие + исходящие), Приветствие (Без приветствия), Позиция в очереди (toggle), Язык сообщения (Русский), Время повтора (0 сек.); ПЕРЕАДРЕСАЦИЯ: Время в очереди (180 сек.), «Перенаправить на», qo'shimcha belgi.
- **Номер Telegram**: dialog «Подключение Telegram» — Telegram ro'yxatdan o'tgan telefon raqami → «Получить код» (akkaunt ulash).
- **Правило по номеру**: Номер (6200), Название (Фильтр), Маска (+), ПЕРЕАДРЕСАЦИЯ ПО УСЛОВИЮ: «Совпадение», «Несовпадение»; izoh: raqamlar guruhini (boshqa shahar/mamlakat) alohida marshrutga yo'naltirish.
- Modul raqamlash: har yangi modul avtomatik raqam oladi (tur bo'yicha diapazon: foydalanuvchi 100…, guruh 10, navbat 5200, ovozli pochta 5120, HTTP 5300, qoida 6200…). Modullar bir-biriga «Перенаправить на <raqam>» orqali zanjir bo'ladi.

## Настройка АТС → Исходящие
«ПРАВИЛА ИСХОДЯЩИХ»: jadval № / Название / Маска (Любой) / Вывод / Внешний номер / Для пользователей; «+ Добавить правило», Сохранить/Отменить; «Купить номер», «Как настроить?».

## Настройка АТС → Конфигуратор
Qurilma konfiguratsiyasi (avto-provisioning): Yealink SIP-Txx/W52P, Panasonic KX-TGP500/600, Cisco/Linksys/Sipura, PhonerLite. Forma: MAC-adres, Линия 1–5 → Пользователь, «Подготовить конфигурацию», «Инструкция».

## Настройка АТС → Диагностика / Чёрный список / Музыка
- **Диагностика**: tablar «Внешние номера» (SIP ID `0552233@89.126.220.164`, Название, Номер, Статус «Зарегистрирован») va «Пользователи» (SIP ro'yxatdan o'tish holati).
- **Чёрный список**: «+ Добавить номер»; format bo'yicha qat'iy moslik (+7499… va 8499… alohida); bloklangan qo'ng'iroqlar «Звонки/Статистика/Отчёты/Дашборд»da ko'rinmaydi va CRM'ga yuklanmaydi (10 daqiqadan keyin kuchga kiradi).
- **Музыка**: ikki tanlov — «Дозвон» (gudok o'rniga), «Удержание» (kutish); ikkalasi «Стандартное»; «Сохранить».

## Звонки (/calls)
Tablar «Все звонки / Разговоры»; yuqorida ikonlar (yordam, eksport, ustunlar sozlamasi), yig'ma plitalar (Все, Входящие, Исходящие, Внутренние, Пропущенные, Не перезвонили, Не дозвонились, С оценками, Callback) — bosilganda filtr.
Jadval: Тип (belgi), Время, Кто, Кому, Внешний номер, Звонок (davomiylik), Разговор, Оценка (5 nuqta), Результат («Вызов отклонён»…), «Загружен в» (AmoCRM), ijro/yuklab olish tugmalari. Pastda jami: qo'ng'iroqlar soni, suhbat vaqti, «to'liq daqiqagacha yaxlitlab», umumiy davomiylik.
Filtr paneli (o'ngda): sana (Сегодня…), Добавочный сотрудник, Оценка, Клиент (telefon), Источники, Длительность звонка (dan–gacha, soniya), Разговор (dan–gacha), «Применить».

## Чаты (/chats)
Tablar Telegram / WhatsApp; tavsif («raqamga ulang, mijozlar bilan CRM'dan yozishing»), muddat «Доступно до», «Перейти к оплате» (pullik modul), «Настройки».

## Аналитика
- **Статистика**: «Количество звонков по типу» (chiziqli grafik, tip: Входящие/Исходящие/Внутренние/Пропущенные, hover tooltip foiz bilan), eksport; kesimlar: xodim, raqam, davomiylik; guruhlash. Modul «Бизнес-аналитика» (dashboard + hisobotlar) alohida litsenziya (hozir 0 so'm, 30.12.2026 gacha).
- **Дашборд** (/dashboard): og'ir yuklanadigan sahifa (sinovda sekin).
- **Отчёты**: 4 tur — «Группа сотрудников» (qo'ng'iroq soni, suhbat vaqti), «Сотрудник» (soni, davomiylik, sifat bahosi), «Пропущенные» (kutish vaqti, liniyadagi mijozlar, qayta qo'ng'iroq), «Успешные и неуспешные звонки». Namuna: xodim kartochkasi (o'rtacha baho, kunlik o'rtacha, o'rtacha suhbat vaqti, kunlar bo'yicha ustun va chiziqli grafik), filtrlar: tashqi raqamlar, xodimlar guruhi, davr; saqlangan filtr to'plami.

## Сервисы
- **Запись разговоров**: yoqish/litsenziya, «записи доступны с <sana>», «Продлить»; **Стереозапись** (qo'shimcha; nutq analitikasi uchun).
- **Оценка качества**: tablar Настройки/Описание/Отчеты; mijoz suhbatdan keyin 1–5 baho beradi (xodim tutqichni birinchi qo'yishi shart), past baholar haqida e-mail, hisobot, «Звонки»da baho bo'yicha filtr.
- **Автоперезвон по пропущенным**: «+ Добавить правило» (test rejimida, kelajakda pullik); Правила / Описание.
- **Автоинформатор**: «+ Добавить автоинформатор»; Настройки/Описание; «Доступно звонков» (hisoblagich); TTS bilan shaxsiy xabarlar (balans, to'lov eslatmasi, aksiya, tabrik).
- **Callback виджет**: Выключен; tashrif buyuruvchi raqam qoldiradi (qayta qo'ng'iroq) yoki saytdan bepul qo'ng'iroq qiladi (garnitura); sayt skripti.
- **Синтез речи и аудиофайлы**: tablar Синтез речи / Аудиофайлы / Описание; matn → ovoz (model, amplua, balandlik, tezlik), fayl kutubxonasi; Yandex SpeechKit; narx: 1000 blok 67 470, 2500 blok 129 750, 5000 blok 223 170 so'm.
- **ИИ-менеджер** (/services/ai_manager_selarti): ko'rilmagan.

## Интеграция (/integration)
CRM: amoCRM (to'liq telefoniya vidjeti), Kommo, Bitrix24, YClients, Мой Склад. Nutq analitikasi: TQM, Транскрибация звонков, techna.uz, kotib.ai. Dasturchilarga: **Webhooks** (hodisalarni boshqa tizimlarga yuborish), **API**.

## Лицензия / to'lov (/billing/license)
Tablar Оплата / Лицензии / История платежей / Помощь. Faol litsenziyalar: «Доступ к платформе», «Запись разговоров», «Оценка качества», «Бизнес-аналитика», «N Пользователей» (sana oralig'i va summa); «Оплаченные лицензии будущих периодов» (avtomatik faollashadi); «Продлить выбранные», «Синхронизировать», «+ Добавить новую лицензию»; Завершенные; Справка (оферта, aloqa); Автоплатеж (valyuta qo'llamasa o'chiq).
**Joriy narx (so'm, bu akkaunt):** platforma ≈ 7 000/kun (≈210 000/oy), har foydalanuvchi ≈ 4 000/kun (≈120 000/oy); yozuv/baho/analitika — hozir 0. Bu akkaunt: 8 ta to'langan foydalanuvchi (≈1,17 mln so'm/oy). Bizning 50% yoki arzonroq PBX narxini shu asosda belgilash mumkin.

## Hali o'rganilmagan
«Звонки → Разговоры» tabi, ИИ-менеджер, amoCRM integratsiya sozlamalari, Webhooks va API sahifalari (hujjat: onlinepbx.evateam.ru), mobil ilova, foydalanuvchining «Клиенты» bo'limi, hisobotlarning ichki sahifalari, hisob profili/foydalanuvchi sozlamalari, «Дашборд» ichi.
