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
      autoScale: true,  // Keep true but explicit — prevents unexpected scale jumps
    },
    timeScale: {
      borderColor: cardBorderColor,
      timeVisible: true,
      secondsVisible: true,
      rightOffset: isMobile ? 3 : 5,
      barSpacing: isMobile ? 6 : 10,
      minBarSpacing: 3,
      // FIX: Data conflation is DISABLED because it destroys candlestick
      // OHLC rendering. When enabled, LWC merges multiple candles into a
      // single data point (dot) when zoomed out, losing open/high/low/close.
      enableConflation: false,
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,  // منع التمرير العمودي للتعارض مع الصفحة
    },
    handleScale: {
      axisPressedMouseMove: { time: false, price: true },
      axisDoubleClickReset: { time: true, price: true },
      mouseWheel: true,
      pinch: true,
    },
    // FIX: Disable kinetic scroll — causes "rubber band" bounce effect
    // when user releases the mouse/touch after scrolling
    kineticScroll: {
      mouse: false,   // No momentum after mouse drag
      touch: false,   // No momentum after touch swipe
    },
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
