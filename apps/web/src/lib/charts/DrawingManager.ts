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

  // V253 FIX: Cross-timeframe drawing support.
  // Tracks which localStorage bucket each drawing came from, so we can:
  // 1. Load all-tf drawings from other timeframe buckets
  // 2. Save changes back to the correct bucket
  // 3. Move drawings between buckets when scope changes
  private drawingBucket: Map<string, string> = new Map();
  // Tracks all buckets we loaded from (so we can update them on save,
  // even if drawings were deleted or moved out)
  private loadedBuckets: Set<string> = new Set();

  constructor(symbol: string, timeframe?: string, userId?: string) {
    this.symbol = symbol;
    this.timeframe = timeframe || '';
    this.userId = userId;
    this.loadFromStorage();
  }

  // ── CRUD Operations ────────────────────────────────────

  create(type: DrawingTool, points: DrawingPoint[], color: string = '#fbbf24', lineWidth: number = 1.5, opacity: number = 0.8, lineStyle: Drawing['lineStyle'] = 'solid', scope: Drawing['scope'] = 'all-tf'): Drawing {
    const drawing: Drawing = {
      id: `draw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      points,
      color,
      lineWidth,
      opacity,
      lineStyle,
      symbol: this.symbol,
      createdAt: Date.now(),
      scope,
      timeframe: this.timeframe || undefined,
    };
    this.drawings.set(drawing.id, drawing);
    // V253: New drawings belong to the current timeframe bucket
    this.drawingBucket.set(drawing.id, this.getStorageKey());
    this.saveToStorage();
    return drawing;
  }

  update(id: string, updates: Partial<Pick<Drawing, 'points' | 'color' | 'lineWidth' | 'opacity' | 'lineStyle' | 'scope' | 'timeframe'>>): Drawing | null {
    const drawing = this.drawings.get(id);
    if (!drawing) return null;

    // V253: When scope changes to single-tf, update timeframe to current TF
    // and move the drawing to the current timeframe bucket. This ensures:
    // - The drawing is visible only on the current TF
    // - The drawing is stored in the current TF's bucket
    // - The old bucket is updated to remove this drawing
    if (updates.scope === 'single-tf' && drawing.scope !== 'single-tf') {
      updates.timeframe = this.timeframe || undefined;
      this.drawingBucket.set(id, this.getStorageKey());
    }

    Object.assign(drawing, updates);
    this.saveToStorage();
    return drawing;
  }

  delete(id: string): boolean {
    const deleted = this.drawings.delete(id);
    this.drawingBucket.delete(id);
    if (deleted) this.saveToStorage();
    return deleted;
  }

  get(id: string): Drawing | null {
    return this.drawings.get(id) ?? null;
  }

  getAll(): Drawing[] {
    return Array.from(this.drawings.values());
  }

  /** Get only drawings that should be visible on the current timeframe */
  getVisibleOnTimeframe(tf: string): Drawing[] {
    return this.getAll().filter(d =>
      d.scope === 'all-tf' || d.timeframe === tf
    );
  }

  clearAll(): void {
    // V253: Only clear drawings belonging to the current timeframe bucket.
    // Cross-timeframe all-tf drawings from other buckets should be preserved.
    const currentKey = this.getStorageKey();
    const toDelete: string[] = [];
    for (const [id, bucket] of this.drawingBucket) {
      if (bucket === currentKey) {
        toDelete.push(id);
      }
    }
    for (const id of toDelete) {
      this.drawings.delete(id);
      this.drawingBucket.delete(id);
    }
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
    this.drawingBucket.clear();
    this.loadedBuckets.clear();
    this.loadFromStorage();
  }

  /** Set only the timeframe (when symbol stays the same but timeframe changes).
   * V253 FIX: Removed early return — always reload to ensure cross-TF
   * drawings are properly loaded even when switching back to the same TF. */
  setTimeframe(timeframe: string): void {
    this.timeframe = timeframe;
    this.drawings.clear();
    this.drawingBucket.clear();
    this.loadedBuckets.clear();
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
      const currentKey = this.getStorageKey();

      // V253: Save drawings grouped by their source bucket.
      // This correctly handles:
      // 1. Current TF drawings → saved to current bucket
      // 2. Cross-TF all-tf drawings → saved back to their original bucket
      // 3. Drawings moved between buckets (scope change) → saved to new bucket

      // Step 1: Save ALL current-bucket drawings (we loaded all of them, so safe to overwrite)
      const currentBucketDrawings: Drawing[] = [];
      const otherBucketDrawings: Map<string, Drawing[]> = new Map();

      for (const [id, drawing] of this.drawings) {
        const bucket = this.drawingBucket.get(id) || currentKey;
        if (bucket === currentKey) {
          currentBucketDrawings.push(drawing);
        } else {
          if (!otherBucketDrawings.has(bucket)) otherBucketDrawings.set(bucket, []);
          otherBucketDrawings.get(bucket)!.push(drawing);
        }
      }

      // Overwrite current bucket completely (we loaded all its drawings)
      allDrawings[currentKey] = currentBucketDrawings;

      // Step 2: For other loaded buckets, merge our all-tf drawings with
      // their existing single-tf drawings (which we didn't load into memory)
      for (const bucket of this.loadedBuckets) {
        if (bucket === currentKey) continue;

        // Get existing single-tf drawings from this bucket that we didn't load
        const existingInBucket = allDrawings[bucket] || [];
        const singleTfDrawings = existingInBucket.filter(d => d.scope !== 'all-tf');

        // Get our in-memory all-tf drawings for this bucket
        const ourAllTfDrawings = otherBucketDrawings.get(bucket) || [];

        // Merge: single-tf (untouched) + our all-tf (possibly modified/moved)
        const merged = [...singleTfDrawings, ...ourAllTfDrawings];
        if (merged.length === 0) {
          delete allDrawings[bucket];
        } else {
          allDrawings[bucket] = merged;
        }
      }

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

      // V253 FIX: Load drawings from BOTH the current timeframe bucket
      // AND all-tf drawings from other timeframe buckets for the same symbol.
      // Previously, only the current bucket was loaded, meaning all-tf drawings
      // created on other timeframes were invisible — making the "All TF" option
      // in the context menu non-functional.

      const currentKey = this.getStorageKey();
      this.drawings.clear();
      this.drawingBucket.clear();
      this.loadedBuckets.clear();

      // Load ALL drawings from the current timeframe bucket
      const currentDrawings = allDrawings[currentKey] || [];
      this.loadedBuckets.add(currentKey);
      currentDrawings.forEach(d => {
        // Backfill lineStyle for drawings saved before this feature existed
        if (!d.lineStyle) d.lineStyle = 'solid';
        // Backfill scope for drawings saved before this feature existed
        if (!d.scope) d.scope = 'all-tf';
        this.drawings.set(d.id, d);
        this.drawingBucket.set(d.id, currentKey);
      });

      // Load all-tf drawings from OTHER timeframe buckets for the same symbol.
      // This is what makes the "All TF" visibility feature actually work.
      const symbolPrefix = `${this.symbol}:`;
      let crossTfCount = 0;
      for (const [key, drawings] of Object.entries(allDrawings)) {
        if (key === currentKey) continue;
        // Only scan buckets belonging to the same symbol
        if (!key.startsWith(symbolPrefix) && key !== this.symbol) continue;
        if (!drawings || drawings.length === 0) continue;

        this.loadedBuckets.add(key);
        for (const d of drawings) {
          // V253 FIX: Backfill scope BEFORE checking it!
          // Drawings saved before the scope feature was added have no scope property,
          // so d.scope would be undefined, which fails the 'all-tf' check.
          if (!d.scope) d.scope = 'all-tf';
          if (!d.lineStyle) d.lineStyle = 'solid';

          // Only load all-tf drawings (single-tf drawings belong to their own TF only)
          if (d.scope === 'all-tf' && !this.drawings.has(d.id)) {
            this.drawings.set(d.id, d);
            this.drawingBucket.set(d.id, key);
            crossTfCount++;
          }
        }
      }

      console.log(`[DrawingManager] Loaded ${this.drawings.size} drawings for ${currentKey} (${crossTfCount} cross-TF from ${this.loadedBuckets.size} buckets)`);
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
      const currentKey = this.getStorageKey();
      drawings.forEach(d => {
        // Backfill scope for imported drawings
        if (!d.scope) d.scope = 'all-tf';
        if (!d.lineStyle) d.lineStyle = 'solid';
        this.drawings.set(d.id, d);
        // V253: Assign imported drawings to the appropriate bucket
        const bucket = d.timeframe ? `${d.symbol}:${d.timeframe}` : currentKey;
        this.drawingBucket.set(d.id, bucket);
        // Track loaded bucket
        this.loadedBuckets.add(bucket);
      });
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
