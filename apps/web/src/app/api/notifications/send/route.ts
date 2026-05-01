import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAuth } from '@/lib/admin-auth'
import { db, ensureDbReady } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * /api/notifications/send — إرسال تنبيه تجريبي من لوحة الإدارة
 *
 * POST { channel: 'telegram' | 'browser' | 'all', message?: string }
 *
 * يرسل رسالة تجريبية عبر القناة المحددة للتحقق من عمل التنبيهات
 */
export async function POST(req: NextRequest) {
  const authError = await verifyAdminAuth(req)
  if (authError) return authError

  try {
    const { channel, message } = await req.json()

    if (!channel) {
      return NextResponse.json(
        { error: 'channel مطلوب (telegram, browser, all)' },
        { status: 400 }
      )
    }

    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ error: 'قاعدة البيانات غير متاحة' }, { status: 503 })
    }

    const testMessage = message || '🔔 رسالة تجريبية من لوحة إدارة روعة التجارية'
    const results: Record<string, boolean> = {}

    // ── إرسال عبر Telegram ──
    if (channel === 'telegram' || channel === 'all') {
      const telegramConfig = await db.notificationConfig.findUnique({ where: { type: 'telegram' } })

      if (!telegramConfig || !telegramConfig.enabled) {
        results.telegram = false
      } else {
        const config = JSON.parse(telegramConfig.config || '{}')
        const botToken = config.botToken
        const chatId = config.chatId

        if (!botToken || !chatId) {
          results.telegram = false
        } else {
          try {
            const text = [
              '🔔 <b>رسالة تجريبية</b>',
              '',
              testMessage,
              '',
              `🕐 ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`,
              '',
              '<i>— لوحة إدارة روعة التجارية</i>',
            ].join('\n')

            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 10_000)

            const res = await fetch(
              `https://api.telegram.org/bot${botToken}/sendMessage`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chatId,
                  text,
                  parse_mode: 'HTML',
                  disable_web_page_preview: true,
                }),
                signal: controller.signal,
              }
            )

            clearTimeout(timeout)

            if (res.ok) {
              results.telegram = true
              // تحديث عداد
              await db.notificationConfig.update({
                where: { type: 'telegram' },
                data: {
                  lastTriggeredAt: new Date(),
                  triggerCount: { increment: 1 },
                },
              })
            } else {
              const errData = await res.json().catch(() => ({}))
              console.error('[notifications/send] Telegram error:', errData)
              results.telegram = false
            }
          } catch (err: any) {
            console.error('[notifications/send] Telegram fetch error:', err?.message)
            results.telegram = false
          }
        }
      }
    }

    // ── إرسال عبر المتصفح ──
    if (channel === 'browser' || channel === 'all') {
      const browserConfig = await db.notificationConfig.findUnique({ where: { type: 'browser' } })

      if (!browserConfig || !browserConfig.enabled) {
        results.browser = false
      } else {
        // تسجيل الإشعار ليقرأه العميل
        await db.auditLog.create({
          data: {
            userId: 'system',
            action: 'notification:test_browser',
            details: JSON.stringify({
              title: '🔔 تنبيه تجريبي',
              body: testMessage,
              source: 'admin_test',
              read: false,
              createdAt: new Date().toISOString(),
            }),
          },
        })

        await db.notificationConfig.update({
          where: { type: 'browser' },
          data: {
            lastTriggeredAt: new Date(),
            triggerCount: { increment: 1 },
          },
        })

        results.browser = true
      }
    }

    const anySuccess = Object.values(results).some(v => v)

    return NextResponse.json({
      ok: anySuccess,
      results,
      message: anySuccess
        ? 'تم إرسال التنبيه التجريبي بنجاح'
        : 'فشل إرسال التنبيه — تحقق من الإعدادات',
    })
  } catch (error: any) {
    console.error('[notifications/send] Error:', error?.message || error)
    return NextResponse.json(
      { error: 'فشل في إرسال التنبيه التجريبي' },
      { status: 500 }
    )
  }
}
