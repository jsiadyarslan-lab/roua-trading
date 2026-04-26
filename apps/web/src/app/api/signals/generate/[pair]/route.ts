import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export async function POST(req: NextRequest, { params }: { params: Promise<{ pair: string }> }) {
  try {
    const { pair } = await params
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    req.headers.forEach((value, key) => { headers[key] = value })
    const body = await req.text()
    const res = await fetch(`${API_BASE}/signals/generate/${encodeURIComponent(pair)}`, {
      method: 'POST',
      headers,
      body,
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 })
  }
}
