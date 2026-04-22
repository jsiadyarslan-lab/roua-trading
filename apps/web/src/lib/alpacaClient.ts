import { NextRequest, NextResponse } from 'next/server'

const ALPACA_BASE = process.env.ALPACA_PAPER === 'false'
  ? 'https://api.alpaca.markets'
  : 'https://paper-api.alpaca.markets'

export function alpacaClient() {
  const key    = process.env.ALPACA_API_KEY
  const secret = process.env.ALPACA_API_SECRET

  if (!key || !secret) {
    throw new Error('ALPACA_API_KEY أو ALPACA_API_SECRET غير موجودَين في المتغيرات البيئية')
  }

  return {
    baseURL: ALPACA_BASE,
    headers: {
      'APCA-API-KEY-ID':     key,
      'APCA-API-SECRET-KEY': secret,
      'Content-Type':        'application/json',
    },
  }
}

/** نرمّز رمز الزوج لـ Alpaca: BTC/USD → BTCUSD */
export function toAlpacaSymbol(symbol: string): string {
  return symbol.replace('/', '')
}

/** دالة مساعدة لإرسال طلبات لـ Alpaca */
export async function alpacaFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const client = alpacaClient()
  return fetch(`${client.baseURL}${path}`, {
    ...options,
    headers: {
      ...client.headers,
      ...(options.headers || {}),
    },
  })
}
