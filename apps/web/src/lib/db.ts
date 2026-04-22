import { PrismaClient } from '@prisma/client'

// ── Ensure DATABASE_URL is correct for PostgreSQL ──
// We are using PostgreSQL on Railway, so we don't override the DATABASE_URL.

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

// ── Auto-initialize database tables on first request ──
// This ensures the SQLite database is ready even if start.sh didn't run
export async function ensureDbReady() {
  if (globalForPrisma.dbInitialized) return

  try {
    // Check multiple tables — if ANY is missing, run prisma db push
    // This catches the case where User table exists but Challenge table doesn't
    await db.user.findFirst()
    await db.challenge.findFirst()  // New table for passkey challenges
    globalForPrisma.dbInitialized = true
  } catch (error: any) {
    if (error.message?.includes('does not exist') || error.message?.includes('no such table')) {
      console.warn('[db] Tables not found, running prisma db push...')
      const { execSync } = await import('child_process')
      try {
        const schemaPath = process.env.PRISMA_SCHEMA_PATH || './prisma/schema.prisma'
        execSync(`npx prisma db push --schema=${schemaPath} --skip-generate --accept-data-loss`, {
          stdio: 'inherit',
          timeout: 30000,
        })
        globalForPrisma.dbInitialized = true
        console.log('[db] Database tables created successfully')
      } catch (pushError) {
        console.error('[db] Failed to create database tables:', pushError)
        // Don't throw — let the request continue, it might work with existing tables
        globalForPrisma.dbInitialized = true
      }
    } else {
      // Unknown error — mark as initialized to avoid retrying on every request
      console.error('[db] Unknown DB error:', error.message)
      globalForPrisma.dbInitialized = true
    }
  }
}
