import { PrismaClient } from '@prisma/client'

// ── Ensure DATABASE_URL is always valid for SQLite ──
// Railway may not always run start.sh, or DATABASE_URL may be overridden
// by a PostgreSQL plugin. This guarantees a valid SQLite URL at runtime.
function ensureDatabaseUrl() {
  const currentUrl = process.env.DATABASE_URL
  if (currentUrl && currentUrl.startsWith('file:')) {
    return // Already valid SQLite URL
  }

  // DATABASE_URL is missing or invalid (e.g. PostgreSQL URL from Railway plugin)
  // Override with a valid SQLite path
  const dbPath = process.env.SQLITE_DB_PATH || `${process.cwd()}/roua.db`
  const newUrl = `file:${dbPath}`
  console.warn(
    `[db] DATABASE_URL was "${currentUrl || '(empty)'}", overriding with "${newUrl}"`
  )
  process.env.DATABASE_URL = newUrl
}

ensureDatabaseUrl()

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  dbInitialized: boolean | undefined
}

// In production, also cache the PrismaClient on globalThis to prevent
// hot-reloading from creating multiple connections. This is especially
// important for Next.js dev mode and serverless functions.
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
// (e.g. Railway using a different start command or redeploying without db push)
export async function ensureDbReady() {
  if (globalForPrisma.dbInitialized) return

  try {
    // Try a lightweight query to check if tables exist
    await db.user.findFirst()
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
        throw pushError
      }
    } else {
      throw error
    }
  }
}
