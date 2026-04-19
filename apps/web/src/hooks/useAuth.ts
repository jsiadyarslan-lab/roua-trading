import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface User {
  id: string
  email: string
  displayName: string
  tier: string
}

export function useAuth() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function checkAuth() {
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

      const hasCookie = document.cookie.includes('roua_session')
      if (!hasCookie && mounted) {
        router.push('/')
      }
    }

    checkAuth().finally(() => {
      if (mounted) setLoading(false)
    })

    return () => { mounted = false }
  }, [router])

  return { user, loading }
}
