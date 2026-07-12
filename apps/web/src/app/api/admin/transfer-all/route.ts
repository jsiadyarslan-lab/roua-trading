import { NextRequest, NextResponse } from 'next/server'
import { Client } from 'pg'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const OLD_DB_URL = 'postgresql://postgres:ECwmddGzeOxVuViSsKmjZXKnZTNNqVtm@postgres-clean.railway.internal:5432/railway'

const TABLES_TO_TRANSFER = [
  'market_analyses',
  'geopolitical_risks',
  'Signal',
  'TradingBrief',
  'AuditLog',
  'TradeLifecycleLog',
  'Session',
  'NewsArticle',
  'ContentArticle',
  'AgentSession',
  'AutonomousTrade',
  'stock_analyses',
]

export async function POST(request: NextRequest) {
  const adminToken = request.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_PASSWORD
  if (!adminToken || adminToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: any = { steps: [], imported: 0, skipped: 0, errors: [] }
  let oldClient: Client | null = null

  try {
    oldClient = new Client({ connectionString: OLD_DB_URL, connectionTimeoutMillis: 10000, query_timeout: 60000 })
    await oldClient.connect()
    results.steps.push('Connected to old DB')

    try { await db.$executeRawUnsafe("SET session_replication_role = 'replica'") } catch {}

    for (const tableName of TABLES_TO_TRANSFER) {
      results.steps.push(`--- ${tableName} ---`)

      let oldCount = 0
      try {
        const countResult = await oldClient.query(`SELECT count(*)::int as count FROM "${tableName}"`)
        oldCount = countResult.rows[0]?.count || 0
        results.steps.push(`  Old: ${oldCount.toLocaleString()} rows`)
      } catch (err: any) {
        results.steps.push(`  Count failed: ${err?.message?.substring(0, 100)}`)
        if (tableName === 'stock_analyses') {
          results.steps.push(`  Trying REINDEX...`)
          try {
            await oldClient.query(`REINDEX TABLE "${tableName}"`)
            const retry = await oldClient.query(`SELECT count(*)::int as count FROM "${tableName}"`)
            oldCount = retry.rows[0]?.count || 0
            results.steps.push(`  After REINDEX: ${oldCount.toLocaleString()}`)
          } catch (e2: any) {
            results.steps.push(`  REINDEX failed — trying safe columns only`)
            // Read only small columns (no TOAST)
            try {
              const colsResult = await oldClient.query(`
                SELECT column_name FROM information_schema.columns
                WHERE table_name = $1 AND data_type IN ('integer','boolean','timestamp without time zone','numeric','bigint')
                ORDER BY ordinal_position
              `, [tableName])
              const safeCols = colsResult.rows.map((r: any) => r.column_name)

              if (safeCols.length > 0) {
                // Try to read count using only safe columns
                const safeCount = await oldClient.query(`SELECT count("${safeCols[0]}")::int as count FROM "${tableName}"`)
                oldCount = safeCount.rows[0]?.count || 0
                results.steps.push(`  Safe count: ${oldCount.toLocaleString()}`)

                // Create table in new DB if needed
                const exists = await db.$queryRawUnsafe<{ exists: boolean }[]>(
                  `SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = $1) as exists`, tableName
                )
                if (!exists[0]?.exists) {
                  const colDefs = safeCols.map(c => `"${c}" TEXT`)
                  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "${tableName}" (${colDefs.join(',')})`)
                }

                // Transfer using only safe columns
                let offset = 0
                let imported = 0
                while (offset < oldCount) {
                  try {
                    const batch = await oldClient.query(
                      `SELECT ${safeCols.map(c => `"${c}"`).join(',')} FROM "${tableName}" ORDER BY "${safeCols[0]}" OFFSET ${offset} LIMIT 200`
                    )
                    if (batch.rows.length === 0) break
                    for (const row of batch.rows) {
                      try {
                        const cols = Object.keys(row)
                        const vals = cols.map(c => row[c])
                        const phs = cols.map((_, i) => `$${i+1}`)
                        await db.$executeRawUnsafe(
                          `INSERT INTO "${tableName}" (${cols.map(c=>`"${c}"`).join(',')}) VALUES (${phs.join(',')}) ON CONFLICT DO NOTHING`,
                          ...vals
                        )
                        imported++
                      } catch {}
                    }
                    offset += batch.rows.length
                  } catch { offset += 200 }
                }
                results.imported += imported
                results.steps.push(`  Imported ${imported.toLocaleString()} (safe columns only)`)
                continue
              }
            } catch (e3: any) {
              results.steps.push(`  Cannot read at all: ${e3?.message?.substring(0, 80)}`)
              continue
            }
          }
        } else {
          continue
        }
      }

      if (oldCount === 0) continue

      // Get columns
      const oldColsResult = await oldClient.query(`
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = 'public' ORDER BY ordinal_position
      `, [tableName])
      const oldCols = oldColsResult.rows

      // Get new DB column types
      const newColsResult = await db.$queryRawUnsafe<{ column_name: string; data_type: string; udt_name: string }[]>(
        `SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public' ORDER BY ordinal_position`,
        tableName
      )

      const newColTypes = new Map<string, string>()
      for (const row of newColsResult) {
        if (row.data_type === 'USER-DEFINED') newColTypes.set(row.column_name, `"${row.udt_name}"`)
        else if (row.data_type === 'timestamp without time zone') newColTypes.set(row.column_name, 'timestamp')
        else if (row.data_type === 'numeric') newColTypes.set(row.column_name, 'numeric')
        else if (row.data_type === 'boolean') newColTypes.set(row.column_name, 'boolean')
        else if (row.data_type === 'integer') newColTypes.set(row.column_name, 'integer')
        else if (row.data_type === 'bigint') newColTypes.set(row.column_name, 'bigint')
        else if (row.data_type === 'jsonb' || row.data_type === 'json') newColTypes.set(row.column_name, 'jsonb')
        else newColTypes.set(row.column_name, 'text')
      }

      const allCols = oldCols.map((c: any) => c.column_name)
      const newCols = Array.from(newColTypes.keys())
      const columns = allCols.filter((c: string) => newCols.includes(c))
      if (columns.length === 0) continue

      // Transfer
      let lastId: string | null = null
      let imported = 0
      let skipped = 0
      const batchSize = 200

      while (true) {
        let batchResult
        try {
          if (lastId && columns.includes('id')) {
            batchResult = await oldClient.query(`SELECT * FROM "${tableName}" WHERE id > $1 ORDER BY id LIMIT ${batchSize}`, [lastId])
          } else {
            batchResult = await oldClient.query(`SELECT * FROM "${tableName}" ORDER BY id LIMIT ${batchSize} OFFSET ${imported + skipped}`)
          }
        } catch {
          skipped += batchSize
          if (imported + skipped >= oldCount) break
          continue
        }

        if (!batchResult || batchResult.rows.length === 0) break
        if (columns.includes('id')) lastId = batchResult.rows[batchResult.rows.length - 1].id

        try {
          const colList = columns.map(c => `"${c}"`).join(', ')
          const allValues: any[] = []
          const allPlaceholders: string[] = []

          batchResult.rows.forEach((row, rowIdx) => {
            const rowPh: string[] = []
            columns.forEach((col, colIdx) => {
              let val = row[col]
              if (val !== null && typeof val === 'object') val = JSON.stringify(val)
              allValues.push(val)
              rowPh.push(`$${rowIdx * columns.length + colIdx + 1}::${newColTypes.get(col) || 'text'}`)
            })
            allPlaceholders.push(`(${rowPh.join(', ')})`)
          })

          await db.$executeRawUnsafe(`INSERT INTO "${tableName}" (${colList}) VALUES ${allPlaceholders.join(', ')} ON CONFLICT DO NOTHING`, ...allValues)
          imported += batchResult.rows.length
        } catch {
          for (const row of batchResult.rows) {
            try {
              const vals: any[] = []
              const phs: string[] = []
              columns.forEach((col, idx) => {
                let val = row[col]
                if (val !== null && typeof val === 'object') val = JSON.stringify(val)
                vals.push(val)
                phs.push(`$${idx + 1}::${newColTypes.get(col) || 'text'}`)
              })
              await db.$executeRawUnsafe(`INSERT INTO "${tableName}" (${columns.map(c=>`"${c}"`).join(',')}) VALUES (${phs.join(',')}) ON CONFLICT DO NOTHING`, ...vals)
              imported++
            } catch { skipped++ }
          }
        }

        if ((imported + skipped) % 5000 < batchSize) {
          results.steps.push(`  ${imported.toLocaleString()}/${oldCount.toLocaleString()}`)
        }
      }

      results.imported += imported
      results.skipped += skipped
      results.steps.push(`  Done: ${imported.toLocaleString()} imported, ${skipped.toLocaleString()} skipped`)
    }

    try { await db.$executeRawUnsafe("SET session_replication_role = 'origin'") } catch {}
    await oldClient.end()
    results.steps.push('All done!')
    return NextResponse.json({ success: true, ...results })
  } catch (err: any) {
    if (oldClient) { try { await oldClient.end() } catch {} }
    results.errors.push(`Fatal: ${err?.message?.substring(0, 300)}`)
    return NextResponse.json({ success: false, ...results }, { status: 500 })
  }
}
