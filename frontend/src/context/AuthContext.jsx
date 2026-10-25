// ====== Autentifikatsiya va RBAC konteksti ======
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { api, tokenStore, refreshStore, setSession, clearSession } from '../lib/apiClient'
import { invalidateCache } from '../lib/useApi'

const AuthContext = createContext(null)

// Foydalanuvchini keshda saqlash — sahifa yangilanganda/tarmoq sekin bo'lganda
// login CHIQMASLIGI uchun darrov ko'rsatamiz, keyin fonda /auth/me bilan tekshiramiz.
const USER_KEY = 'sa_user'
function readCachedUser() { try { const s = localStorage.getItem(USER_KEY); return s ? JSON.parse(s) : null } catch { return null } }
function writeCachedUser(d) { try { localStorage.setItem(USER_KEY, JSON.stringify({ user: d.user, permissions: d.permissions || [] })) } catch { /* */ } }
function clearCachedUser() { try { localStorage.removeItem(USER_KEY) } catch { /* */ } }

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(true)

  // Ilk yuklashda joriy foydalanuvchini olish
  useEffect(() => {
    let alive = true
    async function boot() {
      // Access token bo'lmasa ham, refresh token bo'lsa — /auth/me ichida refresh orqali tiklanadi.
      const token = tokenStore.get()
      const rt = refreshStore.get()
      if (!token && !rt) { setLoading(false); return }
      // Keshdagi foydalanuvchini DARROV ko'rsatamiz — sahifa yangilansa/tarmoq sekin bo'lsa login chiqmaydi.
      const cached = readCachedUser()
      if (cached && cached.user && alive) { setUser(cached.user); setPermissions(cached.permissions || []); setLoading(false) }
      try {
        const me = await api.get('/auth/me') // -> { user, permissions } (401 bo'lsa ichida refresh)
        if (alive) { setUser(me.user); setPermissions(me.permissions || []); writeCachedUser(me) }
      } catch {
        // Yaroqsiz token bo'lsa — apiClient ichida 'sa:unauthorized' chiqib logout bo'ladi.
        // Vaqtinchalik xato (tarmoq/503) bo'lsa — keshdagi foydalanuvchi qoladi, LOGIN CHIQMAYDI.
      }
      finally { if (alive) setLoading(false) }
    }
    boot()
    return () => { alive = false }
  }, [])

  // Refresh token yaroqsiz bo'lganda (haqiqiy sessiya tugashi) — tizimdan chiqarish
  useEffect(() => {
    const h = () => { clearCachedUser(); setUser(null); setPermissions([]) }
    window.addEventListener('sa:unauthorized', h)
    return () => window.removeEventListener('sa:unauthorized', h)
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password }) // -> { token, refreshToken, user, permissions }
    invalidateCache() // boshqa foydalanuvchi keshini ko'rsatmaslik uchun tozalaymiz
    setSession({ token: res.token, refreshToken: res.refreshToken })
    setUser(res.user); setPermissions(res.permissions || [])
    writeCachedUser(res)
  }, [])

  // Birinchi sozlash: { name, email, password, setupToken? } -> super admin yaratadi va darrov kiritadi.
  const setup = useCallback(async (data) => {
    const res = await api.post('/auth/setup', data) // login bilan bir xil javob
    invalidateCache()
    setSession({ token: res.token, refreshToken: res.refreshToken })
    setUser(res.user); setPermissions(res.permissions || [])
    writeCachedUser(res)
  }, [])

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout') } catch { /* */ }
    invalidateCache() // keshni tozalab, keyingi foydalanuvchiga sirqib o'tmasin
    clearCachedUser()
    clearSession(); setUser(null); setPermissions([])
  }, [])

  const can = useCallback((perm) => !perm || permissions.includes(perm), [permissions])

  const value = useMemo(() => ({
    user, permissions, loading, login, setup, logout, can,
  }), [user, permissions, loading, login, setup, logout, can])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth AuthProvider ichida ishlatilishi kerak')
  return ctx
}
