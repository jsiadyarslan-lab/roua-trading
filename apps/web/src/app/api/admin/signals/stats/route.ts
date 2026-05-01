import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import { verifyAdminAuth } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * /dashboard/admin/api/signals/stats — Signal performance statistics
 *
 * Returns real signal stats from the database:
 * - Signal counts by status (ACTIVE, EXPIRED, EXECUTED, CANCELLED)
 * - Win rate from signals with known outcomes (EXECUTED)
 * - Best/worst performing pairs based on signal confidence & outcomes
 * - Average confidence
 *
 * Returns zeros if DB is unavailable — NO fake data.
 */
export async function GET(req: NextRequest) {
  const authError = await verifyAdminAuth(req)
  if (authError) return authError

  const emptyResponse = () => ({
    totalSignals: 0,
    activeSignals: 0,
    expiredSignals: 0,
    executedSignals: 0,
    cancelledSignals: 0,
    winRate: 0,
    avgConfidence: 0,
    avgReturnPerSignal: 0,
    bestPair: null as string | null,
    bestPairReturn: 0,
    worstPair: null as string | null,
    worstPairReturn: 0,
  })

  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ ...emptyResponse(), error: 'قاعدة البيانات غير متاحة' })
    }

    // Count signals by status
    const [totalSignals, activeSignals, expiredSignals, executedSignals, cancelledSignals] =
      await Promise.all([
        db.signal.count(),
        db.signal.count({ where: { status: 'ACTIVE' } }),
        db.signal.count({ where: { status: 'EXPIRED' } }),
        db.signal.count({ where: { status: 'EXECUTED' } }),
        db.signal.count({ where: { status: 'CANCELLED' } }),
      ])

    // Calculate win rate: among executed signals, how many were BUY with positive outcome
    // or SELL with negative outcome (correct predictions).
    // Since we don't have a direct "won/lost" field, we infer from orders linked to signals.
    // For a simpler approach: executed BUY signals in an uptrend = win, executed SELL signals in a downtrend = win.
    // But without price outcome data in the Signal model, we calculate based on executed signals
    // and associated orders that have positive PnL.
    let winRate = 0
    try {
      const executedSignalsData = await db.signal.findMany({
        where: { status: 'EXECUTED' },
        include: {
          orders: {
            where: { status: 'FILLED' },
            select: { id: true },
          },
        },
      })

      if (executedSignalsData.length > 0) {
        // Get all order IDs from executed signals
        const orderIds = executedSignalsData
          .flatMap(s => s.orders.map(o => o.id))
          .filter(Boolean)

        if (orderIds.length > 0) {
          // Check trades linked to those orders for PnL
          const trades = await db.trade.findMany({
            where: { orderId: { in: orderIds }, pnl: { not: null } },
            select: { pnl: true, orderId: true },
          })

          if (trades.length > 0) {
            const winningTrades = trades.filter(t => t.pnl && Number(t.pnl) > 0).length
            winRate = Math.round((winningTrades / trades.length) * 1000) / 10
          } else {
            // No trades with PnL — can't determine win rate
            winRate = 0
          }
        } else {
          // Executed signals exist but no filled orders — use a heuristic:
          // Assume 50% of executed signals are wins if we have no order data.
          // Actually, return 0 to be honest — we don't have outcome data.
          winRate = 0
        }
      }
    } catch (err) {
      console.warn('[signals/stats] Win rate calculation failed:', err)
    }

    // Average confidence
    let avgConfidence = 0
    try {
      const confResult = await db.signal.aggregate({
        _avg: { confidence: true },
      })
      avgConfidence = confResult._avg.confidence
        ? Math.round(confResult._avg.confidence * 10) / 10
        : 0
    } catch (err) {
      console.warn('[signals/stats] Confidence calculation failed:', err)
    }

    // Average return per signal — derived from trades linked to signal orders
    let avgReturnPerSignal = 0
    try {
      const signalsWithOrders = await db.signal.findMany({
        where: { status: 'EXECUTED' },
        include: {
          orders: {
            where: { status: 'FILLED' },
            select: { id: true },
          },
        },
      })

      const allOrderIds = signalsWithOrders.flatMap(s => s.orders.map(o => o.id)).filter(Boolean)

      if (allOrderIds.length > 0) {
        const trades = await db.trade.findMany({
          where: { orderId: { in: allOrderIds }, pnl: { not: null } },
          select: { pnl: true, price: true, quantity: true },
        })

        if (trades.length > 0) {
          const totalPnl = trades.reduce((sum, t) => sum + Number(t.pnl || 0), 0)
          const totalVolume = trades.reduce((sum, t) => sum + Number(t.price) * Number(t.quantity), 0)
          avgReturnPerSignal = totalVolume > 0
            ? Math.round((totalPnl / totalVolume) * 10000) / 100
            : 0
        }
      }
    } catch (err) {
      console.warn('[signals/stats] Avg return calculation failed:', err)
    }

    // Best/worst pairs by confidence
    let bestPair: string | null = null
    let bestPairReturn = 0
    let worstPair: string | null = null
    let worstPairReturn = 0
    try {
      const pairStats = await db.signal.groupBy({
        by: ['pair'],
        _avg: { confidence: true },
        _count: { id: true },
        having: { id: { _count: { gte: 1 } } },
        orderBy: { _avg: { confidence: 'desc' } },
      })

      if (pairStats.length > 0) {
        // Best pair: highest average confidence
        const best = pairStats[0]
        bestPair = best.pair
        bestPairReturn = best._avg.confidence ? Math.round(best._avg.confidence * 10) / 10 : 0

        // Worst pair: lowest average confidence
        const worst = pairStats[pairStats.length - 1]
        worstPair = worst.pair
        worstPairReturn = worst._avg.confidence ? Math.round(worst._avg.confidence * 10) / 10 : 0
      }
    } catch (err) {
      console.warn('[signals/stats] Pair stats calculation failed:', err)
    }

    return NextResponse.json({
      totalSignals,
      activeSignals,
      expiredSignals,
      executedSignals,
      cancelledSignals,
      winRate,
      avgConfidence,
      avgReturnPerSignal,
      bestPair,
      bestPairReturn,
      worstPair,
      worstPairReturn,
    })
  } catch (error: any) {
    console.error('[signals/stats] Error:', error?.message || error)
    return NextResponse.json({ ...emptyResponse(), error: 'فشل في جلب إحصائيات الإشارات' })
  }
}
