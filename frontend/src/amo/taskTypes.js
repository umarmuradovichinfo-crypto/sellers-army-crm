// Vazifa turlari — yagona manba: standart 4 ta + Sozlamalardagi o'z turlari (amoCRM "Управление типами задач").
// TASK_TYPES massivi joyida yangilanadi (import qilgan barcha joylar bir xil ro'yxatni ko'radi).
import { useEffect, useState } from 'react'
import { api } from '../lib/apiClient'

export const DEFAULT_TASK_TYPES = [
  { key: 'call', label: "Qo'ng'iroq", icon: 'phone' },
  { key: 'meeting', label: 'Uchrashuv', icon: 'users' },
  { key: 'task', label: 'Kuzatish', icon: 'clock' },
  { key: 'message', label: 'Xat', icon: 'send' },
]
export const TASK_TYPES = [...DEFAULT_TASK_TYPES]
const subs = new Set()
let loaded = null

export function setCustomTaskTypes(custom = []) {
  TASK_TYPES.splice(0, TASK_TYPES.length, ...DEFAULT_TASK_TYPES, ...custom.map((c) => ({ ...c, custom: true })))
  subs.forEach((f) => f(TASK_TYPES.length))
}
export function loadTaskTypes(force = false) {
  if (!loaded || force) loaded = api.get('/crm/task-types').then((r) => setCustomTaskTypes(r.custom || [])).catch(() => {})
  return loaded
}
/** Ro'yxat yangilanganda komponentni qayta chizish uchun. */
export function useTaskTypes() {
  const [, set] = useState(0)
  useEffect(() => { subs.add(set); loadTaskTypes(); return () => subs.delete(set) }, [])
  return TASK_TYPES
}
