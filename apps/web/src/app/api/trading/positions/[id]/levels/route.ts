import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_URL || 'http://localhost:3001/api';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sessionToken = req.cookies.get('roua_session')?.value || 
                         req.headers.get('authorization')?.replace('Bearer ', '');

    if (!sessionToken) {
      return NextResponse.json({ error: 'غير مصادق' }, { status: 401 });
    }

    const body = await req.json();

    const res = await fetch(`${API_BASE}/trading/positions/${id}/levels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `roua_session=${sessionToken}`,
        'Authorization': `Bearer ${sessionToken}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
