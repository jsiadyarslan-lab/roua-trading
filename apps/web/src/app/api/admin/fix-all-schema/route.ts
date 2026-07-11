import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: NextRequest) {
  const adminToken = request.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_PASSWORD
  if (!adminToken || adminToken !== expectedToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const results: string[] = []
  const errors: string[] = []

  // User missing columns
  const userCols = [
    'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passkeyCounter" INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT',
    'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "riskTolerance" TEXT',
    'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP',
  ]
  for (const sql of userCols) {
    try { await db.$executeRawUnsafe(sql); results.push('User column added') }
    catch (err: any) { errors.push(`User: ${err?.message?.substring(0, 100)}`) }
  }

  // Position missing columns
  const posCols = [
    'ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP',
    'ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "highestPrice" DECIMAL(18,8)',
    'ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "lowestPrice" DECIMAL(18,8)',
    'ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "briefId" TEXT',
    'ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT \'user_manual\'',
    'ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "timeframe" TEXT',
    'ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "exchangeSymbol" TEXT',
  ]
  for (const sql of posCols) {
    try { await db.$executeRawUnsafe(sql); results.push('Position column added') }
    catch (err: any) { errors.push(`Position: ${err?.message?.substring(0, 100)}`) }
  }

  // ExchangeCredential missing columns
  const ecCols = [
    'ALTER TABLE "ExchangeCredential" ADD COLUMN IF NOT EXISTS "testnet" BOOLEAN',
    'ALTER TABLE "ExchangeCredential" ADD COLUMN IF NOT EXISTS "keyType" TEXT NOT NULL DEFAULT \'hmac\'',
    'ALTER TABLE "ExchangeCredential" ADD COLUMN IF NOT EXISTS "secretAuthTag" TEXT',
    'ALTER TABLE "ExchangeCredential" ADD COLUMN IF NOT EXISTS "secretIv" TEXT',
    'ALTER TABLE "ExchangeCredential" ADD COLUMN IF NOT EXISTS "encryptedPassphrase" TEXT',
    'ALTER TABLE "ExchangeCredential" ADD COLUMN IF NOT EXISTS "passphraseIv" TEXT',
    'ALTER TABLE "ExchangeCredential" ADD COLUMN IF NOT EXISTS "passphraseAuthTag" TEXT',
  ]
  for (const sql of ecCols) {
    try { await db.$executeRawUnsafe(sql); results.push('EC column added') }
    catch (err: any) { errors.push(`EC: ${err?.message?.substring(0, 100)}`) }
  }

  // Trade missing columns
  const tradeCols = [
    'ALTER TABLE "Trade" ADD COLUMN IF NOT EXISTS "credentialId" TEXT',
    'ALTER TABLE "Trade" ADD COLUMN IF NOT EXISTS "source" TEXT',
  ]
  for (const sql of tradeCols) {
    try { await db.$executeRawUnsafe(sql); results.push('Trade column added') }
    catch (err: any) { errors.push(`Trade: ${err?.message?.substring(0, 100)}`) }
  }

  // AgentSettings missing columns
  const asCols = [
    'ALTER TABLE "AgentSettings" ADD COLUMN IF NOT EXISTS "hardRiskCap" BOOLEAN NOT NULL DEFAULT true',
    'ALTER TABLE "AgentSettings" ADD COLUMN IF NOT EXISTS "maxNotionalPercent" DECIMAL(5,2) NOT NULL DEFAULT 15.0',
    'ALTER TABLE "AgentSettings" ADD COLUMN IF NOT EXISTS "paperBalance" DECIMAL(18,2) NOT NULL DEFAULT 10000',
    'ALTER TABLE "AgentSettings" ADD COLUMN IF NOT EXISTS "paperCryptoLeverage" INTEGER NOT NULL DEFAULT 1',
    'ALTER TABLE "AgentSettings" ADD COLUMN IF NOT EXISTS "paperForexLeverage" INTEGER NOT NULL DEFAULT 50',
    'ALTER TABLE "AgentSettings" ADD COLUMN IF NOT EXISTS "paperGoldLeverage" INTEGER NOT NULL DEFAULT 20',
    'ALTER TABLE "AgentSettings" ADD COLUMN IF NOT EXISTS "lazicEnabled" BOOLEAN NOT NULL DEFAULT false',
    'ALTER TABLE "AgentSettings" ADD COLUMN IF NOT EXISTS "lazicObiThreshold" DECIMAL(3,2) NOT NULL DEFAULT 0.4',
    'ALTER TABLE "AgentSettings" ADD COLUMN IF NOT EXISTS "lazicMaxSpreadMult" DECIMAL(3,2) NOT NULL DEFAULT 1.5',
    'ALTER TABLE "AgentSettings" ADD COLUMN IF NOT EXISTS "lazicMaxDailyTrades" INTEGER NOT NULL DEFAULT 20',
    'ALTER TABLE "AgentSettings" ADD COLUMN IF NOT EXISTS "lazicMaxOpenPositions" INTEGER NOT NULL DEFAULT 2',
    'ALTER TABLE "AgentSettings" ADD COLUMN IF NOT EXISTS "lazicCooldownMs" INTEGER NOT NULL DEFAULT 30000',
    'ALTER TABLE "AgentSettings" ADD COLUMN IF NOT EXISTS "lazicRiskPerTradePct" DECIMAL(5,2) NOT NULL DEFAULT 0.5',
  ]
  for (const sql of asCols) {
    try { await db.$executeRawUnsafe(sql); results.push('AgentSettings column added') }
    catch (err: any) { errors.push(`AS: ${err?.message?.substring(0, 100)}`) }
  }

  // Change enum columns to TEXT (avoid type mismatch)
  const typeChanges = [
    'ALTER TABLE "User" ALTER COLUMN "tier" TYPE TEXT',
    'ALTER TABLE "Position" ALTER COLUMN "status" TYPE TEXT',
    'ALTER TABLE "Position" ALTER COLUMN "side" TYPE TEXT',
    'ALTER TABLE "Order" ALTER COLUMN "side" TYPE TEXT',
    'ALTER TABLE "Order" ALTER COLUMN "type" TYPE TEXT',
    'ALTER TABLE "Order" ALTER COLUMN "status" TYPE TEXT',
    'ALTER TABLE "Trade" ALTER COLUMN "type" TYPE TEXT',
    'ALTER TABLE "Trade" ALTER COLUMN "side" TYPE TEXT',
    'ALTER TABLE "AgentSettings" ALTER COLUMN "strategy" TYPE TEXT',
  ]
  for (const sql of typeChanges) {
    try { await db.$executeRawUnsafe(sql); results.push('Type changed to TEXT') }
    catch (err: any) { errors.push(`Type: ${err?.message?.substring(0, 100)}`) }
  }

  return NextResponse.json({ success: errors.length === 0, results, errors })
}
