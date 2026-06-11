import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/debug/db-test — Diagnostic endpoint for DB connection issues.
 * Tests connection with both pg.Client and PrismaClient.
 */
export async function GET(request: NextRequest) {
  const results: Record<string, any> = {
    timestamp: new Date().toISOString(),
  }

  // 1. Check DATABASE_URL (masked)
  const dbUrl = process.env.DATABASE_URL || ''
  const maskedUrl = dbUrl.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')
  results.databaseUrl = {
    length: dbUrl.length,
    masked: maskedUrl.substring(0, 100),
    prefix: dbUrl.split('://')[0] || 'unknown',
    hasSslmode: dbUrl.includes('sslmode'),
    hasPgbouncer: dbUrl.includes('pgbouncer'),
  }

  // 2. Test with pg.Client (raw connection)
  try {
    const { Client } = await import('pg')
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 10000,
    })
    const start = Date.now()
    await client.connect()
    const connectTime = Date.now() - start

    const mc = await client.query('SHOW max_connections')
    const ac = await client.query('SELECT count(*) as cnt FROM pg_stat_activity WHERE datname = current_database()')
    const dbResult = await client.query('SELECT current_database(), current_user, version()')

    results.pgClient = {
      status: 'ok',
      connectTimeMs: connectTime,
      maxConnections: mc.rows[0]?.max_connections || mc.rows[0]?.Value,
      activeConnections: ac.rows[0]?.cnt,
      database: dbResult.rows[0]?.current_database,
      user: dbResult.rows[0]?.current_user,
      version: dbResult.rows[0]?.version?.substring(0, 50),
    }
    // V205: Query position counts to investigate missing closed positions
    const posTotal = await client.query('SELECT count(*) as cnt FROM "Position"')
    const posOpen = await client.query('SELECT count(*) as cnt FROM "Position" WHERE status = \'OPEN\'')
    const posClosed = await client.query('SELECT count(*) as cnt FROM "Position" WHERE status = \'CLOSED\'')
    const posLiquidated = await client.query('SELECT count(*) as cnt FROM "Position" WHERE status = \'LIQUIDATED\'')
    const posByExchange = await client.query('SELECT exchange, status, count(*) as cnt FROM "Position" GROUP BY exchange, status ORDER BY cnt DESC')
    const posBySource = await client.query('SELECT source, status, count(*) as cnt FROM "Position" GROUP BY source, status ORDER BY cnt DESC')
    const recentClosed = await client.query('SELECT id, symbol, side, exchange, source, "closeReason", "openedAt", "closedAt", "realizedPnl", "credentialId", "userId" FROM "Position" WHERE status IN (\'CLOSED\', \'LIQUIDATED\') ORDER BY "closedAt" DESC NULLS LAST LIMIT 20')
    const tradeCount = await client.query('SELECT count(*) as cnt FROM "Trade"')
    const credCount = await client.query('SELECT count(*) as cnt FROM "ExchangeCredential"')
    // Check RLS policies
    const rlsPolicies = await client.query('SELECT tablename, policyname, permissive, roles, cmd, qual FROM pg_policies WHERE schemaname = \'public\' AND tablename = \'Position\'')
    // Check column existence
    const columns = await client.query('SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = \'Position\' ORDER BY ordinal_position')

    results.positions = {
      total: parseInt(posTotal.rows[0]?.cnt || '0'),
      open: parseInt(posOpen.rows[0]?.cnt || '0'),
      closed: parseInt(posClosed.rows[0]?.cnt || '0'),
      liquidated: parseInt(posLiquidated.rows[0]?.cnt || '0'),
      byExchange: posByExchange.rows,
      bySource: posBySource.rows,
      recentClosed: recentClosed.rows.map((r: any) => ({
        ...r,
        userId: r.userId?.substring(0, 8) + '...',
        credentialId: r.credentialId?.substring(0, 8) + '...',
      })),
      tradeCount: parseInt(tradeCount.rows[0]?.cnt || '0'),
      credentialCount: parseInt(credCount.rows[0]?.cnt || '0'),
    }
    results.rlsPolicies = rlsPolicies.rows
    results.positionColumns = columns.rows.map((c: any) => `${c.column_name} (${c.data_type}, nullable=${c.is_nullable})`)

    await client.end()
  } catch (e: any) {
    results.pgClient = {
      status: 'error',
      error: e.message?.substring(0, 300),
      code: e.code,
    }
  }

  // 3. Test with PrismaClient
  try {
    const { db, ensureDbReady, getDbInitError } = await import('@/lib/db')
    const start = Date.now()
    const ready = await ensureDbReady()
    const connectTime = Date.now() - start

    if (ready) {
      const queryStart = Date.now()
      const result = await db.$queryRaw`SELECT 1 as test`
      const queryTime = Date.now() - queryStart

      results.prisma = {
        status: 'ok',
        connectTimeMs: connectTime,
        queryTimeMs: queryTime,
        queryResult: result,
      }
    } else {
      results.prisma = {
        status: 'error',
        connectTimeMs: connectTime,
        error: getDbInitError() || 'Unknown error',
      }
    }
  } catch (e: any) {
    results.prisma = {
      status: 'error',
      error: e.message?.substring(0, 500),
      code: e.code,
    }
  }

  // 4. Environment info
  results.env = {
    NODE_ENV: process.env.NODE_ENV,
    RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN ? '[SET]' : '[NOT SET]',
    DATABASE_POOLED_URL: process.env.DATABASE_POOLED_URL ? '[SET]' : '[NOT SET]',
    DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL ? '[SET]' : '[NOT SET]',
  }

  return NextResponse.json(results, { status: 200 })
}
