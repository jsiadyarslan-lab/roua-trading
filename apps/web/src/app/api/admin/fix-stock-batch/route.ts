import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const adminToken = request.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_PASSWORD
  if (!adminToken || adminToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: string[] = []
  const errors: string[] = []

  try {
    // 1. Count NULL ids
    const nullCount = await db.$queryRawUnsafe<{ count: number }[]>(
      `SELECT count(*)::int as count FROM "stock_analyses" WHERE "id" IS NULL`
    )
    const total = nullCount[0]?.count || 0
    results.push(`NULL id rows: ${total.toLocaleString()}`)

    // 2. Update in batches using ctid (physical row pointer)
    let updated = 0
    const batchSize = 5000
    while (updated < total) {
      try {
        const result = await db.$executeRawUnsafe(`
          UPDATE "stock_analyses" SET "id" = COALESCE(slug, 'sa_' || substr(md5(random()::text), 1, 16))
          WHERE ctid IN (SELECT ctid FROM "stock_analyses" WHERE "id" IS NULL LIMIT ${batchSize})
        `)
        if (result === 0) break
        updated += result
        if (updated % 50000 === 0) {
          results.push(`Progress: ${updated.toLocaleString()}/${total.toLocaleString()}`)
        }
      } catch (err: any) {
        errors.push(`Batch at ${updated}: ${err?.message?.substring(0, 150)}`)
        break
      }
    }
    results.push(`Updated: ${updated.toLocaleString()}`)

    // 3. Check remaining
    const remaining = await db.$queryRawUnsafe<{ count: number }[]>(
      `SELECT count(*)::int as count FROM "stock_analyses" WHERE "id" IS NULL`
    )
    results.push(`Remaining NULL: ${remaining[0]?.count || 0}`)

    return NextResponse.json({ success: true, results, errors })
  } catch (err: any) {
    errors.push(`Fatal: ${err?.message?.substring(0, 300)}`)
    return NextResponse.json({ success: false, results, errors }, { status: 500 })
  }
}
