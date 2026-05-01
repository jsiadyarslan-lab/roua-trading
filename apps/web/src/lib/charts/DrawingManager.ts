// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Drawing Manager
// Manages chart drawings (create, delete, modify, persist)
// ═══════════════════════════════════════════════════════════

import type { Drawing, DrawingTool, DrawingPoint } from './types';

const STORAGE_KEY = 'roua-chart-drawings';

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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allDrawings));
    } catch {
      // localStorage might be full or unavailable
    }
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const allDrawings = this.getAllStoredDrawings();
      const symbolDrawings = allDrawings[this.symbol] || [];
      this.drawings.clear();
      symbolDrawings.forEach(d => this.drawings.set(d.id, d));
    } catch {
      // Corrupted data — start fresh
    }
  }

  private getAllStoredDrawings(): Record<string, Drawing[]> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
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
      case 'cursor':       return 0;
      case 'horizontal':   return 1;
      case 'vertical':     return 1;
      case 'x-marker':     return 1;
      case 'trendline':    return 2;
      case 'fibonacci':    return 2;
      case 'rectangle':    return 2;
      case 'channel':      return 3;
      case 'triangle':     return 3;
      case 'circle':       return 2;
      case 'arc':          return 2;
      case 'arrow':        return 2;
      case 'extended-line':return 2;
      case 'ray':          return 2;
      case 'price-range':  return 2;
      default:             return 0;
    }
  }

  static getToolLabel(tool: DrawingTool): { ar: string; en: string } {
    const labels: Record<DrawingTool, { ar: string; en: string }> = {
      'cursor':        { ar: 'مؤشر',           en: 'Cursor' },
      'trendline':     { ar: 'خط اتجاه',        en: 'Trend Line' },
      'horizontal':    { ar: 'خط أفقي',         en: 'Horizontal Line' },
      'vertical':      { ar: 'خط رأسي',         en: 'Vertical Line' },
      'fibonacci':     { ar: 'فيبوناتشي',       en: 'Fibonacci' },
      'rectangle':     { ar: 'مستطيل',          en: 'Rectangle' },
      'channel':       { ar: 'قناة متوازية',     en: 'Parallel Channel' },
      'triangle':      { ar: 'مثلث',            en: 'Triangle' },
      'circle':        { ar: 'دائرة',           en: 'Circle' },
      'arc':           { ar: 'قوس',             en: 'Arc' },
      'x-marker':      { ar: 'علامة X',         en: 'X Mark' },
      'arrow':         { ar: 'سهم',             en: 'Arrow' },
      'extended-line': { ar: 'خط ممتد',         en: 'Extended Line' },
      'ray':           { ar: 'شعاع',            en: 'Ray' },
      'price-range':   { ar: 'نطاق سعري',       en: 'Price Range' },
    };
    return labels[tool] || { ar: tool, en: tool };
  }

  static getToolIcon(tool: DrawingTool): string {
    const icons: Record<DrawingTool, string> = {
      'cursor':        '↖',
      'trendline':     '╱',
      'horizontal':    '━',
      'vertical':      '┃',
      'fibonacci':     '⬡',
      'rectangle':     '▭',
      'channel':       '║',
      'triangle':      '△',
      'circle':        '○',
      'arc':           '⌒',
      'x-marker':      '✕',
      'arrow':         '→',
      'extended-line': '⟶',
      'ray':           '⟋',
      'price-range':   '⇳',
    };
    return icons[tool] || '?';
  }
}
