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
- Yana ko'rilishi kerak: Голосовая почта, Умный перевод, HTTP-запрос, Псевдоним, Постобработка, Очередь, Номер Telegram, Правило по номеру formalari.

## Настройка АТС → Исходящие
«ПРАВИЛА ИСХОДЯЩИХ»: jadval № / Название / Маска (Любой) / Вывод / Внешний номер / Для пользователей; «+ Добавить правило», Сохранить/Отменить; «Купить номер», «Как настроить?».

## Настройка АТС → Конфигуратор
Qurilma konfiguratsiyasi (avto-provisioning): Yealink SIP-Txx/W52P, Panasonic KX-TGP500/600, Cisco/Linksys/Sipura, PhonerLite. Forma: MAC-adres, Линия 1–5 → Пользователь, «Подготовить конфигурацию», «Инструкция».

## Hali o'rganilmagan (navbat)
Диагностика, Чёрный список, Музыка, Звонки, Чаты, Статистика, Дашборд, Отчёты, har bir Сервис (Запись разговоров, Оценка качества, Автоперезвон, Автоинформатор, Callback, TTS/аудиофayllar, ИИ-менеджер), Интеграция (amoCRM va boshqalar, webhook/API), Лицензия va «Купить номер», Клиенты, qolgan modul turlari.
