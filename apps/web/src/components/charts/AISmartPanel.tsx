// ═══════════════════════════════════════════════════════════════
// ROUA AI Panel v5 — Revolutionary Edition
// + Bayesian Integration Engine + ATR Adaptive TP/SL
// + Pattern State Machine + Elliott+SMC Fusion
// + Confidence Heatmap + Audio Alerts + Pattern Performance
// ═══════════════════════════════════════════════════════════════
'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import type { AIAnalysisResult, SupportResistanceLevel } from './AIPatternPanel';
import type { AIPattern, CandleData, AdaptiveTPSLResult, PatternStateInfo, BayesianConsensusResult, ElliottSMCFusionResult } from '@/lib/charts/types';
import { detectLocalPatterns, detectSupportResistance, detectTrendLines } from './AIPatternPanel';
import { detectSMC } from '@/lib/charts/SMCDetector';
import { detectGeometricPatterns } from '@/lib/charts/GeometricPatterns';
import { detectElliottWaves } from '@/lib/charts/ElliottWave';
import { detectWyckoff } from '@/lib/charts/WyckoffAnalysis';
import { calcVolumeProfile } from '@/lib/charts/VolumeProfile';
import { calcAdaptiveTPSL, getDynamicThresholds } from '@/lib/charts/ATRAdapter';
import { getPatternStateMachine } from '@/lib/charts/PatternStateMachine';
import { getBayesianEngine, extractSignalsFromAnalysis } from '@/lib/charts/BayesianEngine';
import { detectElliottSMCFusion } from '@/lib/charts/ElliottSMCFusion';
import { getPatternAudioAlerter } from '@/lib/charts/AudioAlerts';
import { getPatternPerformanceTracker } from '@/lib/charts/PatternPerformance';
import { buildHeatmap } from '@/lib/charts/ConfidenceHeatmap';
import { useConsensusStream } from '@/hooks/useConsensusStream';

const C = {
  bg: '#0a0e17', card: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.09)',
  text: '#e8eaf0', dim: 'rgba(255,255,255,0.5)', mut: 'rgba(255,255,255,0.25)',
  cyan: '#22d3ee', green: '#10b981', red: '#ef4444', yellow: '#f59e0b',
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

type Tab = 'signal' | 'patterns' | 'levels' | 'smc' | 'advanced' | 'bayesian' | 'fusion' | 'performance' | 'warroom';

interface Props {
  symbol: string;
  candles: CandleData[];
  currentPrice: number | null;
  onPatternsDetected: (r: AIAnalysisResult) => void;
  onClose: () => void;
  onExecuteTrade?: (side: 'long' | 'short', entry: number, sl: number, tp: number) => void;
  onScrollToTime?: (time: number) => void;
}

export function AISmartPanel({ symbol, candles, currentPrice, onPatternsDetected, onClose, onExecuteTrade, onScrollToTime }: Props) {
  const t = useTranslations('aiSmartPanel');
  const locale = useLocale();
  const timeLocale = locale === 'ar' ? 'ar-EG' : 'en-US';
  const [tab, setTab] = useState<Tab>('signal');
  const [loading, setLoading] = useState(false);
  const [signal, setSignal] = useState<{ dir: 'BUY' | 'SELL' | 'WAIT'; conf: number; entry: number; sl: number; tp: number; reason: string; ts: number } | null>(null);
  const [patterns, setPatterns] = useState<AIPattern[]>([]);
  const [levels, setLevels] = useState<SupportResistanceLevel[]>([]);
  const [geoList, setGeoList] = useState<any[]>([]);
  const [elliottData, setElliottData] = useState<any>(null);
  const [wyckoffData, setWyckoffData] = useState<any>(null);
  const [volProfile, setVolProfile] = useState<any>(null);
  const [overlays, setOverlays] = useState({ fvg: false, bos: false, sr: true, geo: false, ew: false, wyckoff: false, heatmap: false });
  // ── Revolutionary feature state ──────────────────────────
  const [adaptiveTPSL, setAdaptiveTPSL] = useState<AdaptiveTPSLResult | null>(null);
  const [patternStates, setPatternStates] = useState<PatternStateInfo[]>([]);
  const [bayesianResult, setBayesianResult] = useState<BayesianConsensusResult | null>(null);
  const [fusionResult, setFusionResult] = useState<ElliottSMCFusionResult | null>(null);
  const [patternAlerts, setPatternAlerts] = useState<Array<{ messageAr: string; priority: string; direction: string }>>([]);
  const [audioEnabled, setAudioEnabled] = useState(false);
  // ── SSE Consensus Stream ──
  const consensusStream = useConsensusStream();
  // FIX: Keep overlays in a ref so the async `analyze` function always reads
  // the latest state. Previously, overlays was captured stale in the closure,
  // so toggling FVG/BOS/etc. had no effect until the next full re-analysis.
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;
  const toggleOverlay = (key: keyof typeof overlays) => setOverlays(prev => ({...prev, [key]: !prev[key]}));

  // ── Refs to avoid stale closure ─────────────────────────────
  const runRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  // Always fresh references — never stale
  const candlesRef = useRef<CandleData[]>(candles);
  const symbolRef = useRef(symbol);
  const priceRef = useRef(currentPrice);
  const onPatternsRef = useRef(onPatternsDetected);

  // Keep refs in sync
  useEffect(() => { candlesRef.current = candles; }, [candles]);
  useEffect(() => { symbolRef.current = symbol; }, [symbol]);
  useEffect(() => { priceRef.current = currentPrice; }, [currentPrice]);
  useEffect(() => { onPatternsRef.current = onPatternsDetected; }, [onPatternsDetected]);

  // ── Core analyze — uses refs, never stale ──────────────────
  const analyze = async () => {
    const c = candlesRef.current;
    const sym = symbolRef.current;
    const price = priceRef.current ?? c[c.length - 1]?.close ?? 0;

    if (runRef.current || !c?.length || c.length < 20) return;
    runRef.current = true;
    setLoading(true);

    try {
      // FIX: Yield to main thread before heavy synchronous computation.
      // Previously, detectLocalPatterns, detectSMC, detectGeometricPatterns,
      // detectElliottWaves, detectWyckoff, and calcVolumeProfile all ran
      // synchronously on the main thread, blocking UI for 50-200ms.
      // Using setTimeout(0) allows React to process pending renders first.
      await new Promise(resolve => setTimeout(resolve, 0));

      // ── 1. كشف تلقائي فوري من البيانات المحلية ────────────
      const raw = detectLocalPatterns(c.slice(-50));
      const seen = new Set<string>();
      const unique = raw.filter(p => { if (seen.has(p.type)) return false; seen.add(p.type); return true; });

      const srLevels = detectSupportResistance(c);
      const trendLines = detectTrendLines(c);

      // ── 2. أرسل الأنماط + SMC + هندسي + إليوت للشارت ──────────
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

      // ── 2.5 REVOLUTIONARY: ATR Adaptive TP/SL ──────────────
      const atpsl = calcAdaptiveTPSL(c, 'long', 0.6, price);
      setAdaptiveTPSL(atpsl);

      // ── 2.6 REVOLUTIONARY: Bayesian Integration ────────────
      const bayesianSignals = extractSignalsFromAnalysis({
        smcData, wyckoff, elliottPattern, volumeProfile,
        geoPatterns, patterns: unique, currentPrice: price,
      });
      const bayesianEngine = getBayesianEngine();
      const bayesianConsensus = bayesianEngine.combine(bayesianSignals);
      setBayesianResult(bayesianConsensus);

      // ── 2.7 REVOLUTIONARY: Elliott + SMC Fusion ────────────
      const fusion = detectElliottSMCFusion({
        candles: c,
        elliott: elliottPattern,
        orderBlocks: smcData.orderBlocks,
        fvgs: smcData.fvgs,
        structureBreaks: smcData.structureBreaks,
        wyckoff,
        volumeProfile,
        currentPrice: price,
      });
      setFusionResult(fusion);

      // ── 2.8 REVOLUTIONARY: Pattern State Machine ───────────
      const sm = getPatternStateMachine();
      const enginePatterns = (await import('@/lib/charts/pattern-engine')).runPatternEngine(c).patterns;
      const smResult = sm.update(c, enginePatterns.map(p => ({
        id: p.id, type: p.type, direction: p.direction,
        points: p.points, breakoutPrice: p.breakoutPrice,
        quality: p.quality,
      })));
      setPatternStates(smResult.activePatterns.map(p => ({
        id: p.id, type: p.type, state: p.state,
        completionPct: p.completionPct, confidence: p.confidence,
        keyLevel: p.keyLevel, alert: p.alert,
      })));

      // ── 2.9 REVOLUTIONARY: Audio Alerts for high-confidence patterns ──
      if (audioEnabled) {
        const alerter = getPatternAudioAlerter();
        for (const alert of smResult.alerts) {
          if (alert.priority === 'critical' || alert.priority === 'warning') {
            alerter.announce({
              patternType: alert.patternType,
              patternTypeAr: alert.messageAr,
              symbol: sym,
              direction: alert.direction,
              confidence: alert.confidence,
            });
          }
        }
        setPatternAlerts(smResult.alerts.slice(0, 5).map(a => ({
          messageAr: a.messageAr, priority: a.priority, direction: a.direction,
        })));
      }

      // ── 2.10 REVOLUTIONARY: Build Confidence Heatmap ───────
      const heatmap = buildHeatmap(c, bayesianSignals);

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
        overlays: overlaysRef.current,  // FIX: Use ref instead of stale state
      });

      // ── 3. مجلس الذكاء (8 نماذج) — SSE Streaming ────────
      // REVOLUTIONARY: Use SSE streaming instead of blocking fetch
      // Models appear one by one (“War Room" experience)
      try {
        consensusStream.startStream(sym, locale === 'ar' ? 'ar' : 'en');
        // Wait for stream to complete (max 30s) or get partial results
        const streamTimeout = setTimeout(() => {
          if (consensusStream.status === 'streaming') {
            consensusStream.cancelStream();
          }
        }, 30000);
        // Watch for consensus stream results
        const watchInterval = setInterval(() => {
          const cs = consensusStream;
          if (cs.status === 'complete' || (cs.status === 'error' && cs.models.length === 0)) {
            clearInterval(watchInterval);
            clearTimeout(streamTimeout);
          }
        }, 500);
        // Return early — signal will be set by the SSE effect below
        return;
      } catch { /* fallback below */ }

      // ── 4. إشارة محلية من الأنماط + EMA + Bayesian ──────────
      const bull = unique.filter(p => p.direction === 'bullish').length;
      const bear = unique.filter(p => p.direction === 'bearish').length;
      const last20 = c.slice(-20);
      const ema9 = last20.slice(-9).reduce((s, x) => s + x.close, 0) / 9;
      const ema20 = last20.reduce((s, x) => s + x.close, 0) / 20;
      const trend = ema9 > ema20 ? 1 : -1;
      const bS = bull + (trend > 0 ? 2 : 0);
      const beS = bear + (trend < 0 ? 2 : 0);
      const dir = bS > beS ? 'BUY' : beS > bS ? 'SELL' : 'WAIT';
      const conf = Math.min(0.85, Math.abs(bS - beS) / (bS + beS + 1));

      // REVOLUTIONARY: Use ATR-based adaptive TP/SL instead of fixed percentages
      const direction = dir === 'BUY' ? 'long' : 'short';
      const adaptiveResult = calcAdaptiveTPSL(c, direction, conf, price);
      setAdaptiveTPSL(adaptiveResult);

      setSignal({ dir: dir as 'BUY' | 'SELL' | 'WAIT', conf, entry: adaptiveResult.entry, sl: adaptiveResult.stopLoss, tp: adaptiveResult.takeProfit, reason: trend > 0 ? t('emaBullish', { bull, bear }) : t('emaBearish', { bull, bear }), ts: Date.now() });
    } catch { /* silent */ }
    finally { setLoading(false); runRef.current = false; }
  };

  // ── تشغيل عند وصول البيانات ──────────────────────────────
  // FIX: Only auto-analyze ONCE when candles first arrive (length crosses 20 threshold).
  // Previously triggered on EVERY candles.length change, causing runaway re-analysis
  // as each new WebSocket candle incremented the length. Now we track the last length
  // we analyzed at and only re-trigger if the candle count increased by at least 10%
  // (e.g., 50→55 candles) or the symbol changed.
  const lastAnalyzedLengthRef = useRef(0);
  const lastAnalyzedSymbolRef = useRef(symbol);
  useEffect(() => {
    const currentLen = candles?.length || 0;
    const symbolChanged = symbol !== lastAnalyzedSymbolRef.current;
    const significantGrowth = currentLen > 0 && (
      lastAnalyzedLengthRef.current === 0 ||
      currentLen >= lastAnalyzedLengthRef.current * 1.1
    );
    if (currentLen >= 20 && (symbolChanged || significantGrowth)) {
      lastAnalyzedLengthRef.current = currentLen;
      lastAnalyzedSymbolRef.current = symbol;
      analyze();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles?.length, symbol]);

  // cleanup
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // ── SSE Consensus: Update signal when stream results arrive ──
  useEffect(() => {
    const cs = consensusStream;
    if (cs.status === 'complete' && cs.finalResult) {
      const rec = cs.finalResult.recommendation || (cs.currentConsensus?.recommendation);
      const dir = rec === 'BUY' ? 'BUY' : rec === 'SELL' ? 'SELL' : 'WAIT';
      const score = cs.currentConsensus?.consensusScore || cs.finalResult.consensusScore || 50;
      const modelsCount = cs.models.length;
      const price = priceRef.current ?? candlesRef.current[candlesRef.current.length - 1]?.close ?? 0;

      // Use ATR-based TP/SL
      const direction = dir === 'BUY' ? 'long' : 'short';
      const adaptiveResult = calcAdaptiveTPSL(candlesRef.current, direction, score / 100, price);

      setSignal({
        dir: dir as 'BUY' | 'SELL' | 'WAIT',
        conf: score / 100,
        entry: adaptiveResult.entry,
        sl: adaptiveResult.stopLoss,
        tp: adaptiveResult.takeProfit,
        reason: t('councilModels', { count: modelsCount }),
        ts: Date.now(),
      });

      // High-confidence alert
      if (score >= 65 && dir !== 'WAIT') {
        fetch('/api/ai/alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: symbolRef.current,
            signal: dir,
            confidence: score / 100,
          }),
        }).catch(() => {});
      }
    } else if (cs.status === 'error' && cs.models.length > 0) {
      // Partial results — use what we have
      const buyWeight = cs.buyModels.length;
      const sellWeight = cs.sellModels.length;
      const dir = buyWeight > sellWeight ? 'BUY' : sellWeight > buyWeight ? 'SELL' : 'WAIT';
      const price = priceRef.current ?? candlesRef.current[candlesRef.current.length - 1]?.close ?? 0;
      const conf = Math.max(buyWeight, sellWeight) / cs.models.length;
      const adaptiveResult = calcAdaptiveTPSL(candlesRef.current, dir === 'BUY' ? 'long' : 'short', conf, price);
      setSignal({
        dir: dir as 'BUY' | 'SELL' | 'WAIT',
        conf,
        entry: adaptiveResult.entry,
        sl: adaptiveResult.stopLoss,
        tp: adaptiveResult.takeProfit,
        reason: `${cs.models.length}/${cs.currentConsensus?.totalModels || '?'} ${t('councilModels', { count: cs.models.length })}`,
        ts: Date.now(),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consensusStream.status, consensusStream.progress]);

  // ── UI Helpers ─────────────────────────────────────────────
  const sigColor = signal?.dir === 'BUY' ? C.green : signal?.dir === 'SELL' ? C.red : C.yellow;
  const sigAr = signal?.dir === 'BUY' ? t('buy') : signal?.dir === 'SELL' ? t('sell') : t('wait');
  const sigIcon = signal?.dir === 'BUY' ? '▲' : signal?.dir === 'SELL' ? '▼' : '◆';
  const pct = Math.round((signal?.conf || 0) * 100);
  const fp = (n: number) => n > 999 ? n.toFixed(2) : n.toFixed(5);
  const strengthLabel = (s: string) => s === 'strong' ? t('strong') : s === 'medium' ? t('medium') : t('weak');
  const support = levels.filter(l => l.type === 'support').slice(0, 4);
  const resistance = levels.filter(l => l.type === 'resistance').slice(0, 4);

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
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => { runRef.current = false; abortRef.current?.abort(); analyze(); }} disabled={loading} title={t('refresh')} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, color: loading ? C.mut : C.cyan, width: 22, height: 22, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none' }}>⟳</button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.mut, fontSize: 16, cursor: 'pointer', outline: 'none', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>
      </div>

      {/* Overlay Toggles */}
      <div style={{ display:'flex', gap:3, padding:'4px 8px', borderBottom:`1px solid ${C.border}`, flexShrink:0, flexWrap:'wrap' }}>
        {([['S/R','sr','#4ade80'],['FVG','fvg','#22d3ee'],['BOS','bos','#f97316'],['هندسي','geo','#a78bfa'],['إليوت','ew','#93c5fd'],['حرارة','heatmap','#f59e0b']] as [string,keyof typeof overlays,string][]).map(([lbl,key,col])=>(
          <button key={key} onClick={()=>{ toggleOverlay(key); setTimeout(()=>{ runRef.current=false; analyze(); },50); }}
            style={{ padding:'2px 7px', borderRadius:3, fontSize:8, fontWeight:700, cursor:'pointer', outline:'none', fontFamily:'inherit',
              border:`1px solid ${overlays[key]?col:'#333'}`,
              background:overlays[key]?col+'22':'transparent',
              color:overlays[key]?col:'#555',
              transition:'all 0.15s' }}>
            {lbl}
          </button>
        ))}
        {/* Audio toggle */}
        <button onClick={() => setAudioEnabled(!audioEnabled)}
          style={{ padding:'2px 7px', borderRadius:3, fontSize:8, fontWeight:700, cursor:'pointer', outline:'none', fontFamily:'inherit',
            border:`1px solid ${audioEnabled?'#f59e0b':'#333'}`,
            background:audioEnabled?'#f59e0b22':'transparent',
            color:audioEnabled?'#f59e0b':'#555',
            transition:'all 0.15s' }}>
          🔊
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {([['signal', 'إشارة'], ['patterns', 'أنماط'], ['levels', 'مستويات'], ['smc', 'SMC'], ['advanced', 'متقدم'], ['bayesian', 'بايزي'], ['fusion', 'توافق'], ['performance', 'أداء'], ['warroom', 'غرفة الحرب']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ flex: '1 0 auto', minWidth: 40, padding: '4px 2px', background: tab===k?'rgba(34,211,238,0.08)':'none', border: 'none', borderBottom: `2px solid ${tab === k ? C.cyan : 'transparent'}`, color: tab === k ? C.cyan : C.dim, fontSize: 8.5, cursor: 'pointer', outline: 'none', fontFamily: 'inherit', transition: 'all 0.15s', fontWeight: tab===k?700:400 }}>{l}</button>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 8px', background: C.card, borderRadius: 5, marginBottom: 8 }}>
                      <span style={{ color: C.dim, fontSize: 9 }}>{t('riskReward')}</span>
                      <span style={{ color: C.text, fontSize: 9, fontWeight: 700, fontFamily: 'monospace' }}>1:{Math.abs((signal.tp - signal.entry) / (signal.sl - signal.entry || 1)).toFixed(2)}</span>
                    </div>
                    {onExecuteTrade && (
                      <button onClick={() => onExecuteTrade(signal.dir === 'BUY' ? 'long' : 'short', signal.entry, signal.sl, signal.tp)} style={{ width: '100%', padding: '7px', borderRadius: 6, border: 'none', background: signal.dir === 'BUY' ? C.green : C.red, color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8 }}>
                        {signal.dir === 'BUY' ? `▲ ${t('executeBuy')}` : `▼ ${t('executeSell')}`}
                      </button>
                    )}
                  </>
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

        {/* SMC — Wyckoff + Volume Profile */}
        {tab === 'smc' && (
          <div style={{ padding: 8 }}>
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
            {!wyckoffData && !volProfile && <div style={{ textAlign:'center', padding: 20, color: C.dim, fontSize: 10 }}>{t('pressForAnalysis')}</div>}
          </div>
        )}

        {/* ADVANCED — Geometric + Elliott */}
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
            {geoList.length===0 && !elliottData && <div style={{ textAlign:'center', padding:20, color:C.dim, fontSize:10 }}>{t('pressForAnalysis')}</div>}
          </div>
        )}

        {/* BAYESIAN — Integration Engine */}
        {tab === 'bayesian' && (
          <div style={{ padding: 8 }}>
            {bayesianResult ? (
              <>
                {/* Direction + Confidence */}
                <div style={{ background: `${bayesianResult.direction === 'bullish' ? C.green : bayesianResult.direction === 'bearish' ? C.red : C.yellow}12`, border: `1px solid ${bayesianResult.direction === 'bullish' ? C.green : bayesianResult.direction === 'bearish' ? C.red : C.yellow}30`, borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: bayesianResult.direction === 'bullish' ? C.green : bayesianResult.direction === 'bearish' ? C.red : C.yellow, fontSize: 14, fontWeight: 800 }}>
                        {bayesianResult.direction === 'bullish' ? '▲ صعودي' : bayesianResult.direction === 'bearish' ? '▼ هبوطي' : '◆ محايد'}
                      </div>
                      <div style={{ color: C.dim, fontSize: 8, marginTop: 2 }}>محرك بايزي — إجماع متعدد الكواشف</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: C.text, fontSize: 22, fontWeight: 900 }}>{Math.round(bayesianResult.confidence * 100)}%</div>
                      <div style={{ color: C.mut, fontSize: 8 }}>ثقة بايزي</div>
                    </div>
                  </div>
                  {/* Posterior bars */}
                  <div style={{ display: 'flex', gap: 2, marginTop: 8, height: 4, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ flex: bayesianResult.posteriorBullish, background: C.green, borderRadius: 2 }} />
                    <div style={{ flex: bayesianResult.posteriorNeutral, background: C.yellow, borderRadius: 2 }} />
                    <div style={{ flex: bayesianResult.posteriorBearish, background: C.red, borderRadius: 2 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                    <span style={{ color: C.green, fontSize: 7.5 }}>صعود {Math.round(bayesianResult.posteriorBullish * 100)}%</span>
                    <span style={{ color: C.yellow, fontSize: 7.5 }}>محايد {Math.round(bayesianResult.posteriorNeutral * 100)}%</span>
                    <span style={{ color: C.red, fontSize: 7.5 }}>هبوط {Math.round(bayesianResult.posteriorBearish * 100)}%</span>
                  </div>
                </div>

                {/* Reinforcing Signals */}
                {bayesianResult.reinforcingSignals.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: C.green, fontSize: 9, fontWeight: 700, marginBottom: 4 }}>✦ إشارات معززة</div>
                    {bayesianResult.reinforcingSignals.map((rs, i) => (
                      <div key={i} style={{ background: C.card, border: `1px solid ${C.green}18`, borderRadius: 5, padding: '5px 8px', marginBottom: 3 }}>
                        <div style={{ color: C.text, fontSize: 8.5 }}>{rs.descriptionAr}</div>
                        <div style={{ color: C.mut, fontSize: 7.5, marginTop: 2 }}>{rs.sources.join(' + ')} — قوة: {Math.round(rs.strength * 100)}%</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Conflicting Signals */}
                {bayesianResult.conflictingSignals.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: C.yellow, fontSize: 9, fontWeight: 700, marginBottom: 4 }}>⚠ إشارات متعارضة</div>
                    {bayesianResult.conflictingSignals.map((cs, i) => (
                      <div key={i} style={{ background: C.card, border: `1px solid ${C.yellow}18`, borderRadius: 5, padding: '5px 8px', marginBottom: 3 }}>
                        <div style={{ color: C.text, fontSize: 8.5 }}>{cs.descriptionAr}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Key Levels */}
                {bayesianResult.keyLevels.length > 0 && (
                  <div>
                    <div style={{ color: C.cyan, fontSize: 9, fontWeight: 700, marginBottom: 4 }}>المستويات الرئيسية</div>
                    {bayesianResult.keyLevels.slice(0, 5).map((kl, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 8px', background: C.card, borderRadius: 4, marginBottom: 2 }}>
                        <span style={{ color: kl.type === 'support' ? C.green : kl.type === 'resistance' ? C.red : C.cyan, fontSize: 8.5 }}>{kl.label}</span>
                        <span style={{ color: C.text, fontSize: 8.5, fontFamily: 'monospace' }}>{fp(kl.price)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* ATR Adaptive TP/SL */}
                {adaptiveTPSL && (
                  <div style={{ marginTop: 8, background: C.card, borderRadius: 6, padding: '8px 10px', border: `1px solid ${C.cyan}20` }}>
                    <div style={{ color: C.cyan, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>TP/SL تكيفي (ATR)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ color: C.mut, fontSize: 7 }}>الوقف</div>
                        <div style={{ color: C.red, fontSize: 9, fontWeight: 700, fontFamily: 'monospace' }}>{fp(adaptiveTPSL.stopLoss)}</div>
                        <div style={{ color: C.mut, fontSize: 7 }}>{adaptiveTPSL.slPercent.toFixed(1)}%</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ color: C.mut, fontSize: 7 }}>الهدف</div>
                        <div style={{ color: C.green, fontSize: 9, fontWeight: 700, fontFamily: 'monospace' }}>{fp(adaptiveTPSL.takeProfit)}</div>
                        <div style={{ color: C.mut, fontSize: 7 }}>{adaptiveTPSL.tpPercent.toFixed(1)}%</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ color: C.mut, fontSize: 7 }}>R:R</div>
                        <div style={{ color: C.text, fontSize: 9, fontWeight: 700, fontFamily: 'monospace' }}>1:{adaptiveTPSL.riskRewardRatio.toFixed(2)}</div>
                        <div style={{ color: C.mut, fontSize: 7 }}>{adaptiveTPSL.regime}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Pattern State Machine Alerts */}
                {patternAlerts.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ color: C.yellow, fontSize: 9, fontWeight: 700, marginBottom: 4 }}>🔔 تنبيهات الأنماط</div>
                    {patternAlerts.map((a, i) => (
                      <div key={i} style={{ background: C.card, border: `1px solid ${a.priority === 'critical' ? C.red : a.priority === 'warning' ? C.yellow : C.cyan}25`, borderRadius: 5, padding: '4px 8px', marginBottom: 2 }}>
                        <span style={{ color: a.priority === 'critical' ? C.red : a.priority === 'warning' ? C.yellow : C.cyan, fontSize: 8.5 }}>{a.priority === 'critical' ? '🔴' : a.priority === 'warning' ? '🟡' : '🔵'} {a.messageAr}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 20, color: C.dim, fontSize: 10 }}>اضغط تحليل لتفعيل محرك بايزي</div>
            )}
          </div>
        )}

        {/* FUSION — Elliott + SMC Consensus */}
        {tab === 'fusion' && (
          <div style={{ padding: 8 }}>
            {fusionResult ? (
              <>
                <div style={{ background: `${fusionResult.direction === 'bullish' ? C.green : fusionResult.direction === 'bearish' ? C.red : C.yellow}12`, border: `1px solid ${fusionResult.direction === 'bullish' ? C.green : fusionResult.direction === 'bearish' ? C.red : C.yellow}30`, borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: fusionResult.direction === 'bullish' ? C.green : fusionResult.direction === 'bearish' ? C.red : C.yellow, fontSize: 13, fontWeight: 800 }}>
                        {fusionResult.direction === 'bullish' ? '▲ صعودي' : fusionResult.direction === 'bearish' ? '▼ هبوطي' : '◆ محايد'}
                      </div>
                      <div style={{ color: C.dim, fontSize: 8, marginTop: 2 }}>توافق إليوت + SMC</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ color: C.text, fontSize: 20, fontWeight: 900 }}>{fusionResult.confluenceScore}</div>
                      <div style={{ color: C.mut, fontSize: 8 }}>{'/100'}</div>
                    </div>
                  </div>
                </div>

                {/* Confluence Breakdown */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ color: C.cyan, fontSize: 9, fontWeight: 700, marginBottom: 4 }}>تفصيل التوافق</div>
                  {fusionResult.confluenceBreakdown.map((cb, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 1 }}>
                        <span style={{ color: C.dim, fontSize: 8.5 }}>{cb.factorAr}</span>
                        <span style={{ color: C.text, fontSize: 8.5, fontWeight: 700 }}>{cb.score}/25</span>
                      </div>
                      <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${(cb.score / 25) * 100}%`, background: cb.score >= 18 ? C.green : cb.score >= 10 ? C.yellow : C.red, borderRadius: 2, transition: 'width 0.5s' }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* SMC Confirmation */}
                <div style={{ background: C.card, borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
                  <div style={{ color: C.dim, fontSize: 8, marginBottom: 5 }}>تأكيد SMC</div>
                  {([
                    ['كتلة أوامر', fusionResult.smcConfirmation.orderBlockConfirms],
                    ['BOS/CHoCH', fusionResult.smcConfirmation.bosConfirms],
                    ['FVG', fusionResult.smcConfirmation.fvgConfirms],
                  ] as [string, boolean][]).map(([label, confirmed]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', marginBottom: 2 }}>
                      <span style={{ color: C.dim, fontSize: 8.5 }}>{label}</span>
                      <span style={{ color: confirmed ? C.green : C.mut, fontSize: 8.5 }}>{confirmed ? '✓ مؤكد' : '✗ غير مؤكد'}</span>
                    </div>
                  ))}
                </div>

                {/* EWO + Wyckoff */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 8 }}>
                  <div style={{ background: C.card, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
                    <div style={{ color: C.mut, fontSize: 7 }}>EWO</div>
                    <div style={{ color: fusionResult.ewoSignal === 'bullish' ? C.green : fusionResult.ewoSignal === 'bearish' ? C.red : C.yellow, fontSize: 10, fontWeight: 700 }}>{fusionResult.ewoSignal === 'bullish' ? '▲' : fusionResult.ewoSignal === 'bearish' ? '▼' : '◆'}</div>
                  </div>
                  <div style={{ background: C.card, borderRadius: 5, padding: '5px 8px', textAlign: 'center' }}>
                    <div style={{ color: C.mut, fontSize: 7 }}>ويكوف</div>
                    <div style={{ color: fusionResult.wyckoffAligns ? C.green : C.mut, fontSize: 10, fontWeight: 700 }}>{fusionResult.wyckoffAligns ? '✓ متوافق' : '✗'}</div>
                  </div>
                </div>

                {/* Interpretation */}
                <div style={{ background: C.card, borderRadius: 5, padding: '6px 8px', border: `1px solid ${C.border}` }}>
                  <div style={{ color: C.dim, fontSize: 8, marginBottom: 3 }}>التفسير</div>
                  <div style={{ color: C.text, fontSize: 9 }}>{fusionResult.interpretationAr}</div>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 20, color: C.dim, fontSize: 10 }}>اضغط تحليل لتفعيل محرك التوافق</div>
            )}
          </div>
        )}

        {/* PERFORMANCE — Pattern Performance Tracking */}
        {tab === 'performance' && (
          <div style={{ padding: 8 }}>
            {(() => {
              const tracker = getPatternPerformanceTracker();
              const summary = tracker.getSummary();
              return (
                <>
                  <div style={{ background: C.card, borderRadius: 6, padding: '8px 10px', marginBottom: 8, border: `1px solid ${C.cyan}20` }}>
                    <div style={{ color: C.cyan, fontSize: 9, fontWeight: 700, marginBottom: 5 }}>ملخص الأداء</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>{summary.totalPatterns}</div>
                        <div style={{ color: C.mut, fontSize: 7 }}>الأنماط المسجلة</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ color: summary.overallWinRate > 0.5 ? C.green : C.red, fontSize: 14, fontWeight: 900 }}>{Math.round(summary.overallWinRate * 100)}%</div>
                        <div style={{ color: C.mut, fontSize: 7 }}>نسبة الفوز</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>{summary.bestPattern || '—'}</div>
                        <div style={{ color: C.mut, fontSize: 7 }}>أفضل نمط</div>
                      </div>
                    </div>
                  </div>

                  {/* Pattern States */}
                  {patternStates.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: C.cyan, fontSize: 9, fontWeight: 700, marginBottom: 4 }}>آلة حالة الأنماط</div>
                      {patternStates.slice(0, 6).map((ps, i) => {
                        const stateColor = ps.state === 'breakout' ? C.green : ps.state === 'near-completion' ? C.yellow : ps.state === 'forming' ? C.cyan : ps.state === 'failed' ? C.red : C.dim;
                        const stateLabelAr: Record<string, string> = { 'forming': 'تتشكل', 'near-completion': 'قريب من الاكتمال', 'completed': 'مكتمل', 'breakout': 'كسر!', 'failed': 'فشل', 'inactive': 'خامل' };
                        return (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: C.card, borderRadius: 4, marginBottom: 2, border: `1px solid ${stateColor}18` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ color: stateColor, fontSize: 8, fontWeight: 700, background: `${stateColor}20`, padding: '1px 5px', borderRadius: 3 }}>{stateLabelAr[ps.state] || ps.state}</span>
                              <span style={{ color: C.text, fontSize: 8.5 }}>{ps.type}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <div style={{ height: 2, width: 24, background: 'rgba(255,255,255,0.07)', borderRadius: 1 }}>
                                <div style={{ height: '100%', width: `${ps.completionPct}%`, background: stateColor, borderRadius: 1 }} />
                              </div>
                              <span style={{ color: C.mut, fontSize: 7 }}>{ps.completionPct}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Recent Trades */}
                  {summary.recentTrades.length > 0 && (
                    <div>
                      <div style={{ color: C.cyan, fontSize: 9, fontWeight: 700, marginBottom: 4 }}>التداولات الأخيرة</div>
                      {summary.recentTrades.slice(0, 5).map((rt, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 8px', background: C.card, borderRadius: 4, marginBottom: 2 }}>
                          <span style={{ color: rt.outcome === 'win' ? C.green : rt.outcome === 'loss' ? C.red : C.yellow, fontSize: 8.5 }}>{rt.patternType} — {rt.outcome === 'win' ? 'فوز' : rt.outcome === 'loss' ? 'خسارة' : 'تعادل'}</span>
                          <span style={{ color: C.mut, fontSize: 8 }}>{rt.pnlPercent ? `${rt.pnlPercent > 0 ? '+' : ''}${rt.pnlPercent.toFixed(1)}%` : '...'}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {summary.totalPatterns === 0 && (
                    <div style={{ textAlign: 'center', padding: 16, color: C.dim, fontSize: 9 }}>لا توجد بيانات أداء بعد. ستظهر هنا بعد التداول بناءً على الأنماط.</div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* WAR ROOM — SSE Streaming Consensus */}
        {tab === 'warroom' && (
          <div style={{ padding: 8 }}>
            {consensusStream.status === 'idle' && (
              <div style={{ textAlign: 'center', padding: 20, color: C.dim, fontSize: 10 }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>🏛️</div>
                <div>اضغط تحليل لبدء بث نماذج الذكاء الاصطناعي</div>
                <div style={{ color: C.mut, fontSize: 8, marginTop: 4 }}>النماذج ستظهر واحدة تلو الأخرى</div>
              </div>
            )}
            {consensusStream.status === 'connecting' && (
              <div style={{ textAlign: 'center', padding: 20, color: C.cyan, fontSize: 10 }}>
                <div style={{ width: 20, height: 20, border: `2px solid ${C.cyan}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 8px' }} />
                <div>جارٍ الاتصال بغرفة الحرب...</div>
              </div>
            )}
            {/* Progress bar */}
            {(consensusStream.status === 'streaming' || consensusStream.status === 'complete') && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ color: C.dim, fontSize: 8 }}>{consensusStream.models.length}/{consensusStream.currentConsensus?.totalModels || '?'} نماذج</span>
                  <span style={{ color: C.dim, fontSize: 8 }}>{consensusStream.duration.toFixed(1)}s</span>
                </div>
                <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
                  <div style={{ width: `${consensusStream.progress * 100}%`, height: '100%', background: C.cyan, borderRadius: 2, transition: 'width 0.3s' }} />
                </div>
              </div>
            )}
            {/* Model cards — appearing one by one */}
            {consensusStream.models.map((model, idx) => {
              const voteColor = model.vote === 'BUY' ? C.green : model.vote === 'SELL' ? C.red : C.yellow;
              const voteLabel = model.vote === 'BUY' ? '▲ شراء' : model.vote === 'SELL' ? '▼ بيع' : '◆ انتظار';
              return (
                <div key={idx} style={{
                  background: C.card,
                  border: `1px solid ${voteColor}25`,
                  borderRadius: 6,
                  padding: '6px 8px',
                  marginBottom: 4,
                  animation: 'fadeIn 0.3s ease-out',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: voteColor, fontSize: 10, fontWeight: 800 }}>{voteLabel}</span>
                      <span style={{ color: C.dim, fontSize: 8 }}>{model.role}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ height: 3, width: 30, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${model.confidence * 100}%`, background: voteColor, borderRadius: 2 }} />
                      </div>
                      <span style={{ color: C.mut, fontSize: 7.5 }}>{Math.round(model.confidence * 100)}%</span>
                    </div>
                  </div>
                  {model.reason && (
                    <div style={{ color: C.dim, fontSize: 7.5, marginTop: 3, lineHeight: 1.4 }}>{model.reason.slice(0, 120)}</div>
                  )}
                </div>
              );
            })}
            {/* Live consensus */}
            {consensusStream.currentConsensus && consensusStream.models.length > 0 && (
              <div style={{
                marginTop: 6,
                background: `${consensusStream.currentConsensus.recommendation === 'BUY' ? C.green : consensusStream.currentConsensus.recommendation === 'SELL' ? C.red : C.yellow}12`,
                border: `1px solid ${consensusStream.currentConsensus.recommendation === 'BUY' ? C.green : consensusStream.currentConsensus.recommendation === 'SELL' ? C.red : C.yellow}30`,
                borderRadius: 8,
                padding: '8px 10px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ color: consensusStream.currentConsensus.recommendation === 'BUY' ? C.green : consensusStream.currentConsensus.recommendation === 'SELL' ? C.red : C.yellow, fontSize: 12, fontWeight: 800 }}>
                      {consensusStream.currentConsensus.recommendation === 'BUY' ? '▲ صعود' : consensusStream.currentConsensus.recommendation === 'SELL' ? '▼ هبوط' : '◆ محايد'}
                    </span>
                    <span style={{ color: C.dim, fontSize: 8, marginLeft: 6 }}>إجماع مباشر</span>
                  </div>
                  <div style={{ color: C.text, fontSize: 16, fontWeight: 900 }}>{consensusStream.currentConsensus.consensusScore}%</div>
                </div>
                <div style={{ display: 'flex', gap: 2, marginTop: 6, height: 4, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ flex: consensusStream.currentConsensus.buyWeight, background: C.green, borderRadius: 2 }} />
                  <div style={{ flex: consensusStream.currentConsensus.holdWeight, background: C.yellow, borderRadius: 2 }} />
                  <div style={{ flex: consensusStream.currentConsensus.sellWeight, background: C.red, borderRadius: 2 }} />
                </div>
              </div>
            )}
            {consensusStream.status === 'error' && consensusStream.models.length === 0 && (
              <div style={{ textAlign: 'center', padding: 16, color: C.red, fontSize: 9 }}>
                خطأ في الاتصال: {consensusStream.error || 'غير معروف'}
              </div>
            )}
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}
