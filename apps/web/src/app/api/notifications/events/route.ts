import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAuth } from '@/lib/admin-auth'
import { dispatchNotification, NotificationEvent } from '@/lib/notification-dispatcher'
import { db, ensureDbReady } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * /api/notifications/events — مشغّل أحداث التنبيهات
 *
 * POST { type, title, body, severity?, data? }
 *
 * يمكن استدعاؤه من:
 * - لوحة الإدارة (زر اختبار)
 * - وكلاء Python (عبر HTTP)
 * - أي جزء من النظام عند حدوث حدث مهم
 */
export async function POST(req: NextRequest) {
  // السماح بالطلبات من لوحة الإدارة أو مع مفتاح API
  const authError = await verifyAdminAuth(req)
  const apiKey = req.headers.get('x-api-key')

  if (authError && apiKey !== process.env.ADMIN_API_KEY && apiKey !== process.env.NOTIFICATIONS_API_KEY) {
    // Also allow internal calls without auth (from same server)
    const internalSecret = req.headers.get('x-internal-secret')
    if (internalSecret !== process.env.INTERNAL_SECRET) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
  }

  try {
    const reqBody = await req.json()
    const { type, title, body: messageBody, severity, data, notificationType, params } = reqBody

    if (!type || !title) {
      return NextResponse.json(
        { error: 'type و title مطلوبان' },
        { status: 400 }
      )
    }

    const validTypes = ['new_user', 'subscription_upgrade', 'system_error', 'performance_alert', 'large_trade', 'system_update']
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `نوع الحدث غير صالح. الأنواع المسموحة: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    const event: NotificationEvent = {
      type,
      title,
      body: messageBody || '',
      severity: severity || 'info',
      data: data || {},
      // i18n translation data — frontend uses these to translate to user's locale
      notificationType: notificationType || undefined,
      params: params || undefined,
    }

    const results = await dispatchNotification(event)

    return NextResponse.json({
      ok: true,
      results,
      message: results.skipped
        ? 'الحدث غير مفعّل — تم التخطي'
        : `تم الإرسال: Telegram=${results.telegram}, Browser=${results.browser}`,
    })
  } catch (error: any) {
    console.error('[notifications/events] Error:', error?.message || error)
    return NextResponse.json(
      { error: 'فشل في إرسال التنبيه' },
      { status: 500 }
    )
  }
}

/**
 * GET — يعرض الإشعارات المخزنة للمستخدم الحالي
 *
 * ?limit=50  — أقصى عدد إشعارات (افتراضي 50)
 * ?since=ts  — فقط الإشعارات بعد هذا التimestamp
 *
 * يقرأ إشعارات المتصفح من جدول auditLog (action يبدأ بـ "notification:")
 */
export async function GET(req: NextRequest) {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      // قاعدة البيانات غير متاحة — أرجع قائمة فارغة
      return NextResponse.json({ success: true, data: [], events: [] })
    }

    const url = new URL(req.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100)
    const since = url.searchParams.get('since')

    // جلب الإشعارات المخزنة من auditLog
    const where: any = {
      resource: 'notification',
      action: { startsWith: 'notification:' },
    }

    if (since) {
      try {
        const sinceDate = new Date(parseInt(since))
        if (!isNaN(sinceDate.getTime())) {
          where.createdAt = { gte: sinceDate }
        }
      } catch {}
    }

    const logs = await db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    const notifications = logs
      .map((log) => {
        try {
          const details = typeof log.details === 'string'
            ? JSON.parse(log.details)
            : log.details
          return {
            id: log.id,
            source: details.source || log.action.replace('notification:', '') || 'system',
            priority: details.severity === 'error' ? 'urgent' : details.severity === 'warning' ? 'high' : 'medium',
            action: details.action || details.type || 'INFO',
            title: details.title || '',
            body: details.body || details.message || '',
            pair: details.data?.pair || details.data?.symbol,
            price: details.data?.price,
            confidence: details.data?.confidence,
            timestamp: new Date(log.createdAt).getTime(),
            read: details.read ?? false,
            // i18n translation data — frontend uses these to translate to user's locale
            notificationType: details.notificationType || undefined,
            params: details.params || undefined,
          }
        } catch {
          return null
        }
      })
      .filter(Boolean)

    // أيضاً أرجع أنواع الأحداث المفعّلة (للأ التوافقية)
    const validTypes = [
      { key: 'new_user', label: 'مستخدم جديد' },
      { key: 'subscription_upgrade', label: 'ترقية اشتراك' },
      { key: 'system_error', label: 'خطأ في النظام' },
      { key: 'performance_alert', label: 'تنبيه أداء' },
      { key: 'large_trade', label: 'صفقة كبيرة' },
      { key: 'system_update', label: 'تحديث النظام' },
    ]

    return NextResponse.json({ success: true, data: notifications, events: validTypes })
  } catch (error: any) {
    console.error('[notifications/events GET] Error:', error?.message || error)
    return NextResponse.json({ success: false, data: [], events: [] })
  }
}
