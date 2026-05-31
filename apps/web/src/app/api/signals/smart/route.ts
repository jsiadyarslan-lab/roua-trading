import { NextRequest, NextResponse } from 'next/server'
import {
  buildScannerResult,
  buildUnifiedSignal,
  fetchMarketContext,
  PRIMARY_SYMBOLS,
  rankScannerResults,
  type ScannerResult,
} from '@/lib/trading-intelligence'

type SmartSignalPayload = {
  id: string
  pair: string
  type: 'BUY' | 'SELL'
  price: number
  tp: number
  sl: number
  conf: number
  reason: string
  time: string
  timeframe: string
  sourceEngine: string
  freshness: 'fresh' | 'stale' | 'degraded'
  invalidatesWhen: string
  expiresAt: string
  source: string
  signalClass: string
  entryBias: string
  reasons: string[]
}

function formatTime(timestamp: string) {
  try {
    return new Date(timestamp).toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return timestamp
  }
}

function mapUnifiedSignal(result: ScannerResult) {
  const signal = buildUnifiedSignal(result)

  return {
    id: signal.id,
    pair: signal.symbol,
    type: signal.side,
    price: signal.entry,
    tp: signal.tp,
    sl: signal.sl,
    conf: signal.confidence,
    reason: result.reasons.slice(0, 2).join(', ') || 'Signal based on technical scan',
    time: formatTime(signal.createdAt),
    timeframe: signal.timeframe,
    sourceEngine: signal.sourceEngine,
    freshness: signal.freshness,
    invalidatesWhen: signal.invalidatesWhen,
    expiresAt: signal.expiresAt,
    source: signal.source,
    signalClass: signal.signalClass,
    entryBias: signal.entryBias,
    reasons: result.reasons,
  } satisfies SmartSignalPayload
}

/**
 * GET /api/signals/smart
 *
 * Smart signal scanner — scans multiple symbols using the
 * trading-intelligence module and returns ranked signals.
 *
 * This route is intentionally kept in Next.js (not proxied to NestJS)
 * because it is READ-ONLY and uses the frontend-specific
 * trading-intelligence scanner module.
 *
 * Query params:
 *   pair  — target a single pair (optional)
 *   limit — max signals to return (1-20, default 8)
 *   tf    — timeframe (default 1h)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const targetPair = searchParams.get('pair')
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || '8') || 8, 1), 20)
    const timeframe = searchParams.get('tf') || '1h'
    const origin = req.nextUrl.origin
    const symbolsToScan = targetPair ? [targetPair] : PRIMARY_SYMBOLS

    const contexts = await Promise.all(
      symbolsToScan.map((symbol) => fetchMarketContext(origin, symbol, timeframe))
    )

    const results = contexts
      .map((context) => buildScannerResult(context))
      .filter((value): value is ScannerResult => Boolean(value))

    const ranked = targetPair ? results : rankScannerResults(results)
    const payload = ranked.slice(0, limit).map(mapUnifiedSignal)

    return NextResponse.json({
      success: true,
      data: payload,
      meta: {
        timeframe,
        symbolsScanned: symbolsToScan.length,
        sourceEngine: 'scanner-engine',
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error: any) {
    console.error('[signals/smart] Fatal Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: error?.message || 'فشل في توليد الإشارات الذكية' },
      { status: 500 }
    )
  }
}
