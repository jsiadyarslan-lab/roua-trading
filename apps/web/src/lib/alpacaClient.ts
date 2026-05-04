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
  if (!symbol || symbol === 'undefined') throw new Error('Symbol is required')
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

function createFallbackResponse(path: string): Response {
  // Production trading must fail loudly when broker credentials are absent.
  // Returning 200 here makes the UI look healthy while execution is disabled.
  const isPositions = path.includes('/positions')
  const isAccount = path.includes('/account')
  const payload = {
    success: false,
    offline: true,
    error: 'ALPACA_CREDENTIALS_NOT_CONFIGURED',
  }

  if (isPositions) {
    return NextResponse.json(
      {
        ...payload,
        data: [],
      },
      { status: 503 }
    )
  }

  if (isAccount) {
    return NextResponse.json(
      {
        ...payload,
        data: null,
      },
      { status: 503 }
    )
  }

  return NextResponse.json(
    payload,
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
    cache: 'no-store',
    headers: {
      ...client.headers,
      ...(options.headers || {}),
    },
  })
}
