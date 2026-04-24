import { NextRequest, NextResponse } from 'next/server'
import {
  PRIMARY_SYMBOLS,
  buildScannerResult,
  buildUnifiedSignal,
  fetchMarketContext,
  rankScannerResults,
  type ScannerResult,
} from '@/lib/trading-intelligence'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const timeframe = searchParams.get('tf') || '1h'
    const origin = req.nextUrl.origin

    const contexts = await Promise.all(
      PRIMARY_SYMBOLS.map((symbol) => fetchMarketContext(origin, symbol, timeframe))
    )

    const scannerResults = rankScannerResults(
      contexts
        .map((context) => buildScannerResult(context))
        .filter((value): value is ScannerResult => Boolean(value))
    )

    const signals = scannerResults.slice(0, 8).map((result) => {
      const unified = buildUnifiedSignal(result)

      return {
        ...unified,
        pair: unified.symbol,
        type: unified.side,
        price: unified.entry,
        tp: unified.tp,
        sl: unified.sl,
        conf: unified.confidence,
        reason: unified.reasons.join(' · '),
        time: new Date(unified.createdAt).toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
        }),
      }
    })

    return NextResponse.json({
      success: true,
      data: signals,
      meta: {
        timeframe,
        sourceEngine: 'scanner-engine',
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'فشل في توليد الإشارات' },
      { status: 500 }
    )
  }
}
