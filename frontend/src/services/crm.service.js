import { api } from '../lib/apiClient'

let _pbxMode = null // {callMode, dialScheme} keshi

// Softphone (MicroSIP va h.k.)ni protokol havolasi bilan chaqiradi — dastur o'zi teradi.
export function dialSoftphone(scheme, phone) {
  const num = String(phone || '').replace(/[^\d+*#]/g, '')
  if (!num) return
  const a = document.createElement('a')
  a.href = (['tel', 'sip', 'callto'].includes(scheme) ? scheme : 'tel') + ':' + num
  a.style.display = 'none'
  document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 0)
}

export const crmService = {
  // GET /crm/pipeline -> bosqichlar + lidlar + statistika + voronkalar
  // params (ixtiyoriy): { limit (har bosqichdan N ta karta; 0 = faqat jamilar), preset, search, period, assigneeId, budgetFrom, budgetTo, tags, task, name }
  // Har bosqichda: count/sumValue (filtrga mos jami), nextCursor (keyingi sahifa bo'lsa) — stageLeads bilan davom ettiriladi.
  getPipeline: (pipelineId, params) => api.get(`/crm/pipeline${qs({ pipelineId, ...params })}`),
  // GET /crm/pipeline/stage-leads -> { leads, nextCursor }
  stageLeads: (params) => api.get(`/crm/pipeline/stage-leads${qs(params)}`),

  // GET /crm/members -> sotuvchilar (mas'ul uchun)
  listMembers: () => api.get('/crm/members'),

  // ── Bosqichlar ──
  createStage: (payload) => api.post('/crm/stages', payload),
  updateStage: (key, payload) => api.put(`/crm/stages/${key}`, payload),
  deleteStage: (key) => api.del(`/crm/stages/${key}`),

  // ── Lidlar ──
  createLead: (payload) => api.post('/crm/leads', payload),
  getLead: (id) => api.get(`/crm/leads/${id}`),
  updateLead: (id, payload) => api.put(`/crm/leads/${id}`, payload),
  deleteLead: (id) => api.del(`/crm/leads/${id}`),
  // Bitim kontaktlari (amoCRM: bir nechta kontakt; asosiysi birinchi)
  addLeadContact: (id, payload) => api.post(`/crm/leads/${id}/contacts`, payload),
  removeLeadContact: (id, contactId) => api.del(`/crm/leads/${id}/contacts/${contactId}`),
  setMainLeadContact: (id, contactId) => api.put(`/crm/leads/${id}/contacts/${contactId}/main`, {}),
  moveLead: (id, stageId, position, lostReason) => api.patch(`/crm/leads/${id}/move`, { stageId, position, lostReason }),
  addNote: (id, text) => api.post(`/crm/leads/${id}/notes`, { text }),
  // params: { limit, cursor, sort, dir, search, preset, period, assigneeId, budgetFrom, budgetTo, tags, pipelineId, stage, task, contactId, companyId, unsorted }
  // limit berilsa -> { leads, nextCursor, total, totalSum }; parametrsiz -> eski shakl (birinchi 500 ta) + total
  listLeads: (params) => api.get(`/crm/leads${qs(params)}`),
  // bulk(ids, action, value) yoki bulk(null, action, value, { all: true, filter, excludeIds }) — "barchasini belgilash"
  bulk: (ids, action, value, extra) => api.post('/crm/leads/bulk', { ids: ids || undefined, action, value, ...extra }),
  mergeLeads: (keepId, mergeIds, pick) => api.post('/crm/leads/merge', { keepId, mergeIds, pick }),
  exportUrl: (params) => `/crm/leads-export${qs(params)}`,
  // Filtr (listLeads parametrlari) + sort/dir bo'yicha CSV — auth bilan Blob sifatida
  exportCsv: (params) => api.getBlob(`/crm/leads-export${qs(params)}`),
  listStages: () => api.get('/crm/stages'),
  listSources: () => api.get('/crm/sources'),
  // GET /crm/leads-duplicates?by=phone|email|name -> { by, total, groups: [{ key, count, leads: [...] }] }
  leadDuplicates: (by) => api.get(`/crm/leads-duplicates${qs({ by })}`),
  // Foydalanuvchi sozlamasi (backend): kind = card | list -> { fields: [kalit] | null }
  getLayout: (kind) => api.get(`/crm/card-layout${qs({ kind })}`),
  saveLayout: (kind, fields) => api.put(`/crm/card-layout${qs({ kind })}`, { fields }),

  // ── Vazifalar (zadacha) ──
  listTasks: (params) => api.get(`/crm/tasks${typeof params === 'string' ? (params ? `?status=${params}` : '') : qs(params)}`),
  listLeadTasks: (id) => api.get(`/crm/leads/${id}/tasks`),
  createTask: (id, payload) => api.post(`/crm/leads/${id}/tasks`, payload),
  updateTask: (id, payload) => api.put(`/crm/tasks/${id}`, payload),
  // O'chirilgan vazifalar (amoCRM "Удаленные") va tiklash
  listDeletedTasks: () => api.get('/crm/tasks-deleted'),
  restoreTask: (id) => api.post(`/crm/tasks-deleted/${id}/restore`, {}),
  deleteTask: (id) => api.del(`/crm/tasks/${id}`),

  // ── OnlinePBX qo'ng'iroqlar ──
  dial: (to) => api.post('/crm/calls/dial', { to }),
  leadCalls: (id) => api.get(`/crm/leads/${id}/calls`),
  listCalls: (filter) => api.get(`/crm/calls${filter && filter !== 'all' ? `?filter=${filter}` : ''}`),
  // kiruvchi qo'ng'iroq oynasi (OnlinePBX webhook → so'nggi 45 s dagi ko'rilmagan kiruvchi) va uni yopish
  incomingCall: () => api.get('/crm/calls/incoming'),
  dismissCall: (id) => api.post(`/crm/calls/${id}/dismiss`, {}),
  recordingBlob: (callId) => api.getBlob(`/crm/calls/${callId}/recording`), // yozuvni chatda ijro uchun
  getMyExtension: () => api.get('/crm/my-extension'),
  setMyExtension: (extension) => api.put('/crm/my-extension', { extension }),
  // Brauzer WebRTC-telefoni (JsSIP)
  getWebrtcConfig: () => api.get('/crm/webrtc/config'),
  saveWebrtcConfig: (patch) => api.put('/crm/webrtc/config', patch),
  leadByPhone: (phone) => api.get(`/crm/lead-by-phone?phone=${encodeURIComponent(phone)}`),
  // Softphone rejim: MicroSIP o'zi teradi — biz faqat log yozamiz
  softLogCall: ({ leadId, to } = {}) => api.post('/crm/calls/soft-log', { leadId, to }),
  // Qo'ng'iroq usuli (callMode/dialScheme) keshi — har call tugmasi shuni tekshiradi
  loadPbxMode: async () => {
    if (_pbxMode) return _pbxMode
    // my-extension: har foydalanuvchi o'qiy oladi (pbx/config faqat admin uchun — sotuvchida doim callback bo'lib qolardi)
    try { const c = await crmService.getMyExtension(); _pbxMode = { callMode: c.callMode || 'callback', dialScheme: c.dialScheme || 'tel' } }
    catch { _pbxMode = { callMode: 'callback', dialScheme: 'tel' } }
    return _pbxMode
  },
  refreshPbxMode: () => { _pbxMode = null },
  // OnlinePBX ulanish sozlamalari (admin)
  getPbxConfig: () => api.get('/crm/pbx/config'),
  savePbxConfig: (patch) => api.put('/crm/pbx/config', patch),
  testPbx: () => api.post('/crm/pbx/test', {}),

  // ── Voronkalar (pipelines) ──
  listPipelines: () => api.get('/crm/pipelines'),
  createPipeline: (name) => api.post('/crm/pipelines', { name }),
  updatePipeline: (id, payload) => api.put(`/crm/pipelines/${id}`, payload),
  deletePipeline: (id) => api.del(`/crm/pipelines/${id}`),

  // ── Maxsus maydonlar ──
  listFields: (entity = 'lead') => api.get(`/crm/fields?entity=${entity}`),
  createField: (payload) => api.post('/crm/fields', payload),
  updateField: (id, payload) => api.put(`/crm/fields/${id}`, payload),
  deleteField: (id) => api.del(`/crm/fields/${id}`),
  reorderFields: (ids) => api.post('/crm/fields/reorder', { ids }),

  // ── Yo'qotish sabablari ──
  listLostReasons: () => api.get('/crm/lost-reasons'),
  createLostReason: (name) => api.post('/crm/lost-reasons', { name }),
  deleteLostReason: (id) => api.del(`/crm/lost-reasons/${id}`),

  // ── Teglar katalogi ──
  listTags: () => api.get('/crm/tags'),
  upsertTag: (name, color) => api.post('/crm/tags', { name, color }),

  // ── Saqlangan filtrlar ──
  listFilters: () => api.get('/crm/filters'),
  createFilter: (name, params) => api.post('/crm/filters', { name, params }),
  deleteFilter: (id) => api.del(`/crm/filters/${id}`),

  // ── Avtomatlashtirish ──
  listAutomations: () => api.get('/crm/automations'),
  createAutomation: (payload) => api.post('/crm/automations', payload),
  updateAutomation: (id, payload) => api.put(`/crm/automations/${id}`, payload),
  deleteAutomation: (id) => api.del(`/crm/automations/${id}`),

  // ── Analitika (amoCRM hisobotlari) ──
  // Sotuv tahlili pastki bloklari: bosqichlarga yetganlar, saralanmagan arizalar, prognoz
  analyticsFlow: (params) => api.get(`/crm/analytics/flow${qs(params)}`),
  analytics: (params) => api.get(`/crm/analytics${qs(params)}`),
  analyticsCalls: (params) => api.get(`/crm/analytics/calls${qs(params)}`),
  analyticsEvents: (params) => api.get(`/crm/analytics/events${qs(params)}`),
  analyticsTimeline: (params) => api.get(`/crm/analytics/timeline${qs(params)}`),
  analyticsEmployees: (params) => api.get(`/crm/analytics/employees${qs(params)}`),

  // ── Lead-capture formalar ──
  listForms: () => api.get('/crm/forms'),
  createForm: (payload) => api.post('/crm/forms', payload),
  updateForm: (id, payload) => api.put(`/crm/forms/${id}`, payload),
  deleteForm: (id) => api.del(`/crm/forms/${id}`),

  // ── Saralanmagan inbox ──
  listUnsorted: (params) => api.get(`/crm/unsorted${qs(params)}`),
  acceptUnsorted: (id, payload) => api.post(`/crm/unsorted/${id}/accept`, payload),

  // ── Suhbat (Telegram / omnichannel) ──
  chatStatus: () => api.get('/crm/chat-status'),
  // Ish stoli chat vidjetlari: o'rtacha javob vaqti, uzoq javob kutayotganlar
  // Chat sozlamalari: { templates:[{id,name,active,text}], conversationRule }
  chatSettings: () => api.get('/crm/chat-settings'),
  saveChatSettings: (payload) => api.put('/crm/chat-settings', payload),
  chatStats: (params) => api.get(`/crm/chat-stats${qs(params)}`),
  conversations: (params) => api.get(`/crm/conversations${qs(params || {})}`),
  // amoCRM: suhbatni yopish / qayta ochish / sevimlilar — action: close | reopen | fav
  conversationAction: (leadId, action) => api.post(`/crm/conversations/${leadId}/${action}`, {}),
  leadMessages: (id) => api.get(`/crm/leads/${id}/messages`),
  sendMessage: (id, text) => api.post(`/crm/leads/${id}/messages`, { text }),

  // ── Sotuv rejasi / maqsadlar ──
  listGoals: (period) => api.get(`/crm/goals${period ? `?period=${period}` : ''}`),
  upsertGoal: (payload) => api.post('/crm/goals', payload),
  deleteGoal: (id) => api.del(`/crm/goals/${id}`),

  // ── Mahsulotlar ──
  listProducts: () => api.get('/crm/products'),
  createProduct: (payload) => api.post('/crm/products', payload),
  updateProduct: (id, payload) => api.put(`/crm/products/${id}`, payload),
  deleteProduct: (id) => api.del(`/crm/products/${id}`),

  // ── Kompaniya & Kontakt ──
  // q — matn (eski) yoki params obyekti { limit, cursor, sort, dir, search, ... }; javobda total/nextCursor ham bor
  listCompanies: (q) => api.get(`/crm/companies${typeof q === 'object' && q ? qs(q) : q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getCompany: (id) => api.get(`/crm/companies/${id}`),
  createCompany: (payload) => api.post('/crm/companies', payload),
  updateCompany: (id, payload) => api.put(`/crm/companies/${id}`, payload),
  deleteCompany: (id) => api.del(`/crm/companies/${id}`),
  listContacts: (q) => api.get(`/crm/contacts${typeof q === 'object' && q ? qs(q) : q ? `?q=${encodeURIComponent(q)}` : ''}`),
  // Kontakt + kompaniya birlashgan ro'yxat: { kind: all|contacts|companies, limit, cursor, sort, dir, search, name, phone, email, assigneeId, period, preset } -> { items, nextCursor, total }
  listEntities: (params) => api.get(`/crm/entities${qs(params)}`),
  bulkDeleteEntities: (body) => api.post('/crm/entities/bulk-delete', body),
  createContact: (payload) => api.post('/crm/contacts', payload),
  updateContact: (id, payload) => api.put(`/crm/contacts/${id}`, payload),
  deleteContact: (id) => api.del(`/crm/contacts/${id}`),
}

// ── Ommaviy lead-capture forma (login'siz) ──
export const publicLeadForm = {
  get: (slug) => api.get(`/public/crm-forms/${slug}`),
  // UTM: sahifa URL'idagi utm_*, gclid, fbclid, yclid ... va referrer birga yuboriladi (lid customJson'iga yoziladi)
  submit: (slug, answers) => {
    const utm = {}
    try { new URLSearchParams(window.location.search).forEach((v, k) => { utm[k] = v }) } catch { /* */ }
    return api.post(`/public/crm-forms/${slug}`, { answers, utm, referrer: document.referrer || undefined })
  },
}

// ── Bildirishnomalar ──
export const notifService = {
  list: () => api.get('/notifications'),
  read: (id) => api.post(`/notifications/${id}/read`, {}),
  readAll: () => api.post('/notifications/read-all', {}),
}

function qs(params) {
  if (!params) return ''
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  if (!p.length) return ''
  return '?' + p.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
}
