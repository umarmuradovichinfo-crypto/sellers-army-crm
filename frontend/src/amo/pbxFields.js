// «Настройка АТС» modul formalari: har tur uchun maydonlar (OnlinePBX paneli bilan 1:1, docs/amo-clone/PBX-CLONE.md).
// kind: text | int | bool | password | select | target (keyingi modul) | members (101;102) | qmembers (101:1;102:2) | menu (1:101;2:5200) | textarea | schedule | forwards | access | notify
// ro'yxat bo'limlari tartibi (OnlinePBX: Номера, Правила по времени, Приветствия, Группы, Пользователи …)
export const TYPE_ORDER = ['trunk', 'numrule', 'timerule', 'greeting', 'voicemail', 'http', 'alias', 'postcall', 'group', 'queue', 'user']
// «Добавить модуль» chap ro'yxati tartibi (OnlinePBX bilan bir xil); smart — o'chirilgan («Умный перевод»)
export const ADD_ORDER = ['user', 'trunk', 'telegram', 'numrule', 'timerule', 'greeting', 'voicemail', 'smart', 'http', 'alias', 'postcall', 'group', 'queue']
export const TYPE_LABEL = {
  trunk: 'pbx§Raqam', timerule: 'pbx§Vaqt qoidasi', greeting: 'pbx§Salomlashish', group: 'pbx§Guruh', queue: 'pbx§Navbat', voicemail: 'pbx§Ovozli pochta',
  http: 'pbx§HTTP-so\'rov', alias: 'pbx§Psevdonim', postcall: 'pbx§Qo\'ng\'iroqdan keyingi ishlov', numrule: 'pbx§Raqam bo\'yicha qoida', telegram: 'pbx§Telegram raqam', user: 'pbx§Foydalanuvchi', smart: "pbx§Aqlli o'tkazish",
}
export const SECTION_LABEL = {
  trunk: 'pbx§RAQAMLAR', timerule: 'pbx§VAQT QOIDALARI', greeting: 'pbx§SALOMLASHISHLAR', group: 'pbx§GURUHLAR', queue: 'pbx§NAVBATLAR', voicemail: 'pbx§OVOZLI POCHTA',
  http: 'pbx§HTTP-SO\'ROVLAR', alias: 'pbx§PSEVDONIMLAR', postcall: 'pbx§QO\'NG\'IROQDAN KEYINGI ISHLOV', numrule: 'pbx§RAQAM QOIDALARI', telegram: 'pbx§TELEGRAM RAQAMLAR', user: 'pbx§FOYDALANUVCHILAR',
}
export const DAYS = [['mon', 'pbx§Dushanba'], ['tue', 'pbx§Seshanba'], ['wed', 'pbx§Chorshanba'], ['thu', 'pbx§Payshanba'], ['fri', 'pbx§Juma'], ['sat', 'pbx§Shanba'], ['sun', 'pbx§Yakshanba']]
export const ACCESS = [['ats', 'pbx§ATS va integratsiya'], ['analytics', 'pbx§Biznes-analitika'], ['quality', 'pbx§Sifat bahosi'], ['clients', 'pbx§Mijozlar'], ['billing', 'pbx§To\'lov va raqamlar'], ['profile', 'pbx§Profil']]
export const NOTIFS = [['missed', 'pbx§O\'tkazib yuborilgan'], ['callback', 'pbx§Qayta qo\'ng\'iroq'], ['license', 'pbx§Litsenziya muddati'], ['failures', 'pbx§Nosozliklar'], ['weekly', 'pbx§Haftalik hisobot'], ['quality', 'pbx§Sifat bahosi'], ['news', 'pbx§Yangiliklar'], ['balance', 'pbx§Balans']]
export const TZ = ['UTC-5', 'UTC+0', 'UTC+1', 'UTC+2', 'UTC+3', 'UTC+4', 'UTC+5', 'UTC+6', 'UTC+7', 'UTC+8', 'UTC+9']

const FWD = { key: 'forwardTo', label: 'pbx§Keyingi qadam', kind: 'target' }
export const FIELDS = {
  trunk: [
    { key: 'displayName', label: 'pbx§Ko\'rinadigan nom', kind: 'text' },
    { key: 'operator', label: 'pbx§Aloqa operatori', kind: 'select', options: [['other', 'pbx§Boshqa']] },
    { key: 'login', label: 'pbx§Login', kind: 'text' },
    { key: 'password', label: 'pbx§Parol', kind: 'password' },
    { key: 'server', label: 'pbx§Server manzili', kind: 'text' },
    { key: 'sipProxy', label: 'pbx§SIP-proksi', kind: 'text' },
    FWD,
    { key: 'forwardViaNumber', label: 'pbx§Shu raqam orqali yo\'naltirish', kind: 'bool' },
  ],
  timerule: [
    { key: 'timezone', label: 'pbx§Vaqt mintaqasi', kind: 'select', options: TZ.map((z) => [z, z]) },
    { key: 'days', label: 'pbx§Ish vaqti jadvali', kind: 'schedule' },
    { key: 'holidays', label: 'pbx§Dam olish kunlari (YYYY-MM-DD, vergul bilan)', kind: 'textarea' },
    { key: 'workTo', label: 'pbx§Ish vaqtida', kind: 'target' },
    { key: 'offTo', label: 'pbx§Ish vaqtidan tashqari', kind: 'target' },
    { key: 'holidayTo', label: 'pbx§Dam olish kunida', kind: 'target' },
  ],
  greeting: [
    { key: 'audioId', label: 'pbx§Audio fayl', kind: 'audio' },
    { key: 'allowExt', label: 'pbx§Qo\'shimcha raqam kiritishga ruxsat', kind: 'bool' },
    { key: 'delaySec', label: 'pbx§Kechikish (soniya)', kind: 'int' },
    FWD,
    { key: 'menu', label: 'pbx§Menyu (tugma:raqam, masalan 1:101;2:5200)', kind: 'menu' },
  ],
  group: [
    { key: 'members', label: 'pbx§Kimga qo\'ng\'iroq (101;102;…)', kind: 'members' },
    { key: 'afterSec', label: 'pbx§Necha soniyadan keyin', kind: 'int' },
    FWD,
  ],
  queue: [
    { key: 'audioId', label: 'pbx§Audio fayl', kind: 'audio' },
    { key: 'ringSec', label: 'pbx§Xodimga jiringlash (soniya)', kind: 'int' },
    { key: 'members', label: 'pbx§Foydalanuvchilar (100:1;101:2 — ustuvorlik bilan)', kind: 'qmembers' },
    { key: 'strategy', label: 'pbx§Taqsimlash turi', kind: 'select', options: [['count', 'pbx§Soni bo\'yicha'], ['ringall', 'pbx§Hammasiga'], ['roundrobin', 'pbx§Navbat bilan'], ['random', 'pbx§Tasodifiy']] },
    { key: 'smartTransfer', label: 'pbx§Aqlli o\'tkazish', kind: 'bool' },
    { key: 'countCalls', label: 'pbx§Qaysi qo\'ng\'iroqlar hisobga olinadi', kind: 'select', options: [['all', 'pbx§Kiruvchi + chiquvchi'], ['in', 'pbx§Faqat kiruvchi'], ['out', 'pbx§Faqat chiquvchi']] },
    { key: 'greetingId', label: 'pbx§Salomlashish', kind: 'audio' },
    { key: 'announcePosition', label: 'pbx§Navbatdagi o\'rinni aytish', kind: 'bool' },
    { key: 'lang', label: 'pbx§Xabar tili', kind: 'select', options: [['ru', 'pbx§Ruscha'], ['uz', 'pbx§O\'zbekcha']] },
    { key: 'repeatSec', label: 'pbx§Takrorlash vaqti (soniya)', kind: 'int' },
    { key: 'queueSec', label: 'pbx§Navbatda turish vaqti (soniya)', kind: 'int' },
    FWD,
  ],
  voicemail: [
    { key: 'audioBefore', label: 'pbx§Yozishdan oldingi audio', kind: 'audio' },
    { key: 'audioAfter', label: 'pbx§Yozishdan keyingi audio', kind: 'audio' },
    { key: 'recordSec', label: 'pbx§Yozish vaqti (soniya)', kind: 'int' },
    { key: 'silenceSec', label: 'pbx§Jimlik vaqti (soniya)', kind: 'int' },
    FWD,
    { key: 'email', label: 'pbx§Pochtaga yuborish', kind: 'text' },
  ],
  http: [
    { key: 'timeoutSec', label: 'pbx§Taymaut (soniya)', kind: 'int' },
    { key: 'url', label: 'pbx§Adres (URL)', kind: 'text' },
    FWD,
  ],
  alias: [
    { key: 'sipNumber', label: 'pbx§SIP-raqam', kind: 'text' },
    FWD,
  ],
  postcall: [
    { key: 'staff', label: 'pbx§Xodimlar (421;424;301)', kind: 'members' },
    { key: 'handleSec', label: 'pbx§Ishlov berish vaqti (soniya)', kind: 'int' },
  ],
  numrule: [
    { key: 'mask', label: 'pbx§Maska', kind: 'text' },
    { key: 'matchTo', label: 'pbx§Mos kelsa', kind: 'target' },
    { key: 'noMatchTo', label: 'pbx§Mos kelmasa', kind: 'target' },
  ],
  telegram: [{ key: 'phone', label: 'pbx§Telegram ro\'yxatdan o\'tgan telefon', kind: 'text' }],
  user: [],
}
// Maydon qiymatlarini formadan serverga / serverdan formaga o'tkazish (matn ↔ massiv)
export const toForm = (type, cfg = {}) => {
  const c = { ...cfg }
  if (type === 'group' || type === 'postcall') for (const k of ['members', 'staff']) if (Array.isArray(c[k])) c[k] = c[k].join(';')
  if (type === 'queue' && Array.isArray(c.members)) c.members = c.members.map((m) => `${m.ext}:${m.priority}`).join(';')
  if (type === 'greeting' && Array.isArray(c.menu)) c.menu = c.menu.map((m) => `${m.key}:${m.to}`).join(';')
  if (type === 'timerule' && Array.isArray(c.holidays)) c.holidays = c.holidays.join(', ')
  return c
}
export const fromForm = (type, cfg = {}) => {
  const c = { ...cfg }
  if (type === 'greeting') c.menu = String(c.menu || '').split(/[;,]/).map((x) => x.trim()).filter(Boolean).map((x) => { const [key, to] = x.split(':'); return { key: (key || '').trim(), to: (to || '').trim() } })
  if (type === 'timerule') c.holidays = String(c.holidays || '').split(/[,\s]+/).filter(Boolean)
  return c
}
