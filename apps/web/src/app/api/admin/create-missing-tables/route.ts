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
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AgentSettings" (
      "id" TEXT NOT NULL, "userId" TEXT NOT NULL,
      "enabled" BOOLEAN NOT NULL DEFAULT false, "strategy" TEXT NOT NULL DEFAULT 'conservative',
      "riskPerTradePct" DECIMAL(5,2) NOT NULL DEFAULT 1.0, "maxPositionSizePct" DECIMAL(5,2) NOT NULL DEFAULT 15.0,
      "maxOpenPositions" INTEGER NOT NULL DEFAULT 5, "maxDailyTrades" INTEGER NOT NULL DEFAULT 20,
      "maxDailyLossPct" DECIMAL(5,2) NOT NULL DEFAULT 5.0, "maxDrawdownPct" DECIMAL(5,2) NOT NULL DEFAULT 20.0,
      "hardRiskCap" BOOLEAN NOT NULL DEFAULT true, "maxNotionalPercent" DECIMAL(5,2) NOT NULL DEFAULT 15.0,
      "paperBalance" DECIMAL(18,2) NOT NULL DEFAULT 10000,
      "paperCryptoLeverage" INTEGER NOT NULL DEFAULT 1, "paperForexLeverage" INTEGER NOT NULL DEFAULT 50, "paperGoldLeverage" INTEGER NOT NULL DEFAULT 20,
      "lazicEnabled" BOOLEAN NOT NULL DEFAULT false, "lazicObiThreshold" DECIMAL(3,2) NOT NULL DEFAULT 0.4,
      "lazicMaxSpreadMult" DECIMAL(3,2) NOT NULL DEFAULT 1.5, "lazicMaxDailyTrades" INTEGER NOT NULL DEFAULT 20,
      "lazicMaxOpenPositions" INTEGER NOT NULL DEFAULT 2, "lazicCooldownMs" INTEGER NOT NULL DEFAULT 30000,
      "lazicRiskPerTradePct" DECIMAL(5,2) NOT NULL DEFAULT 0.5,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "AgentSettings_pkey" PRIMARY KEY ("id")
    )`)
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AgentSettings_userId_idx" ON "AgentSettings"("userId")`)
    results.push('AgentSettings created')
  } catch (err: any) { errors.push(`AgentSettings: ${err?.message?.substring(0, 100)}`) }

  try {
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AiUsageLog" (
      "id" TEXT NOT NULL, "userId" TEXT, "provider" TEXT NOT NULL, "model" TEXT NOT NULL,
      "tokensUsed" INTEGER NOT NULL DEFAULT 0, "cost" DECIMAL(10,4) NOT NULL DEFAULT 0,
      "latencyMs" INTEGER, "success" BOOLEAN NOT NULL DEFAULT true, "error" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
    )`)
    results.push('AiUsageLog created')
  } catch (err: any) { errors.push(`AiUsageLog: ${err?.message?.substring(0, 100)}`) }

  try {
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Setting" (
      "id" TEXT NOT NULL, "key" TEXT NOT NULL, "value" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
    )`)
    await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Setting_key_key" ON "Setting"("key")`)
    results.push('Setting created')
  } catch (err: any) { errors.push(`Setting: ${err?.message?.substring(0, 100)}`) }

  return NextResponse.json({ success: errors.length === 0, results, errors })
}
