import { NextRequest, NextResponse } from 'next/server'
import {
  PRIMARY_SYMBOLS,
  buildScannerResult,
  fetchMarketContext,
  rankScannerResults,
  type ScannerResult,
} from '@/lib/trading-intelligence'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const targetPair = searchParams.get('pair')
    const timeframe = searchParams.get('tf') || '1h'
    const origin = req.nextUrl.origin
    const symbolsToScan = targetPair ? [targetPair] : PRIMARY_SYMBOLS

    const contexts = await Promise.all(
      symbolsToScan.map((symbol) => fetchMarketContext(origin, symbol, timeframe))
    )

    const results = contexts
      .map((context) => buildScannerResult(context))
      .filter((value): value is ScannerResult => Boolean(value))

    const filtered = targetPair
      ? results
      : rankScannerResults(results)

    return NextResponse.json({
      success: true,
      data: filtered,
      meta: {
        timeframe,
        symbolsScanned: symbolsToScan.length,
        sourceEngine: 'scanner-engine',
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error: any) {
    console.error('[market-scan] Fatal Error:', error?.message || error)
    return NextResponse.json(
      { success: false, error: 'Service unavailable', message: error?.message || 'فشل مؤقت في مصادر البيانات' },
      { status: 500 },
    )
  }
}
