import { NextRequest, NextResponse } from 'next/server'

/**
 * FIX: Changed SCANNER_API_BASE → API_INTERNAL_URL for consistency.
 * All other routes use API_INTERNAL_URL. Having a separate env var
 * for the scanner is unnecessary and error-prone.
 *
 * FIX: Added session token forwarding for auth — the NestJS scanner
 * controller requires AuthGuard, so we must pass the session token.
 */

const API_BASE = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const timeframe = searchParams.get('timeframe') || '1h'
    const category = searchParams.get('category') || ''

    const params = new URLSearchParams({ timeframe })
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

    const res = await fetch(`${API_BASE}/api/scanner/scan?${params.toString()}`, {
      next: { revalidate: 60 },
      headers,
    })

    if (!res.ok) {
      throw new Error(`Backend returned ${res.status}`)
    }

    const data = await res.json()
    return NextResponse.json({ success: true, ...data })
  } catch (error: any) {
    console.error('[scanner/scan] Error:', error?.message)
    return NextResponse.json(
      { success: false, error: 'Service unavailable', message: error?.message || 'Failed to connect to analysis server' },
      { status: 502 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const timeframe = searchParams.get('timeframe') || '1h'
    const category = searchParams.get('category') || ''

    const params = new URLSearchParams({ timeframe })
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

    const res = await fetch(`${API_BASE}/api/scanner/run?${params.toString()}`, {
      method: 'POST',
      headers,
    })

    if (!res.ok) throw new Error(`Backend returned ${res.status}`)

    const data = await res.json()
    return NextResponse.json({ success: true, ...data })
  } catch (error: any) {
    console.error('[scanner/run] Error:', error?.message)
    // FIX: Return proper error status instead of 200 with success:false
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to connect to scanner server' },
      { status: 502 },
    )
  }
}
