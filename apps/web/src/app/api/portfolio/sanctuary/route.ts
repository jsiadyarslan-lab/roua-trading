import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

/**
 * GET /api/portfolio/sanctuary
 * Generates a risk analysis report for the user's portfolio.
 */
export async function GET(request: NextRequest) {
  try {
    await ensureDbReady()

    // Check authentication
    const sessionToken = request.cookies.get('roua_session')?.value
    if (!sessionToken) {
      return NextResponse.json({ success: false, error: 'غير مصادق' }, { status: 401 })
    }

    const session = await db.session.findUnique({
      where: { token: sessionToken },
      include: { user: true },
    })

    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json({ success: false, error: 'جلسة غير صالحة' }, { status: 401 })
    }

    // Get user's portfolios with assets
    const portfolios = await db.portfolio.findMany({
      where: { userId: session.userId },
      include: { assets: true },
    })

    // Also check exchange credentials for connected accounts
    const credentials = await db.exchangeCredential.findMany({
      where: { userId: session.userId, isValid: true },
    })

    const allAssets = portfolios.flatMap((p) => p.assets)
    const totalValue = portfolios.reduce((sum, p) => sum + p.totalValue, 0)
    const positionCount = allAssets.length

    // Calculate risk metrics
    const concentrationRisk = positionCount === 0 ? 0
      : allAssets.length > 0
        ? Math.min(100, Math.floor(
            Math.max(...allAssets.map((a) => {
              const weight = totalValue > 0 ? (a.quantity * (a.currentPrice || a.avgPrice)) / totalValue * 100 : 0
              return weight
            }))
          ))
        : 0

    const diversificationScore = positionCount === 0 ? 0
      : Math.min(100, Math.floor(positionCount * 15 + (positionCount > 3 ? 20 : 0) + (positionCount > 6 ? 15 : 0)))

    const largestPositionWeight = concentrationRisk

    // Simple VaR estimation (5% of portfolio value for 95% confidence)
    const varEstimate = totalValue * 0.05

    // Simple volatility estimation based on position count
    const volatilityEstimate = positionCount === 0 ? 0
      : Math.max(5, 25 - positionCount * 2)

    // Determine risk score
    const riskScore = positionCount === 0 ? 0
      : Math.min(100, Math.floor(
          concentrationRisk * 0.4 +
          (100 - diversificationScore) * 0.3 +
          volatilityEstimate * 0.3
        ))

    // Build position details
    const positions = allAssets.map((asset) => {
      const value = asset.quantity * (asset.currentPrice || asset.avgPrice)
      const weight = totalValue > 0 ? (value / totalValue) * 100 : 0
      return {
        symbol: asset.symbol,
        exchange: asset.exchange || asset.assetType,
        quantity: asset.quantity,
        currentPrice: asset.currentPrice || asset.avgPrice,
        value,
        weight,
        change24h: 0, // We don't track daily changes for portfolio assets yet
        assetType: asset.assetType,
      }
    })

    // Generate recommendations
    const recommendations: string[] = []

    if (positionCount === 0) {
      recommendations.push('ابدأ بإضافة أصول إلى محفظتك لتفعيل تحليل المخاطر.')
    }
    if (concentrationRisk > 30) {
      recommendations.push('محفظتك مركزة بشكل عالٍ. فكر في توزيع الاستثمارات عبر أصول وأسواق مختلفة.')
    }
    if (diversificationScore < 40 && positionCount > 0) {
      recommendations.push('درجة التنويع منخفضة. أضف أصولاً من فئات مختلفة (أسهم، عملات رقمية، فوركس) لتحسين التنويع.')
    }
    if (credentials.length === 0 && positionCount === 0) {
      recommendations.push('اربط حساب البورصة الخاص بك لتحليل محفظتك الفعلية تلقائياً.')
    }
    if (volatilityEstimate > 20) {
      recommendations.push('تقلبات المحفظة مرتفعة. فكر في إضافة أصول أكثر استقراراً لتقليل المخاطر.')
    }
    if (recommendations.length === 0 && positionCount > 0) {
      recommendations.push('محفظتك في وضع جيد. استمر في مراقبة المخاطر بشكل دوري.')
    }

    // Determine risk level summary
    const riskLevel = riskScore < 30 ? 'منخفض' : riskScore < 60 ? 'متوسط' : 'مرتفع'
    const summary = positionCount === 0
      ? 'لا توجد أصول في المحفظة حالياً. اربط حساب البورصة أو أضف أصولاً يدوياً.'
      : `مستوى المخاطر ${riskLevel} بدرجة ${riskScore}/100. المحفظة تحتوي على ${positionCount} مركز${positionCount > 1 ? 'اً' : ''} بقيمة إجمالية ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalValue)}.`

    // AI analysis text
    const aiAnalysis = positionCount === 0
      ? 'لا توجد بيانات كافية لتحليل المحفظة. يرجى ربط حساب البورصة أو إضافة أصول يدوياً لتلقي تحليل المخاطر المدعوم بالذكاء الاصطناعي.'
      : `تحليل المخاطر للمحفظة:\n\n${summary}\n\nالتركيز: ${concentrationRisk}% من المحفظة في أكبر مركز.\nالتنويع: ${diversificationScore}/100 — ${diversificationScore > 60 ? 'تنويع جيد' : diversificationScore > 30 ? 'تنويع متوسط' : 'تنويع منخفض'}.\nتقدير VaR (95%): ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(varEstimate)}.\nالتقلب المقدر: ${volatilityEstimate}%.\n\n${recommendations.join('\n')}`

    const report = {
      summary,
      riskScore,
      totalValue,
      currency: 'USD',
      positions,
      metrics: {
        concentrationRisk,
        diversificationScore,
        largestPositionWeight,
        positionCount,
        varEstimate,
        volatilityEstimate,
      },
      recommendations,
      aiAnalysis,
      analyzedAt: new Date().toISOString(),
    }

    return NextResponse.json({ success: true, data: report })
  } catch (error: any) {
    console.error('[portfolio/sanctuary] Error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في تحليل المحفظة' },
      { status: 500 }
    )
  }
}
