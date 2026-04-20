import { NextResponse } from 'next/server'

/**
 * GET /api/trading/risk/parameters
 * Returns default risk management parameters.
 * No database or NestJS needed — returns sensible defaults.
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      maxPositionSize: 10,
      maxRiskPerTrade: 2,
      maxDrawdown: 20,
      defaultLeverage: 1,
      maxLeverage: 10,
      riskRewardMin: 1.5,
      riskRewardRecommended: 2.5,
      maxOpenPositions: 5,
      maxDailyLoss: 5,
      maxWeeklyLoss: 10,
    },
  })
}
