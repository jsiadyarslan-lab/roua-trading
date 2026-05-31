// ═══════════════════════════════════════════════════════════
// ROUA Chart — Options Builder
// Pure function that builds lightweight-charts v5 chart options.
// Extracted from useChart.ts to reduce the God Hook size.
// ═══════════════════════════════════════════════════════════

import type { DeepPartial, ChartOptions } from 'lightweight-charts';

// ── Chart Color Constants ────────────────────────────────
export const CHART_COLORS = {
  grid: 'rgba(42,49,60,0.5)',
  crosshair: 'rgba(160,200,220,0.3)',
  upColor: '#3fb950',
  downColor: '#f85149',
  upWick: '#3fb950',
  downWick: '#f85149',
};

// ── Mobile Color Constants (MT5 style) ──
const MOBILE_UP = '#4CAF50';   // MT5 green
const MOBILE_DN = '#F44336';   // MT5 red

// ── Build Chart Options ─────────────────────────────────
// Pure function that returns the complete chart options object
// for lightweight-charts v5 createChart().
export function buildChartOptions(opts: {
  width: number;
  height: number;
  isMobile: boolean;
  bgColor: string;
  textColor: string;
  cardColor: string;
  cardBorderColor: string;
}): DeepPartial<ChartOptions> {
  const { width, height, isMobile, bgColor, textColor, cardColor, cardBorderColor } = opts;

  return {
    width,
    height,
    layout: {
      background: { color: isMobile ? '#000000' : bgColor },
      textColor,
      fontSize: isMobile ? 11 : 12,
      fontFamily: "'JetBrains Mono', monospace",
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: isMobile ? 'rgba(255,255,255,0.06)' : CHART_COLORS.grid, style: isMobile ? 1 : 0 },
      horzLines: { color: isMobile ? 'rgba(255,255,255,0.06)' : CHART_COLORS.grid, style: isMobile ? 1 : 0 },
    },
    crosshair: {
      mode: 0, // Normal
      vertLine: {
        color: isMobile ? 'rgba(160,200,220,0.7)' : CHART_COLORS.crosshair,
        width: 1,
        style: 2,
        labelVisible: true,
        labelBackgroundColor: isMobile ? '#2a2e3e' : cardColor,
      },
      horzLine: {
        color: isMobile ? 'rgba(160,200,220,0.7)' : CHART_COLORS.crosshair,
        width: 1,
        style: 2,
        labelVisible: true,
        labelBackgroundColor: isMobile ? '#2a2e3e' : cardColor,
      },
    },
    rightPriceScale: {
      borderColor: isMobile ? 'transparent' : cardBorderColor,
      scaleMargins: { top: 0.1, bottom: 0.2 },
    },
    timeScale: {
      borderColor: cardBorderColor,
      timeVisible: true,
      secondsVisible: true,
      rightOffset: isMobile ? 3 : 5,
      barSpacing: 8,
      minBarSpacing: isMobile ? 4 : 5,
      // FIX: Enable conflation globally for performance (line/area indicators
      // benefit from it). Candlestick conflation is prevented per-series via
      // conflationThresholdFactor: 100 (see buildCandlestickOptions below).
      // Previously, setting enableConflation: false broke conflation for all
      // series, but the per-series override approach is better because it
      // allows indicators to conflate while protecting OHLC candlesticks.
      enableConflation: true,
      conflationThresholdFactor: 1.0,
    },
    handleScroll: { vertTouchDrag: !isMobile },
  };
}

// ── Build Candlestick Series Options ────────────────────
// Pure function that returns candlestick series options.
export function buildCandlestickOptions(isMobile: boolean): Record<string, any> {
  return {
    upColor: isMobile ? MOBILE_UP : CHART_COLORS.upColor,
    downColor: isMobile ? MOBILE_DN : CHART_COLORS.downColor,
    borderUpColor: isMobile ? MOBILE_UP : CHART_COLORS.upColor,
    borderDownColor: isMobile ? MOBILE_DN : CHART_COLORS.downColor,
    wickUpColor: isMobile ? MOBILE_UP : CHART_COLORS.upWick,
    wickDownColor: isMobile ? MOBILE_DN : CHART_COLORS.downWick,
    lastValueVisible: !isMobile,
    priceLineVisible: !isMobile,
    // FIX: Prevent LWC v5.1+ from conflating OHLC candlestick data into
    // single dots. Without this, when the chart is zoomed out and there are
    // many data points, LWC merges multiple candles into a single point
    // (losing open/high/low/close) which makes them appear as dots.
    // A value of 100 means conflation only kicks in at extreme zoom-out
    // levels where individual candles would be < 0.01px wide.
    conflationThresholdFactor: 100,
  };
}

// ── Build Volume Series Options ─────────────────────────
// Pure function that returns volume histogram series options.
export function buildVolumeOptions(): Record<string, any> {
  return {
    priceFormat: { type: 'volume' },
    priceScaleId: 'volume',
    lastValueVisible: false,
  };
}
