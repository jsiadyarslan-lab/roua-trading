// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Drawing Manager
// Manages chart drawings (create, delete, modify, persist)
// ═══════════════════════════════════════════════════════════

import type { Drawing, DrawingTool, DrawingPoint } from './types';

// M2 FIX: Replaced synchronous require() with a parameter-based approach.
// The old getStorageKey() used require('@/lib/auth-store') which is:
// 1. Synchronous CommonJS inside ESM — breaks Next.js bundling/tree-shaking
// 2. Can fail silently in edge runtime or before Zustand hydrates
// Now, userId is passed explicitly from the React layer where it's available.
// The fallback chain still checks localStorage cache for pre-hydration scenarios.

/**
 * Get a user-isolated localStorage key for chart drawings.
 * @param userId - Optional user ID from the React component layer.
 *   If not provided, falls back to localStorage cache, then guest.
 */
function getStorageKey(userId?: string): string {
  // Priority 1: Explicit userId parameter (most reliable, from React layer)
  if (userId) return `roua-chart-drawings:${userId}`;

  // Priority 2: Read from localStorage cache (available before Zustand hydrates)
  try {
    const cachedRaw = localStorage.getItem('roua_auth_user')
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw)
      if (cached?.id) return `roua-chart-drawings:${cached.id}`
    }
  } catch { /* Cache unavailable */ }

  // Priority 3: Guest/fallback
  return 'roua-chart-drawings:guest'
}

// Legacy static key — used ONLY for migration from old format
const LEGACY_STORAGE_KEY = 'roua-chart-drawings'

export class DrawingManager {
  private drawings: Map<string, Drawing> = new Map();
  private symbol: string = '';
  // H2+H15 FIX: Track timeframe so drawings are stored per-symbol:timeframe.
  // Previously, drawings were stored per-symbol only, meaning switching from
  // BTC/USDT 15min to BTC/USDT 1H would show 15min drawings at wrong positions.
  private timeframe: string = '';
  // M2 FIX: Store userId from React layer instead of using require().
  private userId: string | undefined;

  constructor(symbol: string, timeframe?: string, userId?: string) {
    this.symbol = symbol;
    this.timeframe = timeframe || '';
    this.userId = userId;
    this.loadFromStorage();
  }

  // ── CRUD Operations ────────────────────────────────────

  create(type: DrawingTool, points: DrawingPoint[], color: string = '#fbbf24', lineWidth: number = 1.5, opacity: number = 0.8): Drawing {
    const drawing: Drawing = {
      id: `draw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      points,
      color,
      lineWidth,
      opacity,
      symbol: this.symbol,
      createdAt: Date.now(),
    };
    this.drawings.set(drawing.id, drawing);
    this.saveToStorage();
    return drawing;
  }

  update(id: string, updates: Partial<Pick<Drawing, 'points' | 'color' | 'lineWidth' | 'opacity'>>): Drawing | null {
    const drawing = this.drawings.get(id);
    if (!drawing) return null;
    Object.assign(drawing, updates);
    this.saveToStorage();
    return drawing;
  }

  delete(id: string): boolean {
    const deleted = this.drawings.delete(id);
    if (deleted) this.saveToStorage();
    return deleted;
  }

  get(id: string): Drawing | null {
    return this.drawings.get(id) ?? null;
  }

  getAll(): Drawing[] {
    return Array.from(this.drawings.values());
  }

  clearAll(): void {
    this.drawings.clear();
    this.saveToStorage();
  }

  // ── Symbol Management ──────────────────────────────────

  /** H2+H15 FIX: Set both symbol AND timeframe together.
   * Drawings are now keyed by `${symbol}:${timeframe}`, so changing
   * either one loads the correct set of drawings. */
  setSymbol(symbol: string, timeframe?: string): void {
    this.symbol = symbol;
    if (timeframe !== undefined) this.timeframe = timeframe;
    this.drawings.clear();
    this.loadFromStorage();
  }

  /** Set only the timeframe (when symbol stays the same but timeframe changes) */
  setTimeframe(timeframe: string): void {
    if (this.timeframe === timeframe) return;
    this.timeframe = timeframe;
    this.drawings.clear();
    this.loadFromStorage();
  }

  /** Get the composite storage key for the current symbol+timeframe */
  private getStorageKey(): string {
    return this.timeframe ? `${this.symbol}:${this.timeframe}` : this.symbol;
  }

  // ── Persistence ────────────────────────────────────────

  private saveToStorage(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const allDrawings = this.getAllStoredDrawings();
      const symbolDrawings = this.getAll();
      // H2 FIX: Use composite key (symbol:timeframe) instead of just symbol
      allDrawings[this.getStorageKey()] = symbolDrawings;
      // M2: Pass userId to getStorageKey instead of using require()
      const json = JSON.stringify(allDrawings);
      localStorage.setItem(getStorageKey(this.userId), json);
      // FIX: Verify the write succeeded by reading back and comparing length
      const verify = localStorage.getItem(getStorageKey(this.userId));
      return verify !== null && verify.length === json.length;
    } catch {
      // localStorage might be full or unavailable
      return false;
    }
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      let allDrawings = this.getAllStoredDrawings();

      // MIGRATION: If user-isolated key is empty but legacy key has data,
      // migrate the data to the new key for this user.
      if (Object.keys(allDrawings).length === 0) {
        try {
          const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
          if (legacyRaw) {
            const legacyData = JSON.parse(legacyRaw);
            if (legacyData && Object.keys(legacyData).length > 0) {
              allDrawings = legacyData;
              // FIX: Save to user-isolated key FIRST, then verify before deleting legacy
              const json = JSON.stringify(legacyData);
              localStorage.setItem(getStorageKey(this.userId), json);
              // Only remove the legacy key after confirming the new key was written
              const verify = localStorage.getItem(getStorageKey(this.userId));
              if (verify !== null && verify.length === json.length) {
                localStorage.removeItem(LEGACY_STORAGE_KEY);
              }
            }
          }
        } catch { /* Legacy data corrupted — skip migration */ }
      }

      // H2 FIX: Load drawings by composite key (symbol:timeframe)
      const symbolDrawings = allDrawings[this.getStorageKey()] || [];
      this.drawings.clear();
      symbolDrawings.forEach(d => this.drawings.set(d.id, d));
    } catch {
      // Corrupted data — start fresh
    }
  }

  private getAllStoredDrawings(): Record<string, Drawing[]> {
    try {
      // M2: Pass userId to getStorageKey instead of using require()
      const raw = localStorage.getItem(getStorageKey(this.userId));
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  // ── Export/Import ──────────────────────────────────────

  exportDrawings(): string {
    return JSON.stringify(this.getAll());
  }

  importDrawings(json: string): boolean {
    try {
      const drawings: Drawing[] = JSON.parse(json);
      drawings.forEach(d => this.drawings.set(d.id, d));
      this.saveToStorage();
      return true;
    } catch {
      return false;
    }
  }

  // ── Point Validation ───────────────────────────────────

  static requiredPoints(tool: DrawingTool): number {
    switch (tool) {
      case 'cursor':            return 0;
      case 'horizontal':        return 1;
      case 'horizontal-ray':    return 1;
      case 'vertical':          return 1;
      case 'x-marker':          return 1;
      case 'price-label':       return 1;
      case 'note':              return 1;
      // ── 2-point tools ──
      case 'trendline':         return 2;
      case 'ray':               return 2;
      case 'info-line':         return 2;
      case 'extended-line':     return 2;
      case 'trend-angle':       return 2;
      case 'cross-line':        return 2;
      case 'fibonacci':         return 2;
      case 'fib-extension':     return 2;
      case 'fib-fan':           return 2;
      case 'fib-spiral':        return 2;
      case 'fib-wedge':         return 2;
      case 'fib-time-zone':     return 2;
      case 'rectangle':         return 2;
      case 'circle':            return 2;
      case 'ellipse':           return 2;
      case 'arrow':             return 2;
      case 'price-range':       return 2;
      case 'text-annotation':   return 2;
      case 'disjoint-channel':  return 2;
      case 'flat-top-bottom':   return 2;
      case 'gann-box':          return 2;
      case 'gann-square':       return 2;
      // ── 3-point tools ──
      case 'channel':           return 3;
      case 'triangle':          return 3;
      case 'regression-trend':  return 3;
      case 'andrews-pitchfork': return 3;
      case 'schiff-pitchfork':  return 3;
      case 'modified-schiff':   return 3;
      // H13 FIX: Gann Fan originates from a single pivot point.
      // Previously required 3 clicks but only used the first point, creating
      // confusing UX where 2 extra clicks were needed for no purpose.
      case 'gann-fan':          return 1;
      default:                  return 0;
    }
  }

  static getToolLabel(tool: DrawingTool): { ar: string; en: string } {
    const labels: Record<DrawingTool, { ar: string; en: string }> = {
      'cursor':            { ar: 'مؤشر',                en: 'Cursor' },
      // Lines
      'trendline':         { ar: 'خط اتجاه',             en: 'Trend Line' },
      'ray':               { ar: 'شعاع',                en: 'Ray' },
      'info-line':         { ar: 'خط معلوماتي',          en: 'Info Line' },
      'extended-line':     { ar: 'خط ممتد',             en: 'Extended Line' },
      'trend-angle':       { ar: 'خط اتجاه بزاوية',      en: 'Trend Angle' },
      'horizontal':        { ar: 'خط أفقي',             en: 'Horizontal Line' },
      'horizontal-ray':    { ar: 'شعاع أفقي',            en: 'Horizontal Ray' },
      'vertical':          { ar: 'خط رأسي',             en: 'Vertical Line' },
      'cross-line':        { ar: 'خط متقاطع',            en: 'Cross Line' },
      // Channels
      'channel':           { ar: 'قناة متوازية',          en: 'Parallel Channel' },
      'regression-trend':  { ar: 'اتجاه انحدار',          en: 'Regression Trend' },
      'flat-top-bottom':   { ar: 'قمة/قاع مسطحة',         en: 'Flat Top/Bottom' },
      'disjoint-channel':  { ar: 'قناة منفصلة',           en: 'Disjoint Channel' },
      // Forks
      'andrews-pitchfork': { ar: 'شوكة أندروز',           en: 'Andrews Pitchfork' },
      'schiff-pitchfork':  { ar: 'شوكة شيف',             en: 'Schiff Pitchfork' },
      'modified-schiff':   { ar: 'شوكة شيف معدلة',        en: 'Modified Schiff' },
      // Fibonacci
      'fibonacci':         { ar: 'فيبوناتشي ارتداد',      en: 'Fib Retracement' },
      'fib-extension':     { ar: 'فيبوناتشي امتداد',      en: 'Fib Extension' },
      'fib-fan':           { ar: 'مروحة فيبوناتشي',       en: 'Fib Fan' },
      'fib-spiral':        { ar: 'حلزون فيبوناتشي',       en: 'Fib Spiral' },
      'fib-wedge':         { ar: 'إسفين فيبوناتشي',       en: 'Fib Wedge' },
      'fib-time-zone':     { ar: 'مناطق زمنية فيبوناتشي',   en: 'Fib Time Zone' },
      // Gann
      'gann-box':          { ar: 'صندوق جان',            en: 'Gann Box' },
      'gann-square':       { ar: 'مربع جان',             en: 'Gann Square' },
      'gann-fan':          { ar: 'مروحة جان',            en: 'Gann Fan' },
      // Shapes
      'rectangle':         { ar: 'مستطيل',              en: 'Rectangle' },
      'triangle':          { ar: 'مثلث',                en: 'Triangle' },
      'circle':            { ar: 'دائرة',               en: 'Circle' },
      'ellipse':           { ar: 'قطع ناقص',             en: 'Ellipse' },
      // Annotations
      'text-annotation':   { ar: 'تعليق نصي',            en: 'Text Annotation' },
      'price-label':       { ar: 'تسمية سعرية',           en: 'Price Label' },
      'note':              { ar: 'ملاحظة',               en: 'Note' },
      // Markers
      'x-marker':          { ar: 'علامة X',              en: 'X Mark' },
      'arrow':             { ar: 'سهم',                  en: 'Arrow' },
      'price-range':       { ar: 'نطاق سعري',            en: 'Price Range' },
    };
    return labels[tool] || { ar: tool, en: tool };
  }

  static getToolIcon(tool: DrawingTool): string {
    const icons: Record<DrawingTool, string> = {
      'cursor':            '↖',
      // Lines
      'trendline':         '╱',
      'ray':               '⟋',
      'info-line':         'ℹ',
      'extended-line':     '⟶',
      'trend-angle':       '∡',
      'horizontal':        '━',
      'horizontal-ray':    '⟶',
      'vertical':          '┃',
      'cross-line':        '╋',
      // Channels
      'channel':           '║',
      'regression-trend':  '📈',
      'flat-top-bottom':   '⬒',
      'disjoint-channel':  '║',
      // Forks
      'andrews-pitchfork': '🔱',
      'schiff-pitchfork':  '🔱',
      'modified-schiff':   '🔱',
      // Fibonacci
      'fibonacci':         '⬡',
      'fib-extension':     '⬡',
      'fib-fan':           '🎷',
      'fib-spiral':        '🌀',
      'fib-wedge':         '◭',
      'fib-time-zone':     '⏱',
      // Gann
      'gann-box':          '⬜',
      'gann-square':       '🔲',
      'gann-fan':          '🏮',
      // Shapes
      'rectangle':         '▭',
      'triangle':          '△',
      'circle':            '○',
      'ellipse':           '⬭',
      // Annotations
      'text-annotation':   '💬',
      'price-label':       '🏷',
      'note':              '📌',
      // Markers
      'x-marker':          '✕',
      'arrow':             '→',
      'price-range':       '⇳',
    };
    return icons[tool] || '?';
  }
}
