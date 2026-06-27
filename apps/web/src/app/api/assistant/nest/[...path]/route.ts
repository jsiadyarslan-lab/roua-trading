import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import crypto from 'crypto'

/**
 * V564: Custom proxy that strips '/nest' prefix before forwarding to NestJS.
 * The generic createNestJSProxyHandlers forwarded the full pathname
 * (/api/assistant/nest/chat) which NestJS rejected with 404.
 * This proxy rewrites: /api/assistant/nest/* → /api/assistant/*
 */

export const dynamic = 'force-dynamic'

const rawTarget = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';
const API_TARGET = rawTarget.includes('http://api:') ? 'http://127.0.0.1:3001' : rawTarget;

async function getOrCreateSession(request: NextRequest): Promise<string | null> {
  try {
    const sessionCookie = request.headers.get('cookie') || '';
    const rouaSession = sessionCookie.match(/roua_session=([^;]+)/)?.[1];
    if (rouaSession) return rouaSession;
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
    const headerSession = request.headers.get('x-roua-session');
    if (headerSession) return headerSession;

    const dbReady = await ensureDbReady();
    if (!dbReady) return null;

    const guestId = `guest-${crypto.randomUUID()}`;
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await (db as any).session.create({ data: { token, userId: guestId, isActive: true, expiresAt, ipAddress: '127.0.0.1', userAgent: 'Roua-Proxy' } });
    await (db as any).user.create({ data: { id: guestId, email: `${guestId}@roua.auto`, displayName: 'Guest' } }).catch(() => {});
    return token;
  } catch { return null; }
}

async function handleProxy(request: NextRequest, method: string): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const nestjsPath = pathname.replace('/api/assistant/nest/', '/api/assistant/');
  const targetUrl = `${API_TARGET}${nestjsPath}${search}`;

  const token = await getOrCreateSession(request);
  if (!token) return NextResponse.json({ error: 'Auth failed' }, { status: 401 });

  try {
    const body = (method === 'GET' || method === 'DELETE') ? undefined : await request.text();
    const response = await fetch(targetUrl, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-roua-session': token, 'Cookie': `roua_session=${token}` },
      body,
      signal: AbortSignal.timeout(45_000),
    });
    const responseBody = await response.text();
    return new NextResponse(responseBody, { status: response.status, headers: { 'Content-Type': response.headers.get('content-type') || 'application/json', 'Set-Cookie': `roua_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800` } });
  } catch (error: any) {
    return NextResponse.json({ error: 'NestJS unavailable', details: error?.message?.slice(0, 100) }, { status: 502 });
  }
}

export async function GET(request: NextRequest) { return handleProxy(request, 'GET'); }
export async function POST(request: NextRequest) { return handleProxy(request, 'POST'); }
export async function PUT(request: NextRequest) { return handleProxy(request, 'PUT'); }
export async function PATCH(request: NextRequest) { return handleProxy(request, 'PATCH'); }
export async function DELETE(request: NextRequest) { return handleProxy(request, 'DELETE'); }
