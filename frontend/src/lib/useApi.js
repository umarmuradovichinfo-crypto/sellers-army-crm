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
// Filtrli/katta javoblar faqat RAM'da: har filtr uchun yangi kalit localStorage kvotasini to'ldirmasin.
const ramOnly = (key) => key.includes('{') || key.startsWith('calls-')
let epoch = 0 // invalidateCache() (logout/login) dan keyin kechikib kelgan eski javoblar keshga yozilmasin
const isEmpty = (v) => (Array.isArray(v) ? v.length === 0 : v && typeof v === 'object' ? Object.values(v).every((x) => Array.isArray(x) && x.length === 0) && Object.keys(v).length > 0 : false)
function lsSet(key, val) {
  if (ramOnly(key)) return
  let str
  try { str = JSON.stringify(val) } catch { return }
  if (str.length > 250_000) return
  try { localStorage.setItem(PREFIX + key, str) }
  catch { /* kvota to'lsa — eski swr yozuvlarini tozalab qayta urinamiz */
    try { for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k) } catch {}
    try { localStorage.setItem(PREFIX + key, str) } catch {}
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
  if (key == null) { epoch++; _cache.clear(); lsClearAll() }
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

export const DEFAULT_REFRESH_MS = 60000 // butun tizimda ma'lumot har 1 daqiqada fonda yangilanadi

export function useApi(fetchFn, deps = [], cacheKey = null, refreshMs = DEFAULT_REFRESH_MS) {
  const key = cacheKey != null ? cacheKey : autoKey(fetchFn, deps)
  const hasCache = cacheHas(key)
  const [data, setData] = useState(hasCache ? cacheGet(key) : null)
  const [loading, setLoading] = useState(!hasCache)
  const [error, setError] = useState(null)
  const fnRef = useRef(fetchFn)
  fnRef.current = fetchFn
  const lastLoad = useRef(0)
  const seq = useRef(0) // eskirgan (sekin kelgan) javob yangi filtr natijasini bosib ketmasin

  const load = useCallback(async (bg = false) => {
    const my = ++seq.current
    const ep = epoch
    lastLoad.current = Date.now()
    if (!bg) { setLoading(true); setError(null) }
    try {
      const res = await fnRef.current()
      if (ep !== epoch) return // sessiya almashgan: eski javob keshga ham, ekranga ham chiqmasin
      // Fon yangilanishida kutilmaganda bo'shab qolgan ro'yxat (tarmoq uzilishi yutilgan xato) oldingi to'liq keshni bosib ketmasin.
      if (bg && isEmpty(res) && cacheHas(key) && !isEmpty(cacheGet(key))) return
      if (res != null) cacheSet(key, res) // null (yutilgan xato) keshlanmaydi
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
      const tick = () => { if (document.visibilityState !== 'hidden') load(true) }
      const iv = setInterval(tick, refreshMs)
      // Sahifaga qaytganda yangilaydi, lekin 15 soniyadan tez-tez emas (uyqudan uyg'onganda so'rovlar ko'chkisi bo'lmasin).
      const onVis = () => { if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > 15_000) load(true) }
      document.addEventListener('visibilitychange', onVis)
      return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis) }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshMs])

  const setDataCached = useCallback(
    (updater) => {
      seq.current++ // optimistik o'zgarishdan oldin boshlangan fon so'rovi uni bosib ketmasin
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
