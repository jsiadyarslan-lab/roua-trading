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
    // Step 1: Get column names for ExchangeCredential
    const ecColumns = await db.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'ExchangeCredential'
      ORDER BY ordinal_position
    `)

    // Step 2: Get column names for Account
    const accColumns = await db.$queryRawUnsafe(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'Account'
      ORDER BY ordinal_position
    `)

    // Step 3: Get ExchangeCredential count
    const ecCount = await db.$queryRawUnsafe(`SELECT count(*)::int as count FROM "ExchangeCredential"`)
    
    // Step 4: Get Account count
    const accCount = await db.$queryRawUnsafe(`SELECT count(*)::int as count FROM "Account"`)

    // Step 5: Get all table names in the public schema
    const allTables = await db.$queryRawUnsafe(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `)

    return NextResponse.json({
      success: true,
      ecColumns: ecColumns.map((c: any) => ({ name: c.column_name, type: c.data_type, nullable: c.is_nullable, default: c.column_default })),
      accColumns: accColumns.map((c: any) => ({ name: c.column_name, type: c.data_type })),
      exchangeCredentialCount: ecCount[0]?.count || 0,
      accountCount: accCount[0]?.count || 0,
      allTables: allTables.map((t: any) => t.table_name),
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message?.substring(0, 500) },
      { status: 500 },
    )
  }
}
