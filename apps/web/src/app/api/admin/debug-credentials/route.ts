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
    // First, get the column names for ExchangeCredential
    const ecColumns = await db.$queryRawUnsafe(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'ExchangeCredential'
      ORDER BY ordinal_position
    `)

    // Get column names for Account
    const accColumns = await db.$queryRawUnsafe(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'Account'
      ORDER BY ordinal_position
    `)

    // Get all exchange credentials using SELECT *
    const credentialsRaw = await db.$queryRawUnsafe(`
      SELECT * FROM "ExchangeCredential" ORDER BY "createdAt" DESC
    `)

    // Get all accounts using SELECT *
    const accountsRaw = await db.$queryRawUnsafe(`
      SELECT * FROM "Account" ORDER BY "createdAt" DESC
    `)

    // Get users that have credentials
    const usersWithCreds = await db.$queryRawUnsafe(`
      SELECT u.id, u.email, u."displayName", u.tier, u."createdAt"
      FROM "User" u
      WHERE u.id IN (SELECT DISTINCT "userId" FROM "ExchangeCredential")
      ORDER BY u."createdAt" DESC
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

    // Mask sensitive fields in credentials
    const credentials = credentialsRaw.map((c: any) => {
      const masked: any = {}
      for (const [key, value] of Object.entries(c)) {
        if (key.toLowerCase().includes('secret') || key.toLowerCase().includes('password') || key.toLowerCase().includes('apikey') || key.toLowerCase().includes('token')) {
          masked[key] = '[MASKED]'
        } else if (typeof value === 'string' && value.length > 50) {
          masked[key] = value.substring(0, 50) + '...'
        } else {
          masked[key] = value
        }
      }
      return masked
    })

    return NextResponse.json({
      success: true,
      ecColumns: ecColumns.map((c: any) => `${c.column_name} (${c.data_type})`),
      accColumns: accColumns.map((c: any) => `${c.column_name} (${c.data_type})`),
      credentialsCount: credentials.length,
      credentials,
      accountsCount: accountsRaw.length,
      accounts: accountsRaw.map((a: any) => {
        const masked: any = {}
        for (const [key, value] of Object.entries(a)) {
          if (typeof value === 'object' && value !== null) {
            masked[key] = value.toString()
          } else if (typeof value === 'string' && value.length > 50) {
            masked[key] = value.substring(0, 50) + '...'
          } else {
            masked[key] = value
          }
        }
        return masked
      }),
      usersWithCredentials: usersWithCreds.map((u: any) => ({
        ...u,
        id: u.id?.substring(0, 12) + '...',
      })),
      userSessions: userSessions.map((s: any) => ({
        ...s,
        userId: s.userId?.substring(0, 12) + '...',
        has_active: s.has_active,
      })),
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message?.substring(0, 500) },
      { status: 500 },
    )
  }
}
