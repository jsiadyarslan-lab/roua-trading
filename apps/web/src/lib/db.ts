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

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}

// V469: helper functions يتطلبها مساعد رؤى المالي
let dbReadyFlag = false;
export async function ensureDbReady(): Promise<boolean> {
  if (dbReadyFlag) return true;
  try {
    await db.$queryRaw`SELECT 1`;
    dbReadyFlag = true;
    return true;
  } catch {
    return false;
  }
}

export async function isDbReady(): Promise<boolean> {
  return ensureDbReady();
}
