import { api } from '../lib/apiClient'

export const settingsService = {
  // GET /settings/access -> { permissions:[{key,label}], roles:[{key,name,isSystem,users,permissions:[]}] }
  // GET /auth/log -> { items:[{at,email,name,ok,ip,ua}] } (Лог авторизаций)
  authLog: () => api.get('/auth/log'),
  // Xavfsizlik: IP oq ro'yxati { ips, currentIp }
  getSecurity: () => api.get('/settings/security'),
  saveSecurity: (ips) => api.put('/settings/security', { ips }),
  getAccess: () => api.get('/settings/access'),

  // PATCH /settings/access { roleKey, permission, allowed }
  setPermission: (roleKey, permission, allowed) =>
    api.patch('/settings/access', { roleKey, permission, allowed }),

  // PUT /settings/roles/:key/rights { rights } — amoCRM «Права доступа» matritsasi
  setRights: (roleKey, rights) => api.put(`/settings/roles/${roleKey}/rights`, { rights }),

  // POST /settings/roles { name }
  createRole: (name) => api.post('/settings/roles', { name }),

  // ── Foydalanuvchilar (login/parol) ──
  // GET /settings/users
  listUsers: () => api.get('/settings/users'),
  // POST /settings/users { name, email, password, roleKey, extension? }
  createUser: (payload) => api.post('/settings/users', payload),
  // PATCH /settings/users/:id { name?, email?, roleKey?, isActive?, extension? }
  updateUser: (id, payload) => api.patch(`/settings/users/${id}`, payload),
  // amoCRM «Настройка групп»: guruhlar (otdellar) — huquq profilidan alohida
  listGroups: () => api.get('/settings/groups'),
  createGroup: (name) => api.post('/settings/groups', { name }),
  renameGroup: (id, name) => api.patch(`/settings/groups/${id}`, { name }),
  deleteGroup: (id, moveTo) => api.del(`/settings/groups/${id}${moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : ''}`),
  // POST /settings/users/:id/password { password }
  resetUserPassword: (id, password) => api.post(`/settings/users/${id}/password`, { password }),

  // POST /settings/me/password { currentPassword, password } — har qanday rol o'z parolini o'zgartiradi
  changeOwnPassword: (currentPassword, password) => api.post('/settings/me/password', { currentPassword, password }),
  // amoCRM «Настройки профиля»: { profile:{id,name,email,phone,note,avatar}, sessions:[{id,ua,ip,lastAt,current}] }
  // «Резервное копирование» — JSON fayl (Blob)
  backup: () => api.getBlob('/settings/backup'),
  getProfile: () => api.get('/settings/me/profile'),
  saveProfile: (payload) => api.put('/settings/me/profile', payload),
  closeSession: (id) => api.del(`/settings/me/sessions/${id}`),

  // GET/PUT /settings/general -> { general: { accountName, address, timezone, country, dateFormat, timeFormat, currency, nameOrder } }
  getGeneral: () => api.get('/settings/general'),
  saveGeneral: (payload) => api.put('/settings/general', payload),
}
