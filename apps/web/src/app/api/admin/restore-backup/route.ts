import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { gunzipSync } from 'zlib'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BACKUP_URL = 'https://raw.githubusercontent.com/jsiadyarslan-lab/roua-db-backup/main/comprehensive-backup.json.gz'

const TABLES_TO_IMPORT = [
  { name: 'User', jsonKey: 'users' },
  { name: 'ExchangeCredential', jsonKey: 'exchangeCredentials' },
  { name: 'Setting', jsonKey: 'Setting' },
  { name: 'AgentSettings', jsonKey: 'AgentSettings' },
  { name: 'Account', jsonKey: 'Account' },
  { name: 'Order', jsonKey: 'orders' },
  { name: 'Trade', jsonKey: 'Trade' },
  { name: 'Session', jsonKey: 'Session' },
  { name: 'ContentArticle', jsonKey: 'ContentArticle' },
  { name: 'AgentSession', jsonKey: 'AgentSession' },
  { name: 'AutonomousTrade', jsonKey: 'AutonomousTrade' },
  { name: 'EAToken', jsonKey: 'EAToken' },
  { name: 'VerificationToken', jsonKey: 'VerificationToken' },
  { name: 'AdminSession', jsonKey: 'AdminSession' },
  { name: 'NotificationConfig', jsonKey: 'NotificationConfig' },
]

async function getColumnTypes(tableName: string): Promise<Map<string, string>> {
  const result = await db.$queryRawUnsafe<{ column_name: string; data_type: string; udt_name: string }[]>(
    `SELECT column_name, data_type, udt_name 
     FROM information_schema.columns 
     WHERE table_name = $1 AND table_schema = 'public'
     ORDER BY ordinal_position`,
    tableName
  )
  const types = new Map<string, string>()
  for (const row of result) {
    // For enum types, use udt_name; for others, use data_type
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
  }
  return types
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

  const results: any = { steps: [], imported: 0, errors: [] }

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
      await db.$executeRawUnsafe('SET session_replication_role = \'replica\'')
      results.steps.push('FK constraints disabled')
    } catch (e: any) {
      results.steps.push('Could not disable FK constraints (non-fatal)')
    }

    for (const { name, jsonKey } of TABLES_TO_IMPORT) {
      const tableData = backup.tables?.[jsonKey] || backup.tables?.[name]
      if (!tableData?.data || !Array.isArray(tableData.data) || tableData.data.length === 0) {
        continue
      }

      const rows = tableData.data
      results.steps.push(`${name}: importing ${rows.length} rows...`)

      try {
        // Get column types from DB
        const colTypes = await getColumnTypes(name)
        
        // Only import columns that exist in the DB
        const dbColumns = Array.from(colTypes.keys())
        const sampleRow = rows[0]
        const backupColumns = Object.keys(sampleRow)
        // Use intersection of DB columns and backup columns
        const columns = dbColumns.filter(c => backupColumns.includes(c))
        
        if (columns.length === 0) {
          results.steps.push(`  ${name}: ❌ no matching columns`)
          continue
        }

        let imported = 0
        const batchSize = 25

        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize)
          const values: any[] = []
          const placeholders: string[] = []

          batch.forEach((row, batchIdx) => {
            const rowPh: string[] = []
            columns.forEach((col, colIdx) => {
              const paramIdx = batchIdx * columns.length + colIdx + 1
              let val = row[col]
              // Convert objects to JSON strings for jsonb columns
              const colType = colTypes.get(col) || 'text'
              if (val !== null && typeof val === 'object') {
                val = JSON.stringify(val)
              }
              // Convert booleans
              if (colType === 'boolean' && typeof val === 'string') {
                val = val === 'true'
              }
              values.push(val)
              // Add cast: $N::type
              rowPh.push(`$${paramIdx}::${colType}`)
            })
            placeholders.push(`(${rowPh.join(', ')})`)
          })

          const colList = columns.map(c => `"${c}"`).join(', ')
          const sql = `INSERT INTO "${name}" (${colList}) VALUES ${placeholders.join(', ')} ON CONFLICT DO NOTHING`
          await db.$executeRawUnsafe(sql, ...values)
          imported += batch.length
        }

        results.imported += imported
        results.steps.push(`  ${name}: ✅ ${imported} rows`)
      } catch (err: any) {
        results.errors.push(`${name}: ${err?.message?.substring(0, 200)}`)
        results.steps.push(`  ${name}: ❌ ${err?.message?.substring(0, 100)}`)
      }
    }

    // Re-enable FK constraints
    try {
      await db.$executeRawUnsafe('SET session_replication_role = \'origin\'')
      results.steps.push('FK constraints re-enabled')
    } catch {
      // Non-fatal
    }

    // Final counts
    results.steps.push('--- Final counts ---')
    const counts: any = {}
    for (const table of ['User', 'ExchangeCredential', 'Trade', 'Order', 'Account', 'AgentSettings', 'Setting']) {
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
