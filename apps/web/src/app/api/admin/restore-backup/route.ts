import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { gunzipSync } from 'zlib'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BACKUP_URL = 'https://raw.githubusercontent.com/jsiadyarslan-lab/roua-db-backup/main/comprehensive-backup.json.gz'

// ALL tables to import — including rouatradingnews tables
const TABLES_TO_IMPORT = [
  // Core roua-trading tables
  { name: 'User', jsonKey: 'users' },
  { name: 'ExchangeCredential', jsonKey: 'exchangeCredentials' },
  { name: 'Setting', jsonKey: 'Setting' },
  { name: 'AgentSettings', jsonKey: 'AgentSettings' },
  { name: 'Account', jsonKey: 'Account' },
  { name: 'Session', jsonKey: 'Session' },
  { name: 'Order', jsonKey: 'orders' },
  { name: 'Trade', jsonKey: 'Trade' },
  { name: 'AgentSession', jsonKey: 'AgentSession' },
  { name: 'AutonomousTrade', jsonKey: 'AutonomousTrade' },
  { name: 'EAToken', jsonKey: 'EAToken' },
  { name: 'VerificationToken', jsonKey: 'VerificationToken' },
  { name: 'AdminSession', jsonKey: 'AdminSession' },
  { name: 'NotificationConfig', jsonKey: 'NotificationConfig' },
  { name: 'ContentArticle', jsonKey: 'ContentArticle' },
  { name: 'NewsArticle', jsonKey: 'NewsArticle' },
  { name: 'Signal', jsonKey: 'Signal' },
  { name: 'TradingBrief', jsonKey: 'TradingBrief' },
  { name: 'AuditLog', jsonKey: 'AuditLog' },
  { name: 'TradeLifecycleLog', jsonKey: 'TradeLifecycleLog' },
  // rouatradingnews tables (lowercase names)
  { name: 'accounts', jsonKey: 'accounts' },
  { name: 'agency_events', jsonKey: 'agency_events' },
  { name: 'api_keys', jsonKey: 'api_keys' },
  { name: 'chat_messages', jsonKey: 'chat_messages' },
  { name: 'chat_sessions', jsonKey: 'chat_sessions' },
  { name: 'company_profiles', jsonKey: 'company_profiles' },
  { name: 'council_briefs', jsonKey: 'council_briefs' },
  { name: 'economic_events', jsonKey: 'economic_events' },
  { name: 'economic_reports', jsonKey: 'economic_reports' },
  { name: 'geopolitical_risks', jsonKey: 'geopolitical_risks' },
  { name: 'infographics', jsonKey: 'infographics' },
  { name: 'market_analyses', jsonKey: 'market_analyses' },
  { name: 'market_indicators', jsonKey: 'market_indicators' },
  { name: 'news_item_archives', jsonKey: 'news_item_archives' },
  { name: 'notifications', jsonKey: 'notifications' },
  { name: 'personalized_recommendations', jsonKey: 'personalized_recommendations' },
  { name: 'report_views', jsonKey: 'report_views' },
  { name: 'site_settings', jsonKey: 'site_settings' },
  { name: 'telegram_accounts', jsonKey: 'telegram_accounts' },
  { name: 'trading_signals', jsonKey: 'trading_signals' },
  { name: 'user_profiles', jsonKey: 'user_profiles' },
  { name: 'video_reports', jsonKey: 'video_reports' },
]

async function getColumnTypes(tableName: string): Promise<Map<string, string>> {
  const result = await db.$queryRawUnsafe<{ column_name: string; data_type: string; udt_name: string; is_nullable: string }[]>(
    `SELECT column_name, data_type, udt_name, is_nullable
     FROM information_schema.columns
     WHERE table_name = $1 AND table_schema = 'public'
     ORDER BY ordinal_position`,
    tableName
  )
  const types = new Map<string, string>()
  const nullable = new Map<string, boolean>()
  for (const row of result) {
    if (row.data_type === 'USER-DEFINED') {
      types.set(row.column_name, `"${row.udt_name}"`)
    } else if (row.data_type === 'timestamp without time zone') {
      types.set(row.column_name, 'timestamp')
    } else if (row.data_type === 'numeric') {
      types.set(row.column_name, 'numeric')
    } else if (row.data_type === 'boolean') {
      types.set(row.column_name, 'boolean')
    } else if (row.data_type === 'integer') {
      types.set(row.column_name, 'integer')
    } else if (row.data_type === 'bigint') {
      types.set(row.column_name, 'bigint')
    } else if (row.data_type === 'jsonb' || row.data_type === 'json') {
      types.set(row.column_name, 'jsonb')
    } else {
      types.set(row.column_name, 'text')
    }
    nullable.set(row.column_name, row.is_nullable === 'YES')
  }
  return types
}

async function tableExists(tableName: string): Promise<boolean> {
  try {
    const result = await db.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = $1) as exists`,
      tableName
    )
    return result[0]?.exists || false
  } catch {
    return false
  }
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

  const results: any = { steps: [], imported: 0, errors: [], skipped: 0 }

  try {
    results.steps.push('Downloading backup from GitHub...')
    const response = await fetch(BACKUP_URL)
    if (!response.ok) throw new Error(`Download failed: ${response.status}`)
    const gzBuffer = Buffer.from(await response.arrayBuffer())
    results.steps.push(`Downloaded ${(gzBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`)

    results.steps.push('Decompressing...')
    const jsonBuffer = gunzipSync(gzBuffer)
    const backup = JSON.parse(jsonBuffer.toString('utf-8'))
    results.steps.push(`Tables in backup: ${Object.keys(backup.tables || {}).length}`)

    // Disable FK constraints for bulk import
    results.steps.push('Disabling FK constraints...')
    try {
      await db.$executeRawUnsafe("SET session_replication_role = 'replica'")
      results.steps.push('FK constraints disabled')
    } catch {
      results.steps.push('Could not disable FK constraints (non-fatal)')
    }

    for (const { name, jsonKey } of TABLES_TO_IMPORT) {
      // Check if table exists in the new database
      const exists = await tableExists(name)
      if (!exists) {
        results.steps.push(`  ${name}: table does not exist in new DB — skipping`)
        results.skipped++
        continue
      }

      const tableData = backup.tables?.[jsonKey] || backup.tables?.[name]
      if (!tableData?.data || !Array.isArray(tableData.data) || tableData.data.length === 0) {
        continue
      }

      const rows = tableData.data
      const totalCount = tableData.count || rows.length
      const isSampled = tableData.sampled || false
      results.steps.push(`${name}: importing ${rows.length} rows${isSampled ? ` (sampled from ${totalCount})` : ''}...`)

      // BUG FIX: Add default values for NOT NULL columns missing from backup
      // Order table: filledQuantity=0, idempotencyKey=<row id>
      if (name === 'Order') {
        for (const row of rows) {
          if (row.filledQuantity === undefined) row.filledQuantity = row.quantity || 0
          if (row.idempotencyKey === undefined) row.idempotencyKey = row.id || `import-${Date.now()}-${Math.random()}`
        }
      }

      try {
        const colTypes = await getColumnTypes(name)
        const dbColumns = Array.from(colTypes.keys())
        const sampleRow = rows[0]
        const backupColumns = Object.keys(sampleRow)
        const columns = dbColumns.filter(c => backupColumns.includes(c))

        if (columns.length === 0) {
          results.steps.push(`  ${name}: ❌ no matching columns`)
          continue
        }

        let imported = 0
        let failed = 0
        const batchSize = 25

        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize)

          try {
            const values: any[] = []
            const placeholders: string[] = []

            batch.forEach((row, batchIdx) => {
              const rowPh: string[] = []
              columns.forEach((col, colIdx) => {
                const paramIdx = batchIdx * columns.length + colIdx + 1
                let val = row[col]
                const colType = colTypes.get(col) || 'text'
                if (val !== null && typeof val === 'object') {
                  val = JSON.stringify(val)
                }
                if (colType === 'boolean' && typeof val === 'string') {
                  val = val === 'true'
                }
                values.push(val)
                rowPh.push(`$${paramIdx}::${colType}`)
              })
              placeholders.push(`(${rowPh.join(', ')})`)
            })

            const colList = columns.map(c => `"${c}"`).join(', ')
            const sql = `INSERT INTO "${name}" (${colList}) VALUES ${placeholders.join(', ')} ON CONFLICT DO NOTHING`
            await db.$executeRawUnsafe(sql, ...values)
            imported += batch.length
          } catch {
            // If batch fails, try row by row to salvage what we can
            for (const row of batch) {
              try {
                const values: any[] = []
                const rowPh: string[] = []
                columns.forEach((col, colIdx) => {
                  let val = row[col]
                  const colType = colTypes.get(col) || 'text'
                  if (val !== null && typeof val === 'object') {
                    val = JSON.stringify(val)
                  }
                  if (colType === 'boolean' && typeof val === 'string') {
                    val = val === 'true'
                  }
                  values.push(val)
                  rowPh.push(`$${colIdx + 1}::${colType}`)
                })
                const colList = columns.map(c => `"${c}"`).join(', ')
                const sql = `INSERT INTO "${name}" (${colList}) VALUES (${rowPh.join(', ')}) ON CONFLICT DO NOTHING`
                await db.$executeRawUnsafe(sql, ...values)
                imported++
              } catch {
                failed++
              }
            }
          }
        }

        results.imported += imported
        if (failed > 0) {
          results.steps.push(`  ${name}: ✅ ${imported} imported, ⚠️ ${failed} skipped (constraint violations)`)
        } else {
          results.steps.push(`  ${name}: ✅ ${imported} rows`)
        }
      } catch (err: any) {
        results.errors.push(`${name}: ${err?.message?.substring(0, 200)}`)
        results.steps.push(`  ${name}: ❌ ${err?.message?.substring(0, 100)}`)
      }
    }

    // Re-enable FK constraints
    try {
      await db.$executeRawUnsafe("SET session_replication_role = 'origin'")
      results.steps.push('FK constraints re-enabled')
    } catch {
      // Non-fatal
    }

    // Final counts
    results.steps.push('--- Final counts ---')
    const counts: any = {}
    const checkTables = [
      'User', 'ExchangeCredential', 'Trade', 'Order', 'Account', 'AgentSettings', 'Setting',
      'ContentArticle', 'NewsArticle', 'Session', 'AuditLog',
      'economic_reports', 'market_analyses', 'geopolitical_risks',
      'news_item_archives', 'infographics', 'video_reports',
      'chat_messages', 'company_profiles',
    ]
    for (const table of checkTables) {
      try {
        const result = await db.$queryRawUnsafe<{ count: number }[]>(`SELECT count(*)::int as count FROM "${table}"`)
        counts[table] = result[0]?.count || 0
        results.steps.push(`  ${table}: ${counts[table]}`)
      } catch {
        counts[table] = -1
      }
    }
    results.counts = counts

    return NextResponse.json({ success: true, ...results })
  } catch (err: any) {
    results.errors.push(`Fatal: ${err?.message?.substring(0, 300)}`)
    return NextResponse.json({ success: false, ...results }, { status: 500 })
  }
}
