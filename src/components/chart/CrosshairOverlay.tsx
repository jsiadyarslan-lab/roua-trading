'use client';

import { CHART_COLORS } from '@/lib/chart-types';
import type { CrosshairData } from '@/lib/chart-types';

interface CrosshairOverlayProps {
  data: CrosshairData | null;
  symbol: string;
}

export function CrosshairOverlay({ data, symbol }: CrosshairOverlayProps) {
  if (!data) return null;

  const isUp = data.change >= 0;
  const changeColor = isUp ? CHART_COLORS.upColor : CHART_COLORS.downColor;

  return (
    <div
      className="flex items-center gap-3 px-2 py-1 text-[11px] font-mono select-none"
      style={{ direction: 'rtl', color: CHART_COLORS.text2 }}
    >
      <span style={{ color: CHART_COLORS.text, fontWeight: 700 }}>{symbol}</span>
      <span>O <b style={{ color: CHART_COLORS.text }}>{data.open.toFixed(2)}</b></span>
      <span>H <b style={{ color: CHART_COLORS.upColor }}>{data.high.toFixed(2)}</b></span>
      <span>L <b style={{ color: CHART_COLORS.downColor }}>{data.low.toFixed(2)}</b></span>
      <span>C <b style={{ color: CHART_COLORS.text }}>{data.close.toFixed(2)}</b></span>
      <span>V {data.volume.toLocaleString()}</span>
      <span style={{ color: changeColor, fontWeight: 700 }}>
        {isUp ? '+' : ''}{data.changePercent.toFixed(2)}%
      </span>
      <span style={{ color: CHART_COLORS.text2 }}>{data.dateStr}</span>
    </div>
  );
}
