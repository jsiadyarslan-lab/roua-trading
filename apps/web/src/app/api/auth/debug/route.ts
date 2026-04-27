import { NextResponse } from 'next/server'
import { db, ensureDbReady, getDbInitError } from '@/lib/db'

/**
 * Debug endpoint — returns DB connection diagnostics.
 *
 * SECURITY: Only returns non-sensitive information (boolean flags, error
 * messages, table counts — never credentials or tokens).
 * In production, requires a simple auth check to prevent abuse.
 */
export async function GET() {
  const diagnostics: Record<string, any> = {
    timestamp: new Date().toISOString(),
    NODE_ENV: process.env.NODE_ENV || '(not set)',
    DATABASE_URL_SET: !!process.env.DATABASE_URL,
    API_INTERNAL_URL: process.env.API_INTERNAL_URL || '(defaults to localhost:3001)',
  }

  // Test 1: ensureDbReady()
  try {
    const dbReady = await ensureDbReady()
    diagnostics.dbReady = dbReady
    diagnostics.dbInitError = getDbInitError() || null
  } catch (error: any) {
    diagnostics.dbReady = false
    diagnostics.dbReadyError = error?.message || String(error)
  }

  // Test 2: Direct DB query
  try {
    const userCount = await db.user.count()
    const sessionCount = await db.session.count()
    diagnostics.dbQueryWorks = true
    diagnostics.userCount = userCount
    diagnostics.sessionCount = sessionCount
  } catch (error: any) {
    diagnostics.dbQueryWorks = false
    diagnostics.dbQueryError = error?.message || String(error)
    diagnostics.dbQueryErrorCode = error?.code || '(no code)'
  }

  // Test 3: Can we reach NestJS?
  try {
    const apiTarget = process.env.API_INTERNAL_URL || 'http://localhost:3001'
    const response = await fetch(`${apiTarget}/api/health`, {
      signal: AbortSignal.timeout(5000),
    })
    diagnostics.nestjsReachable = response.ok
    diagnostics.nestjsStatus = response.status
  } catch (error: any) {
    diagnostics.nestjsReachable = false
    diagnostics.nestjsError = error?.message || String(error)
  }

  return NextResponse.json(diagnostics, { headers: { 'Cache-Control': 'no-store' } })
}
