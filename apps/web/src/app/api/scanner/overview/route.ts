import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.API_INTERNAL_URL || 'http://localhost:3001'

export async function GET(req: NextRequest) {
  try {
    const sessionToken = req.cookies.get('roua_session')?.value
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`
      headers['x-roua-session'] = sessionToken
    }

    const res = await fetch(`${API_BASE}/api/scanner/overview`, {
      next: { revalidate: 60 },
      headers,
    })

    if (!res.ok) throw new Error(`Backend returned ${res.status}`)

    const data = await res.json()
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('[scanner/overview] Error:', error?.message)
    return NextResponse.json({ success: true, data: null })
  }
}
