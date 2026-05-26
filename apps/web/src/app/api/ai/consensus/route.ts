import { NextRequest, NextResponse } from 'next/server'
import {
  buildMultiTimeframeSnapshot,
  buildScannerResult,
  fetchMarketContext,
} from '@/lib/trading-intelligence'
import { runDirectCouncilConsensus, getAvailableModelKeys } from '@/lib/ai-direct-calls'
import { db, ensureDbReady } from '@/lib/db'

type Vote = 'BUY' | 'SELL' | 'HOLD'

// ── Bilingual text helper for Layer 3 scanner-rules ──
function L3(lang: 'ar' | 'en' | 'fr' | 'tr') {
  if (lang === 'tr') return {
    council: 'Konsey',
    techAnalyst: 'Teknik Analist',
    sentAnalyst: 'Duygu Analisti',
    riskExpert: 'Risk Uzmanı',
    macroExpert: 'Makro Uzmanı',
    patternExpert: 'Formasyon Uzmanı',
    execStrategist: 'İşlem Stratejisti',
    noContextReason: 'Şu anda güvenilir piyasa bağlamı oluşturulamıyor, bu nedenle öneri veriler dönene kadar bekleme durumuna düşürüldü.',
    councilProtection: 'Konsey, piyasa verilerinin bu anda yetersiz veya güvenilir olmaması nedeniyle koruma moduna girdi.',
    waitUntilAI: `AI modelleri çevrimiçi olana kadar bu sembolü bekleyin, ardından herhangi bir karar öncesi yeniden değerlendirin.`,
    techReason: (reasons: string[], rsi: number, ema20: number, ema50: number) =>
      `${reasons.join(', ')}. RSI ${Math.round(rsi)} | EMA20 ${ema20.toFixed(2)} | EMA50 ${ema50.toFixed(2)}.`,
    sentReason: (change: number, dir: string, tf: string) =>
      `24 saatlik değişim ${change >= 0 ? '+' : ''}${change.toFixed(2)}%, ${tf} zaman diliminde ${dir} bağlamıyla.`,
    riskReason: (spreadRisk: string, freshness: string, isFresh: boolean) =>
      `Risk seviyesi ${spreadRisk}. Veri durumu: ${freshness}. ${!isFresh ? 'Güven yalnızca düşürüldü, sinyal tamamen iptal edilmedi.' : 'Hesaplanan risk kabul edilebilir.'}`,
    macroReason: (daily: string, h4: string, hint: string) =>
      `Günlük zaman dilimi ${daily}, 4H ${h4}. ${hint}.`,
    patternReason: (signalClass: string, entryBias: string, range: number) =>
      `Mevcut fırsat sınıflandırması ${signalClass}, ${entryBias} eğilimiyle. Aralık genişlemesi ${range.toFixed(2)}%.`,
    execReason: (daily: string, h4: string, h1: string, m15: string) =>
      `Rejim: Günlük ${daily} → 4H ${h4} → 1H ${h1} → 15m ${m15}.`,
    high: 'Yüksek', medium: 'Orta', low: 'Düşük',
    recBuy: 'Al', recSell: 'Sat', recHold: 'Bekle',
    recStrong: 'Güçlü', recClear: 'Net', recProbable: 'Olası',
    consensusFallback: (totalModels: number, recLabel: string, recStrength: string, consensusScore: number) =>
      `Konsey uzlaşısı (${totalModels} model): ${recLabel} ${recStrength}, %${consensusScore} güvenle.`,
    conflictCounterTrend: 'Yüksek zaman dilimi ile kısa tetikleyici arasında çelişki var, ancak mevcut momentum konseyin öneriyi tamamen iptal etmek yerine temkinli kalmasını sağlayacak kadar.',
    conflictRiskVsTech: 'Teknik analiz bir fırsat görüyor, ancak risk katmanı veri kalitesi veya volatilite nedeniyle saldırganlığı düşürdü.',
    conflictBalanced: 'Temel roller dengeli, bu nedenle konsey daha net bir boşluk ortaya çıkana kadar piyasayı izlemekten memnun.',
    conflictAligned: 'Temel roller nispeten uyumlu ve mevcut kararda temel bir çelişki yok.',
    masterStrategy: (recLabel: string, symbol: string, score: number, signalClass: string, entryBias: string, hint: string, conflict: string) =>
      `${symbol} üzerinde ${recLabel}, %${score} uzlaşı ile, ${signalClass} sınıflandırması ve ${entryBias} eğilimi. ${hint} ${conflict}`,
    errorReason: (msg: string) => msg || 'Uzlaşı motorunda iç hata, önleyici bekleme modu etkinleştirildi.',
    errorConflict: 'İç hata nedeniyle konsey yedek modu etkinleştirildi, şu anda saldırgan bir öneriye izin verilmiyor.',
    errorMasterStrategy: 'Analizin tamamlanmasını ve konsey motorunun normal işleyişe dönmesini bekleyin.',
  }
  if (lang === 'en') return {
    council: 'Council',
    techAnalyst: 'Technical Analyst',
    sentAnalyst: 'Sentiment Analyst',
    riskExpert: 'Risk Expert',
    macroExpert: 'Macro Expert',
    patternExpert: 'Pattern Expert',
    execStrategist: 'Execution Strategist',
    noContextReason: 'Unable to build reliable market context right now, so the recommendation was downgraded to wait until data returns.',
    councilProtection: 'The council entered protection mode because market data was insufficient or unreliable at this moment.',
    waitUntilAI: `Wait on this symbol until AI models come back online, then reassess before any decision.`,
    techReason: (reasons: string[], rsi: number, ema20: number, ema50: number) =>
      `${reasons.join(', ')}. RSI ${Math.round(rsi)} | EMA20 ${ema20.toFixed(2)} | EMA50 ${ema50.toFixed(2)}.`,
    sentReason: (change: number, dir: string, tf: string) =>
      `24h change ${change >= 0 ? '+' : ''}${change.toFixed(2)}%, with ${dir} context on ${tf} timeframe.`,
    riskReason: (spreadRisk: string, freshness: string, isFresh: boolean) =>
      `Risk level ${spreadRisk}. Data status: ${freshness}. ${!isFresh ? 'Confidence was reduced only, signal not fully cancelled.' : 'Calculated risk is acceptable.'}`,
    macroReason: (daily: string, h4: string, hint: string) =>
      `Daily timeframe ${daily}, 4H ${h4}. ${hint}.`,
    patternReason: (signalClass: string, entryBias: string, range: number) =>
      `Current opportunity classification ${signalClass} with bias ${entryBias}. Range expansion ${range.toFixed(2)}%.`,
    execReason: (daily: string, h4: string, h1: string, m15: string) =>
      `Regime: Daily ${daily} → 4H ${h4} → 1H ${h1} → 15m ${m15}.`,
    high: 'High', medium: 'Medium', low: 'Low',
    recBuy: 'Buy', recSell: 'Sell', recHold: 'Hold',
    recStrong: 'Strong', recClear: 'Clear', recProbable: 'Probable',
    consensusFallback: (totalModels: number, recLabel: string, recStrength: string, consensusScore: number) =>
      `Council consensus (${totalModels} models): ${recLabel} ${recStrength} with ${consensusScore}% confidence.`,
    conflictCounterTrend: 'There is a conflict between the higher timeframe and the short trigger, but current momentum is sufficient to keep the council cautious rather than cancelling the recommendation entirely.',
    conflictRiskVsTech: 'Technical analysis sees an opportunity, but the risk layer reduced aggression due to data quality or volatility.',
    conflictBalanced: 'Core roles are balanced, so the council is content to monitor the market until a clearer gap emerges.',
    conflictAligned: 'Core roles are relatively aligned and there is no fundamental conflict in the current decision.',
    masterStrategy: (recLabel: string, symbol: string, score: number, signalClass: string, entryBias: string, hint: string, conflict: string) =>
      `${recLabel} on ${symbol} with ${score}% consensus, classified as ${signalClass} with ${entryBias} bias. ${hint} ${conflict}`,
    errorReason: (msg: string) => msg || 'Internal consensus engine failure, precautionary wait mode activated.',
    errorConflict: 'Council fallback activated due to internal error, so no aggressive recommendation is allowed right now.',
    errorMasterStrategy: 'Wait until analysis is complete and the council engine returns to normal operation.',
  }
  return {
    council: 'المجلس',
    techAnalyst: 'المحلل الفني',
    sentAnalyst: 'محلل المشاعر',
    riskExpert: 'خبير المخاطر',
    macroExpert: 'خبير الماكرو',
    patternExpert: 'خبير الأنماط',
    execStrategist: 'استراتيجي التنفيذ',
    noContextReason: 'تعذر بناء سياق سوق موثوق الآن، لذلك تم خفض التوصية إلى الانتظار حتى تعود البيانات.',
    councilProtection: 'المجلس دخل وضع الحماية لأن بيانات السوق لم تكن كافية أو موثوقة عند هذه اللحظة.',
    waitUntilAI: `الانتظار على هذا الرمز حتى تعود نماذج الذكاء الاصطناعي للعمل، ثم إعادة التقييم قبل أي قرار.`,
    techReason: (reasons: string[], rsi: number, ema20: number, ema50: number) =>
      `${reasons.join('، ')}. RSI ${Math.round(rsi)} | EMA20 ${ema20.toFixed(2)} | EMA50 ${ema50.toFixed(2)}.`,
    sentReason: (change: number, dir: string, tf: string) =>
      `تغير 24 ساعة ${change >= 0 ? '+' : ''}${change.toFixed(2)}%، مع سياق ${dir} على الإطار ${tf}.`,
    riskReason: (spreadRisk: string, freshness: string, isFresh: boolean) =>
      `مستوى الخطر ${spreadRisk}. حالة البيانات: ${freshness}. ${!isFresh ? 'تم تخفيض الثقة فقط، لا إلغاء الإشارة بالكامل.' : 'يمكن السماح بالمخاطرة المقننة.'}`,
    macroReason: (daily: string, h4: string, hint: string) =>
      `الإطار اليومي ${daily}، و4H ${h4}. ${hint}.`,
    patternReason: (signalClass: string, entryBias: string, range: number) =>
      `تصنيف الفرصة الحالي ${signalClass} مع bias ${entryBias}. اتساع النطاق ${range.toFixed(2)}%.`,
    execReason: (daily: string, h4: string, h1: string, m15: string) =>
      `النظام: يومي ${daily} → 4H ${h4} → 1H ${h1} → 15m ${m15}.`,
    high: 'مرتفع', medium: 'متوسط', low: 'منخفض',
    recBuy: 'شراء', recSell: 'بيع', recHold: 'انتظار',
    recStrong: 'قوي', recClear: 'واضح', recProbable: 'محتمل',
    consensusFallback: (totalModels: number, recLabel: string, recStrength: string, consensusScore: number) =>
      `إجماع المجلس (${totalModels} نماذج): ${recLabel} ${recStrength} بنسبة ثقة ${consensusScore}%.`,
    conflictCounterTrend: 'هناك تعارض بين الإطار الأعلى والزناد القصير، لكن الزخم الحالي كافٍ لإبقاء المجلس حذرًا بدلًا من إلغاء التوصية بالكامل.',
    conflictRiskVsTech: 'التحليل الفني يرى فرصة، لكن طبقة المخاطر خفّضت الاندفاع بسبب جودة البيانات أو التذبذب.',
    conflictBalanced: 'الأدوار الأساسية متوازنة، لذلك يكتفي المجلس بمتابعة السوق حتى يظهر فرق أوضح.',
    conflictAligned: 'الأدوار الأساسية متوافقة نسبيًا ولا يوجد تعارض جوهري في القرار الحالي.',
    masterStrategy: (recLabel: string, symbol: string, score: number, signalClass: string, entryBias: string, hint: string, conflict: string) =>
      `${recLabel} على ${symbol} بإجماع ${score}%، مع تصنيف ${signalClass} وانحياز ${entryBias}. ${hint} ${conflict}`,
    errorReason: (msg: string) => msg || 'فشل داخلي في محرك الإجماع، وتم تفعيل وضع الانتظار الوقائي.',
    errorConflict: 'تم تفعيل fallback للمجلس بسبب خطأ داخلي، لذلك لا يتم السماح بتوصية هجومية الآن.',
    errorMasterStrategy: 'الانتظار حتى يكتمل التحليل ويعود محرك المجلس للعمل الطبيعي.',
  }
}

function extractProviderFromModel(model: string): string {
  const lower = (model || '').toLowerCase()
  if (lower.includes('groq')) return 'groq'
  if (lower.includes('gemini')) return 'gemini'
  if (lower.includes('glm')) return 'glm'
  if (lower.includes('huggingface') || lower.includes('hf')) return 'huggingface'
  if (lower.includes('ollama')) return 'ollama'
  if (lower.includes('bedrock') || lower.includes('claude')) return 'bedrock'
  if (lower.includes('deepseek')) return 'deepseek'
  if (lower.includes('cerebras')) return 'cerebras'
  if (lower.includes('nvidia')) return 'nvidia'
  if (lower.includes('mistral')) return 'mistral'
  if (lower.includes('openrouter')) {
    if (lower.includes(':free')) return 'openrouter'
    return 'openrouter-paid'
  }
  if (lower.includes('cache/') || lower.includes('cache:')) return 'cache'
  if (lower.includes('orchestrator') || lower.includes('fallback')) return 'system'
  return 'unknown'
}

function toVote(dir: 'buy' | 'sell' | 'neutral'): Vote {
  return dir === 'buy' ? 'BUY' : dir === 'sell' ? 'SELL' : 'HOLD'
}

function directionLabel(dir: 'buy' | 'sell' | 'neutral', language: 'ar' | 'en' = 'ar') {
  if (language === 'en') return dir === 'buy' ? 'Bullish' : dir === 'sell' ? 'Bearish' : 'Neutral'
  return dir === 'buy' ? 'صاعد' : dir === 'sell' ? 'هابط' : 'محايد'
}

// FIX: Recalculate consensus from merged analyses (not just Layer 2)
// When Layer 1 + Layer 2 results are merged, the consensusScore and recommendation
// must reflect the MERGED set, not just one layer's values.
function recalculateConsensus(analyses: any[]): { consensusScore: number; recommendation: 'BUY' | 'SELL' | 'HOLD' } {
  let buyWeight = 0, sellWeight = 0, holdWeight = 0, totalConfidence = 0
  let buyConfidences: number[] = [], sellConfidences: number[] = [], holdConfidences: number[] = []

  for (const a of analyses) {
    const conf = (a.confidence || 50) / 100
    if (a.vote === 'BUY') { buyWeight += conf; buyConfidences.push(conf) }
    else if (a.vote === 'SELL') { sellWeight += conf; sellConfidences.push(conf) }
    else { holdWeight += conf; holdConfidences.push(conf) }
    totalConfidence += conf
  }

  if (totalConfidence === 0) return { consensusScore: 0, recommendation: 'HOLD' }

  const buyPct = buyWeight / totalConfidence
  const sellPct = sellWeight / totalConfidence
  const holdPct = holdWeight / totalConfidence

  let recommendation: 'BUY' | 'SELL' | 'HOLD' = 'HOLD'
  let consensusScore = 0

  if (buyPct > sellPct && buyPct > holdPct) {
    recommendation = 'BUY'
    consensusScore = buyConfidences.length > 0
      ? Math.round(buyConfidences.reduce((a, b) => a + b, 0) / buyConfidences.length * 100)
      : Math.round(buyPct * 100)
  } else if (sellPct > buyPct && sellPct > holdPct) {
    recommendation = 'SELL'
    consensusScore = sellConfidences.length > 0
      ? Math.round(sellConfidences.reduce((a, b) => a + b, 0) / sellConfidences.length * 100)
      : Math.round(sellPct * 100)
  } else {
    recommendation = 'HOLD'
    consensusScore = holdConfidences.length > 0
      ? Math.round(holdConfidences.reduce((a, b) => a + b, 0) / holdConfidences.length * 100)
      : Math.round((1 - Math.abs(buyPct - sellPct)) * 50)
  }

  return { consensusScore, recommendation }
}

// ═══════════════════════════════════════════════════════════════
// PERSISTENT AI CACHE — Short TTL, only for same-symbol dedup
// ═══════════════════════════════════════════════════════════════
const aiResultCache = new Map<string, { data: any; source: string; cachedAt: number }>()
const AI_CACHE_TTL = 3 * 60 * 1000 // FIX: Reduced to 3 minutes for faster UI updates

function getCachedAIResult(symbol: string): { data: any; source: string } | null {
  // FIX: Use v4 namespace to invalidate stale pre-fix cached results
  // that had contradictory labels (89% HOLD) or slow HuggingFace timeouts.
  // Old v1/v2/v3 entries won't match.
  const entry = aiResultCache.get(`v4:${symbol}`)
  if (!entry) return null
  const age = Date.now() - entry.cachedAt
  if (age > AI_CACHE_TTL) {
    aiResultCache.delete(`v4:${symbol}`)  // FIX: Was deleting wrong key (symbol without v4: prefix) → memory leak
    return null
  }
  return { data: entry.data, source: entry.source }
}

function setCachedAIResult(symbol: string, data: any, source: string) {
  // FIX: Use v4 namespace to match getCachedAIResult()
  aiResultCache.set(`v4:${symbol}`, { data, source, cachedAt: Date.now() })
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
  let language: 'ar' | 'en' = 'ar'
  try {
    const body = await req.json()
    const symbol = body.symbol || 'BTC/USD'
    language = body.language === 'en' ? 'en' : 'ar'
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
      'http://127.0.0.1:3001',
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
    //
    // UPDATE: The NestJS /api/ai/consensus endpoint is now marked @Public(),
    // so it accepts requests without auth. The guest token mechanism is
    // kept as a fallback but is no longer the primary auth path.
    let sessionToken = req.cookies.get('roua_session')?.value || ''

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
          body: JSON.stringify({ symbol, language }),
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
        const directResult = await runDirectCouncilConsensus(symbol, language)

        if (directResult.success && directResult.data.analyses.length > 0) {
          // FIX: Log Layer 2 AI calls to AiUsageLog so costs are visible in dashboard
          try {
            const dbReady = await ensureDbReady()
            if (dbReady) {
              await db.aiUsageLog.create({
                data: {
                  id: `aul_l2_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                  userId: null,
                  model: directResult.data.analyses.map((a: any) => a.model).filter(Boolean).join(','),
                  provider: extractProviderFromModel(directResult.data.analyses[0]?.model || ''),
                  endpoint: 'consensus-layer2',
                  inputTokens: directResult.data.meta?.modelsResponded ? Math.ceil(directResult.data.meta.modelsResponded * 300) : 0,
                  outputTokens: directResult.data.analyses.reduce((sum: number, a: any) => sum + Math.ceil((a.reason?.length || 0) / 3), 0),
                  costUsd: 0, // Free models or estimated
                  latencyMs: directResult.data.meta?.processingTimeMs || 0,
                  cached: false,
                  success: true,
                  errorMessage: null,
                },
              })
            }
          } catch (logErr) {
            // Non-critical — don't block consensus if logging fails
            console.warn('[consensus] Failed to log Layer 2 usage:', logErr)
          }

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

            // FIX: Recalculate consensus from MERGED analyses (not just Layer 2)
            const { consensusScore, recommendation } = recalculateConsensus(mergedAnalyses)
            const l3t = L3(language)
            const recLabel = recommendation === 'BUY' ? l3t.recBuy : recommendation === 'SELL' ? l3t.recSell : l3t.recHold
            const recStrength = consensusScore >= 80 ? l3t.recStrong : consensusScore >= 60 ? l3t.recClear : l3t.recProbable
            const masterStrategy = directResult.data.masterStrategy || l3t.consensusFallback(totalModels, recLabel, recStrength, consensusScore)

            const result = {
              success: true,
              source: mergedSource,
              data: {
                ...directResult.data,
                analyses: mergedAnalyses,
                consensusScore,
                recommendation,
                masterStrategy,
                meta: {
                  ...directResult.data.meta,
                  modelsResponded: totalModels,
                  modelsExpected: (layer1Result.modelCount || 0) + (directResult.data.meta?.modelsExpected || l2Analyses.length),
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
      const ageSeconds = Math.round((Date.now() - (aiResultCache.get(`v4:${symbol}`)?.cachedAt || 0)) / 1000)
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
    const l3 = L3(language)

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
              role: l3.council,
              model: 'Fallback/Guard',
              vote: 'HOLD',
              confidence: 42,
              reason: l3.noContextReason,
              featuresUsed: ['fallback'],
            },
          ],
          conflictExplanation: l3.councilProtection,
          masterStrategy: l3.waitUntilAI,
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
    const spreadRisk = Math.abs(scanner.change) > 3.5 ? l3.high : Math.abs(scanner.change) > 1.5 ? l3.medium : l3.low

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
        role: l3.techAnalyst,
        model: 'Scanner/FeatureEngine',
        vote: technicalVote,
        confidence: scanner.strength,
        reason: l3.techReason(scanner.reasons, features.rsi, features.ema20, features.ema50),
        featuresUsed: ['rsi', 'ema20', 'ema50', 'slope20'],
      },
      {
        role: l3.sentAnalyst,
        model: 'Scanner/MomentumLayer',
        vote: sentimentVote,
        confidence: Math.min(90, Math.round(52 + Math.abs(scanner.change) * 9)),
        reason: l3.sentReason(scanner.change, directionLabel(scanner.dir, language), scanner.timeframe),
        featuresUsed: ['changePercent', 'freshness'],
      },
      {
        role: l3.riskExpert,
        model: 'Risk/GuardRail',
        vote: riskVote,
        confidence: scanner.freshness === 'fresh' ? 76 : scanner.freshness === 'stale' ? 58 : 44,
        reason: l3.riskReason(spreadRisk, scanner.freshness, scanner.freshness === 'fresh'),
        featuresUsed: ['freshness', 'rangeExpansion'],
      },
      {
        role: l3.macroExpert,
        model: 'MTF/RegimeEngine',
        vote: macroVote,
        confidence: mtf.alignment === 'strong' ? 84 : mtf.alignment === 'mixed' ? 64 : 50,
        reason: l3.macroReason(directionLabel(mtf.regime, language), directionLabel(mtf.bias, language), mtf.executionHint),
        featuresUsed: ['regime', 'bias', 'alignment'],
      },
      {
        role: l3.patternExpert,
        model: 'Scanner/PatternClassifier',
        vote: patternVote,
        confidence: scanner.signalClass === 'watch' ? 54 : 76,
        reason: l3.patternReason(scanner.signalClass, scanner.entryBias, features.rangeExpansion),
        featuresUsed: ['signalClass', 'entryBias', 'rangeExpansion'],
      },
      {
        role: l3.execStrategist,
        model: 'Execution/AlignmentPolicy',
        vote: executionVote,
        confidence: mtf.alignment === 'strong' ? 86 : mtf.alignment === 'mixed' ? 67 : 45,
        reason: l3.execReason(directionLabel(mtf.regime, language), directionLabel(mtf.bias, language), directionLabel(mtf.setup, language), directionLabel(mtf.trigger, language)),
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
        ? l3.conflictCounterTrend
        : riskVote === 'HOLD' && technicalVote !== 'HOLD'
          ? l3.conflictRiskVsTech
          : recommendation === 'HOLD'
            ? l3.conflictBalanced
            : l3.conflictAligned

    const recLabel = recommendation === 'BUY' ? l3.recBuy : recommendation === 'SELL' ? l3.recSell : l3.recHold
    const masterStrategy = l3.masterStrategy(recLabel, symbol, consensusScore, scanner.signalClass, scanner.entryBias, mtf.executionHint, conflictExplanation)

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
    const l3e = L3(language)
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
              role: l3e.council,
              model: 'Fallback/Error',
              vote: 'HOLD',
              confidence: 35,
              reason: l3e.errorReason(error?.message),
              featuresUsed: ['error-fallback'],
            },
          ],
          conflictExplanation: l3e.errorConflict,
          masterStrategy: l3e.errorMasterStrategy,
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
