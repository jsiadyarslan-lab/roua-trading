import { NextRequest, NextResponse } from 'next/server'
import { Client } from 'pg'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const OLD_DB_URL = 'postgresql://postgres:ECwmddGzeOxVuViSsKmjZXKnZTNNqVtm@postgres-clean.railway.internal:5432/railway'

export async function POST(request: NextRequest) {
  const adminToken = request.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_PASSWORD
  if (!adminToken || adminToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: any = { steps: [], imported: 0, errors: [] }
  let oldClient: Client | null = null

  try {
    oldClient = new Client({ connectionString: OLD_DB_URL, connectionTimeoutMillis: 10000, query_timeout: 30000 })
    await oldClient.connect()
    results.steps.push('Connected to old DB')

    // Get all IDs from new DB
    const newIdsResult = await db.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "news_items"`)
    const newIds = new Set(newIdsResult.map(r => r.id))
    results.steps.push(`New DB has ${newIds.size.toLocaleString()} news_items`)

    // Get count from old DB
    const countResult = await oldClient.query('SELECT count(*)::int as count FROM "news_items"')
    const oldCount = countResult.rows[0]?.count || 0
    results.steps.push(`Old DB has ${oldCount.toLocaleString()} news_items`)

    // Get column types
    const colTypesResult = await oldClient.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'news_items' AND table_schema = 'public'
      ORDER BY ordinal_position
    `)
    const colTypes = new Map<string, string>()
    for (const r of colTypesResult.rows) {
      if (r.data_type === 'jsonb' || r.data_type === 'json') colTypes.set(r.column_name, 'jsonb')
      else if (r.data_type === 'timestamp without time zone') colTypes.set(r.column_name, 'timestamp')
      else if (r.data_type === 'numeric') colTypes.set(r.column_name, 'numeric')
      else if (r.data_type === 'boolean') colTypes.set(r.column_name, 'boolean')
      else if (r.data_type === 'integer') colTypes.set(r.column_name, 'integer')
      else colTypes.set(r.column_name, 'text')
    }

    // Read from old DB in DESC order (newest first)
    let imported = 0
    let skipped = 0
    const batchSize = 100

    try { await db.$executeRawUnsafe("SET session_replication_role = 'replica'") } catch {}

    let offset = 0
    while (offset < oldCount) {
      try {
        const batchResult = await oldClient.query(
          `SELECT * FROM "news_items" ORDER BY id DESC OFFSET ${offset} LIMIT ${batchSize}`
        )
        if (batchResult.rows.length === 0) break

        const newRows = batchResult.rows.filter(row => !newIds.has(row.id))

        if (newRows.length > 0) {
          try {
            const cols = Object.keys(newRows[0])
            const colList = cols.map(c => `"${c}"`).join(', ')
            const allValues: any[] = []
            const allPlaceholders: string[] = []

            newRows.forEach((row, rowIdx) => {
              const rowPh: string[] = []
              cols.forEach((col, colIdx) => {
                let val = row[col]
                if (val !== null && typeof val === 'object') val = JSON.stringify(val)
                allValues.push(val)
                rowPh.push(`$${rowIdx * cols.length + colIdx + 1}::${colTypes.get(col) || 'text'}`)
              })
              allPlaceholders.push(`(${rowPh.join(', ')})`)
            })

            await db.$executeRawUnsafe(
              `INSERT INTO "news_items" (${colList}) VALUES ${allPlaceholders.join(', ')} ON CONFLICT DO NOTHING`,
              ...allValues
            )
            imported += newRows.length
          } catch {
            skipped += newRows.length
          }
        }

        offset += batchResult.rows.length
        if (offset % 5000 === 0 || offset >= oldCount) {
          results.steps.push(`  ${offset.toLocaleString()}/${oldCount.toLocaleString()} checked (${imported} new)`)
        }
      } catch {
        results.steps.push(`  Corruption at offset ${offset} — skipping`)
        offset += batchSize
      }
    }

    try { await db.$executeRawUnsafe("SET session_replication_role = 'origin'") } catch {}

    results.imported = imported
    results.steps.push(`Done: ${imported} new items imported, ${skipped} skipped`)
    await oldClient.end()
    return NextResponse.json({ success: true, ...results })
  } catch (err: any) {
    if (oldClient) { try { await oldClient.end() } catch {} }
    results.errors.push(`Fatal: ${err?.message?.substring(0, 300)}`)
    return NextResponse.json({ success: false, ...results }, { status: 500 })
  }
}
