import { NextRequest, NextResponse } from 'next/server'
import { alpacaFetch } from '@/lib/alpacaClient'
import { verifyUserSession } from '@/lib/session-auth'
import { db } from '@/lib/db'

/**
 * GET /api/alpaca/account
 * جلب معلومات حساب Alpaca (الرصيد، القوة الشرائية، الحالة)
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await verifyUserSession(request)
  if (auth.error) return auth.error

  try {
    // 1. Fetch credentials for the user
    const credential = await db.exchangeCredential.findFirst({
      where: { 
        userId: auth.session.userId,
        exchange: 'alpaca'
      }
    })

    if (!credential) {
      return NextResponse.json(
        { success: false, error: 'ALPACA_CREDENTIALS_NOT_CONFIGURED', data: null },
        { status: 503 }
      )
    }

    // 2. Decrypt credentials
    const { decrypt } = await import('@/lib/encryption')
    const apiKey = decrypt({
      encrypted: credential.encryptedApiKey,
      iv: credential.iv,
      authTag: credential.authTag
    })
    const apiSecret = decrypt({
      encrypted: credential.encryptedSecret,
      iv: credential.secretIv || credential.iv,
      authTag: credential.secretAuthTag || credential.authTag
    })

    // 3. Fetch from Alpaca with user credentials
    const res = await alpacaFetch('/v2/account', {}, { apiKey, apiSecret })

    if (!res.ok) {
      const errBody = await res.text()
      let userError = `Alpaca API Error ${res.status}: ${errBody}`
      
      if (res.status === 403) {
        userError = 'مفاتيح Alpaca غير صالحة أو منتهية الصلاحية'
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
