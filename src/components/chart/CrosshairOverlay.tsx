'use client';

import { CHART_COLORS } from '@/lib/chart-types';
import type { CrosshairData } from '@/lib/chart-types';

interface CrosshairOverlayProps {
  data: CrosshairData | null;
  symbol: string;
  // FIX: إضافة prop للجوال لتكييف التخطيط
  isMobile?: boolean;
}

export function CrosshairOverlay({ data, symbol, isMobile = false }: CrosshairOverlayProps) {
  if (!data) return null;

  const isUp = data.change >= 0;
  const changeColor = isUp ? CHART_COLORS.upColor : CHART_COLORS.downColor;

  // FIX: عرض مختصر للحجم على الجوال
  const formatVolume = (v: number): string => {
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
    if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
    return v.toLocaleString();
  };

  if (isMobile) {
    // FIX: تخطيط شبكي ٢×٣ على الجوال بدلاً من صف واحد يفيض
    return (
      <div
        style={{
          direction: 'rtl',
          padding: '4px 8px 2px',
          background: 'rgba(21,26,34,0.92)',
          borderBottom: `1px solid ${CHART_COLORS.cardBorder}`,
        }}
      >
        {/* السطر الأول: الرمز + التغيير */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 2,
          }}
        >
          <span
            style={{
              color: CHART_COLORS.text,
              fontWeight: 700,
              fontSize: 11,
              fontFamily: 'monospace',
            }}
          >
            {symbol}
          </span>
          <span
            style={{
              color: changeColor,
              fontWeight: 700,
              fontSize: 11,
              fontFamily: 'monospace',
              marginRight: 'auto',
            }}
          >
            {isUp ? '+' : ''}{data.changePercent.toFixed(2)}%
          </span>
          <span
            style={{
              color: CHART_COLORS.text2,
              fontSize: 10,
              fontFamily: 'monospace',
            }}
          >
            {data.dateStr}
          </span>
        </div>

        {/* السطر الثاني: OHLC */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {[
            { label: 'O', value: data.open.toFixed(2), color: CHART_COLORS.text },
            { label: 'H', value: data.high.toFixed(2), color: CHART_COLORS.upColor },
            { label: 'L', value: data.low.toFixed(2), color: CHART_COLORS.downColor },
            { label: 'C', value: data.close.toFixed(2), color: CHART_COLORS.text },
            { label: 'V', value: formatVolume(data.volume), color: CHART_COLORS.text2 },
          ].map(({ label, value, color }) => (
            <span
              key={label}
              style={{
                fontSize: 10,
                fontFamily: 'monospace',
                color: CHART_COLORS.text2,
                whiteSpace: 'nowrap',
              }}
            >
              {label}{' '}
              <b style={{ color, fontWeight: 600 }}>{value}</b>
            </span>
          ))}
        </div>
      </div>
    );
  }

  // Desktop — الشكل الأصلي مع تحسينات طفيفة
  return (
    <div
      className="flex items-center gap-3 px-2 py-1 text-[11px] font-mono select-none flex-wrap"
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
