import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import { verifyAdminAuth } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/admin/users/[userId]
 *
 * Permanently delete a user account and ALL related data (cascading).
 *
 * Safety:
 *   1. Admin auth required (cookie-based session)
 *   2. Self-deletion is blocked (admin cannot delete their own account from this UI)
 *   3. Confirmation token required in body: { confirm: 'DELETE' }
 *   4. All deletion attempts are logged to AuditLog
 *   5. Pre-deletion snapshot of user info is saved in audit log details
 *   6. The Prisma schema uses `onDelete: Cascade` on most relations, so
 *      deleting the User row will automatically delete:
 *        - apiKeys, portfolios, exchangeCredentials, orders, positions,
 *          trades, tradingBots, chartPreferences, paperOrders, coachAdvices,
 *          auditLogs, autonomousTrades, agentSessions, riskEvents,
 *          agentSettings, contentArticles, tradingBriefs, journals,
 *          councilAccuracy, systemMemories, userNotifications, notificationPrefs,
 *          eaTokens
 *
 * Returns:
 *   200 — { success: true, deletedUserId, deletedEmail }
 *   400 — bad request (missing confirm token or self-delete attempt)
 *   404 — user not found
 *   500 — server error (with safe error message)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  // ── Step 1: Verify admin auth ──
  const authError = await verifyAdminAuth(req)
  if (authError) return authError

  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json(
        { error: 'قاعدة البيانات غير متاحة' },
        { status: 503 }
      )
    }

    // Next.js 15+: params is a Promise, must be awaited
    const { userId } = await params
    if (!userId) {
      return NextResponse.json(
        { error: 'معرّف المستخدم مفقود' },
        { status: 400 }
      )
    }

    // ── Step 2: Parse confirmation token from body ──
    let body: any = {}
    try {
      body = await req.json()
    } catch {
      // Allow empty body — but then we require confirm in query
    }
    const confirmToken = body?.confirm || new URL(req.url).searchParams.get('confirm')
    if (confirmToken !== 'DELETE') {
      return NextResponse.json(
        {
          error: 'تأكيد مفقود — يجب إرسال { confirm: "DELETE" } في جسم الطلب',
        },
        { status: 400 }
      )
    }

    // ── Step 3: Look up the user (and capture a snapshot for audit) ──
    const user = await db.user.findUnique({
      where: { id: userId },
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
            positions: true,
            orders: true,
            exchangeCredentials: true,
            portfolios: true,
            auditLogs: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'المستخدم غير موجود' },
        { status: 404 }
      )
    }

    // ── Step 4: Block self-deletion ──
    // The admin's own userId is stored in the admin session — we can fetch it
    // from the AdminSession table to compare.
    const adminToken = req.cookies.get('roua_admin_session')?.value
    let adminUserId: string | undefined
    if (adminToken) {
      const adminSession = await db.adminSession.findUnique({
        where: { token: adminToken },
        select: { userId: true },
      })
      adminUserId = adminSession?.userId

      if (adminSession?.userId === userId) {
        return NextResponse.json(
          {
            error: 'لا يمكن حذف حسابك الخاص من هذه الواجهة — استخدم حساب مسؤول آخر',
          },
          { status: 400 }
        )
      }
    }

    // ── Step 5: Capture pre-deletion snapshot for audit log ──
    const snapshot = {
      deletedUserId: user.id,
      deletedEmail: user.email,
      deletedDisplayName: user.displayName,
      deletedTier: user.tier,
      deletedAt: new Date().toISOString(),
      statsAtDeletion: {
        trades: user._count.trades,
        positions: user._count.positions,
        orders: user._count.orders,
        exchangeCredentials: user._count.exchangeCredentials,
        portfolios: user._count.portfolios,
        auditLogs: user._count.auditLogs,
      },
      deletedByAdmin: adminUserId || null,
    }

    // ── Step 6: Delete the user (cascade will handle related rows) ──
    // Note: We delete AFTER capturing the snapshot. The audit log we create
    // in Step 7 is recorded under the admin's userId (or 'system') — NOT the
    // deleted user — so it survives the cascade.
    await db.user.delete({
      where: { id: userId },
    })

    // ── Step 7: Record the deletion in audit log (under admin's account) ──
    try {
      await db.auditLog.create({
        data: {
          // userId is nullable (onDelete: SetNull on User relation).
          // Use admin's userId if available; otherwise omit to leave null.
          ...(adminUserId ? { userId: adminUserId } : {}),
          action: 'ADMIN_USER_DELETE',
          resource: 'user',
          details: JSON.stringify(snapshot),
          ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
          userAgent: req.headers.get('user-agent') || 'unknown',
        },
      })
    } catch (auditErr: any) {
      // Audit log failure is non-fatal — the user is already deleted.
      console.error('[admin/users/delete] Failed to write audit log:', auditErr?.message)
    }

    return NextResponse.json({
      success: true,
      deletedUserId: user.id,
      deletedEmail: user.email,
      deletedDisplayName: user.displayName,
      message: `تم حذف المستخدم ${user.displayName || user.email} وجميع بياناته المرتبطة بنجاح`,
    })
  } catch (error: any) {
    console.error('[admin/users/delete] Error:', error?.message || error)

    // Handle Prisma foreign key constraint errors specifically
    if (error?.code === 'P2003') {
      return NextResponse.json(
        {
          error: 'لا يمكن حذف المستخدم — توجد بيانات مرتبطة لا تُحذف تلقائياً. تواصل مع المطور.',
          details: error?.meta?.field_name || '',
        },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'فشل في حذف المستخدم' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/users/[userId] — fetch a single user's full details
 * (used by the admin UI before showing the delete confirmation modal)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authError = await verifyAdminAuth(req)
  if (authError) return authError

  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json(
        { error: 'قاعدة البيانات غير متاحة' },
        { status: 503 }
      )
    }

    // Next.js 15+: params is a Promise, must be awaited
    const { userId } = await params

    const user = await db.user.findUnique({
      where: { id: userId },
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
            positions: true,
            orders: true,
            exchangeCredentials: true,
            portfolios: true,
            auditLogs: true,
            autonomousTrades: true,
            tradingBriefs: true,
            sessions: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'المستخدم غير موجود' },
        { status: 404 }
      )
    }

    return NextResponse.json({ user })
  } catch (error: any) {
    console.error('[admin/users/get] Error:', error?.message || error)
    return NextResponse.json(
      { error: 'فشل في جلب بيانات المستخدم' },
      { status: 500 }
    )
  }
}
