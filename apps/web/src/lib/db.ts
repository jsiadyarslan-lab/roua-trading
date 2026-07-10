// ─── Database Singleton for Assistant ───────────────────────────
// V469: هذا الملف هو طبقة توافق بين مساعد رؤى المالي (rouatradingnews)
// ومنصة roua-trading. الـ assistant يحتاج جداول أخبار/إشارات/تحليلات
// لكن roua-trading يستخدم schema مختلف (Position, TradingBrief, إلخ).
//
// الحل المؤقت: نُرجع PrismaClient واحد (من schema roua-trading)
// والـ data-fetcher يتأقلم مع الجداول المتاحة.
//
// TODO لاحقًا: تكييف data-fetcher ليعمل مع schema roua-trading.

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// BUG-066s FIX: Set connection_limit and pool_timeout via DATABASE_URL
// The web app's PrismaClient needs its own connection limit separate from NestJS.
// Without this, Prisma defaults to connection_limit=1 which causes pool exhaustion.
function getDbUrl(): string {
  const base = process.env.DATABASE_URL || ''
  if (!base) return base
  try {
    const u = new URL(base)
    u.searchParams.set('connection_limit', '5')
    u.searchParams.set('pool_timeout', '60')
    return u.toString()
  } catch {
    const sep = base.includes('?') ? '&' : '?'
    return `${base}${sep}connection_limit=5&pool_timeout=60`
  }
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: getDbUrl(),
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

// BUG-066s FIX (FRONTEND-005): Singleton PrismaClient in ALL environments.
// Previously, production did NOT singleton the client, causing a new
// PrismaClient (with its own connection pool) to be created on every
// module re-evaluation. This caused connection pool exhaustion.
globalForPrisma.prisma = db

// V469: helper functions يتطلبها مساعد رؤى المالي
// BUG-066s FIX (FRONTEND-004): TTL the dbReadyFlag so it re-checks
// periodically instead of caching forever.
let dbReadyFlag = false;
let dbReadyCheckedAt = 0;
const DB_READY_TTL_MS = 30_000; // Re-check every 30s

export async function ensureDbReady(): Promise<boolean> {
  const now = Date.now();
  if (dbReadyFlag && (now - dbReadyCheckedAt) < DB_READY_TTL_MS) return true;
  try {
    await db.$queryRaw`SELECT 1`;
    dbReadyFlag = true;
    dbReadyCheckedAt = now;
    return true;
  } catch {
    dbReadyFlag = false;
    return false;
  }
}

export async function isDbReady(): Promise<boolean> {
  return ensureDbReady();
}

// V469: helpers إضافية يتطلبها مساعد رؤى المالي
let dbInitError: string | null = null;

export function getDbInitError(): string | null {
  return dbInitError;
}

export function resetDbInitialized(): void {
  dbReadyFlag = false;
  dbInitError = null;
}
