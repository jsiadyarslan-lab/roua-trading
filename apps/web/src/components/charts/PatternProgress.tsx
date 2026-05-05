// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Live Pattern Progress Tracker
// Shows 6 patterns forming with completion percentages
// ═══════════════════════════════════════════════════════════

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { CandleData } from '@/lib/charts/types';

interface PatternProgressProps {
  symbol: string;
  candles: CandleData[];
  onClose?: () => void;
}

interface PatternStatus {
  name: string;
  nameAr: string;
  icon: string;
  progress: number; // 0-100
  direction: 'bullish' | 'bearish' | 'neutral';
  expectedMove: string;
}

const C = {
  bg: 'rgba(0,0,0,0.6)',
  card: '#111620',
  border: '#1E2530',
  text: '#F0F2F5',
  textDim: '#8B92A8',
  textMuted: '#4B5563',
  cyan: '#00D4FF',
  success: '#00FFA3',
  danger: '#FF4757',
  warning: '#fbbf24',
};

function analyzePatternProgress(candles: CandleData[]): PatternStatus[] {
  if (!candles || candles.length < 10) {
    return getDefaultPatterns();
  }

  const last20 = candles.slice(-20);
  const lastCandle = last20[last20.length - 1];
  const prevCandle = last20[last20.length - 2];
  const isBull = lastCandle.close > lastCandle.open;
  const bodySize = Math.abs(lastCandle.close - lastCandle.open);
  const range = lastCandle.high - lastCandle.low;
  const upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
  const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
  const vol = last20.reduce((s, c) => s + c.volume, 0) / last20.length;

  // Calculate simple metrics
  const avgBody = last20.reduce((s, c) => s + Math.abs(c.close - c.open), 0) / last20.length;
  const avgRange = last20.reduce((s, c) => s + (c.high - c.low), 0) / last20.length;
  const isSmallBody = bodySize < avgBody * 0.3;
  const isBigBody = bodySize > avgBody * 1.5;

  // Engulfing check
  const prevBody = Math.abs(prevCandle.close - prevCandle.open);
  const engulfingProgress = isBull && lastCandle.close > prevCandle.open && lastCandle.open < prevCandle.close
    ? 85
    : !isBull && lastCandle.close < prevCandle.open && lastCandle.open > prevCandle.close
    ? 80
    : bodySize > prevBody * 1.2
    ? 40
    : 15;

  // Pin Bar check
  const pinBarProgress = (lowerWick > bodySize * 2 && upperWick < bodySize * 0.5)
    || (upperWick > bodySize * 2 && lowerWick < bodySize * 0.5)
    ? 90
    : (lowerWick > bodySize * 1.5 || upperWick > bodySize * 1.5)
    ? 50
    : (lowerWick > bodySize || upperWick > bodySize)
    ? 25
    : 10;

  // Squeeze check (Bollinger Band width narrowing)
  const closes = last20.map(c => c.close);
  const mean = closes.reduce((s, v) => s + v, 0) / closes.length;
  const stdDev = Math.sqrt(closes.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / closes.length);
  const bbWidth = (2 * stdDev) / mean;
  const squeezeProgress = bbWidth < 0.01 ? 85 : bbWidth < 0.02 ? 55 : bbWidth < 0.03 ? 30 : 10;

  // Head & Shoulders (simplified)
  const hsProgress = last20.length >= 15 ? detectHSProgress(last20) : 5;

  // Double Top/Bottom
  const doubleProgress = detectDoubleTopBottom(last20);

  // Wedge
  const wedgeProgress = detectWedge(last20);

  return [
    {
      name: 'Engulfing',
      nameAr: 'ابتلاع',
      icon: '🕯',
      progress: engulfingProgress,
      direction: isBull ? 'bullish' : 'bearish',
      expectedMove: isBull ? 'صعود' : 'هبوط',
    },
    {
      name: 'Pin Bar',
      nameAr: 'بار مسامير',
      icon: '📌',
      progress: pinBarProgress,
      direction: lowerWick > upperWick ? 'bullish' : 'bearish',
      expectedMove: lowerWick > upperWick ? 'انعكاس صعودي' : 'انعكاس هبوطي',
    },
    {
      name: 'Squeeze Breakout',
      nameAr: 'اختراق ضغط',
      icon: '📊',
      progress: squeezeProgress,
      direction: 'neutral',
      expectedMove: 'اختراق وشيك',
    },
    {
      name: 'Head & Shoulders',
      nameAr: 'رأس وكتفين',
      icon: '🏔️',
      progress: hsProgress,
      direction: hsProgress > 50 ? 'bearish' : 'neutral',
      expectedMove: hsProgress > 50 ? 'هبوط بعد الاكتمال' : 'قيد التشكل',
    },
    {
      name: 'Double Top/Bottom',
      nameAr: 'قمة/قاع مزدوج',
      icon: '⏸️',
      progress: doubleProgress,
      direction: doubleProgress > 50 ? (lastCandle.close < mean ? 'bearish' : 'bullish') : 'neutral',
      expectedMove: doubleProgress > 50 ? 'انعكاس' : 'تحقق',
    },
    {
      name: 'Wedge',
      nameAr: 'وتد',
      icon: '🔺',
      progress: wedgeProgress,
      direction: 'neutral',
      expectedMove: 'اختراق قادم',
    },
  ];
}

function detectHSProgress(candles: CandleData[]): number {
  const highs = candles.slice(-15).map(c => c.high);
  const maxIdx = highs.indexOf(Math.max(...highs));
  if (maxIdx < 3 || maxIdx > highs.length - 4) return 10;
  const leftHigh = Math.max(...highs.slice(0, maxIdx));
  const rightHigh = Math.max(...highs.slice(maxIdx + 1));
  if (Math.abs(leftHigh - rightHigh) / leftHigh < 0.02) return 75;
  if (Math.abs(leftHigh - rightHigh) / leftHigh < 0.05) return 45;
  return 15;
}

function detectDoubleTopBottom(candles: CandleData[]): number {
  const last10 = candles.slice(-10);
  const highs = last10.map(c => c.high);
  const lows = last10.map(c => c.low);
  const maxH = Math.max(...highs);
  const minL = Math.min(...lows);
  const nearMax = highs.filter(h => Math.abs(h - maxH) / maxH < 0.01).length;
  const nearMin = lows.filter(l => Math.abs(l - minL) / minL < 0.01).length;
  if (nearMax >= 2 || nearMin >= 2) return 80;
  if (nearMax >= 1.5 || nearMin >= 1.5) return 40;
  return 10;
}

function detectWedge(candles: CandleData[]): number {
  const last10 = candles.slice(-10);
  if (last10.length < 10) return 5;
  const firstHigh = last10[0].high;
  const lastHigh = last10[last10.length - 1].high;
  const firstLow = last10[0].low;
  const lastLow = last10[last10.length - 1].low;
  const highConverging = Math.abs(firstHigh - lastHigh) / firstHigh < 0.03;
  const lowConverging = Math.abs(firstLow - lastLow) / firstLow < 0.03;
  if (highConverging && lowConverging) return 70;
  if (highConverging || lowConverging) return 35;
  return 10;
}

function getDefaultPatterns(): PatternStatus[] {
  return [
    { name: 'Engulfing', nameAr: 'ابتلاع', icon: '🕯', progress: 0, direction: 'neutral', expectedMove: '—' },
    { name: 'Pin Bar', nameAr: 'بار مسامير', icon: '📌', progress: 0, direction: 'neutral', expectedMove: '—' },
    { name: 'Squeeze Breakout', nameAr: 'اختراق ضغط', icon: '📊', progress: 0, direction: 'neutral', expectedMove: '—' },
    { name: 'Head & Shoulders', nameAr: 'رأس وكتفين', icon: '🏔️', progress: 0, direction: 'neutral', expectedMove: '—' },
    { name: 'Double Top/Bottom', nameAr: 'قمة/قاع مزدوج', icon: '⏸️', progress: 0, direction: 'neutral', expectedMove: '—' },
    { name: 'Wedge', nameAr: 'وتد', icon: '🔺', progress: 0, direction: 'neutral', expectedMove: '—' },
  ];
}

export function PatternProgress({ symbol, candles, onClose }: PatternProgressProps) {
  const [patterns, setPatterns] = useState<PatternStatus[]>(getDefaultPatterns);

  const updatePatterns = useCallback(() => {
    const updated = analyzePatternProgress(candles);
    setPatterns(updated);
  }, [candles]);

  useEffect(() => {
    updatePatterns();
    const interval = setInterval(updatePatterns, 15000);
    return () => clearInterval(interval);
  }, [updatePatterns]);

  const getProgressColor = (progress: number): string => {
    if (progress >= 70) return C.success;
    if (progress >= 40) return C.warning;
    return C.textMuted;
  };

  const getDirectionColor = (dir: string): string => {
    if (dir === 'bullish') return C.success;
    if (dir === 'bearish') return C.danger;
    return C.textDim;
  };

  return (
    <div style={{
      zIndex: 10,
      background: C.bg,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderRadius: 10,
      padding: 10,
      border: `1px solid ${C.border}`,
      maxWidth: 220,
      direction: 'rtl',
    }}>
      {/* Header */}
      <div data-drag-handle style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8, paddingBottom: 5,
        borderBottom: `1px solid ${C.border}`,
        cursor: 'grab',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 10 }}>📈</span>
          <span style={{ fontSize: 10, color: C.text, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>
            تقدم الأنماط
          </span>
          <span style={{ fontSize: 8, color: C.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
            {symbol}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.04)', border: 'none', borderRadius: 3,
              color: C.textMuted, width: 16, height: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, padding: 0,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Pattern list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {patterns.map(p => {
          const progressColor = getProgressColor(p.progress);
          return (
            <div key={p.name} style={{
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontSize: 10, flexShrink: 0 }}>{p.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 9, color: C.text, fontWeight: 600, fontFamily: "'Cairo', sans-serif" }}>
                    {p.nameAr}
                  </span>
                  <span style={{ fontSize: 8, color: getDirectionColor(p.direction), fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                    {p.expectedMove}
                  </span>
                </div>
                {/* Progress bar */}
                <div style={{
                  height: 3, borderRadius: 2, background: C.border,
                  marginTop: 2, overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    width: `${p.progress}%`,
                    background: progressColor,
                    transition: 'width 0.5s ease, background 0.5s ease',
                  }} />
                </div>
              </div>
              <span style={{
                fontSize: 8, color: progressColor, fontWeight: 800,
                fontFamily: "'JetBrains Mono', monospace",
                minWidth: 28, textAlign: 'left', flexShrink: 0,
              }}>
                {Math.round(p.progress)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
