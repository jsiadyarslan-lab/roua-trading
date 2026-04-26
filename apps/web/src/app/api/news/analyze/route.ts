import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/news/analyze
 * Analyze a news text manually using AI
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, symbol } = body;

    if (!text) {
      return NextResponse.json(
        { success: false, error: 'النص مطلوب للتحليل' },
        { status: 400 },
      );
    }

    // Try NestJS first
    const apiTarget = process.env.API_INTERNAL_URL || 'http://localhost:3001';
    const sessionToken = request.cookies.get('roua_session')?.value;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      cookie: request.headers.get('cookie') || '',
    };
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    try {
      const res = await fetch(`${apiTarget}/api/news/analyze`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text, symbol }),
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          return NextResponse.json(data);
        }
      }
    } catch {
      // NestJS unavailable, use local analysis
    }

    // Local analysis fallback
    const lower = text.toLowerCase();
    let sentimentScore = 0;
    const affectedAssets: string[] = [];

    const positiveWords = ['surge', 'rally', 'bull', 'gain', 'rise', 'soar', 'jump', 'upgrade', 'adopt', 'approval', 'صعود', 'ارتفاع', 'إيجابي'];
    const negativeWords = ['crash', 'dump', 'bear', 'fall', 'drop', 'decline', 'hack', 'ban', 'regulate', 'risk', 'loss', 'هبوط', 'انخفاض', 'سلبي'];

    for (const w of positiveWords) if (lower.includes(w)) sentimentScore += 0.15;
    for (const w of negativeWords) if (lower.includes(w)) sentimentScore -= 0.15;

    if (/btc|bitcoin/i.test(lower)) affectedAssets.push('BTC');
    if (/eth|ethereum/i.test(lower)) affectedAssets.push('ETH');
    if (/sol|solana/i.test(lower)) affectedAssets.push('SOL');

    sentimentScore = Math.max(-1, Math.min(1, sentimentScore));
    const sentimentLabel = sentimentScore > 0.2 ? 'positive' : sentimentScore < -0.2 ? 'negative' : 'neutral';

    return NextResponse.json({
      success: true,
      data: {
        originalText: text,
        translatedText: text,
        analysis: {
          sentiment: sentimentLabel,
          sentimentScore,
          impactLevel: Math.abs(sentimentScore) > 0.4 ? 'high' : 'medium',
          affectedAssets,
          summary: `تحليل محلي: المشاعر ${sentimentLabel === 'positive' ? 'إيجابي' : sentimentLabel === 'negative' ? 'سلبي' : 'محايد'}`,
        },
        confidence: 0.5,
        model: 'Local Heuristic',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: `خطأ في التحليل: ${error.message}` },
      { status: 502 },
    );
  }
}
