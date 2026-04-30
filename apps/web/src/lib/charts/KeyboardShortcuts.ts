// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Keyboard Shortcuts
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

    // Ctrl+S — Save chart
    if ((e.ctrlKey || e.metaKey) && key === 's') {
      e.preventDefault();
      this.actions.saveChart();
      return;
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
      case 'r':
        this.actions.resetView();
        break;
      case 'f':
        this.actions.toggleFullscreen();
        break;
      case 't':
        this.actions.setTool('trendline');
        break;
      case 'h':
        this.actions.setTool('horizontal');
        break;
      case 'escape':
        this.actions.cancelDrawing();
        break;
    }
  }
}
