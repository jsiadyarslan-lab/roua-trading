import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * /api/notifications/push — Receives push notification requests from alert-agent
 *
 * POST { userId, type, title, body, data? }
 *
 * This endpoint is called by the Python alert-agent when a price alert triggers.
 * It stores the notification in the DB so it can be displayed to the user
 * on the next dashboard load or via WebSocket broadcast.
 */
export async function POST(req: NextRequest) {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ error: 'قاعدة البيانات غير متاحة' }, { status: 503 })
    }

    const { userId, type, title, body, data } = await req.json()

    if (!userId || !title) {
      return NextResponse.json(
        { error: 'userId و title مطلوبان' },
        { status: 400 }
      )
    }

    // Store notification in DB for user retrieval
    // Using AuditLog as a temporary notification store (it has userId, action, details)
    await db.auditLog.create({
      data: {
        userId,
        action: `notification:${type || 'push'}`,
        resource: 'notification',
        details: JSON.stringify({
          title,
          body: body || '',
          data: data || {},
          read: false,
          source: type || 'push',
          createdAt: new Date().toISOString(),
        }),
      },
    })

    return NextResponse.json({ ok: true, message: 'تم استلام الإشعار' }, { status: 201 })
  } catch (error: any) {
    console.error('[notifications/push] Error:', error?.message || error)
    return NextResponse.json(
      { error: 'فشل في معالجة الإشعار' },
      { status: 500 }
    )
  }
}
