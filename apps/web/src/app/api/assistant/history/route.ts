// ─── V478: Chat History API for roua-trading ───────────────────
// GET  /api/assistant/history — قائمة كل جلسات المحادثة للمستخدم
// POST /api/assistant/history — حفظ رسالة جديدة
// DELETE /api/assistant/history — حذف كل المحفوظات
//
// يستخدم Prisma (Position table) + جدول chat_sessions جديد

import { NextRequest, NextResponse } from 'next/server';
import { db, ensureDbReady } from '@/lib/db';

export const dynamic = 'force-dynamic';

// V478: استخراج userId من roua-trading session (cookie-based)
async function getUserIdFromRequest(request: NextRequest): Promise<string | null> {
  try {
    // استخراج roua_session cookie
    const sessionCookie = request.headers.get('cookie') || '';
    const rouaSession = sessionCookie.match(/roua_session=([^;]+)/)?.[1];
    if (!rouaSession) return null;

    // استدعاء NestJS للحصول على userId
    const NESTJS_API = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';
    const res = await fetch(`${NESTJS_API}/api/auth/me`, {
      headers: {
        'Cookie': `roua_session=${rouaSession}`,
        'x-roua-session': rouaSession,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data?.user?.id || data?.id || null;
  } catch {
    return null;
  }
}

// GET — قائمة كل الجلسات
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const dbReady = await ensureDbReady();
    if (!dbReady) {
      return NextResponse.json({ sessions: [] });
    }

    // V478: استخدم جدول chat_sessions (قد لا يكون موجودًا)
    // نحاول إنشاءه ديناميكيًا إذا لم يكن موجودًا
    try {
      const sessions = await db.$queryRaw`
        SELECT id, title, locale, "messageCount", "createdAt", "updatedAt"
        FROM chat_sessions
        WHERE "userId" = ${userId}
        ORDER BY "updatedAt" DESC
        LIMIT 50
      ` as any[];

      return NextResponse.json({ sessions: sessions || [] });
    } catch (dbErr) {
      // الجدول غير موجود — ارجع قائمة فارغة
      return NextResponse.json({ sessions: [] });
    }
  } catch (error: any) {
    console.error('[History API] GET error:', error?.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST — حفظ رسالة أو إنشاء جلسة جديدة
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { action, sessionId, role, content, locale, title, sources, toolsUsed } = body;

    const dbReady = await ensureDbReady();
    if (!dbReady) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    // إنشاء جدول chat_sessions إذا لم يكن موجودًا
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id TEXT PRIMARY KEY,
          "userId" TEXT NOT NULL,
          locale TEXT NOT NULL DEFAULT 'ar',
          title TEXT,
          "pageUrl" TEXT,
          "messageCount" INTEGER DEFAULT 0,
          "createdAt" TIMESTAMP DEFAULT NOW(),
          "updatedAt" TIMESTAMP DEFAULT NOW()
        )
      `);
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id TEXT PRIMARY KEY,
          "sessionId" TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          sources TEXT,
          "toolsUsed" TEXT,
          "createdAt" TIMESTAMP DEFAULT NOW()
        )
      `);
    } catch (createErr) {
      // قد تكون الجداول موجودة بالفعل — تجاهل الخطأ
    }

    if (action === 'create_session') {
      const newSessionId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      try {
        await db.$executeRawUnsafe(`
          INSERT INTO chat_sessions (id, "userId", locale, title, "messageCount", "createdAt", "updatedAt")
          VALUES ($1, $2, $3, $4, 0, NOW(), NOW())
        `, newSessionId, userId, locale || 'ar', title || 'محادثة جديدة');
        return NextResponse.json({ sessionId: newSessionId });
      } catch (err) {
        return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
      }
    }

    if (action === 'save_message' && sessionId) {
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      try {
        await db.$executeRawUnsafe(`
          INSERT INTO chat_messages (id, "sessionId", role, content, sources, "toolsUsed", "createdAt")
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, messageId, sessionId, role, content, JSON.stringify(sources || []), JSON.stringify(toolsUsed || []));

        await db.$executeRawUnsafe(`
          UPDATE chat_sessions
          SET "messageCount" = "messageCount" + 1, "updatedAt" = NOW()
          WHERE id = $1
        `, sessionId);

        return NextResponse.json({ success: true, messageId });
      } catch (err) {
        return NextResponse.json({ error: 'Failed to save message' }, { status: 500 });
      }
    }

    if (action === 'load_session' && sessionId) {
      try {
        const messages = await db.$queryRawUnsafe(`
          SELECT role, content, sources, "toolsUsed", "createdAt"
          FROM chat_messages
          WHERE "sessionId" = $1
          ORDER BY "createdAt" ASC
        `, sessionId) as any[];

        const session = await db.$queryRawUnsafe(`
          SELECT id, title, locale, "messageCount", "createdAt", "updatedAt"
          FROM chat_sessions
          WHERE id = $1 AND "userId" = $2
        `, sessionId, userId) as any[];

        if (!session || session.length === 0) {
          return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        return NextResponse.json({
          session: session[0],
          messages: messages || [],
        });
      } catch (err) {
        return NextResponse.json({ error: 'Failed to load session' }, { status: 500 });
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('[History API] POST error:', error?.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE — حذف جلسة أو كل المحفوظات
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    const dbReady = await ensureDbReady();
    if (!dbReady) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    if (sessionId) {
      // حذف جلسة محددة
      try {
        await db.$executeRawUnsafe(`
          DELETE FROM chat_messages WHERE "sessionId" = $1
        `, sessionId);
        await db.$executeRawUnsafe(`
          DELETE FROM chat_sessions WHERE id = $1 AND "userId" = $2
        `, sessionId, userId);
        return NextResponse.json({ success: true });
      } catch (err) {
        return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
      }
    } else {
      // حذف كل محفوظات المستخدم
      try {
        const sessionIds = await db.$queryRawUnsafe(`
          SELECT id FROM chat_sessions WHERE "userId" = $1
        `, userId) as any[];

        if (sessionIds.length > 0) {
          const ids = sessionIds.map(s => s.id);
          await db.$executeRawUnsafe(`
            DELETE FROM chat_messages WHERE "sessionId" = ANY($1::text[])
          `, ids);
        }

        await db.$executeRawUnsafe(`
          DELETE FROM chat_sessions WHERE "userId" = $1
        `, userId);

        return NextResponse.json({ success: true, deletedCount: sessionIds.length });
      } catch (err) {
        return NextResponse.json({ error: 'Failed to clear history' }, { status: 500 });
      }
    }
  } catch (error: any) {
    console.error('[History API] DELETE error:', error?.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
