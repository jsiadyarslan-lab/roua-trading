// ═══════════════════════════════════════════════════════════════
// ROUA AI Panel v5 — Revolutionary Edition
// Upgraded with: Bayesian Consensus, Pattern State Machine,
// Elliott+SMC Fusion, ATR Dynamic TP/SL, Pattern Performance,
// SSE Consensus Streaming, Confidence Heatmap
// ═══════════════════════════════════════════════════════════════
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import type { AIAnalysisResult, SupportResistanceLevel } from './AIPatternPanel';
import type { AIPattern, CandleData } from '@/lib/charts/types';
import { detectLocalPatterns, detectSupportResistance, detectTrendLines } from './AIPatternPanel';
import { detectSMC } from '@/lib/charts/SMCDetector';
import { detectGeometricPatterns } from '@/lib/charts/GeometricPatterns';
import { detectElliottWaves } from '@/lib/charts/ElliottWave';
import { detectWyckoff } from '@/lib/charts/WyckoffAnalysis';
// Phase 2: Professional Engines (10 Harmonic types, A-E Wyckoff, ABC+Fib Elliott)
import { detectElliottAdvanced, elliottToAIPatterns, type ElliottResult, type WaveCount } from '@/lib/charts/ElliottEngine';
import { detectWyckoffAdvanced, wyckoffToAIPatterns, type WyckoffResult, type WyckoffEvent } from '@/lib/charts/WyckoffEngine';
import { runUnifiedAnalysis, type UnifiedAnalysisResult } from '@/lib/charts/unified-analysis';
import { calcVolumeProfile } from '@/lib/charts/VolumeProfile';
import { detectHarmonicPatterns, detectClassicPatterns } from '@/lib/charts/HarmonicPatterns';
import { detectHarmonicPatternsPro, detectClassicPatternsPro } from '@/lib/charts/ProfessionalHarmonicPatterns';
import type { AlertMarkerData } from '@/lib/charts/chart-primitives';
// ── Revolutionary Engines ──
import { getBayesianEngine, extractSignalsFromAnalysis } from '@/lib/charts/BayesianEngine';
import { getPatternStateMachine } from '@/lib/charts/PatternStateMachine';
import { detectElliottSMCFusion } from '@/lib/charts/ElliottSMCFusion';
import { calcAdaptiveTPSL, getDynamicThresholds } from '@/lib/charts/ATRAdapter';
import { safeToFixed, safeNum } from '@/lib/charts/chart-utils';
import { getPatternPerformanceTracker } from '@/lib/charts/PatternPerformance';
import { buildHeatmap, type HeatmapResult } from '@/lib/charts/ConfidenceHeatmap';
import { runFullVerification, type FullVerificationReport, type EngineVerificationResult } from '@/lib/charts/EngineVerification';
import { evaluateSmartAlerts, buildAlertSnapshot, fireBrowserNotification, type TriggeredAlert, type AlertRule } from '@/lib/charts/SmartAlertEngine';
import { detectLiquidityZones, liquidityToAIPatterns, type LiquidityResult, type LiquidityZone } from '@/lib/charts/LiquidityZones';
import { generateTradeProposal, getTradeProposals, getProposalStats, getActiveProposals, autoEvaluateProposals, type TradeProposal, type RiskParams } from '@/lib/charts/AutoTradeEngine';
import { runQuickMTFAnalysis, detectTradingStyle, type MTFResult, type MTFTimeframe, TF_LABELS_AR } from '@/lib/charts/MTFEngine';
// Phase 5: Advanced Differentiating Features
import { runAdaptiveBayesian, detectMarketRegime, recordAdaptiveOutcome, getSourcePerformances, getAdaptiveSummary, setUserWeightOverride, getUserWeightOverrides, type AdaptiveBayesianResult, type AdaptiveSignalSource, type MarketRegime } from '@/lib/charts/AdaptiveBayesianEngine';
import { evaluateAllVisualRules, getVisualRules, type VisualRule, type RuleEvaluationResult, type RuleAnalysisData, SIGNAL_BLOCK_LIBRARY, CONNECTOR_LABELS_AR, CATEGORY_LABELS_AR } from '@/lib/charts/VisualRuleBuilder';
import { getPaperAccount, openPaperTrade, closePaperTrade, autoEvaluatePaperTrades, getPaperTrades, getOpenPaperTrades, getPerformanceComparison, type PaperTrade, type PaperAccount } from '@/lib/charts/PaperTradingEngine';
import { runMarketScan, runSingleAssetScan, getScanUniverse, type MarketScanResult, type AssetScanResult, SECTOR_LABELS_AR } from '@/lib/charts/MarketScannerEngine';
import { buildAICouncilPrompt, buildAIAnalysisPayload, queryAICouncil, compareAIWithAlgorithm, recordPrediction, verifyPredictions, getAIvsAlgoStats, getModelPerformances, type AIAnalysisPayload, type AICouncilBridgeResult, type AIModel } from '@/lib/charts/AICouncilBridge';
import { createIncrementalState, initializeState, updateIncremental, needsFullRecalc, getQuickTrend, getQuickVolatilityRegime, type IncrementalState } from '@/lib/charts/IncrementalCalc';
import { logError, logWarn, logInfo, getErrorCount, getRecentErrors } from '@/lib/charts/AnalysisLogger';
import { validateAnalysis, validateTradeSetup } from '@/lib/charts/AnalysisValidator';
// ── Revolutionary Feature Engines ──
import { runVisualBacktest, quickBacktest, type BacktestSignalResult, type BacktestStats } from '@/lib/charts/VisualBacktestEngine';
import { detectConfluenceZones, type ConfluenceZone } from '@/lib/charts/ConfluenceZones';
import { explainSignal, type SignalExplanation } from '@/lib/charts/AIExplanationEngine';
import { recordCorrelationEvent, evaluateCorrelationEvents, computeCorrelationMatrix, type CorrelationMatrix } from '@/lib/charts/CorrelationEngine';
import { predictPatternCompletion, type PatternPrediction } from '@/lib/charts/PredictivePatternCompletion';
import { recordPrediction as recordAdaptivePrediction, resolvePrediction, autoResolvePredictions, getAdaptiveIntelligenceState, calibrateConfidence, getSourceWeight, getAllSourceWeights, recordAnalysisPredictions, type AdaptiveIntelligenceState, type SignalSource as IntelligenceSignalSource } from '@/lib/charts/AdaptiveIntelligenceEngine';
import { computeScenarios, type ScenarioResult, type Scenario } from '@/lib/charts/ScenarioEngine';
import { detectSprings, type SpringDetectionResult, type SpringDetection } from '@/lib/charts/SpringDetectionEngine';
import { journalTradeProposal, syncJournalWithProposals, computeJournalStats, getJournalEntries, exportJournalJSON, generateReportHTML, clearJournal, type JournalEntry, type JournalStats } from '@/lib/charts/TradeJournal';

const C = {
  bg: '#0a0e17', card: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.09)',
  text: '#e8eaf0', dim: 'rgba(255,255,255,0.5)', mut: 'rgba(255,255,255,0.25)',
  cyan: '#22d3ee', green: '#10b981', red: '#ef4444', yellow: '#f59e0b',
  purple: '#a78bfa', gold: '#d4af37', blue: '#3b82f6',
};

// ── Map Geometric type → aiSmartPanel i18n key ──
const GEO_TYPE_TO_I18N: Record<string, string> = {
  'Double Top': 'patternDoubleTop',
  'Double Bottom': 'patternDoubleBottom',
  'Head and Shoulders': 'patternHeadAndShoulders',
  'Ascending Triangle': 'patternAscendingTriangle',
  'Descending Triangle': 'patternDescendingTriangle',
  'Rising Wedge': 'patternRisingWedge',
  'Falling Wedge': 'patternFallingWedge',
  'Symmetrical Triangle': 'patternSymmetricalTriangle',
};

// ── Map Wyckoff phase → aiSmartPanel i18n key ──
const WYCKOFF_PHASE_TO_I18N: Record<string, string> = {
  'Accumulation': 'overlayWyckoff',
  'Markup': 'bullish',
  'Distribution': 'bearish',
  'Markdown': 'bearish',
  'Unknown': 'neutral',
};

// Pattern name key mapping for i18n
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
  'Shooting Star': 'patternShootingStar',
  'Harami Bullish': 'patternHaramiBullish',
  'Harami Bearish': 'patternHaramiBearish',
  'Piercing Line': 'patternPiercingLine',
  'Dark Cloud Cover': 'patternDarkCloudCover',
  'Double Top': 'patternDoubleTop',
  'Double Bottom': 'patternDoubleBottom',
  'Head and Shoulders': 'patternHeadAndShoulders',
  'Ascending Triangle': 'patternAscendingTriangle',
  'Descending Triangle': 'patternDescendingTriangle',
  'Symmetrical Triangle': 'patternSymmetricalTriangle',
  'Rising Wedge': 'patternRisingWedge',
  'Falling Wedge': 'patternFallingWedge',
  'Gartley': 'patternGartley',
  'Butterfly': 'patternButterfly',
  'Bat': 'patternBat',
  'Crab': 'patternCrab',
  'Inverse Head and Shoulders': 'patternInverseHeadAndShoulders',
};

type Tab = 'signal' | 'patterns' | 'wyckoff' | 'elliott' | 'levels' | 'smc' | 'advanced' | 'alerts' | 'trades' | 'mtf' | 'adaptive' | 'rules' | 'paper' | 'scanner' | 'council' | 'backtest' | 'confluence' | 'explain' | 'correlate' | 'predict' | 'intelligence' | 'scenario' | 'spring' | 'journal';

interface Props {
  symbol: string;
  candles: CandleData[];
  currentPrice: number | null;
  onPatternsDetected: (r: AIAnalysisResult) => void;
  onClose: () => void;
  onExecuteTrade?: (side: 'long' | 'short', entry: number, sl: number, tp: number) => void;
  onScrollToTime?: (time: number) => void;
  /** Revolutionary: Pass heatmap data up to chart for overlay rendering */
  onHeatmapData?: (heatmap: HeatmapResult | null) => void;
  /** AI Stream mode — shows SSE streaming indicator */
  streamMode?: boolean;
  /** Sustainable: Direct overlay change callback — bypasses onPatternsDetected
   *  Called when user toggles any overlay button. The chart uses its cached
   *  analysis data + the new overlay flags to render instantly, without
   *  needing a full re-emit through onPatternsDetected. This eliminates
   *  double-emission, flicker, and the need for analyze() to complete first. */
  onOverlayChange?: (overlays: {
    sr: boolean; trend: boolean; harmonic: boolean; fvg: boolean;
    bos: boolean; geo: boolean; ew: boolean; wyckoff: boolean;
    vp: boolean; entry: boolean; mtf: boolean; liq: boolean; trade: boolean;
  }) => void;
}

export function AISmartPanel({ symbol, candles, currentPrice, onPatternsDetected, onClose, onExecuteTrade, onScrollToTime, onHeatmapData, streamMode, onOverlayChange }: Props) {
  const t = useTranslations('aiSmartPanel');
  const locale = useLocale();
  const timeLocale = locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : locale === 'tr' ? 'tr-TR' : 'en-US';
  const [tab, setTab] = useState<Tab>('signal');
  const [loading, setLoading] = useState(false);
  const [signal, setSignal] = useState<{ dir: 'BUY' | 'SELL' | 'WAIT'; conf: number; entry: number; sl: number; tp: number; reason: string; ts: number; regime?: string; bayesianDir?: string; bayesianConf?: number; fusionScore?: number } | null>(null);
  const [patterns, setPatterns] = useState<AIPattern[]>([]);
  const [levels, setLevels] = useState<SupportResistanceLevel[]>([]);
  const [geoList, setGeoList] = useState<any[]>([]);
  const [elliottData, setElliottData] = useState<any>(null);
  const [wyckoffData, setWyckoffData] = useState<any>(null);
  // Phase 2: Professional engine results
  const [elliottAdvanced, setElliottAdvanced] = useState<ElliottResult | null>(null);
  const [wyckoffAdvanced, setWyckoffAdvanced] = useState<WyckoffResult | null>(null);
  const [unifiedResult, setUnifiedResult] = useState<UnifiedAnalysisResult | null>(null);
  const [volProfile, setVolProfile] = useState<any>(null);
  const [overlays, setOverlays] = useState({ sr: false, trend: false, harmonic: false, fvg: false, bos: false, geo: false, ew: false, wyckoff: false, vp: false, entry: false, mtf: false, liq: false, trade: false });
  const toggleOverlay = (key: keyof typeof overlays) => setOverlays(prev => ({...prev, [key]: !prev[key]}));

  // ── Alert markers state ── Visual pins on chart for auto-detected patterns
  const [chartAlerts, setChartAlerts] = useState<AlertMarkerData[]>([]);
  const alertsDedupRef = useRef<Set<string>>(new Set()); // Prevent duplicate alerts

  // ── Revolutionary State ─────────────────────────────────
  const [bayesianResult, setBayesianResult] = useState<any>(null);
  const [stateMachineResult, setStateMachineResult] = useState<any>(null);
  const [fusionResult, setFusionResult] = useState<any>(null);
  const [performanceStats, setPerformanceStats] = useState<any>(null);
  const [heatmapResult, setHeatmapResult] = useState<HeatmapResult | null>(null);
  // Phase 3 states
  const [smartAlerts, setSmartAlerts] = useState<TriggeredAlert[]>([]);
  const [liquidityResult, setLiquidityResult] = useState<LiquidityResult | null>(null);
  const [tradeProposals, setTradeProposals] = useState<TradeProposal[]>([]);
  const [proposalStats, setProposalStats] = useState<ReturnType<typeof getProposalStats> | null>(null);
  // Phase 3: MTF Analysis
  const [mtfResult, setMtfResult] = useState<MTFResult | null>(null);
  const [mtfLoading, setMtfLoading] = useState(false);
  const [volRegime, setVolRegime] = useState<string>('normal');
  const [verificationReport, setVerificationReport] = useState<FullVerificationReport | null>(null);
  const [showVerification, setShowVerification] = useState(false);
  // Phase 5: Adaptive Bayesian, Visual Rules, Paper Trading, Scanner, AI Council
  const [adaptiveResult, setAdaptiveResult] = useState<AdaptiveBayesianResult | null>(null);
  const [marketRegime, setMarketRegime] = useState<MarketRegime>('quiet');
  const [adaptiveSummary, setAdaptiveSummary] = useState<ReturnType<typeof getAdaptiveSummary> | null>(null);
  const [visualRuleResults, setVisualRuleResults] = useState<Array<{ rule: VisualRule; result: RuleEvaluationResult }>>([]);
  const [paperAccountState, setPaperAccountState] = useState<PaperAccount | null>(null);
  const [paperTradesList, setPaperTradesList] = useState<PaperTrade[]>([]);
  const [paperComparison, setPaperComparison] = useState<ReturnType<typeof getPerformanceComparison> | null>(null);
  const [scanResult, setScanResult] = useState<MarketScanResult | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [aiBridgePayload, setAiBridgePayload] = useState<AIAnalysisPayload | null>(null);
  const [aiVsAlgoStats, setAiVsAlgoStats] = useState<ReturnType<typeof getAIvsAlgoStats> | null>(null);
  const [councilAnalyses, setCouncilAnalyses] = useState<Array<{ model: string; direction: string; confidence: number; reasoning: string }>>([]);
  // Revolutionary features state
  const [backtestStats, setBacktestStats] = useState<BacktestStats | null>(null);
  const [backtestSignals, setBacktestSignals] = useState<BacktestSignalResult[]>([]);
  const [confluenceZones, setConfluenceZones] = useState<ConfluenceZone[]>([]);
  const [signalExplanation, setSignalExplanation] = useState<SignalExplanation | null>(null);
  const [explainSource, setExplainSource] = useState<string>('');
  const [correlationMatrix, setCorrelationMatrix] = useState<CorrelationMatrix | null>(null);
  const [patternPredictions, setPatternPredictions] = useState<PatternPrediction[]>([]);
  const [adaptiveIntelligence, setAdaptiveIntelligence] = useState<AdaptiveIntelligenceState | null>(null);
  const [scenarioResult, setScenarioResult] = useState<ScenarioResult | null>(null);
  const [springResult, setSpringResult] = useState<SpringDetectionResult | null>(null);

  // ── Trade Journal State ──
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [journalStats, setJournalStats] = useState<JournalStats | null>(null);

  // ── Refs to avoid stale closure ─────────────────────────────
  const runRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pendingTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const lastAnnouncedRef = useRef<Set<string>>(new Set()); // Track announced patterns to avoid re-announce
  const lastAnalysisResultRef = useRef<AIAnalysisResult | null>(null); // Store last result for overlay re-emit
  const incrementalStateRef = useRef<IncrementalState>(createIncrementalState()); // Phase 4: Incremental O(1) updates

  // ── Safe timeout helper — tracks timers for cleanup on unmount ──
  const safeTimeout = (fn: () => void, ms: number): ReturnType<typeof setTimeout> => {
    const id = setTimeout(() => {
      pendingTimersRef.current.delete(id);
      fn();
    }, ms);
    pendingTimersRef.current.add(id);
    return id;
  };
  // Always fresh references — never stale
  const candlesRef = useRef<CandleData[]>(candles);
  const symbolRef = useRef(symbol);
  const priceRef = useRef(currentPrice);
  const onPatternsRef = useRef(onPatternsDetected);
  const onHeatmapRef = useRef(onHeatmapData);

  // Keep refs in sync
  useEffect(() => { candlesRef.current = candles; }, [candles]);
  useEffect(() => { symbolRef.current = symbol; }, [symbol]);
  useEffect(() => { priceRef.current = currentPrice; }, [currentPrice]);
  useEffect(() => { onPatternsRef.current = onPatternsDetected; }, [onPatternsDetected]);
  useEffect(() => { onHeatmapRef.current = onHeatmapData; }, [onHeatmapData]);
  const onOverlayChangeRef = useRef(onOverlayChange);
  useEffect(() => { onOverlayChangeRef.current = onOverlayChange; }, [onOverlayChange]);

  // ── Core analyze — uses refs, never stale ──────────────────
  const analyze = async () => {
    const c = candlesRef.current;
    const sym = symbolRef.current;
    const price = priceRef.current ?? c[c.length - 1]?.close ?? 0;

    if (runRef.current || !c?.length || c.length < 20) return;
    runRef.current = true;
    setLoading(true);

    // Phase 4: Incremental O(1) updates — initialize or update state
    const incState = incrementalStateRef.current;
    if (!incState.initialized || needsFullRecalc(incState, c.length)) {
      initializeState(incState, c);
    } else if (c.length > incState.lastCandleCount) {
      // Incremental update: only process new candles
      const newCandleCount = c.length - incState.lastCandleCount;
      for (let i = c.length - newCandleCount; i < c.length; i++) {
        updateIncremental(incState, c[i], i > 0 ? c[i - 1] : null);
      }
    }

    // Use quick trend and volatility from incremental state
    const quickTrend = getQuickTrend(incState);
    const quickVolRegime = getQuickVolatilityRegime(incState, price);
    setVolRegime(quickVolRegime);

    try {
      // ── 1. Local pattern detection ────────────────────────────
      const raw = detectLocalPatterns(c.slice(-50));
      const seen = new Set<string>();
      const unique = raw.filter(p => { if (seen.has(p.type)) return false; seen.add(p.type); return true; });

      const srLevels = detectSupportResistance(c);
      const trendLines = detectTrendLines(c);

      // ── 2. Detector outputs for chart + revolutionary engines ──
      const smcData = detectSMC(c);
      const geoPatterns = detectGeometricPatterns(c);
      const elliottPattern = detectElliottWaves(c);
      const wyckoff = detectWyckoff(c);
      const volumeProfile = calcVolumeProfile(c);
      // Use professional harmonic pattern engine (ATR-based, clean XABCD format)
      const harmonicPatterns = detectHarmonicPatternsPro(c);
      const classicPatterns = detectClassicPatternsPro(c);

      // Merge harmonic + classic patterns into the unique list
      const allPatterns = [...unique];
      const harmonicSeen = new Set<string>();
      for (const hp of harmonicPatterns) {
        const key = `${hp.type}_${hp.direction}`;
        if (!harmonicSeen.has(key)) {
          harmonicSeen.add(key);
          allPatterns.push(hp);
        }
      }
      for (const cp of classicPatterns) {
        const key = `${cp.type}_${cp.direction}`;
        if (!harmonicSeen.has(key)) {
          harmonicSeen.add(key);
          allPatterns.push(cp);
        }
      }

      setPatterns(allPatterns);
      setLevels(srLevels);
      setGeoList(geoPatterns);
      setElliottData(elliottPattern);
      setWyckoffData(wyckoff);
      setVolProfile(volumeProfile);

      // ── 2.5 PHASE 2: Professional Engines ──────────────────────
      // Advanced Wyckoff (A-E phases with events: SC, AR, ST, Spring, SOS, etc.)
      try {
        const wyckoffAdv = detectWyckoffAdvanced(c);
        setWyckoffAdvanced(wyckoffAdv);
        // Merge Wyckoff advanced patterns into allPatterns
        if (wyckoffAdv.scheme !== 'none') {
          const wyckoffPatterns = wyckoffToAIPatterns(wyckoffAdv);
          for (const wp of wyckoffPatterns) {
            const key = `${wp.type}_${wp.direction}`;
            if (!harmonicSeen.has(key)) {
              harmonicSeen.add(key);
              allPatterns.push(wp);
            }
          }
        }
      } catch (e) { /* Wyckoff advanced fallback */ }

      // Advanced Elliott (ABC corrections + Fibonacci ratio verification)
      try {
        const elliottAdv = detectElliottAdvanced(c);
        setElliottAdvanced(elliottAdv);
        // Merge Elliott advanced patterns into allPatterns
        if (elliottAdv.counts.length > 0) {
          const elliottPatterns = elliottToAIPatterns(elliottAdv);
          for (const ep of elliottPatterns) {
            const key = `${ep.type}_${ep.direction}`;
            if (!harmonicSeen.has(key)) {
              harmonicSeen.add(key);
              allPatterns.push(ep);
            }
          }
        }
      } catch (e) { /* Elliott advanced fallback */ }

      // Unified Analysis Layer (aggregates all engine results)
      try {
        const unified = runUnifiedAnalysis(c);
        setUnifiedResult(unified);
      } catch (e) { /* Unified analysis fallback */ }

      // ── 3. REVOLUTIONARY: ATR Dynamic Thresholds + Volatility Regime ──
      let regime = 'normal';
      try {
        const thresholds = getDynamicThresholds(c);
        regime = thresholds.volatilityRegime;
        setVolRegime(regime);
      } catch { /* fallback */ }

      // ── 4. REVOLUTIONARY: Bayesian Consensus Engine (Real Naive Bayes) ──
      let bayesianDir = 'neutral';
      let bayesianConf = 0.33;
      try {
        const bayesian = getBayesianEngine(c); // Pass candles for prior calculation
        const signals = extractSignalsFromAnalysis({
          patterns: unique,
          smcData,
          elliottPattern,
          wyckoff,
          volumeProfile,
          geoPatterns,
        });
        const consensus = bayesian.combine(signals);
        setBayesianResult(consensus);
        bayesianDir = consensus.direction;
        bayesianConf = consensus.confidence;
      } catch { /* Bayesian fallback */ }

      // ── 5. REVOLUTIONARY: Elliott+SMC Fusion ─────────────────
      let fusionScore = 0;
      try {
        const fusion = detectElliottSMCFusion({
          candles: c,
          elliott: elliottPattern,
          orderBlocks: smcData?.orderBlocks ?? [],
          fvgs: smcData?.fvgs ?? [],
          structureBreaks: smcData?.structureBreaks ?? [],
          wyckoff,
          volumeProfile,
        });
        setFusionResult(fusion);
        fusionScore = fusion.confluenceScore;
      } catch { /* Fusion fallback */ }

      // ── 6. REVOLUTIONARY: Pattern State Machine (Real FSM) ──────
      try {
        const sm = getPatternStateMachine();
        // Convert all patterns (including harmonic/classic) for state tracking
        const smPatterns = allPatterns.map(p => ({
          id: `${p.type}_${p.direction}_${Math.round(p.time || Date.now() / 1000)}`,
          type: p.type,
          direction: p.direction as 'bullish' | 'bearish',
          confidence: p.confidence || 0.5,
          points: p.points || p.shapePoints || [{ time: p.time || Date.now() / 1000, price }],
          breakoutPrice: p.breakoutPrice || price * (p.direction === 'bullish' ? 1.02 : 0.98),
          quality: { overall: Math.round((p.confidence || 0.5) * 100) },
          time: p.time,
          przLevel: p.przLevel || p.price,
          stopLoss: p.stopLoss,
          takeProfit: p.takeProfit || p.target,
        }));
        const smResult = sm.update(c, smPatterns);
        setStateMachineResult(smResult);

        // Audio alerts for state transitions (only NEW transitions)
        if (smResult.alerts.length > 0) {
          try {
            const { getPatternAudioAlerter } = await import('@/lib/charts/AudioAlerts');
            const alerter = getPatternAudioAlerter();
            for (const alert of smResult.alerts) {
              const alertKey = `${alert.patternType}-${alert.state}`;
              if (!lastAnnouncedRef.current.has(alertKey)) {
                lastAnnouncedRef.current.add(alertKey);
                // Clear old entries after 60s
                safeTimeout(() => lastAnnouncedRef.current.delete(alertKey), 60000);
                if (alert.state === 'triggered') {
                  alerter.announceBreakout({
                    patternType: alert.patternType,
                    patternTypeAr: alert.messageAr || alert.patternType,
                    symbol: sym,
                    direction: alert.direction === 'bullish' ? 'bullish' : 'bearish',
                    price,
                  });
                } else if (alert.priority === 'critical' || alert.state === 'confirmed') {
                  alerter.announce({
                    patternType: alert.patternType,
                    patternTypeAr: alert.messageAr || alert.patternType,
                    symbol: sym,
                    direction: alert.direction === 'bullish' ? 'bullish' : 'bearish',
                    confidence: alert.state === 'confirmed' ? 0.95 : 0.7,
                  });
                }
              }
            }
          } catch { /* Audio not available */ }
        }
      } catch { /* State machine fallback */ }

      // ── 7. REVOLUTIONARY: Pattern Performance Tracking ───────
      try {
        const tracker = getPatternPerformanceTracker();
        // Record detected patterns for performance tracking
        unique.forEach(p => {
          tracker.recordDetection({
            patternType: p.type,
            symbol: sym,
            direction: p.direction as 'bullish' | 'bearish',
            entryPrice: price,
            stopLoss: price * (p.direction === 'bullish' ? 0.97 : 1.03),
            takeProfit: price * (p.direction === 'bullish' ? 1.05 : 0.95),
            confidence: p.confidence,
            timeframe: 'auto',
            detectorSource: 'local',
          });
        });
        const stats = tracker.getSummary();
        setPerformanceStats(stats);
      } catch { /* Performance tracking fallback */ }

      // ── 8. REVOLUTIONARY: Confidence Heatmap (Real Signal-Based) ──
      try {
        // Pass full analysis data for signal-range extraction
        const heatmap = buildHeatmap(c, [{
          patterns: allPatterns,
          smcData,
          elliottPattern,
          wyckoff,
          volumeProfile,
          geoPatterns,
        }] as any);
        setHeatmapResult(heatmap);
        onHeatmapRef.current?.(heatmap);
      } catch { /* Heatmap fallback */ }

      // ── Phase 3: MTF Multi-Timeframe Analysis ────────────────────
      try {
        setMtfLoading(true);
        // Quick MTF analysis using current chart data (simulated higher TFs)
        const mtf = runQuickMTFAnalysis(c, '1h');
        setMtfResult(mtf);
      } catch { /* MTF fallback */ }
      finally { setMtfLoading(false); }

      // ── Phase 3: Liquidity Zones ────────────────────────────────
      try {
        const liqResult = detectLiquidityZones(c);
        setLiquidityResult(liqResult);
        // Add liquidity zone patterns to the chart
        const liqPatterns = liquidityToAIPatterns(liqResult);
        allPatterns.push(...liqPatterns);
      } catch { /* Liquidity fallback */ }

      // ── Phase 3: Smart Alerts ───────────────────────────────────
      try {
        const alertSnapshot = buildAlertSnapshot({
          patterns: allPatterns,
          smcData,
          elliottResult: elliottAdvanced,
          wyckoffResult: wyckoffAdvanced,
          currentPrice: price,
          timeframe: 'auto',
          trendLines,
          volumeProfile,
          liquidityResult,
          // Revolutionary: Pass pattern predictions for early alerts
          patternPredictions: patternPredictions?.map(p => ({
            patternType: p.patternType,
            predictedDirection: p.predictedDirection,
            completionPct: p.completionPct,
            confidence: p.confidence,
            targetPrice: p.completionZone?.center || price,
          })),
        });
        const alerts = evaluateSmartAlerts(alertSnapshot);
        setSmartAlerts(alerts);
        // Fire browser notifications for critical alerts
        for (const alert of alerts.filter(a => a.priority === 'critical')) {
          try { fireBrowserNotification(alert); } catch {}
        }
      } catch { /* Smart Alerts fallback */ }

      // ── Phase 3: Auto-Trade Proposal ────────────────────────────
      try {
        // IMPROVED: Lower threshold — include even single strong signals
        // Also include SMC signals (BOS/CHoCH) and volume signals
        const tradeSignals = allPatterns
          .filter(p => p.direction !== 'neutral' && p.confidence >= 0.3)
          .map(p => ({
            source: p.type || 'unknown',
            direction: p.direction,
            confidence: p.confidence,
            keyLevel: p.price || price,
          }));

        // Add SMC structure breaks as trade signals (strong directional)
        for (const brk of (smcData?.structureBreaks || []).slice(-3)) {
          tradeSignals.push({
            source: `smc:${brk.type}`,
            direction: brk.direction === 'bullish' ? 'bullish' as const : 'bearish' as const,
            confidence: 0.6,
            keyLevel: brk.price || price,
          });
        }

        // Add Bayesian result as a signal (if strong enough)
        if (bayesianConf > 0.45 && bayesianDir !== 'neutral') {
          tradeSignals.push({
            source: 'bayesian',
            direction: bayesianDir as 'bullish' | 'bearish',
            confidence: bayesianConf,
            keyLevel: price,
          });
        }

        // Add fusion result as a signal
        if (fusionScore > 40) {
          tradeSignals.push({
            source: 'elliott-smc-fusion',
            direction: fusionResult?.direction === 'bearish' ? 'bearish' as const : 'bullish' as const,
            confidence: fusionScore / 100,
            keyLevel: price,
          });
        }

        // If no signals yet, create one from the dominant pattern direction
        if (tradeSignals.length === 0) {
          const bullCount = allPatterns.filter(p => p.direction === 'bullish').length;
          const bearCount = allPatterns.filter(p => p.direction === 'bearish').length;
          if (bullCount + bearCount > 0) {
            tradeSignals.push({
              source: 'pattern-count',
              direction: bullCount > bearCount ? 'bullish' as const : 'bearish' as const,
              confidence: Math.max(bullCount, bearCount) / (bullCount + bearCount + 1),
              keyLevel: price,
            });
          }
        }

        const confluenceDir = tradeSignals.filter(s => s.direction === 'bullish').length >
          tradeSignals.filter(s => s.direction === 'bearish').length ? 'bullish' : 'bearish';

        const confluenceScore = Math.round(
          (tradeSignals.filter(s => s.direction === confluenceDir).reduce((sum, s) => sum + s.confidence, 0) /
            (tradeSignals.length || 1)) * 100
        );

        // ── Build Revolutionary Boost from previous cycle data ──
        // NOTE: We use state values from the PREVIOUS analysis cycle here.
        // This is safe because the data updates every cycle and the values
        // are only a few seconds stale. On first cycle, they'll be empty
        // and the boost is simply skipped (no effect).
        const revBoost: import('@/lib/charts/AutoTradeEngine').RevolutionaryBoost = {};

        // 1. Confluence Zone Boost — find best zone matching our direction
        if (confluenceZones && confluenceZones.length > 0) {
          const matchingZone = confluenceZones
            .filter(z => z.direction === confluenceDir && z.isActive)
            .sort((a, b) => b.score - a.score)[0];
          if (matchingZone) {
            revBoost.confluenceZoneBoost = {
              score: matchingZone.score,
              direction: matchingZone.direction,
              isActive: matchingZone.isActive,
              signalCount: matchingZone.signalCount,
            };
          }
        }

        // 2. Backtest Source Weights — map per-source win rates
        if (backtestStats?.bySource) {
          const weights: Record<string, { winRate: number; sampleSize: number }> = {};
          for (const [source, data] of Object.entries(backtestStats.bySource)) {
            if (data.total >= 5) {
              weights[source] = { winRate: data.winRate, sampleSize: data.total };
            }
          }
          if (Object.keys(weights).length > 0) {
            revBoost.backtestSourceWeights = weights;
          }
        }

        // 3. Correlation Boost — find best combo that includes one of our signals
        if (correlationMatrix?.topCombinations && correlationMatrix.topCombinations.length > 0) {
          const ourSources = new Set(tradeSignals.map(s => s.source));
          const bestCombo = correlationMatrix.topCombinations.find(combo =>
            combo.winRate > 0.5 && combo.sources.some(s => ourSources.has(s))
          );
          if (bestCombo) {
            const partner = bestCombo.sources.find(s => !ourSources.has(s)) || bestCombo.sources[0];
            revBoost.correlationBoost = {
              combinedWinRate: bestCombo.winRate,
              lift: bestCombo.winRate / (tradeSignals[0]?.confidence || 0.5),
              partnerSource: partner,
            };
          }
        }

        // 4. Prediction Near Completion — find pattern matching our direction
        if (patternPredictions && patternPredictions.length > 0) {
          const nearCompletion = patternPredictions
            .filter(p => p.predictedDirection === confluenceDir && p.completionPct >= 60)
            .sort((a, b) => b.completionPct - a.completionPct)[0];
          if (nearCompletion) {
            revBoost.predictionNearCompletion = {
              patternType: nearCompletion.patternType,
              predictedDirection: nearCompletion.predictedDirection,
              completionPct: nearCompletion.completionPct,
              confidence: nearCompletion.confidence,
              targetPrice: nearCompletion.completionZone?.center || price,
            };
          }
        }

        // 5. Explanation Risk — from AI explanation if available
        if (signalExplanation?.riskLevel) {
          revBoost.explanationRisk = signalExplanation.riskLevel;
        }

        const proposal = generateTradeProposal({
          candles: c,
          direction: confluenceDir,
          confluenceScore,
          signals: tradeSignals,
          patternSource: tradeSignals[0]?.source || 'confluence',
          currentPrice: price,
          timeframe: 'auto',
          mtfConfluence: mtfResult ? {
            direction: mtfResult.confluenceDirection,
            score: mtfResult.confluenceScore,
            agreeingTFs: mtfResult.agreeingTFs,
          } : undefined,
          volRegime,
          revolutionaryBoost: revBoost,
        });

        if (proposal) {
          setTradeProposals(prev => [proposal, ...prev.slice(0, 9)]);
          // ── Auto-journal this proposal ──
          try {
            journalTradeProposal({
              proposal,
              symbol: (window as any).__roua_symbol || 'UNKNOWN',
              regime: volRegime || 'unknown',
              revolutionaryBoost: revBoost,
            });
            setJournalEntries(getJournalEntries());
            setJournalStats(computeJournalStats());
          } catch { /* Journal fallback */ }
        }
        setProposalStats(getProposalStats());
      } catch { /* Auto-Trade fallback */ }

      // ── Phase 5: Adaptive Bayesian Engine ──────────────────────────
      try {
        const regime = detectMarketRegime(c);
        setMarketRegime(regime);

        const adaptiveSignals: AdaptiveSignalSource[] = extractSignalsFromAnalysis({
          patterns: unique,
          smcData,
          elliottPattern,
          wyckoff,
          volumeProfile,
          geoPatterns,
        }).map(s => ({
          source: s.source,
          direction: s.direction,
          baseConfidence: s.confidence,
          adaptiveWeight: s.weight,
          timestamp: Date.now(),
        }));

        const adaptive = runAdaptiveBayesian(adaptiveSignals, c);
        setAdaptiveResult(adaptive);
        setAdaptiveSummary(getAdaptiveSummary());
      } catch { /* Adaptive Bayesian fallback */ }

      // ── Phase 5: Visual Rule Builder Evaluation ────────────────────
      try {
        const ruleAnalysisData: RuleAnalysisData = {
          harmonicPatterns: harmonicPatterns.filter(p => p.direction !== 'neutral').map(p => ({
            type: p.type, direction: p.direction as 'bullish' | 'bearish', confidence: p.confidence, przLevel: (p as any).przLevel || p.price || price,
          })),
          orderBlocks: (smcData?.orderBlocks || []).map((ob: any) => ({
            type: ob.type, strength: ob.strength, price: (ob.high + ob.low) / 2, broken: ob.broken,
          })),
          fvgs: (smcData?.fvgs || []).map((fvg: any) => ({
            type: fvg.type, filled: fvg.filled, midPrice: (fvg.high + fvg.low) / 2,
          })),
          structureBreaks: (smcData?.structureBreaks || []).map((brk: any) => ({
            type: brk.type, direction: brk.direction, price: brk.price,
          })),
          elliottResult: elliottAdvanced?.dominantCount ? {
            direction: elliottAdvanced.dominantCount.direction, confidence: elliottAdvanced.dominantCount.confidence, waveType: elliottAdvanced.dominantCount.type,
          } : null,
          wyckoffResult: wyckoffAdvanced && wyckoffAdvanced.scheme !== 'none' ? {
            scheme: wyckoffAdvanced.scheme, direction: wyckoffAdvanced.direction, confidence: wyckoffAdvanced.confidence,
            events: wyckoffAdvanced.events.map((e: any) => e.type),
          } : null,
          candlestickPatterns: unique.filter(p => p.direction !== 'neutral').map(p => ({ type: p.type, direction: p.direction as 'bullish' | 'bearish', confidence: p.confidence, price: p.price || price })),
          volumeAnomalies: [],
          fibonacciLevels: [],
          trendlineEvents: [],
          currentPrice: price,
        };

        const ruleResults = evaluateAllVisualRules(ruleAnalysisData);
        setVisualRuleResults(ruleResults);
      } catch { /* Visual Rule Builder fallback */ }

      // ── Phase 5: Paper Trading Evaluation ──────────────────────────
      try {
        autoEvaluatePaperTrades(price, c);
        setPaperAccountState(getPaperAccount());
        setPaperTradesList(getPaperTrades().slice(0, 10));
        setPaperComparison(getPerformanceComparison());
      } catch { /* Paper Trading fallback */ }

      // ── Phase 5: Auto-Trade Proposal Evaluation (SL/TP/Trailing Stop) ──
      try {
        const evaluatedProposals = autoEvaluateProposals(price, c);
        if (evaluatedProposals.length > 0) {
          setTradeProposals(getTradeProposals());
        }
      } catch { /* Auto-Trade evaluation fallback */ }

      // ── Phase 5: AI Council Bridge ─────────────────────────────────
      try {
        const bridgePayload = buildAIAnalysisPayload({
          symbol: sym, currentPrice: price, timeframe: 'auto', regime: volRegime,
          bayesianResult: bayesianResult,
          patterns: allPatterns,
          smcData, wyckoffResult: wyckoffAdvanced ? { scheme: wyckoffAdvanced.scheme, currentPhase: wyckoffAdvanced.currentPhase, direction: wyckoffAdvanced.direction, events: wyckoffAdvanced.events } : undefined, elliottResult: elliottAdvanced?.dominantCount ? { dominantCount: { direction: elliottAdvanced.dominantCount.direction, type: elliottAdvanced.dominantCount.type, confidence: elliottAdvanced.dominantCount.confidence } } : undefined,
          mtfResult: mtfResult ? { confluenceDirection: mtfResult.confluenceDirection, confluenceScore: mtfResult.confluenceScore, agreeingTFs: mtfResult.agreeingTFs } : undefined,
          srLevels: srLevels.map(l => ({ price: l.price, type: l.type as string, strength: typeof l.strength === 'number' ? l.strength : l.strength === 'strong' ? 0.9 : l.strength === 'medium' ? 0.6 : 0.3 })), volumeProfile,
        });
        setAiBridgePayload(bridgePayload);
        setAiVsAlgoStats(getAIvsAlgoStats());
        // FIX: Use real price movement for verification, not Bayesian direction
        verifyPredictions('neutral', price);

        // ── Actually query the AI Council (was missing before!) ──
        // This sends the analysis payload to the AI model and gets a real prediction
        queryAICouncil(bridgePayload).then(result => {
          if (result) {
            const { prediction, comparison } = result;
            setCouncilAnalyses([{
              model: prediction.model,
              direction: prediction.direction,
              confidence: prediction.confidence,
              reasoning: prediction.reasoningAr,
            }]);
          }
        }).catch(() => { /* AI Council query failed — fallback to algo only */ });
      } catch { /* AI Council Bridge fallback */ }

      // ── Revolutionary: Visual Backtest ────────────────────────────
      try {
        const btResult = quickBacktest(c, allPatterns.map(p => ({
          source: p.type || 'unknown',
          direction: p.direction as 'bullish' | 'bearish' | 'neutral',
          confidence: p.confidence,
          price: p.price || price,
          candleIndex: p.candleIndex ?? c.length - 1,
        })));
        setBacktestStats(btResult.stats);
        setBacktestSignals(btResult.results);
      } catch { /* Visual Backtest fallback */ }

      // ── Revolutionary: Confluence Zones ────────────────────────────
      try {
        const zones = detectConfluenceZones({
          harmonicPatterns: allPatterns
            .filter((p: any) => p.type?.includes('harmonic') || p.type?.includes('Gartley') || p.type?.includes('Bat') || p.type?.includes('Butterfly') || p.type?.includes('Crab') || p.type?.includes('Shark') || p.type?.includes('Cypher'))
            .map((p: any) => ({
              type: p.type || 'unknown',
              direction: (p.direction || 'neutral') as 'bullish' | 'bearish',
              confidence: p.confidence || 0.5,
              przLevel: p.przLevel || p.price || price,
            })),
          smcData: {
            orderBlocks: (smcData?.orderBlocks || []).map((ob: any) => ({
              type: ob.type as 'bullish' | 'bearish',
              strength: ob.strength || 0.5,
              price: ob.price || (ob.high + ob.low) / 2,
              high: ob.high, low: ob.low, broken: ob.broken,
            })),
            fvgs: (smcData?.fvgs || []).map((fvg: any) => ({
              type: fvg.type as 'bullish' | 'bearish',
              filled: fvg.filled || false,
              midPrice: fvg.midPrice || (fvg.high + fvg.low) / 2,
              high: fvg.high, low: fvg.low,
            })),
            structureBreaks: smcData?.structureBreaks,
          },
          elliottResult: elliottAdvanced?.dominantCount ? {
            dominantDirection: elliottAdvanced.dominantCount.direction as 'bullish' | 'bearish' | 'neutral',
            confidence: elliottAdvanced.dominantCount.confidence || 0.5,
          } : undefined,
          wyckoffResult: wyckoffAdvanced ? {
            currentPhase: (wyckoffAdvanced as any).currentPhase || (wyckoffAdvanced as any).phase || 'none',
            direction: ((wyckoffAdvanced as any).direction || (wyckoffAdvanced as any).bias || 'neutral') as 'bullish' | 'bearish' | 'neutral',
            confidence: (wyckoffAdvanced as any).confidence || 0.5,
          } : undefined,
          srLevels: srLevels.map(l => ({
            price: l.price,
            type: (l.type === 'support' ? 'support' : 'resistance') as 'support' | 'resistance',
            strength: typeof l.strength === 'number' ? l.strength : l.strength === 'strong' ? 0.9 : l.strength === 'medium' ? 0.6 : 0.3,
          })),
          currentPrice: price,
          volumeProfile,
        });
        setConfluenceZones(zones);
      } catch { /* Confluence Zones fallback */ }

      // ── Revolutionary: Correlation Engine ──────────────────────────
      try {
        // Record all current signals as correlation events
        for (const p of allPatterns.filter(p => p.direction !== 'neutral').slice(0, 10)) {
          recordCorrelationEvent({
            source: p.type || 'unknown',
            direction: p.direction as 'bullish' | 'bearish',
            price: p.price || price,
          });
        }
        // Evaluate past events against current price
        evaluateCorrelationEvents(price);
        // Compute the correlation matrix
        const matrix = computeCorrelationMatrix();
        setCorrelationMatrix(matrix);
      } catch { /* Correlation Engine fallback */ }

      // ── Revolutionary: Predictive Pattern Completion ───────────────
      try {
        const predictions = predictPatternCompletion({
          candles: c,
          detectedPatterns: allPatterns.filter(p => p.direction !== 'neutral').map(p => ({
            type: p.type,
            direction: p.direction as 'bullish' | 'bearish',
            confidence: p.confidence,
            points: (p.points || p.shapePoints || []).map(pt => ({ label: '', price: pt.price })),
          })),
          currentPrice: price,
        });
        setPatternPredictions(predictions);
      } catch { /* Predictive Pattern Completion fallback */ }

      // ── Revolutionary #6: Adaptive Intelligence Engine ────────
      try {
        // Auto-resolve pending predictions from previous runs
        autoResolvePredictions(price);

        // Record current signals as new predictions for learning
        const adaptiveSignals: Array<{ source: IntelligenceSignalSource; direction: 'bullish' | 'bearish' | 'neutral'; confidence: number; price: number }> = allPatterns
          .filter(p => p.direction !== 'neutral' && p.confidence >= 0.3)
          .map(p => ({
            source: (p.type?.includes('harmonic') || p.type?.includes('Gartley') || p.type?.includes('Bat') ? 'harmonic'
              : p.type?.includes('elliott') || p.type?.includes('Elliott') ? 'elliott'
              : p.type?.includes('wyckoff') || p.type?.includes('Wyckoff') ? 'wyckoff'
              : p.type?.includes('BOS') ? 'bos'
              : p.type?.includes('CHoCH') ? 'choch'
              : p.type?.includes('OB') || p.type?.includes('Order Block') ? 'orderblock'
              : p.type?.includes('FVG') ? 'fvg'
              : p.type?.includes('candlestick') ? 'candlestick'
              : 'bayesian') as IntelligenceSignalSource,
            direction: p.direction as 'bullish' | 'bearish' | 'neutral',
            confidence: p.confidence,
            price: p.price || price,
          }));
        // Add SMC signals
        for (const brk of (smcData?.structureBreaks || []).slice(-3)) {
          adaptiveSignals.push({
            source: (brk.type === 'BOS' ? 'bos' : 'choch') as IntelligenceSignalSource,
            direction: brk.direction === 'bullish' ? 'bullish' : 'bearish',
            confidence: 0.6,
            price: brk.price || price,
          });
        }
        // Add Bayesian signal
        if (bayesianConf > 0.4 && bayesianDir !== 'neutral') {
          adaptiveSignals.push({
            source: 'bayesian' as IntelligenceSignalSource,
            direction: bayesianDir as 'bullish' | 'bearish',
            confidence: bayesianConf,
            price,
          });
        }
        recordAnalysisPredictions({
          signals: adaptiveSignals.slice(0, 10),
          regime: (volRegime === 'trending' ? 'trending' : volRegime === 'ranging' ? 'ranging' : volRegime === 'volatile' ? 'volatile' : 'quiet') as any,
          timeframe: 'auto',
        });
        const aiState = getAdaptiveIntelligenceState(
          (volRegime === 'trending' ? 'trending' : volRegime === 'ranging' ? 'ranging' : volRegime === 'volatile' ? 'volatile' : 'quiet') as any,
        );
        setAdaptiveIntelligence(aiState);
      } catch { /* Adaptive Intelligence fallback */ }

      // ── Revolutionary #7: Scenario Engine ─────────────────────
      try {
        const bullCount = allPatterns.filter(p => p.direction === 'bullish').length;
        const bearCount = allPatterns.filter(p => p.direction === 'bearish').length;
        const neutCount = allPatterns.filter(p => p.direction === 'neutral').length;
        const avgBullConf = bullCount > 0 ? allPatterns.filter(p => p.direction === 'bullish').reduce((s, p) => s + p.confidence, 0) / bullCount : 0.5;
        const avgBearConf = bearCount > 0 ? allPatterns.filter(p => p.direction === 'bearish').reduce((s, p) => s + p.confidence, 0) / bearCount : 0.5;

        const scenarios = computeScenarios({
          candles: c,
          currentPrice: price,
          bullishSignals: bullCount,
          bearishSignals: bearCount,
          neutralSignals: neutCount,
          avgBullishConf: avgBullConf,
          avgBearishConf: avgBearConf,
          smcData: {
            orderBlocks: (smcData?.orderBlocks || []).map((ob: any) => ({ type: ob.type, price: (ob.high + ob.low) / 2, strength: ob.strength || 0.5, broken: ob.broken || false })),
            fvgs: (smcData?.fvgs || []).map((fvg: any) => ({ type: fvg.type, midPrice: (fvg.high + fvg.low) / 2, filled: fvg.filled || false })),
            structureBreaks: (smcData?.structureBreaks || []).map((brk: any) => ({ type: brk.type, direction: brk.direction, price: brk.price })),
          },
          supports: srLevels.filter(l => l.type === 'support').map(l => l.price),
          resistances: srLevels.filter(l => l.type === 'resistance').map(l => l.price),
          harmonicPatterns: allPatterns.filter(p => p.type?.includes('harmonic') || p.type?.includes('Gartley')).map(p => ({ type: p.type, direction: p.direction, confidence: p.confidence, przLevel: p.przLevel || p.price || price })),
          regime: volRegime,
          pocPrice: volumeProfile?.poc,
          timeframe: 'auto',
        });
        setScenarioResult(scenarios);
      } catch { /* Scenario Engine fallback */ }

      // ── Revolutionary #8: Spring Detection Engine ─────────────
      try {
        const springs = detectSprings({
          candles: c,
          currentPrice: price,
          supports: srLevels.filter(l => l.type === 'support').map(l => l.price),
          resistances: srLevels.filter(l => l.type === 'resistance').map(l => l.price),
          orderBlocks: (smcData?.orderBlocks || []).map((ob: any) => ({
            type: ob.type,
            price: (ob.high + ob.low) / 2,
            high: ob.high,
            low: ob.low,
            strength: ob.strength || 0.5,
            broken: ob.broken || false,
          })),
          wyckoffSprings: wyckoffAdvanced?.events?.filter((e: any) => e.type?.includes('spring') || e.type?.includes('thrust')).map((e: any) => ({
            type: e.type,
            direction: e.direction || 'bullish',
            confidence: 0.6,
          })),
          structureBreaks: (smcData?.structureBreaks || []).map((brk: any) => ({ type: brk.type, direction: brk.direction, price: brk.price })),
          recentBreaks: (smcData?.structureBreaks || []).slice(-3).map((brk: any) => ({ type: brk.type, direction: brk.direction, price: brk.price })),
        });
        setSpringResult(springs);
      } catch { /* Spring Detection fallback */ }

      // ── Send patterns to chart (including harmonic + classic) ─────
      // FIX: Calculate entry/exit from ATR-adaptive levels for the Entry overlay
      const entryDirection = allPatterns.filter(p => p.direction === 'bullish').length > allPatterns.filter(p => p.direction === 'bearish').length ? 'long' : 'short';
      const entryPrice = price;
      const entryATR = c.length >= 14 ? (() => {
        const sl2 = c.slice(-14);
        const trs = sl2.map((c2: any, i: number) => i === 0 ? c2.high - c2.low : Math.max(c2.high - c2.close, Math.abs(c2.low - c2.close), c2.high - c2.low));
        return trs.reduce((s: number, v: number) => s + v, 0) / trs.length;
      })() : price * 0.01;
      const entrySL = entryDirection === 'long' ? entryPrice - entryATR * 1.5 : entryPrice + entryATR * 1.5;
      const entryTP = entryDirection === 'long' ? entryPrice + entryATR * 2.5 : entryPrice - entryATR * 2.5;

      const analysisResult: AIAnalysisResult = {
        patterns: allPatterns,
        supportLevels: srLevels.filter(l => l.type === 'support').slice(0, 4),
        resistanceLevels: srLevels.filter(l => l.type === 'resistance').slice(0, 4),
        trendLines,
        entryExit: {
          direction: entryDirection,
          entryPrice,
          stopLoss: entrySL,
          takeProfit: entryTP,
          confidence: 0.5,
          reasonAr: 'تحليل ATR تكيفي',
          keyLevels: [],
        },
        smcData,
        geoPatterns,
        elliottPattern,
        wyckoff,
        volumeProfile,
        overlays,
        fusionResult: fusionResult,
        bayesianResult: bayesianResult,
        mtfResult: mtfResult,
        tradeProposals: getActiveProposals(),
        liquidityResult: liquidityResult,
      } as AIAnalysisResult;

      // BUG-050 FIX: Symbol guard — if the user switched symbols while analyze()
      // was running, drop the result. Otherwise, the OLD symbol's analysis would
      // be rendered against the NEW symbol's candles, causing chart corruption.
      if (symbolRef.current !== sym) {
        // Symbol changed mid-analyze — abort. The NEW symbol's analyze() (triggered
        // by the symbol-change cleanup + candleSignatureRef effect) will run separately.
        runRef.current = false;
        setLoading(false);
        return;
      }

      lastAnalysisResultRef.current = analysisResult;
      onPatternsRef.current(analysisResult);

      // ── 8.5 ALERT GENERATION: Create visual alert markers for high-confidence patterns ──
      // Generate alert pins on the chart for patterns with confidence >= 0.6
      try {
        const newAlerts: AlertMarkerData[] = [];

        // Local candlestick patterns (high confidence only)
        for (const p of unique.filter(p => (p.confidence || 0) >= 0.6)) {
          const alertKey = `pat-${p.type}-${p.direction}-${Math.round(p.time || 0)}`;
          if (!alertsDedupRef.current.has(alertKey)) {
            alertsDedupRef.current.add(alertKey);
            // Clear old dedup entries after 5 minutes
            safeTimeout(() => alertsDedupRef.current.delete(alertKey), 300000);
            newAlerts.push({
              time: (p.time || c[c.length - 1].time) as any,
              price: p.price || price,
              label: `${p.type.substring(0, 6)}${p.direction === 'bullish' ? '↑' : p.direction === 'bearish' ? '↓' : ''}`,
              direction: p.direction as 'bullish' | 'bearish' | 'neutral',
              confidence: p.confidence || 0.5,
              type: 'pattern',
            });
          }
        }

        // SMC structure breaks (BOS/CHoCH) — always alert-worthy
        for (const br of smcData.structureBreaks || []) {
          const alertKey = `smc-${br.type}-${br.direction}-${Math.round(br.time || 0)}`;
          if (!alertsDedupRef.current.has(alertKey)) {
            alertsDedupRef.current.add(alertKey);
            safeTimeout(() => alertsDedupRef.current.delete(alertKey), 300000);
            newAlerts.push({
              time: (br.time || c[c.length - 1].time) as any,
              price: br.price || price,
              label: `${br.type}${br.direction === 'bullish' ? '↑' : '↓'}`,
              direction: br.direction as 'bullish' | 'bearish',
              confidence: 0.75,
              type: 'smc',
            });
          }
        }

        // FVG detections — moderate confidence alerts
        for (const fvg of smcData.fvgs || []) {
          const alertKey = `fvg-${fvg.type}-${Math.round(fvg.time || 0)}`;
          if (!alertsDedupRef.current.has(alertKey) && !fvg.filled) {
            alertsDedupRef.current.add(alertKey);
            safeTimeout(() => alertsDedupRef.current.delete(alertKey), 300000);
            newAlerts.push({
              time: (fvg.time || c[c.length - 1].time) as any,
              price: (fvg.high + fvg.low) / 2,
              label: `FVG${fvg.type === 'bullish' ? '↑' : '↓'}`,
              direction: fvg.type as 'bullish' | 'bearish',
              confidence: 0.65,
              type: 'fvg',
            });
          }
        }

        // Harmonic patterns — very important alerts
        for (const hp of harmonicPatterns.slice(0, 2)) {
          const alertKey = `harm-${hp.type}-${hp.direction}`;
          if (!alertsDedupRef.current.has(alertKey)) {
            alertsDedupRef.current.add(alertKey);
            safeTimeout(() => alertsDedupRef.current.delete(alertKey), 300000);
            newAlerts.push({
              time: ((hp.points as any)?.D?.time || c[c.length - 1].time) as any,
              price: hp.przLevel || (hp.points as any)?.D?.price || price,
              label: `${hp.type}${hp.direction === 'bullish' ? '↑' : '↓'}`,
              direction: hp.direction as 'bullish' | 'bearish',
              confidence: hp.confidence || 0.6,
              type: 'harmonic',
            });
          }
        }

        // Keep last 12 alerts (sliding window)
        if (newAlerts.length > 0) {
          setChartAlerts(prev => [...prev, ...newAlerts].slice(-12));
        }
      } catch { /* Alert generation fallback */ }

      // ── 9. REVOLUTIONARY: AI Consensus via SSE Streaming ─────
      // Try SSE first for progressive "War Room" experience, fallback to POST
      let consensusSucceeded = false;
      try {
        abortRef.current?.abort();
        eventSourceRef.current?.close();
        const controller = new AbortController();
        abortRef.current = controller;
        const timer = safeTimeout(() => controller.abort(), 20000);

        // SSE streaming — models appear one by one
        const sseParams = new URLSearchParams({ symbol: sym, language: locale });
        const eventSource = new EventSource(`/api/ai/consensus-stream?${sseParams}`);
        eventSourceRef.current = eventSource;

        const sseResult = await new Promise<any>((resolve, reject) => {
          const timeout = safeTimeout(() => {
            eventSource.close();
            eventSourceRef.current = null;
            reject(new Error('SSE timeout'));
          }, 20000);

          eventSource.onmessage = (event) => {
            try {
              const sseEvent = JSON.parse(event.data);
              if (sseEvent.type === 'complete') {
                clearTimeout(timeout);
                clearTimeout(timer);
                pendingTimersRef.current.delete(timeout);
                pendingTimersRef.current.delete(timer);
                eventSource.close();
                eventSourceRef.current = null;
                resolve(sseEvent.data);
              } else if (sseEvent.type === 'error') {
                clearTimeout(timeout);
                clearTimeout(timer);
                pendingTimersRef.current.delete(timeout);
                pendingTimersRef.current.delete(timer);
                eventSource.close();
                eventSourceRef.current = null;
                reject(new Error(sseEvent.data?.message || 'SSE error'));
              }
            } catch {}
          };
          eventSource.onerror = () => {
            clearTimeout(timeout);
            clearTimeout(timer);
            pendingTimersRef.current.delete(timeout);
            pendingTimersRef.current.delete(timer);
            eventSource.close();
            eventSourceRef.current = null;
            reject(new Error('SSE connection error'));
          };
        });

        if (sseResult) {
          const rec = sseResult.recommendation;
          const dir = rec === 'BUY' ? 'BUY' : rec === 'SELL' ? 'SELL' : 'WAIT';
          const models = sseResult.analyses?.length || sseResult.meta?.modelsResponded || 0;
          const councilConf = (sseResult.consensusScore || 50) / 100;

          // FIX: Store council model analyses for display in council tab
          if (sseResult.analyses && Array.isArray(sseResult.analyses)) {
            setCouncilAnalyses(sseResult.analyses.map((a: any) => ({
              model: a.role || a.model || a.name || 'AI',
              direction: a.recommendation || a.direction || 'WAIT',
              confidence: a.confidence || a.score || 50,
              reasoning: a.reasoning || a.analysis || '',
            })));
          }

          // Merge council + Bayesian for enhanced signal
          const mergedDir = bayesianConf > 0.55
            ? (bayesianDir === 'bullish' ? 'BUY' : bayesianDir === 'bearish' ? 'SELL' : dir)
            : dir;
          const mergedConf = dir === mergedDir
            ? Math.min(0.95, councilConf + (bayesianConf - 0.33) * 0.3)
            : councilConf * 0.7;

          const direction = mergedDir === 'BUY' ? 'long' : 'short';
          const adaptiveTPSL = calcAdaptiveTPSL(c, direction, mergedConf, price);

          // BUG-050: Don't update signal if symbol changed mid-analyze
          if (symbolRef.current === sym) {
            setSignal({
              dir: mergedDir as 'BUY' | 'SELL' | 'WAIT',
              conf: mergedConf,
              entry: adaptiveTPSL.entry,
              sl: adaptiveTPSL.stopLoss,
              tp: adaptiveTPSL.takeProfit,
              reason: t('councilModels', { count: models }),
              ts: Date.now(),
              regime,
              bayesianDir: bayesianDir === 'bullish' ? 'BUY' : bayesianDir === 'bearish' ? 'SELL' : 'WAIT',
              bayesianConf,
              fusionScore,
            });
          }

          if ((sseResult.consensusScore || 0) >= 65 && mergedDir !== 'WAIT') {
            fetch('/api/ai/alert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: sym, signal: mergedDir, patterns: unique.slice(0,3).map((p:any)=>p.type), smcBreaks: smcData.structureBreaks.map((b:any)=>b.type+' '+(b.direction==='bullish'?'↑':'↓')), entry: adaptiveTPSL.entry, sl: adaptiveTPSL.stopLoss, tp: adaptiveTPSL.takeProfit, confidence: mergedConf }) }).catch(()=>{});
          }
          consensusSucceeded = true;
        }
      } catch { /* SSE failed, try POST fallback */ }

      // Fallback: one-shot POST if SSE failed
      if (!consensusSucceeded) {
        try {
          abortRef.current?.abort();
          abortRef.current = new AbortController();
          const timer = setTimeout(() => abortRef.current?.abort(), 15000);
          const r = await fetch('/api/ai/consensus', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: sym, language: locale }),
            signal: abortRef.current.signal,
          });
          clearTimeout(timer);
          if (r.ok) {
            const d = await r.json();
            if (d.success && d.data) {
              const rec = d.data.recommendation;
              const dir = rec === 'BUY' ? 'BUY' : rec === 'SELL' ? 'SELL' : 'WAIT';
              const models = d.data.meta?.modelsResponded || d.data.analyses?.length || 0;
              const councilConf = (d.data.consensusScore || 50) / 100;

              // FIX: Store council model analyses for display in council tab
              if (d.data.analyses && Array.isArray(d.data.analyses)) {
                setCouncilAnalyses(d.data.analyses.map((a: any) => ({
                  model: a.role || a.model || a.name || 'AI',
                  direction: a.recommendation || a.direction || 'WAIT',
                  confidence: a.confidence || a.score || 50,
                  reasoning: a.reasoning || a.analysis || '',
                })));
              }

              const mergedDir = bayesianConf > 0.55
                ? (bayesianDir === 'bullish' ? 'BUY' : bayesianDir === 'bearish' ? 'SELL' : dir)
                : dir;
              const mergedConf = dir === mergedDir
                ? Math.min(0.95, councilConf + (bayesianConf - 0.33) * 0.3)
                : councilConf * 0.7;

              const direction = mergedDir === 'BUY' ? 'long' : 'short';
              const adaptiveTPSL = calcAdaptiveTPSL(c, direction, mergedConf, price);

              // BUG-050: Don't update signal if symbol changed mid-analyze
              if (symbolRef.current === sym) {
                setSignal({
                  dir: mergedDir as 'BUY' | 'SELL' | 'WAIT',
                  conf: mergedConf,
                  entry: adaptiveTPSL.entry,
                  sl: adaptiveTPSL.stopLoss,
                  tp: adaptiveTPSL.takeProfit,
                  reason: t('councilModels', { count: models }),
                  ts: Date.now(),
                  regime,
                  bayesianDir: bayesianDir === 'bullish' ? 'BUY' : bayesianDir === 'bearish' ? 'SELL' : 'WAIT',
                  bayesianConf,
                  fusionScore,
                });
              }

              if ((d.data.consensusScore || 0) >= 65 && mergedDir !== 'WAIT') {
                fetch('/api/ai/alert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: sym, signal: mergedDir, patterns: unique.slice(0,3).map((p:any)=>p.type), smcBreaks: smcData.structureBreaks.map((b:any)=>b.type+' '+(b.direction==='bullish'?'↑':'↓')), entry: adaptiveTPSL.entry, sl: adaptiveTPSL.stopLoss, tp: adaptiveTPSL.takeProfit, confidence: mergedConf }) }).catch(()=>{});
              }
              consensusSucceeded = true;
            }
          }
        } catch { /* fallback to local signal */ }
      }

      // ── 10. REVOLUTIONARY: Fallback local signal (only if consensus failed) ──
      if (!consensusSucceeded) {
        const bull = allPatterns.filter(p => p.direction === 'bullish').length;
        const bear = allPatterns.filter(p => p.direction === 'bearish').length;
        const last20 = c.slice(-20);
        const ema9 = last20.slice(-9).reduce((s, x) => s + x.close, 0) / 9;
        const ema20 = last20.reduce((s, x) => s + x.close, 0) / 20;
        const emaTrend = ema9 > ema20 ? 1 : -1;

        // Merge EMA trend with Bayesian for better direction
        let dir: 'BUY' | 'SELL' | 'WAIT';
        let conf: number;
        if (bayesianConf > 0.5) {
          // Bayesian has a clear signal — trust it
          dir = bayesianDir === 'bullish' ? 'BUY' : bayesianDir === 'bearish' ? 'SELL' : 'WAIT';
          conf = Math.min(0.85, bayesianConf + Math.abs(bull - bear) * 0.05);
        } else {
          // Bayesian uncertain — fall back to EMA + pattern count
          const bS = bull + (emaTrend > 0 ? 2 : 0);
          const beS = bear + (emaTrend < 0 ? 2 : 0);
          dir = bS > beS ? 'BUY' : beS > bS ? 'SELL' : 'WAIT';
          conf = Math.min(0.85, Math.abs(bS - beS) / (bS + beS + 1));
        }

        // REVOLUTIONARY: ATR-adaptive TP/SL for local signal too
        const direction = dir === 'BUY' ? 'long' : 'short';
        const adaptiveTPSL = calcAdaptiveTPSL(c, direction, conf, price);

        // Boost confidence with fusion score if available
        const adjustedConf = fusionScore > 50
          ? Math.min(0.95, conf + (fusionScore / 100) * 0.15)
          : conf;

        // BUG-050: Don't update signal if symbol changed mid-analyze
        if (symbolRef.current === sym) {
          setSignal({
            dir,
            conf: adjustedConf,
            entry: adaptiveTPSL.entry,
            sl: adaptiveTPSL.stopLoss,
            tp: adaptiveTPSL.takeProfit,
            reason: emaTrend > 0 ? t('emaBullish', { bull, bear }) : t('emaBearish', { bull, bear }),
            ts: Date.now(),
            regime,
            bayesianDir: bayesianDir === 'bullish' ? 'BUY' : bayesianDir === 'bearish' ? 'SELL' : 'WAIT',
            bayesianConf,
            fusionScore,
          });
        }
      }
    } catch { /* silent */ }
    finally {
      // BUG-050 FIX: Only unlock if we're still on the same symbol.
      // If the symbol changed, the cleanup useEffect already force-unlocked
      // runRef and reset state — we don't want to overwrite that here.
      if (symbolRef.current === sym) {
        setLoading(false);
        runRef.current = false;
      }
      // If symbol changed, leave runRef alone (cleanup already set it to false)
      // and leave loading alone (cleanup already set it to false).
    }
  };

  // ── Auto-analyze when candles arrive (debounced) ─────────
  const lastAnalyzeTimeRef = useRef(0);
  const lastCandleCountRef = useRef(0);
  const analyzeThrottled = useCallback(() => {
    const now = Date.now();
    if (now - lastAnalyzeTimeRef.current < 10000) return; // Min 10s between auto-runs
    lastAnalyzeTimeRef.current = now;
    analyze();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Run analysis once when panel first receives valid candles ──
  // This replaces the auto-analyze on every candle change.
  // Now it only runs when the panel is actually open and has data.
  // FIX: Moved hasRunInitialRef BEFORE the auto-detection effect that reads it.
  const hasRunInitialRef = useRef(false);

  // ── AUTO-DETECTION: Re-enabled with smart throttling ──────
  // Only auto-analyzes when a NEW candle is added (candle count increases),
  // not on every re-render. Also generates alerts for high-confidence patterns.
  useEffect(() => {
    if (!candles || candles.length < 20) return;
    // Only trigger when candle count actually increases (new candle from WebSocket)
    if (candles.length <= lastCandleCountRef.current) return;
    lastCandleCountRef.current = candles.length;
    // FIX: Don't run if initial analysis hasn't happened yet (handled by separate effect)
    if (!hasRunInitialRef.current) return;
    analyzeThrottled();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles?.length]);

  useEffect(() => {
    if (candles && candles.length >= 20 && !hasRunInitialRef.current && !runRef.current) {
      hasRunInitialRef.current = true;
      analyze();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles?.length]);

  // cleanup — abort pending requests, close EventSource, clear all tracked timers
  useEffect(() => () => {
    abortRef.current?.abort();
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    pendingTimersRef.current.forEach(id => clearTimeout(id));
    pendingTimersRef.current.clear();
  }, []);

  // ─────────────────────────────────────────────────────────────
  // BUG-050 FIX: Cleanup on SYMBOL CHANGE (not just unmount).
  //
  // PROBLEM: The previous cleanup useEffect has empty deps `[]` — it only runs
  // on unmount. When the user switches symbols while analyze() is running:
  //   1. The OLD analyze() continues for up to 35s (SSE 20s + POST 15s)
  //   2. runRef.current stays true → blocks the NEW symbol's analyze()
  //   3. The OLD SSE EventSource stays open → delivers stale data
  //   4. lastCandleCountRef / candleSignatureRef / firstCandleTimeRef hold OLD values
  //   5. hasRunInitialRef stays true → initial-analyze effect doesn't re-fire
  //   6. lastAnalysisResultRef holds OLD analysis data → stale overlays rendered
  //
  // When the OLD analyze() completes, it calls onPatternsRef.current({...}) with
  // OLD (BTC) analysis data against NEW (EUR/USD) candles. This causes
  // "Value is null" crashes inside lightweight-charts primitives, corrupting
  // the chart series — requiring a hard page reload.
  //
  // FIX: This effect runs on every symbol change. It:
  //   - Aborts the in-flight analyze() via abortRef
  //   - Closes the SSE EventSource
  //   - Clears all pending timers
  //   - Force-unlocks runRef (the OLD analyze()'s finally{} will still set it
  //     to false, but we don't wait for that)
  //   - Resets all candle-tracking refs to initial values
  //   - Clears the analysis result cache
  //   - Clears the alerts dedup set
  //   - Clears all displayed state (signal, patterns, levels, chartAlerts)
  //
  // This ensures the NEW symbol starts with a clean slate and the OLD
  // analyze()'s late completion is a no-op (its setSignal/setPatterns calls
  // would still fire, but they're harmless — the next analyze() will overwrite
  // them, and onPatternsRef is guarded by the candle-length check in
  // handlePatternsDetected).
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    // Abort in-flight analyze()
    abortRef.current?.abort();
    abortRef.current = null;

    // Close SSE EventSource
    eventSourceRef.current?.close();
    eventSourceRef.current = null;

    // Clear all pending timers (safeTimeout-tracked)
    pendingTimersRef.current.forEach(id => clearTimeout(id));
    pendingTimersRef.current.clear();

    // Force-unlock the analyze lock (don't wait for the OLD finally{})
    runRef.current = false;

    // Reset candle-tracking refs
    lastCandleCountRef.current = 0;
    candleSignatureRef.current = '';
    firstCandleTimeRef.current = 0;
    hasRunInitialRef.current = false;

    // Clear analysis result cache + alerts dedup
    lastAnalysisResultRef.current = null;
    alertsDedupRef.current.clear();

    // Clear displayed state — show a clean panel until the NEW analyze() runs
    setSignal(null);
    setPatterns([]);
    setLevels([]);
    setChartAlerts([]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  // ── Sustainable: Direct overlay change path ──
  // When the user toggles an overlay button, we call onOverlayChange directly.
  // This bypasses onPatternsDetected entirely — the chart uses its cached
  // analysis data + the new overlay flags to render instantly. No double-emission,
  // no flicker, no dependency on analyze() having completed.
  //
  // Candle-only overlays (trend, SR, FVG, BOS, harmonic, geo) work immediately
  // even without cached analysis data — overlay-renderer detects from candles.
  // Analysis-dependent overlays (VP, Fusion, Bayesian, MTF, etc.) render once
  // the first analyze() completes and populates the cache.
  //
  // ARCHITECTURE: Two independent rendering pipelines:
  //   Pipeline 1: User toggle → onOverlayChange → renderOverlays (ALL types)
  //   Pipeline 2: Analysis complete → onPatternsDetected → renderAnalysisOverlays (analysis-only)
  // Pipeline 2 never touches candle-only overlays, so no flicker.
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;
  const signalRef = useRef(signal);
  signalRef.current = signal;

  // BUG-062 FIX: The infinite re-render loop was caused by `chartAlerts` in deps.
  // Every call to onPatternsRef → setChartAlerts in RouaChart → re-render →
  // chartAlerts changes → effect fires again → infinite loop.
  // Fix: Remove `chartAlerts` from deps. The overlay effect only needs to fire
  // when `overlays` changes (user toggles a button), NOT when chartAlerts change.
  // NO throttle needed — removing chartAlerts from deps breaks the loop.
  useEffect(() => {
    // SUSTAINABLE PATH: If the chart supports onOverlayChange, use it.
    if (onOverlayChangeRef.current) {
      onOverlayChangeRef.current(overlays);
      return;
    }

    // ── Fallback for charts without onOverlayChange ──
    // This path is only used if the parent doesn't pass onOverlayChange.
    // In that case, we fall back to the old re-emit pattern.
    if (!candles?.length) return;
    const lastResult = lastAnalysisResultRef.current;
    if (!lastResult) {
      onPatternsRef.current({
        patterns: [],
        supportLevels: [],
        resistanceLevels: [],
        trendLines: [],
        overlays: overlays as any,
        alerts: chartAlerts,
      } as AIAnalysisResult);
      return;
    }
    onPatternsRef.current({
      ...lastResult,
      overlays: overlays as any,
      signal: signal ? { dir: signal.dir, entry: signal.entry, sl: signal.sl, tp: signal.tp } : undefined,
      alerts: chartAlerts,
      fusionResult: fusionResult,
      bayesianResult: bayesianResult,
      mtfResult: mtfResult,
      tradeProposals: getActiveProposals(),
      liquidityResult: liquidityResult,
    } as AIAnalysisResult);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // BUG-062: Changed deps from [overlays, chartAlerts] to [overlays] only.
  // chartAlerts was causing the infinite re-render loop.
  }, [overlays]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-emit overlays when candles are replaced (timeframe/symbol change) ──
  // When the timeframe changes, RouaChart clears all overlays and sends new candles.
  // If the user has any overlay toggles active, we must re-emit so the chart
  // redraws overlays with the new candle data. Without this, overlays disappear
  // after timeframe change and the user must toggle OFF then ON to get them back.
  // This applies to ALL overlay buttons (trend, SR, harmonic, FVG, BOS, geo, EW, etc.)
  //
  // CRITICAL FIX: Distinguish between timeframe changes and WebSocket updates.
  // - Timeframe/symbol change: First candle time changes → clear cache, re-analyze
  // - WebSocket update: Only last candle changes → keep cache, just re-render overlays
  //
  // Previously, EVERY candle change cleared lastAnalysisResultRef, causing:
  //   1. Unnecessary re-analysis on every new WebSocket candle
  //   2. Lost analysis data (Fusion, Bayesian, etc.) on each candle
  //   3. Flicker as overlays are cleared and re-drawn
  const candleSignatureRef = useRef<string>('');
  const firstCandleTimeRef = useRef<number>(0);
  // BUG-062 FIX: No throttle needed — the candleSignatureRef check already prevents
  // duplicate emits for the same candle data. The infinite loop was in the OTHER
  // effect (overlays+chartAlerts), not here. Removing the throttle restores
  // immediate overlay updates on symbol/timeframe change.
  useEffect(() => {
    if (!candles?.length || candles.length < 20) return;
    const sig = `${candles[0]?.time}_${candles[candles.length - 1]?.time}_${candles.length}`;
    if (sig === candleSignatureRef.current) return; // Same data, skip
    candleSignatureRef.current = sig;

    // Check if any overlay is currently active
    const anyActive = Object.values(overlaysRef.current).some(v => v === true);
    if (!anyActive) return;

    // CRITICAL FIX: Detect if this is a timeframe/symbol change or just
    // a WebSocket update. A timeframe change means the FIRST candle time
    // is different (new historical data). A WebSocket update only changes
    // the last candle or adds one at the end.
    const firstTime = candles[0]?.time || 0;
    const isTimeframeChange = firstCandleTimeRef.current !== 0 && firstTime !== firstCandleTimeRef.current;
    firstCandleTimeRef.current = firstTime;

    if (isTimeframeChange) {
      // Timeframe/symbol change: clear stale analysis data
      lastAnalysisResultRef.current = null;
      setChartAlerts([]);
      alertsDedupRef.current.clear();
    }

    // ALWAYS notify chart of current overlays immediately so candle-only
    // overlays (trend, SR) render without waiting for full analyze().
    // On WebSocket updates, the cached analysis data is preserved so
    // analysis-dependent overlays (VP, Entry, Fusion, etc.) also work.
    if (onOverlayChangeRef.current) {
      onOverlayChangeRef.current(overlaysRef.current);
    }

    // Only schedule a fresh analysis on timeframe changes.
    // On WebSocket updates, the periodic refresh timer in RouaChart.tsx
    // handles overlay re-rendering, and the auto-analyze throttle handles
    // analysis updates. No need to force a re-analysis here.
    if (isTimeframeChange) {
      const timer = safeTimeout(() => {
        // FIX: Don't reset runRef.current — let the ongoing analyze() finish
        // naturally and set runRef.current = false in its finally block.
        // Previously, resetting it here could allow a SECOND concurrent analysis.
        lastAnalyzeTimeRef.current = 0; // Reset throttle
        analyze();
      }, 300);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles]);

  // ── Performance auto-evaluation ──────────────────────────
  useEffect(() => {
    if (!currentPrice || !performanceStats) return;
    const tracker = getPatternPerformanceTracker();
    const interval = setInterval(() => {
      try {
        tracker.autoEvaluate(currentPrice, symbol);
      } catch {}
    }, 60000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice, performanceStats]);

  // ── UI Helpers ─────────────────────────────────────────────
  const sigColor = signal?.dir === 'BUY' ? C.green : signal?.dir === 'SELL' ? C.red : C.yellow;
  const sigAr = signal?.dir === 'BUY' ? t('buy') : signal?.dir === 'SELL' ? t('sell') : t('wait');
  const sigIcon = signal?.dir === 'BUY' ? '▲' : signal?.dir === 'SELL' ? '▼' : '◆';
  const pct = Math.round((signal?.conf || 0) * 100);
  // V225 FIX: fp() now guards against NaN/Infinity — prevents "NaN" appearing in UI
  const fp = (n: number) => Number.isFinite(n) ? (n > 999 ? n.toFixed(2) : n.toFixed(5)) : '—';
  const strengthLabel = (s: string) => s === 'strong' ? t('strong') : s === 'medium' ? t('medium') : t('weak');
  const support = levels.filter(l => l.type === 'support').slice(0, 4);
  const resistance = levels.filter(l => l.type === 'resistance').slice(0, 4);

  // Regime color
  const regimeColor = volRegime === 'extreme' ? C.red : volRegime === 'high' ? C.yellow : volRegime === 'low' ? C.blue : C.green;
  const regimeLabelAr = volRegime === 'extreme' ? t('extreme') : volRegime === 'high' ? t('high') : volRegime === 'low' ? t('low') : t('normal');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 340, maxHeight: 560, background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden', fontFamily: "var(--font-ar)", boxShadow: '0 24px 64px rgba(0,0,0,0.7)', direction: 'inherit' }}>
      {/* Header */}
      <div data-drag-handle="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderBottom: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.025)', cursor: 'grab', userSelect: 'none', flexShrink: 0 }}>
        <div data-drag-handle="true" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span data-drag-handle="true" style={{ fontSize: 16 }}>🧠</span>
          <div data-drag-handle="true">
            <div style={{ color: C.text, fontSize: 11, fontWeight: 700 }}>{t('title')}</div>
            <div style={{ color: C.mut, fontSize: 8.5, fontFamily: "var(--font-mono)" }}>{symbol}</div>
          </div>
          {loading && <div style={{ width: 8, height: 8, border: `1.5px solid ${C.cyan}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {/* SSE Stream indicator */}
          {streamMode && (
            <div style={{ padding: '1px 5px', borderRadius: 3, fontSize: 7, fontWeight: 700, fontFamily: "var(--font-mono)", background: `${C.cyan}18`, color: C.cyan, border: `1px solid ${C.cyan}30`, display: 'flex', alignItems: 'center', gap: 3 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.cyan, animation: 'spin 1s linear infinite' }} />
              SSE
            </div>
          )}
          {/* Volatility regime badge */}
          <div style={{ padding: '1px 5px', borderRadius: 3, fontSize: 7, fontWeight: 700, fontFamily: "var(--font-mono)", background: `${regimeColor}18`, color: regimeColor, border: `1px solid ${regimeColor}30` }}>
            ATR {regimeLabelAr}
          </div>
          {/* Engine verification badge — click to verify engines are real */}
          <button
            onClick={() => { const report = runFullVerification(); setVerificationReport(report); setShowVerification(true); }}
            title="تحقق من المحركات | Verify Engines"
            style={{
              padding: '1px 5px', borderRadius: 3, fontSize: 7, fontWeight: 700, fontFamily: "var(--font-mono)",
              background: verificationReport?.allReal ? `${C.green}18` : `${C.gold}18`,
              color: verificationReport?.allReal ? C.green : C.gold,
              border: `1px solid ${verificationReport?.allReal ? C.green : C.gold}30`,
              cursor: 'pointer', outline: 'none',
            }}
          >
            {verificationReport?.allReal ? '✓ REAL' : '🔍 VRFY'}
          </button>
          <button onClick={() => { runRef.current = false; abortRef.current?.abort(); analyze(); }} disabled={loading} title={t('refresh')} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, color: loading ? C.mut : C.cyan, width: 22, height: 22, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none' }}>⟳</button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.mut, fontSize: 16, cursor: 'pointer', outline: 'none', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>
      </div>

      {/* Overlay Toggles — compact icon buttons in grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(42px, 1fr))', gap:2, padding:'3px 6px', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
        {([['S/R','sr','#4ade80'],['📈','trend','#facc15'],['HM','harmonic','#c084fc'],['FVG','fvg','#22d3ee'],['BOS','bos','#f97316'],['GEO','geo','#a78bfa'],['EW','ew','#93c5fd'],['WY','wyckoff','#fb923c'],['VP','vp','#fbbf24'],['ENT','entry','#00D4FF'],['MTF','mtf','#06b6d4'],['LIQ','liq','#f472b6'],['TRD','trade','#a3e635']] as [string,keyof typeof overlays,string][]).map(([lbl,key,col])=>(
          <button key={key} onClick={()=>{ toggleOverlay(key); }} title={[['S/R','sr'],['📈','trend'],['HM','harmonic'],['FVG','fvg'],['BOS','bos'],['GEO','geo'],['EW','ew'],['WY','wyckoff'],['VP','vp'],['ENT','entry'],['MTF','mtf'],['LIQ','liq'],['TRD','trade']].find(x=>x[1]===key)?.[0] || key}
            style={{ padding:'2px 0', borderRadius:3, fontSize:7.5, fontWeight:700, cursor:'pointer', outline:'none', fontFamily:'inherit',
              textAlign:'center', lineHeight:1.2,
              border:`1px solid ${overlays[key]?col:'#333'}`,
              background:overlays[key]?col+'22':'transparent',
              color:overlays[key]?col:'#555',
              transition:'all 0.15s' }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Tabs — two-row compact grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', borderBottom: `1px solid ${C.border}`, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
        {([['signal', t('tabSignal')], ['patterns', t('tabPatterns')], ['wyckoff', 'WY'], ['elliott', 'EW'], ['levels', t('tabLevels')], ['smc', t('tabSmc')], ['mtf', 'MTF'], ['alerts', '🚨'], ['trades', '💰'], ['advanced', t('tabAdvanced')], ['adaptive', '🧠'], ['rules', '📐'], ['paper', '📝'], ['scanner', '🔍'], ['council', '🤖'], ['backtest', '⏪'], ['confluence', '🎯'], ['explain', '❓'], ['correlate', '🔗'], ['predict', '🔮'], ['intelligence', '🔬'], ['scenario', '🎲'], ['spring', '🌀'], ['journal', '📋']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '3px 2px', background: tab===k?'rgba(34,211,238,0.08)':'none', border: 'none', borderBottom: `2px solid ${tab === k ? C.cyan : 'transparent'}`, color: tab === k ? C.cyan : C.dim, fontSize: 9, cursor: 'pointer', outline: 'none', fontFamily: 'inherit', transition: 'all 0.15s', fontWeight: tab===k?700:400, whiteSpace: 'nowrap', textAlign: 'center' }}>{l}</button>
        ))}
      </div>

      {/* Engine Verification Modal */}
      {showVerification && verificationReport && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', padding: 10, overflow: 'auto', borderRadius: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14 }}>🔬</span>
              <span style={{ color: C.text, fontSize: 11, fontWeight: 700 }}>التحقق من المحركات — Engine Verification</span>
            </div>
            <button onClick={() => setShowVerification(false)} style={{ background: 'none', border: 'none', color: C.mut, fontSize: 14, cursor: 'pointer', outline: 'none' }}>×</button>
          </div>

          {/* Overall Score */}
          <div style={{ textAlign: 'center', padding: '8px 0', marginBottom: 8, borderRadius: 6, background: verificationReport.allReal ? `${C.green}10` : `${C.gold}10`, border: `1px solid ${verificationReport.allReal ? C.green : C.gold}30` }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: verificationReport.allReal ? C.green : C.gold, fontFamily: "var(--font-mono)" }}>
              {verificationReport.overallScore}%
            </div>
            <div style={{ fontSize: 9, color: C.dim, marginTop: 2 }}>
              {verificationReport.allReal ? '✓ جميع المحركات حقيقية — All engines are REAL' : '⚠ بعض المحركات تحتاج مراجعة — Some engines need review'}
            </div>
          </div>

          {/* Per-Engine Results */}
          {verificationReport.engines.map((eng: EngineVerificationResult) => (
            <div key={eng.engine} style={{ marginBottom: 6, borderRadius: 5, border: `1px solid ${eng.isReal ? C.green : C.red}30`, background: `${eng.isReal ? C.green : C.red}08`, padding: '6px 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: C.text }}>{eng.engine}</span>
                <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: eng.isReal ? C.green : C.red, fontWeight: 700 }}>
                  {eng.score}% {eng.isReal ? '✓' : '✗'}
                </span>
              </div>
              {eng.checks.map((chk, i) => (
                <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 2, fontSize: 8, color: chk.passed ? C.dim : C.red }}>
                  <span>{chk.passed ? '✓' : '✗'}</span>
                  <span style={{ flex: 1 }}>{chk.nameAr}</span>
                </div>
              ))}
              {/* Market comparison */}
              <div style={{ marginTop: 4, padding: '3px 6px', borderRadius: 3, background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.1)' }}>
                <div style={{ fontSize: 7.5, color: C.cyan, fontWeight: 700 }}>
                  🏆 {eng.comparisonWithMarket.featureAr}: {eng.comparisonWithMarket.advantage === 'roua' ? 'روا متفوق' : 'تعادل'}
                </div>
                <div style={{ fontSize: 7, color: C.dim, marginTop: 1 }}>
                  روا: {eng.comparisonWithMarket.rouaHas ? '✓' : '✗'} | TradingView: {eng.comparisonWithMarket.tradingViewHas ? '✓' : '✗'} | MultiCharts: {eng.comparisonWithMarket.multiChartsHas ? '✓' : '✗'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>

        {/* SIGNAL */}
        {tab === 'signal' && (
          <div style={{ padding: 10, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {signal ? (
              <>
                <div style={{ background: `${sigColor}12`, border: `1px solid ${sigColor}30`, borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 24, color: sigColor, fontWeight: 900 }}>{sigIcon}</span>
                      <div>
                        <div style={{ color: sigColor, fontSize: 15, fontWeight: 800 }}>{sigAr}</div>
                        <div style={{ color: C.dim, fontSize: 8.5, marginTop: 1 }}>{signal.reason}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: sigColor, fontSize: 20, fontWeight: 900 }}>{pct}%</div>
                      <div style={{ color: C.mut, fontSize: 8 }}>{t('confidence')}</div>
                    </div>
                  </div>
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: sigColor, borderRadius: 2, transition: 'width 0.6s ease' }} />
                  </div>
                </div>

                {/* REVOLUTIONARY: Bayesian + Fusion indicators */}
                {(signal.bayesianDir || signal.fusionScore !== undefined) && (
                  <div style={{ display: 'grid', gridTemplateColumns: signal.fusionScore !== undefined ? '1fr 1fr' : '1fr', gap: 4, marginBottom: 6 }}>
                    {signal.bayesianDir && (
                      <div style={{ background: `${C.purple}0a`, border: `1px solid ${C.purple}25`, borderRadius: 5, padding: '4px 7px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: C.purple, fontSize: 8, fontWeight: 700 }}>{t('bayesian')}</span>
                        <span style={{ color: signal.bayesianDir === 'BUY' ? C.green : signal.bayesianDir === 'SELL' ? C.red : C.yellow, fontSize: 9, fontWeight: 700 }}>
                          {signal.bayesianDir === 'BUY' ? '▲' : signal.bayesianDir === 'SELL' ? '▼' : '◆'} {Math.round((signal.bayesianConf || 0) * 100)}%
                        </span>
                      </div>
                    )}
                    {signal.fusionScore !== undefined && (
                      <div style={{ background: `${C.gold}0a`, border: `1px solid ${C.gold}25`, borderRadius: 5, padding: '4px 7px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: C.gold, fontSize: 8, fontWeight: 700 }}>{t('confluence')}</span>
                        <span style={{ color: signal.fusionScore > 50 ? C.green : signal.fusionScore > 25 ? C.yellow : C.dim, fontSize: 9, fontWeight: 700 }}>
                          {signal.fusionScore}%
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {/* Contraction Warning: Bayesian high but Confluence low */}
                {signal.bayesianDir && signal.fusionScore !== undefined &&
                  (signal.bayesianConf || 0) > 0.7 && signal.fusionScore < 35 && (
                  <div style={{
                    background: 'rgba(245,158,11,0.08)',
                    border: '1px solid rgba(245,158,11,0.3)',
                    borderRadius: 5, padding: '4px 7px', marginBottom: 6,
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    <span style={{ fontSize: 10 }}>⚡</span>
                    <span style={{ color: '#f59e0b', fontSize: 7.5, fontWeight: 600, lineHeight: 1.4 }}>
                      {locale === 'ar'
                        ? 'تناقض: Bayesian مرتفع لكن Confluence منخفض — الإشارة تعتمد على احتمالية إحصائية عالية مع اتفاق محدود بين المؤشرات'
                        : 'Contradiction: Bayesian high but Confluence low — Signal relies on statistical probability with limited indicator agreement'}
                    </span>
                  </div>
                )}

                {signal.dir !== 'WAIT' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, marginBottom: 8 }}>
                      {([[t('entry'), signal.entry, C.cyan], [t('stopLoss'), signal.sl, C.red], [t('target'), signal.tp, C.green]] as [string, number, string][]).map(([l, v, col]) => (
                        <div key={l} style={{ background: `${col}0a`, border: `1px solid ${col}25`, borderRadius: 6, padding: 5, textAlign: 'center' }}>
                          <div style={{ color: C.mut, fontSize: 7.5, marginBottom: 2 }}>{l}</div>
                          <div style={{ color: col, fontSize: 9, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{fp(v)}</div>
                        </div>
                      ))}
                    </div>
                    {(() => {
                      // V225 FIX: Guard against undefined tp/sl/entry producing NaN
                      const rr = (signal.tp != null && signal.sl != null && signal.entry != null)
                        ? Math.abs((signal.tp - signal.entry) / (signal.sl - signal.entry || 1)) : 0;
                      const isWeak = rr < 1.5;
                      const isCritical = rr < 1.2;
                      return (
                        <>
                          <div style={{
                            display: 'flex', justifyContent: 'space-between',
                            padding: '3px 8px',
                            background: isCritical ? 'rgba(239,68,68,0.08)' : isWeak ? 'rgba(245,158,11,0.06)' : C.card,
                            border: isCritical ? '1px solid rgba(239,68,68,0.25)' : isWeak ? '1px solid rgba(245,158,11,0.2)' : 'none',
                            borderRadius: 5, marginBottom: 4,
                          }}>
                            <span style={{ color: C.dim, fontSize: 9 }}>{t('riskReward')}</span>
                            <span style={{
                              color: isCritical ? C.red : isWeak ? '#f59e0b' : C.text,
                              fontSize: 9, fontWeight: 700, fontFamily: "var(--font-mono)",
                            }}>1:{safeToFixed(rr, 2, '—')}</span>
                          </div>
                          {(isWeak) && (
                            <div style={{
                              background: isCritical ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.05)',
                              border: `1px solid ${isCritical ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.15)'}`,
                              borderRadius: 4, padding: '3px 7px', marginBottom: 4,
                              display: 'flex', alignItems: 'center', gap: 4,
                            }}>
                              <span style={{ fontSize: 8, color: isCritical ? C.red : '#f59e0b' }}>⚠</span>
                              <span style={{ fontSize: 7, color: isCritical ? C.red : '#f59e0b', fontWeight: 600, lineHeight: 1.3 }}>
                                {locale === 'ar'
                                  ? (isCritical ? 'نسبة ربح/خطر ضعيفة جداً — يُنصح بعدم الدخول' : 'نسبة ربح/خطر أقل من المثالي — الحد الأدنى الموصى به 1:1.5')
                                  : (isCritical ? 'Very weak R/R — entry not recommended' : 'Suboptimal R/R — minimum recommended is 1:1.5')}
                              </span>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    {/* ATR regime indicator */}
                    {signal.regime && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 8px', background: C.card, borderRadius: 5, marginBottom: 8 }}>
                        <span style={{ color: C.dim, fontSize: 8 }}>{t('volatilityRegime')}</span>
                        <span style={{ color: regimeColor, fontSize: 8, fontWeight: 700 }}>{regimeLabelAr} (ATR)</span>
                      </div>
                    )}
                    {onExecuteTrade && (
                      <button onClick={() => onExecuteTrade(signal.dir === 'BUY' ? 'long' : 'short', signal.entry, signal.sl, signal.tp)} style={{ width: '100%', padding: '7px', borderRadius: 6, border: 'none', background: signal.dir === 'BUY' ? C.green : C.red, color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8 }}>
                        {signal.dir === 'BUY' ? `▲ ${t('executeBuy')}` : `▼ ${t('executeSell')}`}
                      </button>
                    )}
                  </>
                )}

                {/* REVOLUTIONARY: Pattern Performance Stats */}
                {performanceStats && performanceStats.totalTrades > 0 && (
                  <div style={{ background: C.card, borderRadius: 6, padding: '7px 9px', marginBottom: 6, border: `1px solid ${C.border}` }}>
                    <div style={{ color: C.gold, fontSize: 8, fontWeight: 700, marginBottom: 4 }}>{t('previousPatternPerformance')}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: C.dim, fontSize: 8 }}>{t('winRate')}</span>
                      <span style={{ color: performanceStats.winRate > 50 ? C.green : C.red, fontSize: 9, fontWeight: 700 }}>{Math.round(performanceStats.winRate)}% ({performanceStats.totalTrades})</span>
                    </div>
                    {performanceStats.bestPattern && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                        <span style={{ color: C.dim, fontSize: 8 }}>{t('bestPattern')}</span>
                        <span style={{ color: C.green, fontSize: 8, fontWeight: 600 }}>{performanceStats.bestPattern}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* REVOLUTIONARY: State Machine Alerts */}
                {stateMachineResult && stateMachineResult.alerts.length > 0 && (
                  <div style={{ background: `${C.gold}08`, border: `1px solid ${C.gold}20`, borderRadius: 6, padding: '6px 8px', marginBottom: 6 }}>
                    <div style={{ color: C.gold, fontSize: 8, fontWeight: 700, marginBottom: 3 }}>{t('patternLifecycleAlerts')}</div>
                    {stateMachineResult.alerts.slice(0, 3).map((a: any, i: number) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                        <span style={{ color: C.dim, fontSize: 8 }}>{a.patternType}</span>
                        <span style={{ color: a.priority === 'critical' ? C.red : a.priority === 'warning' ? C.yellow : C.cyan, fontSize: 8, fontWeight: 600 }}>
                          {a.newState === 'breakout' ? t('breakout') : a.newState === 'completed' ? t('completed') : a.newState === 'near-completion' ? t('nearCompletion') : a.newState === 'failed' ? t('failed') : a.newState}
                        </span>
                      </div>
                    ))}
                    {/* Pattern-Signal Contradiction Warning */}
                    {(() => {
                      if (!signal || signal.dir === 'WAIT') return null;
                      const bullishAlerts = stateMachineResult.alerts.filter((a: any) => a.direction === 'bullish');
                      const bearishAlerts = stateMachineResult.alerts.filter((a: any) => a.direction === 'bearish');
                      const sigDir = signal.dir === 'BUY' ? 'bullish' : signal.dir === 'SELL' ? 'bearish' : 'neutral';
                      const contradicting = sigDir === 'bullish' ? bearishAlerts : sigDir === 'bearish' ? bullishAlerts : [];
                      if (contradicting.length === 0) return null;
                      const patternNames = contradicting.map((a: any) => a.patternType).join(', ');
                      return (
                        <div style={{
                          marginTop: 4, padding: '3px 6px',
                          background: 'rgba(245,158,11,0.06)',
                          border: '1px solid rgba(245,158,11,0.2)',
                          borderRadius: 4,
                        }}>
                          <span style={{ color: '#f59e0b', fontSize: 7, fontWeight: 600, lineHeight: 1.3 }}>
                            {locale === 'ar'
                              ? `⚠ أنماط معاكسة للإشارة: ${patternNames} — الإشارة من Bayesian/الإجماع قد تتجاوز هذه الأنماط الفردية`
                              : `⚠ Contradicting patterns: ${patternNames} — Signal from Bayesian/consensus may override these individual patterns`}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {(support.length > 0 || resistance.length > 0) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                    {([[t('resistance'), resistance, C.red], [t('support'), support, C.green]] as [string, SupportResistanceLevel[], string][]).map(([lbl, arr, col]) => arr.length > 0 ? (
                      <div key={lbl} style={{ background: `${col}07`, border: `1px solid ${col}18`, borderRadius: 6, padding: '5px 7px' }}>
                        <div style={{ color: col, fontSize: 8.5, fontWeight: 700, marginBottom: 3 }}>{lbl}</div>
                        {arr.slice(0, 2).map((l, i) => <div key={i} style={{ color: C.dim, fontSize: 8.5, fontFamily: "var(--font-mono)" }}>{fp(l.price)}</div>)}
                      </div>
                    ) : null)}
                  </div>
                )}
                <div style={{ textAlign: 'center', marginTop: 6, color: C.mut, fontSize: 8 }}>{new Date(signal.ts).toLocaleTimeString(timeLocale)}</div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 24, color: C.dim }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🧠</div>
                <div style={{ fontSize: 10 }}>{t('pressToAnalyze')}</div>
              </div>
            )}
          </div>
        )}

        {/* PATTERNS */}
        {tab === 'patterns' && (
          <div style={{ padding: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {/* REVOLUTIONARY: Bayesian consensus bar */}
            {bayesianResult && (
              <div style={{ background: `${C.purple}0a`, border: `1px solid ${C.purple}20`, borderRadius: 6, padding: '7px 9px', marginBottom: 8 }}>
                <div style={{ color: C.purple, fontSize: 8, fontWeight: 700, marginBottom: 4 }}>{t('bayesianConsensus')}</div>
                <div style={{ display: 'flex', gap: 2, height: 6, borderRadius: 3, overflow: 'hidden', background: 'rgba(255,255,255,0.05)' }}>
                  <div style={{ width: `${Math.round((bayesianResult.posteriorBullish ?? bayesianResult.bullish ?? 0) * 100)}%`, background: C.green, borderRadius: '3px 0 0 3px' }} />
                  <div style={{ width: `${Math.round((bayesianResult.posteriorNeutral ?? bayesianResult.neutral ?? 0) * 100)}%`, background: C.yellow }} />
                  <div style={{ width: `${Math.round((bayesianResult.posteriorBearish ?? bayesianResult.bearish ?? 0) * 100)}%`, background: C.red, borderRadius: '0 3px 3px 0' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                  <span style={{ color: C.green, fontSize: 7 }}>{Math.round((bayesianResult.posteriorBullish ?? bayesianResult.bullish ?? 0) * 100)}%</span>
                  <span style={{ color: C.yellow, fontSize: 7 }}>{Math.round((bayesianResult.posteriorNeutral ?? bayesianResult.neutral ?? 0) * 100)}%</span>
                  <span style={{ color: C.red, fontSize: 7 }}>{Math.round((bayesianResult.posteriorBearish ?? bayesianResult.bearish ?? 0) * 100)}%</span>
                </div>
              </div>
            )}
            {patterns.length === 0 ? <div style={{ textAlign: 'center', padding: 20, color: C.dim, fontSize: 10 }}>{t('noPatterns')}</div>
              : patterns.map((p, i) => {
                const col = p.direction === 'bullish' ? C.green : p.direction === 'bearish' ? C.red : C.yellow;
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', borderRadius: 6, marginBottom: 4, background: C.card, border: `1px solid ${col}18` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: col, fontSize: 11 }}>{p.direction === 'bullish' ? '▲' : p.direction === 'bearish' ? '▼' : '◆'}</span>
                      <span style={{ color: C.text, fontSize: 9.5, fontWeight: 600 }}>{PATTERN_KEYS[p.type] ? t(PATTERN_KEYS[p.type]) : p.type}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ height: 3, width: 36, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${Math.round(p.confidence * 100)}%`, background: col, borderRadius: 2 }} />
                      </div>
                      <span style={{ color: C.mut, fontSize: 8 }}>{Math.round(p.confidence * 100)}%</span>
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* LEVELS */}
        {tab === 'levels' && (
          <div style={{ padding: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {([[t('resistance'), resistance, C.red], [t('support'), support, C.green]] as [string, SupportResistanceLevel[], string][]).map(([lbl, arr, col]) => arr.length > 0 ? (
              <div key={lbl} style={{ marginBottom: 10 }}>
                <div style={{ color: col, fontSize: 9, fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>{lbl} ({arr.length})</div>
                {arr.map((l, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', borderRadius: 5, background: C.card, marginBottom: 3, border: `1px solid ${col}15` }}>
                    <span style={{ color: col, fontSize: 9.5, fontFamily: "var(--font-mono)", fontWeight: 700 }}>{fp(l.price)}</span>
                    <span style={{ color: l.strength === 'strong' ? col : C.mut, fontSize: 8 }}>{strengthLabel(l.strength)}</span>
                  </div>
                ))}
              </div>
            ) : null)}
          </div>
        )}

        {/* SMC — Wyckoff + Volume Profile + Elliott+SMC Fusion */}
        {tab === 'smc' && (
          <div style={{ padding: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {/* REVOLUTIONARY: Elliott+SMC Fusion card */}
            {fusionResult && (
              <div style={{ background: `${C.gold}0a`, border: `1px solid ${C.gold}25`, borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
                <div style={{ color: C.gold, fontSize: 8, fontWeight: 700, marginBottom: 4 }}>{t('elliottSmcConfluence')}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: fusionResult.direction === 'bullish' ? C.green : fusionResult.direction === 'bearish' ? C.red : C.yellow, fontSize: 12, fontWeight: 800 }}>
                    {fusionResult.direction === 'bullish' ? `▲ ${t('bullish')}` : fusionResult.direction === 'bearish' ? `▼ ${t('bearish')}` : `◆ ${t('neutral')}`}
                  </span>
                  <span style={{ color: C.gold, fontSize: 11, fontWeight: 700 }}>{fusionResult.confluenceScore}%</span>
                </div>
                <div style={{ color: C.dim, fontSize: 8, marginTop: 3 }}>{fusionResult.interpretation}</div>
              </div>
            )}
            {wyckoffData && wyckoffData.phase !== 'Unknown' && (
              <div style={{ background: C.card, border: `1px solid ${wyckoffData.bias==='bullish'?C.green:wyckoffData.bias==='bearish'?C.red:C.yellow}30`, borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
                <div style={{ color: C.dim, fontSize: 8, marginBottom: 3 }}>{t('wyckoff')}</div>
                <div style={{ color: wyckoffData.bias==='bullish'?C.green:wyckoffData.bias==='bearish'?C.red:C.yellow, fontSize: 13, fontWeight: 800 }}>{t(WYCKOFF_PHASE_TO_I18N[wyckoffData.phase] || 'overlayWyckoff')}</div>
                <div style={{ color: C.mut, fontSize: 8.5, marginTop: 2 }}>{Math.round((wyckoffData.confidence||0)*100)}% {t('confidence')}</div>
              </div>
            )}
            {volProfile && volProfile.poc > 0 && (
              <div style={{ background: C.card, borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
                <div style={{ color: C.dim, fontSize: 8, marginBottom: 6 }}>{t('volumeProfile')}</div>
                {([[t('poc'), volProfile.poc, C.yellow], [t('vah'), volProfile.vah, C.cyan], [t('val'), volProfile.val, C.red]] as [string,number,string][]).map(([l,v,col]) => (
                  <div key={l} style={{ display:'flex', justifyContent:'space-between', marginBottom:4, padding:'3px 0', borderBottom:`1px solid ${C.border}` }}>
                    <span style={{ color: col, fontSize: 8.5, fontWeight: 700 }}>{l}</span>
                    <span style={{ color: C.text, fontSize: 9, fontFamily: "var(--font-mono)" }}>{v>999?v.toFixed(2):v.toFixed(5)}</span>
                  </div>
                ))}
              </div>
            )}
            {!wyckoffData && !volProfile && !fusionResult && <div style={{ textAlign:'center', padding: 20, color: C.dim, fontSize: 10 }}>{t('pressForAnalysis')}</div>}
          </div>
        )}

        {/* WYCKOFF — Phase 2: Full A-E Phase Analysis */}
        {tab === 'wyckoff' && (
          <div style={{ padding: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {!wyckoffAdvanced || wyckoffAdvanced.scheme === 'none' ? (
              <div style={{ color: C.mut, textAlign: 'center', padding: 24 }}>لا يوجد هيكل وايكوف — No Wyckoff structure detected</div>
            ) : (
              <>
                {/* Scheme Header */}
                <div style={{ padding: 8, borderRadius: 6, marginBottom: 8, background: wyckoffAdvanced.direction === 'bullish' ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${wyckoffAdvanced.direction === 'bullish' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 14 }}>{wyckoffAdvanced.direction === 'bullish' ? '📈' : '📉'}</span>
                      <span style={{ color: wyckoffAdvanced.direction === 'bullish' ? C.green : C.red, fontWeight: 700, fontSize: 12 }}>
                        {wyckoffAdvanced.scheme === 'accumulation' ? 'تراكم وايكوف — Accumulation' : 'توزيع وايكوف — Distribution'}
                      </span>
                    </div>
                    <div style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: 'rgba(245,158,11,0.12)', color: C.yellow, border: '1px solid rgba(245,158,11,0.2)' }}>
                      المرحلة {wyckoffAdvanced.currentPhase}
                    </div>
                  </div>
                  <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 2, width: `${wyckoffAdvanced.confidence * 100}%`, background: wyckoffAdvanced.direction === 'bullish' ? C.green : C.red, transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8, fontSize: 9 }}>
                    <div><span style={{ color: C.dim }}>أعلى النطاق:</span> <span style={{ color: C.text, fontFamily: "var(--font-mono)" }}>{safeToFixed(wyckoffAdvanced.range?.high, 2)}</span></div>
                    <div><span style={{ color: C.dim }}>أدنى النطاق:</span> <span style={{ color: C.text, fontFamily: "var(--font-mono)" }}>{safeToFixed(wyckoffAdvanced.range?.low, 2)}</span></div>
                    <div><span style={{ color: C.dim }}>الدعم:</span> <span style={{ color: C.green, fontFamily: "var(--font-mono)" }}>{safeToFixed(wyckoffAdvanced.support, 2)}</span></div>
                    <div><span style={{ color: C.dim }}>المقاومة:</span> <span style={{ color: C.red, fontFamily: "var(--font-mono)" }}>{safeToFixed(wyckoffAdvanced.resistance, 2)}</span></div>
                  </div>
                </div>

                {/* Events Timeline */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ color: C.dim, fontSize: 9, marginBottom: 4, fontWeight: 600 }}>الأحداث — Events Timeline</div>
                  {wyckoffAdvanced.events.length === 0 ? (
                    <div style={{ color: C.mut, textAlign: 'center', padding: 8 }}>لا أحداث بعد</div>
                  ) : (
                    wyckoffAdvanced.events.map((evt: WyckoffEvent, i: number) => (
                      <div key={i} style={{ display: 'flex', gap: 6, padding: '4px 6px', background: 'rgba(255,255,255,0.02)', borderRadius: 4, marginBottom: 3, alignItems: 'flex-start' }}>
                        <div style={{ padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 700, fontFamily: "var(--font-mono)", background: evt.phase === 'A' ? 'rgba(59,130,246,0.12)' : evt.phase === 'B' ? 'rgba(168,85,247,0.12)' : evt.phase === 'C' ? 'rgba(245,158,11,0.12)' : evt.phase === 'D' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: evt.phase === 'A' ? C.blue : evt.phase === 'B' ? C.purple : evt.phase === 'C' ? C.yellow : evt.phase === 'D' ? C.green : C.red, border: `1px solid ${evt.phase === 'A' ? 'rgba(59,130,246,0.2)' : evt.phase === 'B' ? 'rgba(168,85,247,0.2)' : evt.phase === 'C' ? 'rgba(245,158,11,0.2)' : evt.phase === 'D' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`, flexShrink: 0 }}>
                          {evt.type}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <span style={{ color: C.dim, fontSize: 8 }}>المرحلة {evt.phase}</span>
                            <span style={{ color: C.text, fontFamily: "var(--font-mono)", fontSize: 9 }}>{evt.price.toFixed(2)}</span>
                          </div>
                          <div style={{ color: C.mut, fontSize: 8 }}>{evt.description}</div>
                        </div>
                        <span style={{ color: C.mut, fontFamily: "var(--font-mono)", fontSize: 8 }}>V:{safeToFixed((evt.volume ?? 0) / 1000, 0)}K</span>
                      </div>
                    ))
                  )}
                </div>

                {/* Phase Progress */}
                <div>
                  <div style={{ color: C.dim, fontSize: 9, marginBottom: 4, fontWeight: 600 }}>تقدم المراحل — Phase Progress</div>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {(['A', 'B', 'C', 'D', 'E'] as const).map(phase => {
                      const isActive = phase === wyckoffAdvanced.currentPhase;
                      const isComplete = wyckoffAdvanced.events.some(e => e.phase === phase);
                      return (
                        <div key={phase} style={{ flex: 1, height: 24, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontFamily: "var(--font-mono)", background: isActive ? 'rgba(245,158,11,0.12)' : isComplete ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)', color: isActive ? C.yellow : isComplete ? C.dim : C.mut, border: isActive ? '1px solid rgba(245,158,11,0.2)' : 'none' }}>
                          {phase}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ELLIOTT — Phase 2: ABC Corrections + Fibonacci */}
        {tab === 'elliott' && (
          <div style={{ padding: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {!elliottAdvanced || elliottAdvanced.counts.length === 0 ? (
              <div style={{ color: C.mut, textAlign: 'center', padding: 24 }}>لا أنماط إليوت — No Elliott patterns detected</div>
            ) : (
              <>
                {/* Dominant Count */}
                {elliottAdvanced.dominantCount && (
                  <div style={{ padding: 8, borderRadius: 6, marginBottom: 8, background: elliottAdvanced.dominantCount.direction === 'bullish' ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${elliottAdvanced.dominantCount.direction === 'bullish' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 14 }}>〰️</span>
                        <span style={{ color: elliottAdvanced.dominantCount.direction === 'bullish' ? C.green : C.red, fontWeight: 700, fontSize: 12 }}>
                          {elliottAdvanced.dominantCount.type === 'impulse' ? 'نبضة' : elliottAdvanced.dominantCount.type === 'zigzag' ? 'زيگزاج' : elliottAdvanced.dominantCount.type === 'flat' ? 'مسطح' : elliottAdvanced.dominantCount.type === 'triangle' ? 'مثلث' : 'مركب'} {elliottAdvanced.dominantCount.direction === 'bullish' ? '↑' : '↓'}
                        </span>
                      </div>
                      <div style={{ padding: '1px 6px', borderRadius: 3, fontSize: 8, fontWeight: 700, background: 'rgba(245,158,11,0.12)', color: C.yellow, border: '1px solid rgba(245,158,11,0.2)' }}>
                        {(safeToFixed((elliottAdvanced.dominantCount.probability ?? 0) * 100, 0))}%
                      </div>
                    </div>
                    <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 2, width: `${elliottAdvanced.dominantCount.confidence * 100}%`, background: elliottAdvanced.dominantCount.direction === 'bullish' ? C.green : C.red, transition: 'width 0.5s' }} />
                    </div>
                    <div style={{ color: C.dim, fontSize: 9, marginTop: 4 }}>{elliottAdvanced.dominantCount.label}</div>
                    {elliottAdvanced.dominantCount.targetPrice !== null && (
                      <div style={{ color: C.dim, fontSize: 9, marginTop: 2 }}>الهدف: <span style={{ color: C.text, fontFamily: "var(--font-mono)" }}>{safeToFixed(elliottAdvanced.dominantCount.targetPrice, 2)}</span></div>
                    )}
                  </div>
                )}

                {/* Fibonacci Ratios (impulse only) */}
                {elliottAdvanced.dominantCount && elliottAdvanced.dominantCount.type === 'impulse' && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: C.dim, fontSize: 9, marginBottom: 4, fontWeight: 600 }}>نسب فيبوناتشي — Fibonacci Ratios</div>
                    {[
                      { label: 'W2/W1', val: elliottAdvanced.dominantCount.ratios.wave2Retrace, target: 0.618 },
                      { label: 'W3/W1', val: elliottAdvanced.dominantCount.ratios.wave3Extend, target: 1.618 },
                      { label: 'W4/W3', val: elliottAdvanced.dominantCount.ratios.wave4Retrace, target: 0.382 },
                      { label: 'W5/W1', val: elliottAdvanced.dominantCount.ratios.wave5Extend, target: 1.0 },
                    ].map(({ label, val, target }) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 6px', background: 'rgba(255,255,255,0.02)', borderRadius: 4, marginBottom: 2 }}>
                        <span style={{ color: C.dim, fontSize: 9 }}>{label}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: Number.isFinite(val) && target > 0 && Math.abs(val - target) / target < 0.08 ? C.green : C.yellow }}>
                          {safeToFixed(val, 3)}{Number.isFinite(val) && target > 0 && Math.abs(val - target) / target < 0.08 ? ` ≈ ${target}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Alternate Counts */}
                {elliottAdvanced.counts.length > 1 && (
                  <div>
                    <div style={{ color: C.dim, fontSize: 9, marginBottom: 4, fontWeight: 600 }}>العدادات البديلة — Alternate Counts</div>
                    {elliottAdvanced.counts.slice(1).map((count: WaveCount, i: number) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px', background: 'rgba(255,255,255,0.02)', borderRadius: 4, marginBottom: 3 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ color: count.direction === 'bullish' ? C.green : C.red, fontSize: 10 }}>{count.direction === 'bullish' ? '↑' : '↓'}</span>
                          <span style={{ color: C.dim, textTransform: 'capitalize', fontSize: 9 }}>{count.type}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ color: C.mut, fontSize: 8 }}>{count.label}</span>
                          <span style={{ padding: '1px 4px', borderRadius: 3, fontSize: 8, fontFamily: "var(--font-mono)", background: 'rgba(255,255,255,0.04)', color: C.dim }}>{safeToFixed((count.probability ?? 0) * 100, 0)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ADVANCED — Geometric + Elliott + Performance */}
        {tab === 'advanced' && (
          <div style={{ padding: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {geoList.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ color: C.cyan, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>{t('geometricPatterns')} ({geoList.length})</div>
                {geoList.map((g: any, i: number) => {
                  const col = g.direction==='bullish'?C.green:g.direction==='bearish'?C.red:C.yellow;
                  return (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 8px', borderRadius:5, background:C.card, marginBottom:3, border:`1px solid ${col}18` }}>
                      <span style={{ color:col, fontSize:9.5, fontWeight:600 }}>{g.direction==='bullish'?'▲':'▼'} {t(GEO_TYPE_TO_I18N[g.type] || g.type)}</span>
                      <span style={{ color:C.mut, fontSize:8 }}>{Math.round(g.confidence*100)}%</span>
                    </div>
                  );
                })}
              </div>
            )}
            {elliottData && (
              <div style={{ background:C.card, borderRadius:6, padding:'8px 10px', marginBottom:8, border:`1px solid ${elliottData.direction==='bullish'?C.green:C.red}25` }}>
                <div style={{ color:C.dim, fontSize:8, marginBottom:3 }}>{t('elliottWaves')}</div>
                <div style={{ color:elliottData.direction==='bullish'?C.green:C.red, fontSize:12, fontWeight:700 }}>
                  {elliottData.type === '5-wave' ? t('impulse5Wave') : t('abcCorrection')} — {t('wave')} {elliottData.currentWave}
                </div>
                <div style={{ display:'flex', gap:4, marginTop:5 }}>
                  {elliottData.waves?.map((w: any) => (
                    <span key={w.waveNumber} style={{ background:`${elliottData.direction==='bullish'?C.green:C.red}20`, color:elliottData.direction==='bullish'?C.green:C.red, padding:'2px 5px', borderRadius:3, fontSize:8, fontWeight:700 }}>{w.waveNumber}</span>
                  ))}
                </div>
                {elliottData.nextTarget && <div style={{ color:C.dim, fontSize:8.5, marginTop:4 }}>{t('nextTarget')}: <span style={{ color:C.cyan, fontFamily: "var(--font-mono)" }}>{elliottData.nextTarget.toFixed(2)}</span></div>}
              </div>
            )}
            {/* REVOLUTIONARY: Performance Stats section */}
            {performanceStats && performanceStats.totalPatterns > 0 && (
              <div style={{ background: `${C.gold}08`, border: `1px solid ${C.gold}20`, borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
                <div style={{ color: C.gold, fontSize: 8, fontWeight: 700, marginBottom: 5 }}>{t('historicalPatternPerformance')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                    <div style={{ color: C.mut, fontSize: 7 }}>{t('patterns')}</div>
                    <div style={{ color: C.text, fontSize: 10, fontWeight: 700 }}>{performanceStats.totalPatterns}</div>
                  </div>
                  <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                    <div style={{ color: C.mut, fontSize: 7 }}>{t('winRate')}</div>
                    <div style={{ color: (performanceStats.overallWinRate ?? 0) > 0.5 ? C.green : C.red, fontSize: 10, fontWeight: 700 }}>{Math.round((performanceStats.overallWinRate ?? 0) * 100)}%</div>
                  </div>
                  {performanceStats.bestPattern && (
                    <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                      <div style={{ color: C.mut, fontSize: 7 }}>{t('bestPattern')}</div>
                      <div style={{ color: C.green, fontSize: 9, fontWeight: 600 }}>{performanceStats.bestPattern}</div>
                    </div>
                  )}
                  {performanceStats.worstPattern && (
                    <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                      <div style={{ color: C.mut, fontSize: 7 }}>{t('worstPattern')}</div>
                      <div style={{ color: C.red, fontSize: 9, fontWeight: 600 }}>{performanceStats.worstPattern}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {geoList.length===0 && !elliottData && !performanceStats && <div style={{ textAlign:'center', padding:20, color:C.dim, fontSize:10 }}>{t('pressForAnalysis')}</div>}

            {/* ATR Dynamic Thresholds */}
            {candles.length > 20 && (() => {
              try {
                const thresholds = getDynamicThresholds(candles);
                const atrPct = thresholds.atrValue / (candles[candles.length - 1]?.close || 1) * 100;
                return (
                  <div style={{ background: `${C.blue}08`, border: `1px solid ${C.blue}20`, borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
                    <div style={{ color: C.blue, fontSize: 8, fontWeight: 700, marginBottom: 5 }}>{t('dynamicATRThresholds')}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                      <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                        <div style={{ color: C.mut, fontSize: 7 }}>ATR</div>
                        <div style={{ color: C.text, fontSize: 9, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{thresholds.atrValue.toFixed(2)}</div>
                      </div>
                      <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                        <div style={{ color: C.mut, fontSize: 7 }}>ATR %</div>
                        <div style={{ color: regimeColor, fontSize: 9, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{atrPct.toFixed(2)}%</div>
                      </div>
                      <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                        <div style={{ color: C.mut, fontSize: 7 }}>{t('retracement')}</div>
                        <div style={{ color: C.text, fontSize: 9, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{(thresholds.pullback * 100).toFixed(1)}%</div>
                      </div>
                      <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                        <div style={{ color: C.mut, fontSize: 7 }}>{t('peakSimilarity')}</div>
                        <div style={{ color: C.text, fontSize: 9, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{(thresholds.peakSimilarity * 100).toFixed(1)}%</div>
                      </div>
                      <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                        <div style={{ color: C.mut, fontSize: 7 }}>{t('shoulderDivergence')}</div>
                        <div style={{ color: C.text, fontSize: 9, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{(thresholds.shoulderTolerance * 100).toFixed(1)}%</div>
                      </div>
                      <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                        <div style={{ color: C.mut, fontSize: 7 }}>{t('breakoutConfirmation')}</div>
                        <div style={{ color: C.text, fontSize: 9, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{(thresholds.breakoutConfirm * 100).toFixed(1)}%</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, padding: '3px 6px', background: C.card, borderRadius: 4 }}>
                      <span style={{ color: C.mut, fontSize: 7 }}>{t('volatilityRegime')}</span>
                      <span style={{ color: regimeColor, fontSize: 8, fontWeight: 700 }}>{regimeLabelAr} ({thresholds.atrMultiplier}x)</span>
                    </div>
                  </div>
                );
              } catch { return null; }
            })()}
          </div>
        )}

        {/* MTF — Multi-Timeframe Analysis (Phase 3) */}
        {tab === 'mtf' && (
          <div style={{ padding: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {mtfLoading && (
              <div style={{ textAlign: 'center', padding: 12 }}>
                <div style={{ width: 16, height: 16, border: `2px solid ${C.cyan}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto' }} />
                <div style={{ color: C.dim, fontSize: 8, marginTop: 6 }}>جاري تحليل الفريمات...</div>
              </div>
            )}
            {mtfResult && !mtfLoading && (
              <>
                {/* Confluence Score */}
                <div style={{ background: mtfResult.confluenceDirection === 'bullish' ? `${C.green}12` : mtfResult.confluenceDirection === 'bearish' ? `${C.red}12` : `${C.yellow}08`, border: `1px solid ${mtfResult.confluenceDirection === 'bullish' ? C.green : mtfResult.confluenceDirection === 'bearish' ? C.red : C.yellow}30`, borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 20 }}>{mtfResult.confluenceDirection === 'bullish' ? '▲' : mtfResult.confluenceDirection === 'bearish' ? '▼' : '◆'}</span>
                      <div>
                        <div style={{ color: mtfResult.confluenceDirection === 'bullish' ? C.green : mtfResult.confluenceDirection === 'bearish' ? C.red : C.yellow, fontSize: 13, fontWeight: 800 }}>
                          تقارب MTF: {mtfResult.confluenceDirection === 'bullish' ? 'صعودي' : mtfResult.confluenceDirection === 'bearish' ? 'هبوطي' : 'محايد'}
                        </div>
                        <div style={{ color: C.dim, fontSize: 8 }}>{mtfResult.agreeingTFs} من {mtfResult.totalTFs} فريمات تتفق</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: mtfResult.confluenceDirection === 'bullish' ? C.green : mtfResult.confluenceDirection === 'bearish' ? C.red : C.yellow, fontFamily: "var(--font-mono)" }}>{mtfResult.confluenceScore}%</div>
                      <div style={{ color: C.mut, fontSize: 7 }}>مجموع التقارب</div>
                    </div>
                  </div>
                </div>

                {/* Per-Timeframe Breakdown */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ color: C.cyan, fontSize: 8, fontWeight: 700, marginBottom: 4 }}>تحليل كل فريم</div>
                  {mtfResult.timeframes.map((tf) => {
                    const tfCol = tf.direction === 'bullish' ? C.green : tf.direction === 'bearish' ? C.red : C.yellow;
                    return (
                      <div key={tf.timeframe} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', borderRadius: 5, marginBottom: 3, background: C.card, border: `1px solid ${tfCol}15` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: tfCol, fontSize: 10 }}>{tf.direction === 'bullish' ? '▲' : tf.direction === 'bearish' ? '▼' : '◆'}</span>
                          <div>
                            <div style={{ color: C.text, fontSize: 9, fontWeight: 600 }}>{TF_LABELS_AR[tf.timeframe] || tf.timeframe}</div>
                            <div style={{ color: C.mut, fontSize: 7 }}>{tf.trendState === 'uptrend' ? 'صاعد' : tf.trendState === 'downtrend' ? 'هابط' : tf.trendState === 'ranging' ? 'عرضي' : tf.trendState === 'counter-uptrend' ? 'ارتداد صاعد' : 'ارتداد هابط'} | زخم: {tf.momentum === 'accelerating' ? 'تسارع' : tf.momentum === 'decelerating' ? 'تباطؤ' : tf.momentum === 'diverging' ? 'تباعد' : 'عادي'}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div style={{ height: 3, width: 40, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                            <div style={{ height: '100%', width: `${Math.round(tf.strength * 100)}%`, background: tfCol, borderRadius: 2 }} />
                          </div>
                          <span style={{ color: C.mut, fontSize: 8 }}>{Math.round(tf.strength * 100)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Entry Recommendation */}
                {mtfResult.entryRecommendation && mtfResult.entryRecommendation.direction !== 'neutral' && (
                  <div style={{ background: `${C.cyan}08`, border: `1px solid ${C.cyan}20`, borderRadius: 6, padding: '6px 8px', marginBottom: 8 }}>
                    <div style={{ color: C.cyan, fontSize: 8, fontWeight: 700, marginBottom: 3 }}>🎯 توصية الدخول</div>
                    <div style={{ color: C.dim, fontSize: 8, lineHeight: 1.5 }}>{mtfResult.entryRecommendation.reasonAr}</div>
                  </div>
                )}

                {/* S/R Confluence */}
                {mtfResult.srConfluences.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: C.gold, fontSize: 8, fontWeight: 700, marginBottom: 4 }}>📋 مستويات متعددة الفريمات</div>
                    {mtfResult.srConfluences.map((sr, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', borderRadius: 4, marginBottom: 2, background: C.card }}>
                        <span style={{ color: sr.type === 'support' ? C.green : C.red, fontSize: 8 }}>{sr.labelAr}</span>
                        <span style={{ color: C.text, fontSize: 8, fontFamily: "var(--font-mono)" }}>{sr.price} ({sr.timeframes.length}TF)</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Divergences */}
                {mtfResult.divergences.length > 0 && (
                  <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 6, padding: '6px 8px', marginBottom: 8 }}>
                    <div style={{ color: '#f59e0b', fontSize: 8, fontWeight: 700, marginBottom: 3 }}>⚠️ تباعدات بين الفريمات</div>
                    {mtfResult.divergences.map((div, i) => (
                      <div key={i} style={{ color: C.dim, fontSize: 7.5, marginBottom: 3, lineHeight: 1.4 }}>{div.descriptionAr}</div>
                    ))}
                  </div>
                )}

                {/* Interpretation */}
                <div style={{ background: C.card, borderRadius: 5, padding: '6px 8px', marginTop: 6 }}>
                  <div style={{ color: C.dim, fontSize: 7.5, lineHeight: 1.6 }}>{mtfResult.interpretationAr}</div>
                </div>
              </>
            )}
            {!mtfResult && !mtfLoading && (
              <div style={{ textAlign: 'center', padding: 24, color: C.dim }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
                <div style={{ fontSize: 10 }}>اضغط تحليل لعرض تحليل الفريمات</div>
              </div>
            )}
          </div>
        )}

        {/* ALERTS — Smart Alert Engine (Phase 3) */}
        {tab === 'alerts' && (
          <div style={{ padding: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {/* Active Alerts */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ color: C.cyan, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>🚨 التنبيهات الذكية ({smartAlerts.length})</div>
              {smartAlerts.length === 0 ? (
                <div style={{ color: C.mut, fontSize: 9, padding: '8px', textAlign: 'center', background: C.card, borderRadius: 5 }}>
                  لا توجد تنبيهات حالياً — يُفعّل عند تقارب 3+ إشارات
                </div>
              ) : (
                smartAlerts.slice(0, 10).map((alert, i) => {
                  const pColor = alert.priority === 'critical' ? C.red : alert.priority === 'high' ? C.yellow : C.green;
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', borderRadius: 5, background: C.card, marginBottom: 3, border: `1px solid ${pColor}25` }}>
                      <div>
                        <span style={{ color: alert.direction === 'bullish' ? C.green : alert.direction === 'bearish' ? C.red : C.mut, fontSize: 9.5, fontWeight: 600 }}>
                          {alert.direction === 'bullish' ? '▲' : '▼'} {alert.nameAr}
                        </span>
                        <div style={{ color: C.mut, fontSize: 7.5, marginTop: 2 }}>
                          ثقة: {Math.round(alert.confidence * 100)}% | مستوى: {alert.keyLevel.toFixed(2)}
                        </div>
                      </div>
                      <span style={{ background: `${pColor}20`, color: pColor, fontSize: 7, fontWeight: 700, padding: '2px 5px', borderRadius: 3 }}>
                        {alert.priority === 'critical' ? 'حرج' : alert.priority === 'high' ? 'عالي' : 'متوسط'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            {/* Liquidity Zones */}
            {liquidityResult && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ color: C.purple, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>💧 مناطق السيولة ({liquidityResult.activeZones} نشطة / {liquidityResult.sweptZones} مسحوبة)</div>
                <div style={{ background: `${C.purple}08`, border: `1px solid ${C.purple}20`, borderRadius: 6, padding: '8px 10px', marginBottom: 5 }}>
                  <div style={{ color: C.dim, fontSize: 8.5, lineHeight: 1.6 }}>{liquidityResult.interpretationAr}</div>
                </div>
                {liquidityResult.zones.slice(0, 8).map((zone, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', borderRadius: 4, background: C.card, marginBottom: 2, border: `1px solid ${zone.sweepDirection === 'bullish' ? C.green : C.red}15`, opacity: zone.swept ? 0.5 : 1 }}>
                    <span style={{ color: zone.sweepDirection === 'bullish' ? C.green : C.red, fontSize: 8.5, fontWeight: 600 }}>
                      {zone.sweepDirection === 'bullish' ? '▲' : '▼'} {zone.labelAr}
                    </span>
                    <span style={{ color: C.mut, fontSize: 8, fontFamily: "var(--font-mono)" }}>{zone.price.toFixed(2)} {zone.swept ? '(مسحوبة)' : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TRADES — Auto-Trade Proposals (Phase 3) */}
        {tab === 'trades' && (
          <div style={{ padding: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {/* Proposal Stats */}
            {proposalStats && (
              <div style={{ background: `${C.gold}08`, border: `1px solid ${C.gold}20`, borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
                <div style={{ color: C.gold, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>💰 إحصائيات الاقتراحات</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                  <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                    <div style={{ color: C.mut, fontSize: 7 }}>الكل</div>
                    <div style={{ color: C.text, fontSize: 10, fontWeight: 700 }}>{proposalStats.total}</div>
                  </div>
                  <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                    <div style={{ color: C.mut, fontSize: 7 }}>نسبة النجاح</div>
                    <div style={{ color: proposalStats.winRate > 0.5 ? C.green : C.red, fontSize: 10, fontWeight: 700 }}>{Math.round(proposalStats.winRate * 100)}%</div>
                  </div>
                  <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                    <div style={{ color: C.mut, fontSize: 7 }}>متوسط R:R</div>
                    <div style={{ color: C.cyan, fontSize: 10, fontWeight: 700 }}>1:{safeToFixed(proposalStats.avgRR, 1, '—')}</div>
                  </div>
                </div>
              </div>
            )}
            {/* Trade Proposals */}
            <div style={{ color: C.cyan, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>📋 اقتراحات الصفقات ({tradeProposals.length})</div>
            {tradeProposals.length === 0 ? (
              <div style={{ color: C.mut, fontSize: 9, padding: '8px', textAlign: 'center', background: C.card, borderRadius: 5 }}>
                لا توجد اقتراحات حالياً — يُفعّل عند تقارب 3+ إشارات وثقة ≥ 60%
              </div>
            ) : (
              tradeProposals.slice(0, 5).map((proposal, i) => {
                const dirColor = proposal.direction === 'bullish' ? C.green : C.red;
                return (
                  <div key={proposal.id} style={{ background: C.card, border: `1px solid ${dirColor}25`, borderRadius: 6, padding: '8px 10px', marginBottom: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ color: dirColor, fontSize: 10, fontWeight: 700 }}>
                        {proposal.direction === 'bullish' ? '▲ شراء' : '▼ بيع'}
                      </span>
                      <span style={{ background: `${dirColor}20`, color: dirColor, fontSize: 7.5, fontWeight: 700, padding: '2px 5px', borderRadius: 3 }}>
                        R:R 1:{proposal.rrRatio}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 3, fontSize: 8 }}>
                      <div><span style={{ color: C.mut }}>دخول:</span> <span style={{ color: C.text, fontFamily: "var(--font-mono)" }}>{safeToFixed(proposal.entryPrice, 2)}</span></div>
                      <div><span style={{ color: C.mut }}>وقف:</span> <span style={{ color: C.red, fontFamily: "var(--font-mono)" }}>{safeToFixed(proposal.stopLoss, 2)}</span></div>
                      <div><span style={{ color: C.mut }}>هدف:</span> <span style={{ color: C.green, fontFamily: "var(--font-mono)" }}>{safeToFixed(proposal.takeProfits?.[2], 2)}</span></div>
                      <div><span style={{ color: C.mut }}>حجم:</span> <span style={{ color: C.text, fontFamily: "var(--font-mono)" }}>{safeToFixed(proposal.positionSize, 4)}</span></div>
                    </div>
                    <div style={{ color: C.mut, fontSize: 7.5, marginTop: 3 }}>{proposal.descriptionAr}</div>
                    <div style={{ display: 'flex', gap: 3, marginTop: 3, flexWrap: 'wrap' }}>
                      {proposal.agreeingSignals.slice(0, 4).map((sig, j) => (
                        <span key={j} style={{ background: `${dirColor}10`, color: dirColor, fontSize: 7, padding: '1px 4px', borderRadius: 2, fontWeight: 600 }}>{sig.source}</span>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ADAPTIVE — Adaptive Bayesian Engine (Phase 5) */}
        {tab === 'adaptive' && (
          <div style={{ padding: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {/* Market Regime */}
            <div style={{ background: `${C.purple}08`, border: `1px solid ${C.purple}20`, borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
              <div style={{ color: C.purple, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>🧠 النظام التكيفي — Adaptive Bayesian</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                  <div style={{ color: C.mut, fontSize: 7 }}>نظام السوق</div>
                  <div style={{ color: marketRegime === 'trending' ? C.green : marketRegime === 'volatile' ? C.red : marketRegime === 'ranging' ? C.yellow : C.dim, fontSize: 10, fontWeight: 700 }}>
                    {marketRegime === 'trending' ? 'اتجاهي' : marketRegime === 'volatile' ? 'متقلب' : marketRegime === 'ranging' ? 'عرضي' : 'هادئ'}
                  </div>
                </div>
                <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                  <div style={{ color: C.mut, fontSize: 7 }}>اتجاه تكيفي</div>
                  <div style={{ color: adaptiveResult?.direction === 'bullish' ? C.green : adaptiveResult?.direction === 'bearish' ? C.red : C.dim, fontSize: 10, fontWeight: 700 }}>
                    {adaptiveResult ? (adaptiveResult.direction === 'bullish' ? 'صاعد' : adaptiveResult.direction === 'bearish' ? 'هابط' : 'محايد') : '—'}
                  </div>
                </div>
                <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                  <div style={{ color: C.mut, fontSize: 7 }}>ثقة تكيفية</div>
                  <div style={{ color: C.cyan, fontSize: 10, fontWeight: 700 }}>{adaptiveResult ? `${Math.round(adaptiveResult.confidence * 100)}%` : '—'}</div>
                </div>
              </div>
            </div>

            {/* Adaptive Insights */}
            {adaptiveResult && adaptiveResult.insights.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ color: C.cyan, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>رؤى التعلم</div>
                {adaptiveResult.insights.map((insight, i) => (
                  <div key={i} style={{ background: C.card, borderRadius: 4, padding: '4px 8px', marginBottom: 3, fontSize: 8.5, color: C.dim }}>{insight}</div>
                ))}
              </div>
            )}

            {/* Source Contributions */}
            {adaptiveResult && adaptiveResult.sourceContributions.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ color: C.gold, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>مساهمة المصادر (أوزان تكيفية)</div>
                {adaptiveResult.sourceContributions.slice(0, 8).map((sc, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 8px', borderRadius: 4, background: C.card, marginBottom: 2 }}>
                    <span style={{ fontSize: 8.5, color: C.text }}>{sc.source} {sc.isUserOverride ? '👤' : ''}</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 7.5, color: C.mut }}>وزن: <b style={{ color: sc.adaptiveWeight > 1.2 ? C.green : sc.adaptiveWeight < 0.8 ? C.red : C.dim }}>{sc.adaptiveWeight.toFixed(2)}</b></span>
                      <span style={{ fontSize: 7.5, color: C.mut }}>نجاح: <b style={{ color: sc.winRate > 0.6 ? C.green : sc.winRate < 0.4 ? C.red : C.dim }}>{Math.round(sc.winRate * 100)}%</b></span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Adaptive Summary */}
            {adaptiveSummary && (
              <div style={{ background: `${C.blue}08`, border: `1px solid ${C.blue}20`, borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ color: C.blue, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>ملخص التعلم</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 8 }}>
                  <div><span style={{ color: C.mut }}>مصادر كلية:</span> <span style={{ color: C.text }}>{adaptiveSummary.totalSources}</span></div>
                  <div><span style={{ color: C.mut }}>مصادر متكيفة:</span> <span style={{ color: C.text }}>{adaptiveSummary.adaptedSources}</span></div>
                  <div><span style={{ color: C.mut }}>أفضل مصدر:</span> <span style={{ color: C.green }}>{adaptiveSummary.bestSource || '—'}</span></div>
                  <div><span style={{ color: C.mut }}>أضعف مصدر:</span> <span style={{ color: C.red }}>{adaptiveSummary.worstSource || '—'}</span></div>
                  <div><span style={{ color: C.mut }}>متوسط النجاح:</span> <span style={{ color: C.text }}>{Math.round(adaptiveSummary.avgWinRate * 100)}%</span></div>
                  <div><span style={{ color: C.mut }}>النظام السائد:</span> <span style={{ color: C.text }}>{adaptiveSummary.dominantRegime === 'trending' ? 'اتجاهي' : adaptiveSummary.dominantRegime === 'volatile' ? 'متقلب' : adaptiveSummary.dominantRegime === 'ranging' ? 'عرضي' : 'هادئ'}</span></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* RULES — Visual Rule Builder (Phase 5) */}
        {tab === 'rules' && (
          <div style={{ padding: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <div style={{ background: `${C.blue}08`, border: `1px solid ${C.blue}20`, borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
              <div style={{ color: C.blue, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>📐 نظام القواعد المرئي — Visual Rule Builder</div>
              <div style={{ fontSize: 8, color: C.dim }}>أنشئ قواعد تنبيه مركبة بسهولة. اسحب كتل الإشارات وصلها بـ AND/OR/NOT.</div>
            </div>

            {/* Triggered Rules */}
            {visualRuleResults.length > 0 ? (
              <div style={{ marginBottom: 10 }}>
                <div style={{ color: C.gold, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>القواعد المفعّلة ({visualRuleResults.length})</div>
                {visualRuleResults.map((rr, i) => {
                  const dirColor = rr.result.direction === 'bullish' ? C.green : rr.result.direction === 'bearish' ? C.red : C.dim;
                  return (
                    <div key={i} style={{ background: C.card, borderRadius: 5, padding: '6px 8px', marginBottom: 4, border: `1px solid ${dirColor}20` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 9, fontWeight: 600, color: dirColor }}>{rr.result.direction === 'bullish' ? '▲' : '▼'} {rr.rule.nameAr}</span>
                        <span style={{ fontSize: 8, color: C.mut }}>ثقة {Math.round(rr.result.confidence * 100)}%</span>
                      </div>
                      <div style={{ display: 'flex', gap: 3, marginTop: 3, flexWrap: 'wrap' }}>
                        {rr.result.trace.filter(t => t.matched).map((t, j) => (
                          <span key={j} style={{ background: `${dirColor}10`, color: dirColor, fontSize: 7, padding: '1px 4px', borderRadius: 2 }}>{t.signalType}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: C.mut, fontSize: 8, textAlign: 'center', padding: 20 }}>لا قواعد مفعّلة حالياً — أنشئ قاعدة من مكتبة الكتل</div>
            )}

            {/* Signal Block Library */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ color: C.cyan, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>مكتبة كتل الإشارات</div>
              {(['harmonic', 'smc', 'elliott', 'wyckoff', 'candlestick', 'volume'] as const).map(category => (
                <div key={category} style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 8, color: C.mut, fontWeight: 600, marginBottom: 2 }}>{CATEGORY_LABELS_AR[category]}</div>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {SIGNAL_BLOCK_LIBRARY.filter(b => b.category === category).map(block => (
                      <span key={block.signalType} style={{ background: `${block.color}15`, color: block.color, fontSize: 7.5, padding: '2px 5px', borderRadius: 3, fontWeight: 500, border: `1px solid ${block.color}30` }}>{block.labelAr}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PAPER — Paper Trading Mode (Phase 5) */}
        {tab === 'paper' && (
          <div style={{ padding: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {/* Account Summary */}
            {paperAccountState && (
              <div style={{ background: `${C.green}08`, border: `1px solid ${C.green}20`, borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
                <div style={{ color: C.green, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>📝 تداول وهمي — Paper Trading</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                  <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                    <div style={{ color: C.mut, fontSize: 7 }}>الرصيد</div>
                    <div style={{ color: C.text, fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)" }}>${paperAccountState.currentBalance.toFixed(2)}</div>
                  </div>
                  <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                    <div style={{ color: C.mut, fontSize: 7 }}>معدل النجاح</div>
                    <div style={{ color: paperAccountState.winRate > 0.5 ? C.green : C.red, fontSize: 10, fontWeight: 700 }}>{Math.round(paperAccountState.winRate * 100)}%</div>
                  </div>
                  <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                    <div style={{ color: C.mut, fontSize: 7 }}>أقصى سحب</div>
                    <div style={{ color: C.red, fontSize: 10, fontWeight: 700 }}>{paperAccountState.maxDrawdownPct.toFixed(1)}%</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4, marginTop: 4 }}>
                  <div style={{ background: C.card, borderRadius: 4, padding: '3px 5px', textAlign: 'center' }}>
                    <div style={{ color: C.mut, fontSize: 6.5 }}>صفقات</div>
                    <div style={{ color: C.text, fontSize: 9 }}>{paperAccountState.totalTrades}</div>
                  </div>
                  <div style={{ background: C.card, borderRadius: 4, padding: '3px 5px', textAlign: 'center' }}>
                    <div style={{ color: C.mut, fontSize: 6.5 }}>ربح</div>
                    <div style={{ color: C.green, fontSize: 9 }}>{paperAccountState.wins}</div>
                  </div>
                  <div style={{ background: C.card, borderRadius: 4, padding: '3px 5px', textAlign: 'center' }}>
                    <div style={{ color: C.mut, fontSize: 6.5 }}>خسارة</div>
                    <div style={{ color: C.red, fontSize: 9 }}>{paperAccountState.losses}</div>
                  </div>
                  <div style={{ background: C.card, borderRadius: 4, padding: '3px 5px', textAlign: 'center' }}>
                    <div style={{ color: C.mut, fontSize: 6.5 }}>شارب</div>
                    <div style={{ color: C.cyan, fontSize: 9 }}>{paperAccountState.sharpeRatio.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Performance Comparison */}
            {paperComparison && (
              <div style={{ background: `${C.gold}08`, border: `1px solid ${C.gold}20`, borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
                <div style={{ color: C.gold, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>مقارنة مع "اشترِ واحتفظ"</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, fontSize: 8 }}>
                  <div><span style={{ color: C.mut }}>تداول وهمي:</span> <span style={{ color: paperComparison.paperReturnPct > 0 ? C.green : C.red }}>{paperComparison.paperReturnPct.toFixed(2)}%</span></div>
                  <div><span style={{ color: C.mut }}>شراء واحتفاظ:</span> <span style={{ color: C.text }}>{paperComparison.buyAndHoldReturnPct.toFixed(2)}%</span></div>
                  <div><span style={{ color: C.mut }}>تفوق:</span> <span style={{ color: paperComparison.outperformance > 0 ? C.green : C.red }}>{paperComparison.outperformance > 0 ? '+' : ''}{paperComparison.outperformance.toFixed(2)}%</span></div>
                </div>
              </div>
            )}

            {/* Recent Trades */}
            {paperTradesList.length > 0 && (
              <div>
                <div style={{ color: C.cyan, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>آخر الصفقات</div>
                {paperTradesList.slice(0, 5).map((trade, i) => {
                  const dirColor = trade.direction === 'long' ? C.green : C.red;
                  const pnlColor = trade.netPnl > 0 ? C.green : trade.netPnl < 0 ? C.red : C.dim;
                  return (
                    <div key={i} style={{ background: C.card, borderRadius: 4, padding: '4px 8px', marginBottom: 3, border: `1px solid ${dirColor}10` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 8.5, color: dirColor, fontWeight: 600 }}>{trade.direction === 'long' ? '▲ شراء' : '▼ بيع'} {trade.symbol}</span>
                        <span style={{ fontSize: 8.5, color: pnlColor, fontWeight: 600, fontFamily: "var(--font-mono)" }}>{trade.netPnl > 0 ? '+' : ''}{trade.netPnl.toFixed(2)}</span>
                      </div>
                      <div style={{ fontSize: 7, color: C.mut, marginTop: 2 }}>{trade.entryReasonAr}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {!paperAccountState && (
              <div style={{ color: C.mut, fontSize: 8, textAlign: 'center', padding: 20 }}>لم تبدأ التداول الوهمي بعد. سيتم فتح صفقات تلقائياً عند التقارب العالي.</div>
            )}

            {/* FIX: Quick Trade Execution Buttons */}
            {paperAccountState && signal && signal.dir !== 'WAIT' && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ color: C.gold, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>⚡ تنفيذ سريع</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => {
                      try {
                        const curPrice = priceRef.current || 0;
                        const curCandles = candlesRef.current;
                        const curSym = symbolRef.current;
                        if (!curPrice) return;
                        const dir = signal.dir === 'BUY' ? 'long' as const : 'short' as const;
                        const entry = signal.entry || curPrice;
                        const sl = signal.sl || (dir === 'long' ? entry * 0.98 : entry * 1.02);
                        const tp = signal.tp || (dir === 'long' ? entry * 1.04 : entry * 0.96);
                        const trade = openPaperTrade({
                          symbol: curSym,
                          direction: dir,
                          entryPrice: entry,
                          stopLoss: sl,
                          takeProfits: [tp, dir === 'long' ? entry + (tp - entry) * 1.5 : entry - (entry - tp) * 1.5, dir === 'long' ? entry + (tp - entry) * 2 : entry - (entry - tp) * 2],
                          entryReasonAr: `إشارة ${dir === 'long' ? 'صاعد' : 'هابط'} — ثقة ${Math.round(signal.conf * 100)}%`,
                          entrySignals: ['council-consensus'],
                          confluenceScore: Math.round(signal.conf * 100),
                          timeframe: 'auto',
                          regimeAtEntry: volRegime || 'normal',
                        });
                        if (trade) {
                          setPaperAccountState(getPaperAccount());
                          setPaperTradesList(getPaperTrades().slice(0, 10));
                          setPaperComparison(getPerformanceComparison());
                          // Add execution marker on chart
                          const execMarker: AlertMarkerData = {
                            time: (curCandles?.[curCandles.length - 1]?.time || Date.now() / 1000) as any,
                            price: entry,
                            label: `${dir === 'long' ? 'BUY' : 'SELL'}@${entry.toFixed(2)}`,
                            direction: dir === 'long' ? 'bullish' : 'bearish',
                            confidence: signal.conf,
                            type: 'execution',
                          };
                          setChartAlerts(prev => [...prev, execMarker].slice(-12));
                        }
                      } catch { /* Trade execution failed */ }
                    }}
                    style={{
                      flex: 1, padding: '6px 0', borderRadius: 5, border: 'none', cursor: 'pointer',
                      background: signal.dir === 'BUY' ? `${C.green}25` : `${C.red}25`,
                      color: signal.dir === 'BUY' ? C.green : C.red,
                      fontSize: 9, fontWeight: 700,
                    }}
                  >
                    {signal.dir === 'BUY' ? '▲ شراء' : '▼ بيع'} @ {signal.entry?.toFixed(2) || priceRef.current?.toFixed(2) || '—'}
                  </button>
                  <button
                    onClick={() => {
                      try {
                        const curPrice = priceRef.current || 0;
                        const openTrades = getOpenPaperTrades();
                        for (const t of openTrades) {
                          closePaperTrade(t.id, curPrice, 'إغلاق يدوي');
                        }
                        setPaperAccountState(getPaperAccount());
                        setPaperTradesList(getPaperTrades().slice(0, 10));
                        setPaperComparison(getPerformanceComparison());
                      } catch { /* Close failed */ }
                    }}
                    style={{
                      padding: '6px 12px', borderRadius: 5, border: 'none', cursor: 'pointer',
                      background: `${C.dim}15`, color: C.dim,
                      fontSize: 8, fontWeight: 600,
                    }}
                  >
                    إغلاق الكل
                  </button>
                </div>
                {getOpenPaperTrades().length > 0 && (
                  <div style={{ marginTop: 4, fontSize: 7.5, color: C.dim }}>
                    صفقات مفتوحة: {getOpenPaperTrades().length} | SL: {signal.sl?.toFixed(2)} | TP: {signal.tp?.toFixed(2)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* SCANNER — Market Scanner (Phase 5) */}
        {tab === 'scanner' && (
          <div style={{ padding: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <div style={{ background: `${C.cyan}08`, border: `1px solid ${C.cyan}20`, borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: C.cyan, fontSize: 9, fontWeight: 700 }}>🔍 فحص السوق — Market Scanner</div>
                <button onClick={async () => { setScanLoading(true); try { const result = await runMarketScan(50, '1h'); setScanResult(result); } catch {} finally { setScanLoading(false); } }} style={{ background: `${C.cyan}20`, border: `1px solid ${C.cyan}40`, color: C.cyan, fontSize: 8, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }} disabled={scanLoading}>
                  {scanLoading ? '⏳ جارٍ الفحص...' : 'فحص الآن'}
                </button>
              </div>
            </div>

            {scanResult ? (
              <>
                {/* Market Overview */}
                <div style={{ background: C.card, borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4 }}>
                    <div style={{ textAlign: 'center' }}><div style={{ color: C.mut, fontSize: 7 }}>صاعد</div><div style={{ color: C.green, fontSize: 10, fontWeight: 700 }}>{scanResult.marketOverview.bullishPct}%</div></div>
                    <div style={{ textAlign: 'center' }}><div style={{ color: C.mut, fontSize: 7 }}>هابط</div><div style={{ color: C.red, fontSize: 10, fontWeight: 700 }}>{scanResult.marketOverview.bearishPct}%</div></div>
                    <div style={{ textAlign: 'center' }}><div style={{ color: C.mut, fontSize: 7 }}>متوسط</div><div style={{ color: C.cyan, fontSize: 10, fontWeight: 700 }}>{scanResult.marketOverview.avgStrength}</div></div>
                    <div style={{ textAlign: 'center' }}><div style={{ color: C.mut, fontSize: 7 }}>مفحوص</div><div style={{ color: C.text, fontSize: 10, fontWeight: 700 }}>{scanResult.totalScanned}</div></div>
                  </div>
                </div>

                {/* Top Bullish */}
                {scanResult.topBullish.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ color: C.green, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>أقوى الإشارات الصاعدة</div>
                    {scanResult.topBullish.slice(0, 5).map((asset, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 8px', borderRadius: 4, background: C.card, marginBottom: 2 }}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <span style={{ fontSize: 8, color: C.green, fontWeight: 700 }}>▲</span>
                          <span style={{ fontSize: 8.5, color: C.text, fontWeight: 600 }}>{asset.symbol.replace('USDT', '')}</span>
                          <span style={{ fontSize: 7, color: C.mut }}>{asset.keyPatternAr}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 8, color: C.green, fontWeight: 600 }}>{asset.strength}%</span>
                          <span style={{ fontSize: 7.5, color: asset.change24h > 0 ? C.green : C.red }}>{asset.change24h > 0 ? '+' : ''}{asset.change24h.toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Top Bearish */}
                {scanResult.topBearish.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ color: C.red, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>أقوى الإشارات الهابطة</div>
                    {scanResult.topBearish.slice(0, 5).map((asset, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 8px', borderRadius: 4, background: C.card, marginBottom: 2 }}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <span style={{ fontSize: 8, color: C.red, fontWeight: 700 }}>▼</span>
                          <span style={{ fontSize: 8.5, color: C.text, fontWeight: 600 }}>{asset.symbol.replace('USDT', '')}</span>
                          <span style={{ fontSize: 7, color: C.mut }}>{asset.keyPatternAr}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 8, color: C.red, fontWeight: 600 }}>{asset.strength}%</span>
                          <span style={{ fontSize: 7.5, color: asset.change24h > 0 ? C.green : C.red }}>{asset.change24h > 0 ? '+' : ''}{asset.change24h.toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Sector Summary */}
                {scanResult.sectorSummary.length > 0 && (
                  <div>
                    <div style={{ color: C.gold, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>ملخص القطاعات</div>
                    {scanResult.sectorSummary.slice(0, 6).map((sector, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 8px', borderRadius: 4, background: C.card, marginBottom: 2 }}>
                        <span style={{ fontSize: 8, color: C.text }}>{sector.labelAr.split('—')[0].trim()}</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <span style={{ fontSize: 7.5, color: C.green }}>{sector.bullishCount}▲</span>
                          <span style={{ fontSize: 7.5, color: C.red }}>{sector.bearishCount}▼</span>
                          <span style={{ fontSize: 7.5, color: C.cyan }}>{Math.round(sector.avgStrength)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: C.mut, fontSize: 8, textAlign: 'center', padding: 20 }}>اضغط "فحص الآن" لفحص 50+ زوج تداول</div>
            )}
          </div>
        )}

        {/* COUNCIL — AI Council Bridge (Phase 5) */}
        {tab === 'council' && (
          <div style={{ padding: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <div style={{ background: `${C.purple}08`, border: `1px solid ${C.purple}20`, borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
              <div style={{ color: C.purple, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>🤖 مجلس AI — توقعات النماذج الحية</div>
              <div style={{ fontSize: 8, color: C.dim }}>يمرر بيانات التحليل الفعلية إلى نماذج الذكاء الاصطناعي ويقارن توقعاتها مع المحركات الخوارزمية.</div>
            </div>

            {/* LIVE Council Model Results — NEW */}
            {councilAnalyses.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ color: C.purple, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>🔬 توقعات النماذج ({councilAnalyses.length} نماذج)</div>
                {councilAnalyses.map((a, i) => {
                  const dirCol = a.direction === 'BUY' ? C.green : a.direction === 'SELL' ? C.red : C.dim;
                  const dirAr = a.direction === 'BUY' ? 'شراء' : a.direction === 'SELL' ? 'بيع' : 'انتظار';
                  const dirIcon = a.direction === 'BUY' ? '▲' : a.direction === 'SELL' ? '▼' : '◆';
                  return (
                    <div key={i} style={{ background: C.card, borderRadius: 5, padding: '6px 8px', marginBottom: 4, borderLeft: `2px solid ${dirCol}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <span style={{ fontSize: 8.5, color: C.text, fontWeight: 600 }}>{a.model}</span>
                        <span style={{ fontSize: 8.5, color: dirCol, fontWeight: 700 }}>{dirIcon} {dirAr}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: a.reasoning ? 3 : 0 }}>
                        <span style={{ fontSize: 7.5, color: C.mut }}>ثقة: {typeof a.confidence === 'number' ? Math.round(a.confidence) : a.confidence}%</span>
                        <div style={{ width: 60, height: 4, background: C.dim + '20', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${typeof a.confidence === 'number' ? a.confidence : 50}%`, height: '100%', background: dirCol, borderRadius: 2 }} />
                        </div>
                      </div>
                      {a.reasoning && (
                        <div style={{ fontSize: 7, color: C.dim, lineHeight: 1.3, maxHeight: 30, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.reasoning.substring(0, 120)}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Current Signal from Council */}
            {signal && councilAnalyses.length > 0 && (
              <div style={{ background: `${signal.dir === 'BUY' ? C.green : signal.dir === 'SELL' ? C.red : C.dim}10`, border: `1px solid ${signal.dir === 'BUY' ? C.green : signal.dir === 'SELL' ? C.red : C.dim}30`, borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: signal.dir === 'BUY' ? C.green : signal.dir === 'SELL' ? C.red : C.dim }}>
                    {signal.dir === 'BUY' ? '▲ إجماع صاعد' : signal.dir === 'SELL' ? '▼ إجماع هابط' : '◆ انتظار'}
                  </span>
                  <span style={{ fontSize: 8, color: C.mut }}>ثقة {Math.round(signal.conf * 100)}%</span>
                </div>
                {signal.bayesianDir && (
                  <div style={{ marginTop: 4, fontSize: 7.5, color: C.dim }}>
                    بايزي: {signal.bayesianDir === 'BUY' ? 'صاعد' : signal.bayesianDir === 'SELL' ? 'هابط' : 'محايد'} ({Math.round((signal.bayesianConf || 0) * 100)}%)
                    {signal.fusionScore !== undefined && ` | تقارب: ${signal.fusionScore}%`}
                  </div>
                )}
              </div>
            )}

            {/* AI vs Algorithm Stats */}
            {aiVsAlgoStats && (
              <div style={{ background: C.card, borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
                <div style={{ color: C.gold, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>إحصائيات المقارنة</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                  <div style={{ textAlign: 'center' }}><div style={{ color: C.mut, fontSize: 7 }}>نجاح AI</div><div style={{ color: C.purple, fontSize: 10, fontWeight: 700 }}>{Math.round(aiVsAlgoStats.aiWinRate * 100)}%</div></div>
                  <div style={{ textAlign: 'center' }}><div style={{ color: C.mut, fontSize: 7 }}>نجاح الخوارزمية</div><div style={{ color: C.cyan, fontSize: 10, fontWeight: 700 }}>{Math.round(aiVsAlgoStats.algoWinRate * 100)}%</div></div>
                  <div style={{ textAlign: 'center' }}><div style={{ color: C.mut, fontSize: 7 }}>نسبة الاتفاق</div><div style={{ color: C.text, fontSize: 10, fontWeight: 700 }}>{Math.round(aiVsAlgoStats.agreementRate * 100)}%</div></div>
                </div>
                {aiVsAlgoStats.totalVerified > 0 && (
                  <div style={{ marginTop: 6, fontSize: 8, color: aiVsAlgoStats.aiBetter ? C.purple : C.cyan, textAlign: 'center' }}>
                    {aiVsAlgoStats.aiBetter ? 'الذكاء الاصطناعي يتفوق حالياً' : 'الخوارزميات تتفوق حالياً'} ({aiVsAlgoStats.totalVerified} توقعات مُتحقق منها)
                  </div>
                )}
              </div>
            )}

            {/* Bridge Payload Preview (collapsed by default — secondary info) */}
            {aiBridgePayload && (
              <details style={{ marginBottom: 10 }}>
                <summary style={{ color: C.cyan, fontSize: 9, fontWeight: 700, cursor: 'pointer', marginBottom: 5 }}>البيانات المُمررة للذكاء الاصطناعي</summary>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 8, marginTop: 5 }}>
                  <div style={{ background: C.card, borderRadius: 4, padding: '3px 6px' }}><span style={{ color: C.mut }}>الرمز:</span> <span style={{ color: C.text }}>{aiBridgePayload.symbol}</span></div>
                  <div style={{ background: C.card, borderRadius: 4, padding: '3px 6px' }}><span style={{ color: C.mut }}>السعر:</span> <span style={{ color: C.text }}>{aiBridgePayload.currentPrice.toFixed(2)}</span></div>
                  <div style={{ background: C.card, borderRadius: 4, padding: '3px 6px' }}><span style={{ color: C.mut }}>النظام:</span> <span style={{ color: C.text }}>{aiBridgePayload.regime}</span></div>
                  <div style={{ background: C.card, borderRadius: 4, padding: '3px 6px' }}><span style={{ color: C.mut }}>بايزي:</span> <span style={{ color: aiBridgePayload.bayesian.direction === 'bullish' ? C.green : aiBridgePayload.bayesian.direction === 'bearish' ? C.red : C.dim }}>{aiBridgePayload.bayesian.direction} ({Math.round(aiBridgePayload.bayesian.confidence * 100)}%)</span></div>
                  <div style={{ background: C.card, borderRadius: 4, padding: '3px 6px' }}><span style={{ color: C.mut }}>SMC OBs:</span> <span style={{ color: C.text }}>{aiBridgePayload.smcSummary.orderBlocks}</span></div>
                  <div style={{ background: C.card, borderRadius: 4, padding: '3px 6px' }}><span style={{ color: C.mut }}>MTF:</span> <span style={{ color: C.text }}>{aiBridgePayload.mtfConfluence.score}%</span></div>
                  <div style={{ background: C.card, borderRadius: 4, padding: '3px 6px' }}><span style={{ color: C.mut }}>ويكوف:</span> <span style={{ color: C.text }}>{aiBridgePayload.wyckoffSummary.scheme}</span></div>
                  <div style={{ background: C.card, borderRadius: 4, padding: '3px 6px' }}><span style={{ color: C.mut }}>إليوت:</span> <span style={{ color: C.text }}>{aiBridgePayload.elliottSummary.dominantDirection}</span></div>
                </div>
                {aiBridgePayload.keyPatterns.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ color: C.green, fontSize: 8, fontWeight: 600, marginBottom: 3 }}>الأنماط:</div>
                    {aiBridgePayload.keyPatterns.map((p, i) => {
                      const col = p.direction === 'bullish' ? C.green : p.direction === 'bearish' ? C.red : C.dim;
                      return (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 6px', borderRadius: 3, background: C.card, marginBottom: 1 }}>
                          <span style={{ fontSize: 7.5, color: col }}>{p.direction === 'bullish' ? '▲' : '▼'} {p.labelAr}</span>
                          <span style={{ fontSize: 7, color: C.mut }}>{Math.round(p.confidence * 100)}%</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </details>
            )}

            {!aiBridgePayload && councilAnalyses.length === 0 && (
              <div style={{ color: C.mut, fontSize: 8, textAlign: 'center', padding: 20 }}>شغّل التحليل أولاً لرؤية بيانات مجلس AI</div>
            )}
          </div>
        )}

        {/* ═══ Revolutionary: Visual Backtest ═══ */}
        {tab === 'backtest' && (
          <div style={{ padding: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <div style={{ background: `${C.blue}08`, border: `1px solid ${C.blue}20`, borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
              <div style={{ color: C.blue, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>⏪ اختبار بصري — Visual Backtest</div>
              <div style={{ fontSize: 8, color: C.dim }}>يعيد تشغيل الإشارات التاريخية ويتتبع ربحيتها. أخضر = إشارة صحيحة، أحمر = خاطئة، أصفر = قيد الانتظار.</div>
            </div>

            {backtestStats && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginBottom: 10 }}>
                <div style={{ background: `${C.green}10`, border: `1px solid ${C.green}30`, borderRadius: 5, padding: '6px 8px', textAlign: 'center' }}>
                  <div style={{ color: C.mut, fontSize: 7 }}>نسبة النجاح</div>
                  <div style={{ color: C.green, fontSize: 14, fontWeight: 800, fontFamily: "var(--font-mono)" }}>{Math.round(backtestStats.winRate * 100)}%</div>
                </div>
                <div style={{ background: `${C.cyan}10`, border: `1px solid ${C.cyan}30`, borderRadius: 5, padding: '6px 8px', textAlign: 'center' }}>
                  <div style={{ color: C.mut, fontSize: 7 }}>إجمالي الإشارات</div>
                  <div style={{ color: C.cyan, fontSize: 14, fontWeight: 800, fontFamily: "var(--font-mono)" }}>{backtestStats.totalSignals}</div>
                </div>
                <div style={{ background: `${C.gold}10`, border: `1px solid ${C.gold}30`, borderRadius: 5, padding: '6px 8px', textAlign: 'center' }}>
                  <div style={{ color: C.mut, fontSize: 7 }}>متوسط الربح</div>
                  <div style={{ color: C.gold, fontSize: 14, fontWeight: 800, fontFamily: "var(--font-mono)" }}>{backtestStats.avgPnLPct.toFixed(2)}%</div>
                </div>
              </div>
            )}

            {backtestStats && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 3, marginBottom: 10 }}>
                <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                  <div style={{ color: C.green, fontSize: 9, fontWeight: 700 }}>{backtestStats.wins}</div>
                  <div style={{ color: C.mut, fontSize: 7 }}>نجاح</div>
                </div>
                <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                  <div style={{ color: C.red, fontSize: 9, fontWeight: 700 }}>{backtestStats.losses}</div>
                  <div style={{ color: C.mut, fontSize: 7 }}>خسارة</div>
                </div>
                <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                  <div style={{ color: C.yellow, fontSize: 9, fontWeight: 700 }}>{backtestStats.breakevens}</div>
                  <div style={{ color: C.mut, fontSize: 7 }}>تعادل</div>
                </div>
                <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                  <div style={{ color: C.dim, fontSize: 9, fontWeight: 700 }}>{backtestStats.pending}</div>
                  <div style={{ color: C.mut, fontSize: 7 }}>منتظرة</div>
                </div>
              </div>
            )}

            {/* Per-source win rates */}
            {backtestStats && Object.entries(backtestStats.bySource).length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ color: C.blue, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>📊 نسبة النجاح حسب المصدر</div>
                {Object.entries(backtestStats.bySource).sort((a, b) => b[1].winRate - a[1].winRate).map(([source, stats]: [string, any]) => (
                  <div key={source} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, padding: '3px 6px', background: C.card, borderRadius: 4 }}>
                    <span style={{ fontSize: 8, color: C.text, fontWeight: 600, flex: 1 }}>{source}</span>
                    <div style={{ width: 50, height: 5, background: C.dim + '20', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${stats.winRate * 100}%`, height: '100%', background: stats.winRate > 0.6 ? C.green : stats.winRate > 0.4 ? C.yellow : C.red, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: stats.winRate > 0.6 ? C.green : stats.winRate > 0.4 ? C.yellow : C.red, fontWeight: 700, width: 32, textAlign: 'right' }}>{Math.round(stats.winRate * 100)}%</span>
                    <span style={{ fontSize: 7, color: C.mut, width: 20, textAlign: 'right' }}>({stats.total})</span>
                  </div>
                ))}
              </div>
            )}

            {/* Recent backtest signals */}
            {backtestSignals.length > 0 && (
              <div>
                <div style={{ color: C.blue, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>📋 آخر الإشارات المُختبرة</div>
                {backtestSignals.slice(0, 15).map((s, i) => {
                  const outCol = s.outcome === 'win' ? C.green : s.outcome === 'loss' ? C.red : s.outcome === 'breakeven' ? C.yellow : C.dim;
                  const outAr = s.outcome === 'win' ? '✓ نجاح' : s.outcome === 'loss' ? '✗ خسارة' : s.outcome === 'breakeven' ? '◆ تعادل' : '⏳ منتظرة';
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 6px', background: C.card, borderRadius: 4, marginBottom: 2, borderLeft: `2px solid ${outCol}` }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 8, color: s.direction === 'bullish' ? C.green : s.direction === 'bearish' ? C.red : C.dim }}>{s.direction === 'bullish' ? '▲' : '▼'}</span>
                        <span style={{ fontSize: 7.5, color: C.text }}>{s.source}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 7, color: C.mut }}>{s.pnlPct >= 0 ? '+' : ''}{s.pnlPct.toFixed(2)}%</span>
                        <span style={{ fontSize: 7.5, color: outCol, fontWeight: 700 }}>{outAr}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!backtestStats && <div style={{ color: C.mut, fontSize: 8, textAlign: 'center', padding: 20 }}>شغّل التحليل أولاً لرؤية نتائج الاختبار البصري</div>}
          </div>
        )}

        {/* ═══ Revolutionary: Confluence Zones ═══ */}
        {tab === 'confluence' && (
          <div style={{ padding: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <div style={{ background: `${C.gold}08`, border: `1px solid ${C.gold}20`, borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
              <div style={{ color: C.gold, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>🎯 مناطق التقارب — Confluence Zones</div>
              <div style={{ fontSize: 8, color: C.dim }}>يحدد المناطق التي تتفق فيها عدة محركات تحليل على نفس مستوى السعر. كلما زاد عدد الإشارات المتفقّة، زادت قوة المنطقة.</div>
            </div>

            {confluenceZones.length > 0 ? (
              <div>
                <div style={{ color: C.gold, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>📍 المناطق المكتشفة ({confluenceZones.length})</div>
                {confluenceZones.sort((a, b) => b.score - a.score).map((z, i) => {
                  const strengthCol = z.strength === 'extreme' ? C.red : z.strength === 'strong' ? C.gold : z.strength === 'moderate' ? C.cyan : C.dim;
                  const strengthAr = z.strength === 'extreme' ? 'قصوى' : z.strength === 'strong' ? 'قوية' : z.strength === 'moderate' ? 'متوسطة' : 'ضعيفة';
                  return (
                    <div key={z.id} style={{ background: C.card, borderRadius: 5, padding: '6px 8px', marginBottom: 6, borderLeft: `3px solid ${strengthCol}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                          <span style={{ fontSize: 8.5, color: z.direction === 'bullish' ? C.green : z.direction === 'bearish' ? C.red : C.dim, fontWeight: 700 }}>
                            {z.direction === 'bullish' ? '▲ صاعد' : z.direction === 'bearish' ? '▼ هابط' : '◆ محايد'}
                          </span>
                          <span style={{ fontSize: 8, color: strengthCol, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: strengthCol + '15' }}>{strengthAr}</span>
                        </div>
                        <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: C.text, fontWeight: 700 }}>{z.price.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                        <div style={{ flex: 1, background: `${C.gold}08`, borderRadius: 3, padding: '2px 4px', textAlign: 'center' }}>
                          <div style={{ color: C.gold, fontSize: 9, fontWeight: 700 }}>{z.score}%</div>
                          <div style={{ color: C.mut, fontSize: 6.5 }}>تقارب</div>
                        </div>
                        <div style={{ flex: 1, background: `${C.cyan}08`, borderRadius: 3, padding: '2px 4px', textAlign: 'center' }}>
                          <div style={{ color: C.cyan, fontSize: 9, fontWeight: 700 }}>{z.signalCount}</div>
                          <div style={{ color: C.mut, fontSize: 6.5 }}>إشارات</div>
                        </div>
                        <div style={{ flex: 1, background: `${C.purple}08`, borderRadius: 3, padding: '2px 4px', textAlign: 'center' }}>
                          <div style={{ color: C.purple, fontSize: 9, fontWeight: 700 }}>{z.distancePct.toFixed(1)}%</div>
                          <div style={{ color: C.mut, fontSize: 6.5 }}>مسافة</div>
                        </div>
                      </div>
                      {/* Signals in this zone */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                        {z.signals.map((sig, j) => (
                          <span key={j} style={{ fontSize: 7, padding: '1px 4px', borderRadius: 2, background: (sig.direction === 'bullish' ? C.green : sig.direction === 'bearish' ? C.red : C.dim) + '15', color: sig.direction === 'bullish' ? C.green : sig.direction === 'bearish' ? C.red : C.dim }}>
                            {sig.labelAr}
                          </span>
                        ))}
                      </div>
                      {z.isActive && <div style={{ marginTop: 3, fontSize: 7.5, color: C.gold, fontWeight: 700 }}>⚡ السعر قريب من هذه المنطقة</div>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: C.mut, fontSize: 8, textAlign: 'center', padding: 20 }}>شغّل التحليل أولاً لرؤية مناطق التقارب</div>
            )}
          </div>
        )}

        {/* ═══ Revolutionary: AI Explanation (Why?) ═══ */}
        {tab === 'explain' && (
          <div style={{ padding: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <div style={{ background: `${C.purple}08`, border: `1px solid ${C.purple}20`, borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
              <div style={{ color: C.purple, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>❓ لماذا؟ — AI Explanation</div>
              <div style={{ fontSize: 8, color: C.dim }}>اضغط على أي إشارة لمعرفة لماذا تم تفعيلها، ما البيانات الداعمة، وما الذي يُبطله أو يؤكده.</div>
            </div>

            {/* Signal selector */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ color: C.purple, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>اختر إشارة للشرح:</div>
              <div style={{ maxHeight: 120, overflowY: 'auto' }}>
                {patterns.filter(p => p.direction !== 'neutral').slice(0, 20).map((p, i) => {
                  const isSelected = explainSource === `${p.type}_${i}`;
                  const col = p.direction === 'bullish' ? C.green : C.red;
                  return (
                    <button key={i} onClick={() => {
                      const src = `${p.type}_${i}`;
                      setExplainSource(src);
                      try {
                        const explanation = explainSignal({
                          source: p.type || 'unknown',
                          direction: p.direction as 'bullish' | 'bearish',
                          confidence: p.confidence,
                          price: p.price || 0,
                          regime: volRegime,
                          allSignals: patterns.filter(rp => rp.direction !== 'neutral' && rp.type !== p.type).slice(0, 5).map(rp => ({
                            source: rp.type || 'unknown',
                            direction: rp.direction as 'bullish' | 'bearish',
                            confidence: rp.confidence,
                          })),
                        });
                        setSignalExplanation(explanation);
                      } catch { setSignalExplanation(null); }
                    }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '4px 8px', borderRadius: 4, border: `1px solid ${isSelected ? C.purple : C.border}`, background: isSelected ? `${C.purple}15` : C.card, color: C.text, fontSize: 8, cursor: 'pointer', outline: 'none', marginBottom: 2, fontFamily: 'inherit', textAlign: 'left' }}>
                      <span style={{ color: col, fontWeight: 600 }}>{p.direction === 'bullish' ? '▲' : '▼'} {p.type}</span>
                      <span style={{ color: C.mut, fontSize: 7 }}>{Math.round(p.confidence * 100)}%</span>
                    </button>
                  );
                })}
                {patterns.filter(p => p.direction !== 'neutral').length === 0 && (
                  <div style={{ color: C.mut, fontSize: 8, padding: 10, textAlign: 'center' }}>لا توجد إشارات بعد — شغّل التحليل أولاً</div>
                )}
              </div>
            </div>

            {/* Explanation result */}
            {signalExplanation && (
              <div>
                <div style={{ background: C.card, borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <span style={{ color: signalExplanation.signal.direction === 'bullish' ? C.green : signalExplanation.signal.direction === 'bearish' ? C.red : C.dim, fontSize: 10, fontWeight: 800 }}>
                      {signalExplanation.signal.direction === 'bullish' ? '▲ صاعد' : signalExplanation.signal.direction === 'bearish' ? '▼ هابط' : '◆ محايد'}
                    </span>
                    <span style={{ color: C.purple, fontSize: 9, fontWeight: 700 }}>{signalExplanation.signal.source}</span>
                  </div>
                  <div style={{ fontSize: 8.5, color: C.text, lineHeight: 1.5, marginBottom: 6 }}>{signalExplanation.explanationAr}</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <span style={{ fontSize: 7.5, padding: '2px 5px', borderRadius: 3, background: `${C.green}10`, color: C.green, border: `1px solid ${C.green}30` }}>✓ تأكيد: {signalExplanation.confirmationAr}</span>
                    <span style={{ fontSize: 7.5, padding: '2px 5px', borderRadius: 3, background: `${C.red}10`, color: C.red, border: `1px solid ${C.red}30` }}>✗ إبطال: {signalExplanation.invalidationAr}</span>
                  </div>
                </div>

                {/* Factors */}
                {signalExplanation.factors.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: C.cyan, fontSize: 9, fontWeight: 700, marginBottom: 4 }}>🔧 العوامل المؤثرة</div>
                    {signalExplanation.factors.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 6px', background: C.card, borderRadius: 4, marginBottom: 2 }}>
                        <span style={{ fontSize: 7, color: f.supports ? C.green : C.red }}>{f.supports ? '✓' : '✗'}</span>
                        <span style={{ fontSize: 7.5, color: C.text, flex: 1 }}>{f.nameAr}: {f.contributionAr}</span>
                        <div style={{ width: 30, height: 4, background: C.dim + '20', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${f.weight * 100}%`, height: '100%', background: f.supports ? C.green : C.red, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Related signals */}
                {signalExplanation.relatedSignals.length > 0 && (
                  <div>
                    <div style={{ color: C.gold, fontSize: 9, fontWeight: 700, marginBottom: 4 }}>🔗 إشارات مرتبطة</div>
                    {signalExplanation.relatedSignals.map((rs, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 6px', background: C.card, borderRadius: 3, marginBottom: 1 }}>
                        <span style={{ fontSize: 7.5, color: rs.agrees ? C.green : C.red }}>{rs.agrees ? '✓' : '✗'} {rs.labelAr}</span>
                        <span style={{ fontSize: 7, color: C.mut }}>{rs.direction === 'bullish' ? 'صاعد' : rs.direction === 'bearish' ? 'هابط' : 'محايد'}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Risk level */}
                <div style={{ marginTop: 8, padding: '4px 8px', borderRadius: 4, background: signalExplanation.riskLevel === 'low' ? `${C.green}08` : signalExplanation.riskLevel === 'medium' ? `${C.yellow}08` : `${C.red}08`, border: `1px solid ${signalExplanation.riskLevel === 'low' ? C.green : signalExplanation.riskLevel === 'medium' ? C.yellow : C.red}30` }}>
                  <span style={{ fontSize: 8, color: signalExplanation.riskLevel === 'low' ? C.green : signalExplanation.riskLevel === 'medium' ? C.yellow : C.red, fontWeight: 700 }}>
                    مستوى المخاطرة: {signalExplanation.riskLevel === 'low' ? 'منخفض' : signalExplanation.riskLevel === 'medium' ? 'متوسط' : 'مرتفع'}
                  </span>
                  {signalExplanation.historicalWinRate !== null && (
                    <span style={{ fontSize: 7.5, color: C.dim, marginRight: 8 }}>| تاريخياً: {Math.round(signalExplanation.historicalWinRate * 100)}% نجاح</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ Revolutionary: Correlation Engine ═══ */}
        {tab === 'correlate' && (
          <div style={{ padding: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <div style={{ background: `${C.cyan}08`, border: `1px solid ${C.cyan}20`, borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
              <div style={{ color: C.cyan, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>🔗 محرك الارتباط — Correlation Engine</div>
              <div style={{ fontSize: 8, color: C.dim }}>يتتبع أي مجموعات الإشارات تعمل أفضل معاً. يعلم أن "BOS صاعد + ويكوف تراكم" نسبة نجاحها 72% بينما "BOS صاعد وحده" 54% فقط.</div>
            </div>

            {correlationMatrix && (
              <>
                {/* Top Combinations */}
                {correlationMatrix.topCombinations.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ color: C.gold, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>🏆 أفضل التركيبات</div>
                    {correlationMatrix.topCombinations.map((combo, i) => {
                      const col = combo.direction === 'bullish' ? C.green : C.red;
                      return (
                        <div key={i} style={{ background: C.card, borderRadius: 5, padding: '6px 8px', marginBottom: 4, borderLeft: `3px solid ${col}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                              {combo.sources.map((s, j) => (
                                <span key={j} style={{ fontSize: 7, padding: '1px 4px', borderRadius: 2, background: `${C.cyan}15`, color: C.cyan }}>{s}</span>
                              ))}
                            </div>
                            <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: col, fontWeight: 800 }}>{Math.round(combo.winRate * 100)}%</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 7.5, color: C.dim }}>{combo.descriptionAr}</span>
                            <span style={{ fontSize: 7, color: C.mut }}>({combo.sampleSize} عينة)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pairwise Correlations */}
                {correlationMatrix.correlations.length > 0 && (
                  <div>
                    <div style={{ color: C.cyan, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>📊 ارتباطات ثنائية</div>
                    {correlationMatrix.correlations
                      .filter(c => c.sampleSize >= 2)
                      .sort((a, b) => b.lift - a.lift)
                      .slice(0, 15)
                      .map((corr, i) => {
                        const liftCol = corr.lift > 1.3 ? C.green : corr.lift > 1.0 ? C.cyan : corr.lift > 0.8 ? C.yellow : C.red;
                        return (
                          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto auto', gap: 4, padding: '3px 6px', background: C.card, borderRadius: 4, marginBottom: 2, alignItems: 'center' }}>
                            <span style={{ fontSize: 7.5, color: C.text, fontWeight: 600 }}>{corr.sourceA}</span>
                            <span style={{ fontSize: 8, color: C.mut }}>×</span>
                            <span style={{ fontSize: 7.5, color: C.text, fontWeight: 600 }}>{corr.sourceB}</span>
                            <span style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: liftCol, fontWeight: 700 }}>×{corr.lift.toFixed(2)}</span>
                            <span style={{ fontSize: 7, color: C.mut }}>{Math.round(corr.combinedWinRate * 100)}%</span>
                          </div>
                        );
                      })}
                  </div>
                )}

                {correlationMatrix.correlations.length === 0 && correlationMatrix.topCombinations.length === 0 && (
                  <div style={{ color: C.mut, fontSize: 8, textAlign: 'center', padding: 20 }}>تحتاج بيانات أكثر لبناء ارتباطات — استخدم التحليل لعدة شموع</div>
                )}
              </>
            )}

            {!correlationMatrix && <div style={{ color: C.mut, fontSize: 8, textAlign: 'center', padding: 20 }}>شغّل التحليل أولاً لرؤية الارتباطات</div>}
          </div>
        )}

        {/* ═══ Revolutionary: Predictive Pattern Completion ═══ */}
        {tab === 'predict' && (
          <div style={{ padding: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <div style={{ background: `${C.red}08`, border: `1px solid ${C.red}20`, borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
              <div style={{ color: '#ff6b6b', fontSize: 9, fontWeight: 700, marginBottom: 5 }}>🔮 توقع اكتمال الأنماط — Predictive Completion</div>
              <div style={{ fontSize: 8, color: C.dim }}>عندما يكون النمط مكتمل جزئياً، يتنبأ هذا المحرك أين ستكتمل النقاط المتبقية. يمكنك الاستعداد قبل اكتمال النمط والدخول بأسعار أفضل.</div>
            </div>

            {patternPredictions.length > 0 ? (
              <div>
                <div style={{ color: '#ff6b6b', fontSize: 9, fontWeight: 700, marginBottom: 5 }}>🔮 أنماط قيد التشكّل ({patternPredictions.length})</div>
                {patternPredictions.map((pred, i) => {
                  const dirCol = pred.predictedDirection === 'bullish' ? C.green : C.red;
                  const completionCol = pred.completionPct >= 80 ? C.green : pred.completionPct >= 60 ? C.yellow : C.cyan;
                  return (
                    <div key={i} style={{ background: C.card, borderRadius: 6, padding: '8px 10px', marginBottom: 8, borderLeft: `3px solid ${dirCol}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                          <span style={{ fontSize: 9, color: dirCol, fontWeight: 800 }}>{pred.predictedDirection === 'bullish' ? '▲' : '▼'} {pred.patternTypeAr}</span>
                          <span style={{ fontSize: 7.5, color: C.mut }}>({pred.patternType})</span>
                        </div>
                        <span style={{ fontSize: 8, color: completionCol, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: completionCol + '15' }}>{Math.round(pred.completionPct)}% مكتمل</span>
                      </div>

                      {/* Completion progress bar */}
                      <div style={{ width: '100%', height: 6, background: C.dim + '20', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                        <div style={{ width: `${pred.completionPct}%`, height: '100%', background: `linear-gradient(90deg, ${C.cyan}, ${completionCol})`, borderRadius: 3, transition: 'width 0.3s' }} />
                      </div>

                      <div style={{ fontSize: 8, color: C.dim, lineHeight: 1.5, marginBottom: 5 }}>{pred.descriptionAr}</div>

                      {/* Completion Zone */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3, marginBottom: 5 }}>
                        <div style={{ background: `${dirCol}08`, borderRadius: 3, padding: '3px 5px', textAlign: 'center' }}>
                          <div style={{ color: C.mut, fontSize: 6.5 }}>منطقة الاكتمال</div>
                          <div style={{ color: dirCol, fontSize: 8.5, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{pred.completionZone.center.toFixed(2)}</div>
                        </div>
                        <div style={{ background: `${C.cyan}08`, borderRadius: 3, padding: '3px 5px', textAlign: 'center' }}>
                          <div style={{ color: C.mut, fontSize: 6.5 }}>حد أعلى</div>
                          <div style={{ color: C.cyan, fontSize: 8.5, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{pred.completionZone.high.toFixed(2)}</div>
                        </div>
                        <div style={{ background: `${C.purple}08`, borderRadius: 3, padding: '3px 5px', textAlign: 'center' }}>
                          <div style={{ color: C.mut, fontSize: 6.5 }}>حد أدنى</div>
                          <div style={{ color: C.purple, fontSize: 8.5, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{pred.completionZone.low.toFixed(2)}</div>
                        </div>
                      </div>

                      {/* Predicted Points */}
                      {pred.predictedPoints.length > 0 && (
                        <div>
                          <div style={{ color: C.gold, fontSize: 8, fontWeight: 700, marginBottom: 3 }}>النقاط المتوقعة:</div>
                          {pred.predictedPoints.map((pt, j) => (
                            <div key={j} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 5px', background: C.dim + '05', borderRadius: 3, marginBottom: 1 }}>
                              <span style={{ fontSize: 7.5, color: dirCol, fontWeight: 600 }}>النقطة {pt.label}</span>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <span style={{ fontSize: 7.5, color: C.text, fontFamily: "var(--font-mono)" }}>{pt.price.toFixed(2)}</span>
                                <span style={{ fontSize: 7, color: C.mut }}>ثقة {Math.round(pt.confidence * 100)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ marginTop: 4, fontSize: 7.5, color: C.mut }}>
                        ⏱ تقدير: ~{pred.estimatedCandlesToCompletion} شمعة | ثقة التوقع: {Math.round(pred.confidence * 100)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: C.mut, fontSize: 8, textAlign: 'center', padding: 20 }}>
                {patterns.length > 0 ? 'لا توجد أنماط قيد التشكّل حالياً — جرب فترات زمنية مختلفة' : 'شغّل التحليل أولاً لرؤية توقعات الأنماط'}
              </div>
            )}
          </div>
        )}

        {/* ═══ Revolutionary #6: Adaptive Intelligence ═══ */}
        {tab === 'intelligence' && (
          <div style={{ padding: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <div style={{ background: `${C.purple}08`, border: `1px solid ${C.purple}20`, borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
              <div style={{ color: C.purple, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>🔬 الذكاء التكيفي — Adaptive Intelligence</div>
              <div style={{ fontSize: 8, color: C.dim }}>يتعلم النظام من أداء كل محرك تحليل ويُعدّل أوزانه تلقائياً. كلما تداولت أكثر، أصبحت التوقعات أدق.</div>
            </div>

            {adaptiveIntelligence ? (
              <div>
                {/* Summary Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 8 }}>
                  <div style={{ background: C.card, borderRadius: 4, padding: '5px 6px', textAlign: 'center' }}>
                    <div style={{ color: C.mut, fontSize: 6.5 }}>إجمالي التوقعات</div>
                    <div style={{ color: C.text, fontSize: 11, fontWeight: 700 }}>{adaptiveIntelligence.totalPredictions}</div>
                  </div>
                  <div style={{ background: C.card, borderRadius: 4, padding: '5px 6px', textAlign: 'center' }}>
                    <div style={{ color: C.mut, fontSize: 6.5 }}>معدل الفوز</div>
                    <div style={{ color: adaptiveIntelligence.overallWinRate > 0.5 ? C.green : C.red, fontSize: 11, fontWeight: 700 }}>{Math.round(adaptiveIntelligence.overallWinRate * 100)}%</div>
                  </div>
                  <div style={{ background: C.card, borderRadius: 4, padding: '5px 6px', textAlign: 'center' }}>
                    <div style={{ color: C.mut, fontSize: 6.5 }}>أفضل محرك</div>
                    <div style={{ color: C.gold, fontSize: 9, fontWeight: 700 }}>{adaptiveIntelligence.bestSource || '—'}</div>
                  </div>
                </div>

                {/* Source Performance Table */}
                <div style={{ color: C.cyan, fontSize: 8.5, fontWeight: 700, marginBottom: 4 }}>أداء المحركات</div>
                {adaptiveIntelligence.sources.length > 0 ? adaptiveIntelligence.sources.map((src, i) => (
                  <div key={i} style={{ background: C.card, borderRadius: 5, padding: '6px 8px', marginBottom: 4, borderLeft: `3px solid ${src.isHot ? C.green : src.emaWinRate < 0.4 ? C.red : C.dim}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <span style={{ fontSize: 8, color: src.isHot ? C.green : C.text, fontWeight: 700 }}>{src.source}</span>
                        {src.isHot && <span style={{ fontSize: 7, color: C.green, fontWeight: 800 }}>🔥</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <span style={{ fontSize: 7.5, color: src.emaWinRate > 0.5 ? C.green : C.red, fontWeight: 700 }}>فوز: {Math.round(src.emaWinRate * 100)}%</span>
                        <span style={{ fontSize: 7.5, color: C.cyan, fontWeight: 600 }}>وزن: {src.adaptiveWeight.toFixed(2)}</span>
                      </div>
                    </div>
                    {/* Weight bar */}
                    <div style={{ width: '100%', height: 4, background: C.dim + '15', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, (src.adaptiveWeight / 3) * 100)}%`, height: '100%', background: `linear-gradient(90deg, ${C.red}, ${C.yellow}, ${C.green})`, borderRadius: 2 }} />
                    </div>
                  </div>
                )) : (
                  <div style={{ color: C.mut, fontSize: 8, textAlign: 'center', padding: 15 }}>لا توجد بيانات أداء بعد — استمر في التحليل لتجميع البيانات</div>
                )}

                {/* Regime Recommendation */}
                {adaptiveIntelligence.regimeRecommendation && (
                  <div style={{ background: `${C.gold}08`, borderRadius: 5, padding: '6px 8px', marginTop: 8, border: `1px solid ${C.gold}20` }}>
                    <div style={{ color: C.gold, fontSize: 8, fontWeight: 700, marginBottom: 3 }}>🎯 توصية حسب نظام السوق</div>
                    <div style={{ fontSize: 7.5, color: C.dim, lineHeight: 1.6 }}>{adaptiveIntelligence.regimeRecommendation.messageAr}</div>
                  </div>
                )}

                {/* Recent Insights */}
                {adaptiveIntelligence.insights.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ color: C.cyan, fontSize: 8.5, fontWeight: 700, marginBottom: 4 }}>رؤى التعلم</div>
                    {adaptiveIntelligence.insights.slice(-5).reverse().map((ins, i) => (
                      <div key={i} style={{ background: C.card, borderRadius: 4, padding: '4px 6px', marginBottom: 2, borderLeft: `2px solid ${ins.importance === 'critical' ? C.red : ins.importance === 'warning' ? C.yellow : C.cyan}` }}>
                        <div style={{ fontSize: 7.5, color: C.dim, lineHeight: 1.5 }}>{ins.messageAr}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: C.mut, fontSize: 8, textAlign: 'center', padding: 20 }}>شغّل التحليل أولاً لتشغيل الذكاء التكيفي</div>
            )}
          </div>
        )}

        {/* ═══ Revolutionary #7: Scenario Engine ═══ */}
        {tab === 'scenario' && (
          <div style={{ padding: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <div style={{ background: `${C.blue}08`, border: `1px solid ${C.blue}20`, borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
              <div style={{ color: C.blue, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>🎲 محرك السيناريوهات — What If?</div>
              <div style={{ fontSize: 8, color: C.dim }}>لا يتوقع اتجاه واحد فقط — يحسب عدّة سيناريوهات محتملة مع احتمالاتها وأهدافها السعرية ومستويات الإبطال.</div>
            </div>

            {scenarioResult ? (
              <div>
                {/* Tilt indicator */}
                <div style={{ background: C.card, borderRadius: 5, padding: '6px 8px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: 8, color: C.mut }}>الميل: </span>
                    <span style={{ fontSize: 10, color: scenarioResult.tiltDirection === 'bullish' ? C.green : scenarioResult.tiltDirection === 'bearish' ? C.red : C.yellow, fontWeight: 800 }}>
                      {scenarioResult.tiltDirection === 'bullish' ? '▲ صاعد' : scenarioResult.tiltDirection === 'bearish' ? '▼ هابط' : '◆ محايد'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 7.5, color: C.dim }}>قوة: {Math.round(scenarioResult.tiltStrength * 100)}%</span>
                    <span style={{ fontSize: 7.5, color: scenarioResult.expectedValue > 0 ? C.green : C.red }}>EV: {scenarioResult.expectedValue > 0 ? '+' : ''}{scenarioResult.expectedValue}</span>
                  </div>
                </div>

                {/* Key Level */}
                <div style={{ background: `${C.gold}08`, borderRadius: 4, padding: '4px 6px', marginBottom: 8, textAlign: 'center' }}>
                  <span style={{ fontSize: 7.5, color: C.mut }}>المستوى الحرج: </span>
                  <span style={{ fontSize: 9, color: C.gold, fontWeight: 700 }}>{scenarioResult.keyLevel}</span>
                  <span style={{ fontSize: 7, color: C.mut }}> ({scenarioResult.keyLevelType === 'support' ? 'دعم' : scenarioResult.keyLevelType === 'resistance' ? 'مقاومة' : 'محوري'})</span>
                </div>

                {/* Scenarios */}
                <div style={{ color: C.cyan, fontSize: 8.5, fontWeight: 700, marginBottom: 4 }}>السيناريوهات المحتملة</div>
                {scenarioResult.scenarios.sort((a, b) => b.probability - a.probability).map((sc, i) => {
                  const isBull = sc.type.includes('bullish') || sc.type === 'trap_bear';
                  const dirCol = isBull ? C.green : C.red;
                  const isDominant = sc.type === scenarioResult.dominantScenario;
                  return (
                    <div key={i} style={{ background: C.card, borderRadius: 5, padding: '6px 8px', marginBottom: 5, borderLeft: `3px solid ${dirCol}`, border: isDominant ? `1px solid ${dirCol}40` : undefined }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <span style={{ fontSize: 9, color: dirCol, fontWeight: 800 }}>{isBull ? '▲' : '▼'} {sc.nameAr}</span>
                          {isDominant && <span style={{ fontSize: 7, color: C.gold, fontWeight: 700, background: `${C.gold}15`, padding: '1px 4px', borderRadius: 3 }}>الأرجح</span>}
                        </div>
                        <span style={{ fontSize: 9, color: C.text, fontWeight: 700 }}>{Math.round(sc.probability * 100)}%</span>
                      </div>
                      {/* Probability bar */}
                      <div style={{ width: '100%', height: 5, background: C.dim + '15', borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
                        <div style={{ width: `${sc.probability * 100}%`, height: '100%', background: dirCol, borderRadius: 3 }} />
                      </div>
                      <div style={{ fontSize: 7.5, color: C.dim, lineHeight: 1.5, marginBottom: 4 }}>{sc.descriptionAr}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3 }}>
                        <div style={{ background: `${dirCol}08`, borderRadius: 3, padding: '3px 5px', textAlign: 'center' }}>
                          <div style={{ color: C.mut, fontSize: 6.5 }}>الهدف</div>
                          <div style={{ color: dirCol, fontSize: 8, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{sc.priceTarget}</div>
                        </div>
                        <div style={{ background: `${C.red}08`, borderRadius: 3, padding: '3px 5px', textAlign: 'center' }}>
                          <div style={{ color: C.mut, fontSize: 6.5 }}>إبطال</div>
                          <div style={{ color: C.red, fontSize: 8, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{sc.invalidationLevel}</div>
                        </div>
                        <div style={{ background: `${C.cyan}08`, borderRadius: 3, padding: '3px 5px', textAlign: 'center' }}>
                          <div style={{ color: C.mut, fontSize: 6.5 }}>R:R</div>
                          <div style={{ color: C.cyan, fontSize: 8, fontWeight: 700, fontFamily: "var(--font-mono)" }}>1:{sc.riskRewardRatio}</div>
                        </div>
                      </div>
                      {/* Confirming / Contradicting signals */}
                      {sc.keySignals.length > 0 && (
                        <div style={{ marginTop: 3, fontSize: 7, color: C.green }}>✓ {sc.keySignals.join(' • ')}</div>
                      )}
                      {sc.contradictingSignals.length > 0 && (
                        <div style={{ fontSize: 7, color: C.red }}>✗ {sc.contradictingSignals.join(' • ')}</div>
                      )}
                    </div>
                  );
                })}

                {/* Warnings */}
                {scenarioResult.warnings.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {scenarioResult.warnings.map((w, i) => (
                      <div key={i} style={{ background: `${C.yellow}08`, borderRadius: 4, padding: '4px 6px', marginBottom: 2, fontSize: 7.5, color: C.yellow }}>⚠️ {w}</div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: C.mut, fontSize: 8, textAlign: 'center', padding: 20 }}>شغّل التحليل أولاً لرؤية السيناريوهات</div>
            )}
          </div>
        )}

        {/* ═══ Revolutionary #8: Spring Detection ═══ */}
        {tab === 'spring' && (
          <div style={{ padding: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <div style={{ background: `${C.green}08`, border: `1px solid ${C.green}20`, borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
              <div style={{ color: C.green, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>🌀 كشف السوستات والفخوخ — Spring & Trap Detection</div>
              <div style={{ fontSize: 8, color: C.dim }}>يكشف لحظات الاختراق الكاذب حيث يُمسك المتداولون في فخ قبل أن يرتد السعر بقوة. هذه أعلى الاحتمالات في التداول.</div>
            </div>

            {springResult ? (
              <div>
                {/* Signal Strength */}
                <div style={{ background: C.card, borderRadius: 5, padding: '6px 8px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: 8, color: C.mut }}>قوة الإشارة: </span>
                    <span style={{ fontSize: 10, color: springResult.signalStrength > 50 ? C.green : springResult.signalStrength > 25 ? C.yellow : C.mut, fontWeight: 800 }}>{springResult.signalStrength}%</span>
                  </div>
                  <div style={{ fontSize: 7.5, color: C.dim }}>{springResult.summaryAr}</div>
                </div>

                {/* Counts */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 3, marginBottom: 8 }}>
                  <div style={{ background: C.card, borderRadius: 3, padding: '3px 4px', textAlign: 'center' }}>
                    <div style={{ color: C.mut, fontSize: 6 }}>سوستة</div>
                    <div style={{ color: C.green, fontSize: 9, fontWeight: 700 }}>{springResult.counts.spring}</div>
                  </div>
                  <div style={{ background: C.card, borderRadius: 3, padding: '3px 4px', textAlign: 'center' }}>
                    <div style={{ color: C.mut, fontSize: 6 }}>دفع</div>
                    <div style={{ color: C.red, fontSize: 9, fontWeight: 700 }}>{springResult.counts.upthrust}</div>
                  </div>
                  <div style={{ background: C.card, borderRadius: 3, padding: '3px 4px', textAlign: 'center' }}>
                    <div style={{ color: C.mut, fontSize: 6 }}>اصطياد</div>
                    <div style={{ color: C.yellow, fontSize: 9, fontWeight: 700 }}>{springResult.counts.stop_hunt}</div>
                  </div>
                  <div style={{ background: C.card, borderRadius: 3, padding: '3px 4px', textAlign: 'center' }}>
                    <div style={{ color: C.mut, fontSize: 6 }}>سوستة</div>
                    <div style={{ color: C.cyan, fontSize: 9, fontWeight: 700 }}>{springResult.counts.springboard}</div>
                  </div>
                </div>

                {/* Best Setup */}
                {springResult.bestSetup && (
                  <div style={{ background: `${C.gold}08`, border: `1px solid ${C.gold}30`, borderRadius: 5, padding: '8px 10px', marginBottom: 8 }}>
                    <div style={{ color: C.gold, fontSize: 9, fontWeight: 700, marginBottom: 4 }}>⭐ أفضل إعداد حالي</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 9, color: springResult.bestSetup.direction === 'bullish' ? C.green : C.red, fontWeight: 800 }}>
                        {springResult.bestSetup.direction === 'bullish' ? '▲' : '▼'} {springResult.bestSetup.nameAr}
                      </span>
                      <span style={{ fontSize: 8, color: C.text, fontWeight: 700 }}>ثقة {Math.round(springResult.bestSetup.confidence * 100)}%</span>
                    </div>
                    <div style={{ fontSize: 7.5, color: C.dim, lineHeight: 1.5, marginBottom: 4 }}>{springResult.bestSetup.descriptionAr}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3 }}>
                      <div style={{ background: `${C.green}08`, borderRadius: 3, padding: '3px 5px', textAlign: 'center' }}>
                        <div style={{ color: C.mut, fontSize: 6.5 }}>دخول</div>
                        <div style={{ color: C.green, fontSize: 8.5, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{springResult.bestSetup.entryPrice}</div>
                      </div>
                      <div style={{ background: `${C.red}08`, borderRadius: 3, padding: '3px 5px', textAlign: 'center' }}>
                        <div style={{ color: C.mut, fontSize: 6.5 }}>وقف خسارة</div>
                        <div style={{ color: C.red, fontSize: 8.5, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{springResult.bestSetup.stopLoss}</div>
                      </div>
                      <div style={{ background: `${C.cyan}08`, borderRadius: 3, padding: '3px 5px', textAlign: 'center' }}>
                        <div style={{ color: C.mut, fontSize: 6.5 }}>هدف</div>
                        <div style={{ color: C.cyan, fontSize: 8.5, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{springResult.bestSetup.takeProfit}</div>
                      </div>
                    </div>
                    {springResult.bestSetup.confirmations.length > 0 && (
                      <div style={{ marginTop: 4, fontSize: 7.5, color: C.green }}>✓ {springResult.bestSetup.confirmations.join(' • ')}</div>
                    )}
                  </div>
                )}

                {/* All Springs */}
                {springResult.springs.length > 1 && (
                  <div>
                    <div style={{ color: C.cyan, fontSize: 8.5, fontWeight: 700, marginBottom: 4 }}>جميع السوستات ({springResult.springs.length})</div>
                    {springResult.springs.map((sp, i) => {
                      const dirCol = sp.direction === 'bullish' ? C.green : C.red;
                      return (
                        <div key={i} style={{ background: C.card, borderRadius: 4, padding: '5px 7px', marginBottom: 3, borderLeft: `2px solid ${dirCol}`, opacity: sp.isActionable ? 1 : 0.5 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 8, color: dirCol, fontWeight: 700 }}>{sp.direction === 'bullish' ? '▲' : '▼'} {sp.nameAr}</span>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <span style={{ fontSize: 7.5, color: C.text, fontWeight: 600 }}>ثقة {Math.round(sp.confidence * 100)}%</span>
                              <span style={{ fontSize: 7.5, color: C.cyan }}>R:R 1:{sp.rrRatio}</span>
                              {sp.isActionable && <span style={{ fontSize: 7, color: C.green, fontWeight: 700 }}>● قابل للتنفيذ</span>}
                            </div>
                          </div>
                          <div style={{ fontSize: 7, color: C.mut, marginTop: 2 }}>عمر: {sp.ageCandles} شمعة | اختراق: {sp.penetrationDepth.toFixed(2)} | مستوى: {sp.springLevel.toFixed(2)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {springResult.springs.length === 0 && (
                  <div style={{ color: C.mut, fontSize: 8, textAlign: 'center', padding: 20 }}>لا توجد سوستات أو فخوخ مكتشفة حالياً — جرب أصولاً أو فريمات أخرى</div>
                )}
              </div>
            ) : (
              <div style={{ color: C.mut, fontSize: 8, textAlign: 'center', padding: 20 }}>شغّل التحليل أولاً لكشف السوستات</div>
            )}
          </div>
        )}

        {/* ═══ Trade Journal ═══ */}
        {tab === 'journal' && (
          <div style={{ padding: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <div style={{ background: `${C.gold}08`, border: `1px solid ${C.gold}20`, borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
              <div style={{ color: C.gold, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>📋 سجل التداول التلقائي — Trade Journal</div>
              <div style={{ fontSize: 7.5, color: C.dim }}>يُسجّل كل اقتراح تداول تلقائياً مع نتائجه — دليلك لإثبات أداء النظام</div>
            </div>

            {/* Stats Summary */}
            {journalStats && journalStats.closedTrades > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 8 }}>
                <div style={{ background: C.card, borderRadius: 4, padding: '5px 4px', textAlign: 'center' }}>
                  <div style={{ fontSize: 7, color: C.mut }}>نسبة النجاح</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: journalStats.winRate >= 0.5 ? C.green : C.red }}>{Math.round(journalStats.winRate * 100)}%</div>
                </div>
                <div style={{ background: C.card, borderRadius: 4, padding: '5px 4px', textAlign: 'center' }}>
                  <div style={{ fontSize: 7, color: C.mut }}>إجمالي الربح</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: journalStats.totalPnL >= 0 ? C.green : C.red }}>{journalStats.totalPnL >= 0 ? '+' : ''}{journalStats.totalPnL}</div>
                </div>
                <div style={{ background: C.card, borderRadius: 4, padding: '5px 4px', textAlign: 'center' }}>
                  <div style={{ fontSize: 7, color: C.mut }}>معامل الربح</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.gold }}>{journalStats.profitFactor >= 999 ? '∞' : journalStats.profitFactor}</div>
                </div>
                <div style={{ background: C.card, borderRadius: 4, padding: '5px 4px', textAlign: 'center' }}>
                  <div style={{ fontSize: 7, color: C.mut }}>متوسط R</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.cyan }}>{journalStats.avgRMultiple}</div>
                </div>
              </div>
            )}

            {/* Extended Stats */}
            {journalStats && journalStats.closedTrades > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginBottom: 8 }}>
                <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px' }}>
                  <div style={{ fontSize: 7, color: C.mut }}>صفقات</div>
                  <div style={{ display: 'flex', gap: 4, fontSize: 8 }}>
                    <span style={{ color: C.text }}>{journalStats.closedTrades} مغلقة</span>
                    <span style={{ color: C.dim }}>|</span>
                    <span style={{ color: C.green }}>{journalStats.wins} ربح</span>
                    <span style={{ color: C.red }}>{journalStats.losses} خسارة</span>
                  </div>
                </div>
                <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px' }}>
                  <div style={{ fontSize: 7, color: C.mut }}>أداء الاتجاه</div>
                  <div style={{ display: 'flex', gap: 6, fontSize: 8 }}>
                    <span style={{ color: C.green }}>شراء {Math.round(journalStats.byDirection.bullish.winRate * 100)}%</span>
                    <span style={{ color: C.red }}>بيع {Math.round(journalStats.byDirection.bearish.winRate * 100)}%</span>
                  </div>
                </div>
                <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px' }}>
                  <div style={{ fontSize: 7, color: C.mut }}>أقصى تراجع</div>
                  <div style={{ fontSize: 8, color: C.red }}>{journalStats.maxDrawdown} | شارب: {journalStats.sharpeEstimate}</div>
                </div>
              </div>
            )}

            {/* Boost Impact */}
            {journalStats && journalStats.boostTradesCount > 0 && (
              <div style={{ background: `${C.cyan}06`, border: `1px solid ${C.cyan}15`, borderRadius: 4, padding: '5px 7px', marginBottom: 8 }}>
                <div style={{ fontSize: 7.5, color: C.cyan, fontWeight: 700 }}>تأثير المحركات الثورية</div>
                <div style={{ display: 'flex', gap: 10, fontSize: 8, marginTop: 3 }}>
                  <span style={{ color: C.green }}>مع تعزيز: {Math.round(journalStats.boostTradesWinRate * 100)}%</span>
                  <span style={{ color: C.dim }}>بدون: {Math.round(journalStats.noBoostTradesWinRate * 100)}%</span>
                  <span style={{ color: journalStats.boostLift >= 1 ? C.green : C.red }}>تحسن: {journalStats.boostLift > 0 ? `${Math.round((journalStats.boostLift - 1) * 100)}%` : '—'}</span>
                </div>
              </div>
            )}

            {/* Export Buttons */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              <button onClick={() => {
                const json = exportJournalJSON();
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `roua-journal-${new Date().toISOString().split('T')[0]}.json`;
                a.click(); URL.revokeObjectURL(url);
              }} style={{ flex: 1, background: `${C.gold}15`, border: `1px solid ${C.gold}30`, borderRadius: 4, padding: '5px', color: C.gold, fontSize: 8, cursor: 'pointer', fontWeight: 600 }}>
                تصدير JSON
              </button>
              <button onClick={() => {
                const html = generateReportHTML();
                const blob = new Blob([html], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `roua-report-${new Date().toISOString().split('T')[0]}.html`;
                a.click(); URL.revokeObjectURL(url);
              }} style={{ flex: 1, background: `${C.green}15`, border: `1px solid ${C.green}30`, borderRadius: 4, padding: '5px', color: C.green, fontSize: 8, cursor: 'pointer', fontWeight: 600 }}>
                تقرير PDF (HTML)
              </button>
              <button onClick={() => {
                if (confirm('هل أنت متأكد من مسح السجل؟ هذا لا يمكن التراجع عنه.')) {
                  clearJournal();
                  setJournalEntries([]);
                  setJournalStats(null);
                }
              }} style={{ background: `${C.red}10`, border: `1px solid ${C.red}20`, borderRadius: 4, padding: '5px 8px', color: C.red, fontSize: 8, cursor: 'pointer' }}>
                مسح
              </button>
            </div>

            {/* Weekly Breakdown */}
            {journalStats && journalStats.weeklyBreakdown.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ color: C.cyan, fontSize: 8.5, fontWeight: 700, marginBottom: 4 }}>الأداء الأسبوعي</div>
                <div style={{ display: 'flex', gap: 2, height: 30, alignItems: 'flex-end' }}>
                  {journalStats.weeklyBreakdown.map((w, i) => {
                    const maxPnl = Math.max(...journalStats.weeklyBreakdown.map(x => Math.abs(x.pnl)), 1);
                    const h = Math.max(3, Math.abs(w.pnl) / maxPnl * 28);
                    return (
                      <div key={i} title={`${w.week}: ${w.pnl} (${Math.round(w.winRate * 100)}%)`}
                        style={{ flex: 1, height: h, background: w.pnl >= 0 ? C.green : C.red, borderRadius: '2px 2px 0 0', opacity: 0.7, minHeight: 3 }} />
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 2, fontSize: 5.5, color: C.mut, marginTop: 1 }}>
                  {journalStats.weeklyBreakdown.map((w, i) => (
                    <div key={i} style={{ flex: 1, textAlign: 'center' }}>{w.week.slice(-2)}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Trade Entries */}
            <div style={{ color: C.cyan, fontSize: 8.5, fontWeight: 700, marginBottom: 4 }}>
              الصفقات ({journalEntries.length})
            </div>
            {journalEntries.length === 0 ? (
              <div style={{ color: C.mut, fontSize: 8, textAlign: 'center', padding: 20 }}>
                لا توجد صفقات مسجلة بعد — ستظهر هنا تلقائياً عند اقتراح صفقات
              </div>
            ) : (
              journalEntries.slice(0, 30).map((entry) => {
                const isWin = entry.realizedPnL > 0;
                const isLoss = entry.realizedPnL < 0;
                const statusColor = entry.status === 'pending' ? C.dim : isWin ? C.green : isLoss ? C.red : C.gold;
                const statusLabel = entry.status === 'hit_tp1' ? 'TP1 ✓' : entry.status === 'hit_tp2' ? 'TP2 ✓' : entry.status === 'hit_tp3' ? 'TP3 ✓' : entry.status === 'hit_sl' ? 'SL ✗' : entry.status === 'trail_sl' ? 'Trail' : entry.status === 'pending' ? 'معلق' : entry.status;
                return (
                  <div key={entry.id} style={{ background: C.card, borderRadius: 4, padding: '5px 7px', marginBottom: 3, borderLeft: `2px solid ${statusColor}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <span style={{ fontSize: 8, color: entry.direction === 'bullish' ? C.green : C.red, fontWeight: 700 }}>
                          {entry.direction === 'bullish' ? '▲' : '▼'}
                        </span>
                        <span style={{ fontSize: 8, color: C.text, fontWeight: 600 }}>{entry.entryPrice.toFixed(2)}</span>
                        <span style={{ fontSize: 7, color: statusColor, fontWeight: 700 }}>{statusLabel}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 7.5, color: C.dim }}>{entry.date}</span>
                        <span style={{ fontSize: 8, color: isWin ? C.green : isLoss ? C.red : C.dim, fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                          {entry.realizedPnL !== 0 ? `${entry.realizedPnL > 0 ? '+' : ''}${entry.realizedPnL.toFixed(2)}` : '—'}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: 6.5, color: C.mut, marginTop: 2 }}>
                      R:R 1:{entry.rrRatio} | ثقة {Math.round(entry.confidence * 100)}% | {entry.agreeingSignals.map(s => s.source).join(' + ')}
                      {entry.boostFactorsActive.length > 0 && <span style={{ color: C.cyan }}> | ⚡ {entry.boostFactorsActive.join(', ')}</span>}
                    </div>
                  </div>
                );
              })
            )}

            {journalEntries.length > 30 && (
              <div style={{ textAlign: 'center', fontSize: 7.5, color: C.mut, padding: '5px 0' }}>
                عرض آخر 30 من {journalEntries.length} — صدّر JSON للبيانات الكاملة
              </div>
            )}
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
