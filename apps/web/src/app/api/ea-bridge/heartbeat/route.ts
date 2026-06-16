import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ea-bridge/heartbeat
 *
 * نبضة حياة من EA — يحدّث lastHeartbeatAt في قاعدة البيانات
 * مباشرة بدون الاعتماد على NestJS
 */
export async function POST(request: NextRequest) {
  try {
    const eaToken = request.headers.get('x-ea-token')
    if (!eaToken || !eaToken.startsWith('ea_')) {
      return NextResponse.json(
        { success: false, error: 'رمز EA مطلوب (X-EA-Token)' },
        { status: 401 },
      )
    }

    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json(
        { success: false, error: 'قاعدة البيانات غير متاحة' },
        { status: 503 },
      )
    }

    const tokenRecord = await db.eAToken.findUnique({
      where: { token: eaToken },
    })

    if (!tokenRecord || !tokenRecord.isActive) {
      return NextResponse.json(
        { success: false, error: 'رمز EA غير صالح أو معطّل' },
        { status: 401 },
      )
    }

    await db.eAToken.update({
      where: { id: tokenRecord.id },
      data: { lastHeartbeatAt: new Date() },
    })

    let body: any = {}
    try {
      body = await request.json()
    } catch { /* empty */ }

    if (body.balance || body.openPositions !== undefined) {
      console.log(`[ea-bridge] Heartbeat from EA: account=${body.mt5AccountNumber}, balance=${body.balance}, positions=${body.openPositions}`)
    }

    return NextResponse.json({
      success: true,
      data: { acknowledged: true },
      serverTime: new Date().toISOString(),
      nextPollMs: 30000,
    })
  } catch (error: any) {
    console.error('[ea-bridge] heartbeat error:', error?.message?.substring(0, 200))
    return NextResponse.json({
      success: false,
      error: 'فشل في معالجة نبضة الحياة',
    }, { status: 500 })
  }
}
