import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const adminToken = request.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_PASSWORD || 'roua-admin-secret-2026'
  if (!adminToken || adminToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const backup: any = {
    timestamp: new Date().toISOString(),
    tables: {},
  }

  // Use SELECT * to avoid column name issues
  const tablesToExport = [
    'Position',
    'Trade',
    'Account',
    'AgentSettings',
    'Setting',
    'Portfolio',
    'ApiKey',
  ]

  for (const table of tablesToExport) {
    try {
      const data = await db.$queryRawUnsafe(`SELECT * FROM "${table}"`)
      backup.tables[table] = { count: Array.isArray(data) ? data.length : 0, data }
    } catch (err: any) {
      backup.tables[table] = { error: err?.message?.substring(0, 200) }
    }
  }

  return NextResponse.json(backup)
}
