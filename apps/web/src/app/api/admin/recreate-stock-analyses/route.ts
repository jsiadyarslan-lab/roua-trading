import { NextRequest, NextResponse } from 'next/server'
import { Client } from 'pg'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const OLD_DB_URL = 'postgresql://postgres:ECwmddGzeOxVuViSsKmjZXKnZTNNqVtm@postgres-clean.railway.internal:5432/railway'

export async function POST(request: NextRequest) {
  const adminToken = request.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_PASSWORD
  if (!adminToken || adminToken !== expectedToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const results: string[] = []
  const errors: string[] = []
  let oldClient: Client | null = null

  try {
    // 1. Drop existing table
    results.push('Dropping stock_analyses...')
    await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "stock_analyses" CASCADE`)
    results.push('Dropped — disk space freed')

    // 2. Connect to old DB and get schema
    oldClient = new Client({ connectionString: OLD_DB_URL, connectionTimeoutMillis: 10000, query_timeout: 30000 })
    await oldClient.connect()

    const colResult = await oldClient.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'stock_analyses' AND table_schema = 'public' ORDER BY ordinal_position`)

    // 3. Create table with proper types
    const colDefs = colResult.rows.map((c: any) => {
      let type = 'TEXT'
      if (c.data_type === 'timestamp without time zone') type = 'TIMESTAMP'
      else if (c.data_type === 'integer') type = 'INTEGER'
      else if (c.data_type === 'numeric') type = 'NUMERIC(18,8)'
      else if (c.data_type === 'boolean') type = 'BOOLEAN'
      else if (c.data_type === 'jsonb' || c.data_type === 'json') type = 'JSONB'
      else if (c.data_type === 'bigint') type = 'BIGINT'
      if (c.column_name === 'isPublished') type = 'BOOLEAN DEFAULT true'
      let def = `"${c.column_name}" ${type}`
      if (c.column_name === 'id') def += ' PRIMARY KEY'
      return def
    })

    const oldCols = colResult.rows.map((c: any) => c.column_name)
    if (!oldCols.includes('id')) colDefs.unshift('"id" TEXT PRIMARY KEY')

    await db.$executeRawUnsafe(`CREATE TABLE "stock_analyses" (${colDefs.join(', ')})`)
    results.push('Table recreated with proper types')

    // 4. Import with type conversion
    results.push('Importing from old DB...')
    const hasId = oldCols.includes('id')
    let lastId: string | null = null
    let imported = 0
    let skipped = 0
    const batchSize = 200

    try { await db.$executeRawUnsafe("SET session_replication_role = 'replica'") } catch {}

    const countResult = await oldClient.query(`SELECT count(*)::int as count FROM "stock_analyses"`)
    const totalCount = countResult.rows[0]?.count || 0
    results.push(`Total: ${totalCount.toLocaleString()}`)

    while (true) {
      try {
        let batchResult
        if (hasId && lastId) {
          batchResult = await oldClient.query(`SELECT * FROM "stock_analyses" WHERE id > $1 ORDER BY id LIMIT ${batchSize}`, [lastId])
        } else {
          batchResult = await oldClient.query(`SELECT * FROM "stock_analyses" LIMIT ${batchSize} OFFSET ${imported + skipped}`)
        }
        if (batchResult.rows.length === 0) break
        if (hasId) lastId = batchResult.rows[batchResult.rows.length - 1].id

        for (const row of batchResult.rows) {
          try {
            // Type conversions
            if (row.isPublished !== null && typeof row.isPublished === 'string') {
              row.isPublished = row.isPublished === 'true' || row.isPublished === 't'
            }
            if (!row.locale || row.locale === 'en') row.locale = 'ar'
            if (!row.slug && row.title) {
              row.slug = 'sa-' + row.title.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() + '-' + Math.random().toString(36).substring(2, 8)
            }
            if (!hasId && !row.id) {
              row.id = 'sa-' + Math.random().toString(36).substring(2, 18)
            }

            const cols = Object.keys(row)
            const vals: any[] = []
            const phs: string[] = []
            cols.forEach((col, idx) => {
              let val = row[col]
              if (val !== null && typeof val === 'object') val = JSON.stringify(val)
              vals.push(val)
              phs.push(`$${idx + 1}`)
            })
            await db.$executeRawUnsafe(`INSERT INTO "stock_analyses" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${phs.join(', ')}) ON CONFLICT DO NOTHING`, ...vals)
            imported++
          } catch { skipped++ }
        }

        if ((imported + skipped) % 10000 === 0) {
          results.push(`  ${imported.toLocaleString()}/${totalCount.toLocaleString()}`)
        }
      } catch {
        skipped += batchSize
        if (imported + skipped >= totalCount) break
      }
    }

    try { await db.$executeRawUnsafe("SET session_replication_role = 'origin'") } catch {}
    results.push(`Done: ${imported.toLocaleString()} imported, ${skipped.toLocaleString()} skipped`)
    await oldClient.end()
    return NextResponse.json({ success: true, results, errors })
  } catch (err: any) {
    if (oldClient) { try { await oldClient.end() } catch {} }
    errors.push(`Fatal: ${err?.message?.substring(0, 300)}`)
    return NextResponse.json({ success: false, results, errors }, { status: 500 })
  }
}
