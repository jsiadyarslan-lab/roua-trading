import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore, type AuthUser } from '@/lib/auth-store'

// Re-export the User type for backward compatibility
export type User = AuthUser

/**
 * useAuth — Hook that provides auth state using the Zustand auth store.
 *
 * On mount, it refreshes user data from the server (with localStorage cache).
 * If the user is not authenticated, it redirects to /login.
 *
 * This replaces the old React useState-based auth with a global Zustand store,
 * so user data is shared across all components without re-fetching.
 */
export function useAuth() {
  const router = useRouter()
  const user = useAuthStore(state => state.user)
  const loading = useAuthStore(state => state.loading)
  const isGuest = useAuthStore(state => state.isGuest)
  const refreshUser = useAuthStore(state => state.refreshUser)

  useEffect(() => {
    let mounted = true

    refreshUser().then(() => {
      const state = useAuthStore.getState()
      if (mounted && !state.isAuthenticated) {
        router.replace('/login')
      }
    })

    return () => { mounted = false }
  }, [router, refreshUser])

  return { user, loading, isGuest }
}

// Also export a simpler hook that doesn't trigger redirects
// Useful for components that just need to read user data
export function useAuthState() {
  return useAuthStore()
}
