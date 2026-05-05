// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Multi-Timeframe Chart Popup
// Shows 4 live mini candlestick charts for the same symbol
// ═══════════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface MultiTimeframeChartProps {
  symbol: string;
  onClose: () => void;
}

interface MiniChartState {
  loading: boolean;
  error: string | null;
  currentPrice: number | null;
  prevPrice: number | null;
  candleCount: number;
}

const TIMEFRAMES = [
  { value: '15min', apiValue: '15min', label: '15 دقيقة', labelShort: '15m' },
  { value: '1h', apiValue: '1h', label: '1 ساعة', labelShort: '1H' },
  { value: '4h', apiValue: '4h', label: '4 ساعات', labelShort: '4H' },
  { value: '1day', apiValue: '1day', label: 'يومي', labelShort: '1D' },
] as const;

const C = {
  bg: '#0B0E14',
  card: '#111620',
  cardBorder: '#1E2530',
  grid: 'rgba(42,49,60,0.25)',
  text: '#F0F2F5',
  textDim: '#64748B',
  textMuted: '#4B5563',
  cyan: '#00D4FF',
  success: '#00FFA3',
  danger: '#FF4757',
  gold: '#d4af37',
  upColor: '#3fb950',
  downColor: '#f85149',
};

export function MultiTimeframeChart({ symbol, onClose }: MultiTimeframeChartProps) {
  const containerRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);
  const chartInstancesRef = useRef<any[]>([null, null, null, null]);
  const seriesRefs = useRef<any[]>([null, null, null, null]);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [chartStates, setChartStates] = useState<MiniChartState[]>(
    TIMEFRAMES.map(() => ({ loading: true, error: null, currentPrice: null, prevPrice: null, candleCount: 0 }))
  );

  const updateChartState = useCallback((index: number, update: Partial<MiniChartState>) => {
    setChartStates(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...update };
      return next;
    });
  }, []);

  const loadDataForTimeframe = useCallback(async (index: number) => {
    const tf = TIMEFRAMES[index];
    const container = containerRefs.current[index];

    if (!container) return;

    try {
      updateChartState(index, { loading: true, error: null });

      const res = await fetch(
        `/api/exchange/history/${encodeURIComponent(symbol)}?interval=${tf.apiValue}`
      );
      const j = await res.json();

      if (!j.success || !j.data || j.data.length === 0) {
        updateChartState(index, { loading: false, error: 'لا توجد بيانات', candleCount: 0 });
        return;
      }

      // Format candle data
      const candleData: { time: number; open: number; high: number; low: number; close: number; volume: number }[] = j.data
        .map((c: any) => ({
          time: Math.floor(new Date(c.timestamp).getTime() / 1000),
          open: Number(c.open) || 0,
          high: Number(c.high) || 0,
          low: Number(c.low) || 0,
          close: Number(c.close) || 0,
          volume: Number(c.volume) || 0,
        }))
        .filter((d: any) => !isNaN(d.time) && d.time > 0 && !isNaN(d.close));

      // Deduplicate + sort
      const seen = new Set<number>();
      const unique = candleData.filter(d => {
        if (seen.has(d.time)) return false;
        seen.add(d.time);
        return true;
      });
      unique.sort((a, b) => a.time - b.time);

      if (unique.length === 0) {
        updateChartState(index, { loading: false, error: 'لا توجد بيانات صالحة', candleCount: 0 });
        return;
      }

      const currentPrice = unique[unique.length - 1].close;
      const prevPrice = unique.length > 1 ? unique[unique.length - 2].close : null;

      // Dynamic import lightweight-charts
      const { createChart, CandlestickSeries, AreaSeries } = await import('lightweight-charts');

      const existingChart = chartInstancesRef.current[index];
      const existingSeries = seriesRefs.current[index];

      // If chart exists, just update data
      if (existingChart && existingSeries) {
        try {
          existingSeries.setData(unique as any);
          existingChart.timeScale().fitContent();
        } catch { /* ignore */ }
        updateChartState(index, { loading: false, error: null, currentPrice, prevPrice, candleCount: unique.length });
        return;
      }

      // Create new chart
      const rect = container.getBoundingClientRect();
      const width = rect.width || container.clientWidth || 400;
      const height = rect.height || container.clientHeight || 180;

      const chart = createChart(container, {
        width,
        height,
        layout: {
          background: { color: C.bg },
          textColor: C.textDim,
          fontSize: 9,
          fontFamily: "'JetBrains Mono', monospace",
          attributionLogo: false,
        },
        grid: {
          vertLines: { color: C.grid },
          horzLines: { color: C.grid },
        },
        rightPriceScale: {
          borderVisible: false,
          scaleMargins: { top: 0.15, bottom: 0.05 },
        },
        timeScale: {
          borderVisible: false,
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 3,
          barSpacing: 5,
          minBarSpacing: 2,
        },
        crosshair: {
          mode: 0,
          vertLine: { visible: true, labelVisible: false, color: 'rgba(0,212,255,0.2)' },
          horzLine: { visible: true, labelVisible: true, color: 'rgba(0,212,255,0.2)', labelBackgroundColor: C.card },
        },
        handleScroll: true,
        handleScale: true,
      });

      // Use candlestick series for mini charts — they show real price action
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: C.upColor,
        downColor: C.downColor,
        borderUpColor: C.upColor,
        borderDownColor: C.downColor,
        wickUpColor: C.upColor,
        wickDownColor: C.downColor,
      });

      candleSeries.setData(unique as any);
      chart.timeScale().fitContent();

      chartInstancesRef.current[index] = chart;
      seriesRefs.current[index] = candleSeries;

      updateChartState(index, { loading: false, error: null, currentPrice, prevPrice, candleCount: unique.length });
    } catch {
      updateChartState(index, { loading: false, error: 'فشل التحميل', candleCount: 0 });
    }
  }, [symbol, updateChartState]);

  // Initialize
  useEffect(() => {
    const initTimer = setTimeout(() => {
      TIMEFRAMES.forEach((_, i) => loadDataForTimeframe(i));
    }, 100);
    return () => clearTimeout(initTimer);
  }, [loadDataForTimeframe]);

  // Auto-refresh every 30s
  useEffect(() => {
    refreshIntervalRef.current = setInterval(() => {
      TIMEFRAMES.forEach((_, i) => loadDataForTimeframe(i));
    }, 30000);

    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [loadDataForTimeframe]);

  // Cleanup
  useEffect(() => {
    return () => {
      chartInstancesRef.current.forEach(c => { if (c) try { c.remove(); } catch {} });
    };
  }, []);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      chartInstancesRef.current.forEach((chart, i) => {
        const container = containerRefs.current[i];
        if (chart && container) {
          const w = container.clientWidth;
          const h = container.clientHeight;
          if (w > 0 && h > 0) {
            chart.applyOptions({ width: w, height: h });
          }
        }
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const setContainerRef = useCallback((index: number) => (el: HTMLDivElement | null) => {
    containerRefs.current[index] = el;
  }, []);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const formatPrice = (price: number | null): string => {
    if (price === null) return '—';
    if (price > 10000) return price.toFixed(0);
    if (price > 100) return price.toFixed(1);
    if (price > 1) return price.toFixed(2);
    return price.toFixed(5);
  };

  const calcChange = (current: number | null, prev: number | null): number | null => {
    if (current === null || prev === null || prev === 0) return null;
    return ((current - prev) / prev) * 100;
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '92vw',
        maxWidth: 960,
        height: '80vh',
        maxHeight: 640,
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        background: C.card,
        borderRadius: 14,
        border: `1px solid ${C.cardBorder}`,
        overflow: 'hidden',
        boxShadow: '0 25px 60px rgba(0,0,0,0.7), 0 0 40px rgba(0,212,255,0.05)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: `1px solid ${C.cardBorder}`,
          background: 'linear-gradient(180deg, rgba(17,22,32,1) 0%, rgba(11,14,20,1) 100%)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.cyan} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
              </svg>
            </div>
            <div>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 14, fontFamily: "'Cairo', sans-serif", lineHeight: 1.2 }}>
                تحليل متعدد الأطر الزمنية
              </div>
              <div style={{ color: C.cyan, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>
                {symbol}
              </div>
            </div>
          </div>

          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.cardBorder}`,
            borderRadius: 8, color: C.textDim, width: 32, height: 32, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, padding: 0,
            transition: 'all 0.15s ease',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,71,87,0.15)'; e.currentTarget.style.color = C.danger; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = C.textDim; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* 2x2 Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '1fr 1fr',
          gap: 1,
          flex: 1,
          minHeight: 0,
          background: C.cardBorder,
        }}>
          {TIMEFRAMES.map((tf, i) => {
            const state = chartStates[i];
            const changePercent = calcChange(state.currentPrice, state.prevPrice);
            const isPositive = changePercent !== null && changePercent >= 0;

            return (
              <div key={tf.value} style={{
                background: C.bg,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                minHeight: 0,
              }}>
                {/* Mini chart header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: C.card,
                  borderBottom: `1px solid ${C.cardBorder}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      color: C.cyan, fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 11, fontWeight: 800, letterSpacing: 0.8,
                    }}>
                      {tf.labelShort}
                    </span>
                    <span style={{
                      color: C.textMuted, fontFamily: "'Cairo', sans-serif",
                      fontSize: 9, fontWeight: 400,
                    }}>
                      {tf.label}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {state.loading && (
                      <div style={{ width: 12, height: 12, border: `2px solid ${C.cardBorder}`, borderTopColor: C.cyan, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    )}

                    {state.currentPrice !== null && !state.loading && (
                      <>
                        <span style={{
                          color: C.text, fontSize: 11, fontWeight: 600,
                          fontFamily: "'JetBrains Mono', monospace",
                        }}>
                          {formatPrice(state.currentPrice)}
                        </span>
                        {changePercent !== null && (
                          <span style={{
                            color: isPositive ? C.success : C.danger,
                            fontSize: 10, fontWeight: 700,
                            fontFamily: "'JetBrains Mono', monospace",
                            padding: '1px 5px', borderRadius: 3,
                            background: isPositive ? 'rgba(0,255,163,0.1)' : 'rgba(255,71,87,0.1)',
                          }}>
                            {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
                          </span>
                        )}
                      </>
                    )}

                    {state.error && (
                      <span style={{ color: C.danger, fontSize: 9, fontFamily: "'Cairo', sans-serif" }}>
                        {state.error}
                      </span>
                    )}
                  </div>
                </div>

                {/* Chart container */}
                <div
                  ref={setContainerRef(i)}
                  style={{ flex: 1, minHeight: 0, width: '100%', position: 'relative' }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Spinner keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
