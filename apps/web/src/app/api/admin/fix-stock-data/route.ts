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
    // 1. Fix isPublished: convert text to boolean
    results.push('Fixing isPublished type...')
    try {
      const colInfo = await db.$queryRawUnsafe<{ data_type: string }[]>(
        `SELECT data_type FROM information_schema.columns WHERE table_name = 'stock_analyses' AND column_name = 'isPublished'`
      )
      const colType = colInfo[0]?.data_type
      results.push(`Current type: ${colType}`)

      if (colType === 'text') {
        await db.$executeRawUnsafe(`UPDATE "stock_analyses" SET "isPublished" = 'true' WHERE "isPublished" IS NULL OR "isPublished" = ''`)
        await db.$executeRawUnsafe(`ALTER TABLE "stock_analyses" ALTER COLUMN "isPublished" TYPE boolean USING "isPublished"::boolean`)
        results.push('Converted to boolean')
      } else {
        results.push('Already boolean')
      }
    } catch (err: any) {
      errors.push(`isPublished: ${err?.message?.substring(0, 200)}`)
    }

    // 2. Set locale = 'ar'
    results.push('Setting locale=ar...')
    try {
      const result = await db.$executeRawUnsafe(`UPDATE "stock_analyses" SET "locale" = 'ar' WHERE "locale" IS NULL OR "locale" = '' OR "locale" = 'en'`)
      results.push(`Updated ${result} rows`)
    } catch (err: any) {
      errors.push(`locale: ${err?.message?.substring(0, 200)}`)
    }

    // 3. Generate slugs in batches
    results.push('Generating slugs...')
    try {
      let totalUpdated = 0
      const batchSize = 5000
      while (true) {
        try {
          const result = await db.$executeRawUnsafe(`
            UPDATE "stock_analyses" SET "slug" = 'sa-' || substr(md5(COALESCE("title",'x') || random()::text), 1, 12)
            WHERE ctid IN (SELECT ctid FROM "stock_analyses" WHERE "slug" IS NULL OR "slug" = '' LIMIT ${batchSize})
          `)
          if (result === 0) break
          totalUpdated += result
          if (totalUpdated % 50000 === 0) results.push(`  ${totalUpdated.toLocaleString()} slugs`)
        } catch { break }
      }
      results.push(`Generated ${totalUpdated.toLocaleString()} slugs`)
    } catch (err: any) {
      errors.push(`slug: ${err?.message?.substring(0, 200)}`)
    }

    results.push('Done!')
    return NextResponse.json({ success: true, results, errors })
  } catch (err: any) {
    errors.push(`Fatal: ${err?.message?.substring(0, 300)}`)
    return NextResponse.json({ success: false, results, errors }, { status: 500 })
  }
}
