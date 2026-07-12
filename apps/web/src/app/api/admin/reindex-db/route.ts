import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const adminToken = request.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_PASSWORD
  if (!expectedToken) {
    return NextResponse.json({ error: 'ADMIN_PASSWORD not configured' }, { status: 503 })
  }
  if (!adminToken || adminToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: string[] = []
  const errors: string[] = []

  // Step 1: REINDEX the corrupted system index
  results.push('--- Step 1: REINDEX pg_attribute_relid_attnum_index ---')
  try {
    await db.$executeRawUnsafe(`REINDEX INDEX "pg_attribute_relid_attnum_index"`)
    results.push('Reindexed pg_attribute_relid_attnum_index')
  } catch (err: any) {
    errors.push(`REINDEX pg_attribute: ${err?.message?.substring(0, 200)}`)
    results.push(`Failed: ${err?.message?.substring(0, 150)}`)
  }

  // Step 2: REINDEX all system catalogs
  results.push('--- Step 2: REINDEX SYSTEM ---')
  try {
    await db.$executeRawUnsafe(`REINDEX SYSTEM`)
    results.push('REINDEX SYSTEM completed')
  } catch (err: any) {
    errors.push(`REINDEX SYSTEM: ${err?.message?.substring(0, 200)}`)
    results.push(`Failed: ${err?.message?.substring(0, 150)}`)
  }

  // Step 3: REINDEX DATABASE
  results.push('--- Step 3: REINDEX DATABASE ---')
  try {
    await db.$executeRawUnsafe(`REINDEX DATABASE`)
    results.push('REINDEX DATABASE completed')
  } catch (err: any) {
    errors.push(`REINDEX DATABASE: ${err?.message?.substring(0, 200)}`)
    results.push(`Failed: ${err?.message?.substring(0, 150)}`)
  }

  // Step 4: VACUUM FULL (reclaims space + rebuilds tables)
  results.push('--- Step 4: VACUUM FULL ANALYZE ---')
  try {
    await db.$executeRawUnsafe(`VACUUM FULL ANALYZE`)
    results.push('VACUUM FULL ANALYZE completed')
  } catch (err: any) {
    errors.push(`VACUUM FULL: ${err?.message?.substring(0, 200)}`)
    results.push(`Failed: ${err?.message?.substring(0, 150)}`)
  }

  // Step 5: Test if queries work now
  results.push('--- Step 5: Test queries ---')
  try {
    const result = await db.$queryRawUnsafe(`SELECT count(*)::int as count FROM "User"`)
    results.push(`User table: ${result[0]?.count || 0} rows`)
  } catch (err: any) {
    errors.push(`User query: ${err?.message?.substring(0, 200)}`)
    results.push(`User query failed: ${err?.message?.substring(0, 150)}`)
  }

  try {
    const result = await db.$queryRawUnsafe(`SELECT count(*)::int as count FROM "Trade"`)
    results.push(`Trade table: ${result[0]?.count || 0} rows`)
  } catch (err: any) {
    errors.push(`Trade query: ${err?.message?.substring(0, 200)}`)
    results.push(`Trade query failed: ${err?.message?.substring(0, 150)}`)
  }

  // Get DB size
  let dbSize = '?'
  try {
    const sizeResult = await db.$queryRawUnsafe<{ size: string }[]>(
      `SELECT pg_size_pretty(pg_database_size(current_database())) as size`,
    )
    dbSize = sizeResult[0]?.size || '?'
  } catch {}

  return NextResponse.json({
    success: errors.length === 0,
    results,
    errors,
    dbSize,
  })
}
