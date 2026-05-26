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

type Tab = 'signal' | 'patterns' | 'levels' | 'smc' | 'advanced';

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
  const [volRegime, setVolRegime] = useState<string>('normal');

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

      // ── 3. REVOLUTIONARY: ATR Dynamic Thresholds + Volatility Regime ──
      let regime = 'normal';
      try {
        const thresholds = getDynamicThresholds(c);
        regime = thresholds.volatilityRegime;
        setVolRegime(regime);
      } catch { /* fallback */ }

      // ── 4. REVOLUTIONARY: Bayesian Consensus Engine ───────────
      let bayesianDir = 'neutral';
      let bayesianConf = 0.33;
      try {
        const bayesian = getBayesianEngine();
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

      // ── 6. REVOLUTIONARY: Pattern State Machine ──────────────
      try {
        const sm = getPatternStateMachine();
        // Convert AIPattern[] to the format PatternStateMachine.update() expects
        const smPatterns = unique.map(p => ({
          id: `${p.type}_${p.direction}_${Math.round(p.time || Date.now() / 1000)}`,
          type: p.type,
          direction: p.direction as 'bullish' | 'bearish',
          points: p.points || [{ time: p.time || Date.now() / 1000, price }],
          breakoutPrice: p.breakoutPrice || price * (p.direction === 'bullish' ? 1.02 : 0.98),
          quality: { overall: Math.round(p.confidence * 10) },
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
                if (alert.state === 'breakout') {
                  alerter.announceBreakout({
                    patternType: alert.patternType,
                    patternTypeAr: alert.messageAr || alert.patternType,
                    symbol: sym,
                    direction: alert.direction === 'bullish' ? 'bullish' : 'bearish',
                    price,
                  });
                } else if (alert.priority === 'critical') {
                  alerter.announce({
                    patternType: alert.patternType,
                    patternTypeAr: alert.messageAr || alert.patternType,
                    symbol: sym,
                    direction: alert.direction === 'bullish' ? 'bullish' : 'bearish',
                    confidence: alert.confidence,
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

      // ── 8. REVOLUTIONARY: Confidence Heatmap ─────────────────
      try {
        const signals = extractSignalsFromAnalysis({
          patterns: unique,
          smcData,
          elliottPattern,
          wyckoff,
          volumeProfile,
          geoPatterns,
        });
        const heatmap = buildHeatmap(c, signals);
        setHeatmapResult(heatmap);
        onHeatmapRef.current?.(heatmap);
      } catch { /* Heatmap fallback */ }

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
    } as AIAnalysisResult);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlays, chartAlerts]);

  // ── Re-emit overlays when candles are replaced (timeframe/symbol change) ──
  // When the timeframe changes, RouaChart clears all overlays and sends new candles.
  // If the user has any overlay toggles active, we must re-emit so the chart
  // redraws overlays with the new candle data. Without this, overlays disappear
  // after timeframe change and the user must toggle OFF then ON to get them back.
  // This applies to ALL overlay buttons (trend, SR, harmonic, FVG, BOS, geo, EW, etc.)
  const candleSignatureRef = useRef<string>('');
  useEffect(() => {
    if (!candles?.length || candles.length < 20) return;
    const sig = `${candles[0]?.time}_${candles[candles.length - 1]?.time}_${candles.length}`;
    if (sig === candleSignatureRef.current) return; // Same data, skip
    candleSignatureRef.current = sig;

    // Check if any overlay is currently active
    const anyActive = Object.values(overlaysRef.current).some(v => v === true);
    if (!anyActive) return;

    // Candles were replaced — immediately re-emit overlays so chart redraws
    // (renderOverlays does its own detection from the new candles, so overlays
    // will be based on the correct new timeframe data even with old analysisResult)
    const lastResult = lastAnalysisResultRef.current;
    if (lastResult) {
      const sig2 = signalRef.current;
      onPatternsRef.current({
        ...lastResult,
        overlays: overlaysRef.current as any,
        signal: sig2 ? { dir: sig2.dir, entry: sig2.entry, sl: sig2.sl, tp: sig2.tp } : undefined,
        alerts: chartAlerts,
      } as AIAnalysisResult);
    }

    // Also schedule a fresh analysis for fully accurate data on new timeframe
    // (e.g., Wyckoff phase, Volume Profile, Elliott waves may differ per timeframe)
    // Small delay to avoid blocking the immediate re-emit above
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
        {([['signal', t('tabSignal')], ['patterns', t('tabPatterns')], ['levels', t('tabLevels')], ['smc', t('tabSmc')], ['advanced', t('tabAdvanced')]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: '4px 2px', background: tab===k?'rgba(34,211,238,0.08)':'none', border: 'none', borderBottom: `2px solid ${tab === k ? C.cyan : 'transparent'}`, color: tab === k ? C.cyan : C.dim, fontSize: 9.5, cursor: 'pointer', outline: 'none', fontFamily: 'inherit', transition: 'all 0.15s', fontWeight: tab===k?700:400 }}>{l}</button>
        ))}
      </div>

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
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
