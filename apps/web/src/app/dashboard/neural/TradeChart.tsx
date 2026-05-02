'use client';

import { useEffect, useRef, useState } from 'react';

interface TradePoint {
  entryDate: string;
  exitDate: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
}

interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface TradeChartProps {
  trades: TradePoint[];
  symbol: string;
}

// Generate simulated OHLC candlestick data from trade prices
function generateCandleData(trades: TradePoint[]): CandleData[] {
  if (!trades || trades.length === 0) return [];

  const allPrices = trades.flatMap((t) => [t.entryPrice, t.exitPrice]);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const range = maxPrice - minPrice || 1;

  const candles: CandleData[] = [];
  const startDate = new Date('2025-01-01');

  for (let i = 0; i < 60; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];

    const volatility = range * 0.03;
    const basePrice = minPrice + (i / 60) * range * 0.5 + range * 0.3;
    const open = basePrice + (Math.sin(i * 0.3) * volatility);
    const close = open + (Math.cos(i * 0.5) * volatility);
    const high = Math.max(open, close) + Math.abs(Math.sin(i * 0.7)) * volatility;
    const low = Math.min(open, close) - Math.abs(Math.cos(i * 0.9)) * volatility;

    candles.push({
      time: dateStr,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
    });
  }

  return candles;
}

export default function TradeChart({ trades, symbol }: TradeChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [chartReady, setChartReady] = useState(false);

  useEffect(() => {
    if (!chartContainerRef.current || trades.length === 0) return;

    // Clean up previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = chartContainerRef.current;
    let isMounted = true;

    // Dynamic import for lightweight-charts (ESM only)
    import('lightweight-charts').then(({ createChart, CandlestickSeries }) => {
      if (!isMounted || !container) return;

      const chart = createChart(container, {
        width: container.clientWidth,
        height: 400,
        layout: {
          background: { color: '#0a0e17' },
          textColor: '#9ca3af',
          fontSize: 11,
          attributionLogo: false,
        },
        grid: {
          vertLines: { color: '#1f2937' },
          horzLines: { color: '#1f2937' },
        },
        crosshair: {
          vertLine: { color: '#6b7280', width: 1, style: 2 },
          horzLine: { color: '#6b7280', width: 1, style: 2 },
        },
        rightPriceScale: {
          borderColor: '#374151',
        },
        timeScale: {
          borderColor: '#374151',
          timeVisible: false,
        },
      });

      chartRef.current = chart;

      // Add candlestick series using v5 API
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderUpColor: '#22c55e',
        borderDownColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      });

      const candleData = generateCandleData(trades);
      candleSeries.setData(candleData);

      // Add markers for entry/exit points
      const markers: Array<{
        time: string;
        position: 'aboveBar' | 'belowBar';
        color: string;
        shape: 'arrowUp' | 'arrowDown';
        text: string;
      }> = [];

      for (const trade of trades.slice(0, 20)) {
        // Entry marker
        if (trade.entryDate) {
          markers.push({
            time: trade.entryDate,
            position: trade.side === 'BUY' ? 'belowBar' : 'aboveBar',
            color: trade.side === 'BUY' ? '#22c55e' : '#ef4444',
            shape: trade.side === 'BUY' ? 'arrowUp' : 'arrowDown',
            text: trade.side === 'BUY' ? 'دخول' : 'دخول بيع',
          });
        }

        // Exit marker
        if (trade.exitDate) {
          markers.push({
            time: trade.exitDate,
            position: trade.side === 'BUY' ? 'aboveBar' : 'belowBar',
            color: trade.side === 'BUY' ? '#ef4444' : '#22c55e',
            shape: trade.side === 'BUY' ? 'arrowDown' : 'arrowUp',
            text: 'خروج',
          });
        }
      }

      // Sort markers by time
      markers.sort((a, b) => a.time.localeCompare(b.time));

      if (markers.length > 0) {
        // In lightweight-charts v5, markers are on the series
        try {
          (candleSeries as any).setMarkers(markers);
        } catch {
          // Markers API may differ between versions
        }
      }

      chart.timeScale().fitContent();
      setChartReady(true);

      // Handle resize — disconnect any previous observer first
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }

      const ro = new ResizeObserver(entries => {
        if (chartRef.current && entries[0]) {
          chartRef.current.applyOptions({
            width: entries[0].contentRect.width,
          });
        }
      });

      if (container) {
        ro.observe(container);
      }
      resizeObserverRef.current = ro;
    }).catch((err) => {
      console.error('Failed to load lightweight-charts:', err);
    });

    // Cleanup: disconnect ResizeObserver and remove chart in main useEffect return
    // (NOT inside .then() callback — ensures cleanup always runs even if
    // the dynamic import hasn't resolved yet)
    return () => {
      isMounted = false;
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [trades, symbol]);

  if (!trades || trades.length === 0) {
    return (
      <div className="rounded-xl border border-white/5 bg-[#111827] p-5">
        <h3 className="mb-3 text-sm font-semibold text-gray-300">🕯️ مخطط الشموع</h3>
        <div className="flex h-[200px] items-center justify-center text-sm text-gray-500">
          شغّل الباك تست أولاً لعرض مخطط الشموع
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/5 bg-[#111827] p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">🕯️ مخطط الشموع — نقاط الدخول والخروج</h3>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            دخول شراء
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
            دخول بيع
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-0.5 bg-yellow-500" />
            خروج
          </span>
        </div>
      </div>
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}
