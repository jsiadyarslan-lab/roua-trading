// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Drawing Renderer v2
// Plugin System Architecture: draws on lightweight-charts' own canvas
// via Series Primitives (ISeriesPrimitive) — NO separate overlay canvas
// ═══════════════════════════════════════════════════════════

import type {
  IChartApi,
  ISeriesApi,
  SeriesType,
  Time,
  ISeriesPrimitiveBase,
  SeriesAttachedParameter,
  PrimitiveHoveredItem,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  PrimitivePaneViewZOrder,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D, MediaCoordinatesRenderingScope } from 'fancy-canvas';
import type { Drawing, DrawingTool, DrawingPoint } from './types';
import { DrawingManager } from './DrawingManager';
import { safeMax, safeMin } from './chart-utils';

// ── Style Constants ──────────────────────────────────────
const DEFAULT_COLOR = '#fbbf24';
const DEFAULT_LINE_WIDTH = 1.5;
const DEFAULT_OPACITY = 0.8;
const PREVIEW_DASH = [6, 4];
const FIBONACCI_LEVELS = [0, 23.6, 38.2, 50, 61.8, 78.6, 100];
const FIBONACCI_COLORS: Record<number, string> = {
  0:    'rgba(248,81,73,0.6)',
  23.6: 'rgba(248,113,113,0.5)',
  38.2: 'rgba(251,191,36,0.5)',
  50:   'rgba(34,211,238,0.6)',
  61.8: 'rgba(34,211,238,0.5)',
  78.6: 'rgba(168,85,247,0.5)',
  100:  'rgba(63,185,80,0.6)',
};
const ARROW_HEAD_SIZE = 10;

// Convert lineStyle enum to canvas setLineDash array
function lineStyleToDash(style: Drawing['lineStyle'] | undefined): number[] {
  switch (style) {
    case 'dashed': return [8, 4];
    case 'dotted': return [2, 3];
    case 'dashdot': return [8, 3, 2, 3];
    default: return []; // solid
  }
}
const X_MARKER_SIZE = 8;
const FIB_EXTENSION_LEVELS = [0, 61.8, 100, 127.2, 161.8, 200, 261.8, 323.6, 423.6];
const FIB_FAN_LEVELS = [38.2, 50, 61.8];
const FIB_TIME_LEVELS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
const GANN_ANGLES = [82.5, 75, 71.25, 63.75, 45, 26.25, 18.75, 15, 7.5];

// ── Pixel point for canvas drawing ───────────────────────
interface PixelPoint { x: number; y: number; }

// ── Preview data passed from DrawingRenderer to primitive ──
interface PreviewData {
  points: DrawingPoint[];
  mousePixel: PixelPoint | null;
  tool: DrawingTool;
}

// ═══════════════════════════════════════════════════════════
// COORDINATE HELPERS
// ═══════════════════════════════════════════════════════════

// Timeframe to seconds mapping — used for snapping future time estimates
const TF_SECONDS: Record<string, number> = {
  '1s': 1, '5s': 5, '15s': 15, '30s': 30,
  '1min': 60, '5min': 300, '15min': 900, '30min': 1800,
  '1h': 3600, '2h': 7200, '4h': 14400,
  '1day': 86400, '1week': 604800, '1month': 2592000, '3month': 7776000,
};

function chartPointToPixel(pt: DrawingPoint, chart: IChartApi, series: ISeriesApi<SeriesType>): PixelPoint | null {
  // FIX: Always compute a position, even if it's off-screen.
  // Previously, returning null for off-screen points caused entire drawings
  // to disappear when zooming/panning. Now we estimate positions so lines
  // can extend beyond the visible area and partial drawings still render.
  const x = chart.timeScale().timeToCoordinate(pt.time as Time);
  const y = series.priceToCoordinate(pt.price);

  // If both coordinates are available, use them directly
  if (x !== null && y !== null) return { x, y };

  // Try to estimate missing coordinates from visible range
  try {
    const logicalRange = chart.timeScale().getVisibleLogicalRange();
    const coordRange = chart.timeScale().getVisibleRange();
    if (!logicalRange || !coordRange) return null;
    const chartWidth = chart.timeScale().width();
    const chartHeight = (series as any).priceScale?.()?.height?.() ?? 0;
    if (chartWidth <= 0) return null;

    const fromTime = coordRange.from as number;
    const toTime = coordRange.to as number;
    const barCount = logicalRange.to - logicalRange.from;
    const timeSpan = toTime - fromTime;
    if (timeSpan <= 0 || barCount <= 0) return null;

    const barSpacing = chartWidth / barCount;
    const candleInterval = timeSpan / barCount;
    const barFromX = logicalRange.from * barSpacing;

    // Estimate X from time if timeToCoordinate returned null
    let estimatedX: number | null = x;
    if (x === null) {
      const barsFromStart = (pt.time - fromTime) / candleInterval;
      estimatedX = barFromX + barsFromStart * barSpacing;
    }

    // Estimate Y from price if priceToCoordinate returned null
    // Use the visible price range to calculate a proportional position
    let estimatedY: number | null = y;
    if (y === null) {
      const priceRange = (series as any).priceScale?.()?.getVisiblePriceRange?.();
      if (priceRange) {
        const { from, to } = priceRange;
        if (to !== from && chartHeight > 0) {
          const ratio = (pt.price - from) / (to - from);
          estimatedY = chartHeight - ratio * chartHeight;
        }
      }
    }

    // Return if we have at least one valid coordinate
    if (estimatedX !== null && estimatedY !== null) {
      return { x: estimatedX, y: estimatedY };
    }
  } catch { /* chart may be destroyed */ }
  return null;
}

function pixelToChartPoint(x: number, y: number, chart: IChartApi, series: ISeriesApi<SeriesType>): DrawingPoint | null {
  const time = chart.timeScale().coordinateToTime(x);
  const price = series.coordinateToPrice(y);
  if (price === null) return null;

  if (time !== null) {
    return { time: time as number, price };
  }

  // Future position: estimate time from pixel coordinate
  // lightweight-charts' coordinateToTime returns null when no bar exists at that position
  // (e.g., clicking to the right of the last candle)
  try {
    const logicalRange = chart.timeScale().getVisibleLogicalRange();
    const coordRange = chart.timeScale().getVisibleRange();
    if (!logicalRange || !coordRange) return null;
    const chartWidth = chart.timeScale().width();
    if (chartWidth <= 0) return null;

    const fromTime = coordRange.from as number;
    const toTime = coordRange.to as number;
    const barCount = logicalRange.to - logicalRange.from;
    const timeSpan = toTime - fromTime;
    if (timeSpan <= 0 || barCount <= 0) return null;

    // Calculate bar spacing and candle interval from visible range
    const barSpacing = chartWidth / barCount;
    const candleInterval = timeSpan / barCount;

    // The x coordinate relative to the first visible bar
    const barFromX = logicalRange.from * barSpacing;
    const barsFromStart = (x - barFromX) / barSpacing;
    const estimatedTime = fromTime + barsFromStart * candleInterval;

    // Snap to nearest candle interval boundary for clean alignment
    const snappedTime = Math.round(estimatedTime / candleInterval) * candleInterval;

    return { time: snappedTime, price };
  } catch { /* chart may be destroyed */ }
  return null;
}

// ═══════════════════════════════════════════════════════════
// PANE RENDERER — Draws ALL drawings on the chart's canvas
// Called by lightweight-charts during its render cycle
// ═══════════════════════════════════════════════════════════

class DrawingPaneRenderer implements IPrimitivePaneRenderer {
  private _chart: IChartApi;
  private _series: ISeriesApi<SeriesType>;
  private _drawings: Drawing[];
  private _preview: PreviewData | null;

  constructor(
    chart: IChartApi,
    series: ISeriesApi<SeriesType>,
    drawings: Drawing[],
    preview: PreviewData | null,
  ) {
    this._chart = chart;
    this._series = series;
    this._drawings = drawings;
    this._preview = preview;
  }

  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const { width, height } = scope.mediaSize;

      ctx.save();
      // Clip to chart bounds
      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      ctx.clip();

      // 1. Draw all persisted drawings
      for (const drawing of this._drawings) {
        this.renderDrawing(ctx, drawing, width, height);
      }

      // 2. Draw in-progress preview
      if (this._preview && this._preview.points.length > 0 && this._preview.mousePixel) {
        this.renderPreview(ctx, this._preview, width, height);
      }

      ctx.restore();
    });
  }

  // ── Render a persisted (completed) drawing ─────────────
  private renderDrawing(ctx: CanvasRenderingContext2D, drawing: Drawing, canvasW: number, canvasH: number): void {
    const pts = drawing.points
      .map(p => chartPointToPixel(p, this._chart, this._series))
      .filter((p): p is PixelPoint => p !== null);
    if (pts.length === 0) return;

    ctx.save();
    ctx.setLineDash(lineStyleToDash(drawing.lineStyle));
    ctx.globalAlpha = drawing.opacity;
    ctx.strokeStyle = drawing.color;
    ctx.fillStyle = drawing.color;
    ctx.lineWidth = drawing.lineWidth;

    const d = { isPreview: false, points: drawing.points, color: drawing.color };

    switch (drawing.type) {
      case 'horizontal': this.drawHorizontalLine(ctx, pts[0], canvasW, d); break;
      case 'vertical': this.drawVerticalLine(ctx, pts[0], canvasH, d); break;
      case 'horizontal-ray': this.drawHorizontalRay(ctx, pts[0], canvasW, d); break;
      case 'cross-line': if (pts.length >= 1) this.drawCrossLine(ctx, pts[0], canvasW, canvasH, d); break;
      case 'x-marker': this.drawXMarker(ctx, pts[0], drawing.color, false); break;
      case 'price-label': this.drawPriceLabelMarker(ctx, pts[0], d); break;
      case 'note': this.drawNote(ctx, pts[0], d); break;
      case 'trendline': if (pts.length >= 2) this.drawTrendLine(ctx, pts[0], pts[1], d); break;
      case 'ray': if (pts.length >= 2) this.drawRay(ctx, pts[0], pts[1], canvasW, canvasH, d); break;
      case 'extended-line': if (pts.length >= 2) this.drawExtendedLine(ctx, pts[0], pts[1], canvasW, canvasH, d); break;
      case 'info-line': if (pts.length >= 2) this.drawInfoLine(ctx, pts[0], pts[1], d); break;
      case 'trend-angle': if (pts.length >= 2) this.drawTrendAngle(ctx, pts[0], pts[1], d); break;
      case 'fibonacci': if (pts.length >= 2) this.drawFibonacci(ctx, pts[0], pts[1], canvasW, d); break;
      case 'fib-extension': if (pts.length >= 2) this.drawFibExtension(ctx, pts[0], pts[1], canvasW, d); break;
      case 'fib-fan': if (pts.length >= 2) this.drawFibFan(ctx, pts[0], pts[1], d); break;
      case 'fib-spiral': if (pts.length >= 2) this.drawFibSpiral(ctx, pts[0], pts[1], d); break;
      case 'fib-wedge': if (pts.length >= 2) this.drawFibWedge(ctx, pts[0], pts[1], canvasW, d); break;
      case 'fib-time-zone': if (pts.length >= 2) this.drawFibTimeZone(ctx, pts[0], pts[1], canvasW, canvasH, d); break;
      case 'rectangle': if (pts.length >= 2) this.drawRectangle(ctx, pts[0], pts[1], d); break;
      case 'channel': if (pts.length >= 3) this.drawChannel(ctx, pts[0], pts[1], pts[2], d); break;
      case 'regression-trend': if (pts.length >= 3) this.drawRegressionTrend(ctx, pts[0], pts[1], pts[2], d); break;
      case 'flat-top-bottom': if (pts.length >= 2) this.drawFlatTopBottom(ctx, pts[0], pts[1], d); break;
      case 'disjoint-channel': if (pts.length >= 2) this.drawDisjointChannel(ctx, pts[0], pts[1], d); break;
      case 'andrews-pitchfork': if (pts.length >= 3) this.drawAndrewsPitchfork(ctx, pts[0], pts[1], pts[2], canvasW, canvasH, d); break;
      case 'schiff-pitchfork': if (pts.length >= 3) this.drawSchiffPitchfork(ctx, pts[0], pts[1], pts[2], canvasW, canvasH, d); break;
      case 'modified-schiff': if (pts.length >= 3) this.drawModifiedSchiff(ctx, pts[0], pts[1], pts[2], canvasW, canvasH, d); break;
      case 'triangle': if (pts.length >= 3) this.drawTriangle(ctx, pts[0], pts[1], pts[2], d); break;
      case 'circle': if (pts.length >= 2) this.drawCircle(ctx, pts[0], pts[1], d); break;
      case 'ellipse': if (pts.length >= 2) this.drawEllipse(ctx, pts[0], pts[1], d); break;
      case 'gann-box': if (pts.length >= 2) this.drawGannBox(ctx, pts[0], pts[1], d); break;
      case 'gann-square': if (pts.length >= 2) this.drawGannSquare(ctx, pts[0], pts[1], d); break;
      case 'gann-fan': if (pts.length >= 1) this.drawGannFan(ctx, pts[0], canvasW, canvasH, d); break;
      case 'arrow': if (pts.length >= 2) this.drawArrow(ctx, pts[0], pts[1], d); break;
      case 'price-range': if (pts.length >= 2) this.drawPriceRange(ctx, pts[0], pts[1], d); break;
      case 'text-annotation': if (pts.length >= 2) this.drawTextAnnotation(ctx, pts[0], pts[1], d); break;
    }

    ctx.restore();
  }

  // ── Render the in-progress preview ─────────────────────
  private renderPreview(ctx: CanvasRenderingContext2D, preview: PreviewData, canvasW: number, canvasH: number): void {
    const pts = preview.points
      .map(p => chartPointToPixel(p, this._chart, this._series))
      .filter((p): p is PixelPoint => p !== null);
    if (pts.length === 0 && !preview.mousePixel) return;

    const mouse = preview.mousePixel!;
    const d = { isPreview: true, points: preview.points, color: DEFAULT_COLOR };

    ctx.save();
    ctx.setLineDash(PREVIEW_DASH);
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = DEFAULT_COLOR;
    ctx.fillStyle = DEFAULT_COLOR;
    ctx.lineWidth = DEFAULT_LINE_WIDTH;

    switch (preview.tool) {
      case 'horizontal': this.drawHorizontalLine(ctx, pts[0] || mouse, canvasW, d); break;
      case 'vertical': this.drawVerticalLine(ctx, pts[0] || mouse, canvasH, d); break;
      case 'horizontal-ray': this.drawHorizontalRay(ctx, pts[0] || mouse, canvasW, d); break;
      case 'cross-line': this.drawCrossLine(ctx, pts[0] || mouse, canvasW, canvasH, d); break;
      case 'x-marker': this.drawXMarker(ctx, mouse, DEFAULT_COLOR, true); break;
      case 'trendline': if (pts.length >= 1) this.drawTrendLine(ctx, pts[0], mouse, d); break;
      case 'ray': if (pts.length >= 1) this.drawRay(ctx, pts[0], mouse, canvasW, canvasH, d); break;
      case 'extended-line': if (pts.length >= 1) this.drawExtendedLine(ctx, pts[0], mouse, canvasW, canvasH, d); break;
      case 'info-line': if (pts.length >= 1) this.drawInfoLine(ctx, pts[0], mouse, d); break;
      case 'trend-angle': if (pts.length >= 1) this.drawTrendAngle(ctx, pts[0], mouse, d); break;
      case 'fibonacci': if (pts.length >= 1) this.drawFibonacci(ctx, pts[0], mouse, canvasW, d); break;
      case 'fib-extension': if (pts.length >= 1) this.drawFibExtension(ctx, pts[0], mouse, canvasW, d); break;
      case 'fib-fan': if (pts.length >= 1) this.drawFibFan(ctx, pts[0], mouse, d); break;
      case 'fib-spiral': if (pts.length >= 1) this.drawFibSpiral(ctx, pts[0], mouse, d); break;
      case 'fib-wedge': if (pts.length >= 1) this.drawFibWedge(ctx, pts[0], mouse, canvasW, d); break;
      case 'fib-time-zone': if (pts.length >= 1) this.drawFibTimeZone(ctx, pts[0], mouse, canvasW, canvasH, d); break;
      case 'rectangle': if (pts.length >= 1) this.drawRectangle(ctx, pts[0], mouse, d); break;
      case 'channel':
        if (pts.length === 1) this.drawTrendLine(ctx, pts[0], mouse, d);
        else if (pts.length >= 2) this.drawChannel(ctx, pts[0], pts[1], mouse, d);
        break;
      case 'regression-trend':
        if (pts.length === 1) this.drawTrendLine(ctx, pts[0], mouse, d);
        else if (pts.length >= 2) this.drawChannel(ctx, pts[0], pts[1], mouse, d);
        break;
      case 'flat-top-bottom': if (pts.length >= 1) this.drawFlatTopBottom(ctx, pts[0], mouse, d); break;
      case 'disjoint-channel': if (pts.length >= 1) this.drawDisjointChannel(ctx, pts[0], mouse, d); break;
      case 'andrews-pitchfork':
        if (pts.length === 1) this.drawTrendLine(ctx, pts[0], mouse, d);
        else if (pts.length >= 2) this.drawSimpleLine(ctx, pts[0], mouse);
        break;
      case 'schiff-pitchfork':
        if (pts.length === 1) this.drawTrendLine(ctx, pts[0], mouse, d);
        else if (pts.length >= 2) this.drawSimpleLine(ctx, pts[0], mouse);
        break;
      case 'modified-schiff':
        if (pts.length === 1) this.drawTrendLine(ctx, pts[0], mouse, d);
        else if (pts.length >= 2) this.drawSimpleLine(ctx, pts[0], mouse);
        break;
      case 'triangle':
        if (pts.length === 1) this.drawTrendLine(ctx, pts[0], mouse, d);
        else if (pts.length >= 2) this.drawSimpleLine(ctx, pts[0], mouse);
        break;
      case 'circle': if (pts.length >= 1) this.drawCircle(ctx, pts[0], mouse, d); break;
      case 'ellipse': if (pts.length >= 1) this.drawEllipse(ctx, pts[0], mouse, d); break;
      case 'gann-box': if (pts.length >= 1) this.drawGannBox(ctx, pts[0], mouse, d); break;
      case 'gann-square': if (pts.length >= 1) this.drawGannSquare(ctx, pts[0], mouse, d); break;
      case 'gann-fan':
        if (pts.length === 1) this.drawTrendLine(ctx, pts[0], mouse, d);
        else if (pts.length >= 2) this.drawSimpleLine(ctx, pts[0], mouse);
        break;
      case 'arrow': if (pts.length >= 1) this.drawArrow(ctx, pts[0], mouse, d); break;
      case 'price-range': if (pts.length >= 1) this.drawPriceRange(ctx, pts[0], mouse, d); break;
      case 'price-label': this.drawPriceLabelMarker(ctx, pts[0] || mouse, d); break;
      case 'note': this.drawNote(ctx, pts[0] || mouse, d); break;
      case 'text-annotation': if (pts.length >= 1) this.drawTextAnnotation(ctx, pts[0], mouse, d); break;
    }

    ctx.restore();
  }

  // ══════════════════════════════════════════════════════════
  //  ALL DRAWING ROUTINES — CSS pixel coordinates (media space)
  // ══════════════════════════════════════════════════════════

  private drawDot(ctx: CanvasRenderingContext2D, pt: PixelPoint, radius: number = 3): void {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // H11 FIX: Dynamic price decimals based on price magnitude.
  // Previously, all prices used .toFixed(2), which is wrong for:
  // - BTC/USD (2 decimals is fine: 67,234.56)
  // - EUR/USD forex (needs 5 decimals: 1.08234)
  // - JPY pairs (needs 3 decimals: 149.500)
  // - DOGE (needs 5+ decimals: 0.12345)
  private formatPrice(price: number): string {
    const abs = Math.abs(price);
    if (abs === 0) return '0.00';
    if (abs >= 10000) return price.toFixed(2);   // BTC, large stocks
    if (abs >= 100) return price.toFixed(2);     // Most stocks, JPY pairs
    if (abs >= 1) return price.toFixed(4);       // Small stocks, some crypto
    if (abs >= 0.01) return price.toFixed(6);    // Low-value crypto (DOGE, SHIB)
    return price.toFixed(8);                      // Micro-cap tokens
  }

  private drawPriceLabel(ctx: CanvasRenderingContext2D, x: number, y: number, price: number): void {
    const text = this.formatPrice(price);
    ctx.save();
    ctx.font = "10px 'JetBrains Mono', monospace";
    const textW = ctx.measureText(text).width;
    const padX = 4, padY = 2;
    const rx = x + padX, ry = y - 6 - padY, rw = textW + padX * 2, rh = 12 + padY * 2;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#151A22';
    ctx.beginPath(); ctx.roundRect(rx, ry, rw, rh, 3); ctx.fill();
    ctx.strokeStyle = DEFAULT_COLOR; ctx.lineWidth = 1; ctx.globalAlpha = 0.5; ctx.stroke();
    ctx.globalAlpha = 0.95; ctx.fillStyle = DEFAULT_COLOR;
    ctx.fillText(text, rx + padX, ry + padY + 10);
    ctx.restore();
  }

  private drawTimeLabel(ctx: CanvasRenderingContext2D, x: number, y: number, time: number): void {
    const date = new Date(time * 1000);
    const text = date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
    ctx.save();
    ctx.font = "10px 'JetBrains Mono', monospace";
    const textW = ctx.measureText(text).width;
    const padX = 4, padY = 2;
    const rx = x - textW / 2 - padX, ry = y, rw = textW + padX * 2, rh = 12 + padY * 2;
    ctx.globalAlpha = 0.85; ctx.fillStyle = '#151A22';
    ctx.beginPath(); ctx.roundRect(rx, ry, rw, rh, 3); ctx.fill();
    ctx.strokeStyle = DEFAULT_COLOR; ctx.lineWidth = 1; ctx.globalAlpha = 0.5; ctx.stroke();
    ctx.globalAlpha = 0.95; ctx.fillStyle = DEFAULT_COLOR;
    ctx.fillText(text, rx + padX, ry + padY + 10);
    ctx.restore();
  }

  // ── Drawing type: DrawData ─────────────────────────────
  private pp(d: { points: DrawingPoint[] }, index: number): number | null { return d.points[index]?.price ?? null; }

  // ── Time coordinate helper ──
  // FIX: Get the time value for a drawing point at the given index.
  // Used by Fibonacci Time Zone and other time-based drawings to calculate
  // intervals based on actual candle time, not pixel distance.
  private tt(d: { points: DrawingPoint[] }, index: number): number | null { return d.points[index]?.time ?? null; }

  // ── Time-to-pixel conversion ──
  // Convert a chart time value to a pixel x-coordinate on the canvas.
  // Returns null if the time is outside the visible range.
  private timeToPixel(time: number, _d: { points: DrawingPoint[] }): number | null {
    try {
      const x = this._chart.timeScale().timeToCoordinate(time as Time);
      return x; // null if outside visible range
    } catch {
      return null;
    }
  }

  // ── Horizontal Line ────────────────────────────────────
  private drawHorizontalLine(ctx: CanvasRenderingContext2D, pt: PixelPoint, canvasW: number, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    ctx.beginPath(); ctx.moveTo(0, pt.y); ctx.lineTo(canvasW, pt.y); ctx.stroke();
    if (!d.isPreview) this.drawPriceLabel(ctx, canvasW - 2, pt.y, this.pp(d, 0) ?? 0);
  }

  // ── Vertical Line ──────────────────────────────────────
  private drawVerticalLine(ctx: CanvasRenderingContext2D, pt: PixelPoint, canvasH: number, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    ctx.beginPath(); ctx.moveTo(pt.x, 0); ctx.lineTo(pt.x, canvasH); ctx.stroke();
    if (!d.isPreview && d.points[0]) this.drawTimeLabel(ctx, pt.x, canvasH - 20, d.points[0].time);
  }

  // ── Horizontal Ray ─────────────────────────────────────
  private drawHorizontalRay(ctx: CanvasRenderingContext2D, pt: PixelPoint, canvasW: number, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(canvasW, pt.y); ctx.stroke();
    if (!d.isPreview) this.drawPriceLabel(ctx, canvasW - 2, pt.y, this.pp(d, 0) ?? 0);
    this.drawDot(ctx, pt);
  }

  // ── Cross Line ─────────────────────────────────────────
  private drawCrossLine(ctx: CanvasRenderingContext2D, a: PixelPoint, canvasW: number, canvasH: number, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    ctx.beginPath(); ctx.moveTo(0, a.y); ctx.lineTo(canvasW, a.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a.x, 0); ctx.lineTo(a.x, canvasH); ctx.stroke();
    if (!d.isPreview) { this.drawPriceLabel(ctx, canvasW - 2, a.y, this.pp(d, 0) ?? 0); if (d.points[0]) this.drawTimeLabel(ctx, a.x, canvasH - 20, d.points[0].time); }
    this.drawDot(ctx, a);
  }

  // ── X Marker ───────────────────────────────────────────
  private drawXMarker(ctx: CanvasRenderingContext2D, pt: PixelPoint, color: string, isPreview: boolean): void {
    const sz = X_MARKER_SIZE;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = isPreview ? 1 : 2;
    ctx.beginPath(); ctx.moveTo(pt.x - sz, pt.y - sz); ctx.lineTo(pt.x + sz, pt.y + sz);
    ctx.moveTo(pt.x + sz, pt.y - sz); ctx.lineTo(pt.x - sz, pt.y + sz); ctx.stroke();
    ctx.beginPath(); ctx.arc(pt.x, pt.y, sz + 2, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // ── Trend Line ─────────────────────────────────────────
  private drawTrendLine(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, _d?: any): void {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    this.drawDot(ctx, a); this.drawDot(ctx, b);
  }

  // ── Simple Line ────────────────────────────────────────
  private drawSimpleLine(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint): void {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }

  // ── Ray ────────────────────────────────────────────────
  private drawRay(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, canvasW: number, canvasH: number, _d?: any): void {
    const dx = b.x - a.x, dy = b.y - a.y;
    if (dx === 0 && dy === 0) return;
    let tMax = this.tMax(a.x, a.y, dx, dy, canvasW, canvasH);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + dx * tMax, a.y + dy * tMax); ctx.stroke();
    this.drawDot(ctx, a);
  }

  // ── Extended Line ──────────────────────────────────────
  private drawExtendedLine(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, canvasW: number, canvasH: number, _d?: any): void {
    const dx = b.x - a.x, dy = b.y - a.y;
    let tMin = -Infinity, tMax = Infinity;
    if (dx !== 0) { const tL = -a.x / dx, tR = (canvasW - a.x) / dx; if (dx > 0) { tMin = tL; tMax = tR; } else { tMin = tR; tMax = tL; } }
    if (dy !== 0) { const tT = -a.y / dy, tB = (canvasH - a.y) / dy; if (dy > 0) { tMin = Math.max(tMin, tT); tMax = Math.min(tMax, tB); } else { tMin = Math.max(tMin, tB); tMax = Math.min(tMax, tT); } }
    ctx.beginPath(); ctx.moveTo(a.x + dx * tMin, a.y + dy * tMin); ctx.lineTo(a.x + dx * tMax, a.y + dy * tMax); ctx.stroke();
    this.drawDot(ctx, a); this.drawDot(ctx, b);
  }

  // ── Info Line ──────────────────────────────────────────
  private drawInfoLine(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    if (!d.isPreview) {
      const priceA = this.pp(d, 0), priceB = this.pp(d, 1);
      const priceDist = priceA !== null && priceB !== null ? Math.abs(priceB - priceA) : 0;
      const angle = Math.atan2(-(b.y - a.y), b.x - a.x) * (180 / Math.PI);
      const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
      ctx.save(); ctx.font = "10px 'JetBrains Mono', monospace"; ctx.fillStyle = d.color; ctx.globalAlpha = 0.85;
      ctx.fillText(`Δ ${this.formatPrice(priceDist)}`, midX + 6, midY - 8);
      ctx.fillText(`${angle.toFixed(1)}°`, midX + 6, midY + 4);
      ctx.restore();
    }
    this.drawDot(ctx, a); this.drawDot(ctx, b);
  }

  // ── Trend Angle ────────────────────────────────────────
  private drawTrendAngle(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    if (!d.isPreview) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const angle = Math.atan2(-dy, dx) * (180 / Math.PI);
      const arcR = 20, lineAngle = Math.atan2(dy, dx);
      ctx.save(); ctx.globalAlpha = 0.4;
      ctx.beginPath(); ctx.arc(a.x, a.y, arcR, 0, -lineAngle, lineAngle > 0); ctx.stroke();
      ctx.globalAlpha = 0.9; ctx.font = "10px 'JetBrains Mono', monospace"; ctx.fillStyle = d.color;
      ctx.fillText(`${angle.toFixed(1)}°`, a.x + arcR + 6, a.y - 4);
      ctx.restore();
    }
    this.drawDot(ctx, a); this.drawDot(ctx, b);
  }

  // ── Fibonacci Retracement ──────────────────────────────
  private drawFibonacci(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, canvasW: number, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    const priceA = this.pp(d, 0), priceB = this.pp(d, 1);
    if (priceA === null || priceB === null) return;
    const range = priceB - priceA;
    for (const level of FIBONACCI_LEVELS) {
      const price = priceA + range * (level / 100);
      const y = this._series.priceToCoordinate(price);
      if (y === null) continue;
      const color = FIBONACCI_COLORS[level] || DEFAULT_COLOR;
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = level === 50 ? 2 : 1; ctx.globalAlpha = d.isPreview ? 0.35 : 0.6;
      ctx.beginPath(); ctx.moveTo(a.x, y); ctx.lineTo(b.x, y); ctx.stroke();
      if (!d.isPreview) { ctx.globalAlpha = 0.85; ctx.font = "10px 'JetBrains Mono', monospace"; ctx.fillStyle = color; ctx.fillText(`${level}% — ${this.formatPrice(price)}`, b.x + 6, y + 3); }
      ctx.restore();
    }
    ctx.save(); ctx.strokeStyle = DEFAULT_COLOR; ctx.lineWidth = DEFAULT_LINE_WIDTH; ctx.globalAlpha = d.isPreview ? 0.5 : DEFAULT_OPACITY;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore();
    this.drawDot(ctx, a); this.drawDot(ctx, b);
  }

  // ── Fibonacci Extension ────────────────────────────────
  private drawFibExtension(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, canvasW: number, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    const priceA = this.pp(d, 0), priceB = this.pp(d, 1);
    if (priceA === null || priceB === null) return;
    const range = priceB - priceA;
    for (const level of FIB_EXTENSION_LEVELS) {
      const price = priceA + range * (level / 100);
      const y = this._series.priceToCoordinate(price);
      if (y === null) continue;
      const color = FIBONACCI_COLORS[level] || DEFAULT_COLOR;
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = (level === 0 || level === 100) ? 1.5 : 1; ctx.globalAlpha = d.isPreview ? 0.35 : 0.6;
      ctx.beginPath(); ctx.moveTo(a.x, y); ctx.lineTo(b.x, y); ctx.stroke();
      if (!d.isPreview) { ctx.globalAlpha = 0.85; ctx.font = "10px 'JetBrains Mono', monospace"; ctx.fillStyle = color; ctx.fillText(`${level}% — ${this.formatPrice(price)}`, b.x + 6, y + 3); }
      ctx.restore();
    }
    ctx.save(); ctx.strokeStyle = DEFAULT_COLOR; ctx.lineWidth = DEFAULT_LINE_WIDTH; ctx.globalAlpha = d.isPreview ? 0.5 : DEFAULT_OPACITY;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore();
    this.drawDot(ctx, a); this.drawDot(ctx, b);
  }

  // ── Fibonacci Fan ──────────────────────────────────────
  private drawFibFan(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    const priceA = this.pp(d, 0), priceB = this.pp(d, 1);
    if (priceA === null || priceB === null) return;
    const range = priceB - priceA;
    ctx.save(); ctx.strokeStyle = DEFAULT_COLOR; ctx.lineWidth = DEFAULT_LINE_WIDTH; ctx.globalAlpha = d.isPreview ? 0.5 : DEFAULT_OPACITY;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore();
    for (const level of FIB_FAN_LEVELS) {
      const price = priceA + range * (level / 100);
      const y = this._series.priceToCoordinate(price);
      if (y === null) continue;
      const color = FIBONACCI_COLORS[level] || DEFAULT_COLOR;
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.globalAlpha = d.isPreview ? 0.35 : 0.6;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, y); ctx.stroke();
      if (!d.isPreview) { ctx.globalAlpha = 0.85; ctx.font = "10px 'JetBrains Mono', monospace"; ctx.fillStyle = color; ctx.fillText(`${level}% — ${this.formatPrice(price)}`, b.x + 6, y + 3); }
      ctx.restore();
    }
    this.drawDot(ctx, a); this.drawDot(ctx, b);
  }

  // ── Fibonacci Spiral ───────────────────────────────────
  private drawFibSpiral(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, _d?: any): void {
    const dx = b.x - a.x, dy = b.y - a.y, maxR = Math.sqrt(dx * dx + dy * dy);
    const phi = (1 + Math.sqrt(5)) / 2, gf = Math.log(phi) / (Math.PI / 2);
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) { const t = (i / 200) * 4 * Math.PI; const r = maxR * Math.exp(-gf * t); if (r < 2) break; const px = a.x + r * Math.cos(t), py = a.y + r * Math.sin(t); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
    ctx.stroke();
    this.drawDot(ctx, a); this.drawDot(ctx, b);
  }

  // ── Fibonacci Wedge ────────────────────────────────────
  private drawFibWedge(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, canvasW: number, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    const priceA = this.pp(d, 0), priceB = this.pp(d, 1);
    if (priceA === null || priceB === null) return;
    const range = priceB - priceA;
    ctx.save(); ctx.strokeStyle = DEFAULT_COLOR; ctx.lineWidth = DEFAULT_LINE_WIDTH; ctx.globalAlpha = d.isPreview ? 0.5 : DEFAULT_OPACITY;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore();
    for (const level of FIB_FAN_LEVELS) {
      const priceUp = priceA + range * (level / 100), priceDown = priceA - range * (level / 100);
      const yUp = this._series.priceToCoordinate(priceUp), yDown = this._series.priceToCoordinate(priceDown);
      const color = FIBONACCI_COLORS[level] || DEFAULT_COLOR;
      if (yUp !== null) { ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.globalAlpha = d.isPreview ? 0.35 : 0.6; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, yUp); ctx.stroke(); if (!d.isPreview) { ctx.globalAlpha = 0.85; ctx.font = "10px 'JetBrains Mono', monospace"; ctx.fillStyle = color; ctx.fillText(`${level}%`, b.x + 6, yUp + 3); } ctx.restore(); }
      if (yDown !== null) { ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.globalAlpha = d.isPreview ? 0.35 : 0.6; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, yDown); ctx.stroke(); if (!d.isPreview) { ctx.globalAlpha = 0.85; ctx.font = "10px 'JetBrains Mono', monospace"; ctx.fillStyle = color; ctx.fillText(`-${level}%`, b.x + 6, yDown + 3); } ctx.restore(); }
    }
    this.drawDot(ctx, a); this.drawDot(ctx, b);
  }

  // ── Fibonacci Time Zone ────────────────────────────────
  // FIX: Calculate time zone lines based on CANDLE COUNT, not pixel distance.
  // M4 FIX: Even during PREVIEW, use time-based calculation.
  // Previously, the preview used pixel distance and the committed drawing used
  // time-based calculation, causing lines to visually "jump" when the mouse
  // was released. Now both use the same time-based approach.
  private drawFibTimeZone(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, canvasW: number, canvasH: number, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    // Convert pixel positions to chart time coordinates
    const timeA = this.tt(d, 0); // time at point A

    // M4 FIX: For preview, also use time-based calculation by converting
    // the mouse pixel position back to a chart time coordinate.
    // This eliminates the visual "jump" when the drawing is committed.
    let timeInterval: number;

    if (timeA !== null && d.points.length >= 2) {
      const timeB = this.tt(d, 1);
      if (timeB !== null && timeB !== timeA) {
        timeInterval = timeB - timeA;
      } else if (timeA !== null) {
        // Preview mode: point B is the mouse position — convert pixel to time
        const mouseTime = this._chart.timeScale().coordinateToTime(b.x);
        if (mouseTime !== null && mouseTime !== timeA) {
          timeInterval = (mouseTime as number) - timeA;
        } else {
          // Can't convert mouse to time — estimate from pixel distance
          // using the time scale's visible range
          timeInterval = this.estimateTimeFromPixels(a.x, b.x);
        }
      } else {
        timeInterval = this.estimateTimeFromPixels(a.x, b.x);
      }
    } else if (timeA !== null) {
      // Only point A has time data — estimate interval from pixel distance
      const mouseTime = this._chart.timeScale().coordinateToTime(b.x);
      if (mouseTime !== null && mouseTime !== timeA) {
        timeInterval = (mouseTime as number) - timeA;
      } else {
        timeInterval = this.estimateTimeFromPixels(a.x, b.x);
      }
    } else {
      // No time data available at all — pure pixel fallback
      timeInterval = 0;
    }

    if (timeInterval > 0 && timeA !== null) {
      for (const level of FIB_TIME_LEVELS) {
        const targetTime = timeA + timeInterval * level;

        // Convert target time back to pixel x-coordinate
        const x = this.timeToPixel(targetTime, d);
        if (x === null || x < 0 || x > canvasW) continue;

        const color = FIBONACCI_COLORS[61.8] || DEFAULT_COLOR;
        ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = level === 1 ? 1.5 : 1; ctx.globalAlpha = d.isPreview ? 0.35 : 0.5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvasH); ctx.stroke();
        if (!d.isPreview) { ctx.globalAlpha = 0.85; ctx.font = "10px 'JetBrains Mono', monospace"; ctx.fillStyle = color; ctx.fillText(`${level}`, x + 4, canvasH - 6); }
        ctx.restore();
      }
    } else {
      // Pure pixel fallback — no time coordinates available at all
      const timeDist = b.x - a.x;
      for (const level of FIB_TIME_LEVELS) {
        const x = a.x + timeDist * level;
        if (x < 0 || x > canvasW) continue;
        const color = FIBONACCI_COLORS[61.8] || DEFAULT_COLOR;
        ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = level === 1 ? 1.5 : 1; ctx.globalAlpha = d.isPreview ? 0.35 : 0.5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvasH); ctx.stroke();
        if (!d.isPreview) { ctx.globalAlpha = 0.85; ctx.font = "10px 'JetBrains Mono', monospace"; ctx.fillStyle = color; ctx.fillText(`${level}`, x + 4, canvasH - 6); }
        ctx.restore();
      }
    }
    this.drawDot(ctx, a); this.drawDot(ctx, b);
  }

  // M4: Estimate time interval from pixel distance using the visible time scale range.
  // This is used when coordinateToTime fails (e.g., mouse is outside visible range).
  private estimateTimeFromPixels(aX: number, bX: number): number {
    try {
      const range = this._chart.timeScale().getVisibleLogicalRange();
      if (!range) return 0;
      const coordRange = this._chart.timeScale().getVisibleRange();
      if (!coordRange) return 0;
      const fromTime = (coordRange.from as number);
      const toTime = (coordRange.to as number);
      const barCount = range.to - range.from;
      if (barCount <= 0) return 0;
      const pixelsPerBar = (bX - aX); // pixel distance between two points
      // Approximate: if the distance between points A and B is X pixels,
      // and we know the total time range and bar count, estimate the time interval
      const chartWidth = this._chart.timeScale().width();
      if (chartWidth <= 0) return 0;
      const timePerPixel = (toTime - fromTime) / chartWidth;
      return Math.max(1, Math.round(pixelsPerBar * timePerPixel));
    } catch {
      return 0;
    }
  }

  // ── Rectangle ──────────────────────────────────────────
  private drawRectangle(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    ctx.save(); ctx.globalAlpha = d.isPreview ? 0.05 : 0.08; ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(x, y, w, h); ctx.restore();
    ctx.strokeRect(x, y, w, h);
    this.drawDot(ctx, a); this.drawDot(ctx, b);
  }

  // ── Channel ────────────────────────────────────────────
  private drawChannel(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, c: PixelPoint, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    const px = -dy / len, py = dx / len, dist = (c.x - a.x) * px + (c.y - a.y) * py;
    const a2x = a.x + px * dist, a2y = a.y + py * dist, b2x = b.x + px * dist, b2y = b.y + py * dist;
    ctx.beginPath(); ctx.moveTo(a2x, a2y); ctx.lineTo(b2x, b2y); ctx.stroke();
    ctx.save(); ctx.globalAlpha = d.isPreview ? 0.04 : 0.06; ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b2x, b2y); ctx.lineTo(a2x, a2y); ctx.closePath(); ctx.fill(); ctx.restore();
    this.drawDot(ctx, a); this.drawDot(ctx, b); this.drawDot(ctx, { x: a2x, y: a2y });
  }

  // ── Regression Trend ───────────────────────────────────
  private drawRegressionTrend(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, c: PixelPoint, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    const xs = [a.x, b.x, c.x], ys = [a.y, b.y, c.y];
    let sX = 0, sY = 0, sXY = 0, sXX = 0;
    for (let i = 0; i < 3; i++) { sX += xs[i]; sY += ys[i]; sXY += xs[i] * ys[i]; sXX += xs[i] * xs[i]; }
    const den = 3 * sXX - sX * sX; if (den === 0) return;
    const slope = (3 * sXY - sX * sY) / den, intercept = (sY - slope * sX) / 3;
    const minX = safeMin(xs), maxX = safeMax(xs);
    const midY1 = slope * minX + intercept, midY2 = slope * maxX + intercept;
    ctx.beginPath(); ctx.moveTo(minX, midY1); ctx.lineTo(maxX, midY2); ctx.stroke();
    let maxDist = 0;
    for (let i = 0; i < 3; i++) { const dist = Math.abs(slope * xs[i] - ys[i] + intercept) / Math.sqrt(slope * slope + 1); if (dist > maxDist) maxDist = dist; }
    const pL = Math.sqrt(slope * slope + 1), px = -slope / pL, py = 1 / pL;
    ctx.beginPath(); ctx.moveTo(minX + px * maxDist, midY1 + py * maxDist); ctx.lineTo(maxX + px * maxDist, midY2 + py * maxDist); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(minX - px * maxDist, midY1 - py * maxDist); ctx.lineTo(maxX - px * maxDist, midY2 - py * maxDist); ctx.stroke();
    ctx.save(); ctx.globalAlpha = d.isPreview ? 0.04 : 0.06; ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.moveTo(minX + px * maxDist, midY1 + py * maxDist); ctx.lineTo(maxX + px * maxDist, midY2 + py * maxDist);
    ctx.lineTo(maxX - px * maxDist, midY2 - py * maxDist); ctx.lineTo(minX - px * maxDist, midY1 - py * maxDist); ctx.closePath(); ctx.fill(); ctx.restore();
    this.drawDot(ctx, a); this.drawDot(ctx, b); this.drawDot(ctx, c);
  }

  // ── Flat Top / Bottom ──────────────────────────────────
  private drawFlatTopBottom(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    ctx.save(); ctx.globalAlpha = d.isPreview ? 0.05 : 0.08; ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = d.isPreview ? 0.3 : 0.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke(); ctx.restore();
    ctx.strokeRect(x, y, w, h);
    this.drawDot(ctx, a); this.drawDot(ctx, b);
  }

  // ── Disjoint Channel ───────────────────────────────────
  private drawDisjointChannel(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    const offset = 15, dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    const px = -dy / len, py = dx / len;
    const a1x = a.x + px * offset, a1y = a.y + py * offset, b1x = b.x + px * offset, b1y = b.y + py * offset;
    const a2x = a.x - px * offset, a2y = a.y - py * offset, b2x = b.x - px * offset, b2y = b.y - py * offset;
    ctx.beginPath(); ctx.moveTo(a1x, a1y); ctx.lineTo(b1x, b1y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a2x, a2y); ctx.lineTo(b2x, b2y); ctx.stroke();
    ctx.save(); ctx.globalAlpha = d.isPreview ? 0.04 : 0.06; ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.moveTo(a1x, a1y); ctx.lineTo(b1x, b1y); ctx.lineTo(b2x, b2y); ctx.lineTo(a2x, a2y); ctx.closePath(); ctx.fill(); ctx.restore();
    this.drawDot(ctx, a); this.drawDot(ctx, b);
  }

  // ── Pitchfork helpers ──────────────────────────────────
  private drawPitchforkCore(ctx: CanvasRenderingContext2D, ox: number, oy: number, a: PixelPoint, b: PixelPoint, c: PixelPoint, canvasW: number, canvasH: number, d: { isPreview: boolean; points: DrawingPoint[]; color: string }, midBCx: number, midBCy: number): void {
    const dx = midBCx - ox, dy = midBCy - oy;
    let tMax = this.tMax(ox, oy, dx, dy, canvasW, canvasH);
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + dx * tMax, oy + dy * tMax); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(c.x, c.y); ctx.stroke();
    ctx.save(); ctx.setLineDash(d.isPreview ? PREVIEW_DASH : [4, 3]); ctx.globalAlpha = 0.4;
    const dxB = b.x - ox, dyB = b.y - oy, tB = this.tMax(ox, oy, dxB, dyB, canvasW, canvasH);
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(ox + dxB * tB, oy + dyB * tB); ctx.stroke();
    const dxC = c.x - ox, dyC = c.y - oy, tC = this.tMax(ox, oy, dxC, dyC, canvasW, canvasH);
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(ox + dxC * tC, oy + dyC * tC); ctx.stroke();
    ctx.restore();
    this.drawDot(ctx, a); this.drawDot(ctx, b); this.drawDot(ctx, c);
  }

  private drawAndrewsPitchfork(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, c: PixelPoint, canvasW: number, canvasH: number, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    this.drawPitchforkCore(ctx, a.x, a.y, a, b, c, canvasW, canvasH, d, (b.x + c.x) / 2, (b.y + c.y) / 2);
  }

  private drawSchiffPitchfork(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, c: PixelPoint, canvasW: number, canvasH: number, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    const midBCx = (b.x + c.x) / 2, midBCy = (b.y + c.y) / 2;
    this.drawPitchforkCore(ctx, (a.x + midBCx) / 2, (a.y + midBCy) / 2, a, b, c, canvasW, canvasH, d, midBCx, midBCy);
  }

  private drawModifiedSchiff(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, c: PixelPoint, canvasW: number, canvasH: number, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    const midBCx = (b.x + c.x) / 2, midBCy = (b.y + c.y) / 2;
    const halfMidBCx = (a.x + midBCx) / 2, halfMidBCy = (a.y + midBCy) / 2;
    this.drawPitchforkCore(ctx, (a.x + halfMidBCx) / 2, (a.y + halfMidBCy) / 2, a, b, c, canvasW, canvasH, d, halfMidBCx, halfMidBCy);
  }

  // ── Triangle ───────────────────────────────────────────
  private drawTriangle(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, c: PixelPoint, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.closePath(); ctx.stroke();
    ctx.save(); ctx.globalAlpha = d.isPreview ? 0.04 : 0.06; ctx.fillStyle = ctx.strokeStyle; ctx.fill(); ctx.restore();
    this.drawDot(ctx, a); this.drawDot(ctx, b); this.drawDot(ctx, c);
  }

  // ── Circle ─────────────────────────────────────────────
  private drawCircle(ctx: CanvasRenderingContext2D, center: PixelPoint, edge: PixelPoint, _d?: any): void {
    const dx = edge.x - center.x, dy = edge.y - center.y, r = Math.sqrt(dx * dx + dy * dy);
    ctx.beginPath(); ctx.arc(center.x, center.y, r, 0, Math.PI * 2); ctx.stroke();
    this.drawDot(ctx, center);
  }

  // ── Ellipse ────────────────────────────────────────────
  private drawEllipse(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, rx = Math.abs(b.x - a.x) / 2, ry = Math.abs(b.y - a.y) / 2;
    if (rx === 0 || ry === 0) return;
    ctx.save(); ctx.globalAlpha = d.isPreview ? 0.05 : 0.08; ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    this.drawDot(ctx, a); this.drawDot(ctx, b);
  }

  // ── Gann Box ───────────────────────────────────────────
  private drawGannBox(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    ctx.save(); ctx.globalAlpha = d.isPreview ? 0.05 : 0.08; ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(x, y, w, h); ctx.restore();
    ctx.strokeRect(x, y, w, h);
    ctx.save(); ctx.globalAlpha = d.isPreview ? 0.3 : 0.5; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.stroke();
    ctx.restore();
    this.drawDot(ctx, a); this.drawDot(ctx, b);
  }

  // ── Gann Square ────────────────────────────────────────
  private drawGannSquare(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, maxW = Math.abs(b.x - a.x), maxH = Math.abs(b.y - a.y);
    for (let i = 1; i <= 4; i++) {
      const f = i / 4, hw = maxW * f / 2, hh = maxH * f / 2;
      ctx.save(); ctx.globalAlpha = d.isPreview ? 0.2 + f * 0.3 : 0.3 + f * 0.5;
      ctx.strokeRect(cx - hw, cy - hh, hw * 2, hh * 2); ctx.restore();
    }
    ctx.save(); ctx.globalAlpha = d.isPreview ? 0.3 : 0.5; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(cx, cy - maxH / 2); ctx.lineTo(cx, cy + maxH / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - maxW / 2, cy); ctx.lineTo(cx + maxW / 2, cy); ctx.stroke();
    ctx.restore();
    this.drawDot(ctx, a); this.drawDot(ctx, b);
  }

  // ── Gann Fan ───────────────────────────────────────────
  // FIX: Draw Gann Fan in BOTH directions (up and down from the pivot point).
  // Previously, only upward lines were drawn (positive angles from pivot).
  // A proper Gann Fan should show lines going both UP and DOWN from the
  // origin point, creating the characteristic fan shape that traders use
  // to identify support/resistance from both directions.
  private drawGannFan(ctx: CanvasRenderingContext2D, a: PixelPoint, canvasW: number, canvasH: number, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    for (const deg of GANN_ANGLES) {
      const rad = (deg * Math.PI) / 180;
      const main = Math.abs(deg - 45) < 0.1;

      // Upward fan lines (positive direction from pivot)
      const dxUp = Math.cos(rad), dyUp = -Math.sin(rad);
      const tMUp = this.tMax(a.x, a.y, dxUp, dyUp, canvasW, canvasH);
      ctx.save(); ctx.strokeStyle = main ? DEFAULT_COLOR : ctx.strokeStyle; ctx.lineWidth = main ? 1.5 : 1;
      ctx.globalAlpha = d.isPreview ? (main ? 0.5 : 0.3) : (main ? DEFAULT_OPACITY : 0.5);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + dxUp * tMUp, a.y + dyUp * tMUp); ctx.stroke();
      if (!d.isPreview) { ctx.globalAlpha = 0.7; ctx.font = "9px 'JetBrains Mono', monospace"; ctx.fillStyle = main ? DEFAULT_COLOR : ctx.strokeStyle;
        const lx = a.x + dxUp * Math.min(tMUp, 60), ly = a.y + dyUp * Math.min(tMUp, 60); ctx.fillText(`${deg}°`, lx + 4, ly - 4); }
      ctx.restore();

      // Downward fan lines (negative direction from pivot — mirror vertically)
      const dxDown = Math.cos(rad), dyDown = Math.sin(rad);
      const tMDown = this.tMax(a.x, a.y, dxDown, dyDown, canvasW, canvasH);
      ctx.save(); ctx.strokeStyle = main ? DEFAULT_COLOR : ctx.strokeStyle; ctx.lineWidth = main ? 1.5 : 1;
      ctx.globalAlpha = d.isPreview ? (main ? 0.4 : 0.2) : (main ? DEFAULT_OPACITY * 0.7 : 0.35);
      ctx.setLineDash(main ? [] : [4, 3]); // Dashed for down lines to distinguish direction
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + dxDown * tMDown, a.y + dyDown * tMDown); ctx.stroke();
      if (!d.isPreview) { ctx.setLineDash([]); ctx.globalAlpha = 0.5; ctx.font = "9px 'JetBrains Mono', monospace"; ctx.fillStyle = main ? DEFAULT_COLOR : ctx.strokeStyle;
        const lx = a.x + dxDown * Math.min(tMDown, 60), ly = a.y + dyDown * Math.min(tMDown, 60); ctx.fillText(`-${deg}°`, lx + 4, ly + 12); }
      ctx.restore();
    }
    this.drawDot(ctx, a);
  }

  // ── Arrow ──────────────────────────────────────────────
  private drawArrow(ctx: CanvasRenderingContext2D, from: PixelPoint, to: PixelPoint, _d?: any): void {
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
    const angle = Math.atan2(to.y - from.y, to.x - from.x), h = ARROW_HEAD_SIZE;
    ctx.beginPath(); ctx.moveTo(to.x, to.y); ctx.lineTo(to.x - h * Math.cos(angle - Math.PI / 6), to.y - h * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(to.x, to.y); ctx.lineTo(to.x - h * Math.cos(angle + Math.PI / 6), to.y - h * Math.sin(angle + Math.PI / 6)); ctx.stroke();
    this.drawDot(ctx, from);
  }

  // ── Price Range ────────────────────────────────────────
  private drawPriceRange(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    const priceA = this.pp(d, 0), priceB = this.pp(d, 1);
    if (priceA === null || priceB === null) return;
    const topY = Math.min(a.y, b.y), botY = Math.max(a.y, b.y), midX = (a.x + b.x) / 2, capW = 8;
    ctx.beginPath(); ctx.moveTo(midX, topY); ctx.lineTo(midX, botY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(midX - capW, topY); ctx.lineTo(midX + capW, topY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(midX - capW, botY); ctx.lineTo(midX + capW, botY); ctx.stroke();
    if (!d.isPreview) {
      const hi = Math.max(priceA, priceB), lo = Math.min(priceA, priceB), diff = hi - lo;
      this.drawPriceLabel(ctx, midX + capW + 4, topY, hi);
      this.drawPriceLabel(ctx, midX + capW + 4, botY, lo);
      if (diff > 0) { ctx.save(); ctx.font = "10px 'JetBrains Mono', monospace"; ctx.fillStyle = DEFAULT_COLOR; ctx.globalAlpha = 0.9; ctx.fillText(`Δ ${this.formatPrice(diff)}`, midX + capW + 4, (topY + botY) / 2 + 3); ctx.restore(); }
    }
    this.drawDot(ctx, a); this.drawDot(ctx, b);
  }

  // ── Text Annotation ────────────────────────────────────
  private drawTextAnnotation(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    ctx.save(); ctx.globalAlpha = d.isPreview ? 0.05 : 0.08; ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(x, y, w, h); ctx.restore();
    ctx.strokeRect(x, y, w, h);
    if (!d.isPreview && w > 20 && h > 14) { ctx.save(); ctx.font = "10px 'JetBrains Mono', monospace"; ctx.fillStyle = DEFAULT_COLOR; ctx.globalAlpha = 0.8; ctx.fillText('TEXT', x + 4, y + h / 2 + 3); ctx.restore(); }
    this.drawDot(ctx, a); this.drawDot(ctx, b);
  }

  // ── Price Label Marker ─────────────────────────────────
  private drawPriceLabelMarker(ctx: CanvasRenderingContext2D, pt: PixelPoint, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    const price = this.pp(d, 0) ?? 0, text = this.formatPrice(price);
    ctx.save(); ctx.font = "10px 'JetBrains Mono', monospace";
    const textW = ctx.measureText(text).width, padX = 6, padY = 3;
    const rx = pt.x - textW / 2 - padX, ry = pt.y - 6 - padY, rw = textW + padX * 2, rh = 12 + padY * 2;
    ctx.globalAlpha = 0.85; ctx.fillStyle = '#151A22'; ctx.beginPath(); ctx.roundRect(rx, ry, rw, rh, 4); ctx.fill();
    ctx.strokeStyle = d.color; ctx.lineWidth = d.isPreview ? 1 : 1.5; ctx.globalAlpha = d.isPreview ? 0.5 : 0.7; ctx.stroke();
    ctx.globalAlpha = 0.95; ctx.fillStyle = d.color; ctx.fillText(text, rx + padX, ry + padY + 10);
    ctx.globalAlpha = 0.85; ctx.fillStyle = '#151A22'; const as = 4;
    ctx.beginPath(); ctx.moveTo(pt.x - as, ry + rh); ctx.lineTo(pt.x, ry + rh + as); ctx.lineTo(pt.x + as, ry + rh); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ── Note Pin ───────────────────────────────────────────
  private drawNote(ctx: CanvasRenderingContext2D, pt: PixelPoint, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    const sz = 6;
    ctx.save(); ctx.globalAlpha = d.isPreview ? 0.5 : 0.9;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, sz + 2, 0, Math.PI * 2); ctx.fillStyle = d.color; ctx.fill();
    ctx.beginPath(); ctx.arc(pt.x, pt.y, sz - 1, 0, Math.PI * 2); ctx.fillStyle = '#151A22'; ctx.fill();
    ctx.strokeStyle = d.color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pt.x, pt.y + sz + 2); ctx.lineTo(pt.x, pt.y + sz + 12); ctx.stroke();
    ctx.restore();
  }

  // ── Helper: compute tMax for ray/line extension ────────
  private tMax(ox: number, oy: number, dx: number, dy: number, canvasW: number, canvasH: number): number {
    let tMax = Infinity;
    if (dx !== 0) { const tR = (canvasW - ox) / dx, tL = -ox / dx; tMax = dx > 0 ? tR : tL; }
    if (dy !== 0) { const tB = (canvasH - oy) / dy, tT = -oy / dy; tMax = Math.min(tMax, dy > 0 ? tB : tT); }
    return tMax;
  }
}

// ═══════════════════════════════════════════════════════════
// PANE VIEW — Provides the renderer to lightweight-charts
// ═══════════════════════════════════════════════════════════

class DrawingPaneView implements IPrimitivePaneView {
  private _chart: IChartApi;
  private _series: ISeriesApi<SeriesType>;
  private _drawings: Drawing[];
  private _preview: PreviewData | null;

  constructor(chart: IChartApi, series: ISeriesApi<SeriesType>) {
    this._chart = chart;
    this._series = series;
    this._drawings = [];
    this._preview = null;
  }

  update(drawings: Drawing[], preview: PreviewData | null): void {
    this._drawings = drawings;
    this._preview = preview;
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'top';
  }

  renderer(): IPrimitivePaneRenderer | null {
    return new DrawingPaneRenderer(this._chart, this._series, this._drawings, this._preview);
  }
}

// ═══════════════════════════════════════════════════════════
// SERIES PRIMITIVE — Attached to the candlestick series
// Implements ISeriesPrimitiveBase to draw on the chart's canvas
// ═══════════════════════════════════════════════════════════

class DrawingSeriesPrimitive implements ISeriesPrimitiveBase<SeriesAttachedParameter> {
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _paneView: DrawingPaneView;
  private _drawings: Drawing[] = [];
  private _preview: PreviewData | null = null;

  private _attached = false;
  // FIX: Subscribe to visible range changes so drawings re-render on zoom/pan
  private _visibleRangeHandler: ((range: any) => void) | null = null;

  constructor() {
    // PaneView will be re-created in attached() with real chart/series refs
    this._paneView = new DrawingPaneView(null as any, null as any);
  }

  attached(param: SeriesAttachedParameter): void {
    this._chart = param.chart as IChartApi;
    this._series = param.series as ISeriesApi<SeriesType>;
    this._requestUpdate = param.requestUpdate;
    this._attached = true;
    // Re-create pane view with actual chart/series refs
    (this as any)._paneView = new DrawingPaneView(this._chart, this._series);
    // Push current data to view
    this._paneView.update(this._drawings, this._preview);

    // FIX: Re-render drawings whenever the visible range changes (zoom/pan)
    // Without this, drawings disappear or appear at wrong positions when zooming
    try {
      this._visibleRangeHandler = () => { this.requestUpdate(); };
      this._chart.timeScale().subscribeVisibleLogicalRangeChange(this._visibleRangeHandler);
    } catch { /* chart may not support subscription */ }
  }

  detached(): void {
    // FIX: Unsubscribe from visible range changes
    if (this._visibleRangeHandler && this._chart) {
      try { this._chart.timeScale().unsubscribeVisibleLogicalRangeChange(this._visibleRangeHandler); } catch { /* ignore */ }
      this._visibleRangeHandler = null;
    }
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
    this._attached = false;
  }

  updateAllViews(): void {
    this._paneView.update(this._drawings, this._preview);
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._paneView];
  }

  hitTest(_x: number, _y: number): PrimitiveHoveredItem | null {
    return null; // Hit testing handled by DrawingRenderer event system
  }

  // ── Data management ────────────────────────────────────

  setDrawings(drawings: Drawing[]): void {
    this._drawings = drawings;
    this.requestUpdate();
  }

  setPreview(preview: PreviewData | null): void {
    this._preview = preview;
    this.requestUpdate();
  }

  private requestUpdate(): void {
    // Guard: don't call requestUpdate before primitive is attached to chart
    if (!this._attached || !this._requestUpdate) return;
    this._requestUpdate();
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN DRAWING RENDERER — Public API
// No overlay canvas — uses Series Primitive instead
// ═══════════════════════════════════════════════════════════

export class DrawingRenderer {
  private chart: IChartApi;
  private candleSeries: ISeriesApi<'Candlestick'>;
  private container: HTMLDivElement;
  private drawingManager: DrawingManager;
  private onDrawingChange?: () => void;

  private primitive: DrawingSeriesPrimitive | null = null;

  private currentTool: DrawingTool = 'cursor';
  private clickedPoints: DrawingPoint[] = [];
  private mousePixel: PixelPoint | null = null;
  private isDrawing = false;

  private isDragging = false;
  private dragDrawingId: string | null = null;
  private dragOriginalPoints: DrawingPoint[] = [];
  private dragStartChartPoint: DrawingPoint | null = null;
  private dragPointIndex: number = -1;

  /** Current timeframe for scope filtering */
  private currentTimeframe: string = '';

  private boundMouseDown: (e: MouseEvent) => void;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseUp: (e: MouseEvent) => void;
  private boundContextMenu: (e: MouseEvent) => void;
  private boundKeyDown: (e: KeyboardEvent) => void;
  // Event capture handlers — prevent chart from receiving events during drawing
  private boundWheelCapture: (e: WheelEvent) => void;
  private boundTouchStartCapture: (e: TouchEvent) => void;
  private boundTouchMoveCapture: (e: TouchEvent) => void;
  private started = false;

  private static readonly PROXIMITY_THRESHOLD = 12;

  constructor(chart: IChartApi, candleSeries: ISeriesApi<'Candlestick'>, container: HTMLDivElement, drawingManager: DrawingManager, onDrawingChange?: () => void) {
    this.chart = chart;
    this.candleSeries = candleSeries;
    this.container = container;
    this.drawingManager = drawingManager;
    this.onDrawingChange = onDrawingChange;

    this.boundMouseDown = this.onMouseDown.bind(this);
    this.boundMouseMove = this.onMouseMove.bind(this);
    this.boundMouseUp = this.onMouseUp.bind(this);
    this.boundContextMenu = this.onContextMenu.bind(this);
    this.boundKeyDown = this.onKeyDown.bind(this);
    // Capture-phase handlers to block chart scroll/zoom during drawing
    this.boundWheelCapture = this.onWheelCapture.bind(this);
    this.boundTouchStartCapture = this.onTouchStartCapture.bind(this);
    this.boundTouchMoveCapture = this.onTouchMoveCapture.bind(this);
  }

  // ══════════════════════════════════════════════════════════
  //  PUBLIC API — Same interface as before, no changes needed
  // ══════════════════════════════════════════════════════════

  start(): void {
    if (this.started) return;
    this.started = true;

    this.primitive = new DrawingSeriesPrimitive();
    this.candleSeries.attachPrimitive(this.primitive as any);

    this.attachEvents();
    this.syncPrimitive();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;

    if (this.primitive) {
      this.candleSeries.detachPrimitive(this.primitive as any);
      this.primitive = null;
    }

    this.setChartInteractionEnabled(true);
    this.container.style.cursor = '';
    this.detachEvents();
    this.clickedPoints = [];
    this.mousePixel = null;
    this.isDrawing = false;
  }

  setTool(tool: DrawingTool): void {
    this.currentTool = tool;
    this.clickedPoints = [];
    this.isDrawing = false;
    this.mousePixel = null;
    this.isDragging = false;
    this.dragDrawingId = null;
    this.dragOriginalPoints = [];
    this.dragStartChartPoint = null;
    this.dragPointIndex = -1;

    if (tool === 'cursor') {
      this.setChartInteractionEnabled(true);
      this.container.style.cursor = '';
    } else {
      this.setChartInteractionEnabled(false);
      this.container.style.cursor = 'crosshair';
    }
    this.syncPrimitive();
  }

  clearAndRedraw(): void {
    this.drawingManager.clearAll();
    this.syncPrimitive();
  }

  redraw(): void {
    this.syncPrimitive();
  }

  cancelDrawing(): void {
    this.clickedPoints = [];
    this.isDrawing = false;
    this.mousePixel = null;
    this.syncPrimitive();
  }

  /** Set the current timeframe — used for scope filtering (single-tf vs all-tf) */
  setTimeframe(tf: string): void {
    if (this.currentTimeframe === tf) return;
    this.currentTimeframe = tf;
    this.syncPrimitive();
  }

  // ══════════════════════════════════════════════════════════
  //  PRIMITIVE SYNC — Pushes all data to the series primitive
  // ══════════════════════════════════════════════════════════

  private syncPrimitive(): void {
    if (!this.primitive) return;
    // Filter drawings by scope: show 'all-tf' drawings on all timeframes,
    // and 'single-tf' drawings only on their original timeframe
    const allDrawings = this.drawingManager.getAll();
    const visibleDrawings = allDrawings.filter(d =>
      d.scope === 'all-tf' || d.timeframe === this.currentTimeframe
    );
    this.primitive.setDrawings(visibleDrawings);
    this.primitive.setPreview(
      this.isDrawing && this.clickedPoints.length > 0
        ? { points: this.clickedPoints, mousePixel: this.mousePixel, tool: this.currentTool }
        : null,
    );
  }

  // ══════════════════════════════════════════════════════════
  //  EVENT WIRING
  // ══════════════════════════════════════════════════════════

  private attachEvents(): void {
    this.container.addEventListener('mousedown', this.boundMouseDown, true);
    this.container.addEventListener('mousemove', this.boundMouseMove);
    this.container.addEventListener('mouseup', this.boundMouseUp);
    this.container.addEventListener('contextmenu', this.boundContextMenu);
    document.addEventListener('keydown', this.boundKeyDown);
    // Capture-phase: block wheel/touch events from reaching chart during drawing
    this.container.addEventListener('wheel', this.boundWheelCapture, true);
    this.container.addEventListener('touchstart', this.boundTouchStartCapture, true);
    this.container.addEventListener('touchmove', this.boundTouchMoveCapture, true);
  }

  private detachEvents(): void {
    this.container.removeEventListener('mousedown', this.boundMouseDown, true);
    this.container.removeEventListener('mousemove', this.boundMouseMove);
    this.container.removeEventListener('mouseup', this.boundMouseUp);
    this.container.removeEventListener('contextmenu', this.boundContextMenu);
    document.removeEventListener('keydown', this.boundKeyDown);
    this.container.removeEventListener('wheel', this.boundWheelCapture, true);
    this.container.removeEventListener('touchstart', this.boundTouchStartCapture, true);
    this.container.removeEventListener('touchmove', this.boundTouchMoveCapture, true);
  }

  // ══════════════════════════════════════════════════════════
  //  CHART INTERACTION — Event capture approach, NEVER calls applyOptions
  //
  //  CRITICAL FIX (Bug #2): The old approach used chart.applyOptions()
  //  to toggle handleScroll/handleScale, which triggered a full chart
  //  re-render and GPU compositing layer recomposition. This caused
  //  candle bodies to disappear (appearing as dots).
  //
  //  The new approach blocks events from reaching the chart's internal
  //  event handlers by using capture-phase event listeners and calling
  //  stopPropagation(). This completely avoids chart.applyOptions() and
  //  thus never triggers a re-render or GPU recomposition.
  // ══════════════════════════════════════════════════════════

  // Whether drawing mode is active (any tool except cursor)
  private get isDrawingMode(): boolean {
    return this.currentTool !== 'cursor' || this.isDragging;
  }

  // Block wheel events (zoom) during drawing mode
  private onWheelCapture(e: WheelEvent): void {
    if (this.isDrawingMode) {
      e.stopPropagation(); // Prevent chart from receiving wheel event
    }
    // When not in drawing mode, wheel events pass through normally
  }

  // Block touch start (pan/pinch start) during drawing mode
  private onTouchStartCapture(e: TouchEvent): void {
    if (this.isDrawingMode && e.touches.length === 1) {
      e.stopPropagation(); // Single-finger touch: block panning
    }
    // Two-finger touch (pinch): allow through for pinch-to-zoom
  }

  // Block touch move (pan) during drawing mode
  private onTouchMoveCapture(e: TouchEvent): void {
    if (this.isDrawingMode && e.touches.length === 1) {
      e.stopPropagation(); // Single-finger move: block panning
      e.preventDefault(); // Also prevent scroll
    }
  }

  // Legacy method kept for compatibility — now a NO-OP
  // This ensures existing call sites don't break
  private setChartInteractionEnabled(_enabled: boolean): void {
    // NO-OP: Chart interaction is now controlled via capture-phase event
    // listeners (onWheelCapture, onTouchStartCapture, onTouchMoveCapture)
    // which block events from reaching the chart during drawing mode.
    // This avoids the GPU recomposition bug caused by chart.applyOptions().
  }

  // ══════════════════════════════════════════════════════════
  //  COORDINATE CONVERSION
  // ══════════════════════════════════════════════════════════

  private pixelToChartPoint(e: MouseEvent): DrawingPoint | null {
    const rect = this.container.getBoundingClientRect();
    return pixelToChartPoint(e.clientX - rect.left, e.clientY - rect.top, this.chart, this.candleSeries);
  }

  private chartPointToPixel(pt: DrawingPoint): PixelPoint | null {
    return chartPointToPixel(pt, this.chart, this.candleSeries);
  }

  // ══════════════════════════════════════════════════════════
  //  DRAG HELPERS
  // ══════════════════════════════════════════════════════════

  private startDrag(drawing: Drawing, e: MouseEvent): void {
    this.isDragging = true;
    this.dragDrawingId = drawing.id;
    this.dragPointIndex = -1;
    this.dragOriginalPoints = drawing.points.map(p => ({ ...p }));
    this.dragStartChartPoint = this.pixelToChartPoint(e);
    this.setChartInteractionEnabled(false);
    e.stopImmediatePropagation();
    e.preventDefault();
  }

  private isPointNearSegment(px: number, py: number, a: PixelPoint, b: PixelPoint): boolean {
    const t = DrawingRenderer.PROXIMITY_THRESHOLD;
    const dx = b.x - a.x, dy = b.y - a.y, lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.abs(px - a.x) < t && Math.abs(py - a.y) < t;
    let s = ((px - a.x) * dx + (py - a.y) * dy) / lenSq;
    s = Math.max(0, Math.min(1, s));
    const cx = a.x + s * dx, cy = a.y + s * dy;
    return (px - cx) * (px - cx) + (py - cy) * (py - cy) < t * t;
  }

  // ══════════════════════════════════════════════════════════
  //  MOUSE HANDLERS
  // ══════════════════════════════════════════════════════════

  private onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;

    if (this.currentTool === 'cursor') {
      const rect = this.container.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;

      for (const drawing of this.drawingManager.getAll()) {
        // Skip drawings hidden on this timeframe
        if (drawing.scope === 'single-tf' && drawing.timeframe !== this.currentTimeframe) continue;
        if (drawing.type === 'horizontal') {
          const pp = this.chartPointToPixel(drawing.points[0]);
          if (pp && Math.abs(y - pp.y) < DrawingRenderer.PROXIMITY_THRESHOLD) { this.startDrag(drawing, e); this.container.style.cursor = 'ns-resize'; return; }
        } else if (drawing.type === 'vertical') {
          const pp = this.chartPointToPixel(drawing.points[0]);
          if (pp && Math.abs(x - pp.x) < DrawingRenderer.PROXIMITY_THRESHOLD) { this.startDrag(drawing, e); this.container.style.cursor = 'ew-resize'; return; }
        } else {
          const pts = drawing.points.map(p => this.chartPointToPixel(p)).filter((p): p is PixelPoint => p !== null);
          let endIdx = -1;
          for (let i = 0; i < pts.length; i++) { if (Math.abs(x - pts[i].x) < DrawingRenderer.PROXIMITY_THRESHOLD && Math.abs(y - pts[i].y) < DrawingRenderer.PROXIMITY_THRESHOLD) { endIdx = i; break; } }
          if (endIdx >= 0) { this.startDrag(drawing, e); this.dragPointIndex = endIdx; this.container.style.cursor = 'crosshair'; return; }
          let nearSeg = false;
          if (pts.length >= 2) { for (let i = 0; i < pts.length - 1; i++) { if (this.isPointNearSegment(x, y, pts[i], pts[i + 1])) { nearSeg = true; break; } } }
          if (nearSeg) { this.startDrag(drawing, e); this.dragPointIndex = -1; this.container.style.cursor = 'move'; return; }
        }
      }
      return;
    }

    const point = this.pixelToChartPoint(e);
    if (!point) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    this.setChartInteractionEnabled(false);

    this.clickedPoints.push(point);
    this.isDrawing = true;
    // Use chartPointToPixel for precise position, fallback to raw mouse position
    const precisePixel = this.chartPointToPixel(point);
    if (precisePixel) {
      this.mousePixel = precisePixel;
    } else {
      // Fallback: raw mouse position for preview when point is at chart edge
      const rect = this.container.getBoundingClientRect();
      this.mousePixel = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    if (this.clickedPoints.length >= DrawingManager.requiredPoints(this.currentTool)) {
      this.completeDrawing();
    } else {
      this.syncPrimitive();
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (this.isDragging && this.dragDrawingId) {
      e.preventDefault();
      const cur = this.pixelToChartPoint(e);
      if (!cur || !this.dragStartChartPoint) return;
      const dp = cur.price - this.dragStartChartPoint.price, dt = cur.time - this.dragStartChartPoint.time;
      const drawing = this.drawingManager.get(this.dragDrawingId);
      if (drawing) {
        if (drawing.type === 'horizontal') {
          this.drawingManager.update(this.dragDrawingId, { points: [{ ...this.dragOriginalPoints[0], price: this.dragOriginalPoints[0].price + dp }] });
        } else if (drawing.type === 'vertical') {
          this.drawingManager.update(this.dragDrawingId, { points: [{ ...this.dragOriginalPoints[0], time: this.dragOriginalPoints[0].time + dt }] });
        } else if (this.dragPointIndex >= 0 && this.dragPointIndex < this.dragOriginalPoints.length) {
          this.drawingManager.update(this.dragDrawingId, { points: this.dragOriginalPoints.map((pt, i) => i === this.dragPointIndex ? { ...pt, price: pt.price + dp, time: pt.time + dt } : { ...pt }) });
        } else {
          this.drawingManager.update(this.dragDrawingId, { points: this.dragOriginalPoints.map(pt => ({ ...pt, price: pt.price + dp, time: pt.time + dt })) });
        }
        this.syncPrimitive();
      }
      return;
    }

    if (this.currentTool === 'cursor' && !this.isDrawing) {
      const rect = this.container.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      let near = false;
      for (const drawing of this.drawingManager.getAll()) {
        // Skip drawings hidden on this timeframe
        if (drawing.scope === 'single-tf' && drawing.timeframe !== this.currentTimeframe) continue;
        if (drawing.type === 'horizontal') { const pp = this.chartPointToPixel(drawing.points[0]); if (pp && Math.abs(y - pp.y) < DrawingRenderer.PROXIMITY_THRESHOLD) { near = true; break; } }
        else if (drawing.type === 'vertical') { const pp = this.chartPointToPixel(drawing.points[0]); if (pp && Math.abs(x - pp.x) < DrawingRenderer.PROXIMITY_THRESHOLD) { near = true; break; } }
        else {
          const pts = drawing.points.map(p => this.chartPointToPixel(p)).filter((p): p is PixelPoint => p !== null);
          for (const pp of pts) { if (Math.abs(x - pp.x) < DrawingRenderer.PROXIMITY_THRESHOLD && Math.abs(y - pp.y) < DrawingRenderer.PROXIMITY_THRESHOLD) { near = true; this.container.style.cursor = 'crosshair'; break; } }
          if (!near && pts.length >= 2) { for (let i = 0; i < pts.length - 1; i++) { if (this.isPointNearSegment(x, y, pts[i], pts[i + 1])) { near = true; this.container.style.cursor = 'move'; break; } } }
          if (near) break;
        }
      }
      if (!near) this.container.style.cursor = '';
      return;
    }

    if (!this.isDrawing || this.currentTool === 'cursor') return;
    e.preventDefault();
    const rect = this.container.getBoundingClientRect();
    this.mousePixel = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    this.syncPrimitive();
  }

  private onMouseUp(_e: MouseEvent): void {
    if (this.isDragging) {
      this.isDragging = false;
      this.dragDrawingId = null;
      this.dragOriginalPoints = [];
      this.dragStartChartPoint = null;
      if (this.currentTool === 'cursor') this.setChartInteractionEnabled(true);
      this.container.style.cursor = '';
      // Notify that drawings changed (drag completed, triggers auto-save)
      this.onDrawingChange?.();
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.cancelDrawing();
      this.closeContextMenu();
      this.currentTool = 'cursor';
      this.setChartInteractionEnabled(true);
      this.container.style.cursor = '';
    }
  }

  // ══════════════════════════════════════════════════════════
  //  CONTEXT MENU — Right-click on drawing opens settings
  // ══════════════════════════════════════════════════════════

  private contextMenuEl: HTMLDivElement | null = null;
  private contextMenuDrawingId: string | null = null;
  private contextMenuCloseHandler: ((e: MouseEvent) => void) | null = null;

  private static readonly COLORS = [
    '#fbbf24', '#f59e0b', '#ef4444', '#f85149', '#fb7185',
    '#22d3ee', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7',
    '#00FFA3', '#3fb950', '#10b981', '#ec4899', '#ffffff',
  ];

  private static readonly LINE_WIDTHS = [1, 1.5, 2, 3, 4];

  private static readonly LINE_STYLES: Array<{ value: Drawing['lineStyle']; label: string; dash: number[] }> = [
    { value: 'solid', label: '━━━', dash: [] },
    { value: 'dashed', label: '┅ ┅ ┅', dash: [8, 4] },
    { value: 'dotted', label: '· · · · ·', dash: [2, 3] },
    { value: 'dashdot', label: '┅· ┅·', dash: [8, 3, 2, 3] },
  ];

  private onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.closeContextMenu();

    const rect = this.container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Find which drawing was clicked (only visible drawings matching scope filter)
    let hitDrawing: Drawing | null = null;
    for (const drawing of this.drawingManager.getAll()) {
      // Skip drawings that are hidden on this timeframe
      if (drawing.scope === 'single-tf' && drawing.timeframe !== this.currentTimeframe) continue;
      if (this.isPointNearDrawing(x, y, drawing)) {
        hitDrawing = drawing;
        break;
      }
    }

    if (!hitDrawing) return;

    this.contextMenuDrawingId = hitDrawing.id;
    this.showContextMenu(e.clientX, e.clientY, hitDrawing);
  }

  private isPointNearDrawing(x: number, y: number, drawing: Drawing): boolean {
    if (drawing.type === 'horizontal' || drawing.type === 'horizontal-ray') {
      const pp = this.chartPointToPixel(drawing.points[0]);
      return pp !== null && Math.abs(y - pp.y) < DrawingRenderer.PROXIMITY_THRESHOLD;
    }
    if (drawing.type === 'vertical') {
      const pp = this.chartPointToPixel(drawing.points[0]);
      return pp !== null && Math.abs(x - pp.x) < DrawingRenderer.PROXIMITY_THRESHOLD;
    }

    const pts = drawing.points.map(p => this.chartPointToPixel(p)).filter((p): p is PixelPoint => p !== null);
    if (pts.length === 0) return false;

    // Check proximity to any point
    for (const pt of pts) {
      if (Math.abs(x - pt.x) < DrawingRenderer.PROXIMITY_THRESHOLD && Math.abs(y - pt.y) < DrawingRenderer.PROXIMITY_THRESHOLD) {
        return true;
      }
    }

    // Check proximity to any segment
    if (pts.length >= 2) {
      for (let i = 0; i < pts.length - 1; i++) {
        if (this.isPointNearSegment(x, y, pts[i], pts[i + 1])) return true;
      }
    }

    return false;
  }

  private showContextMenu(clientX: number, clientY: number, drawing: Drawing): void {
    const menu = document.createElement('div');
    menu.className = 'roua-drawing-menu';
    menu.style.cssText = `
      position: fixed; left: ${clientX}px; top: ${clientY}px;
      z-index: 99999; background: #1a1b26; border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px; padding: 8px 0; min-width: 180px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5); font-family: 'JetBrains Mono', monospace;
      font-size: 11px; color: #e0e0e0; user-select: none;
    `;

    // ── Color Section ──
    this.addMenuSection(menu, 'Color');
    const colorGrid = document.createElement('div');
    colorGrid.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;padding:4px 10px;';
    for (const c of DrawingRenderer.COLORS) {
      const btn = document.createElement('div');
      btn.style.cssText = `
        width:18px;height:18px;border-radius:4px;cursor:pointer;
        background:${c};border:2px solid ${drawing.color === c ? '#fff' : 'transparent'};
        transition:border 0.15s;
      `;
      btn.addEventListener('mouseenter', () => { btn.style.borderColor = '#fff'; });
      btn.addEventListener('mouseleave', () => { btn.style.borderColor = drawing.color === c ? '#fff' : 'transparent'; });
      btn.addEventListener('click', () => this.updateDrawingProperty('color', c));
      colorGrid.appendChild(btn);
    }
    menu.appendChild(colorGrid);

    // ── Custom Color ──
    const customColorRow = document.createElement('div');
    customColorRow.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 10px;';
    const customInput = document.createElement('input');
    customInput.type = 'color';
    customInput.value = drawing.color;
    customInput.style.cssText = 'width:24px;height:24px;border:none;background:none;cursor:pointer;padding:0;';
    const customLabel = document.createElement('span');
    customLabel.textContent = drawing.color.toUpperCase();
    customLabel.style.cssText = 'font-size:10px;color:#888;';
    customInput.addEventListener('input', (e) => {
      const val = (e.target as HTMLInputElement).value;
      customLabel.textContent = val.toUpperCase();
      this.updateDrawingProperty('color', val);
    });
    customColorRow.appendChild(customInput);
    customColorRow.appendChild(customLabel);
    menu.appendChild(customColorRow);

    // ── Line Width Section ──
    this.addMenuSection(menu, 'Width');
    const widthRow = document.createElement('div');
    widthRow.style.cssText = 'display:flex;gap:4px;padding:4px 10px;align-items:center;';
    for (const w of DrawingRenderer.LINE_WIDTHS) {
      const btn = document.createElement('div');
      btn.style.cssText = `
        display:flex;align-items:center;justify-content:center;
        width:28px;height:22px;border-radius:4px;cursor:pointer;
        background:${drawing.lineWidth === w ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.05)'};
        border:1px solid ${drawing.lineWidth === w ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.08)'};
        transition:background 0.15s;
      `;
      const line = document.createElement('div');
      line.style.cssText = `width:16px;height:${Math.max(1, w)}px;background:${drawing.color};border-radius:1px;`;
      btn.appendChild(line);
      btn.addEventListener('click', () => this.updateDrawingProperty('lineWidth', w));
      btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(0,212,255,0.1)'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = drawing.lineWidth === w ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.05)'; });
      widthRow.appendChild(btn);
    }
    menu.appendChild(widthRow);

    // ── Line Style Section ──
    this.addMenuSection(menu, 'Style');
    const styleRow = document.createElement('div');
    styleRow.style.cssText = 'display:flex;gap:4px;padding:4px 10px;flex-direction:column;';
    for (const ls of DrawingRenderer.LINE_STYLES) {
      const btn = document.createElement('div');
      btn.style.cssText = `
        display:flex;align-items:center;gap:8px;padding:4px 8px;
        border-radius:4px;cursor:pointer;
        background:${drawing.lineStyle === ls.value ? 'rgba(0,212,255,0.15)' : 'transparent'};
        transition:background 0.15s;
      `;
      // Draw the style preview as an SVG line
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '40');
      svg.setAttribute('height', '10');
      svg.style.cssText = 'flex-shrink:0;';
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '0'); line.setAttribute('y1', '5');
      line.setAttribute('x2', '40'); line.setAttribute('y2', '5');
      line.setAttribute('stroke', drawing.color);
      line.setAttribute('stroke-width', '2');
      if (ls.dash.length > 0) line.setAttribute('stroke-dasharray', ls.dash.join(','));
      svg.appendChild(line);
      btn.appendChild(svg);
      const label = document.createElement('span');
      label.textContent = ls.value;
      label.style.cssText = 'font-size:10px;text-transform:capitalize;color:#aaa;';
      btn.appendChild(label);
      btn.addEventListener('click', () => this.updateDrawingProperty('lineStyle', ls.value));
      btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(0,212,255,0.1)'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = drawing.lineStyle === ls.value ? 'rgba(0,212,255,0.15)' : 'transparent'; });
      styleRow.appendChild(btn);
    }
    menu.appendChild(styleRow);

    // ── Opacity Section ──
    this.addMenuSection(menu, 'Opacity');
    const opacityRow = document.createElement('div');
    opacityRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 10px;';
    const opacitySlider = document.createElement('input');
    opacitySlider.type = 'range';
    opacitySlider.min = '0.1';
    opacitySlider.max = '1';
    opacitySlider.step = '0.1';
    opacitySlider.value = String(drawing.opacity);
    opacitySlider.style.cssText = 'flex:1;accent-color:#00d4ff;height:4px;';
    const opacityLabel = document.createElement('span');
    opacityLabel.textContent = `${Math.round(drawing.opacity * 100)}%`;
    opacityLabel.style.cssText = 'font-size:10px;color:#888;min-width:32px;text-align:right;';
    opacitySlider.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      opacityLabel.textContent = `${Math.round(val * 100)}%`;
      this.updateDrawingProperty('opacity', val);
    });
    opacityRow.appendChild(opacitySlider);
    opacityRow.appendChild(opacityLabel);
    menu.appendChild(opacityRow);

    // ── Timeframe Scope Section ──
    this.addMenuSection(menu, 'Visibility');
    const scopeRow = document.createElement('div');
    scopeRow.style.cssText = 'display:flex;gap:4px;padding:4px 10px;';
    const scopeOptions: Array<{ value: Drawing['scope']; label: string; desc: string }> = [
      { value: 'all-tf', label: 'All TF', desc: 'Visible on all timeframes' },
      { value: 'single-tf', label: 'This TF', desc: `Only on ${this.currentTimeframe || 'current'}` },
    ];
    for (const so of scopeOptions) {
      const btn = document.createElement('div');
      btn.style.cssText = `
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        flex:1;padding:5px 4px;border-radius:4px;cursor:pointer;
        background:${drawing.scope === so.value ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.05)'};
        border:1px solid ${drawing.scope === so.value ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.08)'};
        transition:background 0.15s;
      `;
      const lbl = document.createElement('span');
      lbl.textContent = so.label;
      lbl.style.cssText = 'font-size:10px;font-weight:600;color:#e0e0e0;';
      const desc = document.createElement('span');
      desc.textContent = so.desc;
      desc.style.cssText = 'font-size:8px;color:#888;margin-top:1px;';
      btn.appendChild(lbl);
      btn.appendChild(desc);
      btn.addEventListener('click', () => this.updateDrawingProperty('scope', so.value));
      btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(0,212,255,0.1)'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = drawing.scope === so.value ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.05)'; });
      scopeRow.appendChild(btn);
    }
    menu.appendChild(scopeRow);

    // ── Divider ──
    const divider = document.createElement('div');
    divider.style.cssText = 'height:1px;background:rgba(255,255,255,0.08);margin:6px 0;';
    menu.appendChild(divider);

    // ── Delete Button ──
    const deleteBtn = document.createElement('div');
    deleteBtn.style.cssText = `
      display:flex;align-items:center;gap:8px;padding:6px 12px;
      cursor:pointer;color:#f85149;border-radius:4px;margin:0 4px;
      transition:background 0.15s;
    `;
    deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg><span style="font-size:11px;">Delete</span>`;
    deleteBtn.addEventListener('mouseenter', () => { deleteBtn.style.background = 'rgba(248,81,73,0.1)'; });
    deleteBtn.addEventListener('mouseleave', () => { deleteBtn.style.background = 'transparent'; });
    deleteBtn.addEventListener('click', () => this.deleteDrawing());
    menu.appendChild(deleteBtn);

    // ── Prevent clicks inside menu from closing it ──
    menu.addEventListener('mousedown', (e) => { e.stopPropagation(); });

    // ── Close on outside click ──
    // Remove any previous close handler first
    if (this.contextMenuCloseHandler) {
      document.removeEventListener('mousedown', this.contextMenuCloseHandler);
    }
    const closeOnOutside = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        this.closeContextMenu();
      }
    };
    this.contextMenuCloseHandler = closeOnOutside;
    setTimeout(() => document.addEventListener('mousedown', closeOnOutside), 0);

    // ── Position adjustment (keep within viewport) ──
    document.body.appendChild(menu);
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth) {
      menu.style.left = `${clientX - menuRect.width}px`;
    }
    if (menuRect.bottom > window.innerHeight) {
      menu.style.top = `${clientY - menuRect.height}px`;
    }

    this.contextMenuEl = menu;
  }

  private addMenuSection(menu: HTMLDivElement, label: string): void {
    const section = document.createElement('div');
    section.style.cssText = `
      font-size:9px;color:#666;text-transform:uppercase;letter-spacing:0.8px;
      padding:6px 10px 2px;
    `;
    section.textContent = label;
    menu.appendChild(section);
  }

  private closeContextMenu(): void {
    if (this.contextMenuCloseHandler) {
      document.removeEventListener('mousedown', this.contextMenuCloseHandler);
      this.contextMenuCloseHandler = null;
    }
    if (this.contextMenuEl) {
      this.contextMenuEl.remove();
      this.contextMenuEl = null;
    }
    this.contextMenuDrawingId = null;
  }

  private updateDrawingProperty(prop: string, value: any): void {
    if (!this.contextMenuDrawingId) return;
    this.drawingManager.update(this.contextMenuDrawingId, { [prop]: value });
    this.syncPrimitive();
    this.onDrawingChange?.();
    // Rebuild menu in-place to reflect the updated drawing properties
    const drawing = this.drawingManager.get(this.contextMenuDrawingId);
    if (drawing && this.contextMenuEl) {
      const rect = this.contextMenuEl.getBoundingClientRect();
      // Remove old close handler before rebuilding
      if (this.contextMenuCloseHandler) {
        document.removeEventListener('mousedown', this.contextMenuCloseHandler);
        this.contextMenuCloseHandler = null;
      }
      this.contextMenuEl.remove();
      this.contextMenuEl = null;
      this.showContextMenu(rect.left, rect.top, drawing);
    }
  }

  private deleteDrawing(): void {
    if (!this.contextMenuDrawingId) return;
    this.drawingManager.delete(this.contextMenuDrawingId);
    this.closeContextMenu();
    this.syncPrimitive();
    this.onDrawingChange?.();
  }

  // ══════════════════════════════════════════════════════════
  //  DRAWING COMPLETION
  // ══════════════════════════════════════════════════════════

  private completeDrawing(): void {
    if (this.clickedPoints.length === 0) return;
    this.drawingManager.create(this.currentTool, [...this.clickedPoints], DEFAULT_COLOR, DEFAULT_LINE_WIDTH, DEFAULT_OPACITY);
    this.clickedPoints = [];
    this.isDrawing = false;
    this.mousePixel = null;
    this.container.style.cursor = 'crosshair';
    this.syncPrimitive();
    // Notify that drawings changed (triggers auto-save)
    this.onDrawingChange?.();
  }
}
