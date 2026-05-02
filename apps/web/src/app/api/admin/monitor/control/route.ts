import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAuth } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * /dashboard/admin/api/monitor/control — Start/stop the monitor agent
 *
 * POST { action: 'start' | 'stop' }
 *
 * If MONITOR_AGENT_URL is set, forwards the command to the agent's
 * /control endpoint. If no agent URL is configured, returns an error.
 */

function getMonitorAgentUrl(): string | null {
  return (
    process.env.MONITOR_AGENT_URL ||
    process.env.MONITOR_URL ||
    process.env.AGENT_HEALTH_URL ||
    null
  )
}

export async function POST(req: NextRequest) {
  const authError = await verifyAdminAuth(req)
  if (authError) return authError

  try {
    const body = await req.json()
    const { action } = body

    if (action !== 'start' && action !== 'stop') {
      return NextResponse.json(
        { error: 'الإجراء غير صالح — يجب أن يكون "start" أو "stop"' },
        { status: 400 }
      )
    }

    const agentUrl = getMonitorAgentUrl()

    if (!agentUrl) {
      return NextResponse.json(
        {
          error: 'وكيل المراقبة غير منشور — لم يتم تعيين MONITOR_AGENT_URL في متغيرات البيئة',
          agentDeployed: false,
        },
        { status: 503 }
      )
    }

    // Forward the command to the agent's control endpoint
    const controlUrl = `${agentUrl.replace(/\/$/, '')}/control`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000) // 15s timeout

    try {
      const res = await fetch(controlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        return NextResponse.json({
          success: true,
          message: action === 'start'
            ? 'تم إرسال أمر تشغيل الوكيل بنجاح'
            : 'تم إرسال أمر إيقاف الوكيل بنجاح',
          agentResponse: data,
          agentDeployed: true,
        })
      }

      // Agent returned non-200
      const errorText = await res.text().catch(() => 'Unknown error')
      return NextResponse.json(
        {
          error: `فشل الأمر — الوكيل أرجع الحالة ${res.status}: ${errorText}`,
          success: false,
          agentDeployed: true,
        },
        { status: 502 }
      )
    } catch (fetchError: any) {
      clearTimeout(timeout)

      // Agent unreachable
      const message = fetchError?.name === 'AbortError'
        ? 'انتهت مهلة الاتصال بالوكيل — تحقق من حالة النشر'
        : 'لم يتم الوصول إلى الوكيل — تحقق من حالة النشر على Railway'

      return NextResponse.json(
        {
          error: message,
          success: false,
          agentDeployed: true,
        },
        { status: 502 }
      )
    }
  } catch (error: any) {
    console.error('[admin/monitor/control] Error:', error?.message || error)
    return NextResponse.json(
      { error: 'حدث خطأ في معالجة الأمر' },
      { status: 500 }
    )
  }
}
