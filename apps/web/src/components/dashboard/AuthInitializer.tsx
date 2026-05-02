'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/lib/auth-store'

/**
 * AuthInitializer — Validates existing session for dashboard users.
 *
 * Uses the Zustand auth store for session validation.
 * This is a secondary check after middleware has verified the roua_session cookie.
 */
export function AuthInitializer() {
  useEffect(() => {
    const state = useAuthStore.getState()
    if (!state.isAuthenticated && !state.loading) {
      // Session is invalid — redirect to login
      window.location.href = '/login'
    }
  }, [])

  return null // No UI — just side effect
}
