import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_URL || 'http://localhost:3001/api';

export async function GET(req: NextRequest) {
  try {
    const sessionToken = req.cookies.get('roua_session')?.value || 
                         req.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!sessionToken) {
      return NextResponse.json({ error: 'غير مصادق' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol') || '';
    const status = searchParams.get('status') || '';
    const limit = searchParams.get('limit') || '50';
    
    const params = new URLSearchParams();
    if (symbol) params.set('symbol', symbol);
    if (status) params.set('status', status);
    params.set('limit', limit);

    const res = await fetch(`${API_BASE}/trading/orders?${params.toString()}`, {
      headers: {
        'Cookie': `roua_session=${sessionToken}`,
        'Authorization': `Bearer ${sessionToken}`,
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error('Trading orders GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sessionToken = req.cookies.get('roua_session')?.value || 
                         req.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!sessionToken) {
      return NextResponse.json({ error: 'غير مصادق' }, { status: 401 });
    }

    const body = await req.json();

    const res = await fetch(`${API_BASE}/trading/orders`, {
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
    console.error('Trading orders POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
