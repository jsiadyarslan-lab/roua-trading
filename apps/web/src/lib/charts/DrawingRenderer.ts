// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Drawing Renderer
// Interactive canvas overlay for drawing tools on lightweight-charts v5
// ═══════════════════════════════════════════════════════════

import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
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
interface PixelPoint {
  x: number;
  y: number;
}

/**
 * DrawingRenderer
 *
 * Overlays an HTML5 canvas on top of a lightweight-charts instance and
 * provides full mouse-driven interaction for 15 drawing tools.
 *
 * Usage:
 *   const renderer = new DrawingRenderer(chart, candleSeries, container, drawingManager);
 *   renderer.setTool('trendline');
 *   renderer.start();
 */
export class DrawingRenderer {
  // ── Dependencies ───────────────────────────────────────
  private chart: IChartApi;
  private candleSeries: ISeriesApi<'Candlestick'>;
  private container: HTMLDivElement;
  private drawingManager: DrawingManager;

  // ── Overlay canvas ─────────────────────────────────────
  private overlayCanvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private dpr: number = 1;

  // ── Interaction state ──────────────────────────────────
  private currentTool: DrawingTool = 'cursor';
  private clickedPoints: DrawingPoint[] = [];
  private mousePixel: PixelPoint | null = null;
  private isDrawing = false;

  // ── Drag state ──────────────────────────────────────────
  private isDragging = false;
  private dragDrawingId: string | null = null;
  private dragStartY: number = 0;

  // ── Event handler refs (for cleanup) ───────────────────
  private boundMouseDown: (e: MouseEvent) => void;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseUp: (e: MouseEvent) => void;
  private boundContextMenu: (e: MouseEvent) => void;
  private boundResize: () => void;
  private unsubscribeVisibleRange: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private started = false;

  // ── Event target ref (canvas or container) ─────────────
  private eventTarget: HTMLElement | null = null;

  // ── Constructor ────────────────────────────────────────

  constructor(
    chart: IChartApi,
    candleSeries: ISeriesApi<'Candlestick'>,
    container: HTMLDivElement,
    drawingManager: DrawingManager,
  ) {
    this.chart = chart;
    this.candleSeries = candleSeries;
    this.container = container;
    this.drawingManager = drawingManager;

    // Pre-bind handlers so we can remove them later
    this.boundMouseDown = this.onMouseDown.bind(this);
    this.boundMouseMove = this.onMouseMove.bind(this);
    this.boundMouseUp = this.onMouseUp.bind(this);
    this.boundContextMenu = (e: MouseEvent) => e.preventDefault();
    this.boundResize = this.handleResize.bind(this);
  }

  // ══════════════════════════════════════════════════════════
  //  PUBLIC API
  // ══════════════════════════════════════════════════════════

  /** Start listening to events and create the overlay canvas. */
  start(): void {
    if (this.started) return;
    this.started = true;

    this.createOverlayCanvas();
    this.attachEvents();

    // Set initial canvas pointer events based on current tool
    if (this.currentTool !== 'cursor') {
      this.setCanvasPointerEvents(true);
    }

    this.redraw();
  }

  /** Stop listening and remove the overlay canvas. */
  stop(): void {
    if (!this.started) return;
    this.started = false;

    this.setChartInteractionEnabled(true);
    this.detachEvents();
    this.removeOverlayCanvas();
    this.clickedPoints = [];
    this.mousePixel = null;
    this.isDrawing = false;
  }

  /** Change the active drawing tool. Resets any in-progress drawing. */
  setTool(tool: DrawingTool): void {
    this.currentTool = tool;
    this.clickedPoints = [];
    this.isDrawing = false;
    this.mousePixel = null;
    if (tool === 'cursor') {
      this.setChartInteractionEnabled(true);
      this.setCanvasPointerEvents(false); // Let chart handle pan/zoom
    } else {
      this.setChartInteractionEnabled(false);
      this.setCanvasPointerEvents(true);  // Capture mouse for drawing
    }
    this.redraw();
  }

  /** Clear all persisted drawings and re-render an empty canvas. */
  clearAndRedraw(): void {
    this.drawingManager.clearAll();
    this.redraw();
  }

  /** Full redraw of all persisted drawings + any in-progress preview. */
  redraw(): void {
    if (!this.ctx || !this.overlayCanvas) return;

    const w = this.overlayCanvas.width;
    const h = this.overlayCanvas.height;
    this.ctx.clearRect(0, 0, w, h);

    // Draw all persisted drawings
    const drawings = this.drawingManager.getAll();
    for (const drawing of drawings) {
      this.renderDrawing(drawing, false);
    }

    // Draw in-progress preview
    if (this.isDrawing && this.clickedPoints.length > 0 && this.mousePixel) {
      this.renderPreview();
    }
  }

  // ══════════════════════════════════════════════════════════
  //  OVERLAY CANVAS SETUP
  // ══════════════════════════════════════════════════════════

  private createOverlayCanvas(): void {
    // Remove any stale overlay
    this.removeOverlayCanvas();

    this.dpr = window.devicePixelRatio || 1;

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none'; // Let chart handle pan/zoom by default
    canvas.style.zIndex = '10';
    canvas.dataset.rouaDrawingOverlay = 'true';

    this.sizeCanvas(canvas);
    this.container.style.position = 'relative'; // Ensure positioning context
    this.container.appendChild(canvas);

    this.overlayCanvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  private sizeCanvas(canvas: HTMLCanvasElement): void {
    const rect = this.container.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * this.dpr);
    canvas.height = Math.round(rect.height * this.dpr);
  }

  private removeOverlayCanvas(): void {
    if (this.overlayCanvas && this.overlayCanvas.parentNode) {
      this.overlayCanvas.parentNode.removeChild(this.overlayCanvas);
    }
    this.overlayCanvas = null;
    this.ctx = null;
  }

  // ══════════════════════════════════════════════════════════
  //  EVENT WIRING
  // ══════════════════════════════════════════════════════════

  private attachEvents(): void {
    // ALWAYS listen on the container for mousedown so we can detect
    // clicks near drawings even in cursor mode (when canvas pointerEvents is 'none')
    this.container.addEventListener('mousedown', this.boundMouseDown, true); // capture phase
    this.container.addEventListener('mousemove', this.boundMouseMove);
    this.container.addEventListener('mouseup', this.boundMouseUp);
    this.container.addEventListener('contextmenu', this.boundContextMenu);

    this.eventTarget = this.container;

    // Re-render when the visible range changes (scroll / zoom)
    const onVisibleRangeChange = () => { this.redraw(); };
    this.chart.timeScale().subscribeVisibleTimeRangeChange(onVisibleRangeChange);
    this.unsubscribeVisibleRange = () => {
      this.chart.timeScale().unsubscribeVisibleTimeRangeChange(onVisibleRangeChange);
    };

    // Resize observer to keep canvas sized correctly
    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
    this.resizeObserver.observe(this.container);
  }

  private detachEvents(): void {
    this.container.removeEventListener('mousedown', this.boundMouseDown, true); // capture phase
    this.container.removeEventListener('mousemove', this.boundMouseMove);
    this.container.removeEventListener('mouseup', this.boundMouseUp);
    this.container.removeEventListener('contextmenu', this.boundContextMenu);

    if (this.unsubscribeVisibleRange) {
      this.unsubscribeVisibleRange();
      this.unsubscribeVisibleRange = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  private handleResize(): void {
    if (!this.overlayCanvas) return;
    this.sizeCanvas(this.overlayCanvas);
    this.redraw();
  }

  // ══════════════════════════════════════════════════════════
  //  COORDINATE CONVERSION
  // ══════════════════════════════════════════════════════════

  /** Convert a mouse event's page coordinates to a DrawingPoint (time, price). */
  private pixelToChartPoint(e: MouseEvent): DrawingPoint | null {
    const rect = this.container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const time = this.chart.timeScale().coordinateToTime(x);
    const price = this.candleSeries.coordinateToPrice(y);

    if (time === null || price === null) return null;
    return { time: time as number, price };
  }

  /** Convert a DrawingPoint (time, price) to pixel coordinates on the overlay canvas. */
  private chartPointToPixel(pt: DrawingPoint): PixelPoint | null {
    const x = this.chart.timeScale().timeToCoordinate(pt.time as Time);
    const y = this.candleSeries.priceToCoordinate(pt.price);

    if (x === null || y === null) return null;
    return { x, y };
  }

  /** Scale pixel coordinate for DPI-aware canvas drawing. */
  private s(v: number): number {
    return v * this.dpr;
  }

  /** Get the canvas width in CSS pixels. */
  private get canvasWidth(): number {
    return this.overlayCanvas ? this.overlayCanvas.width / this.dpr : 0;
  }

  /** Get the canvas height in CSS pixels. */
  private get canvasHeight(): number {
    return this.overlayCanvas ? this.overlayCanvas.height / this.dpr : 0;
  }

  // ══════════════════════════════════════════════════════════
  //  MOUSE HANDLERS
  // ══════════════════════════════════════════════════════════

  private onMouseDown(e: MouseEvent): void {
    // Only react to left click
    if (e.button !== 0) return;

    // When in cursor mode, check if we're clicking near an existing drawing to drag it
    if (this.currentTool === 'cursor') {
      const rect = this.container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const x = e.clientX - rect.left;

      // Check ALL drawing types for proximity (not just horizontal)
      const drawings = this.drawingManager.getAll();
      for (const drawing of drawings) {
        if (drawing.type === 'horizontal') {
          const pixelPt = this.chartPointToPixel(drawing.points[0]);
          if (pixelPt && Math.abs(y - pixelPt.y) < 8) {
            // Start dragging this horizontal line
            this.isDragging = true;
            this.dragDrawingId = drawing.id;
            this.dragStartY = y;
            this.setChartInteractionEnabled(false);
            // Set cursor to indicate dragging
            this.container.style.cursor = 'ns-resize';

            e.stopImmediatePropagation();
            e.preventDefault();
            return;
          }
        }
        // For other drawing types, check proximity to any point
        if (drawing.type !== 'horizontal') {
          for (const pt of drawing.points) {
            const pixelPt = this.chartPointToPixel(pt);
            if (pixelPt && Math.abs(x - pixelPt.x) < 8 && Math.abs(y - pixelPt.y) < 8) {
              this.isDragging = true;
              this.dragDrawingId = drawing.id;
              this.dragStartY = y;
              this.setChartInteractionEnabled(false);
              this.container.style.cursor = 'move';

              e.stopImmediatePropagation();
              e.preventDefault();
              return;
            }
          }
        }
      }
      // Not near any drawing — let the event pass through to chart for normal pan/zoom
      return;
    }

    const point = this.pixelToChartPoint(e);
    if (!point) return;

    e.stopImmediatePropagation();
    e.preventDefault();

    // Disable chart pan/zoom while drawing
    this.setChartInteractionEnabled(false);

    const required = DrawingManager.requiredPoints(this.currentTool);

    this.clickedPoints.push(point);
    this.isDrawing = true;
    this.mousePixel = this.chartPointToPixel(point);

    // If we have enough points, complete the drawing
    if (this.clickedPoints.length >= required) {
      this.completeDrawing();
    } else {
      this.redraw();
    }
  }

  private onMouseMove(e: MouseEvent): void {
    // Handle dragging existing drawings
    if (this.isDragging && this.dragDrawingId) {
      e.preventDefault();
      const point = this.pixelToChartPoint(e);
      if (!point) return;

      const drawing = this.drawingManager.get(this.dragDrawingId);
      if (drawing) {
        if (drawing.type === 'horizontal') {
          // For horizontal lines, only update the price (keep time)
          this.drawingManager.update(this.dragDrawingId, {
            points: [{ ...drawing.points[0], price: point.price }],
          });
        } else {
          // For other drawings, calculate the price delta and move all points
          const rect = this.container.getBoundingClientRect();
          const y = e.clientY - rect.top;
          const deltaY = y - this.dragStartY;
          const deltaPrice = this.candleSeries.coordinateToPrice(this.dragStartY)! - this.candleSeries.coordinateToPrice(y)!;
          const deltaTime = this.chart.timeScale().coordinateToTime(e.clientX - rect.left) as number;

          if (drawing.points.length > 0 && deltaTime !== null) {
            const timeDelta = deltaTime - drawing.points[0].time;
            const newPoints = drawing.points.map(pt => ({
              ...pt,
              price: pt.price + deltaPrice,
              time: pt.time + timeDelta,
            }));
            this.drawingManager.update(this.dragDrawingId, { points: newPoints });
          }
        }
        this.redraw();
      }
      return;
    }

    // In cursor mode, update cursor style when hovering near drawings
    if (this.currentTool === 'cursor' && !this.isDrawing) {
      const rect = this.container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const x = e.clientX - rect.left;

      let nearDrawing = false;
      const drawings = this.drawingManager.getAll();
      for (const drawing of drawings) {
        if (drawing.type === 'horizontal') {
          const pixelPt = this.chartPointToPixel(drawing.points[0]);
          if (pixelPt && Math.abs(y - pixelPt.y) < 8) {
            nearDrawing = true;
            break;
          }
        } else {
          for (const pt of drawing.points) {
            const pixelPt = this.chartPointToPixel(pt);
            if (pixelPt && Math.abs(x - pixelPt.x) < 8 && Math.abs(y - pixelPt.y) < 8) {
              nearDrawing = true;
              break;
            }
          }
          if (nearDrawing) break;
        }
      }
      this.container.style.cursor = nearDrawing ? 'pointer' : '';
      return;
    }

    if (!this.isDrawing || this.currentTool === 'cursor') {
      return;
    }

    e.preventDefault();
    const rect = this.container.getBoundingClientRect();
    this.mousePixel = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    this.redraw();
  }

  private onMouseUp(_e: MouseEvent): void {
    if (this.isDragging) {
      this.isDragging = false;
      this.dragDrawingId = null;
      this.setChartInteractionEnabled(true);
      this.container.style.cursor = '';
      if (this.currentTool === 'cursor') this.setCanvasPointerEvents(false);
      return;
    }
    // Don't reset drawing state on mouseup — we wait for all required clicks
  }

  // ══════════════════════════════════════════════════════════
  //  DRAWING COMPLETION
  // ══════════════════════════════════════════════════════════

  private completeDrawing(): void {
    if (this.clickedPoints.length === 0) return;

    const drawing = this.drawingManager.create(
      this.currentTool,
      [...this.clickedPoints],
      DEFAULT_COLOR,
      DEFAULT_LINE_WIDTH,
      DEFAULT_OPACITY,
    );

    // Reset interaction state
    this.clickedPoints = [];
    this.isDrawing = false;
    this.mousePixel = null;

    // Re-enable chart pan/zoom
    this.setChartInteractionEnabled(true);

    // Keep canvas pointerEvents as 'auto' since tool is still active
    // (user might want to draw another line)

    this.redraw();
  }

  // ══════════════════════════════════════════════════════════
  //  PREVIEW RENDERING
  // ══════════════════════════════════════════════════════════

  private renderPreview(): void {
    if (!this.ctx || !this.mousePixel) return;

    const tool = this.currentTool;
    const pts = this.clickedPoints;
    const mouse = this.mousePixel;

    // Convert clicked points to pixels
    const pixelPts = pts.map(p => this.chartPointToPixel(p)).filter((p): p is PixelPoint => p !== null);
    if (pixelPts.length === 0) return;

    // Set preview style: dashed, semi-transparent
    this.ctx.save();
    this.ctx.setLineDash(PREVIEW_DASH.map(d => this.s(d)));
    this.ctx.globalAlpha = 0.5;
    this.ctx.strokeStyle = DEFAULT_COLOR;
    this.ctx.lineWidth = this.s(DEFAULT_LINE_WIDTH);

    switch (tool as string) {
      case 'horizontal':
        this.drawHorizontalLine(pixelPts[0], mouse, true);
        break;
      case 'vertical':
        this.drawVerticalLine(pixelPts[0], mouse, true);
        break;
      case 'x-marker':
        this.drawXMarker(mouse, DEFAULT_COLOR, true);
        break;
      case 'trendline':
        if (pixelPts.length >= 1) this.drawTrendLine(pixelPts[0], mouse, true);
        break;
      case 'fibonacci':
        if (pixelPts.length >= 1) this.drawFibonacci(pixelPts[0], mouse, true);
        break;
      case 'rectangle':
        if (pixelPts.length >= 1) this.drawRectangle(pixelPts[0], mouse, true);
        break;
      case 'channel':
        if (pixelPts.length === 1) this.drawTrendLine(pixelPts[0], mouse, true);
        if (pixelPts.length === 2) this.drawChannel(pixelPts[0], pixelPts[1], mouse, true);
        break;
      case 'triangle':
        if (pixelPts.length === 1) this.drawTrendLine(pixelPts[0], mouse, true);
        if (pixelPts.length === 2) this.drawLine(pixelPts[0], mouse, true);
        break;
      case 'circle':
        if (pixelPts.length >= 1) this.drawCircle(pixelPts[0], mouse, true);
        break;
      case 'arc':
        if (pixelPts.length >= 1) this.drawArc(pixelPts[0], mouse, true);
        break;
      case 'arrow':
        if (pixelPts.length >= 1) this.drawArrow(pixelPts[0], mouse, true);
        break;
      case 'extended-line':
        if (pixelPts.length >= 1) this.drawExtendedLine(pixelPts[0], mouse, true);
        break;
      case 'ray':
        if (pixelPts.length >= 1) this.drawRay(pixelPts[0], mouse, true);
        break;
      case 'price-range':
        if (pixelPts.length >= 1) this.drawPriceRange(pixelPts[0], mouse, true);
        break;
      case 'horizontal-ray':
        this.drawHorizontalRay(pixelPts[0], mouse, true);
        break;
      case 'cross-line':
        if (pixelPts.length >= 1) this.drawCrossLine(pixelPts[0], mouse, true);
        break;
      case 'info-line':
        if (pixelPts.length >= 1) this.drawInfoLine(pixelPts[0], mouse, true);
        break;
      case 'trend-angle':
        if (pixelPts.length >= 1) this.drawTrendAngle(pixelPts[0], mouse, true);
        break;
      case 'regression-trend':
        if (pixelPts.length === 1) this.drawTrendLine(pixelPts[0], mouse, true);
        if (pixelPts.length === 2) this.drawChannel(pixelPts[0], pixelPts[1], mouse, true);
        break;
      case 'flat-top-bottom':
        if (pixelPts.length >= 1) this.drawFlatTopBottom(pixelPts[0], mouse, true);
        break;
      case 'disjoint-channel':
        if (pixelPts.length >= 1) this.drawDisjointChannel(pixelPts[0], mouse, true);
        break;
      case 'andrews-pitchfork':
        if (pixelPts.length === 1) this.drawTrendLine(pixelPts[0], mouse, true);
        if (pixelPts.length === 2) this.drawLine(pixelPts[0], mouse, true);
        break;
      case 'schiff-pitchfork':
        if (pixelPts.length === 1) this.drawTrendLine(pixelPts[0], mouse, true);
        if (pixelPts.length === 2) this.drawLine(pixelPts[0], mouse, true);
        break;
      case 'modified-schiff':
        if (pixelPts.length === 1) this.drawTrendLine(pixelPts[0], mouse, true);
        if (pixelPts.length === 2) this.drawLine(pixelPts[0], mouse, true);
        break;
      case 'fib-extension':
        if (pixelPts.length >= 1) this.drawFibExtension(pixelPts[0], mouse, true);
        break;
      case 'fib-fan':
        if (pixelPts.length >= 1) this.drawFibFan(pixelPts[0], mouse, true);
        break;
      case 'fib-spiral':
        if (pixelPts.length >= 1) this.drawFibSpiral(pixelPts[0], mouse, true);
        break;
      case 'fib-wedge':
        if (pixelPts.length >= 1) this.drawFibWedge(pixelPts[0], mouse, true);
        break;
      case 'fib-time-zone':
        if (pixelPts.length >= 1) this.drawFibTimeZone(pixelPts[0], mouse, true);
        break;
      case 'gann-box':
        if (pixelPts.length >= 1) this.drawGannBox(pixelPts[0], mouse, true);
        break;
      case 'gann-square':
        if (pixelPts.length >= 1) this.drawGannSquare(pixelPts[0], mouse, true);
        break;
      case 'gann-fan':
        if (pixelPts.length === 1) this.drawTrendLine(pixelPts[0], mouse, true);
        if (pixelPts.length === 2) this.drawLine(pixelPts[0], mouse, true);
        break;
      case 'ellipse':
        if (pixelPts.length >= 1) this.drawEllipse(pixelPts[0], mouse, true);
        break;
      case 'text-annotation':
        if (pixelPts.length >= 1) this.drawTextAnnotation(pixelPts[0], mouse, true);
        break;
      case 'price-label':
        this.drawPriceLabelMarker(pixelPts[0], DEFAULT_COLOR, true);
        break;
      case 'note':
        this.drawNote(pixelPts[0], DEFAULT_COLOR, true);
        break;
    }

    this.ctx.restore();
  }

  // ══════════════════════════════════════════════════════════
  //  PERSISTED DRAWING RENDERING
  // ══════════════════════════════════════════════════════════

  private renderDrawing(drawing: Drawing, _isPreview: boolean = false): void {
    if (!this.ctx) return;

    const pts = drawing.points.map(p => this.chartPointToPixel(p)).filter((p): p is PixelPoint => p !== null);
    if (pts.length === 0) return;

    // Store drawing's own points so Fibonacci/PriceRange can read prices
    const savedClickedPoints = this.clickedPoints;
    this.clickedPoints = drawing.points;

    this.ctx.save();
    this.ctx.setLineDash([]);
    this.ctx.globalAlpha = drawing.opacity;
    this.ctx.strokeStyle = drawing.color;
    this.ctx.fillStyle = drawing.color;
    this.ctx.lineWidth = this.s(drawing.lineWidth);

    switch (drawing.type as string) {
      case 'horizontal':
        this.drawHorizontalLine(pts[0], pts[0], false);
        break;
      case 'vertical':
        this.drawVerticalLine(pts[0], pts[0], false);
        break;
      case 'x-marker':
        this.drawXMarker(pts[0], drawing.color, false);
        break;
      case 'trendline':
        if (pts.length >= 2) this.drawTrendLine(pts[0], pts[1], false);
        break;
      case 'fibonacci':
        if (pts.length >= 2) this.drawFibonacci(pts[0], pts[1], false);
        break;
      case 'rectangle':
        if (pts.length >= 2) this.drawRectangle(pts[0], pts[1], false);
        break;
      case 'channel':
        if (pts.length >= 3) this.drawChannel(pts[0], pts[1], pts[2], false);
        break;
      case 'triangle':
        if (pts.length >= 3) this.drawTriangle(pts[0], pts[1], pts[2], false);
        break;
      case 'circle':
        if (pts.length >= 2) this.drawCircle(pts[0], pts[1], false);
        break;
      case 'arc':
        if (pts.length >= 2) this.drawArc(pts[0], pts[1], false);
        break;
      case 'arrow':
        if (pts.length >= 2) this.drawArrow(pts[0], pts[1], false);
        break;
      case 'extended-line':
        if (pts.length >= 2) this.drawExtendedLine(pts[0], pts[1], false);
        break;
      case 'ray':
        if (pts.length >= 2) this.drawRay(pts[0], pts[1], false);
        break;
      case 'price-range':
        if (pts.length >= 2) this.drawPriceRange(pts[0], pts[1], false);
        break;
      case 'horizontal-ray':
        this.drawHorizontalRay(pts[0], pts[0], false);
        break;
      case 'cross-line':
        if (pts.length >= 2) this.drawCrossLine(pts[0], pts[1], false);
        break;
      case 'info-line':
        if (pts.length >= 2) this.drawInfoLine(pts[0], pts[1], false);
        break;
      case 'trend-angle':
        if (pts.length >= 2) this.drawTrendAngle(pts[0], pts[1], false);
        break;
      case 'regression-trend':
        if (pts.length >= 3) this.drawRegressionTrend(pts[0], pts[1], pts[2], false);
        break;
      case 'flat-top-bottom':
        if (pts.length >= 2) this.drawFlatTopBottom(pts[0], pts[1], false);
        break;
      case 'disjoint-channel':
        if (pts.length >= 2) this.drawDisjointChannel(pts[0], pts[1], false);
        break;
      case 'andrews-pitchfork':
        if (pts.length >= 3) this.drawAndrewsPitchfork(pts[0], pts[1], pts[2], false);
        break;
      case 'schiff-pitchfork':
        if (pts.length >= 3) this.drawSchiffPitchfork(pts[0], pts[1], pts[2], false);
        break;
      case 'modified-schiff':
        if (pts.length >= 3) this.drawModifiedSchiff(pts[0], pts[1], pts[2], false);
        break;
      case 'fib-extension':
        if (pts.length >= 2) this.drawFibExtension(pts[0], pts[1], false);
        break;
      case 'fib-fan':
        if (pts.length >= 2) this.drawFibFan(pts[0], pts[1], false);
        break;
      case 'fib-spiral':
        if (pts.length >= 2) this.drawFibSpiral(pts[0], pts[1], false);
        break;
      case 'fib-wedge':
        if (pts.length >= 2) this.drawFibWedge(pts[0], pts[1], false);
        break;
      case 'fib-time-zone':
        if (pts.length >= 2) this.drawFibTimeZone(pts[0], pts[1], false);
        break;
      case 'gann-box':
        if (pts.length >= 2) this.drawGannBox(pts[0], pts[1], false);
        break;
      case 'gann-square':
        if (pts.length >= 2) this.drawGannSquare(pts[0], pts[1], false);
        break;
      case 'gann-fan':
        if (pts.length >= 3) this.drawGannFan(pts[0], pts[1], pts[2], false);
        break;
      case 'ellipse':
        if (pts.length >= 2) this.drawEllipse(pts[0], pts[1], false);
        break;
      case 'text-annotation':
        if (pts.length >= 2) this.drawTextAnnotation(pts[0], pts[1], false);
        break;
      case 'price-label':
        this.drawPriceLabelMarker(pts[0], drawing.color, false);
        break;
      case 'note':
        this.drawNote(pts[0], drawing.color, false);
        break;
    }

    this.ctx.restore();
    this.clickedPoints = savedClickedPoints;
  }

  // ══════════════════════════════════════════════════════════
  //  PRIMITIVE DRAWING ROUTINES
  // ══════════════════════════════════════════════════════════

  // ── Horizontal Line ────────────────────────────────────
  private drawHorizontalLine(pt: PixelPoint, _mouse: PixelPoint, isPreview: boolean): void {
    if (!this.ctx) return;
    const y = pt.y;
    const left = 0;
    const right = this.canvasWidth;

    this.ctx.beginPath();
    this.ctx.moveTo(this.s(left), this.s(y));
    this.ctx.lineTo(this.s(right), this.s(y));
    this.ctx.stroke();

    // Price label on the right
    if (!isPreview) {
      this.drawPriceLabel(right - 2, y, this.getPointPrice(0) ?? 0);
    }
  }

  // ── Vertical Line ──────────────────────────────────────
  private drawVerticalLine(pt: PixelPoint, _mouse: PixelPoint, isPreview: boolean): void {
    if (!this.ctx) return;
    const x = pt.x;
    const top = 0;
    const bottom = this.canvasHeight;

    this.ctx.beginPath();
    this.ctx.moveTo(this.s(x), this.s(top));
    this.ctx.lineTo(this.s(x), this.s(bottom));
    this.ctx.stroke();

    // Time label at the bottom
    if (!isPreview) {
      this.drawTimeLabel(x, bottom - 2);
    }
  }

  // ── X Marker ───────────────────────────────────────────
  private drawXMarker(pt: PixelPoint, color: string, isPreview: boolean): void {
    if (!this.ctx) return;
    const sz = X_MARKER_SIZE;

    this.ctx.save();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = this.s(isPreview ? 1 : 2);

    // Draw X
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(pt.x - sz), this.s(pt.y - sz));
    this.ctx.lineTo(this.s(pt.x + sz), this.s(pt.y + sz));
    this.ctx.moveTo(this.s(pt.x + sz), this.s(pt.y - sz));
    this.ctx.lineTo(this.s(pt.x - sz), this.s(pt.y + sz));
    this.ctx.stroke();

    // Small circle around
    this.ctx.beginPath();
    this.ctx.arc(this.s(pt.x), this.s(pt.y), this.s(sz + 2), 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.restore();
  }

  // ── Trend Line ─────────────────────────────────────────
  private drawTrendLine(a: PixelPoint, b: PixelPoint, _isPreview: boolean): void {
    if (!this.ctx) return;
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(a.x), this.s(a.y));
    this.ctx.lineTo(this.s(b.x), this.s(b.y));
    this.ctx.stroke();

    // End-point dots
    this.drawDot(a);
    this.drawDot(b);
  }

  // ── Simple Line (for triangle preview etc.) ────────────
  private drawLine(a: PixelPoint, b: PixelPoint, _isPreview: boolean): void {
    if (!this.ctx) return;
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(a.x), this.s(a.y));
    this.ctx.lineTo(this.s(b.x), this.s(b.y));
    this.ctx.stroke();
  }

  // ── Fibonacci Retracement ──────────────────────────────
  private drawFibonacci(a: PixelPoint, b: PixelPoint, isPreview: boolean): void {
    if (!this.ctx) return;

    const priceA = this.getPointPrice(0);
    const priceB = this.getPointPrice(1);
    if (priceA === null || priceB === null) return;

    const priceRange = priceB - priceA;

    for (const level of FIBONACCI_LEVELS) {
      const price = priceA + priceRange * (level / 100);
      const y = this.candleSeries.priceToCoordinate(price);
      if (y === null) continue;

      const color = FIBONACCI_COLORS[level] || DEFAULT_COLOR;

      this.ctx.save();
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = this.s(level === 50 ? 2 : 1);
      this.ctx.globalAlpha = isPreview ? 0.35 : 0.6;

      this.ctx.beginPath();
      this.ctx.moveTo(this.s(a.x), this.s(y));
      this.ctx.lineTo(this.s(b.x), this.s(y));
      this.ctx.stroke();

      // Label
      if (!isPreview) {
        const labelText = `${level}% — ${price.toFixed(2)}`;
        this.ctx.globalAlpha = 0.85;
        this.ctx.font = `${this.s(10)}px 'JetBrains Mono', monospace`;
        this.ctx.fillStyle = color;
        this.ctx.fillText(labelText, this.s(b.x + 6), this.s(y + 3));
      }

      this.ctx.restore();
    }

    // Draw the main trend line connecting A and B
    this.ctx.save();
    this.ctx.strokeStyle = DEFAULT_COLOR;
    this.ctx.lineWidth = this.s(DEFAULT_LINE_WIDTH);
    this.ctx.globalAlpha = isPreview ? 0.5 : DEFAULT_OPACITY;
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(a.x), this.s(a.y));
    this.ctx.lineTo(this.s(b.x), this.s(b.y));
    this.ctx.stroke();
    this.ctx.restore();

    this.drawDot(a);
    this.drawDot(b);
  }

  // ── Rectangle ──────────────────────────────────────────
  private drawRectangle(a: PixelPoint, b: PixelPoint, _isPreview: boolean): void {
    if (!this.ctx) return;
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);

    // Fill with semi-transparent color
    this.ctx.save();
    this.ctx.globalAlpha = _isPreview ? 0.05 : 0.08;
    this.ctx.fillStyle = this.ctx.strokeStyle;
    this.ctx.fillRect(this.s(x), this.s(y), this.s(w), this.s(h));
    this.ctx.restore();

    // Stroke
    this.ctx.strokeRect(this.s(x), this.s(y), this.s(w), this.s(h));

    this.drawDot(a);
    this.drawDot(b);
  }

  // ── Parallel Channel ───────────────────────────────────
  private drawChannel(a: PixelPoint, b: PixelPoint, c: PixelPoint, _isPreview: boolean): void {
    if (!this.ctx) return;

    // Line 1: A → B
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(a.x), this.s(a.y));
    this.ctx.lineTo(this.s(b.x), this.s(b.y));
    this.ctx.stroke();

    // Line 2: parallel to A→B, offset by vector (C - midpoint of AB)
    // The offset is the perpendicular distance from C to line AB
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;

    // Perpendicular unit vector
    const px = -dy / len;
    const py = dx / len;

    // Signed distance from C to line AB
    const dist = (c.x - a.x) * px + (c.y - a.y) * py;

    // Offset line
    const a2x = a.x + px * dist;
    const a2y = a.y + py * dist;
    const b2x = b.x + px * dist;
    const b2y = b.y + py * dist;

    this.ctx.beginPath();
    this.ctx.moveTo(this.s(a2x), this.s(a2y));
    this.ctx.lineTo(this.s(b2x), this.s(b2y));
    this.ctx.stroke();

    // Fill channel area
    this.ctx.save();
    this.ctx.globalAlpha = _isPreview ? 0.04 : 0.06;
    this.ctx.fillStyle = this.ctx.strokeStyle;
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(a.x), this.s(a.y));
    this.ctx.lineTo(this.s(b.x), this.s(b.y));
    this.ctx.lineTo(this.s(b2x), this.s(b2y));
    this.ctx.lineTo(this.s(a2x), this.s(a2y));
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.restore();

    this.drawDot(a);
    this.drawDot(b);
    this.drawDot({ x: a2x, y: a2y });
  }

  // ── Triangle ───────────────────────────────────────────
  private drawTriangle(a: PixelPoint, b: PixelPoint, c: PixelPoint, _isPreview: boolean): void {
    if (!this.ctx) return;

    this.ctx.beginPath();
    this.ctx.moveTo(this.s(a.x), this.s(a.y));
    this.ctx.lineTo(this.s(b.x), this.s(b.y));
    this.ctx.lineTo(this.s(c.x), this.s(c.y));
    this.ctx.closePath();
    this.ctx.stroke();

    // Fill
    this.ctx.save();
    this.ctx.globalAlpha = _isPreview ? 0.04 : 0.06;
    this.ctx.fillStyle = this.ctx.strokeStyle;
    this.ctx.fill();
    this.ctx.restore();

    this.drawDot(a);
    this.drawDot(b);
    this.drawDot(c);
  }

  // ── Circle ─────────────────────────────────────────────
  private drawCircle(center: PixelPoint, edge: PixelPoint, _isPreview: boolean): void {
    if (!this.ctx) return;

    const dx = edge.x - center.x;
    const dy = edge.y - center.y;
    const radius = Math.sqrt(dx * dx + dy * dy);

    this.ctx.beginPath();
    this.ctx.arc(this.s(center.x), this.s(center.y), this.s(radius), 0, Math.PI * 2);
    this.ctx.stroke();

    this.drawDot(center);
  }

  // ── Arc ────────────────────────────────────────────────
  private drawArc(a: PixelPoint, b: PixelPoint, _isPreview: boolean): void {
    if (!this.ctx) return;

    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const radius = Math.sqrt(dx * dx + dy * dy) / 2;

    // Calculate start and end angles
    const startAngle = Math.atan2(a.y - cy, a.x - cx);
    const endAngle = Math.atan2(b.y - cy, b.x - cx);

    this.ctx.beginPath();
    this.ctx.arc(this.s(cx), this.s(cy), this.s(radius), startAngle, endAngle);
    this.ctx.stroke();

    this.drawDot(a);
    this.drawDot(b);
  }

  // ── Arrow ──────────────────────────────────────────────
  private drawArrow(from: PixelPoint, to: PixelPoint, _isPreview: boolean): void {
    if (!this.ctx) return;

    // Shaft
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(from.x), this.s(from.y));
    this.ctx.lineTo(this.s(to.x), this.s(to.y));
    this.ctx.stroke();

    // Arrowhead
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const headLen = ARROW_HEAD_SIZE;

    this.ctx.beginPath();
    this.ctx.moveTo(this.s(to.x), this.s(to.y));
    this.ctx.lineTo(
      this.s(to.x - headLen * Math.cos(angle - Math.PI / 6)),
      this.s(to.y - headLen * Math.sin(angle - Math.PI / 6)),
    );
    this.ctx.moveTo(this.s(to.x), this.s(to.y));
    this.ctx.lineTo(
      this.s(to.x - headLen * Math.cos(angle + Math.PI / 6)),
      this.s(to.y - headLen * Math.sin(angle + Math.PI / 6)),
    );
    this.ctx.stroke();

    this.drawDot(from);
  }

  // ── Extended Line ──────────────────────────────────────
  private drawExtendedLine(a: PixelPoint, b: PixelPoint, _isPreview: boolean): void {
    if (!this.ctx) return;

    const dx = b.x - a.x;
    const dy = b.y - a.y;

    // Extend in both directions to canvas edges
    let tMin = -Infinity;
    let tMax = Infinity;

    if (dx !== 0) {
      const tLeft = (0 - a.x) / dx;
      const tRight = (this.canvasWidth - a.x) / dx;
      if (dx > 0) { tMin = tLeft; tMax = tRight; }
      else { tMin = tRight; tMax = tLeft; }
    }
    if (dy !== 0) {
      const tTop = (0 - a.y) / dy;
      const tBottom = (this.canvasHeight - a.y) / dy;
      if (dy > 0) { tMin = Math.max(tMin, tTop); tMax = Math.min(tMax, tBottom); }
      else { tMin = Math.max(tMin, tBottom); tMax = Math.min(tMax, tTop); }
    }

    const startX = a.x + dx * tMin;
    const startY = a.y + dy * tMin;
    const endX = a.x + dx * tMax;
    const endY = a.y + dy * tMax;

    this.ctx.beginPath();
    this.ctx.moveTo(this.s(startX), this.s(startY));
    this.ctx.lineTo(this.s(endX), this.s(endY));
    this.ctx.stroke();

    this.drawDot(a);
    this.drawDot(b);
  }

  // ── Ray ────────────────────────────────────────────────
  private drawRay(a: PixelPoint, b: PixelPoint, _isPreview: boolean): void {
    if (!this.ctx) return;

    const dx = b.x - a.x;
    const dy = b.y - a.y;

    if (dx === 0 && dy === 0) return;

    // Extend from A through B to the right edge (or appropriate edge)
    let tMax = Infinity;
    if (dx !== 0) {
      const tRight = (this.canvasWidth - a.x) / dx;
      const tLeft = (0 - a.x) / dx;
      if (dx > 0) tMax = tRight;
      else tMax = tLeft;
    }
    if (dy !== 0) {
      const tBottom = (this.canvasHeight - a.y) / dy;
      const tTop = (0 - a.y) / dy;
      if (dy > 0) tMax = Math.min(tMax, tBottom);
      else tMax = Math.min(tMax, tTop);
    }

    const endX = a.x + dx * tMax;
    const endY = a.y + dy * tMax;

    this.ctx.beginPath();
    this.ctx.moveTo(this.s(a.x), this.s(a.y));
    this.ctx.lineTo(this.s(endX), this.s(endY));
    this.ctx.stroke();

    this.drawDot(a);
  }

  // ── Price Range ────────────────────────────────────────
  private drawPriceRange(a: PixelPoint, b: PixelPoint, _isPreview: boolean): void {
    if (!this.ctx) return;

    const priceA = this.getPointPrice(0);
    const priceB = this.getPointPrice(1);
    if (priceA === null || priceB === null) return;

    const topY = Math.min(a.y, b.y);
    const bottomY = Math.max(a.y, b.y);
    const midX = (a.x + b.x) / 2;

    // Vertical line spanning the range
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(midX), this.s(topY));
    this.ctx.lineTo(this.s(midX), this.s(bottomY));
    this.ctx.stroke();

    // Top cap
    const capW = 8;
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(midX - capW), this.s(topY));
    this.ctx.lineTo(this.s(midX + capW), this.s(topY));
    this.ctx.stroke();

    // Bottom cap
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(midX - capW), this.s(bottomY));
    this.ctx.lineTo(this.s(midX + capW), this.s(bottomY));
    this.ctx.stroke();

    // Price labels
    if (!_isPreview) {
      const highPrice = Math.max(priceA, priceB);
      const lowPrice = Math.min(priceA, priceB);
      const diff = highPrice - lowPrice;

      this.drawPriceLabel(midX + capW + 4, topY, highPrice);
      this.drawPriceLabel(midX + capW + 4, bottomY, lowPrice);

      // Range label in the middle
      if (diff > 0) {
        const midY = (topY + bottomY) / 2;
        this.ctx.save();
        this.ctx.font = `${this.s(10)}px 'JetBrains Mono', monospace`;
        this.ctx.fillStyle = DEFAULT_COLOR;
        this.ctx.globalAlpha = 0.9;
        this.ctx.fillText(
          `Δ ${diff.toFixed(2)}`,
          this.s(midX + capW + 4),
          this.s(midY + 3),
        );
        this.ctx.restore();
      }
    }

    this.drawDot(a);
    this.drawDot(b);
  }

  // ── Horizontal Ray ─────────────────────────────────────
  private drawHorizontalRay(pt: PixelPoint, _mouse: PixelPoint, isPreview: boolean): void {
    if (!this.ctx) return;
    const y = pt.y;
    const right = this.canvasWidth;

    this.ctx.beginPath();
    this.ctx.moveTo(this.s(pt.x), this.s(y));
    this.ctx.lineTo(this.s(right), this.s(y));
    this.ctx.stroke();

    // Price label on the right
    if (!isPreview) {
      this.drawPriceLabel(right - 2, y, this.getPointPrice(0) ?? 0);
    }

    this.drawDot(pt);
  }

  // ── Cross Line ─────────────────────────────────────────
  private drawCrossLine(a: PixelPoint, _b: PixelPoint, isPreview: boolean): void {
    if (!this.ctx) return;

    // Horizontal line through point A
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(0), this.s(a.y));
    this.ctx.lineTo(this.s(this.canvasWidth), this.s(a.y));
    this.ctx.stroke();

    // Vertical line through point A
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(a.x), this.s(0));
    this.ctx.lineTo(this.s(a.x), this.s(this.canvasHeight));
    this.ctx.stroke();

    // Labels
    if (!isPreview) {
      this.drawPriceLabel(this.canvasWidth - 2, a.y, this.getPointPrice(0) ?? 0);
      this.drawTimeLabel(a.x, this.canvasHeight - 2);
    }

    this.drawDot(a);
  }

  // ── Info Line ──────────────────────────────────────────
  private drawInfoLine(a: PixelPoint, b: PixelPoint, isPreview: boolean): void {
    if (!this.ctx) return;

    // Main trend line
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(a.x), this.s(a.y));
    this.ctx.lineTo(this.s(b.x), this.s(b.y));
    this.ctx.stroke();

    // Info labels
    if (!isPreview) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const priceA = this.getPointPrice(0);
      const priceB = this.getPointPrice(1);
      const priceDist = priceA !== null && priceB !== null ? Math.abs(priceB - priceA) : 0;

      // Angle in degrees
      const angle = Math.atan2(-dy, dx) * (180 / Math.PI);

      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;

      this.ctx.save();
      this.ctx.font = `${this.s(10)}px 'JetBrains Mono', monospace`;
      this.ctx.fillStyle = DEFAULT_COLOR;
      this.ctx.globalAlpha = 0.85;

      // Distance label
      this.ctx.fillText(
        `Δ ${priceDist.toFixed(2)}`,
        this.s(midX + 6),
        this.s(midY - 8),
      );

      // Angle label
      this.ctx.fillText(
        `${angle.toFixed(1)}°`,
        this.s(midX + 6),
        this.s(midY + 4),
      );

      // Pixel distance label
      this.ctx.fillText(
        `${dist.toFixed(0)}px`,
        this.s(midX + 6),
        this.s(midY + 16),
      );

      this.ctx.restore();
    }

    this.drawDot(a);
    this.drawDot(b);
  }

  // ── Trend Angle ────────────────────────────────────────
  private drawTrendAngle(a: PixelPoint, b: PixelPoint, isPreview: boolean): void {
    if (!this.ctx) return;

    // Main trend line
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(a.x), this.s(a.y));
    this.ctx.lineTo(this.s(b.x), this.s(b.y));
    this.ctx.stroke();

    // Angle label
    if (!isPreview) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const angle = Math.atan2(-dy, dx) * (180 / Math.PI);

      // Draw a small arc showing the angle at point A
      const arcRadius = 20;
      const lineAngle = Math.atan2(dy, dx);

      this.ctx.save();
      this.ctx.globalAlpha = 0.4;
      this.ctx.beginPath();
      this.ctx.arc(this.s(a.x), this.s(a.y), this.s(arcRadius), 0, -lineAngle, lineAngle > 0);
      this.ctx.stroke();

      // Angle text
      this.ctx.globalAlpha = 0.9;
      this.ctx.font = `${this.s(10)}px 'JetBrains Mono', monospace`;
      this.ctx.fillStyle = DEFAULT_COLOR;
      this.ctx.fillText(
        `${angle.toFixed(1)}°`,
        this.s(a.x + arcRadius + 6),
        this.s(a.y - 4),
      );
      this.ctx.restore();
    }

    this.drawDot(a);
    this.drawDot(b);
  }

  // ── Regression Trend ───────────────────────────────────
  private drawRegressionTrend(a: PixelPoint, b: PixelPoint, c: PixelPoint, isPreview: boolean): void {
    if (!this.ctx) return;

    // Compute linear regression from the 3 points
    const n = 3;
    const xs = [a.x, b.x, c.x];
    const ys = [a.y, b.y, c.y];

    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += xs[i];
      sumY += ys[i];
      sumXY += xs[i] * ys[i];
      sumXX += xs[i] * xs[i];
    }

    const denom = n * sumXX - sumX * sumX;
    if (denom === 0) return;

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    // Middle regression line
    const minX = Math.min(a.x, b.x, c.x);
    const maxX = Math.max(a.x, b.x, c.x);
    const midY1 = slope * minX + intercept;
    const midY2 = slope * maxX + intercept;

    this.ctx.beginPath();
    this.ctx.moveTo(this.s(minX), this.s(midY1));
    this.ctx.lineTo(this.s(maxX), this.s(midY2));
    this.ctx.stroke();

    // Compute max perpendicular distance from points to regression line
    let maxDist = 0;
    for (let i = 0; i < n; i++) {
      const dist = Math.abs(slope * xs[i] - ys[i] + intercept) / Math.sqrt(slope * slope + 1);
      if (dist > maxDist) maxDist = dist;
    }

    // Upper channel line
    const perpLen = Math.sqrt(slope * slope + 1);
    const px = -slope / perpLen;
    const py = 1 / perpLen;

    // Upper channel
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(minX + px * maxDist), this.s(midY1 + py * maxDist));
    this.ctx.lineTo(this.s(maxX + px * maxDist), this.s(midY2 + py * maxDist));
    this.ctx.stroke();

    // Lower channel
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(minX - px * maxDist), this.s(midY1 - py * maxDist));
    this.ctx.lineTo(this.s(maxX - px * maxDist), this.s(midY2 - py * maxDist));
    this.ctx.stroke();

    // Fill channel area
    this.ctx.save();
    this.ctx.globalAlpha = isPreview ? 0.04 : 0.06;
    this.ctx.fillStyle = this.ctx.strokeStyle;
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(minX + px * maxDist), this.s(midY1 + py * maxDist));
    this.ctx.lineTo(this.s(maxX + px * maxDist), this.s(midY2 + py * maxDist));
    this.ctx.lineTo(this.s(maxX - px * maxDist), this.s(midY2 - py * maxDist));
    this.ctx.lineTo(this.s(minX - px * maxDist), this.s(midY1 - py * maxDist));
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.restore();

    this.drawDot(a);
    this.drawDot(b);
    this.drawDot(c);
  }

  // ── Flat Top / Bottom ──────────────────────────────────
  private drawFlatTopBottom(a: PixelPoint, b: PixelPoint, isPreview: boolean): void {
    if (!this.ctx) return;

    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);

    // Fill with stronger shading on top half
    this.ctx.save();
    this.ctx.globalAlpha = isPreview ? 0.05 : 0.08;
    this.ctx.fillStyle = this.ctx.strokeStyle;
    this.ctx.fillRect(this.s(x), this.s(y), this.s(w), this.s(h));

    // Emphasized top border
    this.ctx.globalAlpha = isPreview ? 0.3 : 0.5;
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(x), this.s(y));
    this.ctx.lineTo(this.s(x + w), this.s(y));
    this.ctx.stroke();

    // Emphasized bottom border
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(x), this.s(y + h));
    this.ctx.lineTo(this.s(x + w), this.s(y + h));
    this.ctx.stroke();
    this.ctx.restore();

    // Stroke full rectangle
    this.ctx.strokeRect(this.s(x), this.s(y), this.s(w), this.s(h));

    this.drawDot(a);
    this.drawDot(b);
  }

  // ── Disjoint Channel ───────────────────────────────────
  private drawDisjointChannel(a: PixelPoint, b: PixelPoint, isPreview: boolean): void {
    if (!this.ctx) return;

    const offset = 15; // Fixed pixel offset for disjoint lines

    // Line 1 through A
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;

    // Perpendicular unit vector
    const px = -dy / len;
    const py = dx / len;

    // Line 1: through A, offset slightly
    const a1x = a.x + px * offset;
    const a1y = a.y + py * offset;
    const b1x = b.x + px * offset;
    const b1y = b.y + py * offset;

    // Line 2: through B, offset slightly opposite
    const a2x = a.x - px * offset;
    const a2y = a.y - py * offset;
    const b2x = b.x - px * offset;
    const b2y = b.y - py * offset;

    this.ctx.beginPath();
    this.ctx.moveTo(this.s(a1x), this.s(a1y));
    this.ctx.lineTo(this.s(b1x), this.s(b1y));
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(this.s(a2x), this.s(a2y));
    this.ctx.lineTo(this.s(b2x), this.s(b2y));
    this.ctx.stroke();

    // Fill area between lines
    this.ctx.save();
    this.ctx.globalAlpha = isPreview ? 0.04 : 0.06;
    this.ctx.fillStyle = this.ctx.strokeStyle;
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(a1x), this.s(a1y));
    this.ctx.lineTo(this.s(b1x), this.s(b1y));
    this.ctx.lineTo(this.s(b2x), this.s(b2y));
    this.ctx.lineTo(this.s(a2x), this.s(a2y));
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.restore();

    this.drawDot(a);
    this.drawDot(b);
  }

  // ── Andrews Pitchfork ──────────────────────────────────
  private drawAndrewsPitchfork(a: PixelPoint, b: PixelPoint, c: PixelPoint, isPreview: boolean): void {
    if (!this.ctx) return;

    // Midpoint of B and C
    const midBCx = (b.x + c.x) / 2;
    const midBCy = (b.y + c.y) / 2;

    // Median line from A through midpoint of B-C
    const dx = midBCx - a.x;
    const dy = midBCy - a.y;

    // Extend median line to canvas edge
    let tMax = Infinity;
    if (dx !== 0) {
      const tRight = (this.canvasWidth - a.x) / dx;
      const tLeft = (0 - a.x) / dx;
      tMax = dx > 0 ? tRight : tLeft;
    }
    if (dy !== 0) {
      const tBottom = (this.canvasHeight - a.y) / dy;
      const tTop = (0 - a.y) / dy;
      tMax = Math.min(tMax, dy > 0 ? tBottom : tTop);
    }

    const endX = a.x + dx * tMax;
    const endY = a.y + dy * tMax;

    // Median line
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(a.x), this.s(a.y));
    this.ctx.lineTo(this.s(endX), this.s(endY));
    this.ctx.stroke();

    // Prong from A to B
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(a.x), this.s(a.y));
    this.ctx.lineTo(this.s(b.x), this.s(b.y));
    this.ctx.stroke();

    // Prong from A to C
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(a.x), this.s(a.y));
    this.ctx.lineTo(this.s(c.x), this.s(c.y));
    this.ctx.stroke();

    // Dashed lines from B and C to the median extension
    this.ctx.save();
    this.ctx.setLineDash(isPreview ? PREVIEW_DASH.map(d => this.s(d)) : [this.s(4), this.s(3)]);
    this.ctx.globalAlpha = 0.4;

    // Extend prong B
    const dxB = b.x - a.x;
    const dyB = b.y - a.y;
    let tMaxB = Infinity;
    if (dxB !== 0) {
      const tRight = (this.canvasWidth - a.x) / dxB;
      const tLeft = (0 - a.x) / dxB;
      tMaxB = dxB > 0 ? tRight : tLeft;
    }
    if (dyB !== 0) {
      const tBottom = (this.canvasHeight - a.y) / dyB;
      const tTop = (0 - a.y) / dyB;
      tMaxB = Math.min(tMaxB, dyB > 0 ? tBottom : tTop);
    }
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(b.x), this.s(b.y));
    this.ctx.lineTo(this.s(a.x + dxB * tMaxB), this.s(a.y + dyB * tMaxB));
    this.ctx.stroke();

    // Extend prong C
    const dxC = c.x - a.x;
    const dyC = c.y - a.y;
    let tMaxC = Infinity;
    if (dxC !== 0) {
      const tRight = (this.canvasWidth - a.x) / dxC;
      const tLeft = (0 - a.x) / dxC;
      tMaxC = dxC > 0 ? tRight : tLeft;
    }
    if (dyC !== 0) {
      const tBottom = (this.canvasHeight - a.y) / dyC;
      const tTop = (0 - a.y) / dyC;
      tMaxC = Math.min(tMaxC, dyC > 0 ? tBottom : tTop);
    }
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(c.x), this.s(c.y));
    this.ctx.lineTo(this.s(a.x + dxC * tMaxC), this.s(a.y + dyC * tMaxC));
    this.ctx.stroke();

    this.ctx.restore();

    this.drawDot(a);
    this.drawDot(b);
    this.drawDot(c);
  }

  // ── Schiff Pitchfork ───────────────────────────────────
  private drawSchiffPitchfork(a: PixelPoint, b: PixelPoint, c: PixelPoint, isPreview: boolean): void {
    if (!this.ctx) return;

    // Midpoint of B and C
    const midBCx = (b.x + c.x) / 2;
    const midBCy = (b.y + c.y) / 2;

    // Schiff: origin is midpoint of A and midpoint(B,C)
    const originX = (a.x + midBCx) / 2;
    const originY = (a.y + midBCy) / 2;

    // Median line from origin through midpoint of B-C
    const dx = midBCx - originX;
    const dy = midBCy - originY;

    let tMax = Infinity;
    if (dx !== 0) {
      const tRight = (this.canvasWidth - originX) / dx;
      const tLeft = (0 - originX) / dx;
      tMax = dx > 0 ? tRight : tLeft;
    }
    if (dy !== 0) {
      const tBottom = (this.canvasHeight - originY) / dy;
      const tTop = (0 - originY) / dy;
      tMax = Math.min(tMax, dy > 0 ? tBottom : tTop);
    }

    const endX = originX + dx * tMax;
    const endY = originY + dy * tMax;

    // Median line
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(originX), this.s(originY));
    this.ctx.lineTo(this.s(endX), this.s(endY));
    this.ctx.stroke();

    // Prong to B
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(originX), this.s(originY));
    this.ctx.lineTo(this.s(b.x), this.s(b.y));
    this.ctx.stroke();

    // Prong to C
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(originX), this.s(originY));
    this.ctx.lineTo(this.s(c.x), this.s(c.y));
    this.ctx.stroke();

    // Dashed extensions for prongs
    this.ctx.save();
    this.ctx.setLineDash(isPreview ? PREVIEW_DASH.map(d => this.s(d)) : [this.s(4), this.s(3)]);
    this.ctx.globalAlpha = 0.4;

    const dxB = b.x - originX;
    const dyB = b.y - originY;
    let tMaxB = Infinity;
    if (dxB !== 0) {
      const tRight = (this.canvasWidth - originX) / dxB;
      const tLeft = (0 - originX) / dxB;
      tMaxB = dxB > 0 ? tRight : tLeft;
    }
    if (dyB !== 0) {
      const tBottom = (this.canvasHeight - originY) / dyB;
      const tTop = (0 - originY) / dyB;
      tMaxB = Math.min(tMaxB, dyB > 0 ? tBottom : tTop);
    }
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(b.x), this.s(b.y));
    this.ctx.lineTo(this.s(originX + dxB * tMaxB), this.s(originY + dyB * tMaxB));
    this.ctx.stroke();

    const dxC = c.x - originX;
    const dyC = c.y - originY;
    let tMaxC = Infinity;
    if (dxC !== 0) {
      const tRight = (this.canvasWidth - originX) / dxC;
      const tLeft = (0 - originX) / dxC;
      tMaxC = dxC > 0 ? tRight : tLeft;
    }
    if (dyC !== 0) {
      const tBottom = (this.canvasHeight - originY) / dyC;
      const tTop = (0 - originY) / dyC;
      tMaxC = Math.min(tMaxC, dyC > 0 ? tBottom : tTop);
    }
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(c.x), this.s(c.y));
    this.ctx.lineTo(this.s(originX + dxC * tMaxC), this.s(originY + dyC * tMaxC));
    this.ctx.stroke();

    this.ctx.restore();

    this.drawDot(a);
    this.drawDot(b);
    this.drawDot(c);
  }

  // ── Modified Schiff Pitchfork ──────────────────────────
  private drawModifiedSchiff(a: PixelPoint, b: PixelPoint, c: PixelPoint, isPreview: boolean): void {
    if (!this.ctx) return;

    // Midpoint of B and C
    const midBCx = (b.x + c.x) / 2;
    const midBCy = (b.y + c.y) / 2;

    // Modified Schiff: origin at midpoint(A, midpoint(B,C)/2)
    const halfMidBCx = (a.x + midBCx) / 2;
    const halfMidBCy = (a.y + midBCy) / 2;
    const originX = (a.x + halfMidBCx) / 2;
    const originY = (a.y + halfMidBCy) / 2;

    // Median line from origin through halfMidBC
    const dx = halfMidBCx - originX;
    const dy = halfMidBCy - originY;

    let tMax = Infinity;
    if (dx !== 0) {
      const tRight = (this.canvasWidth - originX) / dx;
      const tLeft = (0 - originX) / dx;
      tMax = dx > 0 ? tRight : tLeft;
    }
    if (dy !== 0) {
      const tBottom = (this.canvasHeight - originY) / dy;
      const tTop = (0 - originY) / dy;
      tMax = Math.min(tMax, dy > 0 ? tBottom : tTop);
    }

    const endX = originX + dx * tMax;
    const endY = originY + dy * tMax;

    // Median line
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(originX), this.s(originY));
    this.ctx.lineTo(this.s(endX), this.s(endY));
    this.ctx.stroke();

    // Prongs adjusted: to B and C with adjusted origin
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(originX), this.s(originY));
    this.ctx.lineTo(this.s(b.x), this.s(b.y));
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(this.s(originX), this.s(originY));
    this.ctx.lineTo(this.s(c.x), this.s(c.y));
    this.ctx.stroke();

    // Dashed extensions for prongs
    this.ctx.save();
    this.ctx.setLineDash(isPreview ? PREVIEW_DASH.map(d => this.s(d)) : [this.s(4), this.s(3)]);
    this.ctx.globalAlpha = 0.4;

    const dxB = b.x - originX;
    const dyB = b.y - originY;
    let tMaxB = Infinity;
    if (dxB !== 0) {
      const tRight = (this.canvasWidth - originX) / dxB;
      const tLeft = (0 - originX) / dxB;
      tMaxB = dxB > 0 ? tRight : tLeft;
    }
    if (dyB !== 0) {
      const tBottom = (this.canvasHeight - originY) / dyB;
      const tTop = (0 - originY) / dyB;
      tMaxB = Math.min(tMaxB, dyB > 0 ? tBottom : tTop);
    }
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(b.x), this.s(b.y));
    this.ctx.lineTo(this.s(originX + dxB * tMaxB), this.s(originY + dyB * tMaxB));
    this.ctx.stroke();

    const dxC = c.x - originX;
    const dyC = c.y - originY;
    let tMaxC = Infinity;
    if (dxC !== 0) {
      const tRight = (this.canvasWidth - originX) / dxC;
      const tLeft = (0 - originX) / dxC;
      tMaxC = dxC > 0 ? tRight : tLeft;
    }
    if (dyC !== 0) {
      const tBottom = (this.canvasHeight - originY) / dyC;
      const tTop = (0 - originY) / dyC;
      tMaxC = Math.min(tMaxC, dyC > 0 ? tBottom : tTop);
    }
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(c.x), this.s(c.y));
    this.ctx.lineTo(this.s(originX + dxC * tMaxC), this.s(originY + dyC * tMaxC));
    this.ctx.stroke();

    this.ctx.restore();

    this.drawDot(a);
    this.drawDot(b);
    this.drawDot(c);
  }

  // ── Fibonacci Extension ────────────────────────────────
  private drawFibExtension(a: PixelPoint, b: PixelPoint, isPreview: boolean): void {
    if (!this.ctx) return;

    const priceA = this.getPointPrice(0);
    const priceB = this.getPointPrice(1);
    if (priceA === null || priceB === null) return;

    const priceRange = priceB - priceA;

    for (const level of FIB_EXTENSION_LEVELS) {
      const price = priceA + priceRange * (level / 100);
      const y = this.candleSeries.priceToCoordinate(price);
      if (y === null) continue;

      const color = FIBONACCI_COLORS[level] || DEFAULT_COLOR;

      this.ctx.save();
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = this.s(level === 0 || level === 100 ? 1.5 : 1);
      this.ctx.globalAlpha = isPreview ? 0.35 : 0.6;

      this.ctx.beginPath();
      this.ctx.moveTo(this.s(a.x), this.s(y));
      this.ctx.lineTo(this.s(b.x), this.s(y));
      this.ctx.stroke();

      // Label on the right side
      if (!isPreview) {
        const labelText = `${level}% — ${price.toFixed(2)}`;
        this.ctx.globalAlpha = 0.85;
        this.ctx.font = `${this.s(10)}px 'JetBrains Mono', monospace`;
        this.ctx.fillStyle = color;
        this.ctx.fillText(labelText, this.s(b.x + 6), this.s(y + 3));
      }

      this.ctx.restore();
    }

    // Draw the main trend line connecting A and B
    this.ctx.save();
    this.ctx.strokeStyle = DEFAULT_COLOR;
    this.ctx.lineWidth = this.s(DEFAULT_LINE_WIDTH);
    this.ctx.globalAlpha = isPreview ? 0.5 : DEFAULT_OPACITY;
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(a.x), this.s(a.y));
    this.ctx.lineTo(this.s(b.x), this.s(b.y));
    this.ctx.stroke();
    this.ctx.restore();

    this.drawDot(a);
    this.drawDot(b);
  }

  // ── Fibonacci Fan ──────────────────────────────────────
  private drawFibFan(a: PixelPoint, b: PixelPoint, isPreview: boolean): void {
    if (!this.ctx) return;

    const priceA = this.getPointPrice(0);
    const priceB = this.getPointPrice(1);
    if (priceA === null || priceB === null) return;

    const priceRange = priceB - priceA;

    // Draw the main trend line
    this.ctx.save();
    this.ctx.strokeStyle = DEFAULT_COLOR;
    this.ctx.lineWidth = this.s(DEFAULT_LINE_WIDTH);
    this.ctx.globalAlpha = isPreview ? 0.5 : DEFAULT_OPACITY;
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(a.x), this.s(a.y));
    this.ctx.lineTo(this.s(b.x), this.s(b.y));
    this.ctx.stroke();
    this.ctx.restore();

    // Fan lines from A at Fibonacci levels reaching to B's time coordinate
    for (const level of FIB_FAN_LEVELS) {
      const price = priceA + priceRange * (level / 100);
      const y = this.candleSeries.priceToCoordinate(price);
      if (y === null) continue;

      const color = FIBONACCI_COLORS[level] || DEFAULT_COLOR;

      this.ctx.save();
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = this.s(1);
      this.ctx.globalAlpha = isPreview ? 0.35 : 0.6;

      this.ctx.beginPath();
      this.ctx.moveTo(this.s(a.x), this.s(a.y));
      this.ctx.lineTo(this.s(b.x), this.s(y));
      this.ctx.stroke();

      // Label
      if (!isPreview) {
        const labelText = `${level}% — ${price.toFixed(2)}`;
        this.ctx.globalAlpha = 0.85;
        this.ctx.font = `${this.s(10)}px 'JetBrains Mono', monospace`;
        this.ctx.fillStyle = color;
        this.ctx.fillText(labelText, this.s(b.x + 6), this.s(y + 3));
      }

      this.ctx.restore();
    }

    this.drawDot(a);
    this.drawDot(b);
  }

  // ── Fibonacci Spiral ───────────────────────────────────
  private drawFibSpiral(a: PixelPoint, b: PixelPoint, isPreview: boolean): void {
    if (!this.ctx) return;

    const cx = a.x;
    const cy = a.y;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const maxRadius = Math.sqrt(dx * dx + dy * dy);

    // Logarithmic spiral using golden ratio
    const phi = (1 + Math.sqrt(5)) / 2; // golden ratio
    const growthFactor = Math.log(phi) / (Math.PI / 2);

    this.ctx.beginPath();
    const steps = 200;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 4 * Math.PI; // 2 full rotations
      const r = maxRadius * Math.exp(-growthFactor * t);
      if (r < 2) break;
      const px = cx + r * Math.cos(t);
      const py = cy + r * Math.sin(t);

      if (i === 0) {
        this.ctx.moveTo(this.s(px), this.s(py));
      } else {
        this.ctx.lineTo(this.s(px), this.s(py));
      }
    }
    this.ctx.stroke();

    this.drawDot(a);
    this.drawDot(b);
  }

  // ── Fibonacci Wedge ────────────────────────────────────
  private drawFibWedge(a: PixelPoint, b: PixelPoint, isPreview: boolean): void {
    if (!this.ctx) return;

    const priceA = this.getPointPrice(0);
    const priceB = this.getPointPrice(1);
    if (priceA === null || priceB === null) return;

    const priceRange = priceB - priceA;

    // Main trend line
    this.ctx.save();
    this.ctx.strokeStyle = DEFAULT_COLOR;
    this.ctx.lineWidth = this.s(DEFAULT_LINE_WIDTH);
    this.ctx.globalAlpha = isPreview ? 0.5 : DEFAULT_OPACITY;
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(a.x), this.s(a.y));
    this.ctx.lineTo(this.s(b.x), this.s(b.y));
    this.ctx.stroke();
    this.ctx.restore();

    // Wedge lines from A forming Fibonacci-based width at B
    for (const level of FIB_FAN_LEVELS) {
      const priceUp = priceA + priceRange * (level / 100);
      const priceDown = priceA - priceRange * (level / 100);

      const yUp = this.candleSeries.priceToCoordinate(priceUp);
      const yDown = this.candleSeries.priceToCoordinate(priceDown);

      const color = FIBONACCI_COLORS[level] || DEFAULT_COLOR;

      if (yUp !== null) {
        this.ctx.save();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = this.s(1);
        this.ctx.globalAlpha = isPreview ? 0.35 : 0.6;
        this.ctx.beginPath();
        this.ctx.moveTo(this.s(a.x), this.s(a.y));
        this.ctx.lineTo(this.s(b.x), this.s(yUp));
        this.ctx.stroke();

        if (!isPreview) {
          this.ctx.globalAlpha = 0.85;
          this.ctx.font = `${this.s(10)}px 'JetBrains Mono', monospace`;
          this.ctx.fillStyle = color;
          this.ctx.fillText(`${level}%`, this.s(b.x + 6), this.s(yUp + 3));
        }
        this.ctx.restore();
      }

      if (yDown !== null) {
        this.ctx.save();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = this.s(1);
        this.ctx.globalAlpha = isPreview ? 0.35 : 0.6;
        this.ctx.beginPath();
        this.ctx.moveTo(this.s(a.x), this.s(a.y));
        this.ctx.lineTo(this.s(b.x), this.s(yDown));
        this.ctx.stroke();

        if (!isPreview) {
          this.ctx.globalAlpha = 0.85;
          this.ctx.font = `${this.s(10)}px 'JetBrains Mono', monospace`;
          this.ctx.fillStyle = color;
          this.ctx.fillText(`-${level}%`, this.s(b.x + 6), this.s(yDown + 3));
        }
        this.ctx.restore();
      }
    }

    this.drawDot(a);
    this.drawDot(b);
  }

  // ── Fibonacci Time Zone ────────────────────────────────
  private drawFibTimeZone(a: PixelPoint, b: PixelPoint, isPreview: boolean): void {
    if (!this.ctx) return;

    const timeDist = b.x - a.x;

    for (const level of FIB_TIME_LEVELS) {
      const x = a.x + timeDist * level;

      // Only draw if within canvas
      if (x < 0 || x > this.canvasWidth) continue;

      const color = FIBONACCI_COLORS[61.8] || DEFAULT_COLOR;

      this.ctx.save();
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = this.s(level === 1 ? 1.5 : 1);
      this.ctx.globalAlpha = isPreview ? 0.35 : 0.5;

      this.ctx.beginPath();
      this.ctx.moveTo(this.s(x), this.s(0));
      this.ctx.lineTo(this.s(x), this.s(this.canvasHeight));
      this.ctx.stroke();

      // Label at the bottom
      if (!isPreview) {
        this.ctx.globalAlpha = 0.85;
        this.ctx.font = `${this.s(10)}px 'JetBrains Mono', monospace`;
        this.ctx.fillStyle = color;
        this.ctx.fillText(`${level}`, this.s(x + 4), this.s(this.canvasHeight - 6));
      }

      this.ctx.restore();
    }

    this.drawDot(a);
    this.drawDot(b);
  }

  // ── Gann Box ───────────────────────────────────────────
  private drawGannBox(a: PixelPoint, b: PixelPoint, isPreview: boolean): void {
    if (!this.ctx) return;

    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);

    // Fill
    this.ctx.save();
    this.ctx.globalAlpha = isPreview ? 0.05 : 0.08;
    this.ctx.fillStyle = this.ctx.strokeStyle;
    this.ctx.fillRect(this.s(x), this.s(y), this.s(w), this.s(h));
    this.ctx.restore();

    // Stroke rectangle
    this.ctx.strokeRect(this.s(x), this.s(y), this.s(w), this.s(h));

    // Diagonal lines from corners at 45 degrees
    this.ctx.save();
    this.ctx.globalAlpha = isPreview ? 0.3 : 0.5;
    this.ctx.setLineDash([this.s(4), this.s(3)]);

    // Diagonal top-left to bottom-right
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(x), this.s(y));
    this.ctx.lineTo(this.s(x + w), this.s(y + h));
    this.ctx.stroke();

    // Diagonal top-right to bottom-left
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(x + w), this.s(y));
    this.ctx.lineTo(this.s(x), this.s(y + h));
    this.ctx.stroke();

    // Middle horizontal
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(x), this.s(y + h / 2));
    this.ctx.lineTo(this.s(x + w), this.s(y + h / 2));
    this.ctx.stroke();

    // Middle vertical
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(x + w / 2), this.s(y));
    this.ctx.lineTo(this.s(x + w / 2), this.s(y + h));
    this.ctx.stroke();

    this.ctx.restore();

    this.drawDot(a);
    this.drawDot(b);
  }

  // ── Gann Square ────────────────────────────────────────
  private drawGannSquare(a: PixelPoint, b: PixelPoint, isPreview: boolean): void {
    if (!this.ctx) return;

    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const maxW = Math.abs(b.x - a.x);
    const maxH = Math.abs(b.y - a.y);

    // Concentric squares from center
    const rings = 4;
    for (let i = 1; i <= rings; i++) {
      const frac = i / rings;
      const hw = maxW * frac / 2;
      const hh = maxH * frac / 2;

      this.ctx.save();
      this.ctx.globalAlpha = isPreview ? 0.2 + frac * 0.3 : 0.3 + frac * 0.5;

      this.ctx.strokeRect(
        this.s(cx - hw),
        this.s(cy - hh),
        this.s(hw * 2),
        this.s(hh * 2),
      );

      this.ctx.restore();
    }

    // Cross lines through center
    this.ctx.save();
    this.ctx.globalAlpha = isPreview ? 0.3 : 0.5;
    this.ctx.setLineDash([this.s(4), this.s(3)]);

    this.ctx.beginPath();
    this.ctx.moveTo(this.s(cx), this.s(cy - maxH / 2));
    this.ctx.lineTo(this.s(cx), this.s(cy + maxH / 2));
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(this.s(cx - maxW / 2), this.s(cy));
    this.ctx.lineTo(this.s(cx + maxW / 2), this.s(cy));
    this.ctx.stroke();

    this.ctx.restore();

    this.drawDot(a);
    this.drawDot(b);
  }

  // ── Gann Fan ───────────────────────────────────────────
  private drawGannFan(a: PixelPoint, _b: PixelPoint, _c: PixelPoint, isPreview: boolean): void {
    if (!this.ctx) return;

    // Draw lines from point A at Gann angles
    for (const angleDeg of GANN_ANGLES) {
      const angleRad = (angleDeg * Math.PI) / 180;

      // Compute direction: Gann angles measured from horizontal
      const dx = Math.cos(angleRad);
      const dy = -Math.sin(angleRad); // Canvas y is inverted

      // Find intersection with canvas edge
      let tMax = Infinity;
      if (dx !== 0) {
        const tRight = (this.canvasWidth - a.x) / dx;
        const tLeft = (0 - a.x) / dx;
        if (dx > 0) tMax = tRight;
        else tMax = tLeft;
      }
      if (dy !== 0) {
        const tBottom = (this.canvasHeight - a.y) / dy;
        const tTop = (0 - a.y) / dy;
        if (dy > 0) tMax = Math.min(tMax, tBottom);
        else tMax = Math.min(tMax, tTop);
      }

      const endX = a.x + dx * tMax;
      const endY = a.y + dy * tMax;

      const isMainAngle = Math.abs(angleDeg - 45) < 0.1;

      this.ctx.save();
      this.ctx.strokeStyle = isMainAngle ? DEFAULT_COLOR : this.ctx.strokeStyle;
      this.ctx.lineWidth = this.s(isMainAngle ? 1.5 : 1);
      this.ctx.globalAlpha = isPreview
        ? (isMainAngle ? 0.5 : 0.3)
        : (isMainAngle ? DEFAULT_OPACITY : 0.5);

      this.ctx.beginPath();
      this.ctx.moveTo(this.s(a.x), this.s(a.y));
      this.ctx.lineTo(this.s(endX), this.s(endY));
      this.ctx.stroke();

      // Angle label
      if (!isPreview) {
        this.ctx.globalAlpha = 0.7;
        this.ctx.font = `${this.s(9)}px 'JetBrains Mono', monospace`;
        this.ctx.fillStyle = isMainAngle ? DEFAULT_COLOR : this.ctx.strokeStyle;
        const labelX = a.x + dx * Math.min(tMax, 60);
        const labelY = a.y + dy * Math.min(tMax, 60);
        this.ctx.fillText(`${angleDeg}°`, this.s(labelX + 4), this.s(labelY - 4));
      }

      this.ctx.restore();
    }

    this.drawDot(a);
  }

  // ── Ellipse ────────────────────────────────────────────
  private drawEllipse(a: PixelPoint, b: PixelPoint, isPreview: boolean): void {
    if (!this.ctx) return;

    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const rx = Math.abs(b.x - a.x) / 2;
    const ry = Math.abs(b.y - a.y) / 2;

    if (rx === 0 || ry === 0) return;

    // Fill
    this.ctx.save();
    this.ctx.globalAlpha = isPreview ? 0.05 : 0.08;
    this.ctx.fillStyle = this.ctx.strokeStyle;
    this.ctx.beginPath();
    this.ctx.ellipse(this.s(cx), this.s(cy), this.s(rx), this.s(ry), 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();

    // Stroke
    this.ctx.beginPath();
    this.ctx.ellipse(this.s(cx), this.s(cy), this.s(rx), this.s(ry), 0, 0, Math.PI * 2);
    this.ctx.stroke();

    this.drawDot(a);
    this.drawDot(b);
  }

  // ── Text Annotation ────────────────────────────────────
  private drawTextAnnotation(a: PixelPoint, b: PixelPoint, isPreview: boolean): void {
    if (!this.ctx) return;

    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);

    // Fill background
    this.ctx.save();
    this.ctx.globalAlpha = isPreview ? 0.05 : 0.08;
    this.ctx.fillStyle = this.ctx.strokeStyle;
    this.ctx.fillRect(this.s(x), this.s(y), this.s(w), this.s(h));
    this.ctx.restore();

    // Stroke border
    this.ctx.strokeRect(this.s(x), this.s(y), this.s(w), this.s(h));

    // TEXT label inside
    if (!isPreview && w > 20 && h > 14) {
      this.ctx.save();
      this.ctx.font = `${this.s(10)}px 'JetBrains Mono', monospace`;
      this.ctx.fillStyle = DEFAULT_COLOR;
      this.ctx.globalAlpha = 0.8;
      this.ctx.fillText('TEXT', this.s(x + 4), this.s(y + h / 2 + 3));
      this.ctx.restore();
    }

    this.drawDot(a);
    this.drawDot(b);
  }

  // ── Price Label Marker ─────────────────────────────────
  private drawPriceLabelMarker(pt: PixelPoint, color: string, isPreview: boolean): void {
    if (!this.ctx) return;

    const price = this.getPointPrice(0) ?? 0;
    const text = price.toFixed(2);

    // Draw a tag/badge at the price level
    this.ctx.save();
    this.ctx.font = `${this.s(10)}px 'JetBrains Mono', monospace`;

    const metrics = this.ctx.measureText(text);
    const textW = metrics.width / this.dpr;
    const textH = 12;
    const padX = 6;
    const padY = 3;

    const rx = pt.x - textW / 2 - padX;
    const ry = pt.y - textH / 2 - padY;
    const rw = textW + padX * 2;
    const rh = textH + padY * 2;

    // Background pill
    this.ctx.globalAlpha = 0.85;
    this.ctx.fillStyle = '#151A22';
    this.ctx.beginPath();
    this.roundRect(rx, ry, rw, rh, 4);
    this.ctx.fill();

    // Border
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = this.s(isPreview ? 1 : 1.5);
    this.ctx.globalAlpha = isPreview ? 0.5 : 0.7;
    this.ctx.stroke();

    // Text
    this.ctx.globalAlpha = 0.95;
    this.ctx.fillStyle = color;
    this.ctx.fillText(text, this.s(rx + padX), this.s(ry + padY + textH - 2));

    // Pointer arrow at bottom
    this.ctx.globalAlpha = 0.85;
    this.ctx.fillStyle = '#151A22';
    const arrowSize = 4;
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(pt.x - arrowSize), this.s(ry + rh));
    this.ctx.lineTo(this.s(pt.x), this.s(ry + rh + arrowSize));
    this.ctx.lineTo(this.s(pt.x + arrowSize), this.s(ry + rh));
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.restore();
  }

  // ── Note Pin ───────────────────────────────────────────
  private drawNote(pt: PixelPoint, color: string, isPreview: boolean): void {
    if (!this.ctx) return;

    const pinSize = 6;

    // Pin circle
    this.ctx.save();
    this.ctx.globalAlpha = isPreview ? 0.5 : 0.9;

    // Outer circle
    this.ctx.beginPath();
    this.ctx.arc(this.s(pt.x), this.s(pt.y), this.s(pinSize + 2), 0, Math.PI * 2);
    this.ctx.fillStyle = color;
    this.ctx.fill();

    // Inner circle
    this.ctx.beginPath();
    this.ctx.arc(this.s(pt.x), this.s(pt.y), this.s(pinSize - 1), 0, Math.PI * 2);
    this.ctx.fillStyle = '#151A22';
    this.ctx.fill();

    // Pin stem
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = this.s(1.5);
    this.ctx.beginPath();
    this.ctx.moveTo(this.s(pt.x), this.s(pt.y + pinSize + 2));
    this.ctx.lineTo(this.s(pt.x), this.s(pt.y + pinSize + 12));
    this.ctx.stroke();

    // "NOTE" label
    if (!isPreview) {
      this.ctx.font = `${this.s(9)}px 'JetBrains Mono', monospace`;
      this.ctx.fillStyle = color;
      this.ctx.globalAlpha = 0.8;
      this.ctx.fillText('📌', this.s(pt.x + pinSize + 4), this.s(pt.y + 3));
    }

    this.ctx.restore();
  }

  // ══════════════════════════════════════════════════════════
  //  HELPER DRAWING PRIMITIVES
  // ══════════════════════════════════════════════════════════

  /** Small dot at an endpoint. */
  private drawDot(pt: PixelPoint, radius: number = 3): void {
    if (!this.ctx) return;
    this.ctx.save();
    this.ctx.globalAlpha = 1;
    this.ctx.beginPath();
    this.ctx.arc(this.s(pt.x), this.s(pt.y), this.s(radius), 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  /** Price label for horizontal lines and price ranges. */
  private drawPriceLabel(x: number, y: number, price: number): void {
    if (!this.ctx) return;

    const text = price.toFixed(2);
    this.ctx.save();
    this.ctx.font = `${this.s(10)}px 'JetBrains Mono', monospace`;

    const metrics = this.ctx.measureText(text);
    const textW = metrics.width / this.dpr;
    const textH = 12;
    const padX = 4;
    const padY = 2;

    // Background pill
    this.ctx.globalAlpha = 0.85;
    this.ctx.fillStyle = '#151A22';
    const rx = x + padX;
    const ry = y - textH / 2 - padY;
    const rw = textW + padX * 2;
    const rh = textH + padY * 2;

    this.ctx.beginPath();
    this.roundRect(rx, ry, rw, rh, 3);
    this.ctx.fill();

    // Border
    this.ctx.strokeStyle = DEFAULT_COLOR;
    this.ctx.lineWidth = this.s(0.5);
    this.ctx.globalAlpha = 0.5;
    this.ctx.stroke();

    // Text
    this.ctx.globalAlpha = 0.95;
    this.ctx.fillStyle = DEFAULT_COLOR;
    this.ctx.fillText(text, this.s(rx + padX), this.s(ry + padY + textH - 2));
    this.ctx.restore();
  }

  /** Time label for vertical lines. */
  private drawTimeLabel(x: number, y: number): void {
    if (!this.ctx) return;

    const timeVal = this.chart.timeScale().coordinateToTime(x);
    if (timeVal === null) return;

    const date = new Date((timeVal as number) * 1000);
    const text = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    this.ctx.save();
    this.ctx.font = `${this.s(10)}px 'JetBrains Mono', monospace`;

    const metrics = this.ctx.measureText(text);
    const textW = metrics.width / this.dpr;
    const textH = 12;
    const padX = 4;
    const padY = 2;

    const rx = x - (textW + padX * 2) / 2;
    const ry = y - textH - padY * 2 - 2;
    const rw = textW + padX * 2;
    const rh = textH + padY * 2;

    this.ctx.globalAlpha = 0.85;
    this.ctx.fillStyle = '#151A22';
    this.ctx.beginPath();
    this.roundRect(rx, ry, rw, rh, 3);
    this.ctx.fill();

    this.ctx.strokeStyle = DEFAULT_COLOR;
    this.ctx.lineWidth = this.s(0.5);
    this.ctx.globalAlpha = 0.5;
    this.ctx.stroke();

    this.ctx.globalAlpha = 0.95;
    this.ctx.fillStyle = DEFAULT_COLOR;
    this.ctx.fillText(text, this.s(rx + padX), this.s(ry + padY + textH - 2));
    this.ctx.restore();
  }

  /** Rounded rectangle helper. */
  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    if (!this.ctx) return;
    const sx = this.s(x);
    const sy = this.s(y);
    const sw = this.s(w);
    const sh = this.s(h);
    const sr = this.s(r);

    this.ctx.beginPath();
    this.ctx.moveTo(sx + sr, sy);
    this.ctx.lineTo(sx + sw - sr, sy);
    this.ctx.quadraticCurveTo(sx + sw, sy, sx + sw, sy + sr);
    this.ctx.lineTo(sx + sw, sy + sh - sr);
    this.ctx.quadraticCurveTo(sx + sw, sy + sh, sx + sw - sr, sy + sh);
    this.ctx.lineTo(sx + sr, sy + sh);
    this.ctx.quadraticCurveTo(sx, sy + sh, sx, sy + sh - sr);
    this.ctx.lineTo(sx, sy + sr);
    this.ctx.quadraticCurveTo(sx, sy, sx + sr, sy);
    this.ctx.closePath();
  }

  /**
   * Get the price value for a clicked point by index.
   * Used for Fibonacci and Price Range where we need the actual price values.
   */
  private getPointPrice(index: number): number | null {
    if (index >= this.clickedPoints.length) return null;
    return this.clickedPoints[index].price;
  }

  /**
   * Cancel the current in-progress drawing (e.g. on Escape key).
   */
  cancelDrawing(): void {
    this.clickedPoints = [];
    this.isDrawing = false;
    this.mousePixel = null;
    this.setChartInteractionEnabled(true);
    if (this.currentTool === 'cursor') this.setCanvasPointerEvents(false);
    this.redraw();
  }

  /**
   * Enable or disable pointer events on the overlay canvas.
   * When enabled ('auto'), the canvas captures mouse events for drawing.
   * When disabled ('none'), events pass through to the chart below.
   */
  private setCanvasPointerEvents(enabled: boolean): void {
    if (this.overlayCanvas) {
      this.overlayCanvas.style.pointerEvents = enabled ? 'auto' : 'none';
    }
  }

  /**
   * Enable or disable chart interaction (scroll, zoom, pan).
   * Used to prevent chart panning while drawing or dragging.
   */
  private setChartInteractionEnabled(enabled: boolean): void {
    try {
      this.chart.applyOptions({
        handleScroll: {
          mouseWheel: enabled,
          pressedMouseMove: enabled,
          horzTouchDrag: enabled,
          vertTouchDrag: enabled,
        },
        handleScale: {
          axisPressedMouseMove: enabled,
          mouseWheel: enabled,
          pinch: enabled,
        },
      });
    } catch {}
  }
}
