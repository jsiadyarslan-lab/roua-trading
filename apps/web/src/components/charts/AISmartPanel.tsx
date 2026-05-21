// ═══════════════════════════════════════════════════════════
// ROUA Trading — AI Smart Panel (Redesigned)
// Auto-detection every 5 min + instant trade signals
// Single view — no tabs — clean and actionable
// ═══════════════════════════════════════════════════════════
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { AIAnalysisResult, SupportResistanceLevel, TrendLine } from './AIPatternPanel';
import type { AIPattern, CandleData } from '@/lib/charts/types';
import { detectLocalPatterns, detectSupportResistance, detectTrendLines } from './AIPatternPanel';

interface AISmartPanelProps {
  symbol: string;
  candles: CandleData[];
  currentPrice: number | null;
  onPatternsDetected: (result: AIAnalysisResult) => void;
  onClose: () => void;
  onExecuteTrade?: (side: 'long' | 'short', entry: number, sl: number, tp: number) => void;
  chartApiRef?: React.RefObject<any>;
}

const C = {
  bg: '#0b0e17',
  bgCard: 'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.07)',
  text: 'rgba(255,255,255,0.92)',
  textDim: 'rgba(255,255,255,0.5)',
  textMuted: 'rgba(255,255,255,0.3)',
  cyan: '#00D4FF',
  green: '#00FFA3',
  red: '#FF4757',
  yellow: '#fbbf24',
};

const PATTERN_NAMES_AR: Record<string, string> = {
  'Doji': 'دوجي', 'Hammer': 'مطرقة', 'Inverted Hammer': 'مطرقة مقلوبة',
  'Engulfing Bullish': 'ابتلاع صعودي', 'Engulfing Bearish': 'ابتلاع هبوطي',
  'Morning Star': 'نجمة الصباح', 'Evening Star': 'نجمة المساء',
  'Three White Soldiers': 'ثلاثة جنود بيض', 'Three Black Crows': 'ثلاثة غربان سود',
  'Shooting Star': 'نجم ساقط', 'Harami Bullish': 'هارامي صعودي', 'Harami Bearish': 'هارامي هبوطي',
  'Tweezer Bottom': 'ملقط سفلي', 'Tweezer Top': 'ملقط علوي',
  'Marubozu': 'ماروبوزو', 'Spinning Top': 'قمة دوارة', 'Dragonfly Doji': 'دوجي يعسوب',
  'Gravestone Doji': 'دوجي شاهد قبر', 'Piercing Line': 'خط اختراق', 'Dark Cloud Cover': 'غطاء سحابة داكنة',
};

const AUTO_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function AISmartPanel({ symbol, candles, currentPrice, onPatternsDetected, onClose, onExecuteTrade, chartApiRef }: AISmartPanelProps) {
  const [loading, setLoading] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState<{
    patterns: AIPattern[];
    support: number[];
    resistance: number[];
    signal: 'BUY' | 'SELL' | 'WAIT';
    confidence: number;
    topPattern: AIPattern | null;
    entry: number;
    sl: number;
    tp: number;
    timestamp: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoMode, setAutoMode] = useState(false); // Manual by default — user enables auto
  const [countdown, setCountdown] = useState(AUTO_INTERVAL / 1000);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const failCountRef = useRef(0);
  const isRunningRef = useRef(false); // Hard lock to prevent concurrent calls

  const analyze = useCallback(async () => {
    // Hard lock — prevents concurrent execution even with async state
    if (isRunningRef.current) return;
    if (loading || !candles || candles.length < 10) return;
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    isRunningRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const last50 = candles.slice(-50);
      const ohlcSummary = last50.map(c =>
        `t=${new Date(c.time * 1000).toISOString().slice(0, 16)} O=${c.open.toFixed(2)} H=${c.high.toFixed(2)} L=${c.low.toFixed(2)} C=${c.close.toFixed(2)}`
      ).join('\n');

      const response = await fetch('/api/ai/chart-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          candles: ohlcSummary,
          instruction: `Analyze ${symbol} OHLC data. Return JSON: {"patterns":[{"type":string,"timeIndex":number,"confidence":number,"direction":"bullish"|"bearish"|"neutral"}],"signal":"BUY"|"SELL"|"WAIT","confidence":number,"entry":number,"stopLoss":number,"takeProfit":number}. Use last price as entry reference.`,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        failCountRef.current++;
        // After 3 consecutive failures, disable auto-mode to stop spamming
        if (failCountRef.current >= 3) {
          setAutoMode(false);
        }
        throw new Error(response.status === 503 ? 'ai_unavailable' : 'فشل الاتصال بالـ AI');
      }
      const result = await response.json();

      // Parse patterns
      let parsed = result.patterns || [];
      if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { parsed = []; } }

      const aiPatterns: AIPattern[] = (Array.isArray(parsed) ? parsed : []).map((p: any) => {
        const idx = Math.min(Math.max(p.timeIndex ?? 0, 0), last50.length - 1);
        const candle = last50[idx];
        return {
          type: p.type || 'Unknown',
          labelAr: PATTERN_NAMES_AR[p.type] || p.type,
          time: candle?.time ?? 0,
          price: candle?.close ?? 0,
          confidence: p.confidence ?? 0.5,
          direction: p.direction || 'neutral',
        };
      }).filter((p: AIPattern) => p.time > 0);

      // Local detection as supplement
      const localPatterns = detectLocalPatterns(last50);
      const allPatterns = [...aiPatterns, ...localPatterns].sort((a, b) => b.time - a.time).slice(0, 15);

      // Support/Resistance
      const levels = detectSupportResistance(candles);
      const supportLevels = levels.filter(l => l.type === 'support').slice(0, 3);
      const resistanceLevels = levels.filter(l => l.type === 'resistance').slice(0, 3);

      // Signal
      const signal = result.signal || (aiPatterns.find(p => p.direction === 'bullish') ? 'BUY' : aiPatterns.find(p => p.direction === 'bearish') ? 'SELL' : 'WAIT');
      const confidence = result.confidence ?? (allPatterns[0]?.confidence ?? 0.5);
      const price = currentPrice ?? candles[candles.length - 1]?.close ?? 0;
      const entry = result.entry || price;
      const slDist = price * 0.008;
      const tpDist = price * 0.016;
      const sl = result.stopLoss || (signal === 'BUY' ? entry - slDist : entry + slDist);
      const tp = result.takeProfit || (signal === 'BUY' ? entry + tpDist : entry - tpDist);

      const analysis = {
        patterns: allPatterns,
        support: supportLevels.map(l => l.price),
        resistance: resistanceLevels.map(l => l.price),
        signal: signal as 'BUY' | 'SELL' | 'WAIT',
        confidence,
        topPattern: allPatterns[0] || null,
        entry,
        sl,
        tp,
        timestamp: Date.now(),
      };

      setLastAnalysis(analysis);
      setCountdown(AUTO_INTERVAL / 1000);

      // Notify chart
      const trendLines = detectTrendLines(candles);
      onPatternsDetected({
        patterns: allPatterns,
        supportLevels,
        resistanceLevels,
        trendLines,
        entryExit: null,
      });

    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      const isUnavailable = e?.message === 'ai_unavailable';
      // Fallback to local only
      try {
        const last50 = candles.slice(-50);
        const localPatterns = detectLocalPatterns(last50);
        const levels = detectSupportResistance(candles);
        const trendLines = detectTrendLines(candles);
        const supportLevels = levels.filter(l => l.type === 'support').slice(0, 3);
        const resistanceLevels = levels.filter(l => l.type === 'resistance').slice(0, 3);
        const allPatterns = localPatterns.sort((a, b) => b.time - a.time).slice(0, 15);
        const signal = allPatterns[0]?.direction === 'bullish' ? 'BUY' : allPatterns[0]?.direction === 'bearish' ? 'SELL' : 'WAIT';
        const price = currentPrice ?? candles[candles.length - 1]?.close ?? 0;
        setLastAnalysis({
          patterns: allPatterns, support: supportLevels.map(l => l.price), resistance: resistanceLevels.map(l => l.price),
          signal: signal as 'BUY'|'SELL'|'WAIT', confidence: allPatterns[0]?.confidence ?? 0.5,
          topPattern: allPatterns[0] || null, entry: price, sl: signal === 'BUY' ? price * 0.992 : price * 1.008,
          tp: signal === 'BUY' ? price * 1.016 : price * 0.984, timestamp: Date.now(),
        });
        onPatternsDetected({ patterns: allPatterns, supportLevels, resistanceLevels, trendLines, entryExit: null });
      } catch { if (!isUnavailable) setError('فشل التحليل'); }
    } finally {
      setLoading(false);
      isRunningRef.current = false;
    }
  }, [candles, symbol, currentPrice, onPatternsDetected]);

  // Stable ref for analyze — prevents auto-detect from re-triggering on every candle update
  const analyzeRef = useRef(analyze);
  useEffect(() => { analyzeRef.current = analyze; }, [analyze]);

  // Auto-detect every 5 minutes — only depends on autoMode
  useEffect(() => {
    if (!autoMode) {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      return;
    }
    // Run once immediately
    analyzeRef.current();
    setCountdown(AUTO_INTERVAL / 1000);
    timerRef.current = setInterval(() => { analyzeRef.current(); setCountdown(AUTO_INTERVAL / 1000); }, AUTO_INTERVAL);
    countdownRef.current = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [autoMode]); // NOTE: stable — does not depend on analyze/candles

  const fmtPrice = (p: number) => p > 999 ? p.toFixed(2) : p.toFixed(5);
  const fmtTime = (t: number) => new Date(t).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
  const signalColor = lastAnalysis?.signal === 'BUY' ? C.green : lastAnalysis?.signal === 'SELL' ? C.red : C.yellow;
  const confPct = Math.round((lastAnalysis?.confidence ?? 0) * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: C.bg, borderRadius: 10, overflow: 'hidden', fontFamily: "'Cairo', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>🧠</span>
          <div>
            <div style={{ color: C.text, fontSize: 11, fontWeight: 700 }}>تحليل ذكي</div>
            <div style={{ color: C.textMuted, fontSize: 9, fontFamily: "'JetBrains Mono', monospace" }}>{symbol}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Auto toggle */}
          <button onClick={() => setAutoMode(!autoMode)} style={{ background: autoMode ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${autoMode ? 'rgba(0,212,255,0.3)' : C.border}`, borderRadius: 4, color: autoMode ? C.cyan : C.textDim, fontSize: 9, padding: '2px 6px', cursor: 'pointer', outline: 'none' }}>
            {autoMode ? `⏱ ${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, '0')}` : '⏸ يدوي'}
          </button>
          {/* Refresh */}
          <button onClick={analyze} disabled={loading} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, color: loading ? C.textMuted : C.cyan, fontSize: 11, width: 24, height: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none' }}>
            {loading ? <span style={{ display: 'inline-block', width: 10, height: 10, border: `2px solid ${C.cyan}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'aiSpin 0.7s linear infinite' }} /> : '⟳'}
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: 14, cursor: 'pointer', lineHeight: 1, outline: 'none' }}>×</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {loading && !lastAnalysis && (
          <div style={{ padding: 24, textAlign: 'center', color: C.textDim, fontSize: 11 }}>
            <div style={{ marginBottom: 8, fontSize: 20 }}>🔍</div>
            جاري التحليل...
          </div>
        )}

        {error && !lastAnalysis && (
          <div style={{ padding: 16, textAlign: 'center', color: C.red, fontSize: 11 }}>{error}</div>
        )}

        {lastAnalysis && (
          <div style={{ padding: '0 0 8px' }}>
            {/* Signal Card */}
            <div style={{ margin: '8px 10px', padding: '10px 12px', background: `${signalColor}10`, border: `1px solid ${signalColor}30`, borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 18, fontWeight: 900, color: signalColor }}>
                    {lastAnalysis.signal === 'BUY' ? '▲' : lastAnalysis.signal === 'SELL' ? '▼' : '◆'}
                  </span>
                  <div>
                    <div style={{ color: signalColor, fontSize: 13, fontWeight: 800 }}>
                      {lastAnalysis.signal === 'BUY' ? 'شراء' : lastAnalysis.signal === 'SELL' ? 'بيع' : 'انتظار'}
                    </div>
                    {lastAnalysis.topPattern && (
                      <div style={{ color: C.textDim, fontSize: 9 }}>{lastAnalysis.topPattern.labelAr}</div>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: signalColor, fontSize: 16, fontWeight: 900 }}>{confPct}%</div>
                  <div style={{ color: C.textMuted, fontSize: 9 }}>ثقة</div>
                </div>
              </div>
              {/* Confidence bar */}
              <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                <div style={{ width: `${confPct}%`, height: '100%', background: signalColor, borderRadius: 2, transition: 'width 0.5s' }} />
              </div>
            </div>

            {/* Entry / SL / TP */}
            {lastAnalysis.signal !== 'WAIT' && (
              <div style={{ margin: '0 10px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                {[
                  { label: 'دخول', price: lastAnalysis.entry, color: C.cyan },
                  { label: 'SL وقف', price: lastAnalysis.sl, color: C.red },
                  { label: 'TP هدف', price: lastAnalysis.tp, color: C.green },
                ].map(({ label, price, color }) => (
                  <div key={label} style={{ background: `${color}08`, border: `1px solid ${color}20`, borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                    <div style={{ color: C.textMuted, fontSize: 8, marginBottom: 2 }}>{label}</div>
                    <div style={{ color, fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{fmtPrice(price)}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Execute trade button */}
            {lastAnalysis.signal !== 'WAIT' && onExecuteTrade && (
              <div style={{ margin: '0 10px 8px' }}>
                <button
                  onClick={() => onExecuteTrade(lastAnalysis.signal === 'BUY' ? 'long' : 'short', lastAnalysis.entry, lastAnalysis.sl, lastAnalysis.tp)}
                  style={{ width: '100%', padding: '7px', borderRadius: 6, border: 'none', background: lastAnalysis.signal === 'BUY' ? '#00C853' : '#F44336', color: lastAnalysis.signal === 'BUY' ? '#000' : '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: "'Cairo', sans-serif" }}
                >
                  {lastAnalysis.signal === 'BUY' ? '▲ تنفيذ شراء' : '▼ تنفيذ بيع'}
                </button>
              </div>
            )}

            {/* Support / Resistance */}
            {(lastAnalysis.support.length > 0 || lastAnalysis.resistance.length > 0) && (
              <div style={{ margin: '0 10px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div style={{ background: 'rgba(0,255,163,0.04)', border: '1px solid rgba(0,255,163,0.1)', borderRadius: 6, padding: '6px 8px' }}>
                  <div style={{ color: C.green, fontSize: 9, fontWeight: 700, marginBottom: 4 }}>دعم</div>
                  {lastAnalysis.support.map((p, i) => (
                    <div key={i} style={{ color: C.textDim, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>{fmtPrice(p)}</div>
                  ))}
                </div>
                <div style={{ background: 'rgba(255,71,87,0.04)', border: '1px solid rgba(255,71,87,0.1)', borderRadius: 6, padding: '6px 8px' }}>
                  <div style={{ color: C.red, fontSize: 9, fontWeight: 700, marginBottom: 4 }}>مقاومة</div>
                  {lastAnalysis.resistance.map((p, i) => (
                    <div key={i} style={{ color: C.textDim, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>{fmtPrice(p)}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Patterns list */}
            {lastAnalysis.patterns.length > 0 && (
              <div style={{ margin: '0 10px' }}>
                <div style={{ color: C.textMuted, fontSize: 9, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>الأنماط المكتشفة ({lastAnalysis.patterns.length})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {lastAnalysis.patterns.slice(0, 8).map((p, i) => (
                    <div key={i} style={{
                      background: p.direction === 'bullish' ? 'rgba(0,255,163,0.08)' : p.direction === 'bearish' ? 'rgba(255,71,87,0.08)' : 'rgba(251,191,36,0.08)',
                      border: `1px solid ${p.direction === 'bullish' ? 'rgba(0,255,163,0.2)' : p.direction === 'bearish' ? 'rgba(255,71,87,0.2)' : 'rgba(251,191,36,0.2)'}`,
                      borderRadius: 4, padding: '2px 6px', cursor: 'pointer',
                    }} onClick={() => {
                      if (chartApiRef?.current && p.time) {
                        const range = chartApiRef.current.timeScale().getVisibleRange();
                        if (range) {
                          const w = (range.to as number) - (range.from as number);
                          try { chartApiRef.current.timeScale().setVisibleRange({ from: (p.time - w * 0.4) as any, to: (p.time + w * 0.6) as any }); } catch {}
                        }
                      }
                    }}>
                      <span style={{ color: p.direction === 'bullish' ? C.green : p.direction === 'bearish' ? C.red : C.yellow, fontSize: 9, fontWeight: 700 }}>
                        {p.direction === 'bullish' ? '▲' : p.direction === 'bearish' ? '▼' : '◆'} {p.labelAr}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timestamp */}
            <div style={{ textAlign: 'center', marginTop: 8, color: C.textMuted, fontSize: 9 }}>
              آخر تحليل: {fmtTime(lastAnalysis.timestamp)}
            </div>
          </div>
        )}

        {!loading && !lastAnalysis && !error && (
          <div style={{ padding: 24, textAlign: 'center', color: C.textDim, fontSize: 11 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🧠</div>
            <div>اضغط ⟳ لبدء التحليل</div>
            <div style={{ color: C.textMuted, fontSize: 9, marginTop: 4 }}>أو فعّل التحليل التلقائي كل 5 دقائق</div>
          </div>
        )}
      </div>

      <style>{`@keyframes aiSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
