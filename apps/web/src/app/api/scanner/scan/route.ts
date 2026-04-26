import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.SCANNER_API_BASE || 'http://127.0.0.1:3001'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const timeframe = searchParams.get('timeframe') || '1h'
    const category = searchParams.get('category') || ''

    const params = new URLSearchParams({ timeframe })
    if (category) params.set('category', category)

    const res = await fetch(`${API_BASE}/api/scanner/scan?${params.toString()}`, {
      next: { revalidate: 60 },
      headers: { 'Content-Type': 'application/json' },
    })

    if (!res.ok) {
      throw new Error(`Backend returned ${res.status}`)
    }

    const data = await res.json()
    return NextResponse.json({ success: true, ...data })
  } catch (error: any) {
    console.error('[scanner/scan] Error:', error?.message)
    return NextResponse.json({
      success: true,
      items: [],
      meta: {
        timeframe: '1h',
        category: 'ALL',
        symbolsScanned: 0,
        source: 'fallback',
        timestamp: new Date().toISOString(),
        nextScanInSeconds: 60,
        error: 'تعذر الاتصال بخادم التحليل',
      },
    })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const timeframe = searchParams.get('timeframe') || '1h'
    const category = searchParams.get('category') || ''

    const params = new URLSearchParams({ timeframe })
    if (category) params.set('category', category)

    const res = await fetch(`${API_BASE}/api/scanner/run?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!res.ok) throw new Error(`Backend returned ${res.status}`)

    const data = await res.json()
    return NextResponse.json({ success: true, ...data })
  } catch (error: any) {
    console.error('[scanner/run] Error:', error?.message)
    return NextResponse.json({ success: false, error: error?.message })
  }
}
