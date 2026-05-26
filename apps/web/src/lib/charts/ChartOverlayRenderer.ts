// ═══════════════════════════════════════════════════════════
// Chart Overlay Renderer — draws directly via price lines
// Works with any lightweight-charts v5 instance
// STANDALONE — no React deps
// ═══════════════════════════════════════════════════════════

export interface OverlayLevel {
  id: string;
  price: number;
  color: string;
  label: string;
  lineWidth?: number;
  lineStyle?: number; // 0=solid, 1=dotted, 2=dashed
  axisLabel?: boolean;
}

export interface OverlayManager {
  addLevel(level: OverlayLevel): void;
  removeAll(): void;
  getLevelIds(): string[];
}

export function createOverlayManager(mainSeries: any): OverlayManager {
  const ids: string[] = [];
  const lines: any[] = [];

  return {
    addLevel({ id, price, color, label, lineWidth = 1, lineStyle = 0, axisLabel = false }) {
      try {
        const line = mainSeries.createPriceLine({
          price,
          color,
          lineWidth,
          lineStyle,
          axisLabelVisible: axisLabel,
          title: label,
        });
        lines.push(line);
        ids.push(id);
      } catch {}
    },
    removeAll() {
      lines.forEach(l => { try { mainSeries.removePriceLine(l); } catch {} });
      lines.length = 0;
      ids.length = 0;
    },
    getLevelIds() { return [...ids]; },
  };
}
