'use client'

import { useEffect } from 'react'

/**
 * AuthInitializer — Ensures a roua_session cookie exists before any API calls.
 *
 * When the dashboard loads, many components immediately fetch data from
 * NestJS-proxied API routes (e.g., /api/trading/positions). These routes
 * require a valid roua_session cookie for authentication. If no session
 * exists, all API calls fail with 401.
 *
 * This component calls /api/auth/me on mount, which auto-creates a guest
 * user + session and sets the roua_session cookie. By including this in
 * the dashboard layout, we ensure the cookie is set before child
 * components start making API calls.
 */
export function AuthInitializer() {
  useEffect(() => {
    // Fire-and-forget: ensure session cookie exists
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          // Session cookie is now set — all subsequent API calls will work
        }
      })
      .catch(() => {
        // Auth init failed — API calls will fall back gracefully
      })
  }, [])

  return null // No UI — just side effect
}
