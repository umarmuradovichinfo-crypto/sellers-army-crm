import { api } from '../lib/apiClient'

// Facebook Lead Ads integratsiyasi (amoCRM oqimi: OAuth -> sahifa -> forma -> maydon-mapping)
export const facebookService = {
  getConfig: () => api.get('/crm/facebook/config'),
  saveApp: (patch) => api.put('/crm/facebook/config', patch),
  pagesStatus: () => api.get('/crm/facebook/pages-status'),
  oauthUrl: () => api.get('/crm/facebook/oauth-url'),
  removePage: (pageId) => api.del(`/crm/facebook/pages/${encodeURIComponent(pageId)}`),
  listForms: (pageId) => api.get(`/crm/facebook/forms?pageId=${encodeURIComponent(pageId)}`),
  formFields: (pageId, formId) => api.get(`/crm/facebook/form-fields?pageId=${encodeURIComponent(pageId)}&formId=${encodeURIComponent(formId)}`),
  listMappings: () => api.get('/crm/facebook/mappings'),
  saveMapping: (dto) => api.post('/crm/facebook/mappings', dto),
  deleteMapping: (id) => api.del(`/crm/facebook/mappings/${encodeURIComponent(id)}`),
}
