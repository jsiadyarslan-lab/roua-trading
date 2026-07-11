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

  const fixes = [
    { table: 'Position', col: 'status', enum: 'PositionStatus', vals: "'OPEN','CLOSED','LIQUIDATED','DISPUTED','PENDING_CLOSE','CLOSING'" },
    { table: 'User', col: 'tier', enum: 'Tier', vals: "'FREE','PRO','PLUS','PREMIUM','INSTITUTIONAL'" },
    { table: 'Order', col: 'status', enum: 'OrderStatus', vals: "'PENDING','ACCEPTED','PARTIALLY_FILLED','FILLED','CANCELLED','REJECTED'" },
    { table: 'AgentSettings', col: 'strategy', enum: 'AgentStrategy', vals: "'AUTO','SCALPING','SWING','GRID','MEAN_REVERSION','MOMENTUM_BREAKOUT','DCA','VWAP_RSI'" },
  ]

  for (const { table, col, enum: enumName, vals } of fixes) {
    try {
      // 1. Change to TEXT first
      await db.$executeRawUnsafe(`ALTER TABLE "${table}" ALTER COLUMN "${col}" TYPE TEXT`)
      // 2. Drop old enum
      try { await db.$executeRawUnsafe(`DROP TYPE IF EXISTS "${enumName}" CASCADE`) } catch {}
      // 3. Create new enum
      await db.$executeRawUnsafe(`CREATE TYPE "${enumName}" AS ENUM (${vals})`)
      // 4. Change to enum
      await db.$executeRawUnsafe(`ALTER TABLE "${table}" ALTER COLUMN "${col}" TYPE "${enumName}" USING "${col}"::"${enumName}"`)
      results.push(`${table}.${col} → ${enumName}`)
    } catch (err: any) {
      errors.push(`${table}.${col}: ${err?.message?.substring(0, 150)}`)
    }
  }

  return NextResponse.json({ success: errors.length === 0, results, errors })
}
