// Ma'lumot yuklash uchun universal hook — SWR (stale-while-revalidate) bilan.
//   const { data, loading, error, reload, setData } = useApi(fetchFn, deps, cacheKey, refreshMs)
// - Kesh DOIM ishlaydi: cacheKey berilmasa ham fetchFn+deps'dan avtomatik kalit yasaladi.
//   Shu sabab HAR QANDAY bo'lim orasida yurganda "Yuklanmoqda" chiqmaydi — keshdan darrov ko'rsatadi.
// - Kesh localStorage'ga saqlanadi: sahifa yangilansa yoki bo'limga birinchi marta kirilsa ham
//   oxirgi ma'lumot darrov chiqadi, fonda jimgina yangilanadi.
// - refreshMs berilsa: mounted turganda har shuncha ms da fonda yangilaydi (masalan 10 daqiqa).
// - Optimistik setData kesh'ni ham yangilaydi (o'zgarishlar qaytib kirishda ham qoladi).
import { useState, useEffect, useCallback, useRef } from 'react'

const PREFIX = 'swr:'
const _cache = new Map() // key -> data (RAM tezkor qatlam)

// ── localStorage qatlam (sahifa yangilansa ham saqlanadi) ──
function lsGet(key) {
  try { const s = localStorage.getItem(PREFIX + key); return s == null ? undefined : JSON.parse(s) } catch { return undefined }
}
function lsSet(key, val) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(val)) }
  catch { /* kvota to'lsa — eski swr yozuvlarini tozalab qayta urinamiz */
    try { for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k) } catch {}
    try { localStorage.setItem(PREFIX + key, JSON.stringify(val)) } catch {}
  }
}
function lsDel(key) { try { localStorage.removeItem(PREFIX + key) } catch {} }
function lsClearAll() { try { for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k) } catch {} }

function cacheHas(key) {
  if (_cache.has(key)) return true
  const v = lsGet(key)
  if (v !== undefined) { _cache.set(key, v); return true }
  return false
}
function cacheGet(key) {
  if (_cache.has(key)) return _cache.get(key)
  const v = lsGet(key)
  if (v !== undefined) _cache.set(key, v)
  return v
}
function cacheSet(key, val) { _cache.set(key, val); lsSet(key, val) }

// Butun keshni yoki bitta kalitni tozalash (masalan logout/boshqa userga o'tishda).
export function invalidateCache(key) {
  if (key == null) { _cache.clear(); lsClearAll() }
  else { _cache.delete(key); lsDel(key) }
}

// fetchFn manbasi + deps'dan barqaror kalit. cacheKey berilmaganda ham kesh ishlaydi.
function hash(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
function autoKey(fetchFn, deps) {
  let src = ''; try { src = String(fetchFn) } catch {}
  let d = ''; try { d = JSON.stringify(deps) } catch { d = String(deps) }
  return 'k' + hash(src + '|' + d)
}

export function useApi(fetchFn, deps = [], cacheKey = null, refreshMs = 0) {
  const key = cacheKey != null ? cacheKey : autoKey(fetchFn, deps)
  const hasCache = cacheHas(key)
  const [data, setData] = useState(hasCache ? cacheGet(key) : null)
  const [loading, setLoading] = useState(!hasCache)
  const [error, setError] = useState(null)
  const fnRef = useRef(fetchFn)
  fnRef.current = fetchFn
  const seq = useRef(0) // eskirgan (sekin kelgan) javob yangi filtr natijasini bosib ketmasin

  const load = useCallback(async (bg = false) => {
    const my = ++seq.current
    if (!bg) { setLoading(true); setError(null) }
    try {
      const res = await fnRef.current()
      cacheSet(key, res) // o'z kalitiga doim yoziladi
      if (my !== seq.current) return // lekin ekranga faqat eng so'nggi so'rov chiqadi
      setData(res)
      setError(null)
    } catch (e) {
      // Fon yangilanishida yoki kesh bo'lsa — eski ma'lumotni saqlaymiz, xato ko'rsatmaymiz.
      if (my === seq.current && !bg && !cacheHas(key)) setError(e)
    } finally {
      if (!bg && my === seq.current) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, key])

  useEffect(() => {
    // deps o'zgarganda (key o'zgarganda) shu kalit keshi bo'lsa darrov ko'rsatamiz.
    if (cacheHas(key)) { setData(cacheGet(key)); setLoading(false) }
    load(cacheHas(key)) // keshda bor bo'lsa fon (spinnersiz), yo'q bo'lsa spinner bilan
    if (refreshMs > 0) {
      const iv = setInterval(() => load(true), refreshMs)
      return () => clearInterval(iv)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshMs])

  const setDataCached = useCallback(
    (updater) => {
      setData((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        cacheSet(key, next)
        return next
      })
    },
    [key],
  )

  return { data, loading, error, reload: () => load(false), setData: setDataCached }
}
