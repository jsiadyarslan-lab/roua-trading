import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import { verifyAdminAuth } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authError = await verifyAdminAuth(req)
  if (authError) return authError

  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ users: [], total: 0, error: 'قاعدة البيانات غير متاحة' }, { status: 503 })
    }

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') || ''
    const tier = searchParams.get('tier') || ''
    const hideGuests = searchParams.get('hideGuests') === 'true'
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))
    const skip = (page - 1) * limit

    const where: any = {}
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (tier && tier !== 'all') {
      where.tier = tier
    }
    // ANTI-PHANTOM-USER FIX: Filter out guest/phantom users by default
    if (hideGuests) {
      const guestFilter = {
        email: {
          not: { startsWith: 'guest-' },
        },
      }
      const userPrefixFilter = {
        email: {
          not: { startsWith: 'user-' },
        },
      }
      // Combine with existing filters
      if (where.OR) {
        where.AND = [
          { OR: where.OR },
          { email: { not: { startsWith: 'guest-' } } },
          { email: { not: { startsWith: 'user-' } } },
          { email: { not: 'guest@roua.auto' } },
        ]
        delete where.OR
      } else {
        where.AND = [
          { email: { not: { startsWith: 'guest-' } } },
          { email: { not: { startsWith: 'user-' } } },
          { email: { not: 'guest@roua.auto' } },
        ]
      }
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          displayName: true,
          tier: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              trades: true,
              positions: { where: { status: 'OPEN' } },
              orders: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.user.count({ where }),
    ])

    const formattedUsers = users.map(u => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName || u.email.split('@')[0],
      tier: u.tier,
      tradeCount: u._count.trades,
      openPositions: u._count.positions,
      orderCount: u._count.orders,
      createdAt: u.createdAt.toISOString(),
      lastActive: u.updatedAt.toISOString(),
    }))

    return NextResponse.json({
      users: formattedUsers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error: any) {
    console.error('[admin/users] Error:', error?.message || error)
    return NextResponse.json({ users: [], total: 0, error: 'فشل في جلب البيانات' }, { status: 500 })
  }
}
