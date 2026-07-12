import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const adminToken = request.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_PASSWORD
  if (!adminToken || adminToken !== expectedToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const results: string[] = []
  const errors: string[] = []

  try {
    // 1. Drop stock_analyses (1.2M duplicates)
    results.push('1. Drop stock_analyses...')
    try {
      await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "stock_analyses" CASCADE`)
      results.push('   Dropped')
    } catch (err: any) { errors.push(`Drop: ${err?.message?.substring(0, 150)}`) }

    // 2. Delete old AuditLog
    results.push('2. Delete old AuditLog (>7 days)...')
    try {
      const d = await db.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE "createdAt" < NOW() - INTERVAL '7 days'`)
      results.push(`   Deleted ${d} rows`)
    } catch (err: any) { errors.push(`AuditLog: ${err?.message?.substring(0, 100)}`) }

    // 3. Delete old TradeLifecycleLog
    results.push('3. Delete old TradeLifecycleLog (>14 days)...')
    try {
      const d = await db.$executeRawUnsafe(`DELETE FROM "TradeLifecycleLog" WHERE "createdAt" < NOW() - INTERVAL '14 days'`)
      results.push(`   Deleted ${d} rows`)
    } catch (err: any) { errors.push(`TLL: ${err?.message?.substring(0, 100)}`) }

    // 4. Delete expired Sessions
    results.push('4. Delete expired Sessions...')
    try {
      const d = await db.$executeRawUnsafe(`DELETE FROM "Session" WHERE "expiresAt" < NOW()`)
      results.push(`   Deleted ${d} rows`)
    } catch (err: any) { errors.push(`Session: ${err?.message?.substring(0, 100)}`) }

    // 5. VACUUM FULL
    results.push('5. VACUUM FULL...')
    try {
      await db.$executeRawUnsafe(`VACUUM FULL`)
      results.push('   Done')
    } catch (err: any) {
      errors.push(`VACUUM FULL: ${err?.message?.substring(0, 100)}`)
    }

    // 6. DB Size
    try {
      const s = await db.$queryRawUnsafe<{ size: string }[]>(`SELECT pg_size_pretty(pg_database_size(current_database())) as size`)
      results.push(`6. DB Size: ${s[0]?.size}`)
    } catch {}

    // 7. Recreate stock_analyses with proper types
    results.push('7. Recreate stock_analyses...')
    try {
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "stock_analyses" (
        "id" TEXT PRIMARY KEY,
        "title" TEXT, "slug" TEXT, "content" TEXT, "summary" TEXT,
        "locale" TEXT DEFAULT 'ar', "assetClass" TEXT, "analysisType" TEXT,
        "isPublished" BOOLEAN DEFAULT true, "publishedAt" TIMESTAMP,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "price" NUMERIC(18,8), "change" NUMERIC(18,8), "changePercent" NUMERIC(18,8),
        "high" NUMERIC(18,8), "low" NUMERIC(18,8), "volume" NUMERIC(18,8),
        "marketCap" NUMERIC(18,8), "peRatio" NUMERIC(18,8), "eps" NUMERIC(18,8),
        "sector" TEXT, "sentiment" TEXT, "riskLevel" TEXT, "overallSignal" TEXT,
        "overallScore" INTEGER, "confidenceScore" INTEGER,
        "technicalScore" INTEGER, "fundamentalScore" INTEGER,
        "priceTarget" NUMERIC(18,8), "stopLoss" NUMERIC(18,8),
        "keyMetrics" JSONB, "indicators" JSONB, "technicalData" JSONB,
        "tradeSetup" JSONB, "sourceUrls" JSONB, "imageUrl" TEXT
      )`)
      results.push('   Created with BOOLEAN isPublished, locale=ar')
    } catch (err: any) { errors.push(`Create: ${err?.message?.substring(0, 100)}`) }

    return NextResponse.json({ success: true, results, errors })
  } catch (err: any) {
    errors.push(`Fatal: ${err?.message?.substring(0, 300)}`)
    return NextResponse.json({ success: false, results, errors }, { status: 500 })
  }
}
