import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_URL || 'http://localhost:3001/api';

export async function GET(req: NextRequest) {
  try {
    const sessionToken = req.cookies.get('roua_session')?.value || 
                         req.headers.get('authorization')?.replace('Bearer ', '');

    if (!sessionToken) {
      return NextResponse.json({ error: 'غير مصادق' }, { status: 401 });
    }

    const res = await fetch(`${API_BASE}/trading/positions/summary`, {
      headers: {
        'Cookie': `roua_session=${sessionToken}`,
        'Authorization': `Bearer ${sessionToken}`,
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
