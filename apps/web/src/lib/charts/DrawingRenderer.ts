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

function chartPointToPixel(pt: DrawingPoint, chart: IChartApi, series: ISeriesApi<SeriesType>): PixelPoint | null {
  const x = chart.timeScale().timeToCoordinate(pt.time as Time);
  const y = series.priceToCoordinate(pt.price);
  if (x === null || y === null) return null;
  return { x, y };
}

function pixelToChartPoint(x: number, y: number, chart: IChartApi, series: ISeriesApi<SeriesType>): DrawingPoint | null {
  const time = chart.timeScale().coordinateToTime(x);
  const price = series.coordinateToPrice(y);
  if (time === null || price === null) return null;
  return { time: time as number, price };
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
    ctx.setLineDash([]);
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

  private drawPriceLabel(ctx: CanvasRenderingContext2D, x: number, y: number, price: number): void {
    const text = price.toFixed(2);
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
      ctx.fillText(`Δ ${priceDist.toFixed(2)}`, midX + 6, midY - 8);
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
      if (!d.isPreview) { ctx.globalAlpha = 0.85; ctx.font = "10px 'JetBrains Mono', monospace"; ctx.fillStyle = color; ctx.fillText(`${level}% — ${price.toFixed(2)}`, b.x + 6, y + 3); }
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
      if (!d.isPreview) { ctx.globalAlpha = 0.85; ctx.font = "10px 'JetBrains Mono', monospace"; ctx.fillStyle = color; ctx.fillText(`${level}% — ${price.toFixed(2)}`, b.x + 6, y + 3); }
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
      if (!d.isPreview) { ctx.globalAlpha = 0.85; ctx.font = "10px 'JetBrains Mono', monospace"; ctx.fillStyle = color; ctx.fillText(`${level}% — ${price.toFixed(2)}`, b.x + 6, y + 3); }
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
  private drawFibTimeZone(ctx: CanvasRenderingContext2D, a: PixelPoint, b: PixelPoint, canvasW: number, canvasH: number, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
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
    this.drawDot(ctx, a); this.drawDot(ctx, b);
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
    const minX = Math.min(...xs), maxX = Math.max(...xs);
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
  private drawGannFan(ctx: CanvasRenderingContext2D, a: PixelPoint, canvasW: number, canvasH: number, d: { isPreview: boolean; points: DrawingPoint[]; color: string }): void {
    for (const deg of GANN_ANGLES) {
      const rad = (deg * Math.PI) / 180, dx = Math.cos(rad), dy = -Math.sin(rad);
      let tM = this.tMax(a.x, a.y, dx, dy, canvasW, canvasH);
      const main = Math.abs(deg - 45) < 0.1;
      ctx.save(); ctx.strokeStyle = main ? DEFAULT_COLOR : ctx.strokeStyle; ctx.lineWidth = main ? 1.5 : 1;
      ctx.globalAlpha = d.isPreview ? (main ? 0.5 : 0.3) : (main ? DEFAULT_OPACITY : 0.5);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + dx * tM, a.y + dy * tM); ctx.stroke();
      if (!d.isPreview) { ctx.globalAlpha = 0.7; ctx.font = "9px 'JetBrains Mono', monospace"; ctx.fillStyle = main ? DEFAULT_COLOR : ctx.strokeStyle;
        const lx = a.x + dx * Math.min(tM, 60), ly = a.y + dy * Math.min(tM, 60); ctx.fillText(`${deg}°`, lx + 4, ly - 4); }
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
      if (diff > 0) { ctx.save(); ctx.font = "10px 'JetBrains Mono', monospace"; ctx.fillStyle = DEFAULT_COLOR; ctx.globalAlpha = 0.9; ctx.fillText(`Δ ${diff.toFixed(2)}`, midX + capW + 4, (topY + botY) / 2 + 3); ctx.restore(); }
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
    const price = this.pp(d, 0) ?? 0, text = price.toFixed(2);
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

  constructor() {
    this._paneView = new DrawingPaneView(null as any, null as any);
  }

  attached(param: SeriesAttachedParameter): void {
    this._chart = param.chart as IChartApi;
    this._series = param.series as ISeriesApi<SeriesType>;
    this._requestUpdate = param.requestUpdate;
    // Re-create pane view with actual chart/series refs
    (this as any)._paneView = new DrawingPaneView(this._chart, this._series);
    // Push current data to view
    this._paneView.update(this._drawings, this._preview);
  }

  detached(): void {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
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
    if (this._requestUpdate) this._requestUpdate();
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

  private boundMouseDown: (e: MouseEvent) => void;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseUp: (e: MouseEvent) => void;
  private boundContextMenu: (e: MouseEvent) => void;
  private boundKeyDown: (e: KeyboardEvent) => void;
  private started = false;

  private static readonly PROXIMITY_THRESHOLD = 12;

  constructor(chart: IChartApi, candleSeries: ISeriesApi<'Candlestick'>, container: HTMLDivElement, drawingManager: DrawingManager) {
    this.chart = chart;
    this.candleSeries = candleSeries;
    this.container = container;
    this.drawingManager = drawingManager;

    this.boundMouseDown = this.onMouseDown.bind(this);
    this.boundMouseMove = this.onMouseMove.bind(this);
    this.boundMouseUp = this.onMouseUp.bind(this);
    this.boundContextMenu = (e: MouseEvent) => e.preventDefault();
    this.boundKeyDown = this.onKeyDown.bind(this);
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

  // ══════════════════════════════════════════════════════════
  //  PRIMITIVE SYNC — Pushes all data to the series primitive
  // ══════════════════════════════════════════════════════════

  private syncPrimitive(): void {
    if (!this.primitive) return;
    this.primitive.setDrawings(this.drawingManager.getAll());
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
  }

  private detachEvents(): void {
    this.container.removeEventListener('mousedown', this.boundMouseDown, true);
    this.container.removeEventListener('mousemove', this.boundMouseMove);
    this.container.removeEventListener('mouseup', this.boundMouseUp);
    this.container.removeEventListener('contextmenu', this.boundContextMenu);
    document.removeEventListener('keydown', this.boundKeyDown);
  }

  // ══════════════════════════════════════════════════════════
  //  CHART INTERACTION — Uses API only, NEVER modifies CSS
  // ══════════════════════════════════════════════════════════

  private setChartInteractionEnabled(enabled: boolean): void {
    this.chart.applyOptions({ handleScroll: enabled, handleScale: enabled });
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
    this.mousePixel = this.chartPointToPixel(point);

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
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.cancelDrawing();
      this.currentTool = 'cursor';
      this.setChartInteractionEnabled(true);
      this.container.style.cursor = '';
    }
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
  }
}
