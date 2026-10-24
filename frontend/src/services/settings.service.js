import { api, mockOr } from '../lib/apiClient'

export const settingsService = {
  // GET /settings/access -> { permissions:[{key,label}], roles:[{key,name,isSystem,users,permissions:[]}] }
  // GET /auth/log -> { items:[{at,email,name,ok,ip,ua}] } (Лог авторизаций)
  authLog: () => api.get('/auth/log'),
  getAccess: () => mockOr(() => api.get('/settings/access'), {
    permissions: [],
    roles: [
      { key: 'super_admin', name: 'Super admin', isSystem: true, users: 1, permissions: [] },
      { key: 'sotuvchi', name: 'Sotuvchi', isSystem: true, users: 2, permissions: [] },
      { key: 'traffic', name: 'Traffic Manager', isSystem: true, users: 0, permissions: [] },
    ],
  }),

  // PATCH /settings/access { roleKey, permission, allowed }
  setPermission: (roleKey, permission, allowed) =>
    mockOr(() => api.patch('/settings/access', { roleKey, permission, allowed }), { roleKey, permission, allowed }),

  // POST /settings/roles { name }
  createRole: (name) => mockOr(() => api.post('/settings/roles', { name }), { role: { key: 'new', name, isSystem: false, users: 0, permissions: [] } }),

  // ── Foydalanuvchilar (login/parol) ──
  // GET /settings/users
  listUsers: () => mockOr(() => api.get('/settings/users'), { users: [
    { id: 'me', name: 'Demo Admin', email: 'demo@example.com', roleKey: 'super_admin', roleName: 'Super admin', isActive: true, extension: null, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'u1', name: 'Demo Sotuvchi', email: 'seller@example.com', roleKey: 'sotuvchi', roleName: 'Sotuvchi', isActive: true, extension: '101', createdAt: '2026-01-01T00:00:00.000Z' },
  ] }),
  // POST /settings/users { name, email, password, roleKey, extension? }
  createUser: (payload) => mockOr(() => api.post('/settings/users', payload), { user: { id: 'new_' + Math.random().toString(36).slice(2, 7), name: payload.name, email: payload.email, roleKey: payload.roleKey, roleName: payload.roleKey, isActive: true, extension: payload.extension || null, createdAt: new Date().toISOString() } }),
  // PATCH /settings/users/:id { name?, email?, roleKey?, isActive?, extension? }
  updateUser: (id, payload) => mockOr(() => api.patch(`/settings/users/${id}`, payload), { user: { id, ...payload, roleName: payload.roleKey } }),
  // POST /settings/users/:id/password { password }
  resetUserPassword: (id, password) => mockOr(() => api.post(`/settings/users/${id}/password`, { password }), { success: true }),

  // POST /settings/me/password { currentPassword, password } — har qanday rol o'z parolini o'zgartiradi
  changeOwnPassword: (currentPassword, password) => mockOr(() => api.post('/settings/me/password', { currentPassword, password }), { success: true }),

  // GET/PUT /settings/general -> { general: { accountName, address, timezone, country, dateFormat, timeFormat, currency, nameOrder } }
  getGeneral: () => mockOr(() => api.get('/settings/general'), { general: {} }),
  saveGeneral: (payload) => mockOr(() => api.put('/settings/general', payload), { general: payload }),
}
