'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from '@/i18n/navigation'
import { useAuthStore } from '@/lib/auth-store'
import { useTranslations } from 'next-intl'

/**
 * AuthGuard — Enforces authentication for the dashboard.
 *
 * CRITICAL FIX: The useEffect dependency array previously included `pathname`
 * which caused auth to re-check on EVERY navigation click:
 *   pathname changes → useEffect fires → status = 'loading' → full-screen
 *   spinner appears → router thinks navigation failed → page appears frozen.
 *
 * The fix: run auth check ONCE on mount only (empty dependency array).
 * Use a ref for pathname so the redirect URL is always current without
 * triggering a re-check.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading')
  const tc = useTranslations('common')
  const te = useTranslations('dashboard.execution')

  // Keep pathnameRef current without triggering re-auth
  pathnameRef.current = pathname

  useEffect(() => {
    let mounted = true

    const checkAuth = async () => {
      try {
        await useAuthStore.getState().refreshUser()
        const state = useAuthStore.getState()
        if (!mounted) return

        if (state.isAuthenticated || state.isGuest) {
          setStatus('authenticated')
        } else {
          setStatus('unauthenticated')
          const loginUrl = `/login?callbackUrl=${encodeURIComponent(pathnameRef.current)}`
          router.replace(loginUrl)
        }
      } catch {
        if (!mounted) return
        // On error, allow through — the dashboard has its own guest handling
        setStatus('authenticated')
      }
    }

    checkAuth()

    return () => {
      mounted = false
      useAuthStore.getState().stopAutoRefresh()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // ← Run ONCE on mount only. Do NOT add pathname or router here.

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
          <span className="text-white/20 text-xs" style={{ fontFamily: 'var(--font-ar)' }}>{tc('verifying')}</span>
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
          <span className="text-white/20 text-xs" style={{ fontFamily: 'var(--font-ar)' }}>{te('redirecting')}</span>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
