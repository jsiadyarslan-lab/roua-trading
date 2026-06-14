// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Smart Watchlist Overlay
// Mini sparklines for each asset in the watchlist
// ═══════════════════════════════════════════════════════════

'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useMarketStore } from '@/hooks/useMarketStore';
import type { QuoteData } from '@/hooks/useMarketStore';

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
  const priceHistoryRef = useRef<Map<string, number[]>>(new Map());
  const MAX_HISTORY_POINTS = 50;

  // Build sparkline data from market store
  const sparklines = useMemo((): SparklineData[] => {
    return symbols.map(symbol => {
      const quote = globalQuotes[symbol];
      if (!quote || !quote.price) return null;
      
      // FIX (5.3): Track real price history for sparklines
      const history = priceHistoryRef.current.get(symbol) || [];
      const lastPrice = history.length > 0 ? history[history.length - 1] : 0;
      if (quote.price !== lastPrice) {
        history.push(quote.price);
        if (history.length > MAX_HISTORY_POINTS) history.splice(0, history.length - MAX_HISTORY_POINTS);
        priceHistoryRef.current.set(symbol, history);
      }
      
      return {
        symbol,
        price: quote.price,
        change: quote.change || 0,
        changePercent: quote.changePercent || 0,
        points: history,
      };
    }).filter((s): s is SparklineData => s !== null && s.price > 0);
  }, [globalQuotes, symbols]);

  const COLORS = {
    bg: 'rgba(21,26,34,0.9)',
    border: 'rgba(42,49,60,0.6)',
    text: '#F0F2F5',
    textSecondary: '#8B92A8',
    textMuted: '#8B92A8',
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
            // FIX (5.4): aria-label + aria-pressed for watchlist symbol button
            aria-label={`${spark.symbol} ${spark.changePercent >= 0 ? '+' : ''}${spark.changePercent.toFixed(1)}%`}
            aria-pressed={isSelected}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              padding: '4px 8px',
              background: isSelected ? 'rgba(0,212,255,0.08)' : 'transparent',
              border: `1px solid ${isSelected ? 'rgba(0,212,255,0.2)' : 'transparent'}`,
              borderRadius: 6,
              cursor: 'pointer',
              minWidth: 80,
              transition: 'all 0.15s',
            }}
          >
            {/* Symbol */}
            <span style={{
              fontSize: 9,
              color: isSelected ? COLORS.cyan : COLORS.textSecondary,
              fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace",
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
                fontSize: 8,
                color: COLORS.text,
                fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {spark.price > 1000 ? spark.price.toFixed(0) : spark.price.toFixed(2)}
              </span>
              <span style={{
                fontSize: 7,
                color,
                fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
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


