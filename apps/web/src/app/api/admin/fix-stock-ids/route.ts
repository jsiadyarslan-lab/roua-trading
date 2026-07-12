import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: NextRequest) {
  const adminToken = request.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_PASSWORD
  if (!adminToken || adminToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: string[] = []
  const errors: string[] = []

  try {
    // 1. Create sequence
    results.push('Creating sequence...')
    try {
      await db.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS stock_analyses_id_seq`)
      results.push('Sequence created')
    } catch (err: any) {
      errors.push(`Sequence: ${err?.message?.substring(0, 150)}`)
    }

    // 2. Update NULL ids using sequence
    results.push('Generating IDs...')
    try {
      const updateResult = await db.$executeRawUnsafe(`
        UPDATE "stock_analyses" SET "id" = 'sa_' || nextval('stock_analyses_id_seq')::text 
        WHERE "id" IS NULL
      `)
      results.push(`Updated ${updateResult} rows`)
    } catch (err: any) {
      errors.push(`Update: ${err?.message?.substring(0, 200)}`)
    }

    // 3. Set NOT NULL
    try {
      await db.$executeRawUnsafe(`ALTER TABLE "stock_analyses" ALTER COLUMN "id" SET NOT NULL`)
      results.push('NOT NULL added')
    } catch (err: any) {
      errors.push(`NOT NULL: ${err?.message?.substring(0, 150)}`)
    }

    // 4. Add primary key (remove duplicates first)
    results.push('Adding primary key...')
    try {
      await db.$executeRawUnsafe(`ALTER TABLE "stock_analyses" ADD PRIMARY KEY ("id")`)
      results.push('Primary key added')
    } catch (err: any) {
      results.push('Removing duplicates...')
      try {
        await db.$executeRawUnsafe(`DELETE FROM "stock_analyses" a USING "stock_analyses" b WHERE a.id = b.id AND a.ctid < b.ctid`)
        await db.$executeRawUnsafe(`ALTER TABLE "stock_analyses" ADD PRIMARY KEY ("id")`)
        results.push('Primary key added after dedup')
      } catch (err2: any) {
        errors.push(`PK: ${err2?.message?.substring(0, 200)}`)
      }
    }

    // 5. Verify
    const countResult = await db.$queryRawUnsafe<{ count: number }[]>(`SELECT count(*)::int as count FROM "stock_analyses"`)
    results.push(`Final count: ${countResult[0]?.count?.toLocaleString() || 0}`)

    return NextResponse.json({ success: true, results, errors })
  } catch (err: any) {
    errors.push(`Fatal: ${err?.message?.substring(0, 300)}`)
    return NextResponse.json({ success: false, results, errors }, { status: 500 })
  }
}
