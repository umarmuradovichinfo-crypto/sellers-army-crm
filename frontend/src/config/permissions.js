// ====== Rollar va ruxsatlar (RBAC) ======
// MUHIM: bu — frontend uchun "ko'rinish" darajasidagi nazorat (UI'ni yashirish).
// Haqiqiy xavfsizlik HAR DOIM backendda tekshirilishi shart. Frontend ruxsatlari
// faqat foydalanuvchiga keraksiz bo'limlarni ko'rsatmaslik uchun.
//
// Backend `/auth/me` javobida foydalanuvchining `permissions: string[]` ro'yxatini
// qaytaradi. Frontend o'sha ro'yxatga tayanadi. Quyidagi ROLE_PERMISSIONS — faqat
// MOCK rejim uchun standart qiymatlar (backend yo'q paytda).

export const ROLES = [
  { id: 'super_admin', label: 'Super admin' },
  { id: 'sotuvchi',    label: 'Sotuvchi' },
  { id: 'traffic',     label: 'Traffic Manager' },
]

// Barcha mavjud ruxsatlar (backend ham shu kalitlardan foydalanadi)
export const ALL_PERMISSIONS = [
  'crm.view', 'crm.export', 'crm.import', 'crm.automation', 'crm.settings',
  'settings.view', 'settings.roles.manage',
]

// MOCK rejim uchun standart rol -> ruxsatlar
export const ROLE_PERMISSIONS = {
  super_admin: ALL_PERMISSIONS,
  sotuvchi: ['crm.view'],
  traffic: ['crm.view'],
}

export function permsForRole(roleId) {
  return ROLE_PERMISSIONS[roleId] || []
}

export function hasPerm(permissions, perm) {
  if (!perm) return true
  return Array.isArray(permissions) && permissions.includes(perm)
}
