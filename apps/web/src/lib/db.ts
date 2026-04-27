import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  dbInitialized: boolean | undefined
}

// In production, also cache the PrismaClient on globalThis to prevent
// hot-reloading from creating multiple connections.
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
  })

// Always cache on globalThis (not just in dev)
if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = db
}

export async function ensureDbReady() {
  if (globalForPrisma.dbInitialized) return

  try {
    // Only check the User table — it's the only one needed for auth.
    // Previously this also checked db.challenge.findFirst() which would
    // throw if the Challenge table didn't exist, blocking the entire
    // auth flow and causing /api/auth/me to return 500.
    await db.user.findFirst()
    globalForPrisma.dbInitialized = true
  } catch (error: any) {
    const message = error?.message || 'Database is not ready'

    if (message.includes('does not exist') || message.includes('no such table')) {
      console.error('[db] User table not found — Prisma schema may not be applied:', message)
      // Don't throw — let the endpoint handle the error gracefully.
      // Throwing here causes /api/auth/me to return 500 which cascades
      // to 401 on all NestJS-proxied endpoints.
    } else {
      console.error('[db] Database readiness check failed:', message)
    }

    // Don't throw — return and let the calling code handle DB errors.
    // This prevents a single table issue from blocking the entire auth flow.
  }
}
