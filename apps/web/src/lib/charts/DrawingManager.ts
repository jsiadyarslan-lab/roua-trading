// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Drawing Manager
// Manages chart drawings (create, delete, modify, persist)
// ═══════════════════════════════════════════════════════════

import type { Drawing, DrawingTool, DrawingPoint } from './types';

/**
 * Get a user-isolated localStorage key for chart drawings.
 * Uses userId from auth store to prevent data leakage between
 * users on shared browsers (libraries, offices, kiosks).
 */
function getStorageKey(): string {
  // Priority 1: Read from auth store (most reliable)
  try {
    const { useAuthStore } = require('@/lib/auth-store')
    const user = useAuthStore.getState()?.user
    if (user?.id) return `roua-chart-drawings:${user.id}`
  } catch { /* Auth store not loaded yet */ }

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

  constructor(symbol: string) {
    this.symbol = symbol;
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

  setSymbol(symbol: string): void {
    this.symbol = symbol;
    this.drawings.clear();
    this.loadFromStorage();
  }

  // ── Persistence ────────────────────────────────────────

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const allDrawings = this.getAllStoredDrawings();
      const symbolDrawings = this.getAll();
      allDrawings[this.symbol] = symbolDrawings;
      localStorage.setItem(getStorageKey(), JSON.stringify(allDrawings));
    } catch {
      // localStorage might be full or unavailable
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
              // Save to user-isolated key
              localStorage.setItem(getStorageKey(), JSON.stringify(legacyData));
              // Remove legacy key to prevent re-migration
              localStorage.removeItem(LEGACY_STORAGE_KEY);
            }
          }
        } catch { /* Legacy data corrupted — skip migration */ }
      }

      const symbolDrawings = allDrawings[this.symbol] || [];
      this.drawings.clear();
      symbolDrawings.forEach(d => this.drawings.set(d.id, d));
    } catch {
      // Corrupted data — start fresh
    }
  }

  private getAllStoredDrawings(): Record<string, Drawing[]> {
    try {
      const raw = localStorage.getItem(getStorageKey());
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
      case 'gann-fan':          return 3;
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
