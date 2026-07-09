import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const adminToken = request.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_PASSWORD || 'roua-admin-secret-2026'
  if (!adminToken || adminToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: any = { timestamp: new Date().toISOString(), batches: [] }

  const batchSize = 500
  let offset = 0
  let totalRead = 0
  let consecutiveErrors = 0

  while (consecutiveErrors < 5 && offset < 20000) {
    try {
      const batch = await db.$queryRawUnsafe(
        `SELECT * FROM "Position" ORDER BY id OFFSET ${offset} LIMIT ${batchSize}`
      )
      if (!batch || batch.length === 0) break
      results.batches.push({ offset, count: batch.length, data: batch })
      totalRead += batch.length
      offset += batchSize
      consecutiveErrors = 0
    } catch (err: any) {
      consecutiveErrors++
      results.batches.push({ offset, error: err?.message?.substring(0, 150) })
      offset += batchSize
    }
  }

  results.totalRead = totalRead
  return NextResponse.json(results)
}
