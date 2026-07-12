import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { gunzipSync } from 'zlib'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BACKUP_URL = 'https://raw.githubusercontent.com/jsiadyarslan-lab/roua-db-backup/main/comprehensive-backup.json.gz'

const NEWS_TABLES = [
  'accounts', 'agency_events', 'api_keys', 'chat_messages', 'chat_sessions',
  'company_profiles', 'council_briefs', 'economic_events', 'economic_reports',
  'geopolitical_risks', 'infographics', 'market_analyses', 'market_indicators',
  'news_item_archives', 'newsletter_subscribers', 'notifications',
  'personalized_recommendations', 'pipeline_runs', 'portfolio_holdings',
  'portfolio_trades', 'price_alerts', 'report_subscriptions', 'report_views',
  'reports', 'sessions', 'site_settings', 'smart_alerts', 'stock_analyses',
  'subscriptions', 'telegram_accounts', 'trading_signals', 'user_profiles',
  'users', 'verification_tokens', 'video_reports',
]

function inferColumnType(value: any): string {
  if (value === null || value === undefined) return 'TEXT'
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return 'INTEGER'
    return 'NUMERIC(18,8)'
  }
  if (typeof value === 'boolean') return 'BOOLEAN'
  if (typeof value === 'object') return 'JSONB'
  if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
    return 'TIMESTAMP'
  }
  return 'TEXT'
}

export async function POST(request: NextRequest) {
  const adminToken = request.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_PASSWORD
  if (!expectedToken) {
    return NextResponse.json({ error: 'ADMIN_PASSWORD not configured' }, { status: 503 })
  }
  if (!adminToken || adminToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: any = { steps: [], created: 0, imported: 0, errors: [] }

  try {
    results.steps.push('Downloading backup...')
    const response = await fetch(BACKUP_URL)
    if (!response.ok) throw new Error(`Download failed: ${response.status}`)
    const gzBuffer = Buffer.from(await response.arrayBuffer())
    const jsonBuffer = gunzipSync(gzBuffer)
    const backup = JSON.parse(jsonBuffer.toString('utf-8'))

    try { await db.$executeRawUnsafe("SET session_replication_role = 'replica'") } catch {}

    for (const tableName of NEWS_TABLES) {
      const existsResult = await db.$queryRawUnsafe<{ exists: boolean }[]>(
        `SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = $1) as exists`,
        tableName
      )
      if (existsResult[0]?.exists) {
        // Table exists — just import
      } else {
        const tableData = backup.tables?.[tableName]
        if (!tableData?.data || !Array.isArray(tableData.data) || tableData.data.length === 0) {
          continue
        }
        const sampleRow = tableData.data[0]
        const columns = Object.keys(sampleRow)
        const columnDefs = columns.map(col => `"${col}" ${inferColumnType(sampleRow[col])}`)
        let primaryKey = ''
        if (columns.includes('id')) primaryKey = ', PRIMARY KEY ("id")'
        try {
          await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "${tableName}" (${columnDefs.join(', ')}${primaryKey})`)
          results.created++
          results.steps.push(`  ${tableName}: created`)
        } catch (err: any) {
          results.errors.push(`${tableName} create: ${err?.message?.substring(0, 150)}`)
          continue
        }
      }

      // Import data
      const tableData = backup.tables?.[tableName]
      if (!tableData?.data || !Array.isArray(tableData.data) || tableData.data.length === 0) continue

      const rows = tableData.data
      let imported = 0, failed = 0

      for (const row of rows) {
        try {
          const columns = Object.keys(row)
          const values: any[] = []
          const placeholders: string[] = []
          columns.forEach((col, idx) => {
            let val = row[col]
            if (val !== null && typeof val === 'object') val = JSON.stringify(val)
            values.push(val)
            placeholders.push(`$${idx + 1}`)
          })
          const colList = columns.map(c => `"${c}"`).join(', ')
          await db.$executeRawUnsafe(`INSERT INTO "${tableName}" (${colList}) VALUES (${placeholders.join(', ')}) ON CONFLICT DO NOTHING`, ...values)
          imported++
        } catch { failed++ }
      }
      results.imported += imported
      if (imported > 0) results.steps.push(`  ${tableName}: imported ${imported} rows${failed > 0 ? `, skipped ${failed}` : ''}`)
    }

    try { await db.$executeRawUnsafe("SET session_replication_role = 'origin'") } catch {}

    results.steps.push('--- Final counts ---')
    const counts: any = {}
    for (const table of NEWS_TABLES) {
      try {
        const result = await db.$queryRawUnsafe<{ count: number }[]>(`SELECT count(*)::int as count FROM "${table}"`)
        counts[table] = result[0]?.count || 0
        if (counts[table] > 0) results.steps.push(`  ${table}: ${counts[table]}`)
      } catch { counts[table] = -1 }
    }
    results.counts = counts
    return NextResponse.json({ success: true, ...results })
  } catch (err: any) {
    results.errors.push(`Fatal: ${err?.message?.substring(0, 300)}`)
    return NextResponse.json({ success: false, ...results }, { status: 500 })
  }
}
