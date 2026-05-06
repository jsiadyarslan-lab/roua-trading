import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { verifyAdminAuth } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * /dashboard/admin/api/stats — Admin dashboard statistics
 *
 * Returns aggregated platform stats from the database.
 * Returns zeros if DB is unavailable — NO fake data.
 *
 * CRITICAL FIX: Now separates real user trades from auto-paper trades.
 * Previously, all trades (including auto-executed paper trades by the SmartExecutor
 * on behalf of a system-auto-trader user) were counted together, inflating stats.
 * Now: dailyTrades only counts real user-initiated trades, and autoPaperTrades
 * shows the count of automatically generated paper trades separately.
 */
export async function GET(req: NextRequest) {
  const authError = await verifyAdminAuth(req)
  if (authError) return authError

  const emptyResponse = () => ({
    users: { total: 0, free: 0, pro: 0, plus: 0, premium: 0, institutional: 0 },
    trading: {
      dailyTrades: 0,
      autoPaperTrades: 0,
      volume: 0,
      winRate: 0,
      activePositions: 0,
    },
    system: {
      uptime: '0h 0m',
      uptimeSeconds: 0,
      dbStatus: 'disconnected' as const,
      lastCheck: new Date().toISOString(),
    },
  })

  try {
    const dbReady = await ensureDbReady()

    if (!dbReady) {
      return NextResponse.json({ ...emptyResponse(), error: 'قاعدة البيانات غير متاحة' }, { status: 503 })
    }

    // Fetch user stats from DB
    const [totalUsers, freeUsers, proUsers, plusUsers, premiumUsers, institutionalUsers] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { tier: 'FREE' } }),
      db.user.count({ where: { tier: 'PRO' } }),
      db.user.count({ where: { tier: 'PLUS' } }),
      db.user.count({ where: { tier: 'PREMIUM' } }),
      db.user.count({ where: { tier: 'INSTITUTIONAL' } }),
    ])

    // Fetch trading stats — SEPARATE real trades from auto-paper trades
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Real user-initiated trades only (exclude auto-generated paper trades)
    const [dailyTrades, autoPaperTrades, activePositions] = await Promise.all([
      db.trade.count({
        where: {
          executedAt: { gte: today },
          source: { not: 'auto_paper' },
        },
      }),
      db.trade.count({
        where: {
          executedAt: { gte: today },
          source: 'auto_paper',
        },
      }),
      db.position.count({
        where: { status: 'OPEN' },
      }),
    ])

    // Calculate win rate from REAL trades only (not auto-paper trades)
    const tradesWithPnl = await db.trade.findMany({
      where: {
        pnl: { not: null },
        executedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        source: { not: 'auto_paper' },
      },
      select: { pnl: true },
    })

    const winningTrades = tradesWithPnl.filter(t => t.pnl && Number(t.pnl) > 0).length
    const winRate = tradesWithPnl.length > 0
      ? Math.round((winningTrades / tradesWithPnl.length) * 1000) / 10
      : 0

    // Calculate volume from REAL trades only
    let volume = 0
    try {
      const volumeResult = await db.$queryRaw<Array<{ volume: bigint }>>`
        SELECT COALESCE(SUM(price * quantity), 0) AS volume
        FROM "Trade"
        WHERE "executedAt" >= ${today}
        AND ("source" IS NULL OR "source" != 'auto_paper')
      `
      volume = Number(volumeResult[0]?.volume ?? 0)
    } catch (rawError) {
      // Fallback: fetch trades and compute in JS if raw query fails
      console.warn('[admin/stats] Raw query for volume failed, falling back to JS computation:', rawError)
      const todayTrades = await db.trade.findMany({
        where: {
          executedAt: { gte: today },
          source: { not: 'auto_paper' },
        },
        select: { price: true, quantity: true },
      })
      volume = todayTrades.reduce((sum, t) => sum + Number(t.price) * Number(t.quantity), 0)
    }

    // System health — real uptime from process.uptime()
    const uptimeSeconds = Math.floor(process.uptime())
    const uptimeHours = Math.floor(uptimeSeconds / 3600)
    const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60)
    const uptimeFormatted = `${uptimeHours}h ${uptimeMinutes}m`

    // Real DB connectivity check with latency measurement
    let dbStatus: 'connected' | 'degraded' | 'disconnected' = 'connected'
    try {
      const dbCheckStart = Date.now()
      await db.$queryRaw`SELECT 1`
      const dbLatency = Date.now() - dbCheckStart
      if (dbLatency > 2000) {
        dbStatus = 'degraded'
      }
    } catch {
      dbStatus = 'disconnected'
    }

    return NextResponse.json({
      users: {
        total: totalUsers,
        free: freeUsers,
        pro: proUsers,
        plus: plusUsers,
        premium: premiumUsers,
        institutional: institutionalUsers,
      },
      trading: {
        dailyTrades,
        autoPaperTrades,
        volume,
        winRate,
        activePositions,
      },
      system: {
        uptime: uptimeFormatted,
        uptimeSeconds,
        dbStatus,
        lastCheck: new Date().toISOString(),
      },
    })
  } catch (error: any) {
    console.error('[admin/stats] Error:', error?.message || error)
    return NextResponse.json({ ...emptyResponse(), error: 'فشل في جلب البيانات' }, { status: 500 })
  }
}
