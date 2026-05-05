import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

export const dynamic = 'force-dynamic'

// FIX: Shared secret for internal agent-to-server communication.
// The alert-agent must pass this secret to authenticate its push requests.
// Without this, anyone could inject fake notifications into any user's account.
const AGENT_SECRET = process.env.AGENT_SECRET || process.env.ALERT_AGENT_SECRET || ''

/**
 * /api/notifications/push — Receives push notification requests from alert-agent
 *
 * POST { userId, type, title, body, data?, secret }
 *
 * This endpoint is called by the Python alert-agent when a price alert triggers.
 * It stores the notification in the DB so it can be displayed to the user
 * on the next dashboard load or via WebSocket broadcast.
 *
 * SECURITY: Requires a valid agent secret to prevent notification injection attacks.
 */
export async function POST(req: NextRequest) {
  try {
    // FIX (C1): Authenticate the request — only allow internal agents
    const authHeader = req.headers.get('x-agent-secret') || req.headers.get('authorization')
    const body = await req.json()
    const providedSecret = body.secret || authHeader?.replace('Bearer ', '')

    if (!AGENT_SECRET) {
      // If no agent secret is configured, reject all push requests for safety
      console.error('[notifications/push] REJECTED: AGENT_SECRET not configured — push notifications disabled')
      return NextResponse.json(
        { error: 'خدمة الإشعارات غير مُهيأة — لم يتم تعيين AGENT_SECRET' },
        { status: 503 }
      )
    }

    if (providedSecret !== AGENT_SECRET) {
      console.warn('[notifications/push] REJECTED: Invalid agent secret')
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ error: 'قاعدة البيانات غير متاحة' }, { status: 503 })
    }

    const { userId, type, title, body: notificationBody, data } = body

    if (!userId || !title) {
      return NextResponse.json(
        { error: 'userId و title مطلوبان' },
        { status: 400 }
      )
    }

    // Validate userId format (prevent injection)
    if (typeof userId !== 'string' || userId.length > 100) {
      return NextResponse.json({ error: 'userId غير صالح' }, { status: 400 })
    }

    // Store notification in DB for user retrieval
    // Using AuditLog as a temporary notification store (it has userId, action, details)
    await db.auditLog.create({
      data: {
        userId,
        action: `notification:${type || 'push'}`,
        resource: 'notification',
        details: JSON.stringify({
          title: String(title).substring(0, 500),
          body: String(notificationBody || '').substring(0, 2000),
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
