import { NextRequest, NextResponse } from 'next/server'
import { Client } from 'pg'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const OLD_DB_URL = 'postgresql://postgres:ECwmddGzeOxVuViSsKmjZXKnZTNNqVtm@postgres-clean.railway.internal:5432/railway'

export async function POST(request: NextRequest) {
  const adminToken = request.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_PASSWORD
  if (!expectedToken) return NextResponse.json({ error: 'ADMIN_PASSWORD not configured' }, { status: 503 })
  if (!adminToken || adminToken !== expectedToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const results: any = { steps: [], tables: {}, errors: [] }
  let client: Client | null = null

  try {
    results.steps.push('Connecting to OLD database (Postgres-Clean)...')
    client = new Client({
      connectionString: OLD_DB_URL,
      connectionTimeoutMillis: 10000,
      query_timeout: 120000,
    })
    await client.connect()
    results.steps.push('Connected to old database ✅')

    const tablesToExtract = [
      { name: 'news_items', batchSize: 1000 },
      { name: 'stock_analyses', batchSize: 1000 },
    ]

    for (const { name, batchSize } of tablesToExtract) {
      results.steps.push(`Extracting ${name}...`)
      try {
        const countResult = await client.query(`SELECT count(*)::int as count FROM "${name}"`)
        const totalCount = countResult.rows[0]?.count || 0
        results.steps.push(`  ${name}: ${totalCount.toLocaleString()} rows found`)

        if (totalCount === 0) { results.tables[name] = { count: 0 }; continue }

        const allData: any[] = []
        let offset = 0
        while (offset < totalCount) {
          try {
            const batchResult = await client.query(`SELECT * FROM "${name}" ORDER BY id OFFSET ${offset} LIMIT ${batchSize}`)
            if (batchResult.rows.length === 0) break
            allData.push(...batchResult.rows)
            offset += batchResult.rows.length
            if (offset % 10000 === 0 || offset >= totalCount) {
              results.steps.push(`  ${name}: ${offset.toLocaleString()}/${totalCount.toLocaleString()}`)
            }
          } catch {
            results.steps.push(`  ${name}: corruption at offset ${offset}, skipping ${batchSize} rows`)
            offset += batchSize
          }
        }
        results.tables[name] = { count: totalCount, extracted: allData.length }
        results.steps.push(`  ${name}: ✅ extracted ${allData.length.toLocaleString()} rows`)
      } catch (err: any) {
        results.errors.push(`${name}: ${err?.message?.substring(0, 200)}`)
        results.steps.push(`  ${name}: ❌ ${err?.message?.substring(0, 150)}`)
      }
    }

    await client.end()
    return NextResponse.json({ success: true, ...results })
  } catch (err: any) {
    if (client) { try { await client.end() } catch {} }
    results.errors.push(`Fatal: ${err?.message?.substring(0, 300)}`)
    return NextResponse.json({ success: false, ...results }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const adminToken = request.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_PASSWORD
  if (!expectedToken) return NextResponse.json({ error: 'ADMIN_PASSWORD not configured' }, { status: 503 })
  if (!adminToken || adminToken !== expectedToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // GET: just check counts without extracting
  let client: Client | null = null
  try {
    client = new Client({ connectionString: OLD_DB_URL, connectionTimeoutMillis: 10000 })
    await client.connect()

    const counts: any = {}
    for (const table of ['news_items', 'stock_analyses', 'market_analyses', 'news_item_archives']) {
      try {
        const result = await client.query(`SELECT count(*)::int as count FROM "${table}"`)
        counts[table] = result.rows[0]?.count || 0
      } catch (err: any) {
        counts[table] = `ERROR: ${err.message.substring(0, 100)}`
      }
    }

    await client.end()
    return NextResponse.json({ success: true, counts })
  } catch (err: any) {
    if (client) { try { await client.end() } catch {} }
    return NextResponse.json({ success: false, error: err?.message?.substring(0, 300) }, { status: 500 })
  }
}
