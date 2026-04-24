import { NextRequest, NextResponse } from 'next/server'
import {
  buildMultiTimeframeSnapshot,
  buildScannerResult,
  fetchMarketContext,
} from '@/lib/trading-intelligence'

type Vote = 'BUY' | 'SELL' | 'HOLD'

function toVote(dir: 'buy' | 'sell' | 'neutral'): Vote {
  return dir === 'buy' ? 'BUY' : dir === 'sell' ? 'SELL' : 'HOLD'
}

function directionLabel(dir: 'buy' | 'sell' | 'neutral') {
  return dir === 'buy' ? 'صاعد' : dir === 'sell' ? 'هابط' : 'محايد'
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const symbol = body.symbol || 'BTC/USD'
    const origin = req.nextUrl.origin
    const startedAt = Date.now()

    const context = await fetchMarketContext(origin, symbol, '1h')
    const scanner = buildScannerResult(context)
    const mtf = await buildMultiTimeframeSnapshot(origin, symbol)

    if (!scanner) {
      return NextResponse.json({
        success: true,
        degraded: true,
        data: {
          consensusScore: 42,
          recommendation: 'HOLD',
          analyses: [
            {
              role: 'المجلس',
              model: 'Fallback/Guard',
              vote: 'HOLD',
              confidence: 42,
              reason: 'تعذر بناء سياق سوق موثوق الآن، لذلك تم خفض التوصية إلى الانتظار حتى تعود البيانات.',
              featuresUsed: ['fallback'],
            },
          ],
          conflictExplanation: 'المجلس دخل وضع الحماية لأن بيانات السوق لم تكن كافية أو موثوقة عند هذه اللحظة.',
          masterStrategy: `الانتظار على ${symbol} حتى يعود quote/history بشكل مستقر، ثم إعادة التقييم قبل أي قرار.`,
          meta: {
            symbol,
            price: context.quote?.price ?? 0,
            rsi: 50,
            source: context.source || 'Fallback',
            freshness: context.freshness,
            processingTimeMs: Date.now() - startedAt,
            timeframe: context.timeframe,
            timestamp: new Date().toISOString(),
          },
        },
      })
    }

    const { features } = scanner
    const spreadRisk = Math.abs(scanner.change) > 3.5 ? 'مرتفع' : Math.abs(scanner.change) > 1.5 ? 'متوسط' : 'منخفض'

    const technicalVote = toVote(scanner.dir)
    const sentimentVote: Vote = scanner.change > 0.7 ? 'BUY' : scanner.change < -0.7 ? 'SELL' : 'HOLD'
    const riskVote: Vote = scanner.freshness !== 'fresh' ? 'HOLD' : scanner.strength >= 75 ? technicalVote : 'HOLD'
    const macroVote: Vote = mtf.regime === 'buy' ? 'BUY' : mtf.regime === 'sell' ? 'SELL' : 'HOLD'
    const patternVote: Vote = scanner.signalClass === 'reversion'
      ? (scanner.dir === 'buy' ? 'BUY' : scanner.dir === 'sell' ? 'SELL' : 'HOLD')
      : technicalVote
    const executionVote: Vote = mtf.alignment === 'counter-trend' ? 'HOLD' : technicalVote

    const analyses = [
      {
        role: 'المحلل الفني',
        model: 'Scanner/FeatureEngine',
        vote: technicalVote,
        confidence: scanner.strength,
        reason: `${scanner.reasons.join('، ')}. RSI ${Math.round(features.rsi)} | EMA20 ${features.ema20.toFixed(2)} | EMA50 ${features.ema50.toFixed(2)}.`,
        featuresUsed: ['rsi', 'ema20', 'ema50', 'slope20'],
      },
      {
        role: 'محلل المشاعر',
        model: 'Scanner/MomentumLayer',
        vote: sentimentVote,
        confidence: Math.min(90, Math.round(55 + Math.abs(scanner.change) * 8)),
        reason: `تغير 24 ساعة ${scanner.change >= 0 ? '+' : ''}${scanner.change.toFixed(2)}%، مع سياق ${directionLabel(scanner.dir)} على الإطار ${scanner.timeframe}.`,
        featuresUsed: ['changePercent', 'freshness'],
      },
      {
        role: 'خبير المخاطر',
        model: 'Risk/GuardRail',
        vote: riskVote,
        confidence: scanner.freshness === 'fresh' ? 74 : 42,
        reason: `مستوى الخطر ${spreadRisk}. حالة البيانات: ${scanner.freshness}. ${scanner.freshness !== 'fresh' ? 'تم تقييد التوصية لحين تحسن التغذية.' : 'يمكن السماح بالمخاطرة المقننة.'}`,
        featuresUsed: ['freshness', 'rangeExpansion'],
      },
      {
        role: 'خبير الماكرو',
        model: 'MTF/RegimeEngine',
        vote: macroVote,
        confidence: mtf.alignment === 'strong' ? 84 : mtf.alignment === 'mixed' ? 64 : 48,
        reason: `الإطار اليومي ${directionLabel(mtf.regime)}، و4H ${directionLabel(mtf.bias)}. ${mtf.executionHint}.`,
        featuresUsed: ['regime', 'bias', 'alignment'],
      },
      {
        role: 'خبير الأنماط',
        model: 'Scanner/PatternClassifier',
        vote: patternVote,
        confidence: scanner.signalClass === 'watch' ? 54 : 76,
        reason: `تصنيف الفرصة الحالي ${scanner.signalClass} مع bias ${scanner.entryBias}. اتساع النطاق ${features.rangeExpansion.toFixed(2)}%.`,
        featuresUsed: ['signalClass', 'entryBias', 'rangeExpansion'],
      },
      {
        role: 'استراتيجي التنفيذ',
        model: 'Execution/AlignmentPolicy',
        vote: executionVote,
        confidence: mtf.alignment === 'strong' ? 86 : mtf.alignment === 'mixed' ? 67 : 38,
        reason: `النظام: يومي ${directionLabel(mtf.regime)} → 4H ${directionLabel(mtf.bias)} → 1H ${directionLabel(mtf.setup)} → 15m ${directionLabel(mtf.trigger)}.`,
        featuresUsed: ['regime', 'bias', 'setup', 'trigger'],
      },
    ]

    const score = analyses.reduce(
      (acc, item) => {
        if (item.vote === 'BUY') acc.buy += item.confidence
        else if (item.vote === 'SELL') acc.sell += item.confidence
        else acc.hold += item.confidence
        acc.total += item.confidence
        return acc
      },
      { buy: 0, sell: 0, hold: 0, total: 0 }
    )

    const buyPct = score.total ? score.buy / score.total : 0
    const sellPct = score.total ? score.sell / score.total : 0
    const recommendation: Vote = buyPct > 0.55 ? 'BUY' : sellPct > 0.55 ? 'SELL' : 'HOLD'
    const consensusScore = recommendation === 'HOLD'
      ? Math.round(50 - Math.abs(buyPct - sellPct) * 30)
      : Math.round(Math.max(buyPct, sellPct) * 100)

    const conflictExplanation =
      mtf.alignment === 'counter-trend'
        ? 'هناك تعارض بين الإطار الأعلى والزناد القصير، لذلك خفّض المجلس التوصية إلى الحياد أو الحذر.'
        : riskVote === 'HOLD' && technicalVote !== 'HOLD'
          ? 'التحليل الفني يرى فرصة، لكن طبقة المخاطر كبحت التوصية بسبب جودة البيانات أو التذبذب.'
          : 'الأدوار الأساسية متوافقة نسبيًا ولا يوجد تعارض جوهري في القرار الحالي.'

    const masterStrategy = `${recommendation === 'BUY' ? 'الشراء' : recommendation === 'SELL' ? 'البيع' : 'الانتظار'} على ${symbol} بإجماع ${consensusScore}%، مع تصنيف ${scanner.signalClass} وانحياز ${scanner.entryBias}. ${mtf.executionHint} ${conflictExplanation}`

    return NextResponse.json({
      success: true,
      data: {
        consensusScore,
        recommendation,
        analyses,
        conflictExplanation,
        masterStrategy,
        meta: {
          symbol,
          price: scanner.price,
          rsi: Math.round(features.rsi),
          source: scanner.source,
          freshness: scanner.freshness,
          processingTimeMs: Date.now() - startedAt,
          timeframe: scanner.timeframe,
          timestamp: new Date().toISOString(),
        },
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: true,
        degraded: true,
        data: {
          consensusScore: 35,
          recommendation: 'HOLD',
          analyses: [
            {
              role: 'المجلس',
              model: 'Fallback/Error',
              vote: 'HOLD',
              confidence: 35,
              reason: error?.message || 'فشل داخلي في محرك الإجماع، وتم تفعيل وضع الانتظار الوقائي.',
              featuresUsed: ['error-fallback'],
            },
          ],
          conflictExplanation: 'تم تفعيل fallback للمجلس بسبب خطأ داخلي، لذلك لا يتم السماح بتوصية هجومية الآن.',
          masterStrategy: 'الانتظار حتى يكتمل التحليل ويعود محرك المجلس للعمل الطبيعي.',
          meta: {
            symbol: 'UNKNOWN',
            price: 0,
            rsi: 50,
            source: 'Fallback',
            freshness: 'degraded',
            processingTimeMs: 0,
            timeframe: '1h',
            timestamp: new Date().toISOString(),
          },
        },
      },
      { status: 200 }
    )
  }
}
