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
}

export function AISmartPanel({ symbol, candles, currentPrice, onPatternsDetected, onClose, onExecuteTrade, onScrollToTime, onHeatmapData }: Props) {
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
  const [overlays, setOverlays] = useState({ fvg: false, bos: false, sr: true, geo: false, ew: false, wyckoff: false });
  const toggleOverlay = (key: keyof typeof overlays) => setOverlays(prev => ({...prev, [key]: !prev[key]}));

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

      setPatterns(unique);
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

      // ── Send patterns to chart ─────────────────────────────
      onPatternsRef.current({
        patterns: unique,
        supportLevels: srLevels.filter(l => l.type === 'support').slice(0, 4),
        resistanceLevels: srLevels.filter(l => l.type === 'resistance').slice(0, 4),
        trendLines,
        entryExit: null,
        smcData,
        geoPatterns,
        elliottPattern,
        wyckoff,
        volumeProfile,
        overlays,
      } as AIAnalysisResult);

      // ── 9. REVOLUTIONARY: AI Consensus via SSE Streaming ─────
      // Try SSE first for progressive "War Room" experience, fallback to POST
      let consensusSucceeded = false;
      try {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        const timer = setTimeout(() => controller.abort(), 20000);

        // SSE streaming — models appear one by one
        const sseParams = new URLSearchParams({ symbol: sym, language: locale === 'en' ? 'en' : 'ar' });
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
            fetch('/api/ai/alert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: sym, signal: mergedDir, patterns: unique.slice(0,3).map((p:any)=>p.labelAr||p.type), smcBreaks: smcData.structureBreaks.map((b:any)=>b.type+' '+(b.direction==='bullish'?'↑':'↓')), entry: adaptiveTPSL.entry, sl: adaptiveTPSL.stopLoss, tp: adaptiveTPSL.takeProfit, confidence: mergedConf }) }).catch(()=>{});
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
            body: JSON.stringify({ symbol: sym }),
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
                fetch('/api/ai/alert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: sym, signal: mergedDir, patterns: unique.slice(0,3).map((p:any)=>p.labelAr||p.type), smcBreaks: smcData.structureBreaks.map((b:any)=>b.type+' '+(b.direction==='bullish'?'↑':'↓')), entry: adaptiveTPSL.entry, sl: adaptiveTPSL.stopLoss, tp: adaptiveTPSL.takeProfit, confidence: mergedConf }) }).catch(()=>{});
              }
              consensusSucceeded = true;
            }
          }
        } catch { /* fallback to local signal */ }
      }

      // ── 10. REVOLUTIONARY: Fallback local signal (only if consensus failed) ──
      if (!consensusSucceeded) {
        const bull = unique.filter(p => p.direction === 'bullish').length;
        const bear = unique.filter(p => p.direction === 'bearish').length;
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
  const analyzeThrottled = useCallback(() => {
    const now = Date.now();
    if (now - lastAnalyzeTimeRef.current < 10000) return; // Min 10s between auto-runs
    lastAnalyzeTimeRef.current = now;
    analyze();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (candles && candles.length >= 20) {
      analyzeThrottled();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles.length]);

  // cleanup
  useEffect(() => () => { abortRef.current?.abort(); }, []);

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
  const regimeLabelAr = volRegime === 'extreme' ? 'شديد' : volRegime === 'high' ? 'مرتفع' : volRegime === 'low' ? 'منخفض' : 'طبيعي';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 360, background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden', fontFamily: "'Cairo','IBM Plex Sans Arabic',sans-serif", boxShadow: '0 24px 64px rgba(0,0,0,0.7)', direction: 'inherit' }}>
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
        {([['S/R','sr','#4ade80'],['FVG','fvg','#22d3ee'],['BOS','bos','#f97316'],['هندسي','geo','#a78bfa'],['إليوت','ew','#93c5fd']] as [string,keyof typeof overlays,string][]).map(([lbl,key,col])=>(
          <button key={key} onClick={()=>{ toggleOverlay(key); setTimeout(()=>{ runRef.current=false; analyze(); },50); }}
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
          <div style={{ padding: 10 }}>
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
                        <span style={{ color: C.purple, fontSize: 8, fontWeight: 700 }}>بايزي</span>
                        <span style={{ color: signal.bayesianDir === 'BUY' ? C.green : signal.bayesianDir === 'SELL' ? C.red : C.yellow, fontSize: 9, fontWeight: 700 }}>
                          {signal.bayesianDir === 'BUY' ? '▲' : signal.bayesianDir === 'SELL' ? '▼' : '◆'} {Math.round((signal.bayesianConf || 0) * 100)}%
                        </span>
                      </div>
                    )}
                    {signal.fusionScore !== undefined && (
                      <div style={{ background: `${C.gold}0a`, border: `1px solid ${C.gold}25`, borderRadius: 5, padding: '4px 7px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: C.gold, fontSize: 8, fontWeight: 700 }}>تلاقي</span>
                        <span style={{ color: signal.fusionScore > 50 ? C.green : signal.fusionScore > 25 ? C.yellow : C.dim, fontSize: 9, fontWeight: 700 }}>
                          {signal.fusionScore}%
                        </span>
                      </div>
                    )}
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 8px', background: C.card, borderRadius: 5, marginBottom: 4 }}>
                      <span style={{ color: C.dim, fontSize: 9 }}>{t('riskReward')}</span>
                      <span style={{ color: C.text, fontSize: 9, fontWeight: 700, fontFamily: 'monospace' }}>1:{Math.abs((signal.tp - signal.entry) / (signal.sl - signal.entry || 1)).toFixed(2)}</span>
                    </div>
                    {/* ATR regime indicator */}
                    {signal.regime && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 8px', background: C.card, borderRadius: 5, marginBottom: 8 }}>
                        <span style={{ color: C.dim, fontSize: 8 }}>نظام التقلب</span>
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
                    <div style={{ color: C.gold, fontSize: 8, fontWeight: 700, marginBottom: 4 }}>أداء الأنماط السابقة</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: C.dim, fontSize: 8 }}>نسبة النجاح</span>
                      <span style={{ color: performanceStats.winRate > 50 ? C.green : C.red, fontSize: 9, fontWeight: 700 }}>{Math.round(performanceStats.winRate)}% ({performanceStats.totalTrades})</span>
                    </div>
                    {performanceStats.bestPattern && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                        <span style={{ color: C.dim, fontSize: 8 }}>أفضل نمط</span>
                        <span style={{ color: C.green, fontSize: 8, fontWeight: 600 }}>{performanceStats.bestPattern}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* REVOLUTIONARY: State Machine Alerts */}
                {stateMachineResult && stateMachineResult.alerts.length > 0 && (
                  <div style={{ background: `${C.gold}08`, border: `1px solid ${C.gold}20`, borderRadius: 6, padding: '6px 8px', marginBottom: 6 }}>
                    <div style={{ color: C.gold, fontSize: 8, fontWeight: 700, marginBottom: 3 }}>تنبيهات دورة حياة الأنماط</div>
                    {stateMachineResult.alerts.slice(0, 3).map((a: any, i: number) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                        <span style={{ color: C.dim, fontSize: 8 }}>{a.patternType}</span>
                        <span style={{ color: a.priority === 'critical' ? C.red : a.priority === 'warning' ? C.yellow : C.cyan, fontSize: 8, fontWeight: 600 }}>
                          {a.newState === 'breakout' ? 'اختراق' : a.newState === 'completed' ? 'مكتمل' : a.newState === 'near-completion' ? 'قريب الإكمال' : a.newState === 'failed' ? 'فاشل' : a.newState}
                        </span>
                      </div>
                    ))}
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
          <div style={{ padding: 8 }}>
            {/* REVOLUTIONARY: Bayesian consensus bar */}
            {bayesianResult && (
              <div style={{ background: `${C.purple}0a`, border: `1px solid ${C.purple}20`, borderRadius: 6, padding: '7px 9px', marginBottom: 8 }}>
                <div style={{ color: C.purple, fontSize: 8, fontWeight: 700, marginBottom: 4 }}>إجماع بايزي</div>
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
          <div style={{ padding: 8 }}>
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
          <div style={{ padding: 8 }}>
            {/* REVOLUTIONARY: Elliott+SMC Fusion card */}
            {fusionResult && (
              <div style={{ background: `${C.gold}0a`, border: `1px solid ${C.gold}25`, borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
                <div style={{ color: C.gold, fontSize: 8, fontWeight: 700, marginBottom: 4 }}>تلاقي إليوت + SMC</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: fusionResult.direction === 'bullish' ? C.green : fusionResult.direction === 'bearish' ? C.red : C.yellow, fontSize: 12, fontWeight: 800 }}>
                    {fusionResult.direction === 'bullish' ? '▲ صعودي' : fusionResult.direction === 'bearish' ? '▼ هبوطي' : '◆ محايد'}
                  </span>
                  <span style={{ color: C.gold, fontSize: 11, fontWeight: 700 }}>{fusionResult.confluenceScore}%</span>
                </div>
                <div style={{ color: C.dim, fontSize: 8, marginTop: 3 }}>{fusionResult.interpretation}</div>
              </div>
            )}
            {wyckoffData && wyckoffData.phase !== 'Unknown' && (
              <div style={{ background: C.card, border: `1px solid ${wyckoffData.bias==='bullish'?C.green:wyckoffData.bias==='bearish'?C.red:C.yellow}30`, borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
                <div style={{ color: C.dim, fontSize: 8, marginBottom: 3 }}>{t('wyckoff')}</div>
                <div style={{ color: wyckoffData.bias==='bullish'?C.green:wyckoffData.bias==='bearish'?C.red:C.yellow, fontSize: 13, fontWeight: 800 }}>{wyckoffData.labelAr}</div>
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
          <div style={{ padding: 8 }}>
            {geoList.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ color: C.cyan, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>{t('geometricPatterns')} ({geoList.length})</div>
                {geoList.map((g: any, i: number) => {
                  const col = g.direction==='bullish'?C.green:g.direction==='bearish'?C.red:C.yellow;
                  return (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'5px 8px', borderRadius:5, background:C.card, marginBottom:3, border:`1px solid ${col}18` }}>
                      <span style={{ color:col, fontSize:9.5, fontWeight:600 }}>{g.direction==='bullish'?'▲':'▼'} {g.labelAr}</span>
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
                <div style={{ color: C.gold, fontSize: 8, fontWeight: 700, marginBottom: 5 }}>أداء الأنماط التاريخي</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                    <div style={{ color: C.mut, fontSize: 7 }}>الأنماط</div>
                    <div style={{ color: C.text, fontSize: 10, fontWeight: 700 }}>{performanceStats.totalPatterns}</div>
                  </div>
                  <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                    <div style={{ color: C.mut, fontSize: 7 }}>نسبة النجاح</div>
                    <div style={{ color: (performanceStats.overallWinRate ?? 0) > 0.5 ? C.green : C.red, fontSize: 10, fontWeight: 700 }}>{Math.round((performanceStats.overallWinRate ?? 0) * 100)}%</div>
                  </div>
                  {performanceStats.bestPattern && (
                    <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                      <div style={{ color: C.mut, fontSize: 7 }}>أفضل نمط</div>
                      <div style={{ color: C.green, fontSize: 9, fontWeight: 600 }}>{performanceStats.bestPattern}</div>
                    </div>
                  )}
                  {performanceStats.worstPattern && (
                    <div style={{ background: C.card, borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                      <div style={{ color: C.mut, fontSize: 7 }}>أسوأ نمط</div>
                      <div style={{ color: C.red, fontSize: 9, fontWeight: 600 }}>{performanceStats.worstPattern}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {geoList.length===0 && !elliottData && !performanceStats && <div style={{ textAlign:'center', padding:20, color:C.dim, fontSize:10 }}>{t('pressForAnalysis')}</div>}
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
