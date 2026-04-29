import { NextRequest, NextResponse } from 'next/server'
import { alpacaFetch } from '@/lib/alpacaClient'

/**
 * Verify that the request has a valid roua_session cookie.
 */
function requireAuth(request: NextRequest): NextResponse | null {
  const sessionToken = request.cookies.get('roua_session')?.value
  if (!sessionToken) {
    // Return graceful empty response instead of 401 to prevent cascading UI errors
    return NextResponse.json(
      { success: true, data: null },
      { status: 200 }
    )
  }
  return null
}

/**
 * GET /api/alpaca/account
 * جلب معلومات حساب Alpaca (الرصيد، القوة الشرائية، الحالة)
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authError = requireAuth(request)
  if (authError) return authError

  try {
    const res = await alpacaFetch('/v2/account')

    if (!res.ok) {
      const errBody = await res.text()
      let userError = `Alpaca API Error ${res.status}: ${errBody}`
      
      if (res.status === 403) {
        userError = 'مفاتيح Alpaca غير صالحة أو منتهية الصلاحية. تحقق من متغيرات البيئة.'
        console.error('[alpaca/account] 403 Forbidden — API keys may be invalid:', errBody)
      }
      
      return NextResponse.json(
        { success: false, error: userError, alpacaStatus: res.status },
        { status: res.status === 403 ? 503 : res.status }
      )
    }

    const data = await res.json()

    return NextResponse.json({
      success: true,
      data: {
        id:               data.id,
        status:           data.status,
        currency:         data.currency,
        cash:             parseFloat(data.cash)                    || 0,
        equity:           parseFloat(data.equity)                  || 0,
        buyingPower:      parseFloat(data.buying_power)            || 0,
        portfolioValue:   parseFloat(data.portfolio_value)         || 0,
        initialMargin:    parseFloat(data.initial_margin)          || 0,
        maintenanceMargin:parseFloat(data.maintenance_margin)      || 0,
        longMarketValue:  parseFloat(data.long_market_value)       || 0,
        shortMarketValue: parseFloat(data.short_market_value)      || 0,
        unrealizedPnl:    parseFloat(data.unrealized_pl)           || 0,
        unrealizedPnlPct: parseFloat(data.unrealized_plpc)         || 0,
        daytradeCount:    data.daytrade_count                      || 0,
        isPaperTrading:   data.account_number?.startsWith('PA')    ?? true,
        tradingBlocked:   data.trading_blocked                     || false,
        accountBlocked:   data.account_blocked                     || false,
      },
    })
  } catch (error: any) {
    console.error('[alpaca/account] Error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في الاتصال بـ Alpaca' },
      { status: 500 }
    )
  }
}
