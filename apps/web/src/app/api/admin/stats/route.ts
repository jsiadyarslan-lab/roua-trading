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
 * NOTE: The 'source' field filter is temporarily removed until the
 * Trade.source column is confirmed present in the production database.
 * Currently, all trades are counted. Once source column is available,
 * we can filter out auto_paper trades again.
 */
export async function GET(req: NextRequest) {
  const authError = await verifyAdminAuth(req)
  if (authError) return authError

  const emptyResponse = () => ({
    users: { total: 0, free: 0, pro: 0, plus: 0, premium: 0, institutional: 0 },
    trading: { dailyTrades: 0, volume: 0, winRate: 0, activePositions: 0 },
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
    // ANTI-PHANTOM-USER FIX: Separate real (verified) users from phantom/guest users.
    // Verified = has passkeyId OR has OAuth account linked OR has active session.
    // Phantom = email starts with 'guest-' or 'user-' (chart-pref) or no verification method.
    const [
      totalUsers,
      freeUsers,
      proUsers,
      plusUsers,
      premiumUsers,
      institutionalUsers,
      guestCount,
      verifiedCount,
    ] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { tier: 'FREE' } }),
      db.user.count({ where: { tier: 'PRO' } }),
      db.user.count({ where: { tier: 'PLUS' } }),
      db.user.count({ where: { tier: 'PREMIUM' } }),
      db.user.count({ where: { tier: 'INSTITUTIONAL' } }),
      // Phantom/guest users: email starts with 'guest-' or 'user-'
      db.user.count({
        where: {
          OR: [
            { email: { startsWith: 'guest-' } },
            { email: { startsWith: 'user-' } },
            { email: { equals: 'guest@roua.auto' } },
          ],
        },
      }),
      // Verified users: has passkeyId (completed WebAuthn) OR has OAuth account
      db.user.count({
        where: {
          AND: [
            { email: { not: { startsWith: 'guest-' } } },
            { email: { not: { startsWith: 'user-' } } },
            { email: { not: { equals: 'guest@roua.auto' } } },
            {
              OR: [
                { passkeyId: { not: null } },
                { accounts: { some: {} } },
              ],
            },
          ],
        },
      }),
    ])

    // Fetch trading stats
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [dailyTrades, activePositions] = await Promise.all([
      db.trade.count({
        where: {
          executedAt: { gte: today },
        },
      }),
      db.position.count({
        where: { status: 'OPEN' },
      }),
    ])

    // Calculate win rate from trades with PnL
    const tradesWithPnl = await db.trade.findMany({
      where: {
        pnl: { not: null },
        executedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      select: { pnl: true },
    })

    const winningTrades = tradesWithPnl.filter(t => t.pnl && Number(t.pnl) > 0).length
    const winRate = tradesWithPnl.length > 0
      ? Math.round((winningTrades / tradesWithPnl.length) * 1000) / 10
      : 0

    // Calculate volume: SUM(price * quantity)
    let volume = 0
    try {
      const volumeResult = await db.$queryRaw<Array<{ volume: bigint }>>`
        SELECT COALESCE(SUM(price * quantity), 0) AS volume
        FROM "Trade"
        WHERE "executedAt" >= ${today}
      `
      volume = Number(volumeResult[0]?.volume ?? 0)
    } catch (rawError) {
      console.warn('[admin/stats] Raw query for volume failed, falling back to JS computation:', rawError)
      const todayTrades = await db.trade.findMany({
        where: { executedAt: { gte: today } },
        select: { price: true, quantity: true },
      })
      volume = todayTrades.reduce((sum, t) => sum + Number(t.price) * Number(t.quantity), 0)
    }

    // System health
    const uptimeSeconds = Math.floor(process.uptime())
    const uptimeHours = Math.floor(uptimeSeconds / 3600)
    const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60)
    const uptimeFormatted = `${uptimeHours}h ${uptimeMinutes}m`

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
        verified: verifiedCount,
        guests: guestCount,
        phantom: totalUsers - verifiedCount - guestCount > 0 ? totalUsers - verifiedCount - guestCount : 0,
      },
      trading: {
        dailyTrades,
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
