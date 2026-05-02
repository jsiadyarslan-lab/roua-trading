import { NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

/**
 * Safe JSON.parse with fallback value
 */
function safeJsonParse(jsonString: string, fallback: any): any {
  try {
    return JSON.parse(jsonString)
  } catch {
    return fallback
  }
}

/**
 * Safe date formatter that handles null/undefined values.
 */
function safeFormatDate(date: Date | null | undefined): string {
  if (!date) return '—'
  try {
    const diffMs = Date.now() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

    if (diffHours < 24) return 'اليوم'
    if (diffHours < 48) return 'أمس'

    return date.toLocaleDateString('ar-SA', {
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return '—'
  }
}

export async function GET() {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      console.warn('[strategies] DB not ready')
      return NextResponse.json(
        { success: false, error: 'Service unavailable' },
        { status: 503 },
      )
    }

    let reports: any[] = []
    try {
      reports = await db.strategyReport.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
    } catch (queryError: any) {
      // Table might not exist yet (P2021) or other schema issues
      const code = queryError?.code || ''
      if (code === 'P2021' || code === 'P2022' || queryError?.message?.includes('does not exist')) {
        console.warn('[strategies] StrategyReport table not found')
        return NextResponse.json(
          { success: false, error: 'Service unavailable' },
          { status: 503 },
        )
      }
      // Unexpected error — log and return proper error
      console.error('[strategies] Query error:', code, queryError?.message)
      return NextResponse.json(
        { success: false, error: 'Service unavailable' },
        { status: 500 },
      )
    }

    const decodedReports = reports.map(r => ({
      ...r,
      date: safeFormatDate(r.publishedAt),
      decision: safeJsonParse(r.decision, {}),
      matrix: safeJsonParse(r.matrix, []),
      risk: safeJsonParse(r.risk, {}),
      flow: safeJsonParse(r.flow, {}),
      deepAnalysis: safeJsonParse(r.deepAnalysis, []),
    }))

    return NextResponse.json({
      success: true,
      data: decodedReports,
      meta: {
        count: decodedReports.length,
        isEmpty: decodedReports.length === 0,
      },
    })
  } catch (error) {
    console.error('API Error: GET /api/strategies', error)
    return NextResponse.json(
      { success: false, error: 'Service unavailable' },
      { status: 500 },
    )
  }
}
