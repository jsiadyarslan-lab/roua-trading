// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — AI Pattern Recognition Panel
// Professional design — click any pattern to navigate chart
// ═══════════════════════════════════════════════════════════

'use client';

import { useState, useCallback } from 'react';
import type { AIPattern, CandleData } from '@/lib/charts/types';

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
}

interface AIPatternPanelProps {
  symbol: string;
  candles: CandleData[];
  onPatternsDetected: (result: AIAnalysisResult) => void;
  onPatternClick?: (pattern: AIPattern) => void;
  onLevelClick?: (level: SupportResistanceLevel) => void;
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

type TabKey = 'patterns' | 'sr' | 'trend';

export function AIPatternPanel({
  symbol,
  candles,
  onPatternsDetected,
  onPatternClick,
  onLevelClick,
  onClose,
}: AIPatternPanelProps) {
  const [loading, setLoading] = useState(false);
  const [patterns, setPatterns] = useState<AIPattern[]>([]);
  const [srLevels, setSrLevels] = useState<SupportResistanceLevel[]>([]);
  const [trendLines, setTrendLines] = useState<TrendLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('patterns');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const analyzePatterns = useCallback(async () => {
    if (!candles.length) return;

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
            detectedPatterns.push({
              type: p.type || 'Unknown',
              labelAr: PATTERN_NAMES_AR[p.type] || p.type,
              time: candle.time,
              price: candle.close,
              confidence: p.confidence ?? 0.5,
              direction: p.direction || 'neutral',
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
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء التحليل');
      const last50 = candles.slice(-50);
      const localPatterns = detectLocalPatterns(last50);
      const levels = detectSupportResistance(candles);
      const lines = detectTrendLines(candles);
      setPatterns(localPatterns);
      setSrLevels(levels);
      setTrendLines(lines);
      onPatternsDetected({
        patterns: localPatterns,
        supportLevels: levels.filter(l => l.type === 'support'),
        resistanceLevels: levels.filter(l => l.type === 'resistance'),
        trendLines: lines,
      });
    } finally {
      setLoading(false);
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

  const tabs: { key: TabKey; label: string; icon: string; count: number }[] = [
    { key: 'patterns', label: 'الأنماط', icon: '🕯', count: patterns.length },
    { key: 'sr', label: 'الدعم/المقاومة', icon: '⚡', count: srLevels.length },
    { key: 'trend', label: 'الاتجاهات', icon: '📉', count: trendLines.length },
  ];

  return (
    <div style={{
      position: 'absolute',
      top: 40,
      left: 8,
      background: C.bg,
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      zIndex: 500,
      width: 300,
      maxHeight: 480,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 20px rgba(0,212,255,0.04)',
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: `1px solid ${C.border}`,
        background: `linear-gradient(180deg, ${C.card} 0%, rgba(17,22,32,0.6) 100%)`,
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

      {/* ── Analyze Button ── */}
      <div style={{ padding: '10px 14px' }}>
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
      {(patterns.length > 0 || srLevels.length > 0 || trendLines.length > 0) && (
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
                      {/* Direction badge */}
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

                      {/* Info */}
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

                      {/* Confidence bar */}
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
                      {/* Icon */}
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

                      {/* Info */}
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

                      {/* Strength dots */}
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

                  return (
                    <button
                      key={i}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 10px',
                        background: isAsc ? C.upBg : C.downBg,
                        border: '1px solid transparent',
                        borderRadius: 7,
                        cursor: 'pointer',
                        textAlign: 'right',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderActive; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; }}
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
      </div>

      {/* ── Footer hint ── */}
      {(patterns.length > 0 || srLevels.length > 0) && (
        <div style={{
          padding: '6px 14px',
          borderTop: `1px solid ${C.border}`,
          fontSize: 8,
          color: C.textMuted,
          fontFamily: "'Cairo', sans-serif",
          textAlign: 'center',
        }}>
          انقر على أي عنصر للانتقال إليه على الشارت
        </div>
      )}

      {/* Spinner animation */}
      <style>{`@keyframes aiSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Basic Local Pattern Detection (fallback) ─────────────
function detectLocalPatterns(candles: CandleData[]): AIPattern[] {
  const patterns: AIPattern[] = [];
  if (candles.length < 5) return patterns;

  for (let i = 4; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;

    if (range > 0 && body / range < 0.1) {
      patterns.push({ type: 'Doji', labelAr: 'دوجي', time: c.time, price: c.close, confidence: 0.7, direction: 'neutral' });
    }

    if (lowerWick > body * 2 && upperWick < body * 0.5) {
      patterns.push({ type: 'Hammer', labelAr: 'مطرقة', time: c.time, price: c.close, confidence: 0.75, direction: 'bullish' });
    }

    if (upperWick > body * 2 && lowerWick < body * 0.5) {
      patterns.push({ type: 'Shooting Star', labelAr: 'نجم ساقط', time: c.time, price: c.close, confidence: 0.7, direction: 'bearish' });
    }

    if (prev.close < prev.open && c.close > c.open && c.open <= prev.close && c.close >= prev.open) {
      patterns.push({ type: 'Engulfing Bullish', labelAr: 'ابتلاع صعودي', time: c.time, price: c.close, confidence: 0.8, direction: 'bullish' });
    }

    if (prev.close > prev.open && c.close < c.open && c.open >= prev.close && c.close <= prev.open) {
      patterns.push({ type: 'Engulfing Bearish', labelAr: 'ابتلاع هبوطي', time: c.time, price: c.close, confidence: 0.8, direction: 'bearish' });
    }

    if (range > 0 && body / range < 0.3 && Math.abs(upperWick - lowerWick) / range < 0.15) {
      patterns.push({ type: 'Spinning Top', labelAr: 'قمة دوارة', time: c.time, price: c.close, confidence: 0.6, direction: 'neutral' });
    }

    if (body > 0 && range > 0 && body / range > 0.85) {
      patterns.push({ type: 'Marubozu', labelAr: 'ماروبوزو', time: c.time, price: c.close, confidence: 0.75, direction: c.close > c.open ? 'bullish' : 'bearish' });
    }
  }

  return patterns.slice(-10);
}

// ── Support/Resistance Level Detection ──────────────────
function detectSupportResistance(candles: CandleData[]): SupportResistanceLevel[] {
  if (candles.length < 20) return [];
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
  if (candles.length < 30) return [];
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
