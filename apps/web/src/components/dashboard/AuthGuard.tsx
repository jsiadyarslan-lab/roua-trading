'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'

/**
 * AuthGuard — Enforces authentication for the dashboard.
 *
 * Uses the Zustand auth store for global state management.
 * Middleware provides first-line protection; this is the client-side safety net.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading')

  useEffect(() => {
    let mounted = true

    const checkAuth = async () => {
      try {
        await useAuthStore.getState().refreshUser()
        const state = useAuthStore.getState()
        if (!mounted) return

        if (state.isAuthenticated && !state.isGuest) {
          setStatus('authenticated')
        } else {
          setStatus('unauthenticated')
          const loginUrl = `/login?callbackUrl=${encodeURIComponent(pathname)}`
          router.replace(loginUrl)
        }
      } catch {
        if (!mounted) return
        setStatus('unauthenticated')
        const loginUrl = `/login?callbackUrl=${encodeURIComponent(pathname)}`
        router.replace(loginUrl)
      }
    }

    checkAuth()

    return () => {
      mounted = false
      // Stop auto-refresh when AuthGuard unmounts
      useAuthStore.getState().stopAutoRefresh()
    }
  }, [router, pathname])

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '100dvh', background: '#0B0E14' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center animate-pulse" style={{ background: 'linear-gradient(135deg, #0891b2, #00d4ff)' }}>
            <svg className="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <span className="text-white/20 text-xs" style={{ fontFamily: 'var(--font-ar)' }}>جارٍ التحقق...</span>
        </div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '100dvh', background: '#0B0E14' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center animate-pulse" style={{ background: 'linear-gradient(135deg, #0891b2, #00d4ff)' }}>
            <svg className="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <span className="text-white/20 text-xs" style={{ fontFamily: 'var(--font-ar)' }}>جارٍ التحويل...</span>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
