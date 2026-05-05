import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady, getDbInitError } from '@/lib/db'

/**
 * GET /api/debug/db-schema — Diagnostic endpoint for DB schema verification.
 *
 * Returns the list of columns in the Session table and the DB initialization status.
 * This helps diagnose why session creation fails (missing columns).
 *
 * ⚠️ Only available in development or with a secret key in production.
 */
export async function GET(request: NextRequest) {
  // FIX (C2): Security — disable this endpoint entirely in production.
  // Previously used ADMIN_PASSWORD as query param which leaked through access logs/referrers.
  // Now only available in development mode. For production debugging, use the admin dashboard.
  const isDev = process.env.NODE_ENV !== 'production'

  if (!isDev) {
    return NextResponse.json({ error: 'هذه النقطة متاحة فقط في وضع التطوير' }, { status: 403 })
  }

  const dbReady = await ensureDbReady()
  const dbError = getDbInitError()

  if (!dbReady) {
    return NextResponse.json({
      dbReady: false,
      dbError,
      message: 'Database is not ready — cannot check schema',
    })
  }

  try {
    // Get column names for the Session table
    const sessionColumns = await db.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Session'
      ORDER BY ordinal_position
    `

    // Check for required columns
    const columnNames = (sessionColumns as any[]).map((r: any) => r.column_name)
    const requiredSessionColumns = ['id', 'userId', 'token', 'refreshToken', 'deviceInfo', 'ipAddress', 'userAgent', 'isActive', 'expiresAt', 'createdAt', 'updatedAt']
    const missingColumns = requiredSessionColumns.filter(c => !columnNames.includes(c))

    // Get session count
    const sessionCount = await db.session.count()

    return NextResponse.json({
      dbReady: true,
      sessionTable: {
        columnNames,
        missingColumns,
        hasAllRequiredColumns: missingColumns.length === 0,
        rowCount: sessionCount,
        // SECURITY: Full column/index details are omitted to avoid exposing
        // schema internals over the network. Only column names and missing
        // columns are returned for diagnostic purposes.
      },
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        ORIGIN: process.env.ORIGIN ? '***SET***' : '(not set)',
        RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN || '(not set)',
        DATABASE_URL: process.env.DATABASE_URL ? '***SET***' : '(not set)',
      },
    })
  } catch (error: any) {
    return NextResponse.json({
      dbReady: true,
      error: error?.message || String(error),
      code: error?.code,
    }, { status: 500 })
  }
}
