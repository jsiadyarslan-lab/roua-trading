import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAuth } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * /dashboard/admin/api/notifications/test-telegram — Server-side Telegram bot test
 *
 * POST { botToken: string, chatId: string }
 *
 * Makes the Telegram API call from the server side so the bot token
 * is never exposed in browser network requests.
 * Returns { ok: boolean, botName?: string, error?: string }
 */
export async function POST(req: NextRequest) {
  const authError = await verifyAdminAuth(req)
  if (authError) return authError

  try {
    const { botToken, chatId } = await req.json()

    if (!botToken || !chatId) {
      return NextResponse.json(
        { ok: false, error: 'Bot Token و Chat ID مطلوبان' },
        { status: 400 }
      )
    }

    // Call Telegram's getMe API from the server
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
        method: 'GET',
        signal: controller.signal,
      })
      clearTimeout(timeout)

      const json = await res.json()

      if (json.ok) {
        const botName = json.result?.username || json.result?.first_name || 'Unknown'
        return NextResponse.json({
          ok: true,
          botName,
        })
      }

      return NextResponse.json({
        ok: false,
        error: json.description || 'فشل الاتصال بالبوت — تحقق من صحة Bot Token',
      })
    } catch (fetchError: any) {
      clearTimeout(timeout)

      if (fetchError?.name === 'AbortError') {
        return NextResponse.json({
          ok: false,
          error: 'انتهت مهلة الاتصال بـ Telegram',
        })
      }

      return NextResponse.json({
        ok: false,
        error: 'فشل الاتصال بخوادم Telegram',
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
