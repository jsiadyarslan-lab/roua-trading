import { NextResponse } from 'next/server'
import { alpacaFetch } from '@/lib/alpacaClient'

/**
 * GET /api/alpaca/account
 * جلب معلومات حساب Alpaca (الرصيد، القوة الشرائية، الحالة)
 */
export async function GET() {
  try {
    const res = await alpacaFetch('/v2/account')

    if (!res.ok) {
      const errBody = await res.text()
      return NextResponse.json(
        { success: false, error: `Alpaca API Error ${res.status}: ${errBody}` },
        { status: res.status }
      )
    }

    const data = await res.json()

    return NextResponse.json({
      success: true,
      data: {
        id:               data.id,
        status:           data.status,
        currency:         data.currency,
        cash:             parseFloat(data.cash)              || 0,
        equity:           parseFloat(data.equity)            || 0,
        buyingPower:      parseFloat(data.buying_power)      || 0,
        portfolioValue:   parseFloat(data.portfolio_value)   || 0,
        daytradeCount:    data.daytrade_count                || 0,
        isPaperTrading:   data.account_number?.startsWith('PA') ?? true,
        tradingBlocked:   data.trading_blocked               || false,
        accountBlocked:   data.account_blocked               || false,
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
