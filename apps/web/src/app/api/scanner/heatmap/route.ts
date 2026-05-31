import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category') || ''
    const params = new URLSearchParams()
    if (category) params.set('category', category)

    // FIX: Forward session token for auth — check cookie, Authorization header, and custom header
    let sessionToken = req.cookies.get('roua_session')?.value
    if (!sessionToken) {
      const authHeader = req.headers.get('authorization')
      if (authHeader?.startsWith('Bearer ')) sessionToken = authHeader.substring(7).trim()
    }
    if (!sessionToken) {
      const customHeader = req.headers.get('x-roua-session')
      if (customHeader?.trim()) sessionToken = customHeader.trim()
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`
      headers['x-roua-session'] = sessionToken
    }

    const res = await fetch(`${API_BASE}/api/scanner/heatmap?${params.toString()}`, {
      next: { revalidate: 60 },
      headers,
    })

    if (!res.ok) throw new Error(`Backend returned ${res.status}`)

    const data = await res.json()
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('[scanner/heatmap] Error:', error?.message)
    return NextResponse.json({ success: false, data: [], error: 'Failed to load heatmap data' }, { status: 502 })
  }
}
