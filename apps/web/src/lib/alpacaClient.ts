import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { decrypt } from '@/lib/encryption'

const ALPACA_BASE = process.env.ALPACA_PAPER === 'false'
  ? 'https://api.alpaca.markets'
  : 'https://paper-api.alpaca.markets'

const HAS_ALPACA_KEYS = Boolean(process.env.ALPACA_API_KEY && process.env.ALPACA_API_SECRET)

export interface AlpacaCredentials {
  apiKey: string
  apiSecret: string
}

export function alpacaClient(creds?: AlpacaCredentials) {
  // V162 FIX: Only use provided credentials, NEVER fall back to shared env vars.
  // Previously, when no per-user creds were provided, this fell back to
  // ALPACA_API_KEY / ALPACA_API_SECRET env vars. This caused ALL users
  // without personal Alpaca credentials to share the SAME Alpaca account,
  // resulting in the same balance ($12,342.85) being shown to everyone.
  // Now: Only use explicitly provided credentials. The alpacaFetch()
  // function handles the per-user credential lookup and fallback logic.
  const key = creds?.apiKey
  const secret = creds?.apiSecret

  if (!key || !secret) {
    throw new Error('ALPACA_API_KEY أو ALPACA_API_SECRET غير موجودَين')
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
  metadataOrCreds?: { userId?: string } | AlpacaCredentials
): Promise<Response> {
  let creds: AlpacaCredentials | undefined

  if (metadataOrCreds) {
    // If it's AlpacaCredentials (has apiKey)
    if ('apiKey' in metadataOrCreds) {
      creds = metadataOrCreds as AlpacaCredentials
    } 
    // If it's metadata with userId
    else if ('userId' in metadataOrCreds && metadataOrCreds.userId) {
      try {
        const dbCred = await db.exchangeCredential.findFirst({
          where: {
            userId: metadataOrCreds.userId,
            exchange: 'alpaca',
            isValid: true
          }
        })

        if (dbCred) {
          creds = {
            apiKey: decrypt({ encrypted: dbCred.encryptedApiKey, iv: dbCred.iv, authTag: dbCred.authTag }),
            apiSecret: decrypt({ encrypted: dbCred.encryptedSecret, iv: dbCred.secretIv || dbCred.iv, authTag: dbCred.secretAuthTag || dbCred.authTag })
          }
        }
      } catch (err) {
        console.error(`[alpacaFetch] Failed to fetch credentials for ${metadataOrCreds.userId}:`, err)
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // V162 CRITICAL FIX: NEVER fall back to shared global Alpaca keys.
  //
  // Previously, when a userId was provided but no per-user Alpaca
  // credentials were found, this code would fall back to global
  // ALPACA_API_KEY / ALPACA_API_SECRET env vars. This caused ALL
  // users without personal Alpaca credentials to query the SAME
  // shared Alpaca account, seeing the same balance ($12,342.85).
  //
  // Now: If any metadata with userId is provided, we REQUIRE
  // per-user credentials. No global fallback. Period.
  // ═══════════════════════════════════════════════════════════════
  if (metadataOrCreds && 'userId' in metadataOrCreds && (metadataOrCreds as any).userId) {
    if (!creds) {
      console.warn(`[alpacaFetch] V162: No Alpaca credentials for user ${(metadataOrCreds as any).userId} — returning offline (NO shared fallback)`)
      return createFallbackResponse(path)
    }
  }

  // No userId provided — this is a system-level call (not per-user).
  // V162: Even for system calls, require explicit credentials.
  // If no creds at all, return offline response.
  if (!creds) {
    console.warn(`[alpacaFetch] V162: No credentials provided — returning offline (NO shared fallback)`)
    return createFallbackResponse(path)
  }

  try {
    const client = alpacaClient(creds)
    return fetch(`${client.baseURL}${path}`, {
      ...options,
      cache: 'no-store',
      headers: {
        ...client.headers,
        ...(options.headers || {}),
      },
    })
  } catch (err: any) {
    return createFallbackResponse(path)
  }
}
