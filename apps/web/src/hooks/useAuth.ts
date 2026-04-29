import { useEffect, useState, createContext, useContext } from 'react'
import { useRouter } from 'next/navigation'

interface User {
  id: string
  email: string
  displayName: string
  tier: string
  isGuest: boolean
}

interface AuthContextValue {
  user: User | null
  loading: boolean
  isGuest: boolean
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  isGuest: true,
})

export const useAuthContext = () => useContext(AuthContext)

/**
 * useAuth — Ensures the user has a valid session.
 *
 * Auth flow (in order of priority):
 * 1. Call /api/auth/me — auto-creates guest session if needed
 * 2. If /api/auth/me fails, call /api/auth/sync as fallback
 * 3. If both fail, allow unauthenticated access (no redirect)
 *
 * Returns isGuest flag to enable view-only mode for guests.
 */
export function useAuth() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function checkAuth() {
      // Try /api/auth/me first — it has the most robust error handling
      // and auto-creates guest sessions
      try {
        const meRes = await fetch('/api/auth/me')
        if (meRes.ok) {
          const meData = await meRes.json()
          if (meData.authenticated) {
            if (mounted) setUser(meData.user)
            return
          }
        }
      } catch { /* try sync */ }

      // Fallback: /api/auth/sync
      try {
        const syncRes = await fetch('/api/auth/sync')
        if (syncRes.ok) {
          const syncData = await syncRes.json()
          if (syncData.authenticated) {
            if (mounted) setUser(syncData.user)
            return
          }
        }
      } catch { /* no session */ }

      // No redirect — allow unauthenticated access
      // The dashboard works without authentication (falls back to demo data)
      if (mounted) setUser(null)
    }

    checkAuth().finally(() => {
      if (mounted) setLoading(false)
    })

    return () => { mounted = false }
  }, [router])

  const isGuest = !user || user.isGuest || user.email === 'guest@roua.auto' || user.id.startsWith('guest')

  return { user, loading, isGuest }
}
