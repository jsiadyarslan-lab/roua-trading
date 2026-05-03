// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — AI Pattern Recognition Panel
// Uses z-ai-web-dev-sdk to detect 20+ candlestick patterns
// ═══════════════════════════════════════════════════════════

'use client';

import { useState, useCallback } from 'react';
import type { AIPattern, CandleData } from '@/lib/charts/types';

interface AIPatternPanelProps {
  symbol: string;
  candles: CandleData[];
  onPatternsDetected: (patterns: AIPattern[]) => void;
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

export function AIPatternPanel({ symbol, candles, onPatternsDetected, onClose }: AIPatternPanelProps) {
  const [loading, setLoading] = useState(false);
  const [patterns, setPatterns] = useState<AIPattern[]>([]);
  const [error, setError] = useState<string | null>(null);

  const analyzePatterns = useCallback(async () => {
    if (!candles.length) return;

    setLoading(true);
    setError(null);

    try {
      // Send OHLC data to AI for pattern recognition
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

      // Parse AI response
      try {
        let parsed = result.patterns || result.data || result;
        if (typeof parsed === 'string') {
          // Try to extract JSON from the string
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
        } else if (Array.isArray(parsed) && parsed.length === 0) {
          // Server returned empty patterns — try local detection
          const localPatterns = detectLocalPatterns(last50);
          detectedPatterns.push(...localPatterns);
        }
      } catch (parseErr) {
        // If AI response parsing fails, try local basic pattern detection
        const localPatterns = detectLocalPatterns(last50);
        detectedPatterns.push(...localPatterns);
      }

      setPatterns(detectedPatterns);
      onPatternsDetected(detectedPatterns);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء التحليل');
      // Fallback: local detection
      const last50 = candles.slice(-50);
      const localPatterns = detectLocalPatterns(last50);
      setPatterns(localPatterns);
      onPatternsDetected(localPatterns);
    } finally {
      setLoading(false);
    }
  }, [candles, symbol, onPatternsDetected]);

  const COLORS = {
    card: '#151A22',
    border: 'rgba(42,49,60,0.9)',
    cyan: '#00D4FF',
    text: '#F0F2F5',
    textSecondary: '#8B92A8',
    textMuted: '#8B92A8',
    success: '#00FFA3',
    danger: '#FF4757',
    warning: '#fbbf24',
    bg: '#0B0E14',
  };

  return (
    <div style={{
      position: 'absolute',
      top: 40,
      left: 8,
      background: COLORS.card,
      border: '1px solid rgba(0,212,255,0.2)',
      borderRadius: 10,
      padding: 12,
      zIndex: 500,
      boxShadow: '0 15px 45px rgba(0,0,0,0.85)',
      backdropFilter: 'blur(10px)',
      width: 260,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: COLORS.text, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>
          🔍 تحليل الأنماط بالذكاء الاصطناعي
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* Analyze Button */}
      <button
        onClick={analyzePatterns}
        disabled={loading}
        style={{
          width: '100%',
          padding: '8px 0',
          background: loading ? COLORS.textMuted : COLORS.cyan,
          border: 'none',
          borderRadius: 6,
          color: '#000',
          fontSize: 11,
          fontWeight: 700,
          cursor: loading ? 'wait' : 'pointer',
          fontFamily: "'Cairo', sans-serif",
          marginBottom: 10,
        }}
      >
        {loading ? '⏳ جاري التحليل...' : '🤖 تحليل الأنماط'}
      </button>

      {/* Error */}
      {error && (
        <div style={{
          padding: '6px 8px',
          background: 'rgba(248,81,73,0.1)',
          border: '1px solid rgba(248,81,73,0.2)',
          borderRadius: 6,
          color: COLORS.danger,
          fontSize: 9,
          marginBottom: 8,
          fontFamily: "'Cairo', sans-serif",
        }}>
          {error}
        </div>
      )}

      {/* Results */}
      {patterns.length > 0 && (
        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
          {patterns.map((p, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 4px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: p.direction === 'bullish' ? COLORS.success : p.direction === 'bearish' ? COLORS.danger : COLORS.warning,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: COLORS.text, fontWeight: 600, fontFamily: "'Cairo', sans-serif" }}>
                  {p.labelAr}
                </div>
                <div style={{ fontSize: 8, color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
                  {p.type} • {Math.round(p.confidence * 100)}% • {new Date(p.time * 1000).toLocaleDateString('ar-EG')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {patterns.length === 0 && !loading && !error && (
        <div style={{ textAlign: 'center', color: COLORS.textMuted, fontSize: 9, padding: '10px 0', fontFamily: "'Cairo', sans-serif" }}>
          اضغط على زر التحليل للبدء
        </div>
      )}
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

    // Doji: very small body relative to range
    if (range > 0 && body / range < 0.1) {
      patterns.push({
        type: 'Doji',
        labelAr: 'دوجي',
        time: c.time,
        price: c.close,
        confidence: 0.7,
        direction: 'neutral',
      });
    }

    // Hammer: small body at top, long lower wick
    if (lowerWick > body * 2 && upperWick < body * 0.5) {
      patterns.push({
        type: 'Hammer',
        labelAr: 'مطرقة',
        time: c.time,
        price: c.close,
        confidence: 0.75,
        direction: 'bullish',
      });
    }

    // Shooting Star: small body at bottom, long upper wick
    if (upperWick > body * 2 && lowerWick < body * 0.5) {
      patterns.push({
        type: 'Shooting Star',
        labelAr: 'نجم ساقط',
        time: c.time,
        price: c.close,
        confidence: 0.7,
        direction: 'bearish',
      });
    }

    // Bullish Engulfing
    if (prev.close < prev.open && c.close > c.open &&
        c.open <= prev.close && c.close >= prev.open) {
      patterns.push({
        type: 'Engulfing Bullish',
        labelAr: 'ابتلاع صعودي',
        time: c.time,
        price: c.close,
        confidence: 0.8,
        direction: 'bullish',
      });
    }

    // Bearish Engulfing
    if (prev.close > prev.open && c.close < c.open &&
        c.open >= prev.close && c.close <= prev.open) {
      patterns.push({
        type: 'Engulfing Bearish',
        labelAr: 'ابتلاع هبوطي',
        time: c.time,
        price: c.close,
        confidence: 0.8,
        direction: 'bearish',
      });
    }
  }

  return patterns.slice(-10); // Last 10 patterns max
}
