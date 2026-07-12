// ═══════════════════════════════════════════════════════════════════════
// ROUA Chart Primitives — ISeriesPrimitive implementations
// Based on lightweight-charts v5 official API research
//
// KEY INSIGHT (from TradingView docs + deepentropy/lightweight-charts-drawing):
// - ISeriesPrimitive is the ONLY official way to draw custom overlays in v5
// - Always convert Time+Price to pixels INSIDE renderer(), never cache
// - Primitives are completely separate from series data
// - Primitives survive re-renders, scrolling, zooming
// - They NEVER affect candle data
// ═══════════════════════════════════════════════════════════════════════

import type {
  ISeriesPrimitive,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  ISeriesPrimitiveAxisView,
  SeriesAttachedParameter,
  Time,
  AutoscaleInfo,
} from 'lightweight-charts';
import { safeMax, safeMin } from './chart-utils'

// CanvasRenderingTarget2D is not exported from lightweight-charts types
// We use the internal type from fancy-canvas
interface CanvasRenderingTarget2D {
  useMediaCoordinateSpace(fn: (scope: { context: CanvasRenderingContext2D; mediaSize: { width: number; height: number } }) => void): void;
  useBitmapCoordinateSpace(fn: (scope: { context: CanvasRenderingContext2D; bitmapSize: { width: number; height: number }; mediaSize: { width: number; height: number }; horizontalPixelRatio: number; verticalPixelRatio: number }) => void): void;
}

// ── Color Palette for overlays ─────────────────────────────────────
export const OVERLAY_COLORS = {
  trendUp: '#059669',       // Green for support / ascending
  trendDown: '#ef4444',     // Red for resistance / descending
  harmonic: '#d4af37',      // Gold for harmonic patterns
  srStrong: T.info,      // Cyan for strong S/R
  srMedium: T.council,      // Purple for medium S/R
  srWeak: '#64748b',        // Gray for weak S/R
  bosBull: '#10b981',       // Green BOS
  bosBear: T.warning,       // Orange BOS
  chochBull: '#06b6d4',     // Cyan CHoCH
  chochBear: '#eab308',     // Yellow CHoCH
  elliott: '#93c5fd',       // Light blue for Elliott
  geo: T.council,           // Purple for geometric
  fvg: T.info,           // Cyan for FVG
  entry: '#00D4FF',         // Cyan for entry
  sl: '#ef4444',            // Red for SL
  tp: '#10b981',            // Green for TP
  wyckoff: '#fb923c',       // Orange for Wyckoff
  fibonacci: T.warning,     // Yellow for Fibonacci
  vp: T.warning,            // Yellow for Volume Profile
  zone: 'rgba(5, 150, 105, 0.08)', // Subtle green zone fill
  zoneRed: 'rgba(239, 68, 68, 0.08)', // Subtle red zone fill
  zoneGold: 'rgba(212, 175, 55, 0.08)', // Subtle gold zone fill
} as const;

// ── Common types ───────────────────────────────────────────────────
export interface Point {
  time: Time;
  price: number;
}

// ═══════════════════════════════════════════════════════════════════════
// 1. TREND LINE PRIMITIVE
// ═══════════════════════════════════════════════════════════════════════

export interface TrendLineData {
  startTime: Time;
  startPrice: number;
  endTime: Time;
  endPrice: number;
  color: string;
  lineWidth?: number;
  lineStyle?: number; // 0=solid, 1=dotted, 2=dashed
  extendRight?: boolean;
  label?: string;
}

// ── TrendLine Renderer (uses target.mediaSize for width) ──
class TrendLineRendererFixed implements IPrimitivePaneRenderer {
  constructor(
    private _p1: { x: number; y: number } | null,
    private _p2: { x: number; y: number } | null,
    private _color: string,
    private _lineWidth: number,
    private _lineStyle: number,
    private _extendRight: boolean,
    private _label: string,
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    if (!this._p1 || !this._p2) return;

    target.useMediaCoordinateSpace(scope => {
      const ctx = scope.context;
      const width = scope.mediaSize.width;
      ctx.save();
      try {
        ctx.beginPath();
        ctx.moveTo(this._p1!.x, this._p1!.y);

        if (this._extendRight) {
          const dx = this._p2!.x - this._p1!.x;
          const dy = this._p2!.y - this._p1!.y;
          if (Math.abs(dx) > 0.001) {
            const extendX = width + 50;
            const extendY = this._p1!.y + dy * ((extendX - this._p1!.x) / dx);
            ctx.lineTo(extendX, extendY);
          } else {
            ctx.lineTo(this._p2!.x, this._p2!.y);
          }
        } else {
          ctx.lineTo(this._p2!.x, this._p2!.y);
        }

        ctx.strokeStyle = this._color;
        ctx.lineWidth = this._lineWidth;
        if (this._lineStyle === 1) ctx.setLineDash([2, 3]);
        else if (this._lineStyle === 2) ctx.setLineDash([6, 4]);
        else ctx.setLineDash([]);
        ctx.stroke();
        ctx.setLineDash([]);

        if (this._label) {
          const labelX = this._extendRight
            ? Math.min(this._p2!.x + 4, width - 60)
            : this._p2!.x + 4;
          ctx.font = 'bold 10px sans-serif';
          ctx.fillStyle = this._color;
          ctx.textAlign = 'left';
          ctx.fillText(this._label, labelX, this._p2!.y - 6);
        }
      } finally {
        ctx.restore();
      }
    });
  }
}

// TrendLinePrimitive - main class
export class TrendLinePrimitive implements ISeriesPrimitive {
  private _paneView: TrendLinePaneViewFinal;
  _param: SeriesAttachedParameter | null = null;
  constructor(public _data: TrendLineData) {
    this._paneView = new TrendLinePaneViewFinal(this);
  }

  attached(param: SeriesAttachedParameter): void { this._param = param; }
  detached(): void { this._param = null; }
  updateAllViews(): void { /* BUG-006 FIX: was empty — updateData() was a no-op. Now requests redraw. */ if (this._param?.requestUpdate) this._param.requestUpdate(); }
  paneViews(): readonly IPrimitivePaneView[] { return [this._paneView] as const; }

  /** Update data in-place without recreating the primitive — prevents flickering */
  updateData(newData: TrendLineData): void {
    this._data = newData;
    this.updateAllViews();
  }

  autoscaleInfo(): AutoscaleInfo | null {
    const min = Math.min(this._data.startPrice, this._data.endPrice);
    const max = Math.max(this._data.startPrice, this._data.endPrice);
    return { priceRange: { minValue: min, maxValue: max }, margins: { above: 10, below: 10 } };
  }
}

// Final pane view for TrendLinePrimitive
class TrendLinePaneViewFinal implements IPrimitivePaneView {
  constructor(private _primitive: TrendLinePrimitive) {}
  zOrder(): 'top' { return 'top'; }

  renderer(): IPrimitivePaneRenderer | null {
    const param = this._primitive._param;
    if (!param) return null;
    const { series, chart } = param;
    const d = this._primitive._data;

    const x1 = chart.timeScale().timeToCoordinate(d.startTime);
    const y1 = series.priceToCoordinate(d.startPrice);
    const x2 = chart.timeScale().timeToCoordinate(d.endTime);
    const y2 = series.priceToCoordinate(d.endPrice);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return null;

    return new TrendLineRendererFixed(
      { x: x1, y: y1 }, { x: x2, y: y2 },
      d.color, d.lineWidth ?? 2, d.lineStyle ?? 0,
      d.extendRight ?? false, d.label ?? '',
    );
  }
}


// ═══════════════════════════════════════════════════════════════════════
// 2. HORIZONTAL LINE PRIMITIVE (for S/R, FVG boundaries, etc.)
// ═══════════════════════════════════════════════════════════════════════

export interface HorizontalLineData {
  price: number;
  color: string;
  lineWidth?: number;
  lineStyle?: number;
  label?: string;
  startTime?: Time; // If set, line starts from this time; otherwise full width
  endTime?: Time;
  showPrice?: boolean; // If true, show price value in the label badge
}

class HorizontalLineRenderer implements IPrimitivePaneRenderer {
  constructor(
    private _y: number | null,
    private _startX: number | null,
    private _endX: number | null,
    private _fullWidth: boolean,
    private _width: number,
    private _color: string,
    private _lineWidth: number,
    private _lineStyle: number,
    private _label: string,
    private _price: number,
    private _showPrice: boolean,
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    if (this._y === null) return;

    target.useMediaCoordinateSpace(scope => {
      const ctx = scope.context;
      ctx.save();
      try {
        const startX = this._fullWidth ? 0 : (this._startX ?? 0);
        const endX = this._fullWidth ? scope.mediaSize.width : (this._endX ?? scope.mediaSize.width);

        // Draw the horizontal line
        ctx.beginPath();
        ctx.moveTo(startX, this._y!);
        ctx.lineTo(endX, this._y!);
        ctx.strokeStyle = this._color;
        ctx.lineWidth = this._lineWidth;
        if (this._lineStyle === 1) ctx.setLineDash([2, 3]);
        else if (this._lineStyle === 2) ctx.setLineDash([6, 4]);
        else ctx.setLineDash([]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw label badge on the LEFT side of the chart
        // MT5/TradingView style: colored badge with text
        if (this._label || this._showPrice) {
          const labelText = this._label || '';
          const priceText = this._showPrice ? (this._price > 999 ? this._price.toFixed(2) : this._price.toFixed(5)) : '';
          const fullText = labelText && priceText ? `${labelText}  ${priceText}` : (labelText || priceText);
          if (!fullText) return;

          ctx.font = 'bold 10px sans-serif';
          const metrics = ctx.measureText(fullText);
          const badgeW = metrics.width + 10;
          const badgeH = 16;
          const badgeX = 4;
          const badgeY = this._y! - badgeH / 2;

          // Badge background with semi-transparent fill
          ctx.fillStyle = this._color + '22';
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3);
          ctx.fill();

          // Badge border
          ctx.strokeStyle = this._color + '55';
          ctx.lineWidth = 1;
          ctx.stroke();

          // Badge text
          ctx.fillStyle = this._color;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(fullText, badgeX + 5, this._y!);
        }
      } finally {
        ctx.restore();
      }
    });
  }
}

class HorizontalLinePaneView implements IPrimitivePaneView {
  constructor(private _primitive: HorizontalLinePrimitive) {}
  zOrder(): 'top' { return 'top'; }

  renderer(): IPrimitivePaneRenderer | null {
    const param = this._primitive._param;
    if (!param) return null;
    const { series, chart } = param;
    const d = this._primitive._data;

    const y = series.priceToCoordinate(d.price);
    if (y === null) return null;

    const startX = d.startTime ? chart.timeScale().timeToCoordinate(d.startTime) : null;
    const endX = d.endTime ? chart.timeScale().timeToCoordinate(d.endTime) : null;
    const fullWidth = !d.startTime && !d.endTime;

    return new HorizontalLineRenderer(
      y, startX, endX, fullWidth, 0,
      d.color, d.lineWidth ?? 1, d.lineStyle ?? 2, d.label ?? '',
      d.price, d.showPrice ?? false,
    );
  }
}

export class HorizontalLinePrimitive implements ISeriesPrimitive {
  private _paneView: HorizontalLinePaneView;
  _param: SeriesAttachedParameter | null = null;
  constructor(public _data: HorizontalLineData) {
    this._paneView = new HorizontalLinePaneView(this);
  }

  attached(param: SeriesAttachedParameter): void { this._param = param; }
  detached(): void { this._param = null; }
  updateAllViews(): void { /* BUG-006 FIX: was empty — updateData() was a no-op. Now requests redraw. */ if (this._param?.requestUpdate) this._param.requestUpdate(); }
  paneViews(): readonly IPrimitivePaneView[] { return [this._paneView] as const; }

  /** Update data in-place without recreating the primitive — prevents flickering */
  updateData(newData: HorizontalLineData): void {
    this._data = newData;
    this.updateAllViews();
  }

  autoscaleInfo(): AutoscaleInfo | null {
    return { priceRange: { minValue: this._data.price, maxValue: this._data.price } };
  }
}


// ═══════════════════════════════════════════════════════════════════════
// 3. SHAPE PRIMITIVE (filled polygons — triangles, channels, etc.)
// ═══════════════════════════════════════════════════════════════════════

export interface ShapeData {
  points: Point[];       // Polygon vertices
  strokeColor: string;
  fillColor: string;
  lineWidth?: number;
  labels?: { text: string; point: Point }[]; // Labels at specific vertices
}

class ShapeRenderer implements IPrimitivePaneRenderer {
  constructor(
    private _pixels: { x: number; y: number }[],
    private _strokeColor: string,
    private _fillColor: string,
    private _lineWidth: number,
    private _labels: { text: string; x: number; y: number }[],
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    if (this._pixels.length < 2) return;

    target.useMediaCoordinateSpace(scope => {
      const ctx = scope.context;
      ctx.save();
      try {
        // Fill
        ctx.beginPath();
        ctx.moveTo(this._pixels[0].x, this._pixels[0].y);
        for (let i = 1; i < this._pixels.length; i++) {
          ctx.lineTo(this._pixels[i].x, this._pixels[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = this._fillColor;
        ctx.fill();

        // Stroke
        ctx.strokeStyle = this._strokeColor;
        ctx.lineWidth = this._lineWidth;
        ctx.stroke();

        // Labels
        for (const label of this._labels) {
          ctx.font = 'bold 11px sans-serif';
          ctx.fillStyle = this._strokeColor;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(label.text, label.x, label.y - 4);
        }
      } finally {
        ctx.restore();
      }
    });
  }
}

class ShapePaneView implements IPrimitivePaneView {
  constructor(private _primitive: ShapePrimitive) {}
  zOrder(): 'top' { return 'top'; }

  renderer(): IPrimitivePaneRenderer | null {
    const param = this._primitive._param;
    if (!param) return null;
    const { series, chart } = param;
    const d = this._primitive._data;

    const pixels: { x: number; y: number }[] = [];
    for (const pt of d.points) {
      const x = chart.timeScale().timeToCoordinate(pt.time);
      const y = series.priceToCoordinate(pt.price);
      if (x === null || y === null) return null;
      pixels.push({ x, y });
    }

    const labels: { text: string; x: number; y: number }[] = [];
    if (d.labels) {
      for (const label of d.labels) {
        const x = chart.timeScale().timeToCoordinate(label.point.time);
        const y = series.priceToCoordinate(label.point.price);
        if (x !== null && y !== null) {
          labels.push({ text: label.text, x, y });
        }
      }
    }

    return new ShapeRenderer(
      pixels, d.strokeColor, d.fillColor, d.lineWidth ?? 1.5, labels,
    );
  }
}

export class ShapePrimitive implements ISeriesPrimitive {
  private _paneView: ShapePaneView;
  _param: SeriesAttachedParameter | null = null;
  constructor(public _data: ShapeData) {
    this._paneView = new ShapePaneView(this);
  }

  attached(param: SeriesAttachedParameter): void { this._param = param; }
  detached(): void { this._param = null; }
  updateAllViews(): void { /* BUG-006 FIX: was empty — updateData() was a no-op. Now requests redraw. */ if (this._param?.requestUpdate) this._param.requestUpdate(); }
  paneViews(): readonly IPrimitivePaneView[] { return [this._paneView] as const; }

  /** Update data in-place without recreating the primitive — prevents flickering */
  updateData(newData: ShapeData): void {
    this._data = newData;
    this.updateAllViews();
  }

  autoscaleInfo(): AutoscaleInfo | null {
    if (this._data.points.length === 0) return null;
    const prices = this._data.points.map(p => p.price);
    return {
      priceRange: { minValue: safeMin(prices), maxValue: safeMax(prices) },
      margins: { above: 10, below: 10 },
    };
  }
}


// ═══════════════════════════════════════════════════════════════════════
// 4. FIBONACCI RETRACEMENT PRIMITIVE
// ═══════════════════════════════════════════════════════════════════════

export interface FibonacciData {
  startTime: Time;
  startPrice: number;   // Swing high (for bearish fib) or swing low (for bullish)
  endTime: Time;
  endPrice: number;     // Swing low (for bearish fib) or swing high (for bullish)
}

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIB_COLORS: Record<string, string> = {
  '0': '#787B86',
  '0.236': '#F23645',
  '0.382': '#FF9800',
  '0.5': OVERLAY_COLORS.fibonacci,
  '0.618': '#FF9800',
  '0.786': '#F23645',
  '1': '#787B86',
};

class FibonacciRenderer implements IPrimitivePaneRenderer {
  constructor(
    private _levels: { y: number; price: number; label: string; color: string }[],
    private _startX: number | null,
    private _endX: number | null,
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    if (this._startX === null || this._endX === null) return;

    target.useMediaCoordinateSpace(scope => {
      const ctx = scope.context;
      const chartWidth = scope.mediaSize.width;
      ctx.save();
      try {
        for (const level of this._levels) {
          // Dashed horizontal line
          ctx.beginPath();
          ctx.moveTo(this._startX!, level.y);
          ctx.lineTo(Math.max(this._endX!, chartWidth), level.y);
          ctx.strokeStyle = level.color;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);

          // Label on the right side
          ctx.font = '10px sans-serif';
          ctx.fillStyle = level.color;
          ctx.textAlign = 'right';
          ctx.fillText(
            `${level.label} (${level.price.toFixed(2)})`,
            Math.max(this._endX!, chartWidth) - 4,
            level.y - 3,
          );
        }
      } finally {
        ctx.restore();
      }
    });
  }
}

class FibonacciPaneView implements IPrimitivePaneView {
  constructor(private _primitive: FibonacciPrimitive) {}
  zOrder(): 'top' { return 'top'; }

  renderer(): IPrimitivePaneRenderer | null {
    const param = this._primitive._param;
    if (!param) return null;
    const { series, chart } = param;
    const d = this._primitive._data;

    const startX = chart.timeScale().timeToCoordinate(d.startTime);
    const endX = chart.timeScale().timeToCoordinate(d.endTime);
    if (startX === null || endX === null) return null;

    const range = d.startPrice - d.endPrice;
    const levels = FIB_LEVELS.map(level => {
      const price = d.startPrice - range * level;
      const y = series.priceToCoordinate(price);
      return {
        y: y ?? 0,
        price,
        label: `${(level * 100).toFixed(1)}%`,
        color: FIB_COLORS[String(level)] ?? '#787B86',
      };
    }).filter(l => l.y !== null);

    return new FibonacciRenderer(levels, startX, endX);
  }
}

export class FibonacciPrimitive implements ISeriesPrimitive {
  private _paneView: FibonacciPaneView;
  _param: SeriesAttachedParameter | null = null;
  constructor(public _data: FibonacciData) {
    this._paneView = new FibonacciPaneView(this);
  }

  attached(param: SeriesAttachedParameter): void { this._param = param; }
  detached(): void { this._param = null; }
  updateAllViews(): void { /* BUG-006 FIX: was empty — updateData() was a no-op. Now requests redraw. */ if (this._param?.requestUpdate) this._param.requestUpdate(); }
  paneViews(): readonly IPrimitivePaneView[] { return [this._paneView] as const; }

  /** Update data in-place without recreating the primitive — prevents flickering */
  updateData(newData: FibonacciData): void {
    this._data = newData;
    this.updateAllViews();
  }

  autoscaleInfo(): AutoscaleInfo | null {
    return {
      priceRange: {
        minValue: Math.min(this._data.startPrice, this._data.endPrice),
        maxValue: Math.max(this._data.startPrice, this._data.endPrice),
      },
    };
  }
}


// ═══════════════════════════════════════════════════════════════════════
// 5. LABEL / MARKER PRIMITIVE (text at specific time+price)
// ═══════════════════════════════════════════════════════════════════════

export interface LabelData {
  time: Time;
  price: number;
  text: string;
  color: string;
  fontSize?: number;
  align?: 'left' | 'center' | 'right';
  bg?: string; // Background color
  position?: 'above' | 'below' | 'inline';
}

class LabelRenderer implements IPrimitivePaneRenderer {
  constructor(
    private _x: number | null,
    private _y: number | null,
    private _text: string,
    private _color: string,
    private _fontSize: number,
    private _align: 'left' | 'center' | 'right',
    private _bg: string | null,
    private _position: 'above' | 'below' | 'inline',
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    if (this._x === null || this._y === null) return;

    target.useMediaCoordinateSpace(scope => {
      const ctx = scope.context;
      ctx.save();
      try {
        let y = this._y!;
        if (this._position === 'above') y -= 12;
        else if (this._position === 'below') y += 16;

        ctx.font = `bold ${this._fontSize}px sans-serif`;
        ctx.textAlign = this._align;
        ctx.textBaseline = 'middle';

        // Background pill
        if (this._bg) {
          const metrics = ctx.measureText(this._text);
          const w = metrics.width + 8;
          const h = this._fontSize + 6;
          const rx = this._align === 'center' ? this._x! - w / 2 :
                     this._align === 'right' ? this._x! - w : this._x! - 4;
          ctx.fillStyle = this._bg;
          ctx.beginPath();
          ctx.roundRect(rx, y - h / 2, w, h, 3);
          ctx.fill();
        }

        ctx.fillStyle = this._color;
        ctx.fillText(this._text, this._x!, y);
      } finally {
        ctx.restore();
      }
    });
  }
}

class LabelPaneView implements IPrimitivePaneView {
  constructor(private _primitive: LabelPrimitive) {}
  zOrder(): 'top' { return 'top'; }

  renderer(): IPrimitivePaneRenderer | null {
    const param = this._primitive._param;
    if (!param) return null;
    const { series, chart } = param;
    const d = this._primitive._data;

    const x = chart.timeScale().timeToCoordinate(d.time);
    const y = series.priceToCoordinate(d.price);
    if (x === null || y === null) return null;

    return new LabelRenderer(
      x, y, d.text, d.color, d.fontSize ?? 11,
      d.align ?? 'center', d.bg ?? null, d.position ?? 'above',
    );
  }
}

export class LabelPrimitive implements ISeriesPrimitive {
  private _paneView: LabelPaneView;
  _param: SeriesAttachedParameter | null = null;
  constructor(public _data: LabelData) {
    this._paneView = new LabelPaneView(this);
  }

  attached(param: SeriesAttachedParameter): void { this._param = param; }
  detached(): void { this._param = null; }
  updateAllViews(): void { /* BUG-006 FIX: was empty — updateData() was a no-op. Now requests redraw. */ if (this._param?.requestUpdate) this._param.requestUpdate(); }
  paneViews(): readonly IPrimitivePaneView[] { return [this._paneView] as const; }

  /** Update data in-place without recreating the primitive — prevents flickering */
  updateData(newData: LabelData): void {
    this._data = newData;
    this.updateAllViews();
  }
}


// ═══════════════════════════════════════════════════════════════════════
// 6. ZONE PRIMITIVE (filled rectangle between two price levels)
// ═══════════════════════════════════════════════════════════════════════

export interface ZoneData {
  startTime: Time;
  endTime: Time;
  highPrice: number;
  lowPrice: number;
  fillColor: string;
  borderColor?: string;
  label?: string;
}

class ZoneRenderer implements IPrimitivePaneRenderer {
  constructor(
    private _x1: number | null,
    private _x2: number | null,
    private _y1: number | null,
    private _y2: number | null,
    private _fillColor: string,
    private _borderColor: string | null,
    private _label: string,
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    if (!this._x1 || !this._x2 || !this._y1 || !this._y2) return;

    target.useMediaCoordinateSpace(scope => {
      const ctx = scope.context;
      ctx.save();
      try {
        const x = Math.min(this._x1!, this._x2!);
        const y = Math.min(this._y1!, this._y2!);
        const w = Math.abs(this._x2! - this._x1!);
        const h = Math.abs(this._y2! - this._y1!);

        ctx.fillStyle = this._fillColor;
        ctx.fillRect(x, y, w, h);

        if (this._borderColor) {
          ctx.strokeStyle = this._borderColor;
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, w, h);
        }

        if (this._label) {
          ctx.font = 'bold 9px sans-serif';
          ctx.fillStyle = this._borderColor ?? '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(this._label, x + w / 2, y + h / 2);
        }
      } finally {
        ctx.restore();
      }
    });
  }
}

class ZonePaneView implements IPrimitivePaneView {
  constructor(private _primitive: ZonePrimitive) {}
  zOrder(): 'normal' { return 'normal'; }

  renderer(): IPrimitivePaneRenderer | null {
    const param = this._primitive._param;
    if (!param) return null;
    const { series, chart } = param;
    const d = this._primitive._data;

    const x1 = chart.timeScale().timeToCoordinate(d.startTime);
    const x2 = chart.timeScale().timeToCoordinate(d.endTime);
    const y1 = series.priceToCoordinate(d.highPrice);
    const y2 = series.priceToCoordinate(d.lowPrice);
    if (x1 === null || x2 === null || y1 === null || y2 === null) return null;

    return new ZoneRenderer(x1, x2, y1, y2, d.fillColor, d.borderColor ?? null, d.label ?? '');
  }
}

export class ZonePrimitive implements ISeriesPrimitive {
  private _paneView: ZonePaneView;
  _param: SeriesAttachedParameter | null = null;
  constructor(public _data: ZoneData) {
    this._paneView = new ZonePaneView(this);
  }

  attached(param: SeriesAttachedParameter): void { this._param = param; }
  detached(): void { this._param = null; }
  updateAllViews(): void { /* BUG-006 FIX: was empty — updateData() was a no-op. Now requests redraw. */ if (this._param?.requestUpdate) this._param.requestUpdate(); }
  paneViews(): readonly IPrimitivePaneView[] { return [this._paneView] as const; }

  /** Update data in-place without recreating the primitive — prevents flickering */
  updateData(newData: ZoneData): void {
    this._data = newData;
    this.updateAllViews();
  }

  autoscaleInfo(): AutoscaleInfo | null {
    return {
      priceRange: { minValue: this._data.lowPrice, maxValue: this._data.highPrice },
    };
  }
}


// ═══════════════════════════════════════════════════════════════════════
// 7. ALERT MARKER PRIMITIVE — Visual alert badges on the chart
// Shows a colored pin/badge at the detection point with pattern name
// and direction arrow. Pulses briefly when first drawn.
// ═══════════════════════════════════════════════════════════════════════

export interface AlertMarkerData {
  time: Time;
  price: number;
  label: string;           // e.g. "BOS↑", "FVG↓", "H&S"
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;      // 0-1
  type: string;            // Pattern type for coloring
}

class AlertMarkerRenderer implements IPrimitivePaneRenderer {
  constructor(
    private _x: number | null,
    private _y: number | null,
    private _label: string,
    private _direction: 'bullish' | 'bearish' | 'neutral',
    private _confidence: number,
    private _type: string,
    private _timestamp: number, // For pulse animation
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    if (this._x === null || this._y === null) return;

    target.useMediaCoordinateSpace(scope => {
      const ctx = scope.context;
      ctx.save();
      try {
        const x = this._x!;
        const y = this._y!;

        // Color based on direction
        const isBull = this._direction === 'bullish';
        const isBear = this._direction === 'bearish';
        const pinColor = isBull ? '#10b981' : isBear ? '#ef4444' : T.warning;
        const bgColor = isBull ? 'rgba(16, 185, 129, 0.15)' : isBear ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)';
        const borderColor = isBull ? 'rgba(16, 185, 129, 0.6)' : isBear ? 'rgba(239, 68, 68, 0.6)' : 'rgba(245, 158, 11, 0.6)';

        // Pulse effect: expand and fade for 2 seconds after creation
        const age = Date.now() - this._timestamp;
        if (age < 2000) {
          const progress = age / 2000;
          const pulseRadius = 12 + progress * 18;
          const pulseAlpha = (1 - progress) * 0.4;
          ctx.beginPath();
          ctx.arc(x, y - 14, pulseRadius, 0, Math.PI * 2);
          ctx.fillStyle = isBull ? `rgba(16,185,129,${pulseAlpha})` : isBear ? `rgba(239,68,68,${pulseAlpha})` : `rgba(245,158,11,${pulseAlpha})`;
          ctx.fill();
        }

        // Pin circle (filled)
        const pinY = y - 14;
        const pinRadius = 8;
        ctx.beginPath();
        ctx.arc(x, pinY, pinRadius, 0, Math.PI * 2);
        ctx.fillStyle = pinColor;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Direction arrow inside pin
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        if (isBull) ctx.fillText('▲', x, pinY);
        else if (isBear) ctx.fillText('▼', x, pinY);
        else ctx.fillText('◆', x, pinY);

        // Pin stem (small triangle pointing down to the price)
        ctx.beginPath();
        ctx.moveTo(x - 3, pinY + pinRadius - 1);
        ctx.lineTo(x + 3, pinY + pinRadius - 1);
        ctx.lineTo(x, y - 2);
        ctx.closePath();
        ctx.fillStyle = pinColor;
        ctx.fill();

        // Label badge next to pin
        if (this._label) {
          ctx.font = 'bold 8px sans-serif';
          const metrics = ctx.measureText(this._label);
          const badgeW = metrics.width + 8;
          const badgeH = 14;
          const badgeX = x + pinRadius + 3;
          const badgeY = pinY - badgeH / 2;

          // Badge background
          ctx.fillStyle = bgColor;
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3);
          ctx.fill();
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = 0.5;
          ctx.stroke();

          // Badge text
          ctx.fillStyle = pinColor;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(this._label, badgeX + 4, badgeY + badgeH / 2);
        }

        // Confidence bar under pin
        const barW = 16;
        const barH = 2;
        const barX = x - barW / 2;
        const barY = pinY + pinRadius + 4;
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = pinColor;
        ctx.fillRect(barX, barY, barW * this._confidence, barH);
      } finally {
        ctx.restore();
      }
    });
  }
}

class AlertMarkerPaneView implements IPrimitivePaneView {
  constructor(private _primitive: AlertMarkerPrimitive) {}
  zOrder(): 'top' { return 'top'; }

  renderer(): IPrimitivePaneRenderer | null {
    const param = this._primitive._param;
    if (!param) return null;
    const { series, chart } = param;
    const d = this._primitive._data;

    const x = chart.timeScale().timeToCoordinate(d.time);
    const y = series.priceToCoordinate(d.price);
    if (x === null || y === null) return null;

    return new AlertMarkerRenderer(
      x, y, d.label, d.direction, d.confidence, d.type,
      this._primitive._createdAt,
    );
  }
}

export class AlertMarkerPrimitive implements ISeriesPrimitive {
  private _paneView: AlertMarkerPaneView;
  _param: SeriesAttachedParameter | null = null;
  _createdAt: number = Date.now();

  constructor(public _data: AlertMarkerData) {
    this._paneView = new AlertMarkerPaneView(this);
  }

  attached(param: SeriesAttachedParameter): void { this._param = param; }
  detached(): void { this._param = null; }
  updateAllViews(): void { /* BUG-006 FIX: was empty — updateData() was a no-op. Now requests redraw. */ if (this._param?.requestUpdate) this._param.requestUpdate(); }
  paneViews(): readonly IPrimitivePaneView[] { return [this._paneView] as const; }

  /** Update data in-place without recreating the primitive — prevents flickering */
  updateData(newData: AlertMarkerData): void {
    this._data = newData;
    this.updateAllViews();
  }
}
