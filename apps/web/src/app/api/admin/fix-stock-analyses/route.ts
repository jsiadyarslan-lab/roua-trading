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
    // 1. Check current columns
    const colsResult = await db.$queryRawUnsafe<{ column_name: string; data_type: string; is_nullable: string }[]>(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'stock_analyses' AND table_schema = 'public' ORDER BY ordinal_position`
    )
    
    const currentCols = colsResult.map(c => c.column_name)
    results.push(`Current columns: ${currentCols.length}`)
    
    // 2. Add 'id' column if missing (PRIMARY KEY)
    if (!currentCols.includes('id')) {
      results.push('Adding id column...')
      try {
        await db.$executeRawUnsafe(`ALTER TABLE "stock_analyses" ADD COLUMN IF NOT EXISTS "id" TEXT`)
        // Generate IDs from slug
        await db.$executeRawUnsafe(`
          UPDATE "stock_analyses" SET "id" = COALESCE(slug, 'sa_' || cast(row_number() OVER () as text))
          WHERE "id" IS NULL
        `)
        await db.$executeRawUnsafe(`ALTER TABLE "stock_analyses" ALTER COLUMN "id" SET NOT NULL`)
        await db.$executeRawUnsafe(`ALTER TABLE "stock_analyses" ADD PRIMARY KEY ("id")`)
        results.push('id column added with primary key')
      } catch (err: any) {
        errors.push(`id column: ${err?.message?.substring(0, 200)}`)
      }
    } else {
      results.push('id column already exists')
      const pkResult = await db.$queryRawUnsafe<{ constraint_name: string }[]>(
        `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'stock_analyses' AND constraint_type = 'PRIMARY KEY'`
      )
      if (pkResult.length === 0) {
        try {
          await db.$executeRawUnsafe(`ALTER TABLE "stock_analyses" ADD PRIMARY KEY ("id")`)
          results.push('Primary key added')
        } catch (err: any) {
          errors.push(`PK: ${err?.message?.substring(0, 200)}`)
        }
      }
    }

    // 3. Add missing columns
    const expectedCols = [
      { name: 'symbol', type: 'TEXT' },
      { name: 'createdAt', type: 'TIMESTAMP' },
      { name: 'updatedAt', type: 'TIMESTAMP' },
    ]
    
    for (const col of expectedCols) {
      if (!currentCols.includes(col.name)) {
        try {
          await db.$executeRawUnsafe(`ALTER TABLE "stock_analyses" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type}`)
          results.push(`${col.name} added`)
        } catch (err: any) {
          errors.push(`${col.name}: ${err?.message?.substring(0, 150)}`)
        }
      }
    }

    // 4. Create indexes
    const indexes = [
      { name: 'stock_analyses_slug_idx', col: 'slug' },
      { name: 'stock_analyses_createdAt_idx', col: '"createdAt"' },
      { name: 'stock_analyses_assetClass_idx', col: 'assetClass' },
      { name: 'stock_analyses_isPublished_idx', col: 'isPublished' },
    ]
    
    for (const idx of indexes) {
      try {
        await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "${idx.name}" ON "stock_analyses"(${idx.col})`)
      } catch {}
    }
    results.push('Indexes created')

    // 5. Final count
    const countResult = await db.$queryRawUnsafe<{ count: number }[]>(
      `SELECT count(*)::int as count FROM "stock_analyses"`
    )
    results.push(`Final count: ${countResult[0]?.count?.toLocaleString() || 0}`)

    return NextResponse.json({ success: true, results, errors })
  } catch (err: any) {
    errors.push(`Fatal: ${err?.message?.substring(0, 300)}`)
    return NextResponse.json({ success: false, results, errors }, { status: 500 })
  }
}
