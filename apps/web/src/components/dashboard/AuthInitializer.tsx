'use client'

import { useEffect } from 'react'

/**
 * AuthInitializer — Validates existing session for dashboard users.
 *
 * Called after middleware has already verified the roua_session cookie.
 * This is a secondary check that validates the session is still active.
 * Does NOT create guest sessions — users must login to access the dashboard.
 */
export function AuthInitializer() {
  useEffect(() => {
    // Validate existing session
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (!data.authenticated) {
          // Session is invalid — redirect to login
          // Middleware should have caught this, but as a safety net:
          window.location.href = '/login'
        }
      })
      .catch(() => {
        // Auth check failed — redirect to login
        window.location.href = '/login'
      })
  }, [])

  return null // No UI — just side effect
}
