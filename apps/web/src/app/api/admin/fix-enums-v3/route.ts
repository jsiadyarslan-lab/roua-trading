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
    { table: 'Position', col: 'status', enum: 'PositionStatus', vals: "'OPEN','CLOSED','LIQUIDATED','DISPUTED','PENDING_CLOSE','CLOSING'", default: "'OPEN'" },
    { table: 'User', col: 'tier', enum: 'Tier', vals: "'FREE','PRO','PLUS','PREMIUM','INSTITUTIONAL'", default: "'FREE'" },
    { table: 'Order', col: 'status', enum: 'OrderStatus', vals: "'PENDING','ACCEPTED','PARTIALLY_FILLED','FILLED','CANCELLED','REJECTED'", default: "'PENDING'" },
    { table: 'AgentSettings', col: 'strategy', enum: 'AgentStrategy', vals: "'AUTO','SCALPING','SWING','GRID','MEAN_REVERSION','MOMENTUM_BREAKOUT','DCA','VWAP_RSI'", default: "'AUTO'" },
  ]

  for (const { table, col, enum: enumName, vals, default: def } of fixes) {
    try {
      await db.$executeRawUnsafe(`ALTER TABLE "${table}" ALTER COLUMN "${col}" DROP DEFAULT`)
      await db.$executeRawUnsafe(`ALTER TABLE "${table}" ALTER COLUMN "${col}" TYPE TEXT`)
      try { await db.$executeRawUnsafe(`DROP TYPE IF EXISTS "${enumName}" CASCADE`) } catch {}
      await db.$executeRawUnsafe(`CREATE TYPE "${enumName}" AS ENUM (${vals})`)
      await db.$executeRawUnsafe(`ALTER TABLE "${table}" ALTER COLUMN "${col}" TYPE "${enumName}" USING "${col}"::"${enumName}"`)
      await db.$executeRawUnsafe(`ALTER TABLE "${table}" ALTER COLUMN "${col}" SET DEFAULT ${def}::"${enumName}"`)
      results.push(`${table}.${col} → ${enumName}`)
    } catch (err: any) {
      errors.push(`${table}.${col}: ${err?.message?.substring(0, 150)}`)
    }
  }

  return NextResponse.json({ success: errors.length === 0, results, errors })
}
