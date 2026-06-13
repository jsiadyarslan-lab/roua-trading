// ═══════════════════════════════════════════════════════════════════════
// ROUA AI Council Bridge — Phase 5
//
// Bridges the analysis engines with the AI Council, enabling:
// - Pass real analysis data to AI (not just the asset name)
// - Allow each AI model to access specific engine results
// - Compare AI predictions with algorithmic results
// - Learn from AI: if AI is consistently right in a scenario, increase its weight
//
// This creates a feedback loop where the AI Council's predictions are
// continuously compared against the algorithmic engines' results, and
// the system learns which is more reliable in different scenarios.
// ═══════════════════════════════════════════════════════════════════════

// ── Types ───────────────────────────────────────────────────────────

/** AI model identifiers */
export type AIModel = 'gpt4' | 'claude' | 'gemini' | 'llama' | 'deepseek' | 'qwen';

/** Analysis data to send to AI */
export interface AIAnalysisPayload {
  /** Symbol */
  symbol: string;
  /** Current price */
  currentPrice: number;
  /** Timeframe */
  timeframe: string;
  /** Market regime */
  regime: string;
  /** Bayesian consensus */
  bayesian: {
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    posteriorBullish: number;
    posteriorBearish: number;
  };
  /** Key patterns detected (top 5) */
  keyPatterns: Array<{
    type: string;
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    labelAr: string;
  }>;
  /** SMC summary */
  smcSummary: {
    orderBlocks: number;
    fvgs: number;
    structureBreaks: number;
    lastBOSDirection: string;
  };
  /** Wyckoff summary */
  wyckoffSummary: {
    scheme: string;
    currentPhase: string;
    direction: string;
    keyEvents: string[];
  };
  /** Elliott summary */
  elliottSummary: {
    dominantDirection: string;
    waveType: string;
    confidence: number;
  };
  /** MTF confluence */
  mtfConfluence: {
    direction: string;
    score: number;
    agreeingTFs: number;
  };
  /** Support/Resistance levels */
  keyLevels: Array<{
    price: number;
    type: 'support' | 'resistance';
    strength: number;
  }>;
  /** Volume profile */
  volumeProfile: {
    poc: number;
    valueAreaHigh: number;
    valueAreaLow: number;
  };
  /** Algorithmic prediction */
  algorithmicPrediction: {
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    source: string;
  };
}

/** AI model prediction result */
export interface AIModelPrediction {
  /** Model identifier */
  model: AIModel;
  /** Predicted direction */
  direction: 'bullish' | 'bearish' | 'neutral';
  /** Confidence (0-1) */
  confidence: number;
  /** Reasoning (Arabic) */
  reasoningAr: string;
  /** Which analysis data the model found most compelling */
  keyFactors: string[];
  /** Timestamp */
  timestamp: number;
  /** Response time in ms */
  responseTimeMs: number;
}

/** Comparison between AI and algorithmic results */
export interface AIAlgorithmComparison {
  /** AI Council consensus */
  aiConsensus: {
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
  };
  /** Algorithmic engine consensus */
  algorithmicConsensus: {
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
  };
  /** Do they agree? */
  agree: boolean;
  /** Disagreement details */
  disagreement: string | null;
  /** Recommended action (when they disagree) */
  recommendation: 'follow_ai' | 'follow_algorithm' | 'wait' | 'no_consensus';
  /** Recommendation reason (Arabic) */
  recommendationReasonAr: string;
}

/** AI model performance tracking */
export interface AIModelPerformance {
  /** Model identifier */
  model: AIModel;
  /** Total predictions */
  totalPredictions: number;
  /** Correct predictions */
  correctPredictions: number;
  /** Win rate */
  winRate: number;
  /** EMA win rate (recent weighted) */
  emaWinRate: number;
  /** Current adaptive weight */
  adaptiveWeight: number;
  /** Per-regime performance */
  regimePerformance: Record<string, { total: number; correct: number }>;
  /** Average response time */
  avgResponseTimeMs: number;
  /** Last prediction timestamp */
  lastPredictionAt: number;
}

/** Complete AI Council result with bridge */
export interface AICouncilBridgeResult {
  /** Analysis payload sent to AI */
  payload: AIAnalysisPayload;
  /** Individual model predictions */
  predictions: AIModelPrediction[];
  /** Council consensus */
  consensus: {
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    modelsAgreeing: number;
    totalModels: number;
  };
  /** AI vs Algorithm comparison */
  comparison: AIAlgorithmComparison;
  /** Learning insights */
  insights: string[];
  /** Timestamp */
  timestamp: number;
}

// ── In-memory State ─────────────────────────────────────────────────

const modelPerformances = new Map<AIModel, AIModelPerformance>();
const predictionHistory: Array<{
  timestamp: number;
  symbol: string;
  aiDirection: string;
  algoDirection: string;
  actualDirection: string | null; // null = not yet verified
  aiCorrect: boolean | null;
  algoCorrect: boolean | null;
  regime: string;
}> = [];
const MAX_HISTORY = 500;
const PREDICTION_KEY = 'roua-ai-council-bridge';

// ── Persistence ─────────────────────────────────────────────────────

function loadState(): void {
  try {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(PREDICTION_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.modelPerformances) {
        for (const [key, value] of Object.entries(parsed.modelPerformances)) {
          modelPerformances.set(key as AIModel, value as AIModelPerformance);
        }
      }
      if (parsed.predictionHistory) {
        predictionHistory.push(...parsed.predictionHistory.slice(-MAX_HISTORY));
      }
    }
  } catch { /* not available */ }
}

function persistState(): void {
  try {
    if (typeof window === 'undefined') return;
    const mp: Record<string, AIModelPerformance> = {};
    for (const [key, value] of modelPerformances.entries()) {
      mp[key] = value;
    }
    localStorage.setItem(PREDICTION_KEY, JSON.stringify({
      modelPerformances: mp,
      predictionHistory: predictionHistory.slice(-MAX_HISTORY),
    }));
  } catch { /* not available */ }
}

loadState();

// ── Build Analysis Payload ──────────────────────────────────────────

/**
 * Build an AIAnalysisPayload from the current analysis results.
 * This is what gets sent to the AI Council for enhanced predictions.
 */
export function buildAIAnalysisPayload(opts: {
  symbol: string;
  currentPrice: number;
  timeframe: string;
  regime: string;
  bayesianResult?: {
    direction: string;
    confidence: number;
    posteriorBullish?: number;
    posteriorBearish?: number;
  };
  patterns?: Array<{
    type: string;
    direction: string;
    confidence: number;
    labelAr?: string;
  }>;
  smcData?: {
    orderBlocks?: any[];
    fvgs?: any[];
    structureBreaks?: any[];
  };
  wyckoffResult?: {
    scheme?: string;
    currentPhase?: string;
    direction?: string;
    events?: any[];
  };
  elliottResult?: {
    dominantCount?: {
      direction?: string;
      type?: string;
      confidence?: number;
    };
  };
  mtfResult?: {
    confluenceDirection?: string;
    confluenceScore?: number;
    agreeingTFs?: number;
  };
  srLevels?: Array<{
    price: number;
    type: string;
    strength: number;
  }>;
  volumeProfile?: {
    poc?: number;
    vah?: number;
    val?: number;
  };
}): AIAnalysisPayload {
  const {
    symbol, currentPrice, timeframe, regime,
    bayesianResult, patterns, smcData, wyckoffResult,
    elliottResult, mtfResult, srLevels, volumeProfile,
  } = opts;

  // Build key patterns (top 5 by confidence)
  const keyPatterns = (patterns || [])
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, 5)
    .map(p => ({
      type: p.type,
      direction: (p.direction || 'neutral') as 'bullish' | 'bearish' | 'neutral',
      confidence: p.confidence || 0.5,
      labelAr: p.labelAr || p.type,
    }));

  // SMC summary
  const smcSummary = {
    orderBlocks: smcData?.orderBlocks?.length || 0,
    fvgs: smcData?.fvgs?.length || 0,
    structureBreaks: smcData?.structureBreaks?.length || 0,
    lastBOSDirection: smcData?.structureBreaks?.find((b: any) => b.type === 'BOS')?.direction || 'none',
  };

  // Wyckoff summary
  const wyckoffSummary = {
    scheme: wyckoffResult?.scheme || 'none',
    currentPhase: wyckoffResult?.currentPhase || 'none',
    direction: wyckoffResult?.direction || 'neutral',
    keyEvents: (wyckoffResult?.events || []).slice(0, 5).map((e: any) => e.type || String(e)),
  };

  // Elliott summary
  const elliottSummary = {
    dominantDirection: elliottResult?.dominantCount?.direction || 'neutral',
    waveType: elliottResult?.dominantCount?.type || 'unknown',
    confidence: elliottResult?.dominantCount?.confidence || 0,
  };

  // MTF confluence
  const mtfConfluence = {
    direction: mtfResult?.confluenceDirection || 'neutral',
    score: mtfResult?.confluenceScore || 0,
    agreeingTFs: mtfResult?.agreeingTFs || 0,
  };

  // Algorithmic prediction from Bayesian
  const algorithmicPrediction = {
    direction: (bayesianResult?.direction || 'neutral') as 'bullish' | 'bearish' | 'neutral',
    confidence: bayesianResult?.confidence || 0,
    source: 'bayesian_consensus',
  };

  return {
    symbol,
    currentPrice,
    timeframe,
    regime,
    bayesian: {
      direction: (bayesianResult?.direction || 'neutral') as 'bullish' | 'bearish' | 'neutral',
      confidence: bayesianResult?.confidence || 0,
      posteriorBullish: bayesianResult?.posteriorBullish ?? 0.5,
      posteriorBearish: bayesianResult?.posteriorBearish ?? 0.5,
    },
    keyPatterns,
    smcSummary,
    wyckoffSummary,
    elliottSummary,
    mtfConfluence,
    keyLevels: (srLevels || []).slice(0, 6).map(l => ({
      price: l.price,
      type: l.type === 'support' ? 'support' as const : 'resistance' as const,
      strength: l.strength,
    })),
    volumeProfile: {
      poc: volumeProfile?.poc || 0,
      valueAreaHigh: volumeProfile?.vah || 0,
      valueAreaLow: volumeProfile?.val || 0,
    },
    algorithmicPrediction,
  };
}

// ── Build Prompt for AI ─────────────────────────────────────────────

/**
 * Build an Arabic-language prompt for the AI Council that includes
 * real analysis data. This allows the AI models to make informed
 * predictions rather than just guessing from the symbol name.
 */
export function buildAICouncilPrompt(payload: AIAnalysisPayload): string {
  const patternList = payload.keyPatterns
    .map(p => `${p.labelAr} (${p.direction === 'bullish' ? 'صاعد' : p.direction === 'bearish' ? 'هابط' : 'محايد'} — ثقة ${Math.round(p.confidence * 100)}%)`)
    .join('، ');

  const levelList = payload.keyLevels
    .map(l => `${l.type === 'support' ? 'دعم' : 'مقاومة'} عند ${l.price} (قوة ${Math.round(l.strength * 100)}%)`)
    .join('، ');

  return `حلل ${payload.symbol} (السعر الحالي: ${payload.currentPrice}) على فريم ${payload.timeframe}.

بيانات التحليل الخوارزمي:
- نظام السوق: ${payload.regime}
- إجماع بايزي: ${payload.bayesian.direction === 'bullish' ? 'صاعد' : payload.bayesian.direction === 'bearish' ? 'هابط' : 'محايد'} (ثقة ${Math.round(payload.bayesian.confidence * 100)}%)
- الأنماط المكتشفة: ${patternList || 'لا أنماط'}
- SMC: ${payload.smcSummary.orderBlocks} بلوك أوامر، ${payload.smcSummary.fvgs} فجوات قيمة، ${payload.smcSummary.structureBreaks} كسور هيكل (آخر BOS: ${payload.smcSummary.lastBOSDirection})
- ويكوف: مخطط ${payload.wyckoffSummary.scheme} — طور ${payload.wyckoffSummary.currentPhase} — اتجاه ${payload.wyckoffSummary.direction}
- إليوت: اتجاه ${payload.elliottSummary.dominantDirection} — ${payload.elliottSummary.waveType} (ثقة ${Math.round(payload.elliottSummary.confidence * 100)}%)
- تقارب MTF: ${payload.mtfConfluence.direction} (مجموع ${payload.mtfConfluence.score}% — ${payload.mtfConfluence.agreeingTFs} فريمات)
- مستويات: ${levelList || 'لا مستويات'}
- التوقع الخوارزمي: ${payload.algorithmicPrediction.direction} (ثقة ${Math.round(payload.algorithmicPrediction.confidence * 100)}%)

أعطِ توقعك: صاعد أو هابط أو محايد، مع مستوى الثقة والأسباب.`;
}

// ── Compare AI vs Algorithm ─────────────────────────────────────────

/**
 * Compare the AI Council's prediction with the algorithmic engine's prediction.
 * Returns a comparison with a recommendation on which to follow.
 */
export function compareAIWithAlgorithm(
  aiConsensus: { direction: 'bullish' | 'bearish' | 'neutral'; confidence: number },
  algorithmicConsensus: { direction: 'bullish' | 'bearish' | 'neutral'; confidence: number },
  payload: AIAnalysisPayload,
): AIAlgorithmComparison {
  const agree = aiConsensus.direction === algorithmicConsensus.direction;
  let disagreement: string | null = null;
  let recommendation: AIAlgorithmComparison['recommendation'];
  let recommendationReasonAr: string;

  if (agree) {
    recommendation = 'follow_ai'; // Both agree, any direction works
    recommendationReasonAr = 'الذكاء الاصطناعي والخوارزميات يتفقان — إشارة قوية';
  } else if (aiConsensus.direction === 'neutral' || algorithmicConsensus.direction === 'neutral') {
    // One is neutral — follow the one with a clear signal
    if (aiConsensus.direction === 'neutral') {
      recommendation = 'follow_algorithm';
      recommendationReasonAr = 'الذكاء الاصطناعي محايد — نتبع التوقع الخوارزمي';
      disagreement = `AI محايد لكن الخوارزمية ${algorithmicConsensus.direction}`;
    } else {
      recommendation = 'follow_ai';
      recommendationReasonAr = 'الخوارزمية محايدة — نتبع توقع الذكاء الاصطناعي';
      disagreement = `الخوارزمية محايدة لكن AI ${aiConsensus.direction}`;
    }
  } else {
    // Direct disagreement
    disagreement = `AI: ${aiConsensus.direction} vs خوارزمية: ${algorithmicConsensus.direction}`;

    // Use confidence and historical accuracy to decide
    const aiWeight = getAIConsensusWeight();
    const algoWeight = 1.0; // Baseline algorithm weight

    const aiScore = aiConsensus.confidence * aiWeight;
    const algoScore = algorithmicConsensus.confidence * algoWeight;

    if (Math.abs(aiScore - algoScore) < 0.1) {
      recommendation = 'wait';
      recommendationReasonAr = 'تعارض بين الذكاء الاصطناعي والخوارزميات — انتظر تأكيد إضافي';
    } else if (aiScore > algoScore) {
      recommendation = 'follow_ai';
      recommendationReasonAr = 'الذكاء الاصطناعي أكثر ثقة في هذا السيناريو';
    } else {
      recommendation = 'follow_algorithm';
      recommendationReasonAr = 'الخوارزميات أكثر ثقة في هذا السيناريو';
    }
  }

  return {
    aiConsensus,
    algorithmicConsensus,
    agree,
    disagreement,
    recommendation,
    recommendationReasonAr,
  };
}

// ── AI Model Performance Tracking ───────────────────────────────────

/**
 * Get the adaptive weight for the AI Council consensus based on
 * its historical performance vs the algorithmic engines.
 */
function getAIConsensusWeight(): number {
  // Check how often AI was right vs algorithms
  const verifiedPredictions = predictionHistory.filter(p => p.actualDirection !== null);
  if (verifiedPredictions.length < 5) return 1.0; // Not enough data

  const aiCorrect = verifiedPredictions.filter(p => p.aiCorrect === true).length;
  const algoCorrect = verifiedPredictions.filter(p => p.algoCorrect === true).length;
  const total = verifiedPredictions.length;

  const aiWinRate = aiCorrect / total;
  // If AI wins more than 55%, boost its weight; if less, reduce
  if (aiWinRate > 0.55) return 1.0 + (aiWinRate - 0.5) * 2;
  if (aiWinRate < 0.45) return 0.7;
  return 1.0;
}

/**
 * Record a prediction for later evaluation.
 */
export function recordPrediction(opts: {
  symbol: string;
  aiDirection: 'bullish' | 'bearish' | 'neutral';
  algoDirection: 'bullish' | 'bearish' | 'neutral';
  regime: string;
}): void {
  predictionHistory.push({
    timestamp: Date.now(),
    symbol: opts.symbol,
    aiDirection: opts.aiDirection,
    algoDirection: opts.algoDirection,
    actualDirection: null,
    aiCorrect: null,
    algoCorrect: null,
    regime: opts.regime,
  });
  if (predictionHistory.length > MAX_HISTORY) {
    predictionHistory.splice(0, predictionHistory.length - MAX_HISTORY);
  }
  persistState();
}

/**
 * Verify a past prediction against the actual price movement.
 * Should be called periodically (e.g., every few minutes).
 */
export function verifyPredictions(currentDirection: 'bullish' | 'bearish' | 'neutral'): void {
  const now = Date.now();
  const VERIFY_DELAY = 300000; // 5 minutes

  for (const pred of predictionHistory) {
    if (pred.actualDirection !== null) continue;
    if (now - pred.timestamp < VERIFY_DELAY) continue;

    pred.actualDirection = currentDirection;
    pred.aiCorrect = pred.aiDirection === currentDirection;
    pred.algoCorrect = pred.algoDirection === currentDirection;
  }

  persistState();
}

/**
 * Record an individual AI model's prediction for performance tracking.
 */
export function recordModelPrediction(model: AIModel, prediction: AIModelPrediction): void {
  let perf = modelPerformances.get(model);
  if (!perf) {
    perf = {
      model,
      totalPredictions: 0,
      correctPredictions: 0,
      winRate: 0.5,
      emaWinRate: 0.5,
      adaptiveWeight: 1.0,
      regimePerformance: {},
      avgResponseTimeMs: 0,
      lastPredictionAt: Date.now(),
    };
    modelPerformances.set(model, perf);
  }

  perf.totalPredictions++;
  perf.lastPredictionAt = Date.now();
  perf.avgResponseTimeMs = (perf.avgResponseTimeMs * 0.8) + (prediction.responseTimeMs * 0.2);

  persistState();
}

/**
 * Record when a model's prediction was verified as correct or incorrect.
 */
export function recordModelOutcome(model: AIModel, wasCorrect: boolean): void {
  const perf = modelPerformances.get(model);
  if (!perf) return;

  if (wasCorrect) perf.correctPredictions++;
  // V225 FIX: Guard against division by zero if totalPredictions is corrupted
  perf.winRate = perf.totalPredictions > 0 ? perf.correctPredictions / perf.totalPredictions : 0;

  // EMA update
  const alpha = 0.15;
  perf.emaWinRate = alpha * (wasCorrect ? 1 : 0) + (1 - alpha) * perf.emaWinRate;

  // Adaptive weight
  if (perf.totalPredictions >= 5) {
    perf.adaptiveWeight = Math.min(2.0, Math.max(0.5, 1.0 + (perf.emaWinRate - 0.5) * 2));
  }

  persistState();
}

// ── Query Functions ─────────────────────────────────────────────────

/** Get all model performances */
export function getModelPerformances(): AIModelPerformance[] {
  return Array.from(modelPerformances.values());
}

/** Get prediction history */
export function getPredictionHistory(): typeof predictionHistory {
  return [...predictionHistory];
}

/** Get AI vs Algorithm win rate comparison */
export function getAIvsAlgoStats(): {
  totalVerified: number;
  aiWinRate: number;
  algoWinRate: number;
  aiBetter: boolean;
  agreementRate: number;
  bestModel: AIModel | null;
} {
  const verified = predictionHistory.filter(p => p.actualDirection !== null);
  if (verified.length === 0) {
    return { totalVerified: 0, aiWinRate: 0, algoWinRate: 0, aiBetter: false, agreementRate: 0, bestModel: null };
  }

  const aiCorrect = verified.filter(p => p.aiCorrect === true).length;
  const algoCorrect = verified.filter(p => p.algoCorrect === true).length;
  const agreed = verified.filter(p => p.aiDirection === p.algoDirection).length;

  const models = Array.from(modelPerformances.values());
  const bestModel = models.sort((a, b) => b.emaWinRate - a.emaWinRate)[0]?.model ?? null;

  return {
    totalVerified: verified.length,
    aiWinRate: Math.round((aiCorrect / verified.length) * 100) / 100,
    algoWinRate: Math.round((algoCorrect / verified.length) * 100) / 100,
    aiBetter: aiCorrect > algoCorrect,
    agreementRate: Math.round((agreed / verified.length) * 100) / 100,
    bestModel,
  };
}
