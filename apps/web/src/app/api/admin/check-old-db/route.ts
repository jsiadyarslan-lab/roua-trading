import { NextRequest, NextResponse } from 'next/server'
import { Client } from 'pg'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const OLD_DB_URL = 'postgresql://postgres:ECwmddGzeOxVuViSsKmjZXKnZTNNqVtm@postgres-clean.railway.internal:5432/railway'

export async function GET(request: NextRequest) {
  const adminToken = request.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_PASSWORD
  if (!adminToken || adminToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let client: Client | null = null
  try {
    client = new Client({ connectionString: OLD_DB_URL, connectionTimeoutMillis: 10000, query_timeout: 60000 })
    await client.connect()

    const tablesResult = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `)

    const counts: any = {}
    for (const row of tablesResult.rows) {
      const tableName = row.table_name
      try {
        const countResult = await client.query(`SELECT count(*)::int as count FROM "${tableName}"`)
        counts[tableName] = countResult.rows[0]?.count || 0
      } catch (err: any) {
        counts[tableName] = `CORRUPTED: ${err.message.substring(0, 80)}`
      }
    }

    await client.end()
    return NextResponse.json({ success: true, counts })
  } catch (err: any) {
    if (client) { try { await client.end() } catch {} }
    return NextResponse.json({ success: false, error: err?.message?.substring(0, 300) }, { status: 500 })
  }
}
