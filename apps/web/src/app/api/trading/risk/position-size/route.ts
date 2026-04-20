import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/trading/risk/position-size
 * Calculates recommended position size based on risk parameters.
 * Pure calculation — no authentication or database needed.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      accountBalance = 10000,
      riskPercentage = 2,
      entryPrice = 0,
      stopLossPrice = 0,
    } = body

    // Calculate position size based on risk percentage
    const riskAmount = accountBalance * (riskPercentage / 100)

    let positionSize = 0
    let riskRewardRatio = 0

    if (entryPrice > 0 && stopLossPrice > 0) {
      const riskPerUnit = Math.abs(entryPrice - stopLossPrice)
      if (riskPerUnit > 0) {
        positionSize = riskAmount / riskPerUnit
      }

      // Default take profit at 2x risk
      const takeProfitPrice = entryPrice + (entryPrice - stopLossPrice) * 2
      riskRewardRatio = Math.abs(takeProfitPrice - entryPrice) / Math.abs(entryPrice - stopLossPrice)
    }

    return NextResponse.json({
      success: true,
      data: {
        positionSize: parseFloat(positionSize.toFixed(6)),
        riskAmount: parseFloat(riskAmount.toFixed(2)),
        riskPercentage,
        riskRewardRatio: parseFloat(riskRewardRatio.toFixed(2)),
      },
    })
  } catch (error: any) {
    console.error('[trading/risk/position-size] Error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في حساب حجم المركز' },
      { status: 500 }
    )
  }
}
