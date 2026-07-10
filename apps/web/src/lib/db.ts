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

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
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
