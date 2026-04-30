'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

/**
 * AuthGuard — Enforces authentication for the dashboard.
 *
 * Checks if a valid session exists by calling /api/auth/me.
 * If not authenticated, redirects to /login.
 * This is a client-side safety net — the middleware is the primary protection.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading')

  useEffect(() => {
    let mounted = true

    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (!mounted) return
        if (data.authenticated && !data.isGuest) {
          setStatus('authenticated')
        } else {
          // Not authenticated — redirect to login
          setStatus('unauthenticated')
          const loginUrl = `/login?callbackUrl=${encodeURIComponent(pathname)}`
          router.replace(loginUrl)
        }
      })
      .catch(() => {
        if (!mounted) return
        setStatus('unauthenticated')
        const loginUrl = `/login?callbackUrl=${encodeURIComponent(pathname)}`
        router.replace(loginUrl)
      })

    return () => { mounted = false }
  }, [router, pathname])

  if (status === 'loading') {
    return (
      <div
        className="flex items-center justify-center"
        style={{ minHeight: '100vh', background: '#0B0E14' }}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center animate-pulse"
            style={{
              background: 'linear-gradient(135deg, #059669, #10B981)',
            }}
          >
            <svg className="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <span className="text-white/20 text-xs" style={{ fontFamily: 'var(--font-ar)' }}>
            جارٍ التحقق...
          </span>
        </div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    // Show nothing while redirecting
    return (
      <div
        className="flex items-center justify-center"
        style={{ minHeight: '100vh', background: '#0B0E14' }}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center animate-pulse"
            style={{
              background: 'linear-gradient(135deg, #059669, #10B981)',
            }}
          >
            <svg className="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <span className="text-white/20 text-xs" style={{ fontFamily: 'var(--font-ar)' }}>
            جارٍ التحويل...
          </span>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
