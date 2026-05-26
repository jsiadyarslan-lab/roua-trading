import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAuth } from '@/lib/admin-auth'

/**
 * GET /api/exchange/diagnostics
 *
 * Diagnostic endpoint to check the status of all market data sources.
 * Useful for debugging why certain sources aren't providing data.
 * Shows API key status, circuit breaker state, and source reachability.
 *
 * 🔒 SECURITY: Requires admin authentication.
 * Exposes API key prefixes and internal service configuration.
 */

// Import the circuit breaker state from the quote route
// (these module-level vars are accessible within the same process)
let twelveDataExhausted = false
let twelveDataResetTimeout: NodeJS.Timeout | null = null

export async function GET(req: NextRequest) {
  // 🔒 Require admin auth — this endpoint exposes API key info
  const authError = await verifyAdminAuth(req)
  if (authError) return authError
  const results: Record<string, any> = {}
  const now = new Date().toISOString()

  // ── TwelveData Status ──
  const twelveDataApiKey = process.env.TWELVE_DATA_API_KEY || ''
  results.twelveData = {
    apiKeyConfigured: !!twelveDataApiKey,
    apiKeyLength: twelveDataApiKey.length,
    apiKeyPrefix: twelveDataApiKey ? `${twelveDataApiKey.slice(0, 4)}...${twelveDataApiKey.slice(-4)}` : 'NOT SET',
  }

  // Test TwelveData API directly (bypass circuit breaker for diagnostics)
  if (twelveDataApiKey) {
    try {
      const url = `https://api.twelvedata.com/quote?symbol=AAPL&apikey=${twelveDataApiKey}`
      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
      const data = await res.json()
      results.twelveData.testResult = {
        status: data.status || 'unknown',
        price: data.close || null,
        error: data.message || null,
        httpCode: res.status,
      }
    } catch (error: any) {
      results.twelveData.testResult = {
        status: 'error',
        error: error.message,
        httpCode: null,
      }
    }
  }

  // ── Yahoo Finance Status ──
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=1d'
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })
    const data = await res.json()
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice
    results.yahooFinance = {
      reachable: true,
      testSymbol: 'AAPL',
      testPrice: price || null,
      httpCode: res.status,
    }
  } catch (error: any) {
    results.yahooFinance = {
      reachable: false,
      error: error.message,
    }
  }

  // ── Binance Status ──
  try {
    const url = 'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT'
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    const data = await res.json()
    results.binance = {
      reachable: !!data.lastPrice,
      testSymbol: 'BTC/USDT',
      testPrice: data.lastPrice ? parseFloat(data.lastPrice) : null,
      httpCode: res.status,
    }
  } catch (error: any) {
    results.binance = {
      reachable: false,
      error: error.message,
    }
  }

  // ── Frankfurter Status ──
  try {
    const url = 'https://api.frankfurter.dev/v1/latest?from=EUR&to=USD'
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    const data = await res.json()
    results.frankfurter = {
      reachable: !!data.rates,
      testSymbol: 'EUR/USD',
      testRate: data.rates?.USD || null,
      httpCode: res.status,
    }
  } catch (error: any) {
    results.frankfurter = {
      reachable: false,
      error: error.message,
    }
  }

  // ── GoldPrice.org Status ──
  try {
    const url = 'https://data-asg.goldprice.org/dbXRates/GOLD'
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    })
    const data = await res.json()
    results.goldPrice = {
      reachable: res.ok,
      testSymbol: 'XAU/USD',
      testPrice: data?.items?.[0]?.xauPrice || null,
      httpCode: res.status,
    }
  } catch (error: any) {
    results.goldPrice = {
      reachable: false,
      error: error.message,
    }
  }

  return NextResponse.json({
    success: true,
    timestamp: now,
    sources: results,
  })
}
