import { api, mockOr } from '../lib/apiClient'
import { mock } from '../mocks/data'

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
  getPipeline: (pipelineId, params) => mockOr(() => api.get(`/crm/pipeline${qs({ pipelineId, ...params })}`), { stages: mock.crm.stages, stats: [], pipelines: [] }),
  // GET /crm/pipeline/stage-leads -> { leads, nextCursor }
  stageLeads: (params) => mockOr(() => api.get(`/crm/pipeline/stage-leads${qs(params)}`), { leads: [], nextCursor: null }),

  // GET /crm/members -> sotuvchilar (mas'ul uchun)
  listMembers: () => mockOr(() => api.get('/crm/members'), { members: [] }),

  // ── Bosqichlar ──
  createStage: (payload) => mockOr(() => api.post('/crm/stages', payload), { stage: { key: 'new', ...payload } }),
  updateStage: (key, payload) => mockOr(() => api.put(`/crm/stages/${key}`, payload), { stage: { key, ...payload } }),
  deleteStage: (key) => mockOr(() => api.del(`/crm/stages/${key}`), { success: true }),

  // ── Lidlar ──
  createLead: (payload) => mockOr(() => api.post('/crm/leads', payload), { lead: { id: 'new', n: payload.name } }),
  getLead: (id) => mockOr(() => api.get(`/crm/leads/${id}`), { lead: { id } }),
  updateLead: (id, payload) => mockOr(() => api.put(`/crm/leads/${id}`, payload), { lead: { id, ...payload } }),
  deleteLead: (id) => mockOr(() => api.del(`/crm/leads/${id}`), { success: true }),
  moveLead: (id, stageId, position, lostReason) => mockOr(() => api.patch(`/crm/leads/${id}/move`, { stageId, position, lostReason }), { id, stageId }),
  addNote: (id, text) => mockOr(() => api.post(`/crm/leads/${id}/notes`, { text }), { notes: [] }),
  // params: { limit, cursor, sort, dir, search, preset, period, assigneeId, budgetFrom, budgetTo, tags, pipelineId, stage, task, contactId, companyId, unsorted }
  // limit berilsa -> { leads, nextCursor, total, totalSum }; parametrsiz -> eski shakl (birinchi 500 ta) + total
  listLeads: (params) => mockOr(() => api.get(`/crm/leads${qs(params)}`), { leads: [], total: 0, totalSum: 0, nextCursor: null }),
  // bulk(ids, action, value) yoki bulk(null, action, value, { all: true, filter, excludeIds }) — "barchasini belgilash"
  bulk: (ids, action, value, extra) => mockOr(() => api.post('/crm/leads/bulk', { ids: ids || undefined, action, value, ...extra }), { ok: true, affected: 0 }),
  mergeLeads: (keepId, mergeIds) => mockOr(() => api.post('/crm/leads/merge', { keepId, mergeIds }), { ok: true }),
  checkDuplicate: (phone, email, excludeId) => mockOr(() => api.get(`/crm/leads-check${qs({ phone, email, excludeId })}`), { duplicates: [] }),
  importLeads: (rows) => mockOr(() => api.post('/crm/leads-import', { rows }), { ok: true, created: 0, skipped: 0 }),
  exportUrl: () => '/crm/leads-export',

  // ── Vazifalar (zadacha) ──
  listTasks: (params) => mockOr(() => api.get(`/crm/tasks${typeof params === 'string' ? (params ? `?status=${params}` : '') : qs(params)}`), { tasks: [] }),
  listLeadTasks: (id) => mockOr(() => api.get(`/crm/leads/${id}/tasks`), { tasks: [] }),
  createTask: (id, payload) => mockOr(() => api.post(`/crm/leads/${id}/tasks`, payload), { task: { id: 'new', ...payload } }),
  updateTask: (id, payload) => mockOr(() => api.put(`/crm/tasks/${id}`, payload), { task: { id, ...payload } }),
  deleteTask: (id) => mockOr(() => api.del(`/crm/tasks/${id}`), { success: true }),

  // ── OnlinePBX qo'ng'iroqlar ──
  callLead: (id, from) => mockOr(() => api.post(`/crm/leads/${id}/call`, { from }), { ok: true }),
  dial: (to) => mockOr(() => api.post('/crm/calls/dial', { to }), { ok: true, leadName: null }),
  leadCalls: (id) => mockOr(() => api.get(`/crm/leads/${id}/calls`), { calls: [] }),
  syncCalls: () => mockOr(() => api.post('/crm/calls/sync', {}), { ok: true, synced: 0 }),
  listCalls: (filter) => mockOr(() => api.get(`/crm/calls${filter && filter !== 'all' ? `?filter=${filter}` : ''}`), { calls: [], missedCount: 0 }),
  recordingBlob: (callId) => api.getBlob(`/crm/calls/${callId}/recording`), // yozuvni chatda ijro uchun
  incomingCall: () => mockOr(() => api.get('/crm/calls/incoming'), { call: null }),
  dismissCall: (id) => mockOr(() => api.post(`/crm/calls/${id}/dismiss`, {}), { ok: true }),
  getMyExtension: () => mockOr(() => api.get('/crm/my-extension'), { extension: null, pbxEnabled: false }),
  setMyExtension: (extension) => mockOr(() => api.put('/crm/my-extension', { extension }), { ok: true, extension }),
  // Brauzer WebRTC-telefoni (JsSIP)
  getWebrtcConfig: () => mockOr(() => api.get('/crm/webrtc/config'), { enabled: false, domain: 'example.onpbx.ru', wss: 'wss://example.onpbx.ru:7443', uri: '', extension: '100', password: '', sipPasswordSet: false }),
  saveWebrtcConfig: (patch) => mockOr(() => api.put('/crm/webrtc/config', patch), { enabled: false, ...patch }),
  leadByPhone: (phone) => mockOr(() => api.get(`/crm/lead-by-phone?phone=${encodeURIComponent(phone)}`), { leadId: null, leadName: null }),
  // Softphone rejim: MicroSIP o'zi teradi — biz faqat log yozamiz
  softLogCall: ({ leadId, to } = {}) => mockOr(() => api.post('/crm/calls/soft-log', { leadId, to }), { ok: true, phone: to || '' }),
  // Qo'ng'iroq usuli (callMode/dialScheme) keshi — har call tugmasi shuni tekshiradi
  loadPbxMode: async () => {
    if (_pbxMode) return _pbxMode
    try { const c = await crmService.getPbxConfig(); _pbxMode = { callMode: c.callMode || 'callback', dialScheme: c.dialScheme || 'tel' } }
    catch { _pbxMode = { callMode: 'callback', dialScheme: 'tel' } }
    return _pbxMode
  },
  refreshPbxMode: () => { _pbxMode = null },
  // OnlinePBX ulanish sozlamalari (admin)
  getPbxConfig: () => mockOr(() => api.get('/crm/pbx/config'), { domain: '', defaultExt: '', apiKeySet: false, webhookSecretSet: false, callMode: 'callback', dialScheme: 'tel', enabled: false, webhookUrl: '' }),
  savePbxConfig: (patch) => mockOr(() => api.put('/crm/pbx/config', patch), { ...patch, enabled: !!patch.domain }),
  testPbx: () => mockOr(() => api.post('/crm/pbx/test', {}), { ok: false, message: 'Mock' }),

  // ── Voronkalar (pipelines) ──
  listPipelines: () => mockOr(() => api.get('/crm/pipelines'), { pipelines: [] }),
  createPipeline: (name) => mockOr(() => api.post('/crm/pipelines', { name }), { pipeline: {} }),
  updatePipeline: (id, payload) => mockOr(() => api.put(`/crm/pipelines/${id}`, payload), { pipeline: {} }),
  deletePipeline: (id) => mockOr(() => api.del(`/crm/pipelines/${id}`), { ok: true }),

  // ── Maxsus maydonlar ──
  listFields: (entity = 'lead') => mockOr(() => api.get(`/crm/fields?entity=${entity}`), { fields: [] }),
  createField: (payload) => mockOr(() => api.post('/crm/fields', payload), { field: {} }),
  updateField: (id, payload) => mockOr(() => api.put(`/crm/fields/${id}`, payload), { field: {} }),
  deleteField: (id) => mockOr(() => api.del(`/crm/fields/${id}`), { ok: true }),
  reorderFields: (ids) => mockOr(() => api.post('/crm/fields/reorder', { ids }), { ok: true }),

  // ── Yo'qotish sabablari ──
  listLostReasons: () => mockOr(() => api.get('/crm/lost-reasons'), { reasons: [] }),
  createLostReason: (name) => mockOr(() => api.post('/crm/lost-reasons', { name }), { reason: {} }),
  deleteLostReason: (id) => mockOr(() => api.del(`/crm/lost-reasons/${id}`), { ok: true }),

  // ── Teglar katalogi ──
  listTags: () => mockOr(() => api.get('/crm/tags'), { tags: [] }),
  upsertTag: (name, color) => mockOr(() => api.post('/crm/tags', { name, color }), { tag: {} }),
  deleteTag: (id) => mockOr(() => api.del(`/crm/tags/${id}`), { ok: true }),

  // ── Saqlangan filtrlar ──
  listFilters: () => mockOr(() => api.get('/crm/filters'), { filters: [] }),
  createFilter: (name, params) => mockOr(() => api.post('/crm/filters', { name, params }), { filter: {} }),
  deleteFilter: (id) => mockOr(() => api.del(`/crm/filters/${id}`), { ok: true }),

  // ── Avtomatlashtirish ──
  listAutomations: () => mockOr(() => api.get('/crm/automations'), { automations: [] }),
  createAutomation: (payload) => mockOr(() => api.post('/crm/automations', payload), { automation: {} }),
  updateAutomation: (id, payload) => mockOr(() => api.put(`/crm/automations/${id}`, payload), { automation: {} }),
  deleteAutomation: (id) => mockOr(() => api.del(`/crm/automations/${id}`), { ok: true }),

  // ── Analitika (amoCRM hisobotlari) ──
  analytics: (params) => mockOr(() => api.get(`/crm/analytics${qs(params)}`), (mock.crm.analytics || { cards: {}, funnel: [], bySource: [], byEmployee: [], lostReasons: [] })),
  analyticsCalls: (params) => mockOr(() => api.get(`/crm/analytics/calls${qs(params)}`), (mock.crm.analyticsCalls || { total: 0, inbound: 0, outbound: 0, missed: 0, answered: 0, totalDuration: 0, avgDuration: 0, byEmployee: [], byDay: [] })),
  analyticsEvents: (params) => mockOr(() => api.get(`/crm/analytics/events${qs(params)}`), (mock.crm.analyticsEvents || { items: [], byType: [] })),
  analyticsTimeline: (params) => mockOr(() => api.get(`/crm/analytics/timeline${qs(params)}`), (mock.crm.analyticsTimeline || { granularity: 'day', buckets: [] })),
  analyticsEmployees: (params) => mockOr(() => api.get(`/crm/analytics/employees${qs(params)}`), (mock.crm.analyticsEmployees || [])),

  // ── Lead-capture formalar ──
  listForms: () => mockOr(() => api.get('/crm/forms'), { forms: [] }),
  getForm: (id) => mockOr(() => api.get(`/crm/forms/${id}`), { form: {} }),
  createForm: (payload) => mockOr(() => api.post('/crm/forms', payload), { form: {} }),
  updateForm: (id, payload) => mockOr(() => api.put(`/crm/forms/${id}`, payload), { form: {} }),
  deleteForm: (id) => mockOr(() => api.del(`/crm/forms/${id}`), { ok: true }),

  // ── Saralanmagan inbox ──
  listUnsorted: () => mockOr(() => api.get('/crm/unsorted'), { leads: [] }),
  acceptUnsorted: (id, payload) => mockOr(() => api.post(`/crm/unsorted/${id}/accept`, payload), { ok: true }),

  // ── Suhbat (Telegram / omnichannel) ──
  chatStatus: () => mockOr(() => api.get('/crm/chat-status'), { telegram: false }),
  conversations: () => mockOr(() => api.get('/crm/conversations'), { conversations: [] }),
  leadMessages: (id) => mockOr(() => api.get(`/crm/leads/${id}/messages`), { messages: [], canReply: false }),
  sendMessage: (id, text) => mockOr(() => api.post(`/crm/leads/${id}/messages`, { text }), { message: {} }),

  // ── Sotuv rejasi / maqsadlar ──
  listGoals: (period) => mockOr(() => api.get(`/crm/goals${period ? `?period=${period}` : ''}`), { goals: [], members: [], period: '' }),
  upsertGoal: (payload) => mockOr(() => api.post('/crm/goals', payload), { goal: {} }),
  deleteGoal: (id) => mockOr(() => api.del(`/crm/goals/${id}`), { ok: true }),

  // ── Mahsulotlar ──
  listProducts: () => mockOr(() => api.get('/crm/products'), { products: [] }),
  createProduct: (payload) => mockOr(() => api.post('/crm/products', payload), { product: {} }),
  updateProduct: (id, payload) => mockOr(() => api.put(`/crm/products/${id}`, payload), { product: {} }),
  deleteProduct: (id) => mockOr(() => api.del(`/crm/products/${id}`), { ok: true }),

  // ── Kompaniya & Kontakt ──
  // q — matn (eski) yoki params obyekti { limit, cursor, sort, dir, search, ... }; javobda total/nextCursor ham bor
  listCompanies: (q) => mockOr(() => api.get(`/crm/companies${typeof q === 'object' && q ? qs(q) : q ? `?q=${encodeURIComponent(q)}` : ''}`), { companies: [], total: 0, nextCursor: null }),
  getCompany: (id) => mockOr(() => api.get(`/crm/companies/${id}`), { company: {} }),
  createCompany: (payload) => mockOr(() => api.post('/crm/companies', payload), { company: {} }),
  updateCompany: (id, payload) => mockOr(() => api.put(`/crm/companies/${id}`, payload), { company: {} }),
  deleteCompany: (id) => mockOr(() => api.del(`/crm/companies/${id}`), { ok: true }),
  listContacts: (q) => mockOr(() => api.get(`/crm/contacts${typeof q === 'object' && q ? qs(q) : q ? `?q=${encodeURIComponent(q)}` : ''}`), { contacts: [], total: 0, nextCursor: null }),
  // Kontakt + kompaniya birlashgan ro'yxat: { kind: all|contacts|companies, limit, cursor, sort, dir, search, name, phone, email, assigneeId, period, preset } -> { items, nextCursor, total }
  listEntities: (params) => mockOr(() => api.get(`/crm/entities${qs(params)}`), { items: [], nextCursor: null, total: 0 }),
  bulkDeleteEntities: (body) => mockOr(() => api.post('/crm/entities/bulk-delete', body), { ok: true, affected: 0 }),
  createContact: (payload) => mockOr(() => api.post('/crm/contacts', payload), { contact: {} }),
  updateContact: (id, payload) => mockOr(() => api.put(`/crm/contacts/${id}`, payload), { contact: {} }),
  deleteContact: (id) => mockOr(() => api.del(`/crm/contacts/${id}`), { ok: true }),
}

// ── Ommaviy lead-capture forma (login'siz) ──
export const publicLeadForm = {
  get: (slug) => api.get(`/public/crm-forms/${slug}`),
  submit: (slug, answers) => api.post(`/public/crm-forms/${slug}`, { answers }),
}

// ── Bildirishnomalar ──
export const notifService = {
  list: () => mockOr(() => api.get('/notifications'), { unread: 0, items: [] }),
  read: (id) => mockOr(() => api.post(`/notifications/${id}/read`, {}), { ok: true }),
  readAll: () => mockOr(() => api.post('/notifications/read-all', {}), { ok: true }),
}

function qs(params) {
  if (!params) return ''
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  if (!p.length) return ''
  return '?' + p.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
}
