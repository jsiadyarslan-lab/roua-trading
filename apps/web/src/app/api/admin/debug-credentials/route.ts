import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const adminToken = request.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_PASSWORD
  if (!expectedToken) {
    return NextResponse.json(
      { error: 'ADMIN_PASSWORD not configured — server misconfigured' },
      { status: 503 },
    )
  }
  if (!adminToken || adminToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get all exchange credentials (masked)
    const credentials = await db.$queryRawUnsafe(`
      SELECT
        ec.id,
        ec."userId",
        ec.exchange,
        ec.label,
        ec."isValid",
        ec."testnet",
        ec."keyType",
        ec."permissions",
        ec."lastValidatedAt",
        ec."createdAt",
        ec."updatedAt",
        u.email as "userEmail",
        u."displayName" as "userDisplayName"
      FROM "ExchangeCredential" ec
      LEFT JOIN "User" u ON ec."userId" = u.id
      ORDER BY ec."createdAt" DESC
    `)

    // Get users that have credentials
    const usersWithCreds = await db.$queryRawUnsafe(`
      SELECT
        u.id,
        u.email,
        u."displayName",
        u.tier,
        u."createdAt"
      FROM "User" u
      WHERE u.id IN (SELECT DISTINCT "userId" FROM "ExchangeCredential")
      ORDER BY u."createdAt" DESC
    `)

    // Get session info for users with credentials
    const userSessions = await db.$queryRawUnsafe(`
      SELECT
        s."userId",
        COUNT(s.id)::int as session_count,
        MAX(s."createdAt") as last_session,
        bool_or(s."isActive") as has_active,
        MAX(s."expiresAt") as max_expiry
      FROM "Session" s
      WHERE s."userId" IN (SELECT DISTINCT "userId" FROM "ExchangeCredential")
      GROUP BY s."userId"
    `)

    // Check RLS status
    const rlsStatus = await db.$queryRawUnsafe(`
      SELECT 
        relname as table_name,
        relrowsecurity as rls_enabled
      FROM pg_class
      WHERE relname IN ('ExchangeCredential', 'Account', 'User', 'Position', 'Session')
        AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    `)

    // Check active sessions count
    const activeSessions = await db.$queryRawUnsafe(`
      SELECT count(*)::int as count 
      FROM "Session" 
      WHERE "isActive" = true AND "expiresAt" > NOW()
    `)

    // Check total sessions
    const totalSessions = await db.$queryRawUnsafe(`
      SELECT count(*)::int as count FROM "Session"
    `)

    return NextResponse.json({
      success: true,
      credentials: credentials.map((c: any) => ({
        ...c,
        id: c.id?.substring(0, 12) + '...',
        userId: c.userId?.substring(0, 12) + '...',
      })),
      credentialsCount: credentials.length,
      usersWithCredentials: usersWithCreds.map((u: any) => ({
        ...u,
        id: u.id?.substring(0, 12) + '...',
      })),
      userSessions: userSessions.map((s: any) => ({
        ...s,
        userId: s.userId?.substring(0, 12) + '...',
        has_active: s.has_active,
      })),
      rlsStatus: rlsStatus.map((r: any) => ({
        table: r.table_name,
        rls_enabled: r.rls_enabled,
      })),
      activeSessions: activeSessions[0]?.count || 0,
      totalSessions: totalSessions[0]?.count || 0,
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message?.substring(0, 500) },
      { status: 500 },
    )
  }
}
