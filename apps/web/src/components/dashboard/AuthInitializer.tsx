'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/lib/auth-store'

/**
 * AuthInitializer — Validates existing session for dashboard users.
 *
 * Uses the Zustand auth store for session validation.
 * This is a secondary check after middleware has verified the roua_session cookie.
 *
 * IMPORTANT: Also checks isGuest — guest users should NOT be redirected to login.
 * Guest access is created via /api/auth/guest and gives view-only dashboard access.
 */
export function AuthInitializer() {
  useEffect(() => {
    const state = useAuthStore.getState()
    // Only redirect if user is neither authenticated nor a guest, and loading is done
    if (!state.isAuthenticated && !state.isGuest && !state.loading) {
      // Session is invalid — redirect to login
      window.location.href = '/login'
    }
  }, [])

  return null // No UI — just side effect
}
