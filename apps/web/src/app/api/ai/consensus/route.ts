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

/**
 * POST /api/ai/consensus
 *
 * Hybrid approach: Tries the REAL NestJS AI Council first (6 actual AI models),
 * falls back to rule-based scanner consensus if NestJS is unavailable.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const symbol = body.symbol || 'BTC/USD'
    const origin = req.nextUrl.origin
    const startedAt = Date.now()

    // ═══════════════════════════════════════════════════════════
    // PHASE 1: Try REAL NestJS AI Council (6 actual AI models)
    // FIX: Try multiple URL patterns for Railway compatibility
    // ═══════════════════════════════════════════════════════════
    const apiTargets = [
      process.env.API_INTERNAL_URL,
      // Railway internal: same container (NestJS runs on 3001)
      'http://localhost:3001',
      // Fallback: same-origin proxy
      `${origin}/api/health`.replace('/api/health', ''),
    ].filter((u, i, arr) => u && arr.indexOf(u) === i) as string[]

    for (const apiTarget of apiTargets) {
      try {
        const targetUrl = `${apiTarget}/api/ai/consensus`
        console.log(`[consensus] Trying NestJS AI at: ${targetUrl}`)
        const nestjsRes = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol }),
          signal: AbortSignal.timeout(90000), // 90s — 6 models (60s) + master strategy (30s)
        })

        if (nestjsRes.ok) {
          const nestjsData = await nestjsRes.json()
          if (nestjsData.success && nestjsData.data?.analyses?.length > 0) {
            // Real AI Council succeeded! Add meta info
            const aiData = nestjsData.data
            const modelCount = aiData.analyses?.length || 0
            // Distinguish partial-ai (some models) from real-ai (most models)
            const source = modelCount >= 4 ? 'real-ai' : modelCount >= 1 ? 'partial-ai' : 'scanner-rules'
            return NextResponse.json({
              success: true,
              source,
              data: {
                ...aiData,
                meta: {
                  ...aiData.meta,
                  symbol,
                  processingTimeMs: Date.now() - startedAt,
                  timestamp: new Date().toISOString(),
                  aiEngine: source === 'real-ai' ? 'NestJS-6-Models' : `NestJS-${modelCount}-Models`,
                  modelsUsed: aiData.analyses.map((a: any) => a.model).filter(Boolean),
                  modelsResponded: modelCount,
                  modelsExpected: 6,
                },
              },
            })
          }
        }
        // If this target responded but didn't have valid data, try next
        console.warn(`[consensus] Target ${targetUrl} responded but no valid data, trying next...`)
      } catch (aiError: any) {
        console.warn(`[consensus] Target ${apiTarget} failed: ${aiError?.message || aiError}`)
        // Continue to next target
      }
    }
    // All NestJS targets failed — fall through to scanner


    // ═══════════════════════════════════════════════════════════
    // PHASE 2: Fallback — Rule-based scanner consensus
    // ═══════════════════════════════════════════════════════════
    const context = await fetchMarketContext(origin, symbol, '1h')
    const scanner = buildScannerResult(context)
    const mtf = await buildMultiTimeframeSnapshot(origin, symbol)

    if (!scanner) {
      return NextResponse.json({
        success: true,
        source: 'fallback',
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
            aiEngine: 'Scanner-Rules (NestJS unavailable)',
          },
        },
      })
    }

    const { features } = scanner
    const spreadRisk = Math.abs(scanner.change) > 3.5 ? 'مرتفع' : Math.abs(scanner.change) > 1.5 ? 'متوسط' : 'منخفض'

    const technicalVote = toVote(scanner.dir)
    const sentimentVote: Vote = scanner.change > 0.45 ? 'BUY' : scanner.change < -0.45 ? 'SELL' : 'HOLD'
    const hasDirectionalBias = scanner.dir !== 'neutral' && scanner.strength >= 55
    const riskVote: Vote = hasDirectionalBias
      ? technicalVote
      : scanner.freshness !== 'fresh'
        ? 'HOLD'
        : scanner.strength >= 72
          ? technicalVote
          : 'HOLD'
    const macroVote: Vote = mtf.regime === 'buy'
      ? 'BUY'
      : mtf.regime === 'sell'
        ? 'SELL'
        : 'HOLD'
    const patternVote: Vote = scanner.signalClass === 'reversion'
      ? (scanner.dir === 'buy' ? 'BUY' : scanner.dir === 'sell' ? 'SELL' : 'HOLD')
      : technicalVote
    const executionVote: Vote = mtf.alignment === 'counter-trend' && scanner.strength < 65
      ? 'HOLD'
      : technicalVote

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
        confidence: Math.min(90, Math.round(52 + Math.abs(scanner.change) * 9)),
        reason: `تغير 24 ساعة ${scanner.change >= 0 ? '+' : ''}${scanner.change.toFixed(2)}%، مع سياق ${directionLabel(scanner.dir)} على الإطار ${scanner.timeframe}.`,
        featuresUsed: ['changePercent', 'freshness'],
      },
      {
        role: 'خبير المخاطر',
        model: 'Risk/GuardRail',
        vote: riskVote,
        confidence: scanner.freshness === 'fresh' ? 76 : scanner.freshness === 'stale' ? 58 : 44,
        reason: `مستوى الخطر ${spreadRisk}. حالة البيانات: ${scanner.freshness}. ${scanner.freshness !== 'fresh' ? 'تم تخفيض الثقة فقط، لا إلغاء الإشارة بالكامل.' : 'يمكن السماح بالمخاطرة المقننة.'}`,
        featuresUsed: ['freshness', 'rangeExpansion'],
      },
      {
        role: 'خبير الماكرو',
        model: 'MTF/RegimeEngine',
        vote: macroVote,
        confidence: mtf.alignment === 'strong' ? 84 : mtf.alignment === 'mixed' ? 64 : 50,
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
        confidence: mtf.alignment === 'strong' ? 86 : mtf.alignment === 'mixed' ? 67 : 45,
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

    const directionalTotal = score.buy + score.sell
    const buyPct = directionalTotal ? score.buy / directionalTotal : 0
    const sellPct = directionalTotal ? score.sell / directionalTotal : 0
    const recommendation: Vote = buyPct >= 0.54 ? 'BUY' : sellPct >= 0.54 ? 'SELL' : 'HOLD'
    const consensusScore = recommendation === 'HOLD'
      ? Math.round(42 + Math.abs(buyPct - sellPct) * 20)
      : Math.round(Math.max(buyPct, sellPct) * 100)

    const conflictExplanation =
      mtf.alignment === 'counter-trend' && recommendation !== 'HOLD'
        ? 'هناك تعارض بين الإطار الأعلى والزناد القصير، لكن الزخم الحالي كافٍ لإبقاء المجلس حذرًا بدلًا من إلغاء التوصية بالكامل.'
        : riskVote === 'HOLD' && technicalVote !== 'HOLD'
          ? 'التحليل الفني يرى فرصة، لكن طبقة المخاطر خفّضت الاندفاع بسبب جودة البيانات أو التذبذب.'
          : recommendation === 'HOLD'
            ? 'الأدوار الأساسية متوازنة، لذلك يكتفي المجلس بمتابعة السوق حتى يظهر فرق أوضح.'
            : 'الأدوار الأساسية متوافقة نسبيًا ولا يوجد تعارض جوهري في القرار الحالي.'

    const masterStrategy = `${recommendation === 'BUY' ? 'الشراء' : recommendation === 'SELL' ? 'البيع' : 'الانتظار'} على ${symbol} بإجماع ${consensusScore}%، مع تصنيف ${scanner.signalClass} وانحياز ${scanner.entryBias}. ${mtf.executionHint} ${conflictExplanation}`

    return NextResponse.json({
      success: true,
      source: 'scanner-rules',
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
          aiEngine: 'Scanner-Rules (NestJS AI unavailable)',
        },
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: true,
        source: 'error-fallback',
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
            aiEngine: 'Error-Fallback',
          },
        },
      },
      { status: 200 }
    )
  }
}
