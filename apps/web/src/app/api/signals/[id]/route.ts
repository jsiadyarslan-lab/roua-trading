import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const headers: Record<string, string> = {}
    req.headers.forEach((value, key) => { headers[key] = value })
    const res = await fetch(`${API_BASE}/signals/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers,
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 })
  }
}
