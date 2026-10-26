import { api } from '../lib/apiClient'

// O'z telefon stansiyamiz: «Настройка АТС» (modullar, qora ro'yxat, musiqa, chiquvchi qoidalar)
export const pbxService = {
  modules: (type) => api.get(`/pbx/modules${type ? `?type=${type}` : ''}`),
  nextNumber: (type) => api.get(`/pbx/modules/next-number?type=${type}`),
  create: (body) => api.post('/pbx/modules', body),
  update: (id, body) => api.put(`/pbx/modules/${id}`, body),
  remove: (id) => api.delete(`/pbx/modules/${id}`),
  validate: () => api.get('/pbx/flow/validate'),
  asterisk: () => api.get('/pbx/asterisk/preview'),
  callback: () => api.get('/pbx/callback'),
  saveCallback: (body) => api.put('/pbx/callback', body),
  blacklist: () => api.get('/pbx/blacklist'),
  blacklistAdd: (number, note) => api.post('/pbx/blacklist', { number, note }),
  blacklistRemove: (id) => api.delete(`/pbx/blacklist/${id}`),
  music: () => api.get('/pbx/music'),
  saveMusic: (body) => api.put('/pbx/music', body),
  outgoing: () => api.get('/pbx/outgoing'),
  saveOutgoing: (rules) => api.put('/pbx/outgoing', { rules }),
}
