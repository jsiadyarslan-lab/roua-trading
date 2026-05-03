import { create } from 'zustand'

/**
 * Auth Store — Zustand store for authentication state management.
 *
 * Features:
 * - User state (id, email, displayName, tier, isGuest)
 * - LocalStorage caching with TTL (5 minutes)
 * - refreshUser: re-validate session via /api/auth/me
 * - loginWithEmail: create session via email login flow
 * - logout: clear session, clear ALL user-specific stores, and redirect to /login
 * - Auto-refresh: periodic session refresh every 15 minutes (sliding sessions)
 * - SECURITY: On logout, clears all persisted stores (positions, paper trades)
 *   to prevent user B from seeing user A's data
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

/**
 * SECURITY: Clear all user-specific stores to prevent data leakage.
 * Called when user changes (login with different account, logout).
 * Dynamically imports stores to avoid circular dependencies.
 */
async function _clearAllUserStores(): Promise<void> {
  try {
    const { usePositionsStore } = await import('@/hooks/usePositionsStore')
    usePositionsStore.getState().clearUserData()
  } catch { /* Store not loaded yet */ }
  try {
    const { usePaperTradesStore } = await import('@/hooks/usePaperTradesStore')
    usePaperTradesStore.getState().clearUserData()
  } catch { /* Store not loaded yet */ }

  // Clear all user-specific localStorage keys
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (
        key.startsWith('roua-positions-store') ||
        key.startsWith('roua-paper-trades') ||
        key.startsWith('roua-bot') ||
        key.startsWith('roua-alerts') ||
        key.startsWith('roua-decision')
      )) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
  } catch { /* localStorage unavailable */ }
}

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

// ── BroadcastChannel for real-time cross-tab auth sync ──
let _authChannel: BroadcastChannel | null = null
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  _authChannel = new BroadcastChannel('roua_auth_sync')
  _authChannel.onmessage = (e) => {
    if (e.data?.type === 'auth_update') {
      const { user, isAuthenticated, isGuest } = e.data
      useAuthStore.setState({ user, isAuthenticated, isGuest, loading: false })
    }
    if (e.data?.type === 'auth_logout') {
      useAuthStore.setState({ user: null, isAuthenticated: false, isGuest: true, loading: false })
    }
  }
  // Clean up BroadcastChannel on page unload to prevent memory leaks
  window.addEventListener('beforeunload', () => {
    _authChannel?.close()
    _authChannel = null
  })
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
        if (data.user) {
          const user = data.user as AuthUser
          const isGuest = data.isGuest || isGuestUser(user)

          // SECURITY: Detect user change — if new user differs from current, clear all stores
          const previousUser = get().user
          if (previousUser?.id && user.id && previousUser.id !== user.id) {
            console.warn('[AuthStore] SECURITY: User changed from', previousUser.id, 'to', user.id, '— clearing all stores')
            _clearAllUserStores()
          }

          writeCache(user)
          set({ user, isAuthenticated: !isGuest, isGuest, loading: false })
          _authChannel?.postMessage({ type: 'auth_update', user, isAuthenticated: !isGuest, isGuest })
          if (!isGuest) {
            // Start auto-refresh after successful auth check
            get().startAutoRefresh()
          }
          return user
        }
      }
      // Not authenticated at all
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
      // SECURITY: Use POST instead of GET to prevent email leaking in URL/logs/history
      const res = await fetch('/api/auth/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.authenticated && data.user && !data.isGuest) {
          const user = data.user as AuthUser

          // SECURITY: Detect user change — clear all stores if user changed
          const previousUser = get().user
          if (previousUser?.id && user.id && previousUser.id !== user.id) {
            console.warn('[AuthStore] SECURITY: User changed during login — clearing all stores')
            _clearAllUserStores()
          }

          writeCache(user)
          set({ user, isAuthenticated: true, isGuest: false, loading: false })
          _authChannel?.postMessage({ type: 'auth_update', user, isAuthenticated: true, isGuest: false })
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

    // SECURITY: Clear ALL user-specific stores before logout
    // This prevents user B from seeing user A's cached data
    try {
      const { usePositionsStore } = await import('@/hooks/usePositionsStore')
      usePositionsStore.getState().clearUserData()
    } catch { /* Store not loaded yet */ }
    try {
      const { usePaperTradesStore } = await import('@/hooks/usePaperTradesStore')
      usePaperTradesStore.getState().clearUserData()
    } catch { /* Store not loaded yet */ }

    // Clear additional user-specific localStorage keys
    try {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        // Remove all user-specific data keys (positions, paper-trades, bots, etc.)
        if (key && (
          key.startsWith('roua-positions-store') ||
          key.startsWith('roua-paper-trades') ||
          key.startsWith('roua-bot') ||
          key.startsWith('roua-alerts') ||
          key.startsWith('roua-decision')
        )) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key))
    } catch { /* localStorage unavailable */ }

    try {
      await fetch('/api/auth/me', { method: 'DELETE' })
    } catch {
      // Ignore
    }

    clearCache()
    set({ user: null, isAuthenticated: false, isGuest: true, loading: false })
    _authChannel?.postMessage({ type: 'auth_logout' })
    window.location.href = '/login'
  },

  setUser: (user: AuthUser | null) => {
    if (user) {
      const isGuest = isGuestUser(user)
      writeCache(user)
      set({ user, isAuthenticated: !isGuest, isGuest, loading: false })
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
          if (data.user) {
            // Update store with potentially refreshed user data
            const user = data.user as AuthUser
            const guest = data.isGuest || isGuestUser(user)
            writeCache(user)
            set({ user, isAuthenticated: !guest, isGuest: guest })
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
    // Trigger background refresh to ensure data is current across devices
    // (don't await — let the UI render with cached data first)
    setTimeout(() => useAuthStore.getState().refreshUser(), 100)
    return cached
  }

  useAuthStore.setState({ loading: false })
  return null
}

// ── Cross-tab sync: listen for localStorage changes from other tabs ──
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === CACHE_KEY && e.newValue) {
      try {
        const user = JSON.parse(e.newValue) as AuthUser
        const isGuest = isGuestUser(user)
        useAuthStore.setState({ user, isAuthenticated: !isGuest, isGuest, loading: false })
      } catch {
        // Ignore invalid data
      }
    }
    if (e.key === CACHE_KEY && !e.newValue) {
      // Cache was cleared — user logged out in another tab
      useAuthStore.setState({ user: null, isAuthenticated: false, isGuest: true, loading: false })
    }
  })
}
