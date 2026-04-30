import { create } from 'zustand'

/**
 * Auth Store — Zustand store for authentication state management.
 *
 * Features:
 * - User state (id, email, displayName, tier, isGuest)
 * - LocalStorage caching with TTL (5 minutes)
 * - refreshUser: re-validate session via /api/auth/me
 * - loginWithEmail: create session via email login flow
 * - logout: clear session and redirect to /login
 * - Auto-refresh: periodic session refresh every 15 minutes (sliding sessions)
 */

// ── Types ──

export interface AuthUser {
  id: string
  email: string
  displayName: string | null
  tier: string
  isGuest: boolean
}

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isGuest: boolean
  loading: boolean

  // Actions
  refreshUser: () => Promise<AuthUser | null>
  loginWithEmail: (email: string) => Promise<AuthUser | null>
  logout: () => Promise<void>
  setUser: (user: AuthUser | null) => void
  startAutoRefresh: () => void
  stopAutoRefresh: () => void
}

// ── Constants ──

const CACHE_KEY = 'roua_auth_user'
const CACHE_TIME_KEY = 'roua_auth_cache_time'
const CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutes cache TTL
const GUEST_EMAIL = 'guest@roua.auto'

let _refreshInterval: ReturnType<typeof setInterval> | null = null
const REFRESH_INTERVAL_MS = 15 * 60 * 1000 // Check every 15 minutes

// ── Helpers ──

function readCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    const cacheTime = localStorage.getItem(CACHE_TIME_KEY)

    if (!raw || !cacheTime) return null

    const age = Date.now() - parseInt(cacheTime, 10)
    if (age > CACHE_DURATION_MS) return null // Cache expired

    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

function writeCache(user: AuthUser) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(user))
    localStorage.setItem(CACHE_TIME_KEY, String(Date.now()))
  } catch {
    // LocalStorage unavailable (SSR, incognito, etc.)
  }
}

function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY)
    localStorage.removeItem(CACHE_TIME_KEY)
  } catch {
    // Ignore
  }
}

function isGuestUser(user: AuthUser | null): boolean {
  if (!user) return true
  return user.isGuest || user.email === GUEST_EMAIL || user.id.startsWith('guest')
}

// ── Store ──

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isGuest: true,
  loading: true,

  refreshUser: async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        if (data.authenticated && data.user && !data.isGuest) {
          const user = data.user as AuthUser
          writeCache(user)
          set({ user, isAuthenticated: true, isGuest: false, loading: false })
          // Start auto-refresh after successful auth check
          get().startAutoRefresh()
          return user
        }
      }
      // Not authenticated
      clearCache()
      set({ user: null, isAuthenticated: false, isGuest: true, loading: false })
      return null
    } catch {
      set({ loading: false })
      return null
    }
  },

  loginWithEmail: async (email: string) => {
    try {
      const res = await fetch(`/api/auth/me?email=${encodeURIComponent(email)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.authenticated && data.user && !data.isGuest) {
          const user = data.user as AuthUser
          writeCache(user)
          set({ user, isAuthenticated: true, isGuest: false, loading: false })
          // Start auto-refresh after successful login
          get().startAutoRefresh()
          return user
        }
      }
      return null
    } catch {
      return null
    }
  },

  logout: async () => {
    // Stop auto-refresh
    get().stopAutoRefresh()

    try {
      await fetch('/api/auth/me', { method: 'DELETE' })
    } catch {
      // Ignore
    }

    clearCache()
    set({ user: null, isAuthenticated: false, isGuest: true, loading: false })
    window.location.href = '/login'
  },

  setUser: (user: AuthUser | null) => {
    if (user && !isGuestUser(user)) {
      writeCache(user)
      set({ user, isAuthenticated: true, isGuest: false, loading: false })
    } else {
      clearCache()
      set({ user: null, isAuthenticated: false, isGuest: true, loading: false })
    }
  },

  startAutoRefresh: () => {
    if (_refreshInterval) return // Already running
    _refreshInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST' })
        if (res.ok) {
          const data = await res.json()
          if (data.authenticated && data.user) {
            // Update store with potentially refreshed user data
            const user = data.user as AuthUser
            writeCache(user)
            set({ user, isAuthenticated: true, isGuest: false })
          }
        } else if (res.status === 401) {
          // Session expired — redirect to login
          get().stopAutoRefresh()
          clearCache()
          set({ user: null, isAuthenticated: false, isGuest: true })
          window.location.href = '/login'
        }
      } catch {
        // Network error — don't disrupt the user, try again next interval
      }
    }, REFRESH_INTERVAL_MS)
  },

  stopAutoRefresh: () => {
    if (_refreshInterval) {
      clearInterval(_refreshInterval)
      _refreshInterval = null
    }
  },
}))

/**
 * Initialize auth store from localStorage cache.
 *
 * Call this once at app startup (e.g., in a root layout or provider).
 * Returns cached user if available and not expired, otherwise returns null.
 */
export function initAuthFromCache(): AuthUser | null {
  const cached = readCachedUser()
  if (cached && !isGuestUser(cached)) {
    useAuthStore.setState({
      user: cached,
      isAuthenticated: true,
      isGuest: false,
      loading: false,
    })
    return cached
  }

  useAuthStore.setState({ loading: false })
  return null
}
