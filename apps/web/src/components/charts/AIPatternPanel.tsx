// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — AI Pattern Recognition Panel
// Professional design — click any pattern to navigate chart
// Draws patterns visually on chart, trend lines, entry/exit
// ═══════════════════════════════════════════════════════════

'use client';

import React, { useState, useCallback, useRef } from 'react';
import type { AIPattern, CandleData, AIEntryExit } from '@/lib/charts/types';
import { ScopedStyle } from '@/components/ScopedStyle';
import { useTranslations, useLocale } from 'next-intl';
import { detectHarmonicPatterns, detectClassicPatterns } from '@/lib/charts/HarmonicPatterns';
import { runPatternEngine, type DetectedPattern } from '@/lib/charts/pattern-engine';
import { drawAllPatterns, clearAllPatterns } from '@/lib/charts/pattern-renderer';
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore';
import { useNotificationStore } from '@/hooks/useNotificationStore';
// ── Revolutionary Feature Engines ──
import { getBayesianEngine, extractSignalsFromAnalysis, type BayesianConsensus } from '@/lib/charts/BayesianEngine';
import { getPatternStateMachine, type PatternStateMachineResult } from '@/lib/charts/PatternStateMachine';
import { getPatternAudioAlerter } from '@/lib/charts/AudioAlerts';
import { calcAdaptiveTPSL, getDynamicThresholds, adjustQualityForVolatility, type AdaptiveTPSL } from '@/lib/charts/ATRAdapter';
import { detectElliottSMCFusion, type ElliottSMCFusion as ElliottSMCFusionResult } from '@/lib/charts/ElliottSMCFusion';
import { getPatternPerformanceTracker, type PatternTypeStats } from '@/lib/charts/PatternPerformance';
import { buildHeatmap, type HeatmapResult as HeatmapOverlay } from '@/lib/charts/ConfidenceHeatmap';
import { detectSMC } from '@/lib/charts/SMCDetector';
import { detectElliottWaves } from '@/lib/charts/ElliottWave';
import { detectWyckoff } from '@/lib/charts/WyckoffAnalysis';
import { calcVolumeProfile } from '@/lib/charts/VolumeProfile';
import { detectGeometricPatterns } from '@/lib/charts/GeometricPatterns';

export interface SupportResistanceLevel {
  price: number;
  type: 'support' | 'resistance';
  strength: 'weak' | 'medium' | 'strong';
  touches: number;
}

export interface TrendLine {
  type: 'ascending' | 'descending';
  startPoint: { time: number; price: number };
  endPoint: { time: number; price: number };
  strength: 'weak' | 'medium' | 'strong';
}

export interface AIAnalysisResult {
  patterns: AIPattern[];
  supportLevels: SupportResistanceLevel[];
  resistanceLevels: SupportResistanceLevel[];
  trendLines: TrendLine[];
  entryExit?: AIEntryExit | null;
  smcData?: {
    orderBlocks: import('@/lib/charts/SMCDetector').OrderBlock[];
    fvgs: import('@/lib/charts/SMCDetector').FairValueGap[];
    structureBreaks: import('@/lib/charts/SMCDetector').StructureBreak[];
  };
  geoPatterns?: import('@/lib/charts/GeometricPatterns').GeometricPattern[];
  elliottPattern?: import('@/lib/charts/ElliottWave').ElliottPattern | null;
  wyckoff?: import('@/lib/charts/WyckoffAnalysis').WyckoffResult;
  volumeProfile?: import('@/lib/charts/VolumeProfile').VolumeProfileResult;
  overlays?: { sr: boolean; trend: boolean; harmonic: boolean; fvg: boolean; bos: boolean; geo: boolean; ew: boolean; wyckoff: boolean; vp: boolean; entry: boolean };
}

interface AIPatternPanelProps {
  symbol: string;
  candles: CandleData[];
  chartApiRef?: React.MutableRefObject<any>;
  lcRef?: React.MutableRefObject<any>;
  onPatternsDetected: (result: AIAnalysisResult) => void;
  onPatternClick?: (pattern: AIPattern) => void;
  onLevelClick?: (level: SupportResistanceLevel) => void;
  onTrendLineClick?: (trendLine: TrendLine) => void;
  onEntryExitClick?: (entryExit: AIEntryExit) => void;
  onClose: () => void;
}

const PATTERN_KEYS: Record<string, string> = {
  'Doji': 'patternDoji',
  'Hammer': 'patternHammer',
  'Inverted Hammer': 'patternInvertedHammer',
  'Engulfing Bullish': 'patternEngulfingBullish',
  'Engulfing Bearish': 'patternEngulfingBearish',
  'Morning Star': 'patternMorningStar',
  'Evening Star': 'patternEveningStar',
  'Three White Soldiers': 'patternThreeWhiteSoldiers',
  'Three Black Crows': 'patternThreeBlackCrows',
  'Harami Bullish': 'patternHaramiBullish',
  'Harami Bearish': 'patternHaramiBearish',
  'Piercing Line': 'patternPiercingLine',
  'Dark Cloud Cover': 'patternDarkCloudCover',
  'Spinning Top': 'patternSpinningTop',
  'Marubozu': 'patternMarubozu',
  'Tweezer Top': 'patternTweezerTop',
  'Tweezer Bottom': 'patternTweezerBottom',
  'Rising Three Methods': 'patternRisingThreeMethods',
  'Falling Three Methods': 'patternFallingThreeMethods',
  'Abandoned Baby': 'patternAbandonedBaby',
  'Dragonfly Doji': 'patternDragonflyDoji',
  'Gravestone Doji': 'patternGravestoneDoji',
  'Shooting Star': 'patternShootingStar',
  'Belt Hold Bullish': 'patternBeltHoldBullish',
  'Belt Hold Bearish': 'patternBeltHoldBearish',
};

// Fallback Arabic names for use outside the component (e.g., detectLocalPatterns)
const PATTERN_NAMES_AR: Record<string, string> = {
  'Doji': 'دوجي',
  'Hammer': 'مطرقة',
  'Inverted Hammer': 'مطرقة مقلوبة',
  'Engulfing Bullish': 'ابتلاع صعودي',
  'Engulfing Bearish': 'ابتلاع هبوطي',
  'Morning Star': 'نجمة الصباح',
  'Evening Star': 'نجمة المساء',
  'Three White Soldiers': 'ثلاثة جنود بيض',
  'Three Black Crows': 'ثلاثة غربان سود',
  'Harami Bullish': 'هارامي صعودي',
  'Harami Bearish': 'هارامي هبوطي',
  'Piercing Line': 'خط ثاقب',
  'Dark Cloud Cover': 'غطاء سحابة مظلم',
  'Spinning Top': 'قمة دوارة',
  'Marubozu': 'ماروبوزو',
  'Tweezer Top': 'ملقط علوي',
  'Tweezer Bottom': 'ملقط سفلي',
  'Rising Three Methods': 'طرق صاعدة ثلاثية',
  'Falling Three Methods': 'طرق هابطة ثلاثية',
  'Abandoned Baby': 'طفل مهجور',
  'Dragonfly Doji': 'دوجي يعسوب',
  'Gravestone Doji': 'دوجي شاهد قبر',
  'Shooting Star': 'نجم ساقط',
  'Belt Hold Bullish': 'حزام صعودي',
  'Belt Hold Bearish': 'حزام هبوطي',
};

const PATTERN_ICONS: Record<string, string> = {
  'bullish': '▲',
  'bearish': '▼',
  'neutral': '◆',
};

const C = {
  bg: 'rgba(11,14,20,0.96)',
  card: '#111620',
  cardHover: '#151D2B',
  border: '#1E2530',
  borderActive: 'rgba(0,212,255,0.35)',
  cyan: '#00D4FF',
  text: '#F0F2F5',
  textDim: '#8B92A8',
  textMuted: '#4B5563',
  success: '#00FFA3',
  danger: '#FF4757',
  warning: '#fbbf24',
  gold: '#d4af37',
  upBg: 'rgba(0,255,163,0.06)',
  downBg: 'rgba(255,71,87,0.06)',
};

// V164: engine tab active
type TabKey = 'patterns' | 'sr' | 'trend' | 'entry' | 'engine' | 'bayesian';

export function AIPatternPanel({
  symbol,
  candles,
  onPatternsDetected,
  onPatternClick,
  onLevelClick,
  onTrendLineClick,
  onEntryExitClick,
  onClose,
  chartApiRef,
  lcRef,
}: AIPatternPanelProps) {
  const t = useTranslations('aiPatternPanel');
  const locale = useLocale();
  const dateLocale = locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : locale === 'tr' ? 'tr-TR' : 'en-US';
  const [loading, setLoading] = useState(false);
  const [entryLoading, setEntryLoading] = useState(false);
  const [patterns, setPatterns] = useState<AIPattern[]>([]);
  const [srLevels, setSrLevels] = useState<SupportResistanceLevel[]>([]);
  const [trendLines, setTrendLines] = useState<TrendLine[]>([]);
  const [entryExit, setEntryExit] = useState<AIEntryExit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('patterns');
  const [enginePatterns, setEnginePatterns] = useState<DetectedPattern[]>([]);
  const [engineRunning, setEngineRunning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<'ai' | 'local' | null>(null);
  // ── Revolutionary Feature States ──
  const [bayesianConsensus, setBayesianConsensus] = useState<BayesianConsensus | null>(null);
  const [stateMachineResult, setStateMachineResult] = useState<PatternStateMachineResult | null>(null);
  const [adaptiveTPSL, setAdaptiveTPSL] = useState<AdaptiveTPSL | null>(null);
  const [elliottSMCFusion, setElliottSMCFusion] = useState<ElliottSMCFusionResult | null>(null);
  const [patternPerformance, setPatternPerformance] = useState<PatternTypeStats[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapOverlay | null>(null);
  const audioAlerterRef = useRef<ReturnType<typeof getPatternAudioAlerter> | null>(null);

  // FIX: AbortController for request cancellation + Rate limiting
  const abortRef = useRef<AbortController | null>(null);
  const entryAbortRef = useRef<AbortController | null>(null);
  const lastAnalysisAt = useRef<number>(0);
  const lastEntryAnalysisAt = useRef<number>(0); // FIX: Separate cooldown for entry/exit
  const COOLDOWN_MS = 5000; // 5-second cooldown between analyses

  // FIX: Refs for state values that are used in closures (prevent stale closure bug)
  // patterns, srLevels, trendLines are captured by analyzeEntryExit's useCallback,
  // but may be stale if the user runs pattern analysis first, then immediately clicks entry/exit.
  const patternsRef = useRef<AIPattern[]>(patterns);
  patternsRef.current = patterns;
  const srLevelsRef = useRef<SupportResistanceLevel[]>(srLevels);
  srLevelsRef.current = srLevels;
  const trendLinesRef = useRef<TrendLine[]>(trendLines);
  trendLinesRef.current = trendLines;

  const analyzePatterns = useCallback(async () => {
    if (!candles || !candles.length) return;

    // FIX: Rate limiting — prevent spamming the AI endpoint
    const now = Date.now();
    if (now - lastAnalysisAt.current < COOLDOWN_MS) {
      setError(t('cooldownWait', { seconds: Math.ceil((COOLDOWN_MS - (now - lastAnalysisAt.current)) / 1000) }));
      return;
    }
    lastAnalysisAt.current = now;

    // FIX: Cancel any previous in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const last50 = candles.slice(-50);
      const ohlcSummary = last50.map(c =>
        `t=${new Date(c.time * 1000).toISOString().slice(0, 16)} O=${c.open} H=${c.high} L=${c.low} C=${c.close} V=${c.volume}`
      ).join('\n');

      // FIX: Add technical indicator context for more accurate AI analysis
      const indicatorContext = buildIndicatorContext(candles);

      const response = await fetch('/api/ai/chart-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          candles: ohlcSummary,
          indicators: indicatorContext,
          instruction: `Analyze the following OHLC candlestick data for ${symbol}. Identify any candlestick patterns from this list: Doji, Hammer, Inverted Hammer, Engulfing (Bullish/Bearish), Morning Star, Evening Star, Three White Soldiers, Three Black Crows, Harami, Piercing Line, Dark Cloud Cover, Spinning Top, Marubozu, Shooting Star, Dragonfly Doji, Gravestone Doji. Return ONLY a JSON array of detected patterns. Each pattern object must have: "type" (English name), "timeIndex" (0-based index in the data), "confidence" (0-1), "direction" ("bullish"|"bearish"|"neutral"). Example: [{"type":"Hammer","timeIndex":45,"confidence":0.85,"direction":"bullish"}]`,
        }),
        signal: controller.signal,
      });

      // FIX: Check if request was aborted
      if (controller.signal.aborted) return;

      if (!response.ok) {
        // Try to extract error message from API response
        let apiError = t('patternAnalysisFailed');
        try {
          const errData = await response.json();
          if (errData.error) apiError = errData.error;
          else if (errData.note) apiError = errData.note;
        } catch {}
        console.error('[AIPatternPanel] API error:', response.status, apiError);
        throw new Error(apiError);
      }

      const result = await response.json();
      const detectedPatterns: AIPattern[] = [];
      let usedSource: 'ai' | 'local' = 'local';

      // Parse AI response into detectedPatterns
      try {
        // FIX: More robust JSON parsing — try multiple strategies before regex
        let parsed = result.patterns || result.data || result;
        if (typeof parsed === 'string') {
          // Strategy 1: Direct JSON.parse
          try {
            parsed = JSON.parse(parsed);
          } catch {
            // Strategy 2: Extract JSON array using regex
            const jsonMatch = parsed.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              try {
                parsed = JSON.parse(jsonMatch[0]);
              } catch {
                // Strategy 3: Try to fix common AI JSON issues (trailing commas, comments)
                const cleaned = jsonMatch[0]
                  .replace(/,\s*\]/g, ']')
                  .replace(/,\s*\}/g, '}')
                  .replace(/\/\/.*$/gm, '')
                  .replace(/\/\*[\s\S]*?\*\//g, '');
                try { parsed = JSON.parse(cleaned); } catch { parsed = null; }
              }
            }
          }
        }

        if (Array.isArray(parsed) && parsed.length > 0) {
          usedSource = result.source === 'ai' ? 'ai' : 'local';
          parsed.forEach((p: any) => {
            const idx = p.timeIndex ?? p.index ?? 0;
            const candle = last50[idx];
            if (!candle) return;
            const shapePoints = buildPatternShape(p.type, candle, last50[idx - 1]);
            detectedPatterns.push({
              type: p.type || 'Unknown',
              labelAr: t(PATTERN_KEYS[p.type] || p.type),
              time: candle.time,
              price: candle.close,
              confidence: p.confidence ?? 0.5,
              direction: p.direction || 'neutral',
              shapePoints,
              shapeType: shapePoints ? 'polygon' : undefined,
              shapeColor: p.direction === 'bullish' ? 'rgba(0,255,163,0.15)' : p.direction === 'bearish' ? 'rgba(255,71,87,0.15)' : 'rgba(251,191,36,0.15)',
            });
          });
        } else {
          const localPatterns = detectLocalPatterns(last50);
          detectedPatterns.push(...localPatterns);
          usedSource = 'local';
        }
      } catch {
        const localPatterns = detectLocalPatterns(last50);
        detectedPatterns.push(...localPatterns);
        usedSource = 'local';
      }

      // ── ALWAYS runs — outside the parsing try/catch ──
      setDataSource(usedSource);
      setPatterns(detectedPatterns);

      if (detectedPatterns.length === 0) {
        setError(t('noPatternsDetected'));
      }

      // Detect levels and trendlines (separate try/catch so they don't block onPatternsDetected)
      let levels: SupportResistanceLevel[] = [];
      let lines: TrendLine[] = [];
      try {
        levels = detectSupportResistance(candles);
        setSrLevels(levels);
        lines = detectTrendLines(candles);
        setTrendLines(lines);
      } catch (e) {
        console.warn('[AIPanel] levels/trendlines error:', e);
      }

      // Harmonic patterns (separate try/catch)
      try {
        const harmonicPatterns = detectHarmonicPatterns(candles);
        if (harmonicPatterns.length > 0) {
          detectedPatterns.push(...harmonicPatterns);
          detectedPatterns.sort((a, b) => b.time - a.time);
          setPatterns([...detectedPatterns]);
        }
      } catch (e) {
        console.warn('[AIPanel] harmonic patterns error:', e);
      }

      // ── REVOLUTIONARY: Run standalone detectors for Bayesian input ──
      let smcResult: ReturnType<typeof detectSMC> | undefined;
      let elliottResult: ReturnType<typeof detectElliottWaves> | null = null;
      let wyckoffResult: ReturnType<typeof detectWyckoff> | undefined;
      let vpResult: ReturnType<typeof calcVolumeProfile> | undefined;
      let geoResult: ReturnType<typeof detectGeometricPatterns> | undefined;

      try { smcResult = detectSMC(candles); } catch (e) { console.warn('[AIPanel] SMC error:', e); }
      try { elliottResult = detectElliottWaves(candles); } catch (e) { console.warn('[AIPanel] Elliott error:', e); }
      try { wyckoffResult = detectWyckoff(candles); } catch (e) { console.warn('[AIPanel] Wyckoff error:', e); }
      try { vpResult = calcVolumeProfile(candles); } catch (e) { console.warn('[AIPanel] VolumeProfile error:', e); }
      try { geoResult = detectGeometricPatterns(candles); } catch (e) { console.warn('[AIPanel] Geometric error:', e); }

      // ── REVOLUTIONARY: Run Bayesian Engine on all signals ──
      try {
        const allAnalysis = {
          smcData: smcResult ? {
            orderBlocks: smcResult.orderBlocks,
            fvgs: smcResult.fvgs,
            structureBreaks: smcResult.structureBreaks,
          } : undefined,
          wyckoff: wyckoffResult,
          elliottPattern: elliottResult,
          volumeProfile: vpResult,
          geoPatterns: geoResult,
          patterns: detectedPatterns,
          currentPrice: candles[candles.length - 1]?.close,
        };
        const signals = extractSignalsFromAnalysis(allAnalysis);
        const bayesianEngine = getBayesianEngine();
        const consensus = bayesianEngine.combine(signals);
        setBayesianConsensus(consensus);

        // ── REVOLUTIONARY: Build confidence heatmap ──
        const heatmap = buildHeatmap(candles, signals);
        setHeatmapData(heatmap);

        // ── REVOLUTIONARY: Elliott + SMC Fusion ──
        if (elliottResult && smcResult) {
          const fusion = detectElliottSMCFusion({
            candles,
            elliott: elliottResult,
            orderBlocks: smcResult.orderBlocks,
            fvgs: smcResult.fvgs,
            structureBreaks: smcResult.structureBreaks,
            wyckoff: wyckoffResult,
            volumeProfile: vpResult,
            currentPrice: candles[candles.length - 1]?.close,
          });
          setElliottSMCFusion(fusion);
        }

        // ── REVOLUTIONARY: Adaptive TP/SL based on ATR ──
        if (consensus.direction !== 'neutral' && consensus.confidence > 0.5) {
          const tpsl = calcAdaptiveTPSL(candles, consensus.direction === 'bullish' ? 'long' : 'short', consensus.confidence);
          setAdaptiveTPSL(tpsl);
        }

        // ── REVOLUTIONARY: Pattern State Machine ──
        const psm = getPatternStateMachine();
        const engineResult = runPatternEngine(candles, { minQuality: 5 });
        const smResult = psm.update(candles, engineResult.patterns);
        setStateMachineResult(smResult);

        // ── REVOLUTIONARY: Pattern Performance Tracking ──
        const perfTracker = getPatternPerformanceTracker();
        const perfSummary = perfTracker.getSummary();
        const perfData = Array.from(perfSummary.statsByType.values());
        setPatternPerformance(perfData);

        // ── REVOLUTIONARY: Audio Alerts for high-confidence patterns ──
        try {
          if (!audioAlerterRef.current) {
            audioAlerterRef.current = getPatternAudioAlerter();
          }
          for (const p of detectedPatterns) {
            audioAlerterRef.current.announce({
              patternType: p.type,
              patternTypeAr: p.labelAr || p.type,
              symbol,
              direction: p.direction,
              confidence: p.confidence,
            });
          }
          // Alert for state machine breakouts
          for (const alert of smResult.alerts) {
            if (alert.priority === 'critical') {
              audioAlerterRef.current.announceBreakout({
                patternType: alert.patternType,
                patternTypeAr: alert.messageAr,
                symbol,
                direction: alert.direction,
                price: alert.keyLevel,
              });
            }
          }
        } catch (audioErr) {
          console.warn('[AIPanel] Audio alert error:', audioErr);
        }
      } catch (e) {
        console.warn('[AIPanel] Revolutionary features error:', e);
      }

      // ALWAYS call onPatternsDetected — this is the key fix
      console.log('[AIPanel] calling onPatternsDetected:', detectedPatterns.length, 'patterns,', lines.length, 'trendLines,', levels.length, 'levels');
      onPatternsDetected({
        patterns: detectedPatterns,
        supportLevels: levels.filter(l => l.type === 'support'),
        resistanceLevels: levels.filter(l => l.type === 'resistance'),
        trendLines: lines,
        entryExit: null,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : t('analysisError'));
      // Fallback: use local detection, each step isolated
      try {
        const last50 = (candles || []).slice(-50);
        const localPatterns = detectLocalPatterns(last50);
        let levels: SupportResistanceLevel[] = [];
        let lines: TrendLine[] = [];
        try { levels = detectSupportResistance(candles || []); } catch { /* skip */ }
        try { lines = detectTrendLines(candles || []); } catch { /* skip */ }
        let extraPatterns: AIPattern[] = [];
        try { extraPatterns = [...detectHarmonicPatterns(candles || []), ...detectClassicPatterns(candles || [])]; } catch { /* skip */ }
        const allPatterns = [...localPatterns, ...extraPatterns].sort((a, b) => b.time - a.time);
        setDataSource('local');
        setPatterns(allPatterns);
        setSrLevels(levels);
        setTrendLines(lines);
        onPatternsDetected({ patterns: allPatterns, supportLevels: levels.filter(l=>l.type==='support'), resistanceLevels: levels.filter(l=>l.type==='resistance'), trendLines: lines, entryExit: null });
      } catch { /* complete fallback failed */ }
    } finally {
      setLoading(false);
    }
  }, [candles, symbol, onPatternsDetected]);

  // ── Analyze Entry/Exit Points ──
  const analyzeEntryExit = useCallback(async () => {
    if (!candles || !candles.length) return;

    // FIX: Apply same cooldown as analyzePatterns to prevent API spam
    const now = Date.now();
    if (now - lastEntryAnalysisAt.current < COOLDOWN_MS) {
      setError(t('entryCooldownWait', { seconds: Math.ceil((COOLDOWN_MS - (now - lastEntryAnalysisAt.current)) / 1000) }));
      return;
    }
    lastEntryAnalysisAt.current = now;

    // FIX: Cancel any previous in-flight entry request
    if (entryAbortRef.current) {
      entryAbortRef.current.abort();
    }
    const controller = new AbortController();
    entryAbortRef.current = controller;

    setEntryLoading(true);
    setError(null);

    try {
      const last50 = candles.slice(-50);
      const ohlcSummary = last50.map(c =>
        `t=${new Date(c.time * 1000).toISOString().slice(0, 16)} O=${c.open} H=${c.high} L=${c.low} C=${c.close} V=${c.volume}`
      ).join('\n');

      const lastCandle = last50[last50.length - 1];
      const levels = detectSupportResistance(candles);
      const lines = detectTrendLines(candles);

      // Build context about detected levels
      const supportPrices = levels.filter(l => l.type === 'support').map(l => l.price.toFixed(l.price > 1000 ? 2 : 5)).join(', ');
      const resistancePrices = levels.filter(l => l.type === 'resistance').map(l => l.price.toFixed(l.price > 1000 ? 2 : 5)).join(', ');
      const trendInfo = lines.map(l => `${l.type === 'ascending' ? t('ascending') : t('descending')} (${l.strength})`).join(', ');

      const response = await fetch('/api/ai/chart-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          candles: ohlcSummary,
          instruction: `You are an expert forex/crypto analyst. Based on the following OHLC data for ${symbol}, determine the best entry and exit points RIGHT NOW. The current price is ${lastCandle.close}. Support levels: ${supportPrices || 'N/A'}. Resistance levels: ${resistancePrices || 'N/A'}. Trend: ${trendInfo || 'N/A'}. Return ONLY a JSON object with: "direction" ("long" or "short"), "entryPrice" (number), "stopLoss" (number), "takeProfit" (number), "confidence" (0-1), "reasonAr" (Arabic explanation, 2-3 sentences), "keyLevels" (array of {price: number, label: string} with key support/resistance). Example: {"direction":"long","entryPrice":65000,"stopLoss":64500,"takeProfit":66000,"confidence":0.75,"reasonAr":"السعر فوق مستوى الدعم مع نمط ابتلاع صعودي","keyLevels":[{"price":64500,"label":"${t('strongSupport')}"},{"price":66000,"label":"${t('resistance')}"}]}`,
        }),
        signal: controller.signal,
      });

      // FIX: Check if request was aborted
      if (controller.signal.aborted) return;

      if (!response.ok) {
        let apiError = t('entryAnalysisFailed');
        try {
          const errData = await response.json();
          if (errData.error) apiError = errData.error;
        } catch {}
        console.error('[AIPatternPanel] Entry/Exit API error:', response.status, apiError);
        throw new Error(apiError);
      }

      const result = await response.json();
      let parsed = result.patterns || result.data || result;

      // FIX: More robust JSON parsing for entry/exit
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch {
          const jsonMatch = parsed.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              parsed = JSON.parse(jsonMatch[0]);
            } catch {
              const cleaned = jsonMatch[0]
                .replace(/,\s*\}/g, '}')
                .replace(/,\s*\]/g, ']')
                .replace(/\/\/.*$/gm, '');
              try { parsed = JSON.parse(cleaned); } catch { parsed = null; }
            }
          }
        }
      }

      if (parsed && parsed.direction && parsed.entryPrice) {
        // FIX: Validate SL/TP are reasonable numbers and logically correct
        const rawEntry = Number(parsed.entryPrice);
        const rawSL = Number(parsed.stopLoss);
        const rawTP = Number(parsed.takeProfit);
        const isLong = parsed.direction === 'long';
        
        // FIX: Filter out NaN, 0, Infinity, and logically invalid SL/TP
        let stopLoss = (isFinite(rawSL) && rawSL > 0) ? rawSL : 0;
        let takeProfit = (isFinite(rawTP) && rawTP > 0) ? rawTP : 0;
        
        // FIX: Validate SL/TP logic — SL must be against direction, TP with direction
        if (stopLoss > 0) {
          if (isLong && stopLoss >= rawEntry) stopLoss = 0; // SL above entry in long = invalid
          if (!isLong && stopLoss <= rawEntry) stopLoss = 0; // SL below entry in short = invalid
        }
        if (takeProfit > 0) {
          if (isLong && takeProfit <= rawEntry) takeProfit = 0; // TP below entry in long = invalid
          if (!isLong && takeProfit >= rawEntry) takeProfit = 0; // TP above entry in short = invalid
        }

        const aiEntryExit: AIEntryExit = {
          direction: isLong ? 'long' : 'short',
          entryPrice: (isFinite(rawEntry) && rawEntry > 0) ? rawEntry : lastCandle.close,
          stopLoss,
          takeProfit,
          confidence: (isFinite(Number(parsed.confidence)) && Number(parsed.confidence) > 0) 
            ? Math.min(1, Math.max(0, Number(parsed.confidence))) : 0.5,
          reasonAr: parsed.reasonAr || t('aiAnalysis'),
          keyLevels: Array.isArray(parsed.keyLevels) ? parsed.keyLevels.map((k: any) => ({
            price: (isFinite(Number(k.price)) && Number(k.price) > 0) ? Number(k.price) : 0,
            label: String(k.label || ''),
          })).filter((k: any) => k.price > 0) : [],
        };
        setEntryExit(aiEntryExit);
        setActiveTab('entry');
        setDataSource('ai'); // FIX: Update dataSource for entry/exit too
        // FIX: Use refs instead of stale closure state for patterns/srLevels/trendLines
        onPatternsDetected({
          patterns: patternsRef.current,
          supportLevels: srLevelsRef.current.filter(l => l.type === 'support'),
          resistanceLevels: srLevelsRef.current.filter(l => l.type === 'resistance'),
          trendLines: trendLinesRef.current,
          entryExit: aiEntryExit,
        });
      } else {
        // AI didn't return valid entry/exit — generate local one
        const localEE = generateLocalEntryExit(lastCandle, levels, lines, t);
        setEntryExit(localEE);
        setActiveTab('entry');
        setDataSource('local'); // FIX: Update dataSource for fallback entry/exit
        // FIX: Also call onPatternsDetected so entry/exit lines are drawn on chart
        onPatternsDetected({
          patterns: patternsRef.current,
          supportLevels: srLevelsRef.current.filter(l => l.type === 'support'),
          resistanceLevels: srLevelsRef.current.filter(l => l.type === 'resistance'),
          trendLines: trendLinesRef.current,
          entryExit: localEE,
        });
      }
    } catch (err: unknown) {
      // FIX: Don't show error for aborted requests
      if (err instanceof Error && err.name === 'AbortError') return;
      // Fallback to local analysis
      const lastCandle = candles[candles.length - 1];
      const levels = detectSupportResistance(candles);
      const lines = detectTrendLines(candles);
      const localEE = generateLocalEntryExit(lastCandle, levels, lines, t);
      setEntryExit(localEE);
      setActiveTab('entry');
      setDataSource('local'); // FIX: Update dataSource for error fallback
      // FIX: Also call onPatternsDetected so entry/exit lines are drawn on chart
      onPatternsDetected({
        patterns: patternsRef.current,
        supportLevels: srLevelsRef.current.filter(l => l.type === 'support'),
        resistanceLevels: srLevelsRef.current.filter(l => l.type === 'resistance'),
        trendLines: trendLinesRef.current,
        entryExit: localEE,
      });
    } finally {
      setEntryLoading(false);
    }
  }, [candles, symbol, onPatternsDetected]);

  const handlePatternClick = useCallback((p: AIPattern, index: number) => {
    const id = `pattern-${index}-${p.time}`;
    setSelectedId(id);
    onPatternClick?.(p);
  }, [onPatternClick]);

  const handleLevelClick = useCallback((level: SupportResistanceLevel, index: number) => {
    const id = `level-${index}-${level.type}`;
    setSelectedId(id);
    onLevelClick?.(level);
  }, [onLevelClick]);

  const handleTrendLineClick = useCallback((line: TrendLine, index: number) => {
    const id = `trend-${index}-${line.type}`;
    setSelectedId(id);
    onTrendLineClick?.(line);
  }, [onTrendLineClick]);

  const runEngineDetection = async () => {
    if (engineRunning || !candles || candles.length < 30) return;
    setEngineRunning(true);
    try {
      const result = runPatternEngine(candles, { minQuality: 5 });
      setEnginePatterns(result.patterns);
      // Load LC if not already cached
      if (lcRef && !lcRef.current) {
        try { lcRef.current = await import('lightweight-charts'); } catch { /* skip */ }
      }
      // NOTE: Do NOT draw all patterns here — draw only on click (onEnginePatternClick)
    } catch (e: any) {
      console.warn('[PatternEngine]', e.message);
    } finally {
      setEngineRunning(false);
    }
  };

  const tabs: { key: TabKey; label: string; icon: string; count: number }[] = [
    { key: 'patterns', label: t('tabPatterns'), icon: '🕯', count: patterns.length },
    { key: 'sr', label: t('tabSupportResistance'), icon: '⚡', count: srLevels.length },
    { key: 'trend', label: t('tabTrend'), icon: '📉', count: trendLines.length },
    { key: 'entry', label: t('tabEntry'), icon: '🎯', count: entryExit ? 1 : 0 },
    { key: 'engine', label: t('tabGeometric'), icon: '📊', count: enginePatterns.length },
    { key: 'bayesian', label: t('bayesian'), icon: '🧬', count: bayesianConsensus ? 1 : 0 },
  ];

  return (
    <div style={{
      background: C.bg,
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      zIndex: 500,
      width: 'min(320px, 90vw)',
      maxHeight: 'min(520px, 70vh)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 20px rgba(0,212,255,0.04)',
    }}>
      {/* ── Header ── */}
      <div data-drag-handle style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: `1px solid ${C.border}`,
        background: `linear-gradient(180deg, ${C.card} 0%, rgba(17,22,32,0.6) 100%)`,
        cursor: 'grab',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 24, height: 24, borderRadius: 6,
            background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
          }}>
            🤖
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.text, fontWeight: 700, fontFamily: "'Cairo', sans-serif", lineHeight: 1.2 }}>
              {t('aiAnalysis')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 9, color: C.cyan, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: 0.4 }}>
                {symbol}
              </span>
              {/* FIX: Source badge — shows whether results are from AI or local detection */}
              {dataSource && (
                <span style={{
                  fontSize: 7, fontWeight: 800,
                  padding: '1px 5px', borderRadius: 3,
                  background: dataSource === 'ai' ? 'rgba(0,212,255,0.15)' : 'rgba(251,191,36,0.12)',
                  color: dataSource === 'ai' ? C.cyan : C.warning,
                  border: `1px solid ${dataSource === 'ai' ? 'rgba(0,212,255,0.25)' : 'rgba(251,191,36,0.2)'}`,
                }}>
                  {dataSource === 'ai' ? '🤖 AI' : `📊 ${t('localSource')}`}
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.04)', border: 'none', borderRadius: 5,
            color: C.textMuted, width: 22, height: 22, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, padding: 0,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,71,87,0.15)'; e.currentTarget.style.color = C.danger; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = C.textMuted; }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* ── Action Buttons ── */}
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Analyze Patterns Button */}
        <button
          onClick={analyzePatterns}
          disabled={loading}
          style={{
            width: '100%',
            padding: '9px 0',
            background: loading
              ? 'rgba(0,212,255,0.15)'
              : 'linear-gradient(135deg, rgba(0,212,255,0.2) 0%, rgba(0,212,255,0.08) 100%)',
            border: `1px solid ${loading ? 'rgba(0,212,255,0.2)' : 'rgba(0,212,255,0.3)'}`,
            borderRadius: 8,
            color: loading ? C.textDim : C.cyan,
            fontSize: 11,
            fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
            fontFamily: "'Cairo', sans-serif",
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0,212,255,0.3) 0%, rgba(0,212,255,0.12) 100%)'; }}
          onMouseLeave={e => { if (!loading) e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0,212,255,0.2) 0%, rgba(0,212,255,0.08) 100%)'; }}
        >
          {loading ? (
            <>
              <div style={{ width: 12, height: 12, border: `2px solid rgba(0,212,255,0.2)`, borderTopColor: C.cyan, borderRadius: '50%', animation: 'aiSpin 0.8s linear infinite' }} />
              {t('analyzing')}
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              {t('analyzePatternsLevels')}
            </>
          )}
        </button>

        {/* Entry/Exit Analysis Button */}
        <button
          onClick={analyzeEntryExit}
          disabled={entryLoading}
          style={{
            width: '100%',
            padding: '9px 0',
            background: entryLoading
              ? 'rgba(0,255,163,0.1)'
              : 'linear-gradient(135deg, rgba(0,255,163,0.15) 0%, rgba(212,175,55,0.1) 100%)',
            border: `1px solid ${entryLoading ? 'rgba(0,255,163,0.15)' : 'rgba(0,255,163,0.3)'}`,
            borderRadius: 8,
            color: entryLoading ? C.textDim : C.success,
            fontSize: 11,
            fontWeight: 700,
            cursor: entryLoading ? 'wait' : 'pointer',
            fontFamily: "'Cairo', sans-serif",
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
          onMouseEnter={e => { if (!entryLoading) e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0,255,163,0.25) 0%, rgba(212,175,55,0.15) 100%)'; }}
          onMouseLeave={e => { if (!entryLoading) e.currentTarget.style.background = 'linear-gradient(135deg, rgba(0,255,163,0.15) 0%, rgba(212,175,55,0.1) 100%)'; }}
        >
          {entryLoading ? (
            <>
              <div style={{ width: 12, height: 12, border: `2px solid rgba(0,255,163,0.2)`, borderTopColor: C.success, borderRadius: '50%', animation: 'aiSpin 0.8s linear infinite' }} />
              {t('analyzing')}
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {t('analyzeEntryExit')}
            </>
          )}
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{
          margin: '0 14px 8px',
          padding: '7px 10px',
          background: 'rgba(248,81,73,0.08)',
          border: '1px solid rgba(248,81,73,0.15)',
          borderRadius: 7,
          color: C.danger,
          fontSize: 10,
          fontFamily: "'Cairo', sans-serif",
        }}>
          {error}
        </div>
      )}

      {/* ── Tabs ── */}
      {(patterns.length > 0 || srLevels.length > 0 || trendLines.length > 0 || entryExit) && (
        <div style={{
          display: 'flex',
          gap: 2,
          padding: '0 14px 8px',
        }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSelectedId(null); }}
              style={{
                flex: 1,
                padding: '6px 0',
                background: activeTab === tab.key ? 'rgba(0,212,255,0.08)' : 'transparent',
                border: `1px solid ${activeTab === tab.key ? 'rgba(0,212,255,0.2)' : 'transparent'}`,
                borderRadius: 6,
                color: activeTab === tab.key ? C.cyan : C.textDim,
                fontSize: 9,
                fontWeight: activeTab === tab.key ? 700 : 400,
                cursor: 'pointer',
                fontFamily: "'Cairo', sans-serif",
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
              }}
            >
              <span style={{ fontSize: 10 }}>{tab.icon}</span>
              {tab.label}
              {tab.count > 0 && (
                <span style={{
                  fontSize: 8, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace",
                  color: activeTab === tab.key ? C.cyan : C.textMuted,
                  background: activeTab === tab.key ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)',
                  padding: '1px 4px', borderRadius: 3, minWidth: 14, textAlign: 'center',
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '0 8px 8px' }}>

        {/* Patterns Tab */}
        {activeTab === 'patterns' && (
          <>
            {patterns.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {patterns.map((p, i) => {
                  const id = `pattern-${i}-${p.time}`;
                  const isSelected = selectedId === id;
                  const isBull = p.direction === 'bullish';
                  const isBear = p.direction === 'bearish';
                  const dirColor = isBull ? C.success : isBear ? C.danger : C.warning;
                  const dirBg = isBull ? C.upBg : isBear ? C.downBg : 'rgba(251,191,36,0.06)';

                  return (
                    <button
                      key={id}
                      onClick={() => handlePatternClick(p, i)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 10px',
                        background: isSelected ? `rgba(0,212,255,0.08)` : dirBg,
                        border: `1px solid ${isSelected ? C.borderActive : 'transparent'}`,
                        borderRadius: 7,
                        cursor: 'pointer',
                        textAlign: 'right',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) e.currentTarget.style.background = C.cardHover;
                        e.currentTarget.style.borderColor = C.borderActive;
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) e.currentTarget.style.background = dirBg;
                        if (!isSelected) e.currentTarget.style.borderColor = 'transparent';
                      }}
                    >
                      <div style={{
                        width: 26, height: 26, borderRadius: 6,
                        background: `${dirColor}12`,
                        border: `1px solid ${dirColor}25`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 900, color: dirColor,
                        fontFamily: "'JetBrains Mono', monospace",
                        flexShrink: 0,
                      }}>
                        {PATTERN_ICONS[p.direction] || '◆'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 11, color: C.text, fontWeight: 600,
                          fontFamily: "'Cairo', sans-serif", lineHeight: 1.3,
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                          {t(PATTERN_KEYS[p.type] || p.type) || p.labelAr}
                          <span style={{
                            fontSize: 8, color: C.textMuted, fontWeight: 400,
                            fontFamily: "'JetBrains Mono', monospace",
                          }}>
                            {p.type}
                          </span>
                          {/* Shape indicator */}
                          {p.shapePoints && (
                            <span style={{
                              fontSize: 7, color: C.cyan, fontWeight: 600,
                              background: 'rgba(0,212,255,0.1)', padding: '0 4px',
                              borderRadius: 2,
                            }}>
                              ✓ {t('draw')}
                            </span>
                          )}
                        </div>
                        <div style={{
                          fontSize: 9, color: C.textDim, fontWeight: 400,
                          fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.4,
                          display: 'flex', alignItems: 'center', gap: 6, marginTop: 1,
                        }}>
                          <span>{new Date(p.time * 1000).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })}</span>
                          <span style={{ color: C.textMuted }}>•</span>
                          <span style={{ color: dirColor, fontWeight: 700 }}>
                            {Math.round(p.confidence * 100)}%
                          </span>
                        </div>
                      </div>
                      <div style={{
                        width: 3, height: 24, borderRadius: 2,
                        background: C.border, overflow: 'hidden', flexShrink: 0,
                      }}>
                        <div style={{
                          width: '100%', borderRadius: 2,
                          height: `${p.confidence * 100}%`,
                          background: dirColor,
                          transition: 'height 0.3s ease',
                        }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{
                textAlign: 'center', color: C.textMuted, fontSize: 10,
                padding: '20px 0', fontFamily: "'Cairo', sans-serif",
              }}>
                {t('pressAnalyzeToStart')}
              </div>
            )}
          </>
        )}

        {/* Support/Resistance Tab */}
        {activeTab === 'sr' && (
          <>
            {srLevels.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {srLevels.map((level, i) => {
                  const id = `level-${i}-${level.type}`;
                  const isSelected = selectedId === id;
                  const isSupport = level.type === 'support';
                  const color = isSupport ? C.success : C.danger;
                  const strengthLabel = level.strength === 'strong' ? t('strong') : level.strength === 'medium' ? t('medium') : t('weak');
                  const strengthBars = level.strength === 'strong' ? 3 : level.strength === 'medium' ? 2 : 1;

                  return (
                    <button
                      key={id}
                      onClick={() => handleLevelClick(level, i)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 10px',
                        background: isSelected ? 'rgba(0,212,255,0.08)' : isSupport ? C.upBg : C.downBg,
                        border: `1px solid ${isSelected ? C.borderActive : 'transparent'}`,
                        borderRadius: 7,
                        cursor: 'pointer',
                        textAlign: 'right',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) e.currentTarget.style.background = C.cardHover;
                        e.currentTarget.style.borderColor = C.borderActive;
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) e.currentTarget.style.background = isSupport ? C.upBg : C.downBg;
                        if (!isSelected) e.currentTarget.style.borderColor = 'transparent';
                      }}
                    >
                      <div style={{
                        width: 26, height: 26, borderRadius: 6,
                        background: `${color}12`,
                        border: `1px solid ${color}25`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 900, color,
                        fontFamily: "'JetBrains Mono', monospace",
                        flexShrink: 0,
                      }}>
                        {isSupport ? 'S' : 'R'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 11, color: C.text, fontWeight: 600,
                          fontFamily: "'Cairo', sans-serif", lineHeight: 1.3,
                        }}>
                          {isSupport ? t('support') : t('resistance')}
                          <span style={{
                            fontSize: 8, color: C.textMuted, fontWeight: 400,
                            fontFamily: "'JetBrains Mono', monospace", marginRight: 4,
                          }}>
                            ({strengthLabel})
                          </span>
                        </div>
                        <div style={{
                          fontSize: 10, color: C.textDim, fontWeight: 600,
                          fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.4, marginTop: 1,
                        }}>
                          {level.price.toFixed(level.price > 1000 ? 2 : 5)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                        {[1, 2, 3].map(bar => (
                          <div key={bar} style={{
                            width: 8, height: 3, borderRadius: 1,
                            background: bar <= strengthBars ? color : C.border,
                          }} />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{
                textAlign: 'center', color: C.textMuted, fontSize: 10,
                padding: '20px 0', fontFamily: "'Cairo', sans-serif",
              }}>
                {t('pressAnalyzeToStart')}
              </div>
            )}
          </>
        )}

        {/* Trend Tab */}
        {activeTab === 'trend' && (
          <>
            {trendLines.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {trendLines.map((line, i) => {
                  const isAsc = line.type === 'ascending';
                  const color = isAsc ? C.success : C.danger;
                  const strengthLabel = line.strength === 'strong' ? t('strong') : line.strength === 'medium' ? t('medium') : t('weak');
                  const id = `trend-${i}-${line.type}`;
                  const isSelected = selectedId === id;

                  return (
                    <button
                      key={id}
                      onClick={() => {
                        setSelectedId(id);
                        onTrendLineClick?.(line);
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 10px',
                        background: isSelected ? 'rgba(0,212,255,0.08)' : isAsc ? C.upBg : C.downBg,
                        border: `1px solid ${isSelected ? C.borderActive : 'transparent'}`,
                        borderRadius: 7,
                        cursor: 'pointer',
                        textAlign: 'right',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderActive; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = 'transparent'; }}
                    >
                      <div style={{
                        width: 26, height: 26, borderRadius: 6,
                        background: `${color}12`,
                        border: `1px solid ${color}25`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, color,
                        flexShrink: 0,
                      }}>
                        {isAsc ? '↗' : '↘'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: C.text, fontWeight: 600, fontFamily: "'Cairo', sans-serif" }}>
                          {isAsc ? t('ascendingTrend') : t('descendingTrend')}
                          <span style={{ fontSize: 8, color: C.textMuted, fontWeight: 400, fontFamily: "'JetBrains Mono', monospace", marginRight: 4 }}>
                            ({strengthLabel})
                          </span>
                          <span style={{
                            fontSize: 7, color: C.cyan, fontWeight: 600,
                            background: 'rgba(0,212,255,0.1)', padding: '0 4px',
                            borderRadius: 2, marginRight: 4,
                          }}>
                            ✓ {t('draw')}
                          </span>
                        </div>
                        <div style={{ fontSize: 9, color: C.textDim, fontFamily: "'JetBrains Mono', monospace", marginTop: 1 }}>
                          {line.startPoint.price.toFixed(line.startPoint.price > 1000 ? 2 : 5)} → {line.endPoint.price.toFixed(line.endPoint.price > 1000 ? 2 : 5)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{
                textAlign: 'center', color: C.textMuted, fontSize: 10,
                padding: '20px 0', fontFamily: "'Cairo', sans-serif",
              }}>
                {t('pressAnalyzeToStart')}
              </div>
            )}
          </>
        )}

        {/* Entry/Exit Tab */}
        {activeTab === 'entry' && (
          <>
            {entryExit ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Direction badge */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '10px 0',
                }}>
                  <div style={{
                    padding: '6px 16px', borderRadius: 8,
                    background: entryExit.direction === 'long' ? 'rgba(0,255,163,0.12)' : 'rgba(255,71,87,0.12)',
                    border: `1px solid ${entryExit.direction === 'long' ? 'rgba(0,255,163,0.3)' : 'rgba(255,71,87,0.3)'}`,
                    color: entryExit.direction === 'long' ? C.success : C.danger,
                    fontSize: 14, fontWeight: 900, fontFamily: "'Cairo', sans-serif",
                    letterSpacing: 1,
                  }}>
                    {entryExit.direction === 'long' ? `▲ ${t('buyLong')}` : `▼ ${t('sellShort')}`}
                  </div>
                  <div style={{
                    padding: '3px 8px', borderRadius: 4,
                    background: 'rgba(0,212,255,0.1)',
                    color: C.cyan, fontSize: 10, fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {Math.round(entryExit.confidence * 100)}%
                  </div>
                </div>

                {/* Price levels */}
                {[
                  { label: t('entryPrice'), value: entryExit.entryPrice, color: C.cyan, icon: '→' },
                  { label: t('stopLoss'), value: entryExit.stopLoss, color: C.danger, icon: '✕' },
                  { label: t('takeProfit'), value: entryExit.takeProfit, color: C.success, icon: '★' },
                ].map((item, idx) => (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px',
                    background: `${item.color}08`,
                    border: `1px solid ${item.color}20`,
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                    onClick={() => {
                      onEntryExitClick?.(entryExit);
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = `${item.color}50`; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = `${item.color}20`; }}
                  >
                    <span style={{ color: item.color, fontSize: 12, fontWeight: 900, width: 16, textAlign: 'center' }}>
                      {item.icon}
                    </span>
                    <span style={{ flex: 1, fontSize: 10, color: C.textDim, fontFamily: "'Cairo', sans-serif" }}>
                      {item.label}
                    </span>
                    <span style={{ fontSize: 11, color: item.color, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                      {item.value > 0 ? item.value.toFixed(item.value > 1000 ? 2 : 5) : '—'}
                    </span>
                  </div>
                ))}

                {/* Risk/Reward */}
                {entryExit.stopLoss > 0 && entryExit.takeProfit > 0 && entryExit.entryPrice > 0 && (() => {
                  const rrCalc = calculateRiskReward(entryExit);
                  const rr = rrCalc.ratio > 0 ? rrCalc.ratio.toFixed(1) : '—';
                  return (
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      padding: '6px 0',
                    }}>
                      <span style={{ fontSize: 9, color: C.textMuted, fontFamily: "'Cairo', sans-serif" }}>{t('riskRewardRatio')}</span>
                      <span style={{
                        fontSize: 13, color: rrCalc.ratio >= 2 ? C.success : rrCalc.ratio >= 1 ? C.warning : C.danger,
                        fontWeight: 900, fontFamily: "'JetBrains Mono', monospace",
                      }}>
                        1:{rr}
                      </span>
                      {rrCalc.riskPct > 0 && (
                        <span style={{ fontSize: 8, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
                          ({rrCalc.riskPct.toFixed(1)}% / +{rrCalc.rewardPct.toFixed(1)}%)
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Reason */}
                {entryExit.reasonAr && (
                  <div style={{
                    padding: '8px 10px',
                    background: 'rgba(0,212,255,0.04)',
                    border: `1px solid rgba(0,212,255,0.1)`,
                    borderRadius: 6,
                    fontSize: 10, color: C.textDim, fontFamily: "'Cairo', sans-serif",
                    lineHeight: 1.6,
                  }}>
                    {entryExit.reasonAr}
                  </div>
                )}

                {/* Key levels */}
                {entryExit.keyLevels && entryExit.keyLevels.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'Cairo', sans-serif", marginBottom: 2 }}>
                      {t('keyLevels')}
                    </div>
                    {entryExit.keyLevels.map((kl, idx) => (
                      <div key={idx} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 8px',
                        background: 'rgba(255,255,255,0.02)',
                        borderRadius: 4,
                      }}>
                        <span style={{ fontSize: 8, color: C.textMuted, fontFamily: "'Cairo', sans-serif" }}>
                          {kl.label}
                        </span>
                        <span style={{ flex: 1 }} />
                        <span style={{ fontSize: 9, color: C.textDim, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
                          {kl.price > 0 ? kl.price.toFixed(kl.price > 1000 ? 2 : 5) : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* AI Execute Trade Button */}
                <div style={{ padding: '12px 0 0', marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <button
                    onClick={() => {
                      if (!entryExit) return;
                      const { addTrade } = usePaperTradesStore.getState();
                      // Assume standard lot size of 1.0 for manual AI quick trades (or fallback to user settings)
                      const defaultLot = 1.0; 
                      addTrade({
                        symbol: symbol,
                        side: entryExit.direction,
                        qty: defaultLot,
                        entryPrice: entryExit.entryPrice,
                        currentPrice: entryExit.entryPrice,
                        tp: entryExit.takeProfit > 0 ? entryExit.takeProfit : undefined,
                        sl: entryExit.stopLoss > 0 ? entryExit.stopLoss : undefined,
                        entryTime: Date.now(),
                        strategy: 'ai_recommendation',
                        source: 'agent',
                      });
                      
                      useNotificationStore.getState().addNotification({
                        source: 'agent',
                        priority: 'high',
                        action: 'BUY',
                        title: `⚡ ${t('aiExecutionTitle')}`,
                        body: `${t('tradeExecuted', { direction: entryExit.direction === 'long' ? t('buy') : t('sell'), symbol, price: entryExit.entryPrice })}`,
                        pair: symbol,
                        price: entryExit.entryPrice,
                      });
                      
                      onClose(); // Close panel after execution
                    }}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: entryExit.direction === 'long'
                        ? 'linear-gradient(135deg, rgba(0,255,163,0.2) 0%, rgba(0,255,163,0.1) 100%)'
                        : 'linear-gradient(135deg, rgba(255,71,87,0.2) 0%, rgba(255,71,87,0.1) 100%)',
                      border: `1px solid ${entryExit.direction === 'long' ? 'rgba(0,255,163,0.4)' : 'rgba(255,71,87,0.4)'}`,
                      borderRadius: 8,
                      color: entryExit.direction === 'long' ? C.success : C.danger,
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                      fontFamily: "'Cairo', sans-serif",
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      transition: 'all 0.2s ease',
                      boxShadow: `0 4px 12px ${entryExit.direction === 'long' ? 'rgba(0,255,163,0.15)' : 'rgba(255,71,87,0.15)'}`
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.filter = 'brightness(1.2)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.filter = 'none';
                    }}
                  >
                    <span>⚡ {t('executeDirect')}</span>
                    <span style={{ fontSize: 10, opacity: 0.8, fontWeight: 500 }}>
                      {entryExit.direction === 'long' ? t('buy') : t('sell')} @ {entryExit.entryPrice.toFixed(2)}
                    </span>
                  </button>
                  <div style={{ textAlign: 'center', fontSize: 9, color: C.textDim, marginTop: 6, fontFamily: "'Cairo', sans-serif" }}>
                    {t('paperTradeNote')}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{
                textAlign: 'center', color: C.textMuted, fontSize: 10,
                padding: '20px 0', fontFamily: "'Cairo', sans-serif",
              }}>
                {t('pressEntryAnalyzeToStart')}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Footer hint ── */}
      {(patterns.length > 0 || srLevels.length > 0 || entryExit) && (
        <div style={{
          padding: '6px 14px',
          borderTop: `1px solid ${C.border}`,
          fontSize: 8,
          color: C.textMuted,
          fontFamily: "'Cairo', sans-serif",
          textAlign: 'center',
        }}>
          {t('clickToDrawHint')}
        </div>
      )}

      {/* ── Engine: Chart Pattern Detection (Autochartist-style) ── */}
      {activeTab === 'engine' && (
        <div style={{ padding: '8px 0', overflowY: 'auto', maxHeight: 'calc(100% - 48px)' }}>
          {/* Run button */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              onClick={() => runEngineDetection()}
              disabled={engineRunning}
              style={{
                width: '100%', padding: '8px', borderRadius: 8, border: 'none',
                background: engineRunning ? 'rgba(0,212,255,0.08)' : 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(0,212,255,0.1))',
                color: '#00D4FF', fontWeight: 700, cursor: engineRunning ? 'not-allowed' : 'pointer',
                fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
              {engineRunning ? `⏳ ${t('detectingPatterns')}` : `🔍 ${t('detectGeometricPatterns')}` }
            </button>
            {enginePatterns.length > 0 && (
              <button
                onClick={() => {
                  setEnginePatterns([]);
                  // Clear drawn patterns from the actual chart
                  const cApi = chartApiRef?.current;
                  const lc = lcRef?.current;
                  if (cApi && lc) {
                    try { clearAllPatterns(cApi); } catch { /* ignore */ }
                  }
                }}
                style={{
                  width: '100%', marginTop: 4, padding: '5px', borderRadius: 6, border: 'none',
                  background: 'rgba(255,71,87,0.08)', color: 'rgba(255,71,87,0.7)',
                  fontSize: 10, cursor: 'pointer',
                }}>
                ✕ {t('clearPatternsFromChart')}
              </button>
            )}
          </div>

          {/* Pattern list */}
          {enginePatterns.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 16px', color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📊</div>
              {t('pressDetectToAnalyze')}
              <div style={{ fontSize: 9, marginTop: 6, color: 'rgba(255,255,255,0.2)' }}>
                Double Top/Bottom · Triangle · Channel · Wedge · H&S · Harmonic XABCD
              </div>
            </div>
          ) : (
            <div>
              {enginePatterns.map((p, i) => {
                const col = p.direction === 'bullish' ? '#00FFA3' : '#FF4757';
                return (
                  <div key={p.id} style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer', transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={async () => {
                    const cApi = chartApiRef?.current;
                    if (!cApi || !lcRef) return;
                    if (!lcRef.current) {
                      try { lcRef.current = await import('lightweight-charts'); } catch { return; }
                    }
                    const lc = lcRef.current;
                    if (lc) {
                      try { drawAllPatterns(cApi, lc, [p], true, 30 * 60 * 1000); } catch { /* ignore */ }
                      // Scroll to pattern without changing zoom
                      const pts = p.points;
                      if (pts?.length) {
                        const t = pts[0].time;
                        const range = cApi.timeScale().getVisibleRange();
                        if (range) {
                          const w = (range.to as number) - (range.from as number);
                          try { cApi.timeScale().setVisibleRange({ from: (t - w * 0.3) as any, to: (t + w * 0.7) as any }); } catch {}
                        }
                      }
                    }
                  }}>
                    {/* Row 1 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ color: col, fontWeight: 800, fontSize: 11 }}>
                          {p.direction === 'bullish' ? '▲' : '▼'}
                        </span>
                        <span style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600, fontSize: 11 }}>
                          {p.type}
                        </span>
                      </div>
                      <span style={{
                        background: p.quality.overall >= 7 ? 'rgba(0,255,163,0.15)' : 'rgba(0,212,255,0.1)',
                        color: p.quality.overall >= 7 ? '#00FFA3' : '#00D4FF',
                        borderRadius: 6, padding: '1px 6px', fontSize: 9, fontWeight: 700,
                      }}>
                        {p.quality.overall}/10
                      </span>
                    </div>
                    {/* Row 2: forecast */}
                    {p.forecast && (
                      <div style={{ fontSize: 9, display: 'flex', gap: 10, color: 'rgba(255,255,255,0.5)' }}>
                        <span>{t('targetLabel')}: <span style={{ color: col }}>{p.forecast.priceMin.toFixed(2)} – {p.forecast.priceMax.toFixed(2)}</span></span>
                        <span>{t('probability')}: <span style={{ color: '#FFD700' }}>{p.forecast.probability}%</span></span>
                      </div>
                    )}
                    {/* Row 3: status */}
                    <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                      {p.status === 'breakout' ? `🚀 ${t('breakout')}` : p.status === 'forming' ? `⏳ ${t('forming')}` : `✅ ${t('completed')}`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Bayesian Tab ── */}
      {activeTab === 'bayesian' && (
        <div style={{ padding: '8px 4px', overflowY: 'auto', maxHeight: 'calc(100% - 48px)' }}>
          {!bayesianConsensus ? (
            <div style={{ textAlign: 'center', padding: '24px 16px', color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🧬</div>
              {t('enableAnalysisFirst')}
              <div style={{ fontSize: 9, marginTop: 6, color: 'rgba(255,255,255,0.2)' }}>
                Bayesian Engine · Elliott+SMC Fusion · Adaptive TP/SL
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Consensus Direction */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '10px 8px',
                background: bayesianConsensus.direction === 'bullish' ? 'rgba(0,255,163,0.06)'
                  : bayesianConsensus.direction === 'bearish' ? 'rgba(255,71,87,0.06)' : 'rgba(251,191,36,0.06)',
                border: `1px solid ${bayesianConsensus.direction === 'bullish' ? 'rgba(0,255,163,0.2)'
                  : bayesianConsensus.direction === 'bearish' ? 'rgba(255,71,87,0.2)' : 'rgba(251,191,36,0.2)'}`,
                borderRadius: 8,
              }}>
                <span style={{ fontSize: 16 }}>{bayesianConsensus.direction === 'bullish' ? '▲' : bayesianConsensus.direction === 'bearish' ? '▼' : '◆'}</span>
                <span style={{
                  fontSize: 13, fontWeight: 900, fontFamily: "'Cairo', sans-serif",
                  color: bayesianConsensus.direction === 'bullish' ? C.success : bayesianConsensus.direction === 'bearish' ? C.danger : C.warning,
                }}>
                  {bayesianConsensus.direction === 'bullish' ? t('bullish') : bayesianConsensus.direction === 'bearish' ? t('bearish') : t('neutral')}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                  color: C.cyan, background: 'rgba(0,212,255,0.1)', padding: '2px 6px', borderRadius: 4,
                }}>
                  {Math.round(bayesianConsensus.confidence * 100)}%
                </span>
              </div>

              {/* Posterior Distribution */}
              <div style={{
                padding: '8px 10px',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: 6,
              }}>
                <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>
                  {t('posteriorDistribution')}
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, marginBottom: 2 }}>
                      <span style={{ color: C.success }}>{t('up')}</span>
                      <span style={{ color: C.success, fontFamily: "'JetBrains Mono', monospace" }}>{(bayesianConsensus.posteriorBullish * 100).toFixed(1)}%</span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${bayesianConsensus.posteriorBullish * 100}%`, height: '100%', background: C.success, borderRadius: 2 }} />
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 3 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, marginBottom: 2 }}>
                      <span style={{ color: C.danger }}>{t('down')}</span>
                      <span style={{ color: C.danger, fontFamily: "'JetBrains Mono', monospace" }}>{(bayesianConsensus.posteriorBearish * 100).toFixed(1)}%</span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${bayesianConsensus.posteriorBearish * 100}%`, height: '100%', background: C.danger, borderRadius: 2 }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Reinforcing Signals */}
              {bayesianConsensus.reinforcingSignals.length > 0 && (
                <div style={{
                  padding: '6px 8px',
                  background: 'rgba(0,255,163,0.04)',
                  border: '1px solid rgba(0,255,163,0.12)',
                  borderRadius: 6,
                }}>
                  <div style={{ fontSize: 9, color: C.success, fontWeight: 700, fontFamily: "'Cairo', sans-serif", marginBottom: 3 }}>
                    {`🔗 ${t('enhancedSignals')}`}
                  </div>
                  {bayesianConsensus.reinforcingSignals.map((rs, i) => (
                    <div key={i} style={{ fontSize: 9, color: C.textDim, fontFamily: "'Cairo', sans-serif", marginBottom: 2, lineHeight: 1.4 }}>
                      • {rs.descriptionAr} <span style={{ color: C.success, fontFamily: "'JetBrains Mono', monospace", fontSize: 8 }}>{(rs.strength * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Conflicting Signals */}
              {bayesianConsensus.conflictingSignals.length > 0 && (
                <div style={{
                  padding: '6px 8px',
                  background: 'rgba(255,71,87,0.04)',
                  border: '1px solid rgba(255,71,87,0.12)',
                  borderRadius: 6,
                }}>
                  <div style={{ fontSize: 9, color: C.danger, fontWeight: 700, fontFamily: "'Cairo', sans-serif", marginBottom: 3 }}>
                    {`⚠️ ${t('conflictingSignals')}`}
                  </div>
                  {bayesianConsensus.conflictingSignals.map((cs, i) => (
                    <div key={i} style={{ fontSize: 9, color: C.textDim, fontFamily: "'Cairo', sans-serif", lineHeight: 1.4 }}>
                      • {cs.descriptionAr}
                    </div>
                  ))}
                </div>
              )}

              {/* Key Levels */}
              {bayesianConsensus.keyLevels.length > 0 && (
                <div style={{
                  padding: '6px 8px',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: 6,
                }}>
                  <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'Cairo', sans-serif", marginBottom: 3 }}>
                    {`📍 ${t('keyLevels')}`}
                  </div>
                  {bayesianConsensus.keyLevels.slice(0, 5).map((kl, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
                      <span style={{ fontSize: 9, color: C.textDim, fontFamily: "'Cairo', sans-serif" }}>{kl.label}</span>
                      <span style={{ fontSize: 9, color: kl.type === 'support' ? C.success : kl.type === 'resistance' ? C.danger : C.cyan, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                        {kl.price.toFixed(kl.price > 1000 ? 2 : 5)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Elliott+SMC Fusion */}
              {elliottSMCFusion && (
                <div style={{
                  padding: '6px 8px',
                  background: elliottSMCFusion.direction === 'bullish' ? 'rgba(0,255,163,0.04)' : elliottSMCFusion.direction === 'bearish' ? 'rgba(255,71,87,0.04)' : 'rgba(0,0,0,0.2)',
                  border: `1px solid ${elliottSMCFusion.direction === 'bullish' ? 'rgba(0,255,163,0.12)' : elliottSMCFusion.direction === 'bearish' ? 'rgba(255,71,87,0.12)' : C.border}'`,
                  borderRadius: 6,
                }}>
                  <div style={{ fontSize: 9, color: C.gold, fontWeight: 700, fontFamily: "'Cairo', sans-serif", marginBottom: 3 }}>
                    {`⚡ ${t('elliottSmcConfluence')}`}
                  </div>
                  <div style={{ fontSize: 9, color: C.textDim, fontFamily: "'Cairo', sans-serif", lineHeight: 1.5 }}>
                    {elliottSMCFusion.interpretationAr}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ fontSize: 8, color: C.textMuted }}>{t('confluencePoint')}</span>
                    <span style={{ fontSize: 9, color: C.gold, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                      {elliottSMCFusion.confluenceScore}/100
                    </span>
                  </div>
                  {/* Confluence breakdown */}
                  {elliottSMCFusion.confluenceBreakdown.map((cb, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                      <span style={{ fontSize: 8, color: C.textMuted }}>{cb.factorAr}</span>
                      <span style={{ fontSize: 8, color: cb.score >= 15 ? C.success : C.textDim, fontFamily: "'JetBrains Mono', monospace" }}>{cb.score}/25</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Adaptive TP/SL */}
              {adaptiveTPSL && (
                <div style={{
                  padding: '6px 8px',
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid rgba(212,175,55,0.15)',
                  borderRadius: 6,
                }}>
                  <div style={{ fontSize: 9, color: C.gold, fontWeight: 700, fontFamily: "'Cairo', sans-serif", marginBottom: 3 }}>
                    {`🎯 ${t('adaptiveTPSL')}`}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 9, color: C.cyan }}>{t('entry')}</span>
                      <span style={{ fontSize: 9, color: C.cyan, fontFamily: "'JetBrains Mono', monospace" }}>{adaptiveTPSL.entry.toFixed(adaptiveTPSL.entry > 1000 ? 2 : 5)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 9, color: C.danger }}>{t('stopLoss')}</span>
                      <span style={{ fontSize: 9, color: C.danger, fontFamily: "'JetBrains Mono', monospace" }}>{adaptiveTPSL.stopLoss.toFixed(adaptiveTPSL.stopLoss > 1000 ? 2 : 5)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 9, color: C.success }}>{t('takeProfit')}</span>
                      <span style={{ fontSize: 9, color: C.success, fontFamily: "'JetBrains Mono', monospace" }}>{adaptiveTPSL.takeProfit.toFixed(adaptiveTPSL.takeProfit > 1000 ? 2 : 5)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 3 }}>
                      <span style={{ fontSize: 8, color: C.textMuted }}>RR</span>
                      <span style={{ fontSize: 9, color: adaptiveTPSL.riskRewardRatio >= 2 ? C.success : C.warning, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                        1:{adaptiveTPSL.riskRewardRatio.toFixed(1)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 8, color: C.textMuted }}>{t('volatilityRegime')}</span>
                      <span style={{ fontSize: 8, color: adaptiveTPSL.regime === 'low' ? C.success : adaptiveTPSL.regime === 'high' ? C.danger : C.warning, fontFamily: "'JetBrains Mono', monospace" }}>
                        {adaptiveTPSL.regime === 'low' ? t('low') : adaptiveTPSL.regime === 'high' ? t('high') : adaptiveTPSL.regime === 'extreme' ? t('extreme') : t('normal')}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* State Machine Summary */}
              {stateMachineResult && (
                <div style={{
                  padding: '6px 8px',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: 6,
                }}>
                  <div style={{ fontSize: 9, color: C.cyan, fontWeight: 700, fontFamily: "'Cairo', sans-serif", marginBottom: 3 }}>
                    {`🔄 ${t('patternStateMachine')}`}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[
                      { label: t('forming'), count: stateMachineResult.summary.forming, color: C.warning },
                      { label: t('near'), count: stateMachineResult.summary.nearCompletion, color: C.cyan },
                      { label: t('completed'), count: stateMachineResult.summary.completed, color: C.success },
                      { label: t('broken'), count: stateMachineResult.summary.breakout, color: C.danger },
                      { label: t('failed'), count: stateMachineResult.summary.failed, color: C.textMuted },
                    ].map((s, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 3,
                        padding: '2px 6px', background: `${s.color}10`,
                        border: `1px solid ${s.color}25`, borderRadius: 4,
                      }}>
                        <span style={{ fontSize: 10, color: s.color, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{s.count}</span>
                        <span style={{ fontSize: 8, color: C.textDim, fontFamily: "'Cairo', sans-serif" }}>{s.label}</span>
                      </div>
                    ))}
                  </div>
                  {/* Breakout alerts */}
                  {stateMachineResult.alerts.filter(a => a.priority === 'critical').length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      {stateMachineResult.alerts.filter(a => a.priority === 'critical').map((a, i) => (
                        <div key={i} style={{ fontSize: 9, color: C.danger, fontFamily: "'Cairo', sans-serif", lineHeight: 1.4 }}>
                          🚨 {a.messageAr}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Pattern Performance */}
              {patternPerformance.length > 0 && (
                <div style={{
                  padding: '6px 8px',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: 6,
                }}>
                  <div style={{ fontSize: 9, color: C.gold, fontWeight: 700, fontFamily: "'Cairo', sans-serif", marginBottom: 3 }}>
                    {`📈 ${t('historicalPatternPerformance')}`}
                  </div>
                  {patternPerformance.slice(0, 6).map((pp, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <span style={{ fontSize: 9, color: C.textDim, fontFamily: "'Cairo', sans-serif" }}>{pp.patternType}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 8, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>{pp.totalTrades} {t('trade')}</span>
                        <span style={{
                          fontSize: 9, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                          color: pp.winRate >= 0.6 ? C.success : pp.winRate >= 0.4 ? C.warning : C.danger,
                        }}>
                          {(pp.winRate * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Heatmap Summary */}
              {heatmapData && heatmapData.points.length > 0 && (
                <div style={{
                  padding: '6px 8px',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: 6,
                }}>
                  <div style={{ fontSize: 9, color: C.textMuted, fontWeight: 700, fontFamily: "'Cairo', sans-serif", marginBottom: 3 }}>
                    {`🔥 ${t('confidenceMap')}`}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 8, color: C.textMuted }}>{t('dominantTrend')}</span>
                    <span style={{ fontSize: 9, color: heatmapData.dominantDirection === 'bullish' ? C.success : heatmapData.dominantDirection === 'bearish' ? C.danger : C.warning, fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}>
                      {heatmapData.dominantDirection === 'bullish' ? t('bullish') : heatmapData.dominantDirection === 'bearish' ? t('bearish') : t('neutral')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                    <span style={{ fontSize: 8, color: C.textMuted }}>{t('coverage')}</span>
                    <span style={{ fontSize: 9, color: C.textDim, fontFamily: "'JetBrains Mono', monospace" }}>{(heatmapData.coverage * 100).toFixed(0)}%</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Spinner animation */}
      <ScopedStyle>{`@keyframes aiSpin { to { transform: rotate(360deg); } }`}</ScopedStyle>
    </div>
  );
}

// ── Build Pattern Shape Points (for visual drawing on chart) ──
function buildPatternShape(patternType: string, candle: CandleData, prevCandle?: CandleData): { time: number; price: number }[] | undefined {
  const t = candle.time;
  const o = candle.open;
  const c = candle.close;
  const h = candle.high;
  const l = candle.low;
  const bodyTop = Math.max(o, c);
  const bodyBot = Math.min(o, c);
  // FIX: lightweight-charts LineSeries requires strictly time-ascending data.
  // Single-candle patterns (Doji, Hammer, etc.) with multiple points at the same
  // `time` render nothing or cause errors. We offset by ±1 second to create
  // valid ascending time series while keeping the visual shape on the same candle.
  const tBefore = t - 1;

  // Engulfing patterns — highlight the engulfing zone
  if (patternType === 'Engulfing Bullish' || patternType === 'Engulfing Bearish') {
    if (prevCandle) {
      const prevBodyTop = Math.max(prevCandle.open, prevCandle.close);
      const prevBodyBot = Math.min(prevCandle.open, prevCandle.close);
      return [
        { time: prevCandle.time, price: prevBodyTop },
        { time: tBefore, price: bodyTop },
        { time: t, price: bodyBot },
        { time: prevCandle.time + 1, price: prevBodyBot },
      ];
    }
    return [
      { time: tBefore, price: bodyTop },
      { time: t, price: bodyBot },
    ];
  }

  // Hammer — highlight the long lower wick
  if (patternType === 'Hammer') {
    return [
      { time: tBefore, price: bodyTop },
      { time: t, price: l },
    ];
  }

  // Shooting Star — highlight the long upper wick
  if (patternType === 'Shooting Star' || patternType === 'Inverted Hammer') {
    return [
      { time: tBefore, price: bodyBot },
      { time: t, price: h },
    ];
  }

  // Doji — highlight the cross shape
  if (patternType.includes('Doji')) {
    return [
      { time: tBefore, price: h },
      { time: t, price: l },
    ];
  }

  // Marubozu — highlight the large body
  if (patternType === 'Marubozu') {
    return [
      { time: tBefore, price: bodyTop },
      { time: t, price: bodyBot },
    ];
  }

  return undefined;
}

// ── Generate Local Entry/Exit (fallback when AI is unavailable) ──
function generateLocalEntryExit(lastCandle: CandleData, levels: SupportResistanceLevel[], _trendLines: TrendLine[], tFn?: (key: string, params?: Record<string, unknown>) => string): AIEntryExit {
  const price = lastCandle.close;
  const supports = levels.filter(l => l.type === 'support').sort((a, b) => b.price - a.price);
  const resistances = levels.filter(l => l.type === 'resistance').sort((a, b) => a.price - b.price);

  const nearestSupport = supports.find(l => l.price < price);
  const nearestResistance = resistances.find(l => l.price > price);

  // Simple trend detection
  const isBullish = lastCandle.close > lastCandle.open;
  const direction = isBullish ? 'long' : 'short';

  let entryPrice = price;
  let stopLoss = 0;
  let takeProfit = 0;

  if (direction === 'long') {
    stopLoss = nearestSupport ? nearestSupport.price * 0.999 : price * 0.98;
    takeProfit = nearestResistance ? nearestResistance.price : price * 1.03;
  } else {
    stopLoss = nearestResistance ? nearestResistance.price * 1.001 : price * 1.02;
    takeProfit = nearestSupport ? nearestSupport.price : price * 0.97;
  }

  const risk = Math.abs(entryPrice - stopLoss);
  const reward = Math.abs(takeProfit - entryPrice);
  const confidence = risk > 0 ? Math.min(0.85, Math.max(0.4, reward / risk * 0.4)) : 0.5;

  const keyLevels: { price: number; label: string }[] = [];
  if (nearestSupport) keyLevels.push({ price: nearestSupport.price, label: tFn ? `${tFn('support')} ${nearestSupport.strength === 'strong' ? tFn('strongSupport') : nearestSupport.strength === 'medium' ? tFn('medium') : tFn('weak')}` : `دعم ${nearestSupport.strength === 'strong' ? 'قوي' : nearestSupport.strength === 'medium' ? 'متوسط' : 'ضعيف'}` });
  if (nearestResistance) keyLevels.push({ price: nearestResistance.price, label: tFn ? `${tFn('resistance')} ${nearestResistance.strength === 'strong' ? tFn('strongResistance') : nearestResistance.strength === 'medium' ? tFn('medium') : tFn('weak')}` : `مقاومة ${nearestResistance.strength === 'strong' ? 'قوية' : nearestResistance.strength === 'medium' ? 'متوسطة' : 'ضعيفة'}` });

  return {
    direction,
    entryPrice,
    stopLoss,
    takeProfit,
    confidence,
    reasonAr: tFn
      ? (isBullish
        ? tFn('bullishCandleReason', { price: price.toFixed(price > 1000 ? 2 : 5) })
        : tFn('bearishCandleReason', { price: price.toFixed(price > 1000 ? 2 : 5) }))
      : (isBullish
        ? `الشمعة الأخيرة صاعدة مع إغلاق عند ${price.toFixed(price > 1000 ? 2 : 5)}. يُنصح بالشراء مع وقف خسارة تحت أقرب دعم.`
        : `الشمعة الأخيرة هابطة مع إغلاق عند ${price.toFixed(price > 1000 ? 2 : 5)}. يُنصح بالبيع مع وقف خسارة فوق أقرب مقاومة.`),
    keyLevels,
  };
}

// ── Basic Local Pattern Detection (fallback) ─────────────
export function detectLocalPatterns(candles: CandleData[]): AIPattern[] {
  const patterns: AIPattern[] = [];
  if (!candles || candles.length < 2) return patterns;

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;

    // Skip if no movement
    if (range <= 0) continue;

    // Doji — very small body relative to range
    if (body / range < 0.1) {
      // Dragonfly Doji — open=close=high, long lower wick
      if (upperWick < range * 0.1 && lowerWick > range * 0.6) {
        const shapePoints = buildPatternShape('Dragonfly Doji', c, prev);
        patterns.push({ type: 'Dragonfly Doji', labelAr: PATTERN_NAMES_AR['Dragonfly Doji'] || 'Dragonfly Doji', time: c.time, price: c.close, confidence: 0.7, direction: 'bullish', shapePoints, shapeType: 'line', shapeColor: 'rgba(0,255,163,0.4)' });
      }
      // Gravestone Doji — open=close=low, long upper wick
      else if (lowerWick < range * 0.1 && upperWick > range * 0.6) {
        const shapePoints = buildPatternShape('Gravestone Doji', c, prev);
        patterns.push({ type: 'Gravestone Doji', labelAr: PATTERN_NAMES_AR['Gravestone Doji'] || 'Gravestone Doji', time: c.time, price: c.close, confidence: 0.7, direction: 'bearish', shapePoints, shapeType: 'line', shapeColor: 'rgba(255,71,87,0.4)' });
      }
      // Regular Doji
      else {
        const shapePoints = buildPatternShape('Doji', c, prev);
        patterns.push({ type: 'Doji', labelAr: PATTERN_NAMES_AR['Doji'] || 'Doji', time: c.time, price: c.close, confidence: 0.7, direction: 'neutral', shapePoints, shapeType: 'line', shapeColor: 'rgba(251,191,36,0.3)' });
      }
    }

    // Hammer — small body at top, long lower wick
    if (body > 0 && lowerWick > body * 2 && upperWick < body * 0.5) {
      const shapePoints = buildPatternShape('Hammer', c, prev);
      patterns.push({ type: 'Hammer', labelAr: PATTERN_NAMES_AR['Hammer'] || 'Hammer', time: c.time, price: c.close, confidence: 0.75, direction: 'bullish', shapePoints, shapeType: 'line', shapeColor: 'rgba(0,255,163,0.4)' });
    }

    // Shooting Star / Inverted Hammer
    if (body > 0 && upperWick > body * 2 && lowerWick < body * 0.5) {
      const isUptrend = prev.close > prev.open;
      if (isUptrend) {
        const shapePoints = buildPatternShape('Shooting Star', c, prev);
        patterns.push({ type: 'Shooting Star', labelAr: PATTERN_NAMES_AR['Shooting Star'] || 'Shooting Star', time: c.time, price: c.close, confidence: 0.7, direction: 'bearish', shapePoints, shapeType: 'line', shapeColor: 'rgba(255,71,87,0.4)' });
      } else {
        const shapePoints = buildPatternShape('Inverted Hammer', c, prev);
        patterns.push({ type: 'Inverted Hammer', labelAr: PATTERN_NAMES_AR['Inverted Hammer'] || 'Inverted Hammer', time: c.time, price: c.close, confidence: 0.65, direction: 'bullish', shapePoints, shapeType: 'line', shapeColor: 'rgba(0,255,163,0.3)' });
      }
    }

    // Engulfing Bullish — prev red, current green engulfs prev body
    if (prev.close < prev.open && c.close > c.open && c.open <= prev.close && c.close >= prev.open) {
      const shapePoints = buildPatternShape('Engulfing Bullish', c, prev);
      patterns.push({ type: 'Engulfing Bullish', labelAr: PATTERN_NAMES_AR['Engulfing Bullish'] || 'Engulfing Bullish', time: c.time, price: c.close, confidence: 0.8, direction: 'bullish', shapePoints, shapeType: 'polygon', shapeColor: 'rgba(0,255,163,0.15)' });
    }

    // Engulfing Bearish — prev green, current red engulfs prev body
    if (prev.close > prev.open && c.close < c.open && c.open >= prev.close && c.close <= prev.open) {
      const shapePoints = buildPatternShape('Engulfing Bearish', c, prev);
      patterns.push({ type: 'Engulfing Bearish', labelAr: PATTERN_NAMES_AR['Engulfing Bearish'] || 'Engulfing Bearish', time: c.time, price: c.close, confidence: 0.8, direction: 'bearish', shapePoints, shapeType: 'polygon', shapeColor: 'rgba(255,71,87,0.15)' });
    }

    // Harami Bullish — prev big red, current small green inside
    if (prev.close < prev.open && c.close > c.open) {
      const prevBody = Math.abs(prev.open - prev.close);
      if (c.open > prev.close && c.close < prev.open && body < prevBody * 0.6) {
        patterns.push({ type: 'Harami Bullish', labelAr: PATTERN_NAMES_AR['Harami Bullish'] || 'Harami Bullish', time: c.time, price: c.close, confidence: 0.65, direction: 'bullish', shapeColor: 'rgba(0,255,163,0.15)' });
      }
    }

    // Harami Bearish — prev big green, current small red inside
    if (prev.close > prev.open && c.close < c.open) {
      const prevBody = Math.abs(prev.close - prev.open);
      if (c.open < prev.close && c.close > prev.open && body < prevBody * 0.6) {
        patterns.push({ type: 'Harami Bearish', labelAr: PATTERN_NAMES_AR['Harami Bearish'] || 'Harami Bearish', time: c.time, price: c.close, confidence: 0.65, direction: 'bearish', shapeColor: 'rgba(255,71,87,0.15)' });
      }
    }

    // Spinning Top — small body, wicks on both sides
    if (body > 0 && range > 0 && body / range < 0.3 && body / range >= 0.1 && upperWick > body * 0.5 && lowerWick > body * 0.5) {
      patterns.push({ type: 'Spinning Top', labelAr: PATTERN_NAMES_AR['Spinning Top'] || 'Spinning Top', time: c.time, price: c.close, confidence: 0.6, direction: 'neutral' });
    }

    // Marubozu — very large body, tiny wicks
    if (body > 0 && range > 0 && body / range > 0.85) {
      const shapePoints = buildPatternShape('Marubozu', c, prev);
      patterns.push({ type: 'Marubozu', labelAr: PATTERN_NAMES_AR['Marubozu'] || 'Marubozu', time: c.time, price: c.close, confidence: 0.75, direction: c.close > c.open ? 'bullish' : 'bearish', shapePoints, shapeType: 'line', shapeColor: c.close > c.open ? 'rgba(0,255,163,0.4)' : 'rgba(255,71,87,0.4)' });
    }
  }

  // Three-candle patterns
  for (let i = 2; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const prev2 = candles[i - 2];

    // Morning Star — bearish, small body, bullish
    if (prev2.close < prev2.open && c.close > c.open) {
      const prev2Body = Math.abs(prev2.open - prev2.close);
      const prevBody = Math.abs(prev.open - prev.close);
      const currBody = Math.abs(c.close - c.open);
      if (prevBody < prev2Body * 0.35 && currBody > prev2Body * 0.5) {
        patterns.push({ type: 'Morning Star', labelAr: PATTERN_NAMES_AR['Morning Star'] || 'Morning Star', time: c.time, price: c.close, confidence: 0.8, direction: 'bullish', shapeColor: 'rgba(0,255,163,0.15)' });
      }
    }

    // Evening Star — bullish, small body, bearish
    if (prev2.close > prev2.open && c.close < c.open) {
      const prev2Body = Math.abs(prev2.close - prev2.open);
      const prevBody = Math.abs(prev.open - prev.close);
      const currBody = Math.abs(c.open - c.close);
      if (prevBody < prev2Body * 0.35 && currBody > prev2Body * 0.5) {
        patterns.push({ type: 'Evening Star', labelAr: PATTERN_NAMES_AR['Evening Star'] || 'Evening Star', time: c.time, price: c.close, confidence: 0.8, direction: 'bearish', shapeColor: 'rgba(255,71,87,0.15)' });
      }
    }

    // Three White Soldiers
    if (prev2.close > prev2.open && prev.close > prev.open && c.close > c.open) {
      if (prev.close > prev2.close && c.close > prev.close) {
        patterns.push({ type: 'Three White Soldiers', labelAr: PATTERN_NAMES_AR['Three White Soldiers'] || 'Three White Soldiers', time: c.time, price: c.close, confidence: 0.8, direction: 'bullish', shapeColor: 'rgba(0,255,163,0.15)' });
      }
    }

    // Three Black Crows
    if (prev2.close < prev2.open && prev.close < prev.open && c.close < c.open) {
      if (prev.close < prev2.close && c.close < prev.close) {
        patterns.push({ type: 'Three Black Crows', labelAr: PATTERN_NAMES_AR['Three Black Crows'] || 'Three Black Crows', time: c.time, price: c.close, confidence: 0.8, direction: 'bearish', shapeColor: 'rgba(255,71,87,0.15)' });
      }
    }

    // Piercing Line
    if (prev.close < prev.open && c.close > c.open) {
      const prevMid = (prev.open + prev.close) / 2;
      if (c.open < prev.close && c.close > prevMid) {
        patterns.push({ type: 'Piercing Line', labelAr: PATTERN_NAMES_AR['Piercing Line'] || 'Piercing Line', time: c.time, price: c.close, confidence: 0.7, direction: 'bullish', shapeColor: 'rgba(0,255,163,0.15)' });
      }
    }

    // Dark Cloud Cover
    if (prev.close > prev.open && c.close < c.open) {
      const prevMid = (prev.open + prev.close) / 2;
      if (c.open > prev.close && c.close < prevMid) {
        patterns.push({ type: 'Dark Cloud Cover', labelAr: PATTERN_NAMES_AR['Dark Cloud Cover'] || 'Dark Cloud Cover', time: c.time, price: c.close, confidence: 0.7, direction: 'bearish', shapeColor: 'rgba(255,71,87,0.15)' });
      }
    }
  }

  // Deduplicate: keep only highest-confidence pattern per candle
  const bestByTime = new Map<number, AIPattern>();
  for (const p of patterns) {
    const existing = bestByTime.get(p.time);
    if (!existing || p.confidence > existing.confidence) {
      bestByTime.set(p.time, p);
    }
  }

  return Array.from(bestByTime.values()).slice(-10);
}

// ── Support/Resistance Level Detection ──────────────────
export function detectSupportResistance(candles: CandleData[]): SupportResistanceLevel[] {
  if (!candles || candles.length < 20) return [];
  const levels: SupportResistanceLevel[] = [];
  const windowSize = 8;

  for (let i = windowSize; i < candles.length - windowSize; i++) {
    const slice = candles.slice(i - windowSize, i + windowSize + 1);
    const current = candles[i];

    const isLocalHigh = slice.every(c => current.high >= c.high);
    if (isLocalHigh) {
      const existing = levels.find(l => l.type === 'resistance' && Math.abs(l.price - current.high) / current.high < 0.008);
      if (existing) {
        existing.price = (existing.price * existing.touches + current.high) / (existing.touches + 1);
        existing.touches++;
        existing.strength = existing.touches >= 3 ? 'strong' : existing.touches >= 2 ? 'medium' : 'weak';
      } else {
        levels.push({ price: current.high, type: 'resistance', strength: 'weak', touches: 1 });
      }
    }

    const isLocalLow = slice.every(c => current.low <= c.low);
    if (isLocalLow) {
      const existing = levels.find(l => l.type === 'support' && Math.abs(l.price - current.low) / current.low < 0.008);
      if (existing) {
        existing.price = (existing.price * existing.touches + current.low) / (existing.touches + 1);
        existing.touches++;
        existing.strength = existing.touches >= 3 ? 'strong' : existing.touches >= 2 ? 'medium' : 'weak';
      } else {
        levels.push({ price: current.low, type: 'support', strength: 'weak', touches: 1 });
      }
    }
  }

  const currentPrice = candles[candles.length - 1].close;

  const validSupports = levels.filter(l => l.type === 'support' && l.price <= currentPrice * 1.01);
  const validResistances = levels.filter(l => l.type === 'resistance' && l.price >= currentPrice * 0.99);

  validSupports.sort((a, b) => {
    if (b.touches !== a.touches) return b.touches - a.touches;
    return Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice);
  });

  validResistances.sort((a, b) => {
    if (b.touches !== a.touches) return b.touches - a.touches;
    return Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice);
  });

  return [...validSupports.slice(0, 3), ...validResistances.slice(0, 3)];
}

// ── Trend Line Detection ───────────────────────────────
export function detectTrendLines(candles: CandleData[]): TrendLine[] {
  // FIX: Reduced from 30 to 10
  if (!candles || candles.length < 10) return [];
  const lines: TrendLine[] = [];
  const lookback = Math.min(100, candles.length);

  const lows: { time: number; price: number }[] = [];
  for (let i = candles.length - lookback; i < candles.length; i++) {
    if (i < 2) continue;
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1] || curr;
    if (curr.low < prev.low && curr.low <= next.low) { // FIX: relaxed
      lows.push({ time: curr.time, price: curr.low });
    }
  }

  if (lows.length >= 2) {
    const first = lows[0];
    const last = lows[lows.length - 1];
    if (last.time > first.time) {
      lines.push({
        type: last.price >= first.price ? 'ascending' : 'descending',
        startPoint: first,
        endPoint: last,
        strength: lows.length >= 4 ? 'strong' : lows.length >= 3 ? 'medium' : 'weak',
      });
    }
  }

  const highs: { time: number; price: number }[] = [];
  for (let i = candles.length - lookback; i < candles.length; i++) {
    if (i < 2) continue;
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1] || curr;
    if (curr.high >= prev.high && curr.high >= next.high) {
      highs.push({ time: curr.time, price: curr.high });
    }
  }

  if (highs.length >= 2) {
    const first = highs[0];
    const last = highs[highs.length - 1];
    if (last.price < first.price) {
      lines.push({
        type: 'descending',
        startPoint: first,
        endPoint: last,
        strength: highs.length >= 4 ? 'strong' : highs.length >= 3 ? 'medium' : 'weak',
      });
    }
  }

  // FIX: Fallback if no swing points found
  if (lines.length === 0 && candles.length >= 10) {
    const start = candles[Math.max(0, candles.length - Math.min(100, candles.length))];
    const end = candles[candles.length - 1];
    lines.push({
      type: end.low >= start.low ? 'ascending' : 'descending',
      startPoint: { time: start.time, price: start.low },
      endPoint: { time: end.time, price: end.low },
      strength: 'weak',
    });
    lines.push({
      type: end.high >= start.high ? 'ascending' : 'descending',
      startPoint: { time: start.time, price: start.high },
      endPoint: { time: end.time, price: end.high },
      strength: 'weak',
    });
  }
  return lines;
}

// ── Technical Indicator Context Builder ──────────────────
// Builds a summary of key technical indicators to enrich AI analysis requests
function buildIndicatorContext(candles: CandleData[]): string {
  if (!candles || candles.length < 20) return '';

  const closes = candles.map(c => c.close);
  const last = closes[closes.length - 1];
  const prev = closes[closes.length - 2];

  // RSI (14-period)
  const rsi = calculateRSI(closes, 14);

  // EMA 20 and 50
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);

  // Bollinger Bands (20, 2)
  const bb = calculateBollingerBands(closes, 20, 2);

  // Simple trend detection
  const trend = last > ema20 && ema20 > ema50 ? 'UPTREND'
    : last < ema20 && ema20 < ema50 ? 'DOWNTREND'
    : 'SIDEWAYS';

  // MACD signal
  const macdSignal = last > ema20 ? 'BULLISH' : 'BEARISH';

  const parts = [
    `Current Price: ${last.toFixed(last > 1000 ? 2 : 5)}`,
    `Previous Close: ${prev.toFixed(prev > 1000 ? 2 : 5)}`,
    `RSI(14): ${rsi.toFixed(1)} (${rsi > 70 ? 'OVERBOUGHT' : rsi < 30 ? 'OVERSOLD' : 'NEUTRAL'})`,
    `EMA20: ${ema20.toFixed(ema20 > 1000 ? 2 : 5)}`,
    `EMA50: ${ema50.toFixed(ema50 > 1000 ? 2 : 5)}`,
    `Trend: ${trend}`,
    `MACD Signal: ${macdSignal}`,
  ];

  if (bb) {
    parts.push(`BB Upper: ${bb.upper.toFixed(bb.upper > 1000 ? 2 : 5)}`);
    parts.push(`BB Middle: ${bb.middle.toFixed(bb.middle > 1000 ? 2 : 5)}`);
    parts.push(`BB Lower: ${bb.lower.toFixed(bb.lower > 1000 ? 2 : 5)}`);
    const bbPosition = last > bb.upper ? 'ABOVE_UPPER' : last < bb.lower ? 'BELOW_LOWER' : 'WITHIN_BANDS';
    parts.push(`BB Position: ${bbPosition}`);
  }

  return parts.join(' | ');
}

function calculateRSI(closes: number[], period: number): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateEMA(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1] || 0;
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateBollingerBands(data: number[], period: number, multiplier: number): { upper: number; middle: number; lower: number } | null {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  const mean = slice.reduce((s, v) => s + v, 0) / period;
  const stdDev = Math.sqrt(slice.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / period);
  return {
    upper: mean + multiplier * stdDev,
    middle: mean,
    lower: mean - multiplier * stdDev,
  };
}

// ── Risk/Reward Calculator ──────────────────────────────
export function calculateRiskReward(entryExit: AIEntryExit): { ratio: number; riskPct: number; rewardPct: number } {
  const { entryPrice, stopLoss, takeProfit } = entryExit;
  if (!entryPrice || entryPrice <= 0) return { ratio: 0, riskPct: 0, rewardPct: 0 };

  const risk = stopLoss > 0 ? Math.abs(entryPrice - stopLoss) : 0;
  const reward = takeProfit > 0 ? Math.abs(takeProfit - entryPrice) : 0;
  const riskPct = risk > 0 ? (risk / entryPrice) * 100 : 0;
  const rewardPct = reward > 0 ? (reward / entryPrice) * 100 : 0;
  const ratio = risk > 0 ? reward / risk : 0;

  return { ratio, riskPct, rewardPct };
}
