// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Crosshair Overlay (OHLC + % + Volume)
// ═══════════════════════════════════════════════════════════

'use client';

import { useMemo } from 'react';
import type { CrosshairData, CandleData } from '@/lib/charts/types';
import { priceDecimals } from '@/lib/price-format';
import { useLocale, useTranslations } from 'next-intl'

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
  const locale = useLocale();
  const t = useTranslations('dashboard.chartCrosshair');
  const dateLocale = locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : locale === 'tr' ? 'tr-TR' : 'en-US';
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
    dateStr: new Date(lastCandle.time * 1000).toLocaleDateString(dateLocale, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }),
  } : null);

  const price = crosshairData?.close || currentPrice || lastCandle?.close || 0;
  const decimals = useMemo(() => priceDecimals(price, symbol), [symbol, price]);

  const isBull = displayData ? displayData.close >= displayData.open : true;
  const changeColor = displayData && displayData.change >= 0 ? '#00FFA3' : '#FF4757';

  const COLORS = {
    text: '#F0F2F5',
    textSecondary: '#9CA3B5',
    textMuted: '#9CA3B5',
    cyan: '#00D4FF',
    success: '#00FFA3',
    danger: '#FF4757',
    bg: 'rgba(11,14,20,0.82)',
  };

  const overlayPriceSize = mobile ? 14 : 16;
  const overlayPairSize = mobile ? 10 : 11;

  // Mobile: compact OHLC overlay when crosshair is active + feed status
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
        padding: '2px 8px',
        pointerEvents: 'none',
        zIndex: 3,
        direction: 'ltr',
      }}>
        {/* OHLC data — visible only when crosshair is active (user touching chart) */}
        {crosshairData ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(11,14,20,0.85)',
            backdropFilter: 'blur(8px)',
            borderRadius: 'var(--radius-sm)',
            padding: '2px 6px',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <span style={{
              fontSize: 'var(--text-xs)',
              color: COLORS.textMuted,
              fontFamily: "var(--font-mono)",
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}>
              <span>O <b style={{ color: 'rgba(255,255,255,0.55)' }}>{crosshairData.open.toFixed(decimals)}</b></span>
              <span>H <b style={{ color: 'rgba(63,185,80,0.75)' }}>{crosshairData.high.toFixed(decimals)}</b></span>
              <span>L <b style={{ color: 'rgba(248,81,73,0.75)' }}>{crosshairData.low.toFixed(decimals)}</b></span>
              <span>C <b style={{ color: isBull ? 'rgba(63,185,80,0.75)' : 'rgba(248,81,73,0.75)' }}>{crosshairData.close.toFixed(decimals)}</b></span>
            </span>
            <span style={{
              fontSize: 'var(--text-xs)',
              fontFamily: "var(--font-mono)",
              color: changeColor,
              fontWeight: 700,
              padding: '0px 3px',
              borderRadius: 'var(--radius-xs)',
              background: `${changeColor}15`,
            }}>
              {crosshairData.changePercent >= 0 ? '+' : ''}{crosshairData.changePercent.toFixed(2)}%
            </span>
            <span style={{
              fontSize: 'var(--text-xs)',
              color: COLORS.textMuted,
              fontFamily: "var(--font-mono)",
            }}>
              Vol:{formatVolume(crosshairData.volume)}
            </span>
          </div>
        ) : <div />}
        {/* Right: date when crosshair active, or feed status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {crosshairData && (
            <span style={{
              fontSize: 'var(--text-xs)',
              color: COLORS.cyan,
              fontFamily: "var(--font-mono)",
              background: 'rgba(11,14,20,0.85)',
              backdropFilter: 'blur(8px)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px 5px',
              border: '1px solid rgba(0,212,255,0.12)',
            }}>
              {crosshairData.dateStr}
            </span>
          )}
          {feedState === 'fallback' && (
            <span style={{ fontSize: 'var(--text-xs)', color: '#FFB800', fontFamily: "var(--font-mono)" }}>{t('fallbackData')}</span>
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
      right: 72, // ← leave space for right price axis (prevents symbol overlapping price label)
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
          fontFamily: "var(--font-ar)",
          fontSize: `${overlayPairSize}px`,
          fontWeight: 700,
          color: COLORS.cyan,
          letterSpacing: 0.5,
        }}>
          {symbol}
        </span>

        {/* Price */}
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: `${overlayPriceSize}px`,
          fontWeight: 700,
          lineHeight: 1,
          color: pricePulse ? (isBull ? COLORS.success : COLORS.danger) : COLORS.text,
          transition: 'color 0.22s ease, text-shadow 0.22s ease',
          textShadow: pricePulse ? `0 0 12px ${isBull ? COLORS.success : COLORS.danger}` : 'none',
        }}>
          {price != null ? price.toFixed(decimals) : '—'}
        </span>

        {/* OHLC */}
        {displayData && !compact && (
          <span style={{
            fontSize: 'var(--text-xs)',
            color: COLORS.textMuted,
            fontFamily: "var(--font-mono)",
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
            fontSize: 'var(--text-xs)',
            fontFamily: "var(--font-mono)",
            color: changeColor,
            fontWeight: 700,
            padding: '1px 5px',
            borderRadius: 'var(--radius-sm)',
            background: `${changeColor}15`,
          }}>
            {displayData.changePercent >= 0 ? '+' : ''}{displayData.changePercent.toFixed(2)}%
          </span>
        )}

        {/* Volume */}
        {displayData && !compact && (
          <span style={{
            fontSize: 'var(--text-xs)',
            color: COLORS.textMuted,
            fontFamily: "var(--font-mono)",
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
        fontSize: 'var(--text-xs)',
        fontFamily: "var(--font-mono)",
        color: COLORS.textSecondary,
      }}>
        {feedState === 'fallback' && (
          <span style={{ color: '#FFB800' }}>{t('usingFallbackData')}</span>
        )}
        {!mobile && (
          <>
            <span style={{ color: 'rgba(139,92,246,0.7)' }}>■ {t('tokyo')}</span>
            <span style={{ color: 'rgba(88,166,255,0.7)' }}>■ {t('london')}</span>
            <span style={{ color: 'rgba(227,179,65,0.7)' }}>■ {t('newYork')}</span>
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
