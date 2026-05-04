// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Crosshair Overlay (OHLC + % + Volume)
// ═══════════════════════════════════════════════════════════

'use client';

import { useMemo } from 'react';
import type { CrosshairData, CandleData } from '@/lib/charts/types';
import { priceDecimals } from '@/lib/price-format';

interface CrosshairOverlayProps {
  symbol: string;
  currentPrice: number | null;
  crosshairData: CrosshairData | null;
  pricePulse: boolean;
  candleCountdown: string;
  feedState: 'live' | 'fallback' | 'waiting';
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'fallback';
  compact: boolean;
  mobile: boolean;
  candles: CandleData[];
  showCandleTimer?: boolean;
}

export function CrosshairOverlay({
  symbol,
  currentPrice,
  crosshairData,
  pricePulse,
  candleCountdown,
  feedState,
  connectionState,
  compact,
  mobile,
  candles,
  showCandleTimer = true,
}: CrosshairOverlayProps) {
  // Get current OHLC from last candle when crosshair is not active
  const lastCandle = candles[candles.length - 1];
  const displayData = crosshairData || (lastCandle ? {
    time: lastCandle.time,
    open: lastCandle.open,
    high: lastCandle.high,
    low: lastCandle.low,
    close: lastCandle.close,
    volume: lastCandle.volume,
    change: candles.length > 1 ? lastCandle.close - candles[candles.length - 2].close : 0,
    changePercent: candles.length > 1 && candles[candles.length - 2].close > 0
      ? ((lastCandle.close - candles[candles.length - 2].close) / candles[candles.length - 2].close) * 100
      : 0,
    dateStr: new Date(lastCandle.time * 1000).toLocaleDateString('ar-EG', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }),
  } : null);

  const price = crosshairData?.close || currentPrice || lastCandle?.close || 0;
  const decimals = useMemo(() => priceDecimals(price, symbol), [symbol, price]);

  const isBull = displayData ? displayData.close >= displayData.open : true;
  const changeColor = displayData && displayData.change >= 0 ? '#00FFA3' : '#FF4757';

  const COLORS = {
    text: '#F0F2F5',
    textSecondary: '#8B92A8',
    textMuted: '#8B92A8',
    cyan: '#00D4FF',
    success: '#00FFA3',
    danger: '#FF4757',
    bg: 'rgba(11,14,20,0.82)',
  };

  const overlayPriceSize = mobile ? 14 : 16;
  const overlayPairSize = mobile ? 10 : 11;

  // Mobile: simplified overlay with countdown timer
  if (mobile) {
    return (
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        left: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '2px 6px',
        pointerEvents: 'none',
        zIndex: 3,
        background: 'linear-gradient(180deg, rgba(11,14,20,0.85) 0%, rgba(11,14,20,0.3) 80%, transparent 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Symbol */}
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 8,
            fontWeight: 700,
            color: COLORS.cyan,
            letterSpacing: 0.3,
          }}>
            {symbol}
          </span>
          {/* Price */}
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '12px',
            fontWeight: 700,
            lineHeight: 1,
            color: pricePulse ? (isBull ? COLORS.success : COLORS.danger) : COLORS.text,
            transition: 'color 0.22s ease, text-shadow 0.22s ease',
            textShadow: pricePulse ? `0 0 12px ${isBull ? COLORS.success : COLORS.danger}` : 'none',
          }}>
            {price ? price.toFixed(decimals) : '—'}
          </span>

          {/* Change % */}
          {displayData && (
            <span style={{
              fontSize: 8,
              fontFamily: "'JetBrains Mono', monospace",
              color: changeColor,
              fontWeight: 700,
              padding: '0px 4px',
              borderRadius: 3,
              background: `${changeColor}15`,
            }}>
              {displayData.changePercent >= 0 ? '+' : ''}{displayData.changePercent.toFixed(2)}%
            </span>
          )}
        </div>

        {/* Right: Feed status (candle timer is shown under price scale via PriceSyncedTimer) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {feedState === 'fallback' && (
            <span style={{ fontSize: 7, color: '#fbbf24', fontFamily: "'JetBrains Mono', monospace" }}>بيانات احتياطية</span>
          )}
        </div>
      </div>
    );
  }

  // Desktop: full overlay
  return (
    <div style={{
      position: 'absolute',
      top: 0,
      right: 0,
      left: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '4px 10px',
      pointerEvents: 'none',
      zIndex: 3,
      background: 'linear-gradient(180deg, rgba(11,14,20,0.82) 0%, transparent 100%)',
    }}>
      {/* Left: Symbol + Price + Countdown + OHLC */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {/* Symbol */}
        <span style={{
          fontFamily: "'Cairo', sans-serif",
          fontSize: `${overlayPairSize}px`,
          fontWeight: 700,
          color: COLORS.cyan,
          letterSpacing: 0.5,
        }}>
          {symbol}
        </span>

        {/* Price */}
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: `${overlayPriceSize}px`,
          fontWeight: 700,
          lineHeight: 1,
          color: pricePulse ? (isBull ? COLORS.success : COLORS.danger) : COLORS.text,
          transition: 'color 0.22s ease, text-shadow 0.22s ease',
          textShadow: pricePulse ? `0 0 12px ${isBull ? COLORS.success : COLORS.danger}` : 'none',
        }}>
          {price ? price.toFixed(decimals) : '—'}
        </span>

        {/* OHLC */}
        {displayData && !compact && (
          <span style={{
            fontSize: 9,
            color: COLORS.textMuted,
            fontFamily: "'JetBrains Mono', monospace",
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span>O <b style={{ color: 'rgba(255,255,255,0.5)' }}>{displayData.open.toFixed(decimals)}</b></span>
            <span>H <b style={{ color: 'rgba(63,185,80,0.7)' }}>{displayData.high.toFixed(decimals)}</b></span>
            <span>L <b style={{ color: 'rgba(248,81,73,0.7)' }}>{displayData.low.toFixed(decimals)}</b></span>
            <span>C <b style={{ color: isBull ? 'rgba(63,185,80,0.7)' : 'rgba(248,81,73,0.7)' }}>{displayData.close.toFixed(decimals)}</b></span>
          </span>
        )}

        {/* Change % */}
        {displayData && (
          <span style={{
            fontSize: 9,
            fontFamily: "'JetBrains Mono', monospace",
            color: changeColor,
            fontWeight: 700,
            padding: '1px 5px',
            borderRadius: 4,
            background: `${changeColor}15`,
          }}>
            {displayData.changePercent >= 0 ? '+' : ''}{displayData.changePercent.toFixed(2)}%
          </span>
        )}

        {/* Volume */}
        {displayData && !compact && (
          <span style={{
            fontSize: 8,
            color: COLORS.textMuted,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            Vol: {formatVolume(displayData.volume)}
          </span>
        )}
      </div>

      {/* Right: Feed Status */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 8,
        fontFamily: "'JetBrains Mono', monospace",
        color: COLORS.textSecondary,
      }}>
        {feedState === 'fallback' && (
          <span style={{ color: '#fbbf24' }}>استخدام بيانات احتياطية</span>
        )}
        {!mobile && (
          <>
            <span style={{ color: 'rgba(139,92,246,0.7)' }}>■ طوكيو</span>
            <span style={{ color: 'rgba(88,166,255,0.7)' }}>■ لندن</span>
            <span style={{ color: 'rgba(227,179,65,0.7)' }}>■ نيويورك</span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────
function formatVolume(vol: number): string {
  if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(1)}B`;
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K`;
  return vol.toFixed(0);
}
