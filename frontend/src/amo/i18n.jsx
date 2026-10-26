// Ikki tillilik: o'zbekcha (asosiy) va ruscha (amoCRM'dagi asl nomlar).
// Kalit — o'zbekcha matnning o'zi: t("Bitimlar") → ru'da "Сделки".
import React, { createContext, useContext, useEffect, useState } from 'react'

const KEY = 'amo_lang'

const RU = {
  // Chap menyu
  'Mahkamlash': 'Закрепить',
  'profil': 'профиль',
  'chiqish': 'выйти',
  'Nusxalash': 'Копировать',
  'Parolni almashtirish': 'Смена пароля',
  'Joriy parol': 'Текущий пароль',
  'Yangi parol': 'Новый пароль',
  'Parolni takrorlang': 'Повторите пароль',
  "Yig'ish": 'Свернуть',
  'Akkaunt': 'Аккаунт',
  'Ish stoli': 'Рабочий стол',
  'Bitimlar': 'Сделки',
  'Vazifalar': 'Задачи',
  "Ro'yxatlar": 'Списки',
  'Analitika': 'Аналитика',
  'Sozlamalar': 'Настройки',
  'Market': 'Маркет',
  'Barcha bitimlar': 'Все сделки',
  'Arxivdagi voronkalar': 'Архивные воронки',
  'Belgilandi': 'Выбрано',
  'AI-agentlar va botlar': 'AI-агенты и боты',
  'Salesbot ishga tushdi': 'Запущен Salesbot',
  'xabar yuborilmadi': 'сообщение не отправлено',
  "bitimda faol chat yo'q": 'нет активного чата',
  "reaksiya qo'yilmadi": 'реакция не поставлена',
  'xato': 'ошибка',
  "Tanlangan bitimlar o'chirilsinmi?": 'Удалить выбранные сделки?',
  'Bitimlar topilmadi': 'Сделки не найдены',
  "so'm": "so'm",
  // server voqea matnlari (activityText.js)
  'Saralanmagandan qabul qilindi': 'Принято из неразобранного',
  'Suhbat yopildi': 'Беседа закрыта',
  'Kontakt biriktirildi': 'Прикреплён контакт',
  'Kontakt uzildi': 'Откреплён контакт',
  "Mas'ul (ommaviy)": 'Ответственный (массово)',
  'Formadan keldi': 'Из формы',
  'Vazifa yaratildi': 'Задача создана',
  'Yangi bitim yaratildi': 'Создана новая сделка',
  'Bitim asosida yaratildi': 'Создана на основе сделки',
  'Webhook yuborildi': 'Webhook отправлен',
  "Bosqich o'zgartirildi": 'Этап изменён',
  "Ochiq vazifalar yo'q": 'Нет открытых задач',
  'Yakunlangan vazifalar': 'Завершено задач',
  'Maydon yangilandi': 'Поле обновлено',
  'Telegram xabar yuborildi': 'Отправлено сообщение в Telegram',
  'Salesbot ishga tushirildi': 'Salesbot запущен',
  'Bildirishnoma yuborildi': 'Уведомление отправлено',
  "Teg qo'shildi": 'Добавлен тег',
  'Teg olib tashlandi': 'Удалён тег',
  'Tanlandi': 'Выбрано',
  'ms§Hammasi': 'Все',
  'Bosqich': 'Этап',
  'Avtomatlashtirish': 'Автоматизация',
  'Dublikat': 'Дубль',
  'Vazifalar yakunlandi': 'Задачи завершены',
  'Birlashtirilgan dublikatlar': 'Объединено дублей',
  'Avtomatik vazifa': 'Автоматическая задача',
  'Yangi lid biriktirildi': 'Назначена новая сделка',
  'Sizga lid biriktirildi': 'Вам назначена сделка',
  'Bugungi vazifa': 'Задача на сегодня',
  'Mijoz havolani ochdi': 'Клиент перешёл по ссылке',
  'Kechikkan vazifa': 'Просроченная задача',
  'Yangi bitim biriktirildi': 'Назначена новая сделка',
  'Formadan yangi lid': 'Новая заявка',
  "Formadan dublikat so'rov": 'Повторная заявка',
  'Telegram xabar': 'Сообщение Telegram',
  'Yangi vazifa': 'Новая задача',
  'Sizga biriktirilgan lidlar': 'Вам назначено сделок',
  'Asosiy voronka': 'Основная воронка',
  'Voronka': 'Воронка',
  "Ro'yxat": 'Список',
  // Yuqori panel
  'Qidiruv va filtr': 'Поиск и фильтр',
  'Filtr': 'Фильтр',
  'Topish': 'Найти',
  'Voronkani sozlash': 'Настроить воронку',
  'Yangi bitim': 'Новая сделка',
  'Import': 'Импорт',
  'Eksport': 'Экспорт',
  'Dublikatlarni qidirish': 'Поиск дублей',
  // Voronka
  'Saralanmagan': 'Неразобранное',
  "So'rovlar": 'Заявок',
  "Tez qo'shish": 'Быстрое добавление',
  'Bitim nomi': 'Название сделки',
  'Kontakt: F.I.Sh.': 'Контакт: Ф.И.О.',
  'Kontakt: telefon': 'Контакт: Телефон',
  'Byudjet': 'Бюджет',
  "Qo'shish": 'Добавить',
  'Bekor qilish': 'Отмена',
  'dan': 'от',
  'Forma': 'Форма',
  "Yangi so'rov": 'Новая заявка',
  'Qabul qilish': 'Принять',
  'Rad etish': 'Отклонить',
  "O'chirish": 'Удалить',
  'Yopildi va amalga oshmadi': 'Закрыто и не реализовано',
  'Muvaffaqiyatli amalga oshirildi': 'Успешно реализовано',
  "Yo'qotish sababi": 'Причина отказа',
  'Sababsiz': 'Без причины',
  "Vazifa yo'q": 'Нет задач',
  "Muddati o'tgan": 'Просрочена',
  'Bugun': 'Сегодня',
  'Kecha': 'Вчера',
  'Ertaga': 'Завтра',
  'Muddatsiz': 'Без срока',
  // Filtr
  'Ochiq bitimlar': 'Открытые сделки',
  'Faqat mening bitimlarim': 'Только мои сделки',
  'Muvaffaqiyatli yakunlangan': 'Успешно завершенные',
  'Amalga oshmagan bitimlar': 'Нереализованные сделки',
  'Vazifasiz bitimlar': 'Сделки без задач',
  "Vazifasi muddati o'tgan bitimlar": 'Сделки с просроченными задачами',
  'Bitim xususiyatlari': 'Свойства сделок',
  'Butun vaqt uchun': 'За все время',
  'Oxirgi 7 kun': 'Последние 7 дней',
  'Oxirgi 30 kun': 'Последние 30 дней',
  'Menejerlar': 'Менеджеры',
  'Vazifalar: barcha qiymatlar': 'Задачи: Все значения',
  'Vazifasiz': 'Без задач',
  'Bugungi': 'На сегодня',
  'Kelajakdagi': 'Будущие',
  'Teglar': 'Теги',
  'Boshqarish': 'Управление',
  'Teg topish': 'Найти тег',
  "Qo'llash": 'Применить',
  'Tozalash': 'Сбросить',
  // Akkaunt / bildirishnomalar
  'Chiqish': 'Выход',
  "Qorong'i": 'Тёмная',
  "Yorug'": 'Светлая',
  'Til': 'Язык',
  "Bildirishnomalar yo'q": 'Нет уведомлений',
  "Hammasini o'qilgan qilish": 'Отметить все прочитанными',
  'Vazifa': 'Задача',
  'Bitim': 'Сделка',
  'notif§Eslatma': 'Упоминание',
  'Xabar': 'Сообщение',
  'Foydalanuvchi': 'Пользователь',
}

const DICTS = { ru: RU }

// Bo'limlar o'z lug'atini qo'shadi: addRu({ 'Kontaktlar': 'Контакты' })
export function addRu(dict) { Object.assign(RU, dict) }

export function getLang() {
  try { return localStorage.getItem(KEY) || 'uz' } catch { return 'uz' }
}

const Ctx = createContext({ lang: 'uz', setLang: () => {}, t: (s) => s })

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(getLang())
  useEffect(() => { document.documentElement.lang = lang }, [lang])
  const setLang = (l) => { setLangState(l); try { localStorage.setItem(KEY, l) } catch { /* */ } }
  // Kontekstli kalit "ctx§matn": bir xil o'zbekcha so'z turli bo'limda turlicha tarjima qilinsa (masalan
  // kartochkada "Mas'ul" → "Отв-ный", jadvalda → "Ответственный"). Tarjima bo'lmasa — matnning o'zi.
  const t = (s) => {
    const d = DICTS[lang]
    if (d && d[s]) return d[s]
    const i = typeof s === 'string' ? s.indexOf('§') : -1
    if (i < 0) return s
    const base = s.slice(i + 1)
    return (d && d[base]) || base
  }
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>
}

export const useI18n = () => useContext(Ctx)
export const useT = () => useContext(Ctx).t

// Son bilan so'z: uz → "5 ta bitim", ru → "5 сделок" (1 сделка, 2 сделки, 5 сделок)
const RU_FORMS = {
  bitim: ['сделка', 'сделки', 'сделок'],
  vazifa: ['задача', 'задачи', 'задач'],
  kontakt: ['контакт', 'контакта', 'контактов'],
  element: ['элемент', 'элемента', 'элементов'],
  "so'rov": ['заявка', 'заявки', 'заявок'],
  voqea: ['событие', 'события', 'событий'],
  kun: ['день', 'дня', 'дней'],
}
export function usePlural() {
  const { lang } = useI18n()
  return (n, word) => {
    if (lang !== 'ru' || !RU_FORMS[word]) return word === 'kun' ? `${n} kun` : `${n} ta ${word}`
    const f = RU_FORMS[word]
    const m10 = n % 10, m100 = n % 100
    const form = m10 === 1 && m100 !== 11 ? f[0] : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? f[1] : f[2]
    return `${n} ${form}`
  }
}
