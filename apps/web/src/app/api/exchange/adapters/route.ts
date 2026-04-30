import { NextResponse } from 'next/server'

/**
 * GET /api/exchange/adapters
 * Returns available market data adapters.
 */
export async function GET() {
  const adapters = ['TwelveData', 'Binance', 'CoinGecko']
  return NextResponse.json({ success: true, data: adapters })
}
