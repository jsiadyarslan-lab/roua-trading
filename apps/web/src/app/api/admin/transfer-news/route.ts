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
    oldClient = new Client({ connectionString: OLD_DB_URL, connectionTimeoutMillis: 10000, query_timeout: 30000 })
    await oldClient.connect()
    results.steps.push('Connected ✅')

    // Get count
    const countResult = await oldClient.query('SELECT count(*)::int as count FROM "news_items"')
    const totalCount = countResult.rows[0]?.count || 0
    results.steps.push(`news_items: ${totalCount.toLocaleString()} rows`)

    // Get columns
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

    // Use cursor-based pagination: WHERE id > last_id (much faster than OFFSET)
    let lastId: string | null = null
    let imported = 0
    let skipped = 0
    const batchSize = 200

    try { await db.$executeRawUnsafe("SET session_replication_role = 'replica'") } catch {}

    let batchNum = 0
    while (true) {
      let batchResult
      try {
        if (lastId) {
          batchResult = await oldClient.query(`SELECT * FROM "news_items" WHERE id > $1 ORDER BY id LIMIT ${batchSize}`, [lastId])
        } else {
          batchResult = await oldClient.query(`SELECT * FROM "news_items" ORDER BY id LIMIT ${batchSize}`)
        }
      } catch (err: any) {
        results.steps.push(`  Read error at batch ${batchNum}: ${err?.message?.substring(0, 100)}`)
        // Try without ORDER BY
        try {
          if (lastId) {
            batchResult = await oldClient.query(`SELECT * FROM "news_items" WHERE id > $1 LIMIT ${batchSize}`, [lastId])
          } else {
            batchResult = await oldClient.query(`SELECT * FROM "news_items" LIMIT ${batchSize}`)
          }
        } catch {
          results.steps.push(`  Fatal read error — stopping`)
          break
        }
      }

      if (!batchResult || batchResult.rows.length === 0) break

      // Track last ID
      const lastRow = batchResult.rows[batchResult.rows.length - 1]
      lastId = lastRow.id

      // Batch INSERT into new DB — with type casting
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
            const paramIdx = rowIdx * cols.length + colIdx + 1
            // Cast jsonb columns — the new DB has jsonb type for some columns
            // but pg returns them as strings when reading from old DB
            const colInfo = colResult.rows.find((r: any) => r.column_name === col)
            const dataType = colInfo?.data_type || 'text'
            let cast = ''
            if (dataType === 'jsonb' || dataType === 'json') cast = '::jsonb'
            else if (dataType === 'timestamp without time zone') cast = '::timestamp'
            else if (dataType === 'numeric') cast = '::numeric'
            else if (dataType === 'boolean') cast = '::boolean'
            else if (dataType === 'integer') cast = '::integer'
            rowPh.push(`$${paramIdx}${cast}`)
          })
          allPlaceholders.push(`(${rowPh.join(', ')})`)
        })

        await db.$executeRawUnsafe(
          `INSERT INTO "news_items" (${colList}) VALUES ${allPlaceholders.join(', ')} ON CONFLICT DO NOTHING`,
          ...allValues
        )
        imported += batchResult.rows.length
      } catch (batchErr: any) {
        if (imported === 0 && skipped === 0) {
          results.steps.push(`  FIRST INSERT ERROR: ${batchErr?.message?.substring(0, 250)}`)
        }
        skipped += batchResult.rows.length
      }

      batchNum++
      if (batchNum % 20 === 0 || imported % 5000 < batchSize) {
        results.steps.push(`  ${imported.toLocaleString()}/${totalCount.toLocaleString()} imported`)
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
