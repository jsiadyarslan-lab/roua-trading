'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * AuthGuard — Optional auth protection for the dashboard.
 *
 * Checks if a session exists by calling /api/auth/me.
 * If no session exists and the user hasn't previously visited,
 * shows a brief loading state then allows access (guest mode).
 *
 * The AuthInitializer in the layout already creates a guest session,
 * so this guard is a secondary safety net.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'guest'>('loading')

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          setStatus('authenticated')
        } else {
          setStatus('guest')
        }
      })
      .catch(() => {
        setStatus('guest')
      })
  }, [router])

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

  return <>{children}</>
}
