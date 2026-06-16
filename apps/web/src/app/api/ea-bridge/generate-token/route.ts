import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ea-bridge/generate-token
 *
 * إنشاء رمز EA جديد — يعمل مباشرة مع قاعدة البيانات
 * بدون الاعتماد على NestJS
 */
export async function POST(request: NextRequest) {
  try {
    // 1. التأكد من وجود جلسة صالحة
    const sessionToken =
      request.cookies.get('roua_session')?.value ||
      request.headers.get('authorization')?.replace('Bearer ', '') ||
      request.headers.get('x-roua-session') ||
      ''

    if (!sessionToken) {
      return NextResponse.json(
        { success: false, error: 'يجب تسجيل الدخول أولاً' },
        { status: 401 },
      )
    }

    // 2. التحقق من الجلسة وربطها بمستخدم
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json(
        { success: false, error: 'قاعدة البيانات غير متاحة حالياً' },
        { status: 503 },
      )
    }

    const session = await db.session.findUnique({
      where: { token: sessionToken },
    })

    if (!session || session.isActive === false || session.expiresAt < new Date()) {
      return NextResponse.json(
        { success: false, error: 'الجلسة منتهية — يرجى تسجيل الدخول مرة أخرى' },
        { status: 401 },
      )
    }

    const userId = session.userId

    // 3. قراءة بيانات الطلب
    let body: any = {}
    try {
      body = await request.json()
    } catch { /* empty body */ }

    const label = body.label || 'MT5 EA'
    const mt5AccountNumber = body.mt5AccountNumber || null
    const mt5Server = body.mt5Server || null

    // 4. إنشاء التوكن
    const randomPart = crypto.randomBytes(24).toString('hex')
    const token = `ea_live_${randomPart}`

    // 5. التأكد من وجود جدول EAToken
    try {
      const tableCheck: any[] = await db.$queryRawUnsafe(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'EAToken'
        ) as exists_flag
      `)
      const tableExists = tableCheck?.[0]?.exists_flag === true || tableCheck?.[0]?.exists_flag === 't'

      if (!tableExists) {
        await db.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "EAToken" (
            "id" TEXT NOT NULL,
            "userId" TEXT NOT NULL,
            "token" TEXT NOT NULL,
            "label" TEXT NOT NULL DEFAULT 'MT5 EA',
            "mt5AccountNumber" TEXT,
            "mt5Server" TEXT,
            "isActive" BOOLEAN NOT NULL DEFAULT true,
            "lastHeartbeatAt" TIMESTAMP(3),
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "expiresAt" TIMESTAMP(3),
            CONSTRAINT "EAToken_pkey" PRIMARY KEY ("id")
          )
        `)
        await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EAToken_token_idx" ON "EAToken"("token")`)
        await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EAToken_userId_idx" ON "EAToken"("userId")`)
        await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EAToken_userId_isActive_idx" ON "EAToken"("userId", "isActive")`)
        console.log('[ea-bridge] Auto-created EAToken table')
      }
    } catch (err: any) {
      console.warn('[ea-bridge] Table check/create failed:', err?.message?.substring(0, 200))
    }

    // 6. حفظ التوكن في قاعدة البيانات
    const eaToken = await db.eAToken.create({
      data: {
        userId,
        token,
        label,
        mt5AccountNumber,
        mt5Server,
        isActive: true,
      },
    })

    console.log(`[ea-bridge] Token generated for user ${userId.substring(0, 8)}... — label: "${label}"`)

    return NextResponse.json({
      success: true,
      data: {
        id: eaToken.id,
        token: eaToken.token,
        label: eaToken.label,
        mt5AccountNumber: eaToken.mt5AccountNumber,
        mt5Server: eaToken.mt5Server,
        isActive: eaToken.isActive,
        createdAt: eaToken.createdAt.toISOString(),
      },
      serverTime: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('[ea-bridge] generate-token error:', error?.message?.substring(0, 300))

    if (error?.message?.includes('eAToken') || error?.message?.includes('EAToken')) {
      return NextResponse.json({
        success: false,
        error: 'جدول EAToken غير متاح — يرجى الانتظار حتى يكتمل تحديث قاعدة البيانات',
      }, { status: 503 })
    }

    return NextResponse.json({
      success: false,
      error: 'فشل في إنشاء التوكن — يرجى المحاولة مرة أخرى',
    }, { status: 500 })
  }
}
