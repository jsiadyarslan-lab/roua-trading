import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAuth } from '@/lib/admin-auth'
import { db, ensureDbReady } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * /api/admin/notifications/test-telegram — اختبار كامل لإرسال Telegram
 *
 * POST { botToken?, chatId? }
 *
 * إذا لم يُرسل botToken/chatId، يقرأ الإعدادات من قاعدة البيانات.
 * يُرسل رسالة تجريبية فعلية (وليس فقط getMe) للتحقق من وصول الرسائل.
 */
export async function POST(req: NextRequest) {
  const authError = await verifyAdminAuth(req)
  if (authError) return authError

  try {
    const body = await req.json()
    let { botToken, chatId } = body

    // إذا لم تُرسل القيم، اقرأ من قاعدة البيانات
    if (!botToken || !chatId) {
      const dbReady = await ensureDbReady()
      if (dbReady) {
        const config = await db.notificationConfig.findUnique({ where: { type: 'telegram' } })
        if (config) {
          const parsed = JSON.parse(config.config || '{}')
          if (!botToken) botToken = parsed.botToken
          if (!chatId) chatId = parsed.chatId
        }
      }
    }

    if (!botToken || !chatId) {
      return NextResponse.json(
        { ok: false, error: 'Bot Token و Chat ID مطلوبان — أدخلهما أو احفظ الإعدادات أولاً' },
        { status: 400 }
      )
    }

    // ── الخطوة 1: التحقق من صحة البوت ──
    const controller1 = new AbortController()
    const timeout1 = setTimeout(() => controller1.abort(), 10_000)

    let botName = ''
    try {
      const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
        method: 'GET',
        signal: controller1.signal,
      })
      clearTimeout(timeout1)

      const meData = await meRes.json()
      if (!meData.ok) {
        return NextResponse.json({
          ok: false,
          error: meData.description || 'Bot Token غير صالح — تحقق من صحته',
          step: 'getMe',
        })
      }
      botName = meData.result?.username || meData.result?.first_name || 'Unknown'
    } catch (fetchError: any) {
      clearTimeout(timeout1)
      if (fetchError?.name === 'AbortError') {
        return NextResponse.json({
          ok: false,
          error: 'انتهت مهلة الاتصال بـ Telegram',
          step: 'getMe',
        })
      }
      return NextResponse.json({
        ok: false,
        error: 'فشل الاتصال بخوادم Telegram — تحقق من اتصال الإنترنت',
        step: 'getMe',
      })
    }

    // ── الخطوة 2: إرسال رسالة تجريبية فعلية ──
    const testMessage = [
      '🔔 <b>رسالة تجريبية من لوحة الإدارة</b>',
      '',
      'إذا وصلتك هذه الرسالة، فإعدادات Telegram تعمل بشكل صحيح!',
      '',
      `🤖 البوت: @${botName}`,
      `🕐 ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`,
      '',
      '<i>— منصة روعة التجارية</i>',
    ].join('\n')

    const controller2 = new AbortController()
    const timeout2 = setTimeout(() => controller2.abort(), 10_000)

    try {
      const sendRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: testMessage,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
        signal: controller2.signal,
      })
      clearTimeout(timeout2)

      const sendData = await sendRes.json()

      if (!sendData.ok) {
        const errorMsg = sendData.description || 'فشل إرسال الرسالة'
        let hint = ''
        if (errorMsg.includes('chat not found') || errorMsg.includes('Chat not found')) {
          hint = ' — تأكد أن البوت بدأ محادثة مع المستخدم أولاً (أرسل /start للبوت)'
        } else if (errorMsg.includes('bot was blocked')) {
          hint = ' — المستخدم حظر البوت'
        } else if (errorMsg.includes('Forbidden')) {
          hint = ' — البوت ليس عضواً في المحادثة المحددة'
        }

        return NextResponse.json({
          ok: false,
          botName,
          error: `البوت صالح لكن فشل الإرسال: ${errorMsg}${hint}`,
          step: 'sendMessage',
        })
      }

      // نجاح — تحديث عداد التنبيهات
      const dbReady = await ensureDbReady()
      if (dbReady) {
        await db.notificationConfig.update({
          where: { type: 'telegram' },
          data: {
            lastTriggeredAt: new Date(),
            triggerCount: { increment: 1 },
          },
        }).catch(() => {}) // Non-critical
      }

      return NextResponse.json({
        ok: true,
        botName,
        message: 'تم إرسال رسالة تجريبية بنجاح — تحقق من Telegram',
      })
    } catch (fetchError: any) {
      clearTimeout(timeout2)
      if (fetchError?.name === 'AbortError') {
        return NextResponse.json({
          ok: false,
          botName,
          error: 'انتهت مهلة إرسال الرسالة عبر Telegram',
          step: 'sendMessage',
        })
      }
      return NextResponse.json({
        ok: false,
        botName,
        error: 'فشل الاتصال بـ Telegram أثناء إرسال الرسالة',
        step: 'sendMessage',
      })
    }
  } catch (error: any) {
    console.error('[admin/notifications/test-telegram] Error:', error?.message || error)
    return NextResponse.json(
      { ok: false, error: 'حدث خطأ في اختبار الاتصال' },
      { status: 500 }
    )
  }
}
