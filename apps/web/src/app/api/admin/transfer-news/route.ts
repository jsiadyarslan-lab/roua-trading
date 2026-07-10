import { NextRequest, NextResponse } from 'next/server'
import { Client } from 'pg'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const OLD_DB_URL = 'postgresql://postgres:ECwmddGzeOxVuViSsKmjZXKnZTNNqVtm@postgres-clean.railway.internal:5432/railway'

export async function POST(request: NextRequest) {
  const adminToken = request.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_PASSWORD
  if (!expectedToken) return NextResponse.json({ error: 'ADMIN_PASSWORD not configured' }, { status: 503 })
  if (!adminToken || adminToken !== expectedToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const results: any = { steps: [], imported: 0, errors: [] }
  let oldClient: Client | null = null

  try {
    results.steps.push('Connecting to OLD database...')
    oldClient = new Client({ connectionString: OLD_DB_URL, connectionTimeoutMillis: 10000, query_timeout: 240000 })
    await oldClient.connect()
    results.steps.push('Connected ✅')

    const countResult = await oldClient.query('SELECT count(*)::int as count FROM "news_items"')
    const totalCount = countResult.rows[0]?.count || 0
    results.steps.push(`news_items: ${totalCount.toLocaleString()} rows in old DB`)

    const colResult = await oldClient.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'news_items' AND table_schema = 'public' ORDER BY ordinal_position`)
    const columns = colResult.rows.map((r: any) => r.column_name)

    // Create table in new DB if not exists
    const newExists = await db.$queryRawUnsafe<{ exists: boolean }[]>(`SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'news_items') as exists`)
    if (!newExists[0]?.exists) {
      const colDefs = colResult.rows.map((r: any) => {
        let type = 'TEXT'
        if (r.data_type === 'timestamp without time zone') type = 'TIMESTAMP'
        else if (r.data_type === 'integer') type = 'INTEGER'
        else if (r.data_type === 'numeric') type = 'NUMERIC(18,8)'
        else if (r.data_type === 'boolean') type = 'BOOLEAN'
        else if (r.data_type === 'jsonb' || r.data_type === 'json') type = 'JSONB'
        return `"${r.column_name}" ${type}`
      })
      const hasId = columns.includes('id')
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "news_items" (${colDefs.join(', ')}${hasId ? ', PRIMARY KEY ("id")' : ''})`)
      results.steps.push('Table created ✅')
    }

    const batchSize = 500
    let offset = 0
    let imported = 0
    let skipped = 0

    try { await db.$executeRawUnsafe("SET session_replication_role = 'replica'") } catch {}

    while (offset < totalCount) {
      try {
        const batchResult = await oldClient.query(`SELECT * FROM "news_items" ORDER BY id OFFSET ${offset} LIMIT ${batchSize}`)
        if (batchResult.rows.length === 0) break

        // BATCH INSERT — all rows in one query (much faster than row-by-row)
        try {
          const cols = Object.keys(batchResult.rows[0])
          const colList = cols.map(c => `"${c}"`).join(', ')
          const allValues: any[] = []
          const allPlaceholders: string[] = []

          batchResult.rows.forEach((row, rowIdx) => {
            const rowPh: string[] = []
            cols.forEach((col, colIdx) => {
              let val = row[col]
              if (val !== null && typeof val === 'object') val = JSON.stringify(val)
              allValues.push(val)
              rowPh.push(`$${rowIdx * cols.length + colIdx + 1}`)
            })
            allPlaceholders.push(`(${rowPh.join(', ')})`)
          })

          await db.$executeRawUnsafe(
            `INSERT INTO "news_items" (${colList}) VALUES ${allPlaceholders.join(', ')} ON CONFLICT DO NOTHING`,
            ...allValues
          )
          imported += batchResult.rows.length
        } catch {
          // If batch fails, try row by row
          for (const row of batchResult.rows) {
            try {
              const cols = Object.keys(row)
              const values: any[] = []
              const placeholders: string[] = []
              cols.forEach((col, idx) => {
                let val = row[col]
                if (val !== null && typeof val === 'object') val = JSON.stringify(val)
                values.push(val)
                placeholders.push(`$${idx + 1}`)
              })
              const colList = cols.map(c => `"${c}"`).join(', ')
              await db.$executeRawUnsafe(`INSERT INTO "news_items" (${colList}) VALUES (${placeholders.join(', ')}) ON CONFLICT DO NOTHING`, ...values)
              imported++
            } catch { skipped++ }
          }
        }

        offset += batchResult.rows.length
        if (offset % 10000 === 0 || offset >= totalCount) {
          results.steps.push(`  ${offset.toLocaleString()}/${totalCount.toLocaleString()} (${imported.toLocaleString()} ok, ${skipped} skip)`)
        }
      } catch {
        results.steps.push(`  Corruption at offset ${offset}, skipping`)
        offset += batchSize
        skipped += batchSize
      }
    }

    try { await db.$executeRawUnsafe("SET session_replication_role = 'origin'") } catch {}
    results.imported = imported
    results.skipped = skipped
    results.steps.push(`Done: ${imported.toLocaleString()} imported, ${skipped.toLocaleString()} skipped`)
    await oldClient.end()
    return NextResponse.json({ success: true, ...results })
  } catch (err: any) {
    if (oldClient) { try { await oldClient.end() } catch {} }
    results.errors.push(`Fatal: ${err?.message?.substring(0, 300)}`)
    return NextResponse.json({ success: false, ...results }, { status: 500 })
  }
}
