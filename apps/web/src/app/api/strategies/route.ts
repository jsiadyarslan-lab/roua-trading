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

export async function GET() {
  try {
    await ensureDbReady()

    const reports = await db.strategyReport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    const decodedReports = reports.map(r => ({
      ...r,
      date: formatPublishedAt(r.publishedAt),
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
    return NextResponse.json({ success: false, error: 'Failed to fetch strategy reports' }, { status: 500 })
  }
}

function formatPublishedAt(date: Date) {
  const diffMs = Date.now() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

  if (diffHours < 24) return 'اليوم'
  if (diffHours < 48) return 'أمس'

  return date.toLocaleDateString('ar-SA', {
    month: 'short',
    day: 'numeric',
  })
}
