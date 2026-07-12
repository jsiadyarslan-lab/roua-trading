import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const adminToken = request.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_PASSWORD
  if (!adminToken || adminToken !== expectedToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const results: string[] = []
  const errors: string[] = []

  try {
    const exists = await db.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'Position') as exists`
    )

    if (exists[0]?.exists) {
      results.push('Position table already exists')
      return NextResponse.json({ success: true, results, errors })
    }

    results.push('Creating Position table...')

    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Position" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "symbol" TEXT NOT NULL,
      "side" TEXT NOT NULL,
      "exchange" TEXT NOT NULL,
      "credentialId" TEXT NOT NULL,
      "quantity" DECIMAL(18,8) NOT NULL DEFAULT 0,
      "entryPrice" DECIMAL(18,8) NOT NULL,
      "currentPrice" DECIMAL(18,8),
      "stopLoss" DECIMAL(18,8),
      "takeProfit" DECIMAL(18,8),
      "status" TEXT NOT NULL DEFAULT 'OPEN',
      "realizedPnl" DECIMAL(18,8) DEFAULT 0,
      "unrealizedPnl" DECIMAL(18,8) DEFAULT 0,
      "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "closedAt" TIMESTAMP(3),
      "closeReason" TEXT,
      "exitPrice" DECIMAL(18,8),
      "timeframe" TEXT,
      "version" INTEGER NOT NULL DEFAULT 0,
      "exchangeSymbol" TEXT,
      "source" TEXT NOT NULL DEFAULT 'user_manual',
      CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
    )`)
    results.push('Position table created')

    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Position_userId_idx" ON "Position"("userId")`)
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Position_userId_status_idx" ON "Position"("userId", "status")`)
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Position_credentialId_idx" ON "Position"("credentialId")`)
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Position_status_idx" ON "Position"("status")`)
    results.push('Indexes created')

    try { await db.$executeRawUnsafe(`ALTER TABLE "Position" ADD CONSTRAINT "Position_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "ExchangeCredential"("id") ON DELETE CASCADE`) } catch {}
    try { await db.$executeRawUnsafe(`ALTER TABLE "Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE`) } catch {}

    return NextResponse.json({ success: true, results, errors })
  } catch (err: any) {
    errors.push(`Fatal: ${err?.message?.substring(0, 300)}`)
    return NextResponse.json({ success: false, results, errors }, { status: 500 })
  }
}
