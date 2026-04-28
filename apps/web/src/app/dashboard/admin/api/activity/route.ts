import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ activities: [], error: 'قاعدة البيانات غير متاحة' }, { status: 503 })
    }

    const { searchParams } = new URL(req.url)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '30')))

    const logs = await db.auditLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { email: true, displayName: true },
        },
      },
    })

    const activities = logs.map(log => ({
      id: log.id,
      action: log.action,
      resource: log.resource,
      details: log.details,
      ipAddress: log.ipAddress,
      userEmail: log.user?.email,
      userName: log.user?.displayName,
      createdAt: log.createdAt.toISOString(),
    }))

    return NextResponse.json({ activities })
  } catch (error: any) {
    console.error('[admin/activity] Error:', error?.message || error)
    return NextResponse.json({ activities: [], error: 'فشل في جلب البيانات' }, { status: 500 })
  }
}
