import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.SCANNER_API_BASE || 'http://127.0.0.1:3001'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category') || ''
    const params = new URLSearchParams()
    if (category) params.set('category', category)

    const res = await fetch(`${API_BASE}/api/scanner/heatmap?${params.toString()}`, {
      next: { revalidate: 60 },
      headers: { 'Content-Type': 'application/json' },
    })

    if (!res.ok) throw new Error(`Backend returned ${res.status}`)

    const data = await res.json()
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('[scanner/heatmap] Error:', error?.message)
    return NextResponse.json({ success: true, data: [] })
  }
}
