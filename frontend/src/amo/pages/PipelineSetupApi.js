// Voronka sozlash sahifasi uchun backend chaqiruvlari (Digital Pipeline: sozlamalar, tavsiflar, yo'qotish sabablari).
import { api } from '../../lib/apiClient'

const pq = (pid) => `pipelineId=${encodeURIComponent(pid || 'main')}`

export const psApi = {
  getSettings: (pid) => api.get(`/crm/pipeline-settings?${pq(pid)}`),
  saveSettings: (pid, patch) => api.put(`/crm/pipeline-settings?${pq(pid)}`, patch),
  allStages: () => api.get('/crm/stages'),
  updateReason: (id, name) => api.put(`/crm/lost-reasons/${id}`, { name }),
  reorderReasons: (ids) => api.post('/crm/lost-reasons/reorder', { ids }),
  tags: () => api.get('/crm/tags'),
  fields: () => api.get('/crm/fields?entity=lead'),
}

// ── Trigger katalogi ──
// Bizda mavjud amallar (amoCRM: Salesbot → "Xabar yuborish"; Xat/Fayl/Anketa/Businessbot — yo'q).
export const ACTIONS = [
  { v: 'send_message', l: 'Xabar yuborish', icon: 'send' },
  { v: 'run_bot', l: 'Salesbot', icon: 'play' },
  { v: 'create_task', l: 'Vazifa yaratish', icon: 'plusCircle' },
  { v: 'create_lead', l: 'Bitim yaratish', icon: 'dollar' },
  { v: 'webhook', l: 'Webhook yuborish', icon: 'code' },
  { v: 'change_stage', l: "Bosqichni o'zgartirish", icon: 'moveStage' },
  { v: 'edit_tags', l: 'Teglarni tahrirlash', icon: 'hash' },
  { v: 'complete_tasks', l: 'Vazifalarni yakunlash', icon: 'checkCircle' },
  { v: 'change_assignee', l: "Mas'ulni o'zgartirish", icon: 'users' },
  { v: 'change_field', l: "Maydonni o'zgartirish", icon: 'edit' },
]
// Eski (legacy) amallar — mavjud yozuvlar ko'rinishi uchun
const LEGACY = {
  add_tag: { l: 'Teglarni tahrirlash', icon: 'hash' },
  remove_tag: { l: 'Teglarni tahrirlash', icon: 'hash' },
  set_assignee: { l: "Mas'ulni o'zgartirish", icon: 'users' },
  set_field: { l: "Maydonni o'zgartirish", icon: 'edit' },
  add_note: { l: "Izoh qo'shish", icon: 'note' },
  notify: { l: 'Bildirishnoma', icon: 'bell' },
}
export const actionMeta = (type) => ACTIONS.find((a) => a.v === type) || LEGACY[type] || ACTIONS[1]

// Avtomatlashtirish "Vazifa yaratish": vazifa turlari (o'z turlari ham) — taskTypes.js'dan
import { TASK_TYPES as ALL_TASK_TYPES } from '../taskTypes'
export const TASK_TYPES = { map: (fn) => ALL_TASK_TYPES.map((x) => ({ v: x.key, l: x.label })).map(fn), find: (fn) => ALL_TASK_TYPES.map((x) => ({ v: x.key, l: x.label })).find(fn) }
export const FIELD_TARGETS = [
  { v: 'name', l: 'Nomi' }, { v: 'budget', l: 'Byudjet' }, { v: 'source', l: 'Manba' }, { v: 'company', l: 'Kompaniya' },
  { v: 'phone', l: 'Telefon' }, { v: 'email', l: 'Email' },
]

// ── Trigger turlari (Bajarish: ro'yxati) ──
export const DELAYS = [{ v: 0, l: 'Darhol' }, { v: 5, l: '5 daqiqa' }, { v: 10, l: '10 daqiqa' }, { v: 60, l: '1 soat' }, { v: 1440, l: '1 kun' }]
export const WHEN_GROUPS = [
  {
    g: 'VORONKA TRIGGERLARI',
    items: [
      { v: 'lead_created', l: 'bosqichda yaratilgandan keyin', delay: true },
      { v: 'stage_enter', l: "bosqichga o'tgandan keyin", delay: true },
      { v: 'created_or_enter', l: "bosqichga o'tgan yoki yaratilgandan keyin", delay: true },
      { v: 'assignee_changed', l: "Mas'ul o'zgarganda" },
    ],
  },
  {
    g: 'VAQT TRIGGERLARI',
    items: [
      { v: 'before_date_field', l: 'sana maydonidan oldin' },
      { v: 'exact_time', l: 'Aniq vaqtda' },
      { v: 'daily', l: 'Har kuni' },
    ],
  },
  { g: 'MIJOZ HARAKATLARI', items: [{ v: 'call_in', l: "Kiruvchi qo'ng'iroqda" }] },
  {
    g: 'SUHBAT TRIGGERLARI',
    items: [
      { v: 'conversation_created', l: 'Kiruvchi xabar bilan suhbat yaratilganda' },
      { v: 'no_reply_hours', l: "Oxirgi kiruvchi xabardan so'ng javobsiz soatlar o'tganda" },
      { v: 'message_in', l: 'Birinchi kiruvchi xabarda' },
    ],
  },
]
// "Saralanmagan" ustunida (bosqichsiz) faqat shu triggerlar
export const UNSORTED_TRIGGERS = ['lead_created', 'conversation_created', 'message_in', 'call_in', 'no_reply_hours']

export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
export function delayLabel(min, t) {
  const m = Number(min) || 0
  const f = DELAYS.find((d) => d.v === m)
  if (f) return t(f.l)
  if (m % 1440 === 0) return `${m / 1440} ${t('kun')}`
  if (m % 60 === 0) return `${m / 60} ${t('soat')}`
  return `${m} ${t('daqiqa')}`
}
// Kartochka / sarlavha uchun trigger matni
export function whenText(a, t, fieldName) {
  const sch = a.schedule || {}
  const d = Number(a.delay) || 0
  const pre = d > 0 ? `${delayLabel(d, t)} ` : ''
  switch (a.trigger) {
    case 'lead_created': return cap(pre + t('bosqichda yaratilgandan keyin'))
    case 'stage_enter': return cap(pre + t("bosqichga o'tgandan keyin"))
    case 'created_or_enter': return cap(pre + t("bosqichga o'tgan yoki yaratilgandan keyin"))
    case 'assignee_changed': return t("Mas'ul o'zgarganda")
    case 'conversation_created': return t('Kiruvchi xabar bilan suhbat yaratilganda')
    case 'message_in': return t('Birinchi kiruvchi xabarda')
    case 'no_reply_hours': return `${t('Oxirgi kiruvchi xabardan')} ${sch.hours || 0} ${t("soat o'tganda")}`
    case 'call_in': return t("Kiruvchi qo'ng'iroqda")
    case 'before_date_field': return `${sch.hours ?? 0} ${t('soat oldin')}: ${fieldName || sch.field || ''}`
    case 'exact_time': return `${t('Aniq vaqtda')}: ${sch.at ? new Date(sch.at).toLocaleString() : ''}`
    case 'daily': return `${t('Har kuni soat')} ${sch.time || ''}`
    default: return t("Bosqichga o'tgandan keyin")
  }
}

// Kartochkadagi qisqa parametr: [sarlavha, qiymat (matn yoki massiv)]
export function actionSummary(a, ctx = {}) {
  const m = actionMeta(a.type)
  let val = ''
  const stageName = (k) => ctx.stages?.[k]?.name || k || ''
  switch (a.type) {
    case 'create_task': val = a.text || a.title || ''; break
    case 'create_lead': val = [ctx.pipes?.find((p) => (p.id || 'main') === (a.pipelineId || 'main'))?.name, stageName(a.stageKey)].filter(Boolean).join(' / '); break
    case 'webhook': val = a.url || ''; break
    case 'change_stage': val = stageName(a.stageKey); break
    case 'edit_tags': {
      const add = a.add || [], rem = a.remove || []
      return [add.length && !rem.length ? "Teg qo'shish" : rem.length && !add.length ? 'Tegni olib tashlash' : 'Teglarni tahrirlash', [...add, ...rem.map((x) => `− ${x}`)]]
    }
    case 'add_tag': return ["Teg qo'shish", [a.tag].filter(Boolean)]
    case 'remove_tag': return ['Tegni olib tashlash', [a.tag].filter(Boolean)]
    case 'complete_tasks': val = a.result || ''; break
    case 'change_assignee':
      if (a.mode === 'queue') val = `${(a.userIds || []).length || ''} ${ctx.t ? ctx.t('foydalanuvchi, navbat bilan') : ''}`.trim()
      else val = ctx.members?.find((u) => u.id === a.userId)?.name || ''
      break
    case 'set_assignee': val = a.assigneeName || (a.assignee === 'round_robin' ? 'round-robin' : ''); break
    case 'change_field': case 'set_field': val = [a.field, a.value].filter((x) => x !== undefined && x !== '').join(' = '); break
    case 'send_message': case 'add_note': case 'notify': val = a.text || ''; break
    case 'run_bot': val = a.botName || ''; break
    default: break
  }
  return [m.l, val]
}
