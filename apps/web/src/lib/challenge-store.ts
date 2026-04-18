// ── Database-backed challenge store ──
// Replaces in-memory Map that was NOT shared between route bundles.
//
// In Next.js production builds, each API route is bundled independently.
// An in-memory Map in a shared module gets duplicated per route bundle,
// so challenges stored in register/route.ts were never visible to
// verify/route.ts. This database-backed store solves the problem.
//
// Usage:
//   await challengeStore.set(key, challenge, ttlMs)
//   const result = await challengeStore.get(key)  // returns challenge string or null
//   await challengeStore.delete(key)

import { db, ensureDbReady } from '@/lib/db'

export const challengeStore = {
  /**
   * Store a challenge in the database.
   * If a challenge with the same key already exists, it is replaced.
   */
  async set(key: string, challenge: string, ttlMs: number = 5 * 60 * 1000): Promise<void> {
    await ensureDbReady()

    const expiresAt = new Date(Date.now() + ttlMs)

    // upsert: replace any existing challenge for this key
    await db.challenge.upsert({
      where: { key },
      update: { challenge, expiresAt },
      create: { key, challenge, expiresAt },
    })

    // Clean up expired challenges opportunistically (no need to await)
    db.challenge.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    }).catch(() => {})
  },

  /**
   * Get a challenge from the database.
   * Returns null if not found or expired.
   * Expired challenges are automatically deleted.
   */
  async get(key: string): Promise<string | null> {
    await ensureDbReady()

    const record = await db.challenge.findUnique({ where: { key } })

    if (!record) {
      return null
    }

    // Check expiration
    if (record.expiresAt < new Date()) {
      // Clean up expired challenge
      await db.challenge.delete({ where: { key } }).catch(() => {})
      return null
    }

    return record.challenge
  },

  /**
   * Delete a challenge from the database.
   */
  async delete(key: string): Promise<void> {
    await db.challenge.delete({ where: { key } }).catch(() => {})
  },
}
