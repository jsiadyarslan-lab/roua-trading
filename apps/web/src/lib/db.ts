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
    await db.user.findFirst()
    await db.challenge.findFirst()
    globalForPrisma.dbInitialized = true
  } catch (error: any) {
    const message = error?.message || 'Database is not ready'

    if (message.includes('does not exist') || message.includes('no such table')) {
      throw new Error(
        '[db] Prisma schema is not applied. Run migrations or prisma db push during deployment before serving requests.'
      )
    }

    throw error
  }
}
