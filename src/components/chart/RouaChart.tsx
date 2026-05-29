'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useChart } from '@/hooks/useChart';
import { useSymbolStore } from '@/hooks/useSymbolStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { ChartToolbar } from './ChartToolbar';
import { CrosshairOverlay } from './CrosshairOverlay';
import { TIMEFRAMES, CHART_COLORS } from '@/lib/chart-types';
import type { CandleData, CrosshairData } from '@/lib/chart-types';

// Generate simulated candle data
function generateCandles(symbol: string, timeframe: string, count = 300): CandleData[] {
  const basePrices: Record<string, number> = {
    'BTC/USDT': 65000, 'ETH/USDT': 3500, 'SOL/USDT': 150,
    'BNB/USDT': 600, 'XRP/USDT': 0.55, 'ADA/USDT': 0.45,
  };
  const price = basePrices[symbol] || 100;
  const isJPY = symbol.includes('JPY');
  const dp = isJPY ? 3 : price > 1000 ? 1 : price > 10 ? 2 : 5;
  const tf = TIMEFRAMES.find(t => t.value === timeframe);
  const tfMinutes = tf?.minutes || 15;

  const candles: CandleData[] = [];
  let p = price * (0.985 + Math.random() * 0.03);
  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < count; i++) {
    const t = now - (count - i) * tfMinutes * 60;
    const rng = p * 0.003 * (0.5 + Math.random() * 1.5);
    const o = p;
    const c = p + (Math.random() - 0.485) * rng;
    const h = Math.max(o, c) + Math.random() * rng * 0.5;
    const l = Math.min(o, c) - Math.random() * rng * 0.5;
    const v = Math.round(500 + Math.random() * 2000);
    candles.push({
      time: t,
      open: +o.toFixed(dp), high: +h.toFixed(dp),
      low: +l.toFixed(dp), close: +c.toFixed(dp), volume: v,
    });
    p = c;
  }
  return candles;
}

interface RouaChartProps {
  mobile?: boolean;
  compact?: boolean;
  hideToolbar?: boolean;
  onExpand?: (() => void) | null;
}

export function RouaChart({ compact, hideToolbar, onExpand }: RouaChartProps) {
  const { selectedSymbol, timeframe, setTimeframe } = useSymbolStore();
  const [crosshairData, setCrosshairData] = useState<CrosshairData | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerElRef = useRef<HTMLDivElement>(null);

  // FIX: اكتشاف الجوال داخلياً بدلاً من الاعتماد على prop خارجي
  // هذا يضمن التكيف حتى لو لم يُمرَّر mobile prop
  const isMobile = useIsMobile();

  const chart = useChart({
    symbol: selectedSymbol,
    timeframe,
    onCrosshairMove: setCrosshairData,
    // تمرير isMobile المكتشف للـ hook
    mobile: isMobile,
  });

  const setCandles = chart.setCandles;

  useEffect(() => {
    const candles = generateCandles(selectedSymbol, timeframe);
    setCandles(candles);
  }, [selectedSymbol, timeframe, setCandles]);

  // Fullscreen toggle
  const handleToggleFullscreen = useCallback(() => {
    const container = containerElRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // FIX: حساب الارتفاع الأدنى بوحدات vh لاحترام أحجام الشاشات المختلفة
  // iPhone SE (667px): 400px = 60% من الشاشة — كثير جداً
  // استخدام min() يضمن عدم تجاوز نسبة معينة من الشاشة
  const minHeightStyle = compact
    ? 'min(250px, 35vh)'
    : isMobile
      ? 'min(320px, 50vh)'  // على الجوال: أقصى 50% من ارتفاع الشاشة
      : 'min(500px, 60vh)'; // على الديسكتوب: أكثر مساحة

  return (
    <div
      ref={containerElRef}
      className="flex flex-col"
      style={{
        background: CHART_COLORS.bg,
        border: `1px solid ${CHART_COLORS.cardBorder}`,
        borderRadius: 8,
        overflow: 'hidden',
        width: '100%',
        height: '100%',
        minHeight: minHeightStyle,
      }}
    >
      {/* FIX: تمرير isMobile للـ Toolbar لتكييف التخطيط والأزرار */}
      {!hideToolbar && (
        <ChartToolbar
          symbol={selectedSymbol}
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          onToggleFullscreen={handleToggleFullscreen}
          isFullscreen={isFullscreen}
          isMobile={isMobile}
        />
      )}

      {/* FIX: تمرير isMobile للـ CrosshairOverlay لتبديل التخطيط */}
      <CrosshairOverlay
        data={crosshairData}
        symbol={selectedSymbol}
        isMobile={isMobile}
      />

      {/* Chart canvas */}
      <div
        ref={chart.containerRef as React.Ref<HTMLDivElement>}
        className="flex-1 relative"
        style={{ minHeight: 0 }}
      />
    </div>
  );
}
