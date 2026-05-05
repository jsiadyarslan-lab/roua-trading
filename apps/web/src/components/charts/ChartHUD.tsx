'use client';

import React from 'react';

interface ChartHUDProps {
  symbol: string;
  currentPrice: number | null;
  previousClose: number | null;
  dailyVolume: number | null;
  dailyHigh: number | null;
  dailyLow: number | null;
  spread: number | null;
  lastCouncilSignal?: {
    direction: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
  } | null;
  compact?: boolean;
}

function formatLargeNumber(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (abs >= 1_000_000_000) {
    return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toFixed(2)}K`;
  }

  return value.toLocaleString('en-US', {
    maximumFractionDigits: 2,
  });
}

function formatPrice(price: number): string {
  if (price > 1000) {
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (price > 1) {
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
  }
  return price.toLocaleString('en-US', {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  });
}

export function ChartHUD({
  symbol,
  currentPrice,
  previousClose,
  dailyVolume,
  dailyHigh,
  dailyLow,
  spread,
  lastCouncilSignal,
  compact = false,
}: ChartHUDProps) {
  // Determine price direction
  let priceColor = '#F0F2F5';
  let changePercent: number | null = null;
  let isPositive = false;

  if (currentPrice !== null && previousClose !== null && previousClose !== 0) {
    changePercent = ((currentPrice - previousClose) / previousClose) * 100;
    if (currentPrice > previousClose) {
      priceColor = '#00FFA3';
      isPositive = true;
    } else if (currentPrice < previousClose) {
      priceColor = '#FF4757';
      isPositive = false;
    }
  }

  // Council signal styling
  const councilDirectionMap: Record<string, { arrow: string; color: string }> = {
    bullish: { arrow: '▲', color: '#00FFA3' },
    bearish: { arrow: '▼', color: '#FF4757' },
    neutral: { arrow: '◆', color: '#d4af37' },
  };

  const councilInfo = lastCouncilSignal
    ? councilDirectionMap[lastCouncilSignal.direction]
    : null;

  return (
    <div
      dir="rtl"
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        background: 'rgba(8,10,18,0.88)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 10,
        padding: compact ? '6px 10px' : '8px 12px',
        zIndex: 100,
        pointerEvents: 'none',
        direction: 'rtl',
        fontFamily: "'Cairo', sans-serif",
        minWidth: 0,
      }}
    >
      {/* Symbol Row */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#8B92A8',
          lineHeight: 1.4,
          marginBottom: 2,
          letterSpacing: '0.03em',
        }}
      >
        {symbol}
      </div>

      {/* Price + Change Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          direction: 'rtl',
        }}
      >
        <span
          style={{
            fontSize: compact ? 16 : 20,
            fontWeight: 700,
            color: priceColor,
            fontFamily: "'JetBrains Mono', monospace",
            lineHeight: 1.2,
          }}
        >
          {currentPrice !== null ? formatPrice(currentPrice) : '—'}
        </span>

        {changePercent !== null && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: priceColor,
              fontFamily: "'JetBrains Mono', monospace",
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}
          >
            {isPositive ? '▲' : '▼'}{' '}
            {isPositive ? '+' : ''}
            {changePercent.toFixed(2)}%
          </span>
        )}
      </div>

      {/* Volume / High / Low Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          direction: 'rtl',
          marginTop: 3,
          flexWrap: 'wrap',
        }}
      >
        {dailyVolume !== null && (
          <span
            style={{
              fontSize: 10,
              color: '#8B92A8',
              fontFamily: "'JetBrains Mono', monospace",
              lineHeight: 1.3,
            }}
          >
            Vol: {formatLargeNumber(dailyVolume)}
          </span>
        )}

        {dailyHigh !== null && (
          <span
            style={{
              fontSize: 10,
              color: '#8B92A8',
              fontFamily: "'JetBrains Mono', monospace",
              lineHeight: 1.3,
            }}
          >
            H: {formatPrice(dailyHigh)}
          </span>
        )}

        {dailyLow !== null && (
          <span
            style={{
              fontSize: 10,
              color: '#8B92A8',
              fontFamily: "'JetBrains Mono', monospace",
              lineHeight: 1.3,
            }}
          >
            L: {formatPrice(dailyLow)}
          </span>
        )}
      </div>

      {/* Spread / Council Row */}
      {(spread !== null || lastCouncilSignal) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            direction: 'rtl',
            marginTop: 3,
          }}
        >
          {spread !== null && (
            <span
              style={{
                fontSize: 10,
                color: '#8B92A8',
                fontFamily: "'JetBrains Mono', monospace",
                lineHeight: 1.3,
              }}
            >
              Spread: {spread.toFixed(spread >= 1 ? 2 : 4)}
            </span>
          )}

          {lastCouncilSignal && councilInfo && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                fontSize: 10,
                fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                lineHeight: 1.3,
                padding: '1px 5px',
                borderRadius: 4,
                background: `${councilInfo.color}15`,
                color: councilInfo.color,
                border: `1px solid ${councilInfo.color}30`,
              }}
            >
              Council: {councilInfo.arrow} {lastCouncilSignal.confidence}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}
