// ====== Tarmoq holati: online / offline / server-unreachable ======
// navigator.onLine + online/offline hodisalari + har 15s da backend /health ping (5s timeout).
// Tab yashirin (hidden) bo'lsa ping to'xtaydi, qaytganda darrov qayta boshlanadi.

const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE) || '/api/v1'
export const PING_MS = 15000
export const PING_TIMEOUT_MS = 5000

const hasWin = typeof window !== 'undefined'
let state = hasWin && navigator.onLine === false ? 'offline' : 'online'
let serverDown = false
const subs = new Set()
let timer = null
let pinging = false

function compute() {
  if (hasWin && navigator.onLine === false) return 'offline'
  return serverDown ? 'server-unreachable' : 'online'
}
function emit() {
  const next = compute()
  if (next === state) return
  const prev = state
  state = next
  subs.forEach((cb) => { try { cb(next, prev) } catch { /* */ } })
}

export const getState = () => state
export function subscribe(cb) { subs.add(cb); return () => subs.delete(cb) }

// apiClient chaqiradi
export function markServerUnreachable() { serverDown = true; emit() }
export function markOnline() { serverDown = false; emit() }

export async function ping(fetchImpl) {
  if (pinging) return
  pinging = true
  const ctrl = new AbortController()
  const to = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS)
  try {
    const res = await (fetchImpl || fetch)(`${BASE}/health`, { method: 'GET', cache: 'no-store', signal: ctrl.signal })
    // /health faqat 200 qaytaradi; boshqa har qanday javob (proxy 500, Railway 502–504) — server yetib bo'lmaydi
    serverDown = !res.ok
  } catch {
    serverDown = true
  } finally {
    clearTimeout(to)
    pinging = false
    emit()
  }
}

function startTimer() {
  if (timer || !hasWin) return
  timer = setInterval(() => { if (!document.hidden) ping() }, PING_MS)
}
function stopTimer() { if (timer) { clearInterval(timer); timer = null } }

if (hasWin) {
  window.addEventListener('online', () => { emit(); ping() })
  window.addEventListener('offline', () => emit())
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopTimer()
    else { startTimer(); ping() }
  })
  if (!document.hidden) startTimer()
  if (navigator.onLine !== false) ping()
}
