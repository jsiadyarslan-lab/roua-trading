'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface QuoteData {
  price: number;
  change: number;
  changePercent: number;
}

function AnimatedNumber({ value, decimals = 2 }: { value: number; decimals?: number }) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0.6, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="tabular-nums"
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {value.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </motion.span>
  );
}

export default function LiveMarketChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [change, setChange] = useState<number>(0);
  const [changePercent, setChangePercent] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const generateFallbackCandles = useCallback((): CandleData[] => {
    const candles: CandleData[] = [];
    const basePrice = 95000;
    let currentPrice = basePrice;
    const now = Date.now();

    for (let i = 50; i >= 0; i--) {
      const timestamp = new Date(now - i * 3600 * 1000).toISOString();
      const volatility = currentPrice * 0.008;
      const open = currentPrice;
      const close = open + (Math.random() - 0.48) * volatility;
      const high = Math.max(open, close) + Math.random() * volatility * 0.5;
      const low = Math.min(open, close) - Math.random() * volatility * 0.5;
      candles.push({
        time: timestamp,
        open: +open.toFixed(2),
        high: +high.toFixed(2),
        low: +low.toFixed(2),
        close: +close.toFixed(2),
      });
      currentPrice = close;
    }
    return candles;
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/exchange/history/BTC-USD?interval=1h&limit=50');
      const json = await res.json();

      if (json.success && json.data && json.data.length > 0) {
        return json.data.map((c: any) => ({
          time: c.timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
      }
      return generateFallbackCandles();
    } catch {
      return generateFallbackCandles();
    }
  }, [generateFallbackCandles]);

  const fetchQuote = useCallback(async () => {
    try {
      const res = await fetch('/api/exchange/quote/BTC-USD');
      const json = await res.json();

      if (json.success && json.data) {
        setPrice(json.data.price);
        setChange(json.data.change || 0);
        setChangePercent(json.data.changePercent || 0);
      }
    } catch {
      // Keep previous price on fetch failure
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const initChart = async () => {
      if (!containerRef.current) return;

      try {
        const { createChart, ColorType } = await import('lightweight-charts');

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight || 320;

        const chart = createChart(container, {
          layout: {
            background: { type: ColorType.Solid, color: '#000000' },
            textColor: '#888888',
            fontSize: 11,
          },
          grid: {
            vertLines: { color: '#1a1a2e' },
            horzLines: { color: '#1a1a2e' },
          },
          width,
          height,
          timeScale: {
            borderColor: '#1a1a2e',
            timeVisible: true,
            secondsVisible: false,
          },
          rightPriceScale: {
            borderColor: '#1a1a2e',
          },
          crosshair: {
            vertLine: { color: 'rgba(255,255,255,0.1)', width: 1, style: 2 },
            horzLine: { color: 'rgba(255,255,255,0.1)', width: 1, style: 2 },
          },
        });

        const series = chart.addCandlestickSeries({
          upColor: '#10b981',
          downColor: '#ef4444',
          borderUpColor: '#10b981',
          borderDownColor: '#ef4444',
          wickUpColor: '#10b981',
          wickDownColor: '#ef4444',
        });

        chartRef.current = chart;
        seriesRef.current = series;

        const candles = await fetchHistory();

        if (!mounted) return;

        const formattedCandles = candles
          .map((c: CandleData) => ({
            time: Math.floor(new Date(c.time).getTime() / 1000) as any,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }))
          .sort((a: any, b: any) => (a.time as number) - (b.time as number));

        // Deduplicate by time
        const seen = new Set<number>();
        const unique = formattedCandles.filter((c: any) => {
          if (seen.has(c.time as number)) return false;
          seen.add(c.time as number);
          return true;
        });

        series.setData(unique);
        chart.timeScale().fitContent();
        setIsLoading(false);
      } catch (err) {
        console.error('[LiveMarketChart] Init error:', err);
        setError('Failed to initialize chart');
        setIsLoading(false);
      }
    };

    initChart();

    // Fetch initial quote
    fetchQuote();

    // Refresh quote every 30 seconds
    const quoteInterval = setInterval(fetchQuote, 30000);

    // Handle resize
    const handleResize = () => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight || 320,
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      mounted = false;
      clearInterval(quoteInterval);
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, [fetchHistory, fetchQuote]);

  const isPositive = change >= 0;
  const priceColor = isPositive ? '#10b981' : '#ef4444';

  return (
    <div className="w-full relative">
      {/* Live Price Counter */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-white/60 text-xs font-medium tracking-wide uppercase">
              BTC / USD
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className="text-2xl sm:text-3xl font-bold tracking-tight"
              style={{ color: priceColor }}
            >
              <AnimatePresence mode="popLayout">
                {price !== null ? (
                  <AnimatedNumber value={price} decimals={2} />
                ) : (
                  <span className="text-white/30">—</span>
                )}
              </AnimatePresence>
            </span>
            <span className="text-white/40 text-sm">$</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className="text-sm font-semibold px-2 py-0.5 rounded-md"
            style={{
              color: priceColor,
              background: isPositive ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            }}
          >
            {isPositive ? '▲' : '▼'}{' '}
            {Math.abs(changePercent).toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Chart Container */}
      <div className="relative rounded-xl overflow-hidden border border-white/5">
        {/* Scan Line Effect */}
        <div
          className="absolute inset-0 z-10 pointer-events-none overflow-hidden"
          aria-hidden="true"
        >
          <div
            className="absolute left-0 right-0 h-px"
            style={{
              background:
                'linear-gradient(90deg, transparent 0%, rgba(16,185,129,0) 10%, rgba(16,185,129,0.6) 50%, rgba(16,185,129,0) 90%, transparent 100%)',
              boxShadow: '0 0 8px rgba(16,185,129,0.3), 0 0 20px rgba(16,185,129,0.1)',
              animation: 'scanLine 3s linear infinite',
            }}
          />
        </div>

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-emerald-500/40 border-t-emerald-500 rounded-full animate-spin" />
              <span className="text-white/50 text-sm">جاري التحميل...</span>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80">
            <span className="text-red-400/80 text-sm">{error}</span>
          </div>
        )}

        {/* Chart */}
        <div
          ref={containerRef}
          className="w-full"
          style={{ height: 320, minHeight: 280 }}
        />
      </div>

      {/* Scan Line Keyframes */}
      <style jsx global>{`
        @keyframes scanLine {
          0% {
            top: -2px;
            opacity: 0;
          }
          5% {
            opacity: 1;
          }
          95% {
            opacity: 1;
          }
          100% {
            top: calc(100% + 2px);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
