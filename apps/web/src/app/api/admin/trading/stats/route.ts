import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import { verifyAdminAuth } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * /dashboard/admin/api/trading/stats — Real trading data from the database
 *
 * Returns active positions, recent orders/trades, trading stats, and bot status.
 * Returns empty arrays / zeros if DB is unavailable — NO fake data.
 */
export async function GET(req: NextRequest) {
  const authError = await verifyAdminAuth(req)
  if (authError) return authError

  const emptyResponse = () => ({
    positions: [] as Record<string, unknown>[],
    recentTrades: [] as Record<string, unknown>[],
    stats: {
      totalPnl: 0,
      activePositions: 0,
      pendingOrders: 0,
      dailyTrades: 0,
      winRate: 0,
    },
    bots: [] as Record<string, unknown>[],
  })

  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ ...emptyResponse(), error: 'قاعدة البيانات غير متاحة' })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Active positions
    const positions = await db.position.findMany({
      where: { status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
      take: 50,
    })

    // Recent trades (filled orders) — real trades first, then auto-paper if needed
    const recentTrades = await db.trade.findMany({
      take: 20,
      orderBy: { executedAt: 'desc' },
    })

    // Pending orders count
    const pendingOrders = await db.order.count({
      where: { status: 'PENDING' },
    })

    // Daily trades count — REAL user-initiated trades only (exclude auto-paper phantom trades)
    const dailyTrades = await db.trade.count({
      where: { executedAt: { gte: today }, source: { not: 'auto_paper' } },
    })

    // Auto-paper phantom trades count (separate from real trades)
    const autoPaperTrades = await db.trade.count({
      where: { executedAt: { gte: today }, source: 'auto_paper' },
    })

    // Win rate from REAL trades only (last 30 days)
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

    // Total unrealized PnL from open positions
    const totalPnl = positions.reduce((sum, p) => sum + Number(p.unrealizedPnl || 0), 0)

    // Trading bots
    const bots = await db.tradingBot.findMany({
      take: 20,
      orderBy: { updatedAt: 'desc' },
    })

    // Serialize Decimal fields for JSON
    const serializedPositions = positions.map(p => ({
      ...p,
      quantity: p.quantity?.toString() ?? '0',
      entryPrice: p.entryPrice?.toString() ?? '0',
      currentPrice: p.currentPrice?.toString() ?? null,
      unrealizedPnl: p.unrealizedPnl?.toString() ?? '0',
      realizedPnl: p.realizedPnl?.toString() ?? '0',
      stopLoss: p.stopLoss?.toString() ?? null,
      takeProfit: p.takeProfit?.toString() ?? null,
      highestPrice: p.highestPrice?.toString() ?? null,
      lowestPrice: p.lowestPrice?.toString() ?? null,
    }))

    const serializedTrades = recentTrades.map(t => ({
      ...t,
      quantity: t.quantity?.toString() ?? '0',
      price: t.price?.toString() ?? '0',
      fee: t.fee?.toString() ?? '0',
      pnl: t.pnl?.toString() ?? null,
    }))

    const serializedBots = bots.map(b => ({
      ...b,
      winRate: b.winRate?.toString() ?? '0',
      dailyPnl: b.dailyPnl?.toString() ?? '0',
    }))

    return NextResponse.json({
      positions: serializedPositions,
      recentTrades: serializedTrades,
      stats: {
        totalPnl,
        activePositions: positions.length,
        pendingOrders,
        dailyTrades,
        autoPaperTrades,
        winRate,
      },
      bots: serializedBots,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[admin/trading/stats] Error:', message)
    return NextResponse.json({ ...emptyResponse(), error: 'فشل في جلب بيانات التداول' })
  }
}
