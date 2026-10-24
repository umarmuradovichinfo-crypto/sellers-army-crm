// Teg ranglari (Sozlamalar → Teglar): bir marta yuklanadi, barcha kartochkalar ishlatadi.
import { useEffect, useState } from 'react'
import { crmService } from '../services/crm.service'

let cache = null
let pending = null
const subs = new Set()

function load() {
  if (!pending) {
    pending = crmService.listTags()
      .then((r) => { cache = Object.fromEntries((r.tags || []).filter((x) => x.color).map((x) => [x.name, x.color])) })
      .catch(() => { cache = {} })
      .finally(() => subs.forEach((f) => f(cache)))
  }
  return pending
}

export function useTagColors() {
  const [map, setMap] = useState(cache || {})
  useEffect(() => {
    subs.add(setMap)
    if (!cache) load()
    return () => subs.delete(setMap)
  }, [])
  return map
}

// amoCRM teg ko'rinishi: yorug' mavzuda rang fon, tungi mavzuda xira fon + rangli chegara (CSS: .ac-tag--c)
export const tagStyle = (color) => (color ? { '--tag': color } : undefined)
