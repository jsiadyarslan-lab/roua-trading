// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — AI Pattern Recognition Panel
// Professional design — click any pattern to navigate chart
// Draws patterns visually on chart, trend lines, entry/exit
// ═══════════════════════════════════════════════════════════

'use client';

import { useState, useCallback } from 'react';
import type { AIPattern, CandleData, AIEntryExit } from '@/lib/charts/types';

interface SupportResistanceLevel {
  price: number;
  type: 'support' | 'resistance';
  strength: 'weak' | 'medium' | 'strong';
  touches: number;
}

interface TrendLine {
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
}

interface AIPatternPanelProps {
  symbol: string;
  candles: CandleData[];
  onPatternsDetected: (result: AIAnalysisResult) => void;
  onPatternClick?: (pattern: AIPattern) => void;
  onLevelClick?: (level: SupportResistanceLevel) => void;
  onTrendLineClick?: (trendLine: TrendLine) => void;
  onEntryExitClick?: (entryExit: AIEntryExit) => void;
  onClose: () => void;
}

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

type TabKey = 'patterns' | 'sr' | 'trend' | 'entry';

export function AIPatternPanel({
  symbol,
  candles,
  onPatternsDetected,
  onPatternClick,
  onLevelClick,
  onTrendLineClick,
  onEntryExitClick,
  onClose,
}: AIPatternPanelProps) {
  const [loading, setLoading] = useState(false);
  const [entryLoading, setEntryLoading] = useState(false);
  const [patterns, setPatterns] = useState<AIPattern[]>([]);
  const [srLevels, setSrLevels] = useState<SupportResistanceLevel[]>([]);
  const [trendLines, setTrendLines] = useState<TrendLine[]>([]);
  const [entryExit, setEntryExit] = useState<AIEntryExit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('patterns');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const analyzePatterns = useCallback(async () => {
    if (!candles || !candles.length) return;

    setLoading(true);
    setError(null);

    try {
      const last50 = candles.slice(-50);
      const ohlcSummary = last50.map(c =>
        `t=${new Date(c.time * 1000).toISOString().slice(0, 16)} O=${c.open} H=${c.high} L=${c.low} C=${c.close} V=${c.volume}`
      ).join('\n');

      const response = await fetch('/api/ai/chart-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          candles: ohlcSummary,
          instruction: `Analyze the following OHLC candlestick data for ${symbol}. Identify any candlestick patterns from this list: Doji, Hammer, Inverted Hammer, Engulfing (Bullish/Bearish), Morning Star, Evening Star, Three White Soldiers, Three Black Crows, Harami, Piercing Line, Dark Cloud Cover, Spinning Top, Marubozu, Shooting Star, Dragonfly Doji, Gravestone Doji. Return ONLY a JSON array of detected patterns. Each pattern object must have: "type" (English name), "timeIndex" (0-based index in the data), "confidence" (0-1), "direction" ("bullish"|"bearish"|"neutral"). Example: [{"type":"Hammer","timeIndex":45,"confidence":0.85,"direction":"bullish"}]`,
        }),
      });

      if (!response.ok) throw new Error('فشل في تحليل الأنماط');

      const result = await response.json();
      const detectedPatterns: AIPattern[] = [];

      try {
        let parsed = result.patterns || result.data || result;
        if (typeof parsed === 'string') {
          const jsonMatch = parsed.match(/\[[\s\S]*\]/);
          if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
        }

        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed.forEach((p: any) => {
            const idx = p.timeIndex ?? p.index ?? 0;
            const candle = last50[idx];
            if (!candle) return;
            const shapePoints = buildPatternShape(p.type, candle, last50[idx - 1]);
            detectedPatterns.push({
              type: p.type || 'Unknown',
              labelAr: PATTERN_NAMES_AR[p.type] || p.type,
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
        }
      } catch {
        const localPatterns = detectLocalPatterns(last50);
        detectedPatterns.push(...localPatterns);
      }

      setPatterns(detectedPatterns);

      const levels = detectSupportResistance(candles);
      setSrLevels(levels);

      const lines = detectTrendLines(candles);
      setTrendLines(lines);

      onPatternsDetected({
        patterns: detectedPatterns,
        supportLevels: levels.filter(l => l.type === 'support'),
        resistanceLevels: levels.filter(l => l.type === 'resistance'),
        trendLines: lines,
        entryExit: null,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء التحليل');
      const last50 = (candles || []).slice(-50);
      const localPatterns = detectLocalPatterns(last50);
      const levels = detectSupportResistance(candles || []);
      const lines = detectTrendLines(candles || []);
      setPatterns(localPatterns);
      setSrLevels(levels);
      setTrendLines(lines);
      onPatternsDetected({
        patterns: localPatterns,
        supportLevels: levels.filter(l => l.type === 'support'),
        resistanceLevels: levels.filter(l => l.type === 'resistance'),
        trendLines: lines,
        entryExit: null,
      });
    } finally {
      setLoading(false);
    }
  }, [candles, symbol, onPatternsDetected]);

  // ── Analyze Entry/Exit Points ──
  const analyzeEntryExit = useCallback(async () => {
    if (!candles || !candles.length) return;

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
      const trendInfo = lines.map(l => `${l.type === 'ascending' ? 'صاعد' : 'هابط'} (${l.strength})`).join(', ');

      const response = await fetch('/api/ai/chart-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          candles: ohlcSummary,
          instruction: `You are an expert forex/crypto analyst. Based on the following OHLC data for ${symbol}, determine the best entry and exit points RIGHT NOW. The current price is ${lastCandle.close}. Support levels: ${supportPrices || 'N/A'}. Resistance levels: ${resistancePrices || 'N/A'}. Trend: ${trendInfo || 'N/A'}. Return ONLY a JSON object with: "direction" ("long" or "short"), "entryPrice" (number), "stopLoss" (number), "takeProfit" (number), "confidence" (0-1), "reasonAr" (Arabic explanation, 2-3 sentences), "keyLevels" (array of {price: number, label: string} with key support/resistance). Example: {"direction":"long","entryPrice":65000,"stopLoss":64500,"takeProfit":66000,"confidence":0.75,"reasonAr":"السعر فوق مستوى الدعم مع نمط ابتلاع صعودي","keyLevels":[{"price":64500,"label":"دعم قوي"},{"price":66000,"label":"مقاومة"}]}`,
        }),
      });

      if (!response.ok) throw new Error('فشل في تحليل نقاط الدخول');

      const result = await response.json();
      let parsed = result.patterns || result.data || result;

      if (typeof parsed === 'string') {
        const jsonMatch = parsed.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      }

      if (parsed && parsed.direction && parsed.entryPrice) {
        const aiEntryExit: AIEntryExit = {
          direction: parsed.direction === 'long' ? 'long' : 'short',
          entryPrice: Number(parsed.entryPrice) || lastCandle.close,
          stopLoss: Number(parsed.stopLoss) || 0,
          takeProfit: Number(parsed.takeProfit) || 0,
          confidence: Number(parsed.confidence) || 0.5,
          reasonAr: parsed.reasonAr || 'تحليل AI',
          keyLevels: Array.isArray(parsed.keyLevels) ? parsed.keyLevels.map((k: any) => ({
            price: Number(k.price) || 0,
            label: String(k.label || ''),
          })) : [],
        };
        setEntryExit(aiEntryExit);
        setActiveTab('entry');
        onPatternsDetected({
          patterns: patterns,
          supportLevels: srLevels.filter(l => l.type === 'support'),
          resistanceLevels: srLevels.filter(l => l.type === 'resistance'),
          trendLines: trendLines,
          entryExit: aiEntryExit,
        });
      } else {
        // AI didn't return valid entry/exit — generate local one
        const localEE = generateLocalEntryExit(lastCandle, levels, lines);
        setEntryExit(localEE);
        setActiveTab('entry');
      }
    } catch {
      // Fallback to local analysis
      const lastCandle = candles[candles.length - 1];
      const levels = detectSupportResistance(candles);
      const lines = detectTrendLines(candles);
      const localEE = generateLocalEntryExit(lastCandle, levels, lines);
      setEntryExit(localEE);
      setActiveTab('entry');
    } finally {
      setEntryLoading(false);
    }
  }, [candles, symbol, patterns, srLevels, trendLines, onPatternsDetected]);

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

  const tabs: { key: TabKey; label: string; icon: string; count: number }[] = [
    { key: 'patterns', label: 'الأنماط', icon: '🕯', count: patterns.length },
    { key: 'sr', label: 'الدعم/المقاومة', icon: '⚡', count: srLevels.length },
    { key: 'trend', label: 'الاتجاهات', icon: '📉', count: trendLines.length },
    { key: 'entry', label: 'دخول/خروج', icon: '🎯', count: entryExit ? 1 : 0 },
  ];

  return (
    <div style={{
      background: C.bg,
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      zIndex: 500,
      width: 320,
      maxHeight: 520,
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
              تحليل AI
            </div>
            <div style={{ fontSize: 9, color: C.cyan, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: 0.4 }}>
              {symbol}
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
              جاري التحليل...
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              تحليل الأنماط والمستويات
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
              جاري التحليل...
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              تحليل نقاط الدخول والخروج
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
                          {p.labelAr}
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
                              ✓ رسم
                            </span>
                          )}
                        </div>
                        <div style={{
                          fontSize: 9, color: C.textDim, fontWeight: 400,
                          fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.4,
                          display: 'flex', alignItems: 'center', gap: 6, marginTop: 1,
                        }}>
                          <span>{new Date(p.time * 1000).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}</span>
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
                اضغط على زر التحليل للبدء
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
                  const strengthLabel = level.strength === 'strong' ? 'قوي' : level.strength === 'medium' ? 'متوسط' : 'ضعيف';
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
                          {isSupport ? 'دعم' : 'مقاومة'}
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
                اضغط على زر التحليل للبدء
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
                  const strengthLabel = line.strength === 'strong' ? 'قوي' : line.strength === 'medium' ? 'متوسط' : 'ضعيف';
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
                          {isAsc ? 'اتجاه صاعد' : 'اتجاه هابط'}
                          <span style={{ fontSize: 8, color: C.textMuted, fontWeight: 400, fontFamily: "'JetBrains Mono', monospace", marginRight: 4 }}>
                            ({strengthLabel})
                          </span>
                          <span style={{
                            fontSize: 7, color: C.cyan, fontWeight: 600,
                            background: 'rgba(0,212,255,0.1)', padding: '0 4px',
                            borderRadius: 2, marginRight: 4,
                          }}>
                            ✓ رسم
                          </span>
                        </div>
                        <div style={{ fontSize: 9, color: C.textDim, fontFamily: "'JetBrains Mono', monospace", marginTop: 1 }}>
                          {line.startPoint.price.toFixed(2)} → {line.endPoint.price.toFixed(2)}
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
                اضغط على زر التحليل للبدء
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
                    {entryExit.direction === 'long' ? '▲ شراء LONG' : '▼ بيع SHORT'}
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
                  { label: 'سعر الدخول', value: entryExit.entryPrice, color: C.cyan, icon: '→' },
                  { label: 'وقف الخسارة', value: entryExit.stopLoss, color: C.danger, icon: '✕' },
                  { label: 'جني الأرباح', value: entryExit.takeProfit, color: C.success, icon: '★' },
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
                  const risk = Math.abs(entryExit.entryPrice - entryExit.stopLoss);
                  const reward = Math.abs(entryExit.takeProfit - entryExit.entryPrice);
                  const rr = risk > 0 ? (reward / risk).toFixed(1) : '—';
                  return (
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      padding: '6px 0',
                    }}>
                      <span style={{ fontSize: 9, color: C.textMuted, fontFamily: "'Cairo', sans-serif" }}>نسبة المخاطرة/المكافأة</span>
                      <span style={{
                        fontSize: 13, color: Number(rr) >= 2 ? C.success : Number(rr) >= 1 ? C.warning : C.danger,
                        fontWeight: 900, fontFamily: "'JetBrains Mono', monospace",
                      }}>
                        1:{rr}
                      </span>
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
                      المستويات المهمة
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
              </div>
            ) : (
              <div style={{
                textAlign: 'center', color: C.textMuted, fontSize: 10,
                padding: '20px 0', fontFamily: "'Cairo', sans-serif",
              }}>
                اضغط على "تحليل نقاط الدخول" للبدء
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
          انقر على أي عنصر لرسمه على الشارت والانتقال إليه
        </div>
      )}

      {/* Spinner animation */}
      <style>{`@keyframes aiSpin { to { transform: rotate(360deg); } }`}</style>
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

  // Engulfing patterns — highlight the engulfing zone
  if (patternType === 'Engulfing Bullish' || patternType === 'Engulfing Bearish') {
    if (prevCandle) {
      const prevBodyTop = Math.max(prevCandle.open, prevCandle.close);
      const prevBodyBot = Math.min(prevCandle.open, prevCandle.close);
      return [
        { time: prevCandle.time, price: prevBodyTop },
        { time: t, price: bodyTop },
        { time: t, price: bodyBot },
        { time: prevCandle.time, price: prevBodyBot },
      ];
    }
    return [
      { time: t, price: bodyTop },
      { time: t, price: bodyBot },
    ];
  }

  // Hammer — highlight the long lower wick
  if (patternType === 'Hammer') {
    return [
      { time: t, price: bodyTop },
      { time: t, price: l },
    ];
  }

  // Shooting Star — highlight the long upper wick
  if (patternType === 'Shooting Star' || patternType === 'Inverted Hammer') {
    return [
      { time: t, price: bodyBot },
      { time: t, price: h },
    ];
  }

  // Doji — highlight the cross shape
  if (patternType.includes('Doji')) {
    return [
      { time: t, price: h },
      { time: t, price: l },
    ];
  }

  // Marubozu — highlight the large body
  if (patternType === 'Marubozu') {
    return [
      { time: t, price: bodyTop },
      { time: t, price: bodyBot },
    ];
  }

  return undefined;
}

// ── Generate Local Entry/Exit (fallback when AI is unavailable) ──
function generateLocalEntryExit(lastCandle: CandleData, levels: SupportResistanceLevel[], _trendLines: TrendLine[]): AIEntryExit {
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
  if (nearestSupport) keyLevels.push({ price: nearestSupport.price, label: `دعم ${nearestSupport.strength === 'strong' ? 'قوي' : nearestSupport.strength === 'medium' ? 'متوسط' : 'ضعيف'}` });
  if (nearestResistance) keyLevels.push({ price: nearestResistance.price, label: `مقاومة ${nearestResistance.strength === 'strong' ? 'قوية' : nearestResistance.strength === 'medium' ? 'متوسطة' : 'ضعيفة'}` });

  return {
    direction,
    entryPrice,
    stopLoss,
    takeProfit,
    confidence,
    reasonAr: isBullish
      ? `الشمعة الأخيرة صاعدة مع إغلاق عند ${price.toFixed(price > 1000 ? 2 : 5)}. يُنصح بالشراء مع وقف خسارة تحت أقرب دعم.`
      : `الشمعة الأخيرة هابطة مع إغلاق عند ${price.toFixed(price > 1000 ? 2 : 5)}. يُنصح بالبيع مع وقف خسارة فوق أقرب مقاومة.`,
    keyLevels,
  };
}

// ── Basic Local Pattern Detection (fallback) ─────────────
function detectLocalPatterns(candles: CandleData[]): AIPattern[] {
  const patterns: AIPattern[] = [];
  if (!candles || candles.length < 5) return patterns;

  for (let i = 4; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;

    if (range > 0 && body / range < 0.1) {
      const shapePoints = buildPatternShape('Doji', c, prev);
      patterns.push({ type: 'Doji', labelAr: 'دوجي', time: c.time, price: c.close, confidence: 0.7, direction: 'neutral', shapePoints, shapeType: 'line', shapeColor: 'rgba(251,191,36,0.3)' });
    }

    if (lowerWick > body * 2 && upperWick < body * 0.5) {
      const shapePoints = buildPatternShape('Hammer', c, prev);
      patterns.push({ type: 'Hammer', labelAr: 'مطرقة', time: c.time, price: c.close, confidence: 0.75, direction: 'bullish', shapePoints, shapeType: 'line', shapeColor: 'rgba(0,255,163,0.4)' });
    }

    if (upperWick > body * 2 && lowerWick < body * 0.5) {
      const shapePoints = buildPatternShape('Shooting Star', c, prev);
      patterns.push({ type: 'Shooting Star', labelAr: 'نجم ساقط', time: c.time, price: c.close, confidence: 0.7, direction: 'bearish', shapePoints, shapeType: 'line', shapeColor: 'rgba(255,71,87,0.4)' });
    }

    if (prev.close < prev.open && c.close > c.open && c.open <= prev.close && c.close >= prev.open) {
      const shapePoints = buildPatternShape('Engulfing Bullish', c, prev);
      patterns.push({ type: 'Engulfing Bullish', labelAr: 'ابتلاع صعودي', time: c.time, price: c.close, confidence: 0.8, direction: 'bullish', shapePoints, shapeType: 'polygon', shapeColor: 'rgba(0,255,163,0.15)' });
    }

    if (prev.close > prev.open && c.close < c.open && c.open >= prev.close && c.close <= prev.open) {
      const shapePoints = buildPatternShape('Engulfing Bearish', c, prev);
      patterns.push({ type: 'Engulfing Bearish', labelAr: 'ابتلاع هبوطي', time: c.time, price: c.close, confidence: 0.8, direction: 'bearish', shapePoints, shapeType: 'polygon', shapeColor: 'rgba(255,71,87,0.15)' });
    }

    if (range > 0 && body / range < 0.3 && Math.abs(upperWick - lowerWick) / range < 0.15) {
      patterns.push({ type: 'Spinning Top', labelAr: 'قمة دوارة', time: c.time, price: c.close, confidence: 0.6, direction: 'neutral' });
    }

    if (body > 0 && range > 0 && body / range > 0.85) {
      const shapePoints = buildPatternShape('Marubozu', c, prev);
      patterns.push({ type: 'Marubozu', labelAr: 'ماروبوزو', time: c.time, price: c.close, confidence: 0.75, direction: c.close > c.open ? 'bullish' : 'bearish', shapePoints, shapeType: 'line', shapeColor: c.close > c.open ? 'rgba(0,255,163,0.4)' : 'rgba(255,71,87,0.4)' });
    }
  }

  return patterns.slice(-10);
}

// ── Support/Resistance Level Detection ──────────────────
function detectSupportResistance(candles: CandleData[]): SupportResistanceLevel[] {
  if (!candles || candles.length < 20) return [];
  const levels: SupportResistanceLevel[] = [];
  const windowSize = 10;

  for (let i = windowSize; i < candles.length - windowSize; i++) {
    const slice = candles.slice(i - windowSize, i + windowSize + 1);
    const current = candles[i];

    const isLocalHigh = slice.every(c => current.high >= c.high);
    if (isLocalHigh) {
      const existing = levels.find(l => l.type === 'resistance' && Math.abs(l.price - current.high) / current.high < 0.005);
      if (existing) {
        existing.touches++;
        existing.strength = existing.touches >= 3 ? 'strong' : existing.touches >= 2 ? 'medium' : 'weak';
      } else {
        levels.push({ price: current.high, type: 'resistance', strength: 'weak', touches: 1 });
      }
    }

    const isLocalLow = slice.every(c => current.low <= c.low);
    if (isLocalLow) {
      const existing = levels.find(l => l.type === 'support' && Math.abs(l.price - current.low) / current.low < 0.005);
      if (existing) {
        existing.touches++;
        existing.strength = existing.touches >= 3 ? 'strong' : existing.touches >= 2 ? 'medium' : 'weak';
      } else {
        levels.push({ price: current.low, type: 'support', strength: 'weak', touches: 1 });
      }
    }
  }

  const supportLevels = levels.filter(l => l.type === 'support').sort((a, b) => b.touches - a.touches).slice(0, 3);
  const resistanceLevels = levels.filter(l => l.type === 'resistance').sort((a, b) => b.touches - a.touches).slice(0, 3);

  return [...supportLevels, ...resistanceLevels];
}

// ── Trend Line Detection ───────────────────────────────
function detectTrendLines(candles: CandleData[]): TrendLine[] {
  if (!candles || candles.length < 30) return [];
  const lines: TrendLine[] = [];
  const lookback = Math.min(100, candles.length);

  const lows: { time: number; price: number }[] = [];
  for (let i = candles.length - lookback; i < candles.length; i++) {
    if (i < 2) continue;
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1] || curr;
    if (curr.low <= prev.low && curr.low <= next.low) {
      lows.push({ time: curr.time, price: curr.low });
    }
  }

  if (lows.length >= 2) {
    const first = lows[0];
    const last = lows[lows.length - 1];
    if (last.price > first.price) {
      lines.push({
        type: 'ascending',
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

  return lines;
}
