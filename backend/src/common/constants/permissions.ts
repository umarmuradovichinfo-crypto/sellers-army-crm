// Barcha ruxsat kalitlari (BACKEND_TZ.md §3.3)
export const PERMISSION_KEYS = [
  'crm.view',
  'crm.export',
  'crm.import',
  'crm.automation',
  'crm.settings',
  'settings.view',
  'settings.roles.manage',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

// Ruxsatlarning ko'rinadigan nomlari (Sozlamalar matritsasi uchun).
// Yangi funksiya qo'shilganda — kalitni PERMISSION_KEYS ga, nomini bu yerga qo'shing.
export const PERMISSION_LABELS: Record<string, string> = {
  'crm.view': 'CRM',
  'crm.export': 'CRM — eksport',
  'crm.import': 'CRM — import',
  'crm.automation': 'CRM — avtomatlashtirish',
  'crm.settings': 'CRM — sozlamalar (voronka, maydon)',
  'settings.view': 'Sozlamalar',
  'settings.roles.manage': 'Rollar/ruxsatlarni boshqarish',
};

// Boshlang'ich rollar va ularning ruxsatlari (BACKEND_TZ.md §3.2)
export const ROLE_DEFS: {
  key: string;
  name: string;
  isSystem: boolean;
  permissions: readonly string[];
}[] = [
  {
    key: 'super_admin',
    name: 'Super admin',
    isSystem: true,
    permissions: PERMISSION_KEYS,
  },
  { key: 'sotuvchi', name: 'Sotuvchi', isSystem: true, permissions: ['crm.view'] },
  { key: 'traffic', name: 'Traffic Manager', isSystem: true, permissions: ['crm.view'] },
];
