// V484: Diagnostic endpoint — يكشف بالضبط أين تفشل سلسلة جلب الصفقات
// GET /api/assistant/debug?userId=XXX
// يرجع كل خطوة + نتيجتها

import { NextRequest, NextResponse } from 'next/server';
import { db, ensureDbReady } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const sessionToken = request.headers.get('cookie')?.match(/roua_session=([^;]+)/)?.[1];

  const result: any = {
    timestamp: new Date().toISOString(),
    steps: [],
  };

  // Step 1: DB ready?
  try {
    const dbReady = await ensureDbReady();
    result.steps.push({ step: '1_db_ready', success: dbReady, value: dbReady });
  } catch (e: any) {
    result.steps.push({ step: '1_db_ready', success: false, error: e.message });
  }

  // Step 2: userId from query param
  result.steps.push({ step: '2_userId_from_query', success: !!userId, value: userId || 'missing' });

  // Step 3: sessionToken from cookie
  result.steps.push({ step: '3_sessionToken_from_cookie', success: !!sessionToken, value: sessionToken ? sessionToken.slice(0, 10) + '...' : 'missing' });

  // Step 4: If no userId but have session, extract userId from DB
  let effectiveUserId = userId;
  if (!effectiveUserId && sessionToken) {
    try {
      const session = await (db as any).session.findUnique({
        where: { token: sessionToken },
        select: { userId: true, isActive: true, expiresAt: true },
      });
      if (session) {
        result.steps.push({
          step: '4_session_lookup',
          success: true,
          value: { userId: session.userId, isActive: session.isActive, expired: session.expiresAt < new Date() },
        });
        if (session.isActive && session.expiresAt > new Date()) {
          effectiveUserId = session.userId;
        }
      } else {
        result.steps.push({ step: '4_session_lookup', success: false, error: 'Session not found in DB' });
      }
    } catch (e: any) {
      result.steps.push({ step: '4_session_lookup', success: false, error: e.message });
    }
  } else {
    result.steps.push({ step: '4_session_lookup', success: true, value: 'skipped (userId provided or no cookie)' });
  }

  // Step 5: Query positions
  if (effectiveUserId) {
    try {
      const positions = await (db as any).position.findMany({
        where: { userId: effectiveUserId, status: 'OPEN' },
        orderBy: { openedAt: 'desc' },
        select: {
          id: true, symbol: true, side: true,
          entryPrice: true, currentPrice: true, quantity: true,
          unrealizedPnl: true, stopLoss: true, takeProfit: true,
          openedAt: true, source: true,
        },
      });
      result.steps.push({
        step: '5_positions_query',
        success: true,
        count: positions.length,
        positions: positions.slice(0, 5).map((p: any) => ({
          symbol: p.symbol,
          side: p.side,
          entryPrice: Number(p.entryPrice),
          unrealizedPnl: Number(p.unrealizedPnl),
          source: p.source,
        })),
      });
    } catch (e: any) {
      result.steps.push({ step: '5_positions_query', success: false, error: e.message });
    }
  } else {
    result.steps.push({ step: '5_positions_query', success: false, error: 'No effectiveUserId' });
  }

  // Step 6: Query closed positions count
  if (effectiveUserId) {
    try {
      const closedCount = await (db as any).position.count({
        where: { userId: effectiveUserId, status: 'CLOSED' },
      });
      result.steps.push({ step: '6_closed_count', success: true, count: closedCount });
    } catch (e: any) {
      result.steps.push({ step: '6_closed_count', success: false, error: e.message });
    }
  }

  // Step 7: Query agentSettings (balance)
  if (effectiveUserId) {
    try {
      const settings = await (db as any).agentSettings.findUnique({
        where: { userId: effectiveUserId },
        select: { paperBalance: true },
      });
      result.steps.push({
        step: '7_agentSettings',
        success: !!settings,
        value: settings ? { paperBalance: Number(settings.paperBalance) } : 'not found',
      });
    } catch (e: any) {
      result.steps.push({ step: '7_agentSettings', success: false, error: e.message });
    }
  }

  // Step 8: Check if Prisma models exist
  try {
    const modelNames = Object.keys(db).filter(k => !k.startsWith('_') && !k.startsWith('$'));
    result.steps.push({
      step: '8_prisma_models',
      success: true,
      models: modelNames.filter(m => ['position', 'session', 'agentSettings', 'tradingBrief'].includes(m)),
    });
  } catch (e: any) {
    result.steps.push({ step: '8_prisma_models', success: false, error: e.message });
  }

  result.effectiveUserId = effectiveUserId || 'missing';
  result.allStepsPassed = result.steps.every((s: any) => s.success);

  return NextResponse.json(result, { status: 200 });
}
