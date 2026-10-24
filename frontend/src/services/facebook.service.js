import { api, mockOr } from '../lib/apiClient'

// Preview (mock rejim) uchun — backend ulanmagan holatda UI ko'rinishi
const MOCK_CFG = {
  enabled: true, appManaged: true, webhookStatus: 'ok', appIdSet: true, appSecretSet: true, webhookUrl: '', verifyToken: '',
  pages: [{ id: 'p1', name: 'VITA GUM Elastic' }, { id: 'p2', name: 'Pulpy Uzbekistan' }],
}
const MOCK_FORMS = { forms: [{ id: 'f1', name: 'Lead forma — Vita Gum' }, { id: 'f2', name: 'Instagram promo forma' }] }
const MOCK_FIELDS = {
  fields: [
    { key: 'full_name', label: 'Toʻliq ism', type: 'FULL_NAME' },
    { key: 'phone_number', label: 'Telefon raqami', type: 'PHONE' },
    { key: 'email', label: 'Email', type: 'EMAIL' },
    { key: 'city', label: 'Shahringiz', type: 'CITY' },
    { key: 'qiziqish', label: 'Qaysi mahsulot qiziqtiradi?', type: 'CUSTOM' },
  ],
}

// Mock rejimda backend shakliga mos yozuv (id + fieldMapJson string)
function mockMapping(dto) {
  const { fieldMap = {}, ...rest } = dto
  return { id: 'fbm_' + String(dto.formId || 'x'), ...rest, fieldMapJson: JSON.stringify(fieldMap), createdAt: '2026-01-01T00:00:00.000Z' }
}

// Facebook Lead Ads integratsiyasi (amoCRM oqimi: OAuth -> sahifa -> forma -> maydon-mapping)
export const facebookService = {
  getConfig: () => mockOr(() => api.get('/crm/facebook/config'), MOCK_CFG),
  saveApp: (patch) => mockOr(() => api.put('/crm/facebook/config', patch), MOCK_CFG),
  pagesStatus: () => mockOr(() => api.get('/crm/facebook/pages-status'), { pages: MOCK_CFG.pages.map((p) => ({ ...p, active: true })) }),
  oauthUrl: () => mockOr(() => api.get('/crm/facebook/oauth-url'), { url: '#' }),
  connectManual: (dto) => mockOr(() => api.post('/crm/facebook/connect', dto), MOCK_CFG),
  removePage: (pageId) => mockOr(() => api.del(`/crm/facebook/pages/${encodeURIComponent(pageId)}`), { ...MOCK_CFG, pages: MOCK_CFG.pages.filter((p) => p.id !== pageId) }),
  listForms: (pageId) => mockOr(() => api.get(`/crm/facebook/forms?pageId=${encodeURIComponent(pageId)}`), MOCK_FORMS),
  formFields: (pageId, formId) => mockOr(() => api.get(`/crm/facebook/form-fields?pageId=${encodeURIComponent(pageId)}&formId=${encodeURIComponent(formId)}`), MOCK_FIELDS),
  listMappings: () => mockOr(() => api.get('/crm/facebook/mappings'), { mappings: [] }),
  saveMapping: (dto) => mockOr(() => api.post('/crm/facebook/mappings', dto), { mapping: mockMapping(dto) }),
  deleteMapping: (id) => mockOr(() => api.del(`/crm/facebook/mappings/${encodeURIComponent(id)}`), { success: true }),
}
