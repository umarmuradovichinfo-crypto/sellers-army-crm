// ====== REST API mijozi (fetch wrapper) ======
// Barcha so'rovlar shu yerdan o'tadi: auth tokeni, xatoliklar, JSON — bir joyda.
// Token eskirsa (401) — refresh token orqali avtomatik yangilanadi, so'rov qayta yuboriladi.
// Faqat refresh ham ishlamasa — login sahifasiga.

const BASE = import.meta.env.VITE_API_BASE || '/api/v1'
export const USE_MOCKS = String(import.meta.env.VITE_USE_MOCKS) === 'true'

const TOKEN_KEY = 'sa_token'
const REFRESH_KEY = 'sa_refresh'

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export const refreshStore = {
  get: () => localStorage.getItem(REFRESH_KEY),
  set: (t) => (t ? localStorage.setItem(REFRESH_KEY, t) : localStorage.removeItem(REFRESH_KEY)),
  clear: () => localStorage.removeItem(REFRESH_KEY),
}

// Login/refresh natijasini saqlash
export function setSession({ token, refreshToken }) {
  if (token) tokenStore.set(token)
  if (refreshToken) refreshStore.set(refreshToken)
}
export function clearSession() {
  tokenStore.clear()
  refreshStore.clear()
}

export class ApiError extends Error {
  constructor(status, message, data) {
    super(message)
    this.status = status
    this.data = data
  }
}

// Bir vaqtning o'zida ko'p 401 bo'lsa — bitta refresh chaqiruvi (dedupe)
let refreshing = null

// refresh natijasi: 'ok' (yangilandi), 'transient' (tarmoq/server xatosi — sessiyani BUZMAYMIZ),
// 'invalid' (refresh token yaroqsiz/muddati tugagan — endi login kerak).
async function doRefresh() {
  const rt = refreshStore.get()
  if (!rt) return 'invalid'
  // Tarmoq yoki vaqtinchalik server xatosida darrov logout qilmaymiz — 2 marta urinib ko'ramiz.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      })
      if (res.ok) {
        const data = await res.json().catch(() => null)
        if (data && data.token) {
          setSession({ token: data.token, refreshToken: data.refreshToken })
          return 'ok'
        }
        return 'transient' // 200 lekin token yo'q — g'alati, sessiyani buzmaymiz
      }
      // 401/403 — refresh token haqiqatan yaroqsiz. Boshqa status (5xx) — vaqtinchalik.
      if (res.status === 401 || res.status === 403) return 'invalid'
      // 5xx — keyingi urinishga o'tamiz
    } catch {
      // tarmoq xatosi — keyingi urinishga o'tamiz
    }
  }
  return 'transient'
}

function tryRefresh() {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => { refreshing = null })
  }
  return refreshing
}

async function rawFetch(method, path, body, opts) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`
  return fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
    ...opts,
  })
}

async function request(method, path, body, opts = {}) {
  // login va refresh — bularga refresh urinishi qilinmaydi (loop oldini olish).
  // /auth/me esa refresh qilinishi KERAK (eskirgan tokenda tiklash uchun).
  const noRefresh = path.startsWith('/auth/login') || path.startsWith('/auth/setup') || path.startsWith('/auth/refresh')
  let res = await rawFetch(method, path, body, opts)

  // Access token eskirgan bo'lsa (401) — refresh qilib, so'rovni bir marta qayta yuboramiz.
  if (res.status === 401 && !noRefresh && !opts.__retried) {
    const r = await tryRefresh()
    if (r === 'ok') {
      res = await rawFetch(method, path, body, { ...opts, __retried: true })
      // MUHIM: refresh ISHLADI = sessiya YAROQLI. Qayta so'rov yana 401 qaytarsa ham
      // (masalan shu endpoint muammosi yoki ruxsat), foydalanuvchini CHIQARMAYMIZ.
      // Aynan shu narsa oldin tez-tez login chiqishiga sabab bo'lgan edi.
    } else if (r === 'transient') {
      // Tarmoq/server vaqtinchalik xatosi — sessiyani BUZMAYMIZ.
      throw new ApiError(503, "Ulanishda vaqtinchalik xatolik — birozdan so'ng qayta urining")
    } else {
      // r === 'invalid' — refresh token haqiqatan yaroqsiz/muddati tugagan → endi login kerak.
      clearSession()
      window.dispatchEvent(new CustomEvent('sa:unauthorized'))
    }
  }

  const isJson = (res.headers.get('content-type') || '').includes('application/json')
  const data = isJson ? await res.json().catch(() => null) : await res.text()

  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `Xatolik: ${res.status}`
    throw new ApiError(res.status, msg, data)
  }
  return data
}

// Fayl yuklash (multipart) — fetch progress bermaydi, shuning uchun XHR.
// Content-Type qo'yilMAYDI (brauzer boundary bilan o'zi qo'yadi).
// 401 bo'lsa bitta refresh-retry (oddiy so'rovlardagi kabi).
function uploadOnce(path, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${BASE}${path}`)
    const token = tokenStore.get()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.onload = () => {
      let data = null
      try { data = JSON.parse(xhr.responseText) } catch { data = xhr.responseText }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data)
      else reject(new ApiError(xhr.status, (data && (data.message || data.error)) || `Xatolik: ${xhr.status}`, data))
    }
    xhr.onerror = () => reject(new ApiError(0, 'Tarmoq xatosi — internetni tekshiring'))
    xhr.send(formData)
  })
}

async function upload(path, formData, onProgress) {
  try {
    return await uploadOnce(path, formData, onProgress)
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      const r = await tryRefresh()
      if (r === 'ok') return uploadOnce(path, formData, onProgress)
      if (r === 'invalid') {
        clearSession()
        window.dispatchEvent(new CustomEvent('sa:unauthorized'))
      }
    }
    throw e
  }
}

// Binar (audio/rasm) yuklab olish — auth header + 401 refresh-retry bilan.
// Blob qaytaradi (chatda ijro uchun object URL yasaladi).
async function downloadBlob(path, opts = {}) {
  let res = await rawFetch('GET', path, null, opts)
  if (res.status === 401 && !opts.__retried) {
    const r = await tryRefresh()
    if (r === 'ok') res = await rawFetch('GET', path, null, { ...opts, __retried: true })
    else if (r === 'transient') throw new ApiError(503, "Ulanishda vaqtinchalik xatolik")
  }
  if (res.status === 401) {
    clearSession()
    window.dispatchEvent(new CustomEvent('sa:unauthorized'))
  }
  if (!res.ok) {
    let msg = `Xatolik: ${res.status}`
    try { const j = await res.json(); msg = (j && (j.message || j.error)) || msg } catch { /* */ }
    throw new ApiError(res.status, msg)
  }
  return res.blob()
}

export const api = {
  get: (path, opts) => request('GET', path, null, opts),
  post: (path, body, opts) => request('POST', path, body, opts),
  put: (path, body, opts) => request('PUT', path, body, opts),
  patch: (path, body, opts) => request('PATCH', path, body, opts),
  del: (path, opts) => request('DELETE', path, null, opts),
  upload,
  getBlob: downloadBlob,
}

// Mock yordamchisi: USE_MOCKS=true bo'lsa, real chaqiruv o'rniga namuna ma'lumotni
// kichik kechikish bilan qaytaradi. Backend tayyor bo'lganda VITE_USE_MOCKS=false.
export function mockOr(realFn, mockValue, delay = 250) {
  if (USE_MOCKS) {
    return new Promise((resolve) => setTimeout(() => resolve(structuredCloneSafe(mockValue)), delay))
  }
  return realFn()
}

function structuredCloneSafe(v) {
  try { return structuredClone(v) } catch { return JSON.parse(JSON.stringify(v)) }
}
