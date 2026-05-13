import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// FIX: Always cache PrismaClient on globalThis (including production).
// Previously, caching was skipped in production (NODE_ENV === 'production'),
// which meant every module import created a NEW PrismaClient with its own
// connection pool (5 connections each). This caused pool exhaustion on
// Railway free-tier PostgreSQL (~20 max_connections).
// Also added connection_limit=3 and pool_timeout=10 to match the
// apps/web/src/lib/db.ts configuration.
let dbUrl = process.env.DATABASE_URL
if (dbUrl) {
  try {
    const url = new URL(dbUrl)
    url.searchParams.set('connection_limit', '2')
    url.searchParams.set('pool_timeout', '10')
    url.searchParams.set('connect_timeout', '10')
    dbUrl = url.toString()
  } catch {
    // If URL parsing fails, use original URL as-is
  }
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(dbUrl ? { datasources: { db: { url: dbUrl } } } : {}),
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
  })

// Always cache on globalThis (not just in dev) — prevents pool exhaustion
if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = db
}