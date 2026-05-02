import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAuth } from '@/lib/admin-auth'
import { dispatchNotification, NotificationEvent } from '@/lib/notification-dispatcher'

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
    const body = await req.json()
    const { type, title, body: messageBody, severity, data } = body

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
 * GET — يعرض الأحداث المفعّلة حالياً
 */
export async function GET(req: NextRequest) {
  // لا يتطلب مصادقة — معلومات عامة
  const validTypes = [
    { key: 'new_user', label: 'مستخدم جديد' },
    { key: 'subscription_upgrade', label: 'ترقية اشتراك' },
    { key: 'system_error', label: 'خطأ في النظام' },
    { key: 'performance_alert', label: 'تنبيه أداء' },
    { key: 'large_trade', label: 'صفقة كبيرة' },
    { key: 'system_update', label: 'تحديث النظام' },
  ]

  return NextResponse.json({ events: validTypes })
}
