// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Export Utilities (PNG, CSV)
// ═══════════════════════════════════════════════════════════

import type { CandleData } from './types';

export class ChartExporter {

  // ── PNG Export ─────────────────────────────────────────
  static exportPNG(container: HTMLElement | null, filename?: string): void {
    if (!container) return;

    // Try to find the canvas inside the lightweight-charts container
    const canvas = container.querySelector('canvas');
    if (!canvas) return;

    try {
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename || `roua-chart-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      // Canvas tainted or not accessible
      console.warn('Could not export chart as PNG — canvas may be tainted');
    }
  }

  // ── CSV Export ─────────────────────────────────────────
  static exportCSV(candles: CandleData[], filename?: string): void {
    if (!candles.length) return;

    const headers = ['Date', 'Time', 'Open', 'High', 'Low', 'Close', 'Volume'];
    const rows = candles.map(c => {
      const d = new Date(c.time * 1000);
      return [
        d.toISOString().split('T')[0],
        d.toTimeString().split(' ')[0],
        c.open,
        c.high,
        c.low,
        c.close,
        c.volume,
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `roua-chart-data-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ── SVG Export (via Canvas to SVG conversion) ──────────
  static exportSVG(container: HTMLElement | null, filename?: string): void {
    if (!container) return;

    const canvas = container.querySelector('canvas');
    if (!canvas) return;

    try {
      const dataUrl = canvas.toDataURL('image/png');
      const width = canvas.width;
      const height = canvas.height;

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <image href="${dataUrl}" width="${width}" height="${height}"/>
</svg>`;

      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || `roua-chart-${Date.now()}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      console.warn('Could not export chart as SVG');
    }
  }
}
