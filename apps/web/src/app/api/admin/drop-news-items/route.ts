import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const adminToken = request.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_PASSWORD
  if (!adminToken || adminToken !== expectedToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "news_items" CASCADE`)
    return NextResponse.json({ success: true, message: 'news_items dropped' })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message?.substring(0, 200) }, { status: 500 })
  }
}
