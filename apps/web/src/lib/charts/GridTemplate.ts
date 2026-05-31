// ═══════════════════════════════════════════════════════════
// ROUA Trading — Grid Template Manager
// Save/load multi-chart grid templates with ALL cells' state
// (indicators, drawings, settings per cell + layout)
// ═══════════════════════════════════════════════════════════

import type { ChartSettings, ActiveIndicator, Drawing, ChartType } from './types';
import type { LayoutConfig } from '@/hooks/multi-chart-registry';

// ── Grid Cell State (captured from each chart cell) ──
export interface GridCellState {
  id: string;
  symbol: string;
  timeframe: string;
  chartType: ChartType;
  settings: ChartSettings;
  indicators: ActiveIndicator[];
  drawings: Drawing[];
}

// ── Grid Template (captures entire multi-chart grid state) ──
export interface GridTemplate {
  id: string;
  name: string;
  layout: LayoutConfig;
  cells: GridCellState[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Get a user-isolated localStorage key for grid templates.
 */
function getStorageKey(): string {
  try {
    const { useAuthStore } = require('@/lib/auth-store')
    const user = useAuthStore.getState()?.user
    if (user?.id) return `roua-grid-templates:${user.id}`
  } catch { /* Auth store not loaded yet */ }

  try {
    const cachedRaw = localStorage.getItem('roua_auth_user')
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw)
      if (cached?.id) return `roua-grid-templates:${cached.id}`
    }
  } catch { /* Cache unavailable */ }

  return 'roua-grid-templates:guest'
}

export class GridTemplateManager {

  // ── Save Grid Template ──────────────────────────────────
  static save(name: string, layout: LayoutConfig, cells: GridCellState[]): GridTemplate {
    const template: GridTemplate = {
      id: `gtpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      layout,
      cells,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const templates = this.getAll();
    templates.push(template);
    this.persist(templates);
    return template;
  }

  // ── Load Grid Template ──────────────────────────────────
  static load(id: string): GridTemplate | null {
    const templates = this.getAll();
    return templates.find(t => t.id === id) ?? null;
  }

  // ── Delete Grid Template ────────────────────────────────
  static delete(id: string): boolean {
    const templates = this.getAll();
    const filtered = templates.filter(t => t.id !== id);
    if (filtered.length === templates.length) return false;
    this.persist(filtered);
    return true;
  }

  // ── List All Grid Templates ─────────────────────────────
  static getAll(): GridTemplate[] {
    if (typeof window === 'undefined') return [];
    try {
      const key = getStorageKey();
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  // ── Update Grid Template ────────────────────────────────
  static update(id: string, updates: Partial<GridTemplate>): GridTemplate | null {
    const templates = this.getAll();
    const idx = templates.findIndex(t => t.id === id);
    if (idx === -1) return null;
    templates[idx] = { ...templates[idx], ...updates, updatedAt: Date.now() };
    this.persist(templates);
    return templates[idx];
  }

  // ── Export as JSON ──────────────────────────────────────
  static exportTemplate(id: string): string | null {
    const template = this.load(id);
    if (!template) return null;
    return JSON.stringify(template, null, 2);
  }

  // ── Import from JSON ────────────────────────────────────
  static importTemplate(json: string): GridTemplate | null {
    try {
      const template: GridTemplate = JSON.parse(json);
      if (!template.name || !template.cells) return null;
      template.id = `gtpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      template.createdAt = Date.now();
      template.updatedAt = Date.now();
      const templates = this.getAll();
      templates.push(template);
      this.persist(templates);
      return template;
    } catch {
      return null;
    }
  }

  // ── Private ─────────────────────────────────────────────
  private static persist(templates: GridTemplate[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(templates));
    } catch {
      // localStorage full
    }
  }
}
