// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Multi-Timeframe Chart Popup
// Shows 4 mini area charts for the same symbol at 15m, 1h, 4h, 1D
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
}

const TIMEFRAMES = [
  { value: '15m', label: '15 دقيقة' },
  { value: '1h', label: '1 ساعة' },
  { value: '4h', label: '4 ساعات' },
  { value: '1d', label: 'يومي' },
] as const;

const CHART_COLORS = {
  topColor: 'rgba(0,212,255,0.3)',
  bottomColor: 'rgba(0,212,255,0.02)',
  lineColor: '#00D4FF',
  bg: '#0B0E14',
  grid: 'rgba(42,49,60,0.3)',
  text: '#F0F2F5',
  textMuted: '#8B92A8',
  success: '#00FFA3',
  danger: '#FF4757',
};

export function MultiTimeframeChart({ symbol, onClose }: MultiTimeframeChartProps) {
  const containerRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);
  const chartInstancesRef = useRef<any[]>([null, null, null, null]);
  const seriesRefs = useRef<any[]>([null, null, null, null]);
  const intervalRefs = useRef<ReturnType<typeof setInterval> | null>(null);

  const [chartStates, setChartStates] = useState<MiniChartState[]>(
    TIMEFRAMES.map(() => ({ loading: true, error: null, currentPrice: null, prevPrice: null }))
  );

  // ── Update a single chart state ─────────────────────────
  const updateChartState = useCallback((index: number, update: Partial<MiniChartState>) => {
    setChartStates(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...update };
      return next;
    });
  }, []);

  // ── Load data for a single timeframe ────────────────────
  const loadDataForTimeframe = useCallback(async (index: number) => {
    const tf = TIMEFRAMES[index];
    const container = containerRefs.current[index];
    const existingChart = chartInstancesRef.current[index];

    if (!container) return;

    try {
      updateChartState(index, { loading: true, error: null });

      const res = await fetch(
        `/api/exchange/history/${encodeURIComponent(symbol)}?interval=${tf.value}`
      );
      const j = await res.json();

      if (!j.success || !j.data || j.data.length === 0) {
        updateChartState(index, { loading: false, error: 'لا توجد بيانات' });
        return;
      }

      // Format data
      const areaData: { time: number; value: number }[] = j.data
        .map((c: any) => ({
          time: Math.floor(new Date(c.timestamp).getTime() / 1000),
          value: Number(c.close) || 0,
        }))
        .filter((d: any) => !isNaN(d.time) && d.time > 0 && !isNaN(d.value));

      // Deduplicate by time
      const seen = new Set<number>();
      const unique = areaData.filter((d) => {
        if (seen.has(d.time)) return false;
        seen.add(d.time);
        return true;
      });
      unique.sort((a, b) => a.time - b.time);

      if (unique.length === 0) {
        updateChartState(index, { loading: false, error: 'لا توجد بيانات صالحة' });
        return;
      }

      const currentPrice = unique[unique.length - 1].value;
      const prevPrice = unique.length > 1 ? unique[unique.length - 2].value : null;

      // Dynamic import lightweight-charts
      const { createChart, AreaSeries } = await import('lightweight-charts');

      // If chart instance exists, just update data
      if (existingChart && seriesRefs.current[index]) {
        seriesRefs.current[index].setData(unique as any);
        updateChartState(index, { loading: false, error: null, currentPrice, prevPrice });
        return;
      }

      // Create new chart instance
      const rect = container.getBoundingClientRect();
      const width = rect.width || container.clientWidth || 400;
      const height = rect.height || container.clientHeight || 200;

      const chart = createChart(container, {
        width,
        height,
        layout: {
          background: { color: CHART_COLORS.bg },
          textColor: CHART_COLORS.textMuted,
          fontSize: 9,
          fontFamily: "'JetBrains Mono', monospace",
          attributionLogo: false,
        },
        grid: {
          vertLines: { color: CHART_COLORS.grid },
          horzLines: { color: CHART_COLORS.grid },
        },
        rightPriceScale: {
          borderVisible: false,
          scaleMargins: { top: 0.1, bottom: 0.05 },
        },
        timeScale: {
          borderVisible: false,
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 2,
          barSpacing: 4,
          minBarSpacing: 1,
        },
        crosshair: {
          mode: 0, // Normal — but effectively hidden by not showing labels
          vertLine: { visible: false },
          horzLine: { visible: false },
        },
        handleScroll: false,
        handleScale: false,
      });

      const areaSeries = chart.addSeries(AreaSeries, {
        topColor: CHART_COLORS.topColor,
        bottomColor: CHART_COLORS.bottomColor,
        lineColor: CHART_COLORS.lineColor,
        lineWidth: 1 as any,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });

      areaSeries.setData(unique as any);

      // Fit content to view
      chart.timeScale().fitContent();

      chartInstancesRef.current[index] = chart;
      seriesRefs.current[index] = areaSeries;

      updateChartState(index, { loading: false, error: null, currentPrice, prevPrice });
    } catch {
      updateChartState(index, { loading: false, error: 'فشل التحميل' });
    }
  }, [symbol, updateChartState]);

  // ── Initialize all 4 charts ─────────────────────────────
  useEffect(() => {
    // Small delay to ensure containers have dimensions
    const initTimer = setTimeout(() => {
      TIMEFRAMES.forEach((_, i) => {
        loadDataForTimeframe(i);
      });
    }, 50);

    return () => clearTimeout(initTimer);
  }, [loadDataForTimeframe]);

  // ── Auto-refresh every 30 seconds ───────────────────────
  useEffect(() => {
    intervalRefs.current = setInterval(() => {
      TIMEFRAMES.forEach((_, i) => {
        loadDataForTimeframe(i);
      });
    }, 30000);

    return () => {
      if (intervalRefs.current) {
        clearInterval(intervalRefs.current);
        intervalRefs.current = null;
      }
    };
  }, [loadDataForTimeframe]);

  // ── Cleanup chart instances on unmount ──────────────────
  useEffect(() => {
    return () => {
      chartInstancesRef.current.forEach((chart) => {
        if (chart) {
          try { chart.remove(); } catch { /* ignore */ }
        }
      });
      chartInstancesRef.current = [null, null, null, null];
      seriesRefs.current = [null, null, null, null];
    };
  }, []);

  // ── Handle container ref assignment ─────────────────────
  const setContainerRef = useCallback((index: number) => (el: HTMLDivElement | null) => {
    containerRefs.current[index] = el;
  }, []);

  // ── Escape key handler ──────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // ── Format price display ────────────────────────────────
  const formatPrice = (price: number | null): string => {
    if (price === null) return '—';
    if (price > 10000) return price.toFixed(0);
    if (price > 100) return price.toFixed(1);
    if (price > 1) return price.toFixed(2);
    return price.toFixed(5);
  };

  // ── Calculate price change percentage ───────────────────
  const calcChangePercent = (current: number | null, prev: number | null): number | null => {
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
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => {
        // Close when clicking the overlay background
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Modal container */}
      <div
        style={{
          width: '90vw',
          maxWidth: 900,
          maxHeight: 600,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          position: 'relative',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                color: '#fff',
                fontWeight: 700,
                fontSize: 16,
                fontFamily: "'Cairo', sans-serif",
              }}
            >
              تحليل متعدد الأطر الزمنية
            </span>
            <span
              style={{
                color: CHART_COLORS.lineColor,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {symbol}
            </span>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 6,
              color: '#fff',
              width: 28,
              height: 28,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              padding: 0,
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
            }}
          >
            ✕
          </button>
        </div>

        {/* 2x2 Grid of mini charts */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: '1fr 1fr',
            gap: 8,
            flex: 1,
            minHeight: 0,
          }}
        >
          {TIMEFRAMES.map((tf, i) => {
            const state = chartStates[i];
            const changePercent = calcChangePercent(state.currentPrice, state.prevPrice);
            const isPositive = changePercent !== null && changePercent >= 0;

            return (
              <div
                key={tf.value}
                style={{
                  background: CHART_COLORS.bg,
                  borderRadius: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  border: '1px solid rgba(42,49,60,0.5)',
                  minHeight: 0,
                }}
              >
                {/* Mini chart header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    borderBottom: '1px solid rgba(42,49,60,0.3)',
                  }}
                >
                  <span
                    style={{
                      color: CHART_COLORS.lineColor,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 0.4,
                    }}
                  >
                    {tf.label}
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {state.loading && (
                      <span
                        style={{
                          color: CHART_COLORS.textMuted,
                          fontSize: 9,
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        ...
                      </span>
                    )}

                    {state.currentPrice !== null && !state.loading && (
                      <>
                        <span
                          style={{
                            color: CHART_COLORS.text,
                            fontSize: 10,
                            fontWeight: 600,
                            fontFamily: "'JetBrains Mono', monospace",
                          }}
                        >
                          {formatPrice(state.currentPrice)}
                        </span>
                        {changePercent !== null && (
                          <span
                            style={{
                              color: isPositive ? CHART_COLORS.success : CHART_COLORS.danger,
                              fontSize: 9,
                              fontWeight: 700,
                              fontFamily: "'JetBrains Mono', monospace",
                            }}
                          >
                            {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
                          </span>
                        )}
                      </>
                    )}

                    {state.error && (
                      <span
                        style={{
                          color: CHART_COLORS.danger,
                          fontSize: 9,
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {state.error}
                      </span>
                    )}
                  </div>
                </div>

                {/* Mini chart container */}
                <div
                  ref={setContainerRef(i)}
                  style={{
                    flex: 1,
                    minHeight: 0,
                    width: '100%',
                    position: 'relative',
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
