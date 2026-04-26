import { NextResponse } from 'next/server'

const API_BASE = process.env.SCANNER_API_BASE || 'http://127.0.0.1:3001'

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/api/scanner/overview`, {
      next: { revalidate: 60 },
      headers: { 'Content-Type': 'application/json' },
    })

    if (!res.ok) throw new Error(`Backend returned ${res.status}`)

    const data = await res.json()
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('[scanner/overview] Error:', error?.message)
    return NextResponse.json({ success: true, data: null })
  }
}
