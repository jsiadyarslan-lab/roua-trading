// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Smart Watchlist Overlay
// Mini sparklines for each asset in the watchlist
// ═══════════════════════════════════════════════════════════

'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useMarketStore } from '@/hooks/useMarketStore';
import type { QuoteData } from '@/hooks/useMarketStore'

function safeMax(arr: number[]): number {
  if (arr.length === 0) return -Infinity;
  let max = arr[0];
  for (let i = 1; i < arr.length; i++) { if (arr[i] > max) max = arr[i]; }
  return max;
}
function safeMin(arr: number[]): number {
  if (arr.length === 0) return Infinity;
  let min = arr[0];
  for (let i = 1; i < arr.length; i++) { if (arr[i] < min) min = arr[i]; }
  return min;
}

interface WatchlistOverlayProps {
  symbols?: string[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  visible?: boolean;
}

interface SparklineData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  points: number[];  // Last 24h of price points
}

const DEFAULT_SYMBOLS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XAU/USD', 'EUR/USD', 'AAPL'];

export function WatchlistOverlay({
  symbols = DEFAULT_SYMBOLS,
  selectedSymbol,
  onSelectSymbol,
  visible = true,
}: WatchlistOverlayProps) {
  const globalQuotes = useMarketStore(state => state.quotes);

  // Build sparkline data from market store
  const sparklines = useMemo((): SparklineData[] => {
    return symbols.map(symbol => {
      const quote = globalQuotes[symbol];
      return {
        symbol,
        price: quote?.price || 0,
        change: quote?.change || 0,
        changePercent: quote?.changePercent || 0,
        points: generateMiniPoints(quote),
      };
    }).filter(s => s.price > 0);
  }, [globalQuotes, symbols]);

  const COLORS = {
    bg: 'rgba(21,26,34,0.9)',
    border: 'rgba(42,49,60,0.6)',
    text: '#F0F2F5',
    textSecondary: '#9CA3B5',
    textMuted: '#9CA3B5',
    success: '#00FFA3',
    danger: '#FF4757',
    cyan: '#00D4FF',
    card: '#151A22',
  };

  if (!visible || sparklines.length === 0) return null;

  return (
    <div style={{
      display: 'flex',
      gap: 4,
      padding: '6px 8px',
      background: COLORS.bg,
      borderTop: `1px solid ${COLORS.border}`,
      overflowX: 'auto',
      scrollbarWidth: 'none',
    }}>
      {sparklines.map(spark => {
        const isSelected = spark.symbol === selectedSymbol;
        const isPositive = spark.changePercent >= 0;
        const color = isPositive ? COLORS.success : COLORS.danger;

        return (
          <button
            key={spark.symbol}
            onClick={() => onSelectSymbol(spark.symbol)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              padding: '4px 8px',
              background: isSelected ? 'rgba(0,212,255,0.08)' : 'transparent',
              border: `1px solid ${isSelected ? 'rgba(0,212,255,0.2)' : 'transparent'}`,
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              minWidth: 80,
              transition: 'all 0.15s',
            }}
          >
            {/* Symbol */}
            <span style={{
              fontSize: 11,
              color: isSelected ? COLORS.cyan : COLORS.textSecondary,
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
            }}>
              {spark.symbol.replace('/USD', '')}
            </span>

            {/* Mini Sparkline SVG */}
            <svg width="60" height="20" viewBox="0 0 60 20" style={{ display: 'block' }}>
              {spark.points.length > 1 && (
                <polyline
                  points={spark.points.map((p, i) =>
                    `${(i / (spark.points.length - 1)) * 60},${20 - (p / safeMax(spark.points)) * 18}`
                  ).join(' ')}
                  fill="none"
                  stroke={color}
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </svg>

            {/* Price + Change */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{
                fontSize: 11,
                color: COLORS.text,
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
              }}>
                {spark.price > 1000 ? spark.price.toFixed(0) : spark.price.toFixed(2)}
              </span>
              <span style={{
                fontSize: 11,
                color,
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
              }}>
                {isPositive ? '+' : ''}{spark.changePercent.toFixed(1)}%
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Helper: Generate mini sparkline points ───────────────
function generateMiniPoints(quote: QuoteData | undefined): number[] {
  if (!quote || !quote.price) return [];

  const price = quote.price;
  const volatility = price * 0.002;
  const points: number[] = [];

  // Generate 20 synthetic points around the current price
  // In production, this would use actual 24h price history
  for (let i = 0; i < 20; i++) {
    const trend = (i / 20) * quote.changePercent * price * 0.01;
    const noise = (Math.random() - 0.5) * volatility;
    points.push(price + trend + noise);
  }

  // Ensure the last point matches the current price
  points[points.length - 1] = price;

  return points;
}
