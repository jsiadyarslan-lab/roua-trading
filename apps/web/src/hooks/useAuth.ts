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
 * useAuth — Checks if the user has a valid authenticated session.
 *
 * Auth flow:
 * 1. Call /api/auth/me — validates existing session
 * 2. If /api/auth/me fails, call /api/auth/sync as fallback
 * 3. If both fail or return unauthenticated, redirect to /login
 *
 * No guest mode — users must be authenticated to access the dashboard.
 */
export function useAuth() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function checkAuth() {
      // Try /api/auth/me first
      try {
        const meRes = await fetch('/api/auth/me')
        if (meRes.ok) {
          const meData = await meRes.json()
          if (meData.authenticated && !meData.isGuest) {
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
          if (syncData.authenticated && !syncData.isGuest) {
            if (mounted) setUser(syncData.user)
            return
          }
        }
      } catch { /* no session */ }

      // Not authenticated — redirect to login
      if (mounted) {
        setUser(null)
        router.replace('/login')
      }
    }

    checkAuth().finally(() => {
      if (mounted) setLoading(false)
    })

    return () => { mounted = false }
  }, [router])

  // isGuest is always false now since we don't allow guest sessions
  const isGuest = !user || user.isGuest || user.email === 'guest@roua.auto' || user.id.startsWith('guest')

  return { user, loading, isGuest }
}
