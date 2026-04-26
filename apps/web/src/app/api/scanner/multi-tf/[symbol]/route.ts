import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.SCANNER_API_BASE || 'http://127.0.0.1:3001'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await params
    const res = await fetch(`${API_BASE}/api/scanner/multi-tf/${encodeURIComponent(symbol)}`, {
      next: { revalidate: 120 },
      headers: { 'Content-Type': 'application/json' },
    })

    if (!res.ok) throw new Error(`Backend returned ${res.status}`)

    const data = await res.json()
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('[scanner/multi-tf] Error:', error?.message)
    return NextResponse.json({ success: false, error: error?.message })
  }
}
