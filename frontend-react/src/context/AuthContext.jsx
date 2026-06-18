/**
 * AuthContext — Global authentication state
 *
 * TOKEN STORAGE
 * ─────────────────────────────────────────────────────────────
 * Access token   → in-memory only (api.js module variable) — lost on refresh, restored via refresh token
 * Refresh token  → localStorage (persists across page refreshes, cleared on logout)
 * localStorage also stores { username, loginTime } for session expiry tracking
 *
 * ON PAGE REFRESH:
 *   1. Read refresh token from localStorage
 *   2. Call POST /auth/refresh to get a new access token
 *   3. Call GET /me to verify identity and get role
 *   4. Restore user state
 *
 * SESSION EXPIRY: 2 hours from login time (stored in localStorage)
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { logout as apiLogout, getMe, setTokens, clearTokens, refreshTokens } from '../services/api'

const AuthContext = createContext(null)
const SESSION_DURATION = 2 * 60 * 60 * 1000 // 2 hours

const STORAGE_KEY = 'isomac_session'

function normaliseRole(role) {
  if (role === 'it_staff') return 'editor'
  if (role === 'end_user') return 'viewer'
  return role
}

function saveSession(username, refreshToken) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      username,
      refreshToken,
      loginTime: Date.now(),
    }))
  } catch (_) {}
}

function loadSession() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    const s = JSON.parse(stored)
    if (s.loginTime && Date.now() - s.loginTime > SESSION_DURATION) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return s
  } catch {
    return null
  }
}

function clearSession() {
  try { localStorage.removeItem(STORAGE_KEY) } catch (_) {}
}

export function AuthProvider({ children }) {
  const [user, setUser]                     = useState(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [loading, setLoading]               = useState(true)

  const signOut = useCallback(async (expired = false) => {
    try { await apiLogout() } catch (_) {}
    clearTokens()
    clearSession()
    setUser(null)
    if (expired) setSessionExpired(true)
  }, [])

  // Listen for Axios interceptor's session-expired event
  useEffect(() => {
    const handler = () => {
      clearTokens()
      clearSession()
      setUser(null)
      setSessionExpired(true)
    }
    window.addEventListener('auth:session-expired', handler)
    return () => window.removeEventListener('auth:session-expired', handler)
  }, [])

  // On mount: restore session from localStorage using refresh token
  useEffect(() => {
    async function restoreSession() {
      const session = loadSession()
      if (!session?.refreshToken) {
        setLoading(false)
        return
      }

      try {
        // Use refresh token to get a new access token
        const refreshRes = await refreshTokens(session.refreshToken)
        const { accessToken, refreshToken: newRefresh } = refreshRes.data

        // Store new tokens in memory
        setTokens(accessToken, newRefresh || session.refreshToken)

        // Update stored refresh token if rotated
        if (newRefresh) {
          saveSession(session.username, newRefresh)
        }

        // Verify identity via /me
        const meRes = await getMe()
        const { _id, username, role } = meRes.data
        setUser({ _id, username, role: normaliseRole(role) })
      } catch {
        // Refresh failed — session expired or token revoked
        clearSession()
        clearTokens()
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    restoreSession()
  }, [])

  // Auto-expire frontend session after 2 hours
  useEffect(() => {
    if (!user) return
    const session = loadSession()
    if (!session?.loginTime) return
    const remaining = SESSION_DURATION - (Date.now() - session.loginTime)
    if (remaining <= 0) { signOut(true); return }
    const timer = setTimeout(() => signOut(true), remaining)
    return () => clearTimeout(timer)
  }, [user, signOut])

  async function signIn(username, accessToken, refreshToken) {
    if (accessToken || refreshToken) {
      setTokens(accessToken, refreshToken)
    }

    // Persist refresh token + login time in localStorage
    if (refreshToken) {
      saveSession(username, refreshToken)
    }

    try {
      const res = await getMe()
      const { _id, username: verifiedUsername, role } = res.data
      setUser({ _id, username: verifiedUsername, role: normaliseRole(role) })
    } catch {
      clearSession()
      clearTokens()
      setUser(null)
    }
    setSessionExpired(false)
  }

  const isAdmin        = user?.role === 'admin' || user?.role === 'company_admin' || user?.role === 'super_admin'
  const isSuperAdmin   = user?.role === 'super_admin'
  const isCompanyAdmin = user?.role === 'company_admin' || user?.role === 'admin'
  const isEditor       = user?.role === 'editor' || isAdmin
  const isEmployee     = user?.role === 'employee'
  const isViewer       = user?.role === 'viewer'

  return (
    <AuthContext.Provider value={{
      user, signIn, signOut,
      isAdmin, isEditor, isViewer,
      isSuperAdmin, isCompanyAdmin, isEmployee,
      sessionExpired,
      loading,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
