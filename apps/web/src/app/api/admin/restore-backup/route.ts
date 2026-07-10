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
  { name: 'NotificationConfig', jsonKey: 'NotificationConfig' },
  { name: 'EAToken', jsonKey: 'EAToken' },
  { name: 'VerificationToken', jsonKey: 'VerificationToken' },
  { name: 'AdminSession', jsonKey: 'AdminSession' },
]

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
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status}`)
    }
    const gzBuffer = Buffer.from(await response.arrayBuffer())
    results.steps.push(`Downloaded ${(gzBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`)

    results.steps.push('Decompressing...')
    const jsonBuffer = gunzipSync(gzBuffer)
    results.steps.push(`Decompressed to ${(jsonBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`)

    results.steps.push('Parsing JSON...')
    const backup = JSON.parse(jsonBuffer.toString('utf-8'))
    results.steps.push(`Tables in backup: ${Object.keys(backup.tables || {}).length}`)

    for (const { name, jsonKey } of TABLES_TO_IMPORT) {
      const tableData = backup.tables?.[jsonKey] || backup.tables?.[name]
      if (!tableData?.data || !Array.isArray(tableData.data) || tableData.data.length === 0) {
        continue
      }

      const rows = tableData.data
      results.steps.push(`${name}: importing ${rows.length} rows...`)

      try {
        const columns = Object.keys(rows[0])
        let imported = 0
        const batchSize = 50

        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize)
          const colList = columns.map(c => `"${c}"`).join(', ')
          const values: any[] = []
          const placeholders: string[] = []

          batch.forEach((row, batchIdx) => {
            const rowPh: string[] = []
            columns.forEach((col, colIdx) => {
              const paramIdx = batchIdx * columns.length + colIdx + 1
              let val = row[col]
              if (val !== null && typeof val === 'object') {
                val = JSON.stringify(val)
              }
              values.push(val)
              rowPh.push(`$${paramIdx}`)
            })
            placeholders.push(`(${rowPh.join(', ')})`)
          })

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

    results.steps.push('--- Final counts ---')
    const counts: any = {}
    for (const table of ['User', 'ExchangeCredential', 'Trade', 'Order', 'Account', 'AgentSettings']) {
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
