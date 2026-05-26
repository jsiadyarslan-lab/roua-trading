// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Keyboard Shortcuts (Enhanced)
// ═══════════════════════════════════════════════════════════

import type { DrawingTool } from './types';

export interface ShortcutActions {
  togglePlayPause: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setTool: (tool: DrawingTool) => void;
  saveChart: () => void;
  cancelDrawing: () => void;
  toggleFullscreen: () => void;
  resetView: () => void;
  exportPNG?: () => void;
  undoDrawing?: () => void;
  setTimeframe?: (tf: string) => void;
}

export class KeyboardShortcuts {
  private actions: ShortcutActions;
  private enabled: boolean = true;
  private handler: ((e: KeyboardEvent) => void) | null = null;

  constructor(actions: ShortcutActions) {
    this.actions = actions;
  }

  attach(): void {
    if (typeof window === 'undefined') return;
    this.handler = this.handleKeyDown.bind(this);
    window.addEventListener('keydown', this.handler);
  }

  detach(): void {
    if (this.handler) {
      window.removeEventListener('keydown', this.handler);
      this.handler = null;
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.enabled) return;

    // Don't capture when typing in inputs
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    const key = e.key.toLowerCase();

    // Ctrl/Cmd shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (key) {
        case 's':
          e.preventDefault();
          this.actions.saveChart();
          return;
        case 'e':
          e.preventDefault();
          this.actions.exportPNG?.();
          return;
        case 'z':
          e.preventDefault();
          this.actions.undoDrawing?.();
          return;
      }
      return; // Don't process further for Ctrl combos
    }

    // Single key shortcuts
    switch (key) {
      case ' ':
        e.preventDefault();
        this.actions.togglePlayPause();
        break;
      case '+':
      case '=':
        e.preventDefault();
        this.actions.zoomIn();
        break;
      case '-':
      case '_':
        e.preventDefault();
        this.actions.zoomOut();
        break;
      // ── Drawing Tools ──
      case 'r':
        this.actions.setTool('rectangle');
        break;
      case 'f':
        this.actions.setTool('fibonacci');
        break;
      case 't':
        this.actions.setTool('trendline');
        break;
      case 'h':
        this.actions.setTool('horizontal');
        break;
      case 'v':
        this.actions.setTool('vertical');
        break;
      // ── Timeframe Shortcuts (1-5) ──
      case '1':
        this.actions.setTimeframe?.('1min');
        break;
      case '2':
        this.actions.setTimeframe?.('5min');
        break;
      case '3':
        this.actions.setTimeframe?.('15min');
        break;
      case '4':
        this.actions.setTimeframe?.('1h');
        break;
      case '5':
        this.actions.setTimeframe?.('4h');
        break;
      // ── Other ──
      case 'escape':
        this.actions.cancelDrawing();
        break;
    }
  }
}
