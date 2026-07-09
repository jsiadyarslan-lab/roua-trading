import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const adminToken = request.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_PASSWORD || 'roua-admin-secret-2026'
  if (!adminToken || adminToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get all exchange credentials (without sensitive data)
    const credentials = await db.$queryRawUnsafe(`
      SELECT
        ec.id,
        ec."userId",
        ec.exchange,
        ec."accountId",
        ec."isTestnet",
        ec.active,
        ec."keyType",
        ec."createdAt",
        ec."lastSyncAt",
        u.email as "userEmail"
      FROM "ExchangeCredential" ec
      LEFT JOIN "User" u ON ec."userId" = u.id
      ORDER BY ec."createdAt" DESC
    `)

    // Get accounts
    const accounts = await db.$queryRawUnsafe(`
      SELECT
        a.id,
        a."userId",
        a.exchange,
        a."accountType",
        a.balance,
        a."equity",
        a."isActive",
        u.email as "userEmail"
      FROM "Account" a
      LEFT JOIN "User" u ON a."userId" = u.id
      ORDER BY a."createdAt" DESC
    `)

    // Get users with their credential counts
    const usersWithCreds = await db.$queryRawUnsafe(`
      SELECT
        u.id,
        u.email,
        u."displayName",
        u.tier,
        u."createdAt",
        COUNT(ec.id) as cred_count
      FROM "User" u
      LEFT JOIN "ExchangeCredential" ec ON u.id = ec."userId"
      WHERE ec.id IS NOT NULL
      GROUP BY u.id, u.email, u."displayName", u.tier, u."createdAt"
      ORDER BY u."createdAt" DESC
      LIMIT 20
    `)

    // Get session info for users with credentials
    const userSessions = await db.$queryRawUnsafe(`
      SELECT
        s."userId",
        COUNT(s.id) as session_count,
        MAX(s."createdAt") as last_session,
        bool_or(s."isActive") as has_active
      FROM "Session" s
      WHERE s."userId" IN (SELECT DISTINCT "userId" FROM "ExchangeCredential")
      GROUP BY s."userId"
    `)

    return NextResponse.json({
      success: true,
      credentials: credentials.map((c: any) => ({
        ...c,
        id: c.id?.substring(0, 12) + '...',
        userId: c.userId?.substring(0, 12) + '...',
      })),
      accounts: accounts.map((a: any) => ({
        ...a,
        id: a.id?.substring(0, 12) + '...',
        userId: a.userId?.substring(0, 12) + '...' || 'null',
      })),
      usersWithCredentials: usersWithCreds.map((u: any) => ({
        ...u,
        id: u.id?.substring(0, 12) + '...',
      })),
      userSessions: userSessions.map((s: any) => ({
        ...s,
        userId: s.userId?.substring(0, 12) + '...',
      })),
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message?.substring(0, 500) },
      { status: 500 },
    )
  }
}
