import { NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ error: 'قاعدة البيانات غير متاحة' }, { status: 503 })
    }

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(todayStart)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const yearStart = new Date(now.getFullYear(), 0, 1)

    // Tier distribution
    const [freeCount, proCount, plusCount, premiumCount, institutionalCount, totalUsers] = await Promise.all([
      db.user.count({ where: { tier: 'FREE' } }),
      db.user.count({ where: { tier: 'PRO' } }),
      db.user.count({ where: { tier: 'PLUS' } }),
      db.user.count({ where: { tier: 'PREMIUM' } }),
      db.user.count({ where: { tier: 'INSTITUTIONAL' } }),
      db.user.count(),
    ])

    // New registrations per period
    const [todayNew, weekNew, monthNew, yearNew] = await Promise.all([
      db.user.count({ where: { createdAt: { gte: todayStart } } }),
      db.user.count({ where: { createdAt: { gte: weekStart } } }),
      db.user.count({ where: { createdAt: { gte: monthStart } } }),
      db.user.count({ where: { createdAt: { gte: yearStart } } }),
    ])

    // Subscription stats
    const [activeSubs, cancelledSubs, totalSubs] = await Promise.all([
      db.subscription.count({ where: { status: 'active' } }),
      db.subscription.count({ where: { status: 'cancelled' } }),
      db.subscription.count(),
    ])

    // Churn rate
    const churnRate = totalSubs > 0 ? Math.round((cancelledSubs / totalSubs) * 1000) / 10 : 0

    // Recent subscription changes
    const recentChanges = await db.subscription.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        tier: true,
        previousTier: true,
        status: true,
        amount: true,
        createdAt: true,
        startDate: true,
      },
    })

    // Daily registration counts for last 30 days
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const recentUsers = await db.user.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true, tier: true },
      orderBy: { createdAt: 'asc' },
    })

    // Group by day
    const dailyRegistrations: Record<string, { total: number; free: number; pro: number; plus: number; premium: number }> = {}
    for (const u of recentUsers) {
      const day = u.createdAt.toISOString().split('T')[0]
      if (!dailyRegistrations[day]) {
        dailyRegistrations[day] = { total: 0, free: 0, pro: 0, plus: 0, premium: 0 }
      }
      dailyRegistrations[day].total++
      const tierKey = u.tier.toLowerCase() as keyof typeof dailyRegistrations[string]
      if (tierKey in dailyRegistrations[day]) {
        dailyRegistrations[day][tierKey]++
      }
    }

    return NextResponse.json({
      tiers: {
        FREE: freeCount,
        PRO: proCount,
        PLUS: plusCount,
        PREMIUM: premiumCount,
        INSTITUTIONAL: institutionalCount,
        total: totalUsers,
      },
      registrations: {
        today: todayNew,
        week: weekNew,
        month: monthNew,
        year: yearNew,
      },
      subscriptions: {
        active: activeSubs,
        cancelled: cancelledSubs,
        total: totalSubs,
        churnRate,
      },
      recentChanges: recentChanges.map(s => ({
        ...s,
        amount: s.amount ? Number(s.amount) : null,
        createdAt: s.createdAt.toISOString(),
        startDate: s.startDate.toISOString(),
      })),
      dailyRegistrations,
    })
  } catch (error: any) {
    console.error('[admin/subscriptions/stats] Error:', error?.message || error)
    return NextResponse.json({
      tiers: { FREE: 0, PRO: 0, PLUS: 0, PREMIUM: 0, INSTITUTIONAL: 0, total: 0 },
      registrations: { today: 0, week: 0, month: 0, year: 0 },
      subscriptions: { active: 0, cancelled: 0, total: 0, churnRate: 0 },
      recentChanges: [],
      dailyRegistrations: {},
    })
  }
}
