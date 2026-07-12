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

  // 1. Add autoTradingEnabled
  try { await db.$executeRawUnsafe('ALTER TABLE "AgentSettings" ADD COLUMN IF NOT EXISTS "autoTradingEnabled" BOOLEAN NOT NULL DEFAULT false'); results.push('autoTradingEnabled') }
  catch (err: any) { errors.push(`ate: ${err?.message?.substring(0, 80)}`) }

  // 2. Position.status → PositionStatus enum
  try {
    await db.$executeRawUnsafe(`DO $$ BEGIN CREATE TYPE "PositionStatus" AS ENUM ('OPEN','CLOSED','LIQUIDATED','DISPUTED','PENDING_CLOSE','CLOSING'); EXCEPTION WHEN duplicate_object THEN null; END $$`)
    await db.$executeRawUnsafe(`ALTER TABLE "Position" ALTER COLUMN "status" TYPE "PositionStatus" USING "status"::"PositionStatus"`)
    results.push('Position.status→enum')
  } catch (err: any) { errors.push(`pos.status: ${err?.message?.substring(0, 100)}`) }

  // 3. Position.side → OrderSide
  try {
    await db.$executeRawUnsafe(`DO $$ BEGIN CREATE TYPE "OrderSide" AS ENUM ('BUY','SELL'); EXCEPTION WHEN duplicate_object THEN null; END $$`)
    await db.$executeRawUnsafe(`ALTER TABLE "Position" ALTER COLUMN "side" TYPE "OrderSide" USING "side"::"OrderSide"`)
    results.push('Position.side→enum')
  } catch (err: any) { errors.push(`pos.side: ${err?.message?.substring(0, 100)}`) }

  // 4. User.tier → Tier
  try {
    await db.$executeRawUnsafe(`DO $$ BEGIN CREATE TYPE "Tier" AS ENUM ('FREE','PRO','PLUS','PREMIUM','INSTITUTIONAL'); EXCEPTION WHEN duplicate_object THEN null; END $$`)
    await db.$executeRawUnsafe(`ALTER TABLE "User" ALTER COLUMN "tier" TYPE "Tier" USING "tier"::"Tier"`)
    results.push('User.tier→enum')
  } catch (err: any) { errors.push(`tier: ${err?.message?.substring(0, 100)}`) }

  // 5. Order.side → OrderSide
  try { await db.$executeRawUnsafe(`ALTER TABLE "Order" ALTER COLUMN "side" TYPE "OrderSide" USING "side"::"OrderSide"`); results.push('Order.side→enum') }
  catch (err: any) { errors.push(`ord.side: ${err?.message?.substring(0, 80)}`) }

  // 6. Order.type → OrderType
  try {
    await db.$executeRawUnsafe(`DO $$ BEGIN CREATE TYPE "OrderType" AS ENUM ('MARKET','LIMIT'); EXCEPTION WHEN duplicate_object THEN null; END $$`)
    await db.$executeRawUnsafe(`ALTER TABLE "Order" ALTER COLUMN "type" TYPE "OrderType" USING "type"::"OrderType"`)
    results.push('Order.type→enum')
  } catch (err: any) { errors.push(`ord.type: ${err?.message?.substring(0, 80)}`) }

  // 7. Order.status → OrderStatus
  try {
    await db.$executeRawUnsafe(`DO $$ BEGIN CREATE TYPE "OrderStatus" AS ENUM ('PENDING','ACCEPTED','PARTIALLY_FILLED','FILLED','CANCELLED','REJECTED'); EXCEPTION WHEN duplicate_object THEN null; END $$`)
    await db.$executeRawUnsafe(`ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus" USING "status"::"OrderStatus"`)
    results.push('Order.status→enum')
  } catch (err: any) { errors.push(`ord.status: ${err?.message?.substring(0, 80)}`) }

  // 8. Trade.type → TradeType
  try {
    await db.$executeRawUnsafe(`DO $$ BEGIN CREATE TYPE "TradeType" AS ENUM ('ENTRY','EXIT','PARTIAL_EXIT'); EXCEPTION WHEN duplicate_object THEN null; END $$`)
    await db.$executeRawUnsafe(`ALTER TABLE "Trade" ALTER COLUMN "type" TYPE "TradeType" USING "type"::"TradeType"`)
    results.push('Trade.type→enum')
  } catch (err: any) { errors.push(`trd.type: ${err?.message?.substring(0, 80)}`) }

  // 9. AgentSettings.strategy → AgentStrategy
  try {
    await db.$executeRawUnsafe(`DO $$ BEGIN CREATE TYPE "AgentStrategy" AS ENUM ('AUTO','SCALPING','SWING','GRID','MEAN_REVERSION','MOMENTUM_BREAKOUT','DCA','VWAP_RSI'); EXCEPTION WHEN duplicate_object THEN null; END $$`)
    await db.$executeRawUnsafe(`ALTER TABLE "AgentSettings" ALTER COLUMN "strategy" TYPE "AgentStrategy" USING "strategy"::"AgentStrategy"`)
    results.push('AS.strategy→enum')
  } catch (err: any) { errors.push(`as.strat: ${err?.message?.substring(0, 80)}`) }

  return NextResponse.json({ success: errors.length === 0, results, errors })
}
