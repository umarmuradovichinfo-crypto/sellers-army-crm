// ====== REST API mijozi (fetch wrapper) ======
// Barcha so'rovlar shu yerdan o'tadi: auth tokeni, xatoliklar, JSON — bir joyda.
// Token eskirsa (401) — refresh token orqali avtomatik yangilanadi, so'rov qayta yuboriladi.
// Faqat refresh ham ishlamasa — login sahifasiga.

import { getState, markOnline, markServerUnreachable, subscribe as netSubscribe } from './network'

const BASE = import.meta.env.VITE_API_BASE || '/api/v1'

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
  // keyingi foydalanuvchiga oldingisining offline yozuvlari, Dono suhbati va bildirishnoma izlari o'tmasin
  try { localStorage.removeItem('sa_pending_queue') } catch { /* */ }
  try { sessionStorage.removeItem('dono:chat'); sessionStorage.removeItem('amo_notif_pushed'); sessionStorage.removeItem('dono:hint') } catch { /* */ }
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
    ...opts,
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  })
}

// ── Tarmoq chidamliligi ──
const RETRY_DELAYS = [1000, 2000, 4000]
const RETRY_STATUS = new Set([502, 503, 504])
const QUEUE_KEY = 'sa_pending_queue'
const QUEUE_MAX = 200
export const retryConfig = { delays: RETRY_DELAYS, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) }

const isNetErr = (e) => e && (e.name === 'TypeError' || e.name === 'AbortError')
const jitter = (ms) => Math.round(ms * (0.8 + Math.random() * 0.4))

// Faqat GET: tarmoq xatosi / 502-504 bo'lsa eksponensial retry (1s, 2s, 4s + jitter)
async function fetchWithRetry(method, path, body, opts) {
  if (method !== 'GET') return rawFetch(method, path, body, opts)
  let attempt = 0
  for (;;) {
    let res = null
    let err = null
    try { res = await rawFetch(method, path, body, opts) } catch (e) { err = e }
    const failed = err ? isNetErr(err) : RETRY_STATUS.has(res.status)
    if (!failed) {
      if (err) throw err
      markOnline()
      return res
    }
    if (attempt >= retryConfig.delays.length) {
      markServerUnreachable()
      if (err) throw err
      return res
    }
    await retryConfig.sleep(jitter(retryConfig.delays[attempt++]))
  }
}

// ── Offline navbat (POST/PUT/PATCH/DELETE) ──
const uuid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16) }))

const queueSubs = new Set()
const qState = { sending: false, total: 0, done: 0 }
function readQueue() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || [] } catch { return [] } }
function writeQueue(q) { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)) } catch { /* */ } queueNotify() }
function queueNotify() { const snap = pendingQueue.status(); queueSubs.forEach((cb) => { try { cb(snap) } catch { /* */ } }) }

export const pendingQueue = {
  size: () => readQueue().length,
  status: () => ({ size: readQueue().length, ...qState }),
  subscribe: (cb) => { queueSubs.add(cb); return () => queueSubs.delete(cb) },
  add(item) {
    const q = readQueue()
    if (q.length >= QUEUE_MAX) throw new ApiError(0, "Offline navbat to'lgan (200 ta)")
    q.push(item)
    writeQueue(q)
  },
  async flush() {
    if (qState.sending) return
    let q = readQueue()
    if (!q.length) return
    qState.sending = true; qState.total = q.length; qState.done = 0
    queueNotify()
    try {
      while (q.length) {
        const it = q[0]
        let res
        try {
          res = await rawFetch(it.method, it.path, it.body, { headers: { 'Idempotency-Key': it.key } })
        } catch (e) {
          if (isNetErr(e)) { markServerUnreachable(); break } // keyinroq qayta uriniladi
          throw e
        }
        if (RETRY_STATUS.has(res.status)) { markServerUnreachable(); break }
        // access token eskirgan (1 soatdan uzoq offline) — yangilab qayta urinamiz; yozuv yo'qolmasin
        if (res.status === 401) {
          const r = await tryRefresh()
          if (r === 'ok') res = await rawFetch(it.method, it.path, it.body, { headers: { 'Idempotency-Key': it.key } }).catch(() => res)
          if (res.status === 401) break // kirish talab qilinadi — navbat saqlanadi
        }
        markOnline()
        // 4xx — qayta yuborish foydasiz: yozuvni tashlaymiz; muvaffaqiyatda ham olib tashlaymiz
        q = readQueue().slice(1)
        writeQueue(q)
        qState.done++
        queueNotify()
      }
    } finally {
      qState.sending = false
      queueNotify()
    }
  },
}

if (typeof window !== 'undefined') {
  const tryFlush = () => { if (getState() === 'online' && pendingQueue.size()) pendingQueue.flush().catch(() => {}) }
  window.addEventListener('online', () => setTimeout(tryFlush, 300))
  netSubscribe((s) => { if (s === 'online') tryFlush() })
  window.addEventListener('load', () => setTimeout(tryFlush, 1500))
}

async function request(method, path, body, opts = {}) {
  const isWrite = method !== 'GET'
  // Offline bo'lsa yozuvchi so'rov navbatga tushadi (auth/upload'lar bundan mustasno)
  if (isWrite && !path.startsWith('/auth/') && getState() === 'offline') {
    // yangi bitim/kontakt/kompaniya yaratish navbatga tushmaydi: chaqiruvchi javobdagi id'ga tayanadi (dublikat/crash bo'lmasin)
    if (method === 'POST' && /^\/crm\/(leads|contacts|companies)$/.test(path)) throw new ApiError(0, "Offline: internet yo'q. Ulanish tiklangach qayta urinib ko'ring")
    const key = (opts.headers && opts.headers['Idempotency-Key']) || uuid()
    pendingQueue.add({ method, path, body, key, at: Date.now() })
    return { queued: true, offline: true }
  }
  if (isWrite) opts = { ...opts, headers: { 'Idempotency-Key': uuid(), ...(opts.headers || {}) } }

  // login va refresh — bularga refresh urinishi qilinmaydi (loop oldini olish).
  // /auth/me esa refresh qilinishi KERAK (eskirgan tokenda tiklash uchun).
  const noRefresh = path.startsWith('/auth/login') || path.startsWith('/auth/setup') || path.startsWith('/auth/refresh')
  let res = await fetchWithRetry(method, path, body, opts)

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
