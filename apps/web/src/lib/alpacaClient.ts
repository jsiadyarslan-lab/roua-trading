import { NextResponse } from 'next/server'

const ALPACA_BASE = process.env.ALPACA_PAPER === 'false'
  ? 'https://api.alpaca.markets'
  : 'https://paper-api.alpaca.markets'

const HAS_ALPACA_KEYS = Boolean(process.env.ALPACA_API_KEY && process.env.ALPACA_API_SECRET)

export function alpacaClient() {
  const key = process.env.ALPACA_API_KEY
  const secret = process.env.ALPACA_API_SECRET

  if (!key || !secret) {
    throw new Error('ALPACA_API_KEY أو ALPACA_API_SECRET غير موجودَين في المتغيرات البيئية')
  }

  return {
    baseURL: ALPACA_BASE,
    headers: {
      'APCA-API-KEY-ID': key,
      'APCA-API-SECRET-KEY': secret,
      'Content-Type': 'application/json',
    },
  }
}

const FOREX_PROXY_MAP: Record<string, string> = {
  'EUR/USD': 'FXE',
  'GBP/USD': 'FXB',
  'USD/JPY': 'FXY',
  'USD/CHF': 'FXF',
  'AUD/USD': 'FXA',
  'USD/CAD': 'FXC',
  'NZD/USD': 'UUP',
  'XAU/USD': 'GLD',
  'XAG/USD': 'SLV',
  'XPT/USD': 'PPLT',
}

/** نرمّز رمز الزوج لـ Alpaca: للعملات نستخدم ETFs كبديل */
export function toAlpacaSymbol(symbol: string): string {
  if (!symbol || symbol === 'undefined') return 'AAPL'
  const s = decodeURIComponent(symbol)

  if (FOREX_PROXY_MAP[s]) return FOREX_PROXY_MAP[s]

  // العملات الرقمية
  if (s.includes('BTC') || s.includes('ETH')) {
    return s.includes('/') ? s : s.replace('USD', '/USD')
  }

  return s.replace('/', '')
}

/** نعكس الرمز الوهمي للواجهة الأمامية */
export function fromAlpacaSymbol(alpacaSym: string): string {
  const entry = Object.entries(FOREX_PROXY_MAP).find(([, val]) => val === alpacaSym)
  if (entry) return entry[0]
  return alpacaSym
}

function createFallbackResponse(_path: string): Response {
  // When Alpaca keys are not configured, return a clear error instead of
  // fake data. The UI should show "Alpaca not configured" instead of
  // displaying misleading $10,000 balances.
  return NextResponse.json(
    {
      success: false,
      degraded: true,
      error: 'Alpaca credentials not configured. Set ALPACA_API_KEY and ALPACA_API_SECRET environment variables.',
      mock: true,
    },
    { status: 503 }
  )
}

/** دالة مساعدة لإرسال طلبات لـ Alpaca */
export async function alpacaFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  if (!HAS_ALPACA_KEYS) {
    return createFallbackResponse(path)
  }

  const client = alpacaClient()
  return fetch(`${client.baseURL}${path}`, {
    ...options,
    headers: {
      ...client.headers,
      ...(options.headers || {}),
    },
  })
}
