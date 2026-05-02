import { NextRequest, NextResponse } from 'next/server'
import {
  buildMultiTimeframeSnapshot,
  buildScannerResult,
  fetchMarketContext,
} from '@/lib/trading-intelligence'
import { runDirectCouncilConsensus, getAvailableModelKeys } from '@/lib/ai-direct-calls'

type Vote = 'BUY' | 'SELL' | 'HOLD'

function toVote(dir: 'buy' | 'sell' | 'neutral'): Vote {
  return dir === 'buy' ? 'BUY' : dir === 'sell' ? 'SELL' : 'HOLD'
}

function directionLabel(dir: 'buy' | 'sell' | 'neutral') {
  return dir === 'buy' ? 'صاعد' : dir === 'sell' ? 'هابط' : 'محايد'
}

// ═══════════════════════════════════════════════════════════════
// PERSISTENT AI CACHE — Short TTL, only for same-symbol dedup
// ═══════════════════════════════════════════════════════════════
const aiResultCache = new Map<string, { data: any; source: string; cachedAt: number }>()
const AI_CACHE_TTL = 5 * 60 * 1000 // 5 minutes — just for dedup, not for masking failures

function getCachedAIResult(symbol: string): { data: any; source: string } | null {
  const entry = aiResultCache.get(symbol)
  if (!entry) return null
  const age = Date.now() - entry.cachedAt
  if (age > AI_CACHE_TTL) {
    aiResultCache.delete(symbol)
    return null
  }
  return { data: entry.data, source: entry.source }
}

function setCachedAIResult(symbol: string, data: any, source: string) {
  aiResultCache.set(symbol, { data, source, cachedAt: Date.now() })
  if (aiResultCache.size > 100) {
    const now = Date.now()
    for (const [key, entry] of aiResultCache) {
      if (now - entry.cachedAt > AI_CACHE_TTL) aiResultCache.delete(key)
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// KEEP-ALIVE STATE — Track last ping to NestJS
// ═══════════════════════════════════════════════════════════════
let lastNestJSPingAt = 0
let nestJSLastKnownUp = false

function recordNestJSPing(success: boolean) {
  lastNestJSPingAt = Date.now()
  nestJSLastKnownUp = success
}

function getNestJSStatus() {
  return {
    lastPingAt: lastNestJSPingAt,
    lastPingAgoMs: lastNestJSPingAt ? Date.now() - lastNestJSPingAt : null,
    isUp: nestJSLastKnownUp,
  }
}

/**
 * POST /api/ai/consensus
 *
 * 3-LAYER RESILIENT APPROACH — Council NEVER disconnects:
 *
 * Layer 1: Try NestJS AI Council (full 7-model support with RAG)
 * Layer 2: Call AI models DIRECTLY from Next.js (no NestJS dependency)
 *          — ALL available models run in PARALLEL with role-specific prompts
 *          — Even 1-2 models responding gives a partial-ai result
 * Layer 3: Scanner-rules (ONLY if all AI models fail simultaneously)
 *
 * The key difference from the old approach: Layer 2 ensures the council
 * stays connected even when NestJS is down. No more "disconnection every
 * few minutes" — the AI models are called directly as fallback.
 *
 * Keep-alive: External cron services can ping /api/ai/keep-alive to
 * prevent Railway from sleeping the NestJS backend.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const symbol = body.symbol || 'BTC/USD'
    const origin = req.nextUrl.origin
    const startedAt = Date.now()

    // ── Check which AI keys are available ──
    const availableKeys = getAvailableModelKeys()
    const hasAnyAIKey = availableKeys.some(k => k.hasKey)
    let directCallErrorsList: string[] = [] // Track direct call errors for debugging
    console.log(`[consensus] Available AI keys: ${availableKeys.map(k => `${k.model}:${k.hasKey ? 'YES' : 'NO'}`).join(', ')}`)

    // ═══════════════════════════════════════════════════════════
    // LAYER 1: Try NestJS AI Council (7 models with RAG, Redis cache)
    // ═══════════════════════════════════════════════════════════
    // FIX: Removed self-referencing target (`${origin}/api/health`...) that caused
    // circular calls — Next.js calling itself instead of NestJS backend.
    const apiTargets = [
      process.env.API_INTERNAL_URL,
      'http://localhost:3001',
      'http://127.0.0.1:3001',
    ].filter((u, i, arr) => u && arr.indexOf(u) === i) as string[]

    // FIX: Layer 1 no longer returns immediately with a single model.
    // It collects the NestJS result, and if partial (< 3 models), Layer 2 is
    // also called to supplement. Results from both layers are MERGED so the
    // user always gets the maximum number of responding models.
    let layer1Result: { data: any; source: string; modelCount: number } | null = null

    // FIX: Get or create a session token for NestJS auth.
    // Previously, Layer 1 called NestJS WITHOUT auth headers, causing
    // the AuthGuard to reject the request with 401. This is why Layer 1
    // always failed and the system fell back to Layer 2 (direct calls).
    let sessionToken = req.cookies.get('roua_session')?.value || ''
    if (!sessionToken) {
      try {
        const guestRes = await fetch(`${apiTargets[0]}/api/auth/guest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000),
        })
        if (guestRes.ok) {
          const guestData = await guestRes.json()
          if (guestData.success && guestData.sessionToken) {
            sessionToken = guestData.sessionToken
          }
        }
      } catch { /* Non-critical — try without auth */ }
    }

    for (const apiTarget of apiTargets) {
      try {
        const targetUrl = `${apiTarget}/api/ai/consensus`
        console.log(`[consensus] Layer 1 — Trying NestJS AI at: ${targetUrl}`)
        const nestjsHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        // FIX: Include auth headers so NestJS AuthGuard accepts the request
        if (sessionToken) {
          nestjsHeaders['Authorization'] = `Bearer ${sessionToken}`
          nestjsHeaders['x-roua-session'] = sessionToken
          nestjsHeaders['Cookie'] = `roua_session=${sessionToken}`
        }
        const nestjsRes = await fetch(targetUrl, {
          method: 'POST',
          headers: nestjsHeaders,
          body: JSON.stringify({ symbol }),
          signal: AbortSignal.timeout(60000),
        })

        if (nestjsRes.ok) {
          const nestjsData = await nestjsRes.json()
          if (nestjsData.success && nestjsData.data?.analyses?.length > 0) {
            recordNestJSPing(true)

            const aiData = nestjsData.data
            const modelCount = aiData.analyses?.length || 0
            const source = modelCount >= 3 ? 'real-ai' : 'partial-ai'

            layer1Result = { data: aiData, source, modelCount }
            console.log(`[consensus] Layer 1 — NestJS returned ${modelCount} models (source: ${source})`)

            // FIX: Only return immediately if ALL 7 models responded.
            // Previously returned with 3+ models, missing the chance to
            // supplement with Layer 2. Now we always try Layer 2 unless
            // we already have the full 7-model consensus.
            if (modelCount >= 7) {
              const result = {
                success: true,
                source,
                data: {
                  ...aiData,
                  meta: {
                    ...aiData.meta,
                    symbol,
                    processingTimeMs: Date.now() - startedAt,
                    timestamp: new Date().toISOString(),
                    aiEngine: 'NestJS-7-Models',
                    modelsUsed: aiData.analyses.map((a: any) => a.model).filter(Boolean),
                    modelsResponded: modelCount,
                    modelsExpected: 7,
                    connectionLayer: 'nestjs',
                    keepAlive: getNestJSStatus(),
                  },
                },
              }
              setCachedAIResult(symbol, result.data, source)
              return NextResponse.json(result)
            }

            // Partial result (< 3 models) — continue to Layer 2 to supplement
            console.log(`[consensus] Layer 1 partial (${modelCount} models) — will supplement with Layer 2`)
            break // Don't try more NestJS targets, move to Layer 2
          }
        }
        const errText = await nestjsRes.text().catch(() => '')
        console.warn(`[consensus] Layer 1 FAILED — ${targetUrl} status ${nestjsRes.status}: ${errText.slice(0, 100)}`)
      } catch (aiError: any) {
        console.warn(`[consensus] Layer 1 FAILED — NestJS unreachable: ${aiError?.message || aiError}`)
      }
    }

    // Record that NestJS is down (if Layer 1 didn't succeed)
    if (!layer1Result) {
      recordNestJSPing(false)
    }

    // ═══════════════════════════════════════════════════════════
    // LAYER 2: Call AI models DIRECTLY (supplement or replace Layer 1)
    //
    // FIX: Layer 2 now runs in TWO scenarios:
    //   1. Layer 1 failed entirely → Layer 2 is the primary source
    //   2. Layer 1 returned partial (< 3 models) → Layer 2 supplements
    // Results from both layers are MERGED (deduped by role) so the
    // user gets the maximum number of responding models.
    // ═══════════════════════════════════════════════════════════
    if (hasAnyAIKey) {
      const layer2Reason = layer1Result
        ? `supplement Layer 1 (${layer1Result.modelCount} models)`
        : 'NestJS unavailable'
      console.log(`[consensus] Layer 2 — Calling ALL AI models directly in parallel (${layer2Reason})`)
      try {
        const directResult = await runDirectCouncilConsensus(symbol)

        if (directResult.success && directResult.data.analyses.length > 0) {
          // FIX: If Layer 1 had partial results, MERGE with Layer 2
          if (layer1Result && layer1Result.modelCount > 0) {
            const l1Analyses = layer1Result.data.analyses || []
            const l2Analyses = directResult.data.analyses || []

            // Deduplicate by role: Layer 2 takes priority (more recent), Layer 1 fills gaps
            const roleMap = new Map<string, any>()
            for (const a of l1Analyses) {
              roleMap.set(a.role, a)
            }
            for (const a of l2Analyses) {
              roleMap.set(a.role, a) // Layer 2 overwrites Layer 1 for same role
            }
            const mergedAnalyses = Array.from(roleMap.values())
            const totalModels = mergedAnalyses.length
            const mergedSource = totalModels >= 3 ? 'real-ai' : 'partial-ai'

            const result = {
              success: true,
              source: mergedSource,
              data: {
                ...directResult.data,
                analyses: mergedAnalyses,
                consensusScore: directResult.data.consensusScore,
                recommendation: directResult.data.recommendation,
                masterStrategy: directResult.data.masterStrategy,
                meta: {
                  ...directResult.data.meta,
                  modelsResponded: totalModels,
                  aiEngine: `Merged-L1+L2-${totalModels}-Models`,
                  connectionLayer: 'merged',
                  layer1Models: layer1Result.modelCount,
                  layer2Models: directResult.data.meta?.modelsResponded || l2Analyses.length,
                  directCallErrors: directResult.errors,
                  keepAlive: getNestJSStatus(),
                },
              },
            }

            setCachedAIResult(symbol, result.data, mergedSource)
            console.log(`[consensus] MERGED Layer 1 (${layer1Result.modelCount}) + Layer 2 (${l2Analyses.length}) = ${totalModels} models in ${Date.now() - startedAt}ms`)

            if (directResult.errors.length > 0) {
              console.warn(`[consensus] Layer 2 warnings: ${directResult.errors.join('; ')}`)
            }

            return NextResponse.json(result)
          }

          // No Layer 1 result — Layer 2 is the sole source
          const result = {
            success: true,
            source: directResult.source,
            data: {
              ...directResult.data,
              meta: {
                ...directResult.data.meta,
                connectionLayer: 'direct',
                directCallErrors: directResult.errors,
                keepAlive: getNestJSStatus(),
              },
            },
          }

          setCachedAIResult(symbol, result.data, directResult.source)
          console.log(`[consensus] Layer 2 SUCCESS — Direct AI returned ${directResult.data.analyses.length} roles from ${directResult.data.meta.modelsResponded} models in ${Date.now() - startedAt}ms`)

          if (directResult.errors.length > 0) {
            console.warn(`[consensus] Layer 2 warnings: ${directResult.errors.join('; ')}`)
          }

          return NextResponse.json(result)
        }

        // Layer 2 failed — if Layer 1 had partial results, return those
        if (layer1Result && layer1Result.modelCount > 0) {
          console.log(`[consensus] Layer 2 failed — returning Layer 1 partial result (${layer1Result.modelCount} models)`)
          const result = {
            success: true,
            source: layer1Result.source,
            data: {
              ...layer1Result.data,
              meta: {
                ...layer1Result.data.meta,
                symbol,
                processingTimeMs: Date.now() - startedAt,
                timestamp: new Date().toISOString(),
                aiEngine: `NestJS-${layer1Result.modelCount}-Models`,
                modelsUsed: layer1Result.data.analyses?.map((a: any) => a.model).filter(Boolean) || [],
                modelsResponded: layer1Result.modelCount,
                modelsExpected: 7,
                connectionLayer: 'nestjs-partial',
                keepAlive: getNestJSStatus(),
              },
            },
          }
          setCachedAIResult(symbol, result.data, layer1Result.source)
          return NextResponse.json(result)
        }

        console.warn(`[consensus] Layer 2 FAILED — No AI models responded: ${directResult.errors.join('; ')}`)
        directCallErrorsList = directResult.errors
      } catch (directError: any) {
        console.warn(`[consensus] Layer 2 FAILED — Direct call error: ${directError?.message}`)
        directCallErrorsList.push(`Direct call exception: ${directError?.message}`)

        // If Layer 1 had partial results, return those as fallback
        if (layer1Result && layer1Result.modelCount > 0) {
          console.log(`[consensus] Layer 2 exception — returning Layer 1 partial result (${layer1Result.modelCount} models)`)
          const result = {
            success: true,
            source: layer1Result.source,
            data: {
              ...layer1Result.data,
              meta: {
                ...layer1Result.data.meta,
                symbol,
                processingTimeMs: Date.now() - startedAt,
                timestamp: new Date().toISOString(),
                aiEngine: `NestJS-${layer1Result.modelCount}-Models`,
                modelsUsed: layer1Result.data.analyses?.map((a: any) => a.model).filter(Boolean) || [],
                modelsResponded: layer1Result.modelCount,
                modelsExpected: 7,
                connectionLayer: 'nestjs-partial',
                keepAlive: getNestJSStatus(),
              },
            },
          }
          setCachedAIResult(symbol, result.data, layer1Result.source)
          return NextResponse.json(result)
        }
      }
    } else if (layer1Result && layer1Result.modelCount > 0) {
      // No AI keys for Layer 2, but Layer 1 had partial results — return them
      console.log(`[consensus] No AI keys for Layer 2 — returning Layer 1 partial result (${layer1Result.modelCount} models)`)
      const result = {
        success: true,
        source: layer1Result.source,
        data: {
          ...layer1Result.data,
          meta: {
            ...layer1Result.data.meta,
            symbol,
            processingTimeMs: Date.now() - startedAt,
            timestamp: new Date().toISOString(),
            aiEngine: `NestJS-${layer1Result.modelCount}-Models`,
            modelsUsed: layer1Result.data.analyses?.map((a: any) => a.model).filter(Boolean) || [],
            modelsResponded: layer1Result.modelCount,
            modelsExpected: 7,
            connectionLayer: 'nestjs-partial',
            keepAlive: getNestJSStatus(),
          },
        },
      }
      setCachedAIResult(symbol, result.data, layer1Result.source)
      return NextResponse.json(result)
    } else {
      console.warn(`[consensus] Layer 2 SKIPPED — No AI API keys configured`)
    }

    // ═══════════════════════════════════════════════════════════
    // LAYER 2.5: Check cached AI result (very short TTL — 5 min)
    // Only used as last resort before scanner-rules
    // ═══════════════════════════════════════════════════════════
    const cachedAI = getCachedAIResult(symbol)
    if (cachedAI) {
      const ageSeconds = Math.round((Date.now() - (aiResultCache.get(symbol)?.cachedAt || 0)) / 1000)
      console.log(`[consensus] Layer 2.5 — Serving cached AI result (${ageSeconds}s old)`)

      return NextResponse.json({
        success: true,
        source: cachedAI.source,
        data: {
          ...cachedAI.data,
          meta: {
            ...cachedAI.data.meta,
            processingTimeMs: Date.now() - startedAt,
            timestamp: new Date().toISOString(),
            cached: true,
            cacheAgeSeconds: ageSeconds,
            connectionLayer: 'cache',
            keepAlive: getNestJSStatus(),
          },
        },
      })
    }

    // ═══════════════════════════════════════════════════════════
    // LAYER 3: Scanner-rules (LAST RESORT — only if ALL AI fails)
    // ═══════════════════════════════════════════════════════════
    console.log(`[consensus] Layer 3 — Falling back to scanner-rules (all AI failed), hasAnyAIKey=${hasAnyAIKey}, keys=${JSON.stringify(availableKeys)}`)
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
          masterStrategy: `الانتظار على ${symbol} حتى تعود نماذج الذكاء الاصطناعي للعمل، ثم إعادة التقييم قبل أي قرار.`,
          meta: {
            symbol,
            price: context.quote?.price ?? 0,
            rsi: 50,
            source: context.source || 'Fallback',
            freshness: context.freshness,
            processingTimeMs: Date.now() - startedAt,
            timeframe: context.timeframe,
            timestamp: new Date().toISOString(),
            aiEngine: 'Scanner-Rules (All AI models unavailable)',
            connectionLayer: 'scanner',
            keepAlive: getNestJSStatus(),
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
          aiEngine: `Scanner-Rules (AI unavailable, keys=${availableKeys.map(k => `${k.model}:${k.hasKey}`).join(',')}, errors=${directCallErrorsList.join('; ')})`,
          connectionLayer: 'scanner',
          keepAlive: getNestJSStatus(),
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
            connectionLayer: 'error',
          },
        },
      },
      { status: 200 }
    )
  }
}
