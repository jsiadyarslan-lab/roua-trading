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
import { getPatternPerformanceTracker } from '@/lib/charts/PatternPerformance';
import { buildHeatmap, type HeatmapResult } from '@/lib/charts/ConfidenceHeatmap';
import { runFullVerification, type FullVerificationReport, type EngineVerificationResult } from '@/lib/charts/EngineVerification';
import { evaluateSmartAlerts, buildAlertSnapshot, fireBrowserNotification, type TriggeredAlert, type AlertRule } from '@/lib/charts/SmartAlertEngine';
import { detectLiquidityZones, liquidityToAIPatterns, type LiquidityResult, type LiquidityZone } from '@/lib/charts/LiquidityZones';
import { generateTradeProposal, getTradeProposals, getProposalStats, autoEvaluateProposals, type TradeProposal, type RiskParams } from '@/lib/charts/AutoTradeEngine';

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

type Tab = 'signal' | 'patterns' | 'wyckoff' | 'elliott' | 'levels' | 'smc' | 'advanced' | 'alerts' | 'trades';

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
}

export function AISmartPanel({ symbol, candles, currentPrice, onPatternsDetected, onClose, onExecuteTrade, onScrollToTime, onHeatmapData, streamMode }: Props) {
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
  const [overlays, setOverlays] = useState({ sr: false, trend: false, harmonic: false, fvg: false, bos: false, geo: false, ew: false, wyckoff: false, vp: false, entry: false });
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
  const [volRegime, setVolRegime] = useState<string>('normal');
  const [verificationReport, setVerificationReport] = useState<FullVerificationReport | null>(null);
  const [showVerification, setShowVerification] = useState(false);

  // ── Refs to avoid stale closure ─────────────────────────────
  const runRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastAnnouncedRef = useRef<Set<string>>(new Set()); // Track announced patterns to avoid re-announce
  const lastAnalysisResultRef = useRef<AIAnalysisResult | null>(null); // Store last result for overlay re-emit
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

  // ── Core analyze — uses refs, never stale ──────────────────
  const analyze = async () => {
    const c = candlesRef.current;
    const sym = symbolRef.current;
    const price = priceRef.current ?? c[c.length - 1]?.close ?? 0;

    if (runRef.current || !c?.length || c.length < 20) return;
    runRef.current = true;
    setLoading(true);

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
                setTimeout(() => lastAnnouncedRef.current.delete(alertKey), 60000);
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
        const heatmap = buildHeatmap(c, {
          patterns: allPatterns,
          smcData,
          elliottPattern,
          wyckoff,
          volumeProfile,
          geoPatterns,
        });
        setHeatmapResult(heatmap);
        onHeatmapRef.current?.(heatmap);
      } catch { /* Heatmap fallback */ }

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
          elliottResult,
          wyckoffResult: wyckoffAdv,
          currentPrice: price,
          timeframe: 'auto',
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
        const tradeSignals = allPatterns
          .filter(p => p.direction !== 'neutral' && p.confidence >= 0.4)
          .map(p => ({
            source: p.type || 'unknown',
            direction: p.direction,
            confidence: p.confidence,
            keyLevel: p.price || price,
          }));

        const confluenceDir = tradeSignals.filter(s => s.direction === 'bullish').length >
          tradeSignals.filter(s => s.direction === 'bearish').length ? 'bullish' : 'bearish';

        const confluenceScore = Math.round(
          (tradeSignals.filter(s => s.direction === confluenceDir).reduce((sum, s) => sum + s.confidence, 0) /
            (tradeSignals.length || 1)) * 100
        );

        const proposal = generateTradeProposal({
          candles: c,
          direction: confluenceDir,
          confluenceScore,
          signals: tradeSignals,
          patternSource: tradeSignals[0]?.source || 'confluence',
          currentPrice: price,
          timeframe: 'auto',
        });

        if (proposal) {
          setTradeProposals(prev => [proposal, ...prev.slice(0, 9)]);
        }
        setProposalStats(getProposalStats());
      } catch { /* Auto-Trade fallback */ }

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
      } as AIAnalysisResult;
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
            setTimeout(() => alertsDedupRef.current.delete(alertKey), 300000);
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
            setTimeout(() => alertsDedupRef.current.delete(alertKey), 300000);
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
            setTimeout(() => alertsDedupRef.current.delete(alertKey), 300000);
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
            setTimeout(() => alertsDedupRef.current.delete(alertKey), 300000);
            newAlerts.push({
              time: (hp.points?.D?.time || c[c.length - 1].time) as any,
              price: hp.przLevel || hp.points?.D?.price || price,
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
        const controller = new AbortController();
        abortRef.current = controller;
        const timer = setTimeout(() => controller.abort(), 20000);

        // SSE streaming — models appear one by one
        const sseParams = new URLSearchParams({ symbol: sym, language: locale });
        const eventSource = new EventSource(`/api/ai/consensus-stream?${sseParams}`);

        const sseResult = await new Promise<any>((resolve, reject) => {
          const timeout = setTimeout(() => {
            eventSource.close();
            reject(new Error('SSE timeout'));
          }, 20000);

          eventSource.onmessage = (event) => {
            try {
              const sseEvent = JSON.parse(event.data);
              if (sseEvent.type === 'complete') {
                clearTimeout(timeout);
                clearTimeout(timer);
                eventSource.close();
                resolve(sseEvent.data);
              } else if (sseEvent.type === 'error') {
                clearTimeout(timeout);
                clearTimeout(timer);
                eventSource.close();
                reject(new Error(sseEvent.data?.message || 'SSE error'));
              }
            } catch {}
          };
          eventSource.onerror = () => {
            clearTimeout(timeout);
            clearTimeout(timer);
            eventSource.close();
            reject(new Error('SSE connection error'));
          };
        });

        if (sseResult) {
          const rec = sseResult.recommendation;
          const dir = rec === 'BUY' ? 'BUY' : rec === 'SELL' ? 'SELL' : 'WAIT';
          const models = sseResult.analyses?.length || sseResult.meta?.modelsResponded || 0;
          const councilConf = (sseResult.consensusScore || 50) / 100;

          // Merge council + Bayesian for enhanced signal
          const mergedDir = bayesianConf > 0.55
            ? (bayesianDir === 'bullish' ? 'BUY' : bayesianDir === 'bearish' ? 'SELL' : dir)
            : dir;
          const mergedConf = dir === mergedDir
            ? Math.min(0.95, councilConf + (bayesianConf - 0.33) * 0.3)
            : councilConf * 0.7;

          const direction = mergedDir === 'BUY' ? 'long' : 'short';
          const adaptiveTPSL = calcAdaptiveTPSL(c, direction, mergedConf, price);

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

              const mergedDir = bayesianConf > 0.55
                ? (bayesianDir === 'bullish' ? 'BUY' : bayesianDir === 'bearish' ? 'SELL' : dir)
                : dir;
              const mergedConf = dir === mergedDir
                ? Math.min(0.95, councilConf + (bayesianConf - 0.33) * 0.3)
                : councilConf * 0.7;

              const direction = mergedDir === 'BUY' ? 'long' : 'short';
              const adaptiveTPSL = calcAdaptiveTPSL(c, direction, mergedConf, price);

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
    } catch { /* silent */ }
    finally { setLoading(false); runRef.current = false; }
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

  // ── AUTO-DETECTION: Re-enabled with smart throttling ──────
  // Only auto-analyzes when a NEW candle is added (candle count increases),
  // not on every re-render. Also generates alerts for high-confidence patterns.
  useEffect(() => {
    if (!candles || candles.length < 20) return;
    // Only trigger when candle count actually increases (new candle from WebSocket)
    if (candles.length <= lastCandleCountRef.current) return;
    lastCandleCountRef.current = candles.length;
    analyzeThrottled();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles?.length]);

  // ── Run analysis once when panel first receives valid candles ──
  // This replaces the auto-analyze on every candle change.
  // Now it only runs when the panel is actually open and has data.
  const hasRunInitialRef = useRef(false);
  useEffect(() => {
    if (candles && candles.length >= 20 && !hasRunInitialRef.current && !runRef.current) {
      hasRunInitialRef.current = true;
      analyze();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles?.length]);

  // cleanup
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // ── Re-emit patterns when overlay toggles change ──
  // This redraws only the overlays the user wants without re-analyzing
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;
  const signalRef = useRef(signal);
  signalRef.current = signal;

  useEffect(() => {
    const lastResult = lastAnalysisResultRef.current;
    if (!lastResult || !candles?.length) return;
    // Re-emit with updated overlays so chart only draws what's enabled
    // FIX: Also include signal data for the Entry overlay
    onPatternsRef.current({
      ...lastResult,
      overlays: overlays as any,
      signal: signal ? { dir: signal.dir, entry: signal.entry, sl: signal.sl, tp: signal.tp } : undefined,
      alerts: chartAlerts,
      fusionResult: fusionResult,
      bayesianResult: bayesianResult,
    } as AIAnalysisResult);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlays, chartAlerts]);

  // ── Re-emit overlays when candles are replaced (timeframe/symbol change) ──
  // When the timeframe changes, RouaChart clears all overlays and sends new candles.
  // If the user has any overlay toggles active, we must re-emit so the chart
  // redraws overlays with the new candle data. Without this, overlays disappear
  // after timeframe change and the user must toggle OFF then ON to get them back.
  // This applies to ALL overlay buttons (trend, SR, harmonic, FVG, BOS, geo, EW, etc.)
  //
  // FIX: Clear lastAnalysisResultRef when candles change (timeframe switch).
  // Previously, re-emitting with old lastResult caused overlays from the
  // previous timeframe to be drawn alongside new ones, creating accumulation.
  // Now we ONLY trigger a fresh analyze() — no stale data re-emit.
  const candleSignatureRef = useRef<string>('');
  useEffect(() => {
    if (!candles?.length || candles.length < 20) return;
    const sig = `${candles[0]?.time}_${candles[candles.length - 1]?.time}_${candles.length}`;
    if (sig === candleSignatureRef.current) return; // Same data, skip
    candleSignatureRef.current = sig;

    // Check if any overlay is currently active
    const anyActive = Object.values(overlaysRef.current).some(v => v === true);
    if (!anyActive) return;

    // FIX: Invalidate stale analysis data from previous timeframe.
    // The old lastResult contained overlays/metadata with timestamps from
    // the previous timeframe — re-emitting it would draw those old patterns
    // on the new chart, causing accumulation across timeframes.
    lastAnalysisResultRef.current = null;
    // Clear stale alerts from previous timeframe (they have wrong timestamps)
    setChartAlerts([]);
    alertsDedupRef.current.clear();

    // Schedule a fresh analysis for the new timeframe data.
    // renderOverlays will do its own local detection from the new candles,
    // so harmonic/BOS/FVG/Elliott/Wyckoff overlays will be correct.
    // We don't re-emit old lastResult — only the fresh analyze() result
    // will be sent to the chart.
    setTimeout(() => {
      runRef.current = false; // Reset guard to allow re-analysis
      lastAnalyzeTimeRef.current = 0; // Reset throttle
      analyze();
    }, 300);
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
  const fp = (n: number) => n > 999 ? n.toFixed(2) : n.toFixed(5);
  const strengthLabel = (s: string) => s === 'strong' ? t('strong') : s === 'medium' ? t('medium') : t('weak');
  const support = levels.filter(l => l.type === 'support').slice(0, 4);
  const resistance = levels.filter(l => l.type === 'resistance').slice(0, 4);

  // Regime color
  const regimeColor = volRegime === 'extreme' ? C.red : volRegime === 'high' ? C.yellow : volRegime === 'low' ? C.blue : C.green;
  const regimeLabelAr = volRegime === 'extreme' ? t('extreme') : volRegime === 'high' ? t('high') : volRegime === 'low' ? t('low') : t('normal');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 360, maxHeight: 560, background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden', fontFamily: "'Cairo','IBM Plex Sans Arabic',sans-serif", boxShadow: '0 24px 64px rgba(0,0,0,0.7)', direction: 'inherit' }}>
      {/* Header */}
      <div data-drag-handle="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderBottom: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.025)', cursor: 'grab', userSelect: 'none', flexShrink: 0 }}>
        <div data-drag-handle="true" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span data-drag-handle="true" style={{ fontSize: 16 }}>🧠</span>
          <div data-drag-handle="true">
            <div style={{ color: C.text, fontSize: 11, fontWeight: 700 }}>{t('title')}</div>
            <div style={{ color: C.mut, fontSize: 8.5, fontFamily: 'monospace' }}>{symbol}</div>
          </div>
          {loading && <div style={{ width: 8, height: 8, border: `1.5px solid ${C.cyan}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {/* SSE Stream indicator */}
          {streamMode && (
            <div style={{ padding: '1px 5px', borderRadius: 3, fontSize: 7, fontWeight: 700, fontFamily: 'monospace', background: `${C.cyan}18`, color: C.cyan, border: `1px solid ${C.cyan}30`, display: 'flex', alignItems: 'center', gap: 3 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.cyan, animation: 'spin 1s linear infinite' }} />
              SSE
            </div>
          )}
          {/* Volatility regime badge */}
          <div style={{ padding: '1px 5px', borderRadius: 3, fontSize: 7, fontWeight: 700, fontFamily: 'monospace', background: `${regimeColor}18`, color: regimeColor, border: `1px solid ${regimeColor}30` }}>
            ATR {regimeLabelAr}
          </div>
          {/* Engine verification badge — click to verify engines are real */}
          <button
            onClick={() => { const report = runFullVerification(); setVerificationReport(report); setShowVerification(true); }}
            title="تحقق من المحركات | Verify Engines"
            style={{
              padding: '1px 5px', borderRadius: 3, fontSize: 7, fontWeight: 700, fontFamily: 'monospace',
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

      {/* Overlay Toggles */}
      <div style={{ display:'flex', gap:3, padding:'4px 8px', borderBottom:`1px solid ${C.border}`, flexShrink:0, flexWrap:'wrap' }}>
        {([[t('overlaySR'),'sr','#4ade80'],[t('overlayTrend'),'trend','#facc15'],[t('overlayHarmonic'),'harmonic','#c084fc'],['FVG','fvg','#22d3ee'],['BOS','bos','#f97316'],[t('overlayGeometric'),'geo','#a78bfa'],[t('overlayElliott'),'ew','#93c5fd'],[t('overlayWyckoff'),'wyckoff','#fb923c'],['VP','vp','#fbbf24'],[t('overlayEntry'),'entry','#00D4FF']] as [string,keyof typeof overlays,string][]).map(([lbl,key,col])=>(
          <button key={key} onClick={()=>{ toggleOverlay(key); }}
            style={{ padding:'2px 7px', borderRadius:3, fontSize:8, fontWeight:700, cursor:'pointer', outline:'none', fontFamily:'inherit',
              border:`1px solid ${overlays[key]?col:'#333'}`,
              background:overlays[key]?col+'22':'transparent',
              color:overlays[key]?col:'#555',
              transition:'all 0.15s' }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {([['signal', t('tabSignal')], ['patterns', t('tabPatterns')], ['wyckoff', 'Wyckoff'], ['elliott', 'Elliott'], ['levels', t('tabLevels')], ['smc', t('tabSmc')], ['alerts', '🚨'], ['trades', '💰'], ['advanced', t('tabAdvanced')]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: '4px 2px', background: tab===k?'rgba(34,211,238,0.08)':'none', border: 'none', borderBottom: `2px solid ${tab === k ? C.cyan : 'transparent'}`, color: tab === k ? C.cyan : C.dim, fontSize: 9.5, cursor: 'pointer', outline: 'none', fontFamily: 'inherit', transition: 'all 0.15s', fontWeight: tab===k?700:400 }}>{l}</button>
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
            <div style={{ fontSize: 28, fontWeight: 800, color: verificationReport.allReal ? C.green : C.gold, fontFamily: 'monospace' }}>
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
                <span style={{ fontSize: 9, fontFamily: 'monospace', color: eng.isReal ? C.green : C.red, fontWeight: 700 }}>
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
                          <div style={{ color: col, fontSize: 9, fontWeight: 700, fontFamily: 'monospace' }}>{fp(v)}</div>
                        </div>
                      ))}
                    </div>
                    {(() => {
                      const rr = Math.abs((signal.tp - signal.entry) / (signal.sl - signal.entry || 1));
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
                              fontSize: 9, fontWeight: 700, fontFamily: 'monospace',
                            }}>1:{rr.toFixed(2)}</span>
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
                        {arr.slice(0, 2).map((l, i) => <div key={i} style={{ color: C.dim, fontSize: 8.5, fontFamily: 'monospace' }}>{fp(l.price)}</div>)}
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
                    <span style={{ color: col, fontSize: 9.5, fontFamily: 'monospace', fontWeight: 700 }}>{fp(l.price)}</span>
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
                    <span style={{ color: C.text, fontSize: 9, fontFamily:'monospace' }}>{v>999?v.toFixed(2):v.toFixed(5)}</span>
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
                    <div><span style={{ color: C.dim }}>أعلى النطاق:</span> <span style={{ color: C.text, fontFamily: 'monospace' }}>{wyckoffAdvanced.range.high.toFixed(2)}</span></div>
                    <div><span style={{ color: C.dim }}>أدنى النطاق:</span> <span style={{ color: C.text, fontFamily: 'monospace' }}>{wyckoffAdvanced.range.low.toFixed(2)}</span></div>
                    <div><span style={{ color: C.dim }}>الدعم:</span> <span style={{ color: C.green, fontFamily: 'monospace' }}>{wyckoffAdvanced.support.toFixed(2)}</span></div>
                    <div><span style={{ color: C.dim }}>المقاومة:</span> <span style={{ color: C.red, fontFamily: 'monospace' }}>{wyckoffAdvanced.resistance.toFixed(2)}</span></div>
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
                        <div style={{ padding: '1px 5px', borderRadius: 3, fontSize: 8, fontWeight: 700, fontFamily: 'monospace', background: evt.phase === 'A' ? 'rgba(59,130,246,0.12)' : evt.phase === 'B' ? 'rgba(168,85,247,0.12)' : evt.phase === 'C' ? 'rgba(245,158,11,0.12)' : evt.phase === 'D' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: evt.phase === 'A' ? C.blue : evt.phase === 'B' ? C.purple : evt.phase === 'C' ? C.yellow : evt.phase === 'D' ? C.green : C.red, border: `1px solid ${evt.phase === 'A' ? 'rgba(59,130,246,0.2)' : evt.phase === 'B' ? 'rgba(168,85,247,0.2)' : evt.phase === 'C' ? 'rgba(245,158,11,0.2)' : evt.phase === 'D' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`, flexShrink: 0 }}>
                          {evt.type}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <span style={{ color: C.dim, fontSize: 8 }}>المرحلة {evt.phase}</span>
                            <span style={{ color: C.text, fontFamily: 'monospace', fontSize: 9 }}>{evt.price.toFixed(2)}</span>
                          </div>
                          <div style={{ color: C.mut, fontSize: 8 }}>{evt.description}</div>
                        </div>
                        <span style={{ color: C.mut, fontFamily: 'monospace', fontSize: 8 }}>V:{(evt.volume / 1000).toFixed(0)}K</span>
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
                        <div key={phase} style={{ flex: 1, height: 24, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontFamily: 'monospace', background: isActive ? 'rgba(245,158,11,0.12)' : isComplete ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)', color: isActive ? C.yellow : isComplete ? C.dim : C.mut, border: isActive ? '1px solid rgba(245,158,11,0.2)' : 'none' }}>
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
                        {(elliottAdvanced.dominantCount.probability * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 2, width: `${elliottAdvanced.dominantCount.confidence * 100}%`, background: elliottAdvanced.dominantCount.direction === 'bullish' ? C.green : C.red, transition: 'width 0.5s' }} />
                    </div>
                    <div style={{ color: C.dim, fontSize: 9, marginTop: 4 }}>{elliottAdvanced.dominantCount.label}</div>
                    {elliottAdvanced.dominantCount.targetPrice !== null && (
                      <div style={{ color: C.dim, fontSize: 9, marginTop: 2 }}>الهدف: <span style={{ color: C.text, fontFamily: 'monospace' }}>{elliottAdvanced.dominantCount.targetPrice.toFixed(2)}</span></div>
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
                        <span style={{ fontFamily: 'monospace', fontSize: 9, color: Math.abs(val - target) / target < 0.08 ? C.green : C.yellow }}>
                          {val.toFixed(3)}{Math.abs(val - target) / target < 0.08 ? ` ≈ ${target}` : ''}
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
                          <span style={{ padding: '1px 4px', borderRadius: 3, fontSize: 8, fontFamily: 'monospace', background: 'rgba(255,255,255,0.04)', color: C.dim }}>{(count.probability * 100).toFixed(0)}%</span>
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
                {elliottData.nextTarget && <div style={{ color:C.dim, fontSize:8.5, marginTop:4 }}>{t('nextTarget')}: <span style={{ color:C.cyan, fontFamily:'monospace' }}>{elliottData.nextTarget.toFixed(2)}</span></div>}
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
                        <div style={{ color: C.text, fontSize: 9, fontWeight: 700, fontFamily: 'monospace' }}>{thresholds.atrValue.toFixed(2)}</div>
                      </div>
                      <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                        <div style={{ color: C.mut, fontSize: 7 }}>ATR %</div>
                        <div style={{ color: regimeColor, fontSize: 9, fontWeight: 700, fontFamily: 'monospace' }}>{atrPct.toFixed(2)}%</div>
                      </div>
                      <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                        <div style={{ color: C.mut, fontSize: 7 }}>{t('retracement')}</div>
                        <div style={{ color: C.text, fontSize: 9, fontWeight: 700, fontFamily: 'monospace' }}>{(thresholds.pullback * 100).toFixed(1)}%</div>
                      </div>
                      <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                        <div style={{ color: C.mut, fontSize: 7 }}>{t('peakSimilarity')}</div>
                        <div style={{ color: C.text, fontSize: 9, fontWeight: 700, fontFamily: 'monospace' }}>{(thresholds.peakSimilarity * 100).toFixed(1)}%</div>
                      </div>
                      <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                        <div style={{ color: C.mut, fontSize: 7 }}>{t('shoulderDivergence')}</div>
                        <div style={{ color: C.text, fontSize: 9, fontWeight: 700, fontFamily: 'monospace' }}>{(thresholds.shoulderTolerance * 100).toFixed(1)}%</div>
                      </div>
                      <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                        <div style={{ color: C.mut, fontSize: 7 }}>{t('breakoutConfirmation')}</div>
                        <div style={{ color: C.text, fontSize: 9, fontWeight: 700, fontFamily: 'monospace' }}>{(thresholds.breakoutConfirm * 100).toFixed(1)}%</div>
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
                    <span style={{ color: C.mut, fontSize: 8, fontFamily: 'monospace' }}>{zone.price.toFixed(2)} {zone.swept ? '(مسحوبة)' : ''}</span>
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
                    <div style={{ color: C.cyan, fontSize: 10, fontWeight: 700 }}>1:{proposalStats.avgRR.toFixed(1)}</div>
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
                      <div><span style={{ color: C.mut }}>دخول:</span> <span style={{ color: C.text, fontFamily: 'monospace' }}>{proposal.entryPrice.toFixed(2)}</span></div>
                      <div><span style={{ color: C.mut }}>وقف:</span> <span style={{ color: C.red, fontFamily: 'monospace' }}>{proposal.stopLoss.toFixed(2)}</span></div>
                      <div><span style={{ color: C.mut }}>هدف:</span> <span style={{ color: C.green, fontFamily: 'monospace' }}>{proposal.takeProfits[2].toFixed(2)}</span></div>
                      <div><span style={{ color: C.mut }}>حجم:</span> <span style={{ color: C.text, fontFamily: 'monospace' }}>{proposal.positionSize.toFixed(4)}</span></div>
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
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
