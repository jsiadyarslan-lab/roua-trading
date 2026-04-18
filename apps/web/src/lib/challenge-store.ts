// ── Shared in-memory challenge store ──
// This module is imported by both register and verify routes.
// It MUST be a separate module (not exported from a route file)
// because Turbopack bundles each route independently in production,
// so a Map exported from register/route.ts would NOT be shared
// with verify/route.ts at runtime.
//
// In production with multiple instances, replace with Redis.

const challenges = new Map<string, { challenge: string; expires: number }>()

// Clean expired challenges every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, val] of challenges) {
      if (val.expires < now) challenges.delete(key)
    }
  }, 5 * 60 * 1000)
}

export { challenges }
