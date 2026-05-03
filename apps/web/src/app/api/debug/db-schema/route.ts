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
  // Security: require a secret in production
  const secret = request.nextUrl.searchParams.get('secret')
  const isDev = process.env.NODE_ENV !== 'production'

  if (!isDev && secret !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    // Get all columns in the Session table
    const sessionColumns = await db.$queryRaw`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Session'
      ORDER BY ordinal_position
    `

    // Get all indexes on the Session table
    const sessionIndexes = await db.$queryRaw`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'Session' AND schemaname = 'public'
      ORDER BY indexname
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
        columns: sessionColumns,
        indexes: sessionIndexes,
        columnNames,
        missingColumns,
        hasAllRequiredColumns: missingColumns.length === 0,
        rowCount: sessionCount,
      },
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        ORIGIN: process.env.ORIGIN || '(not set)',
        RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN || '(not set)',
        DATABASE_URL: process.env.DATABASE_URL ? `${process.env.DATABASE_URL.substring(0, 30)}...` : '(not set)',
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? '***SET***' : '(not set)',
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? '***SET***' : '(not set)',
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
