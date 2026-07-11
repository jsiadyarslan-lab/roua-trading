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

  const enums = [
    { name: 'Tier', values: ['FREE','PRO','PLUS','PREMIUM','INSTITUTIONAL'] },
    { name: 'PositionStatus', values: ['OPEN','CLOSED','LIQUIDATED','DISPUTED','PENDING_CLOSE','CLOSING'] },
    { name: 'OrderSide', values: ['BUY','SELL'] },
    { name: 'OrderType', values: ['MARKET','LIMIT'] },
    { name: 'OrderStatus', values: ['PENDING','ACCEPTED','PARTIALLY_FILLED','FILLED','CANCELLED','REJECTED'] },
    { name: 'TradeType', values: ['ENTRY','EXIT','PARTIAL_EXIT'] },
    { name: 'AgentStrategy', values: ['AUTO','SCALPING','SWING','GRID','MEAN_REVERSION','MOMENTUM_BREAKOUT','DCA','VWAP_RSI'] },
    { name: 'BriefTimeframe', values: ['M1','M5','M15','M30','H1','H4','D1','W1'] },
    { name: 'BriefDirection', values: ['BUY','SELL'] },
    { name: 'BriefReviewStatus', values: ['ACTIVE','MODIFIED','CANCELLED','EXECUTED'] },
    { name: 'MarketRegime', values: ['BULL','BEAR','RANGE','VOLATILE'] },
    { name: 'TradeResult', values: ['WIN','LOSS','BREAKEVEN'] },
    { name: 'SignalAction', values: ['BUY','SELL','WAIT'] },
    { name: 'SignalStatus', values: ['ACTIVE','EXPIRED','EXECUTED','CANCELLED'] },
    { name: 'NotificationType', values: ['SIGNAL_GENERATED','ORDER_FILLED','ORDER_REJECTED','ORDER_ACCEPTED','POSITION_OPENED','POSITION_CLOSED','RISK_WARNING','PRICE_ALERT','AI_INSIGHT','SYSTEM'] },
    { name: 'NotificationPriority', values: ['URGENT','HIGH','MEDIUM','LOW'] },
    { name: 'AlertCondition', values: ['ABOVE','BELOW','CROSSES_UP','CROSSES_DOWN'] },
    { name: 'PredictionEventStatus', values: ['ACTIVE','RESOLVED','EXPIRED','CANCELLED'] },
    { name: 'PredictionDirection', values: ['UP','DOWN','VOLATILE','NEUTRAL'] },
    { name: 'ContentArticleStatus', values: ['DRAFT','IN_REVIEW','APPROVED','PUBLISHED','SCHEDULED','ARCHIVED','REJECTED'] },
    { name: 'OrderEventType', values: ['CREATED','ACCEPTED','RISK_REJECTED','SENT_TO_EXCHANGE','FILLED','CANCELLED'] },
    { name: 'AgentTradeStatus', values: ['PENDING','FILLED','PARTIALLY_FILLED','CANCELLED','FAILED','REJECTED','CLOSED','EXPIRED'] },
    { name: 'AgentExitReason', values: ['TAKE_PROFIT','STOP_LOSS','MANUAL','TRAILING_STOP','STRATEGY_EXIT','TIMEOUT','SIGNAL_REVERSAL'] },
    { name: 'HedgeComplexity', values: ['LOW','MEDIUM','HIGH'] },
    { name: 'TimeHorizon', values: ['IMMEDIATE','SHORT','MEDIUM','LONG'] },
    { name: 'AssetType', values: ['STOCK','FOREX','CRYPTO','COMMODITY','INDEX'] },
  ]

  for (const { name, values } of enums) {
    try {
      const vals = values.map(v => `'${v}'`).join(', ')
      await db.$executeRawUnsafe(`DO $$ BEGIN CREATE TYPE "${name}" AS ENUM (${vals}); EXCEPTION WHEN duplicate_object THEN null; END $$`)
      results.push(`${name}`)
    } catch (err: any) { errors.push(`${name}: ${err?.message?.substring(0, 80)}`) }
  }

  const cols = [
    'ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "highestPrice" DECIMAL(18,8)',
    'ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "lowestPrice" DECIMAL(18,8)',
    'ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "briefId" TEXT',
    'ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT \'user_manual\'',
    'ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "timeframe" TEXT',
    'ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "exchangeSymbol" TEXT',
    'DROP TABLE IF EXISTS "_prisma_migrations"',
  ]
  for (const sql of cols) {
    try { await db.$executeRawUnsafe(sql); results.push(sql.substring(0, 60)) }
    catch (err: any) { errors.push(err?.message?.substring(0, 80)) }
  }

  return NextResponse.json({ success: errors.length === 0, results, errors })
}
