// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Template Manager
// Save/load chart templates with indicators, settings, drawings
// ═══════════════════════════════════════════════════════════

import type { ChartTemplate, ChartSettings, ActiveIndicator, Drawing } from './types';

const STORAGE_KEY = 'roua-chart-templates';

export class ChartTemplateManager {

  // ── Save Template ──────────────────────────────────────
  static save(
    name: string,
    settings: ChartSettings,
    indicators: ActiveIndicator[],
    drawings: Drawing[],
    timeframe: string,
    chartType: string
  ): ChartTemplate {
    const template: ChartTemplate = {
      id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      settings,
      indicators,
      drawings,
      timeframe,
      chartType: chartType as ChartTemplate['chartType'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const templates = this.getAll();
    templates.push(template);
    this.persist(templates);
    return template;
  }

  // ── Load Template ──────────────────────────────────────
  static load(id: string): ChartTemplate | null {
    const templates = this.getAll();
    return templates.find(t => t.id === id) ?? null;
  }

  // ── Delete Template ────────────────────────────────────
  static delete(id: string): boolean {
    const templates = this.getAll();
    const filtered = templates.filter(t => t.id !== id);
    if (filtered.length === templates.length) return false;
    this.persist(filtered);
    return true;
  }

  // ── List All Templates ─────────────────────────────────
  static getAll(): ChartTemplate[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  // ── Update Template ────────────────────────────────────
  static update(id: string, updates: Partial<ChartTemplate>): ChartTemplate | null {
    const templates = this.getAll();
    const idx = templates.findIndex(t => t.id === id);
    if (idx === -1) return null;
    templates[idx] = { ...templates[idx], ...updates, updatedAt: Date.now() };
    this.persist(templates);
    return templates[idx];
  }

  // ── Export as JSON ─────────────────────────────────────
  static exportTemplate(id: string): string | null {
    const template = this.load(id);
    if (!template) return null;
    return JSON.stringify(template, null, 2);
  }

  // ── Import from JSON ───────────────────────────────────
  static importTemplate(json: string): ChartTemplate | null {
    try {
      const template: ChartTemplate = JSON.parse(json);
      if (!template.name || !template.settings) return null;
      template.id = `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
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

  // ── Private ────────────────────────────────────────────
  private static persist(templates: ChartTemplate[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    } catch {
      // localStorage full
    }
  }
}
