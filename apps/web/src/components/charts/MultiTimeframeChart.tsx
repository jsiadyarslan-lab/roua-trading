// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Multi-Timeframe Chart Popup
// Shows live mini candlestick charts with add/remove + pair change
// Active chart selection with mini toolbar per chart
// ═══════════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ScopedStyle } from '@/components/ScopedStyle';

interface MultiTimeframeChartProps {
  symbol: string;
  onClose: () => void;
}

interface ChartSlot {
  id: string;
  symbol: string;
  timeframe: string;
  labelShort: string;
}

interface MiniChartState {
  loading: boolean;
  error: string | null;
  currentPrice: number | null;
  prevPrice: number | null;
  candleCount: number;
}

const TIMEFRAME_OPTIONS = [
  { value: '1min', labelShort: '1m' },
  { value: '5min', labelShort: '5m' },
  { value: '15min', labelShort: '15m' },
  { value: '30min', labelShort: '30m' },
  { value: '1h', labelShort: '1H' },
  { value: '2h', labelShort: '2H' },
  { value: '4h', labelShort: '4H' },
  { value: '1day', labelShort: '1D' },
  { value: '1week', labelShort: '1W' },
];

const POPULAR_PAIRS = [
  'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'XRP/USDT', 'SOL/USDT',
  'ADA/USDT', 'DOGE/USDT', 'DOT/USDT', 'AVAX/USDT', 'LINK/USDT',
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD',
  'XAU/USD', 'XAG/USD', 'US30', 'NAS100', 'SPX500',
];

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
  upColor: '#3fb950',
  downColor: '#f85149',
};

let slotIdCounter = 0;

export function MultiTimeframeChart({ symbol, onClose }: MultiTimeframeChartProps) {
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const chartInstancesRef = useRef<Map<string, any>>(new Map());
  const seriesRefs = useRef<Map<string, any>>(new Map());
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [slots, setSlots] = useState<ChartSlot[]>([
    { id: `slot-${slotIdCounter++}`, symbol, timeframe: '15min', labelShort: '15m' },
    { id: `slot-${slotIdCounter++}`, symbol, timeframe: '1h', labelShort: '1H' },
    { id: `slot-${slotIdCounter++}`, symbol, timeframe: '4h', labelShort: '4H' },
    { id: `slot-${slotIdCounter++}`, symbol, timeframe: '1day', labelShort: '1D' },
  ]);
  const [chartStates, setChartStates] = useState<Map<string, MiniChartState>>(new Map());
  const [activeSlotId, setActiveSlotId] = useState<string>('');

  // Set initial active slot
  useEffect(() => {
    if (!activeSlotId && slots.length > 0) {
      setActiveSlotId(slots[0].id);
    }
  }, [slots, activeSlotId]);

  const updateChartState = useCallback((slotId: string, update: Partial<MiniChartState>) => {
    setChartStates(prev => {
      const next = new Map(prev);
      const existing = next.get(slotId) || { loading: true, error: null, currentPrice: null, prevPrice: null, candleCount: 0 };
      next.set(slotId, { ...existing, ...update });
      return next;
    });
  }, []);

  const loadDataForSlot = useCallback(async (slot: ChartSlot) => {
    const container = containerRefs.current.get(slot.id);
    if (!container) return;

    updateChartState(slot.id, { loading: true, error: null });

    try {
      const res = await fetch(
        `/api/exchange/history/${encodeURIComponent(slot.symbol)}?interval=${slot.timeframe}`
      );
      const j = await res.json();

      if (!j.success || !j.data || j.data.length === 0) {
        updateChartState(slot.id, { loading: false, error: 'لا توجد بيانات', candleCount: 0 });
        return;
      }

      const candleData = j.data
        .map((c: any) => ({
          time: Math.floor(new Date(c.timestamp).getTime() / 1000),
          open: Number(c.open) || 0,
          high: Number(c.high) || 0,
          low: Number(c.low) || 0,
          close: Number(c.close) || 0,
          volume: Number(c.volume) || 0,
        }))
        .filter((d: any) => !isNaN(d.time) && d.time > 0 && !isNaN(d.close));

      const seen = new Set<number>();
      const unique = candleData.filter((d: any) => {
        if (seen.has(d.time)) return false;
        seen.add(d.time);
        return true;
      });
      unique.sort((a: any, b: any) => a.time - b.time);

      if (unique.length === 0) {
        updateChartState(slot.id, { loading: false, error: 'لا توجد بيانات صالحة', candleCount: 0 });
        return;
      }

      const currentPrice = unique[unique.length - 1].close;
      const prevPrice = unique.length > 1 ? unique[unique.length - 2].close : null;

      const { createChart, CandlestickSeries } = await import('lightweight-charts');

      const existingChart = chartInstancesRef.current.get(slot.id);
      const existingSeries = seriesRefs.current.get(slot.id);

      if (existingChart && existingSeries) {
        try {
          existingSeries.setData(unique);
          existingChart.timeScale().fitContent();
        } catch { /* ignore */ }
        updateChartState(slot.id, { loading: false, error: null, currentPrice, prevPrice, candleCount: unique.length });
        return;
      }

      const rect = container.getBoundingClientRect();
      const width = rect.width || container.clientWidth || 400;
      const height = rect.height || container.clientHeight || 180;

      const chart = createChart(container, {
        width, height,
        layout: { background: { color: C.bg }, textColor: C.textDim, fontSize: 9, fontFamily: "'JetBrains Mono', monospace", attributionLogo: false },
        grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.15, bottom: 0.05 } },
        timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 3, barSpacing: 5, minBarSpacing: 2 },
        crosshair: { mode: 0, vertLine: { visible: true, labelVisible: false, color: 'rgba(0,212,255,0.2)' }, horzLine: { visible: true, labelVisible: true, color: 'rgba(0,212,255,0.2)', labelBackgroundColor: C.card } },
        handleScroll: true,
        handleScale: true,
      });

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: C.upColor, downColor: C.downColor,
        borderUpColor: C.upColor, borderDownColor: C.downColor,
        wickUpColor: C.upColor, wickDownColor: C.downColor,
      });

      candleSeries.setData(unique);
      chart.timeScale().fitContent();

      chartInstancesRef.current.set(slot.id, chart);
      seriesRefs.current.set(slot.id, candleSeries);

      updateChartState(slot.id, { loading: false, error: null, currentPrice, prevPrice, candleCount: unique.length });
    } catch {
      updateChartState(slot.id, { loading: false, error: 'فشل التحميل', candleCount: 0 });
    }
  }, [updateChartState]);

  const handleAddChart = useCallback(() => {
    const newSlot: ChartSlot = {
      id: `slot-${slotIdCounter++}`,
      symbol,
      timeframe: '1h',
      labelShort: '1H',
    };
    setSlots(prev => [...prev, newSlot]);
  }, [symbol]);

  const handleRemoveChart = useCallback((id: string) => {
    const chart = chartInstancesRef.current.get(id);
    if (chart) { try { chart.remove(); } catch {} }
    chartInstancesRef.current.delete(id);
    seriesRefs.current.delete(id);
    setSlots(prev => prev.filter(s => s.id !== id));
    setActiveSlotId(prev => {
      if (prev === id) {
        // Move active to another slot
        const remaining = slots.filter(s => s.id !== id);
        return remaining.length > 0 ? remaining[0].id : '';
      }
      return prev;
    });
  }, [slots]);

  const handleChangeSymbol = useCallback((id: string, newSymbol: string) => {
    // Remove existing chart so it gets recreated with new symbol
    const chart = chartInstancesRef.current.get(id);
    if (chart) { try { chart.remove(); } catch {} }
    chartInstancesRef.current.delete(id);
    seriesRefs.current.delete(id);
    setSlots(prev => prev.map(s => s.id === id ? { ...s, symbol: newSymbol } : s));
  }, []);

  const handleChangeTimeframe = useCallback((id: string, tf: string) => {
    const tfOption = TIMEFRAME_OPTIONS.find(t => t.value === tf);
    if (!tfOption) return;
    // Remove existing chart so it gets recreated with new timeframe
    const chart = chartInstancesRef.current.get(id);
    if (chart) { try { chart.remove(); } catch {} }
    chartInstancesRef.current.delete(id);
    seriesRefs.current.delete(id);
    setSlots(prev => prev.map(s => s.id === id ? { ...s, timeframe: tfOption.value, labelShort: tfOption.labelShort } : s));
  }, []);

  // Zoom handlers for active chart
  const handleZoomIn = useCallback(() => {
    const chart = chartInstancesRef.current.get(activeSlotId);
    if (chart) {
      try {
        const ts = chart.timeScale();
        const range = ts.getVisibleRange();
        if (range) {
          const from = range.from as number;
          const to = range.to as number;
          const span = to - from;
          const center = from + span / 2;
          const newSpan = span * 0.7;
          ts.setVisibleRange({ from: center - newSpan / 2, to: center + newSpan / 2 });
        }
      } catch { /* ignore */ }
    }
  }, [activeSlotId]);

  const handleZoomOut = useCallback(() => {
    const chart = chartInstancesRef.current.get(activeSlotId);
    if (chart) {
      try {
        const ts = chart.timeScale();
        const range = ts.getVisibleRange();
        if (range) {
          const from = range.from as number;
          const to = range.to as number;
          const span = to - from;
          const center = from + span / 2;
          const newSpan = span * 1.4;
          ts.setVisibleRange({ from: center - newSpan / 2, to: center + newSpan / 2 });
        }
      } catch { /* ignore */ }
    }
  }, [activeSlotId]);

  const handleFitContent = useCallback(() => {
    const chart = chartInstancesRef.current.get(activeSlotId);
    if (chart) {
      try {
        chart.timeScale().fitContent();
      } catch { /* ignore */ }
    }
  }, [activeSlotId]);

  // Load data for all slots
  useEffect(() => {
    const initTimer = setTimeout(() => {
      slots.forEach(slot => { if (slot.symbol) loadDataForSlot(slot); });
    }, 150);
    return () => clearTimeout(initTimer);
  }, [slots, loadDataForSlot]);

  // Auto-refresh every 30s
  useEffect(() => {
    refreshIntervalRef.current = setInterval(() => {
      slots.forEach(slot => { if (slot.symbol) loadDataForSlot(slot); });
    }, 30000);
    return () => { if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current); };
  }, [slots, loadDataForSlot]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      chartInstancesRef.current.forEach(c => { if (c) try { c.remove(); } catch {} });
    };
  }, []);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      chartInstancesRef.current.forEach((chart, id) => {
        const container = containerRefs.current.get(id);
        if (chart && container) {
          const w = container.clientWidth;
          const h = container.clientHeight;
          if (w > 0 && h > 0) chart.applyOptions({ width: w, height: h });
        }
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const setContainerRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) containerRefs.current.set(id, el);
    else containerRefs.current.delete(id);
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

  // Dynamic grid columns
  const colCount = slots.length <= 2 ? slots.length : slots.length <= 6 ? 2 : 3;

  // Calculate grid rows
  const rowCount = Math.ceil(slots.length / colCount);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '92vw', maxWidth: 1200,
        height: '88vh', maxHeight: 820,
        display: 'flex', flexDirection: 'column',
        background: C.card, borderRadius: 14,
        border: `1px solid ${C.cardBorder}`,
        overflow: 'hidden',
        boxShadow: '0 25px 60px rgba(0,0,0,0.7), 0 0 40px rgba(0,212,255,0.05)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px',
          borderBottom: `1px solid ${C.cardBorder}`,
          background: 'linear-gradient(180deg, rgba(17,22,32,1) 0%, rgba(11,14,20,1) 100%)',
          flexShrink: 0,
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Add Chart Button */}
            <button
              onClick={handleAddChart}
              style={{
                background: 'rgba(0,212,255,0.1)',
                border: '1px solid rgba(0,212,255,0.25)',
                borderRadius: 8, color: C.cyan,
                padding: '6px 12px', fontSize: 11, fontWeight: 700,
                cursor: 'pointer', fontFamily: "'Cairo', sans-serif",
                display: 'flex', alignItems: 'center', gap: 4,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.2)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.1)'; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              إضافة شارت
            </button>

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
        </div>

        {/* Grid - fills all remaining space */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${colCount}, 1fr)`,
          gridTemplateRows: `repeat(${rowCount}, 1fr)`,
          gap: 6,
          flex: 1,
          height: '100%',
          minHeight: 0,
          padding: 6,
          overflow: 'hidden',
          background: C.bg,
        }}>
          {slots.map((slot) => {
            const state = chartStates.get(slot.id);
            const changePercent = calcChange(state?.currentPrice ?? null, state?.prevPrice ?? null);
            const isPositive = changePercent !== null && changePercent >= 0;
            const isActive = activeSlotId === slot.id;

            return (
              <div
                key={slot.id}
                onClick={() => setActiveSlotId(slot.id)}
                style={{
                  background: C.card,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  borderRadius: 8,
                  border: isActive
                    ? '1px solid rgba(0,212,255,0.4)'
                    : `1px solid ${C.cardBorder}`,
                  boxShadow: isActive
                    ? '0 0 12px rgba(0,212,255,0.15), inset 0 0 8px rgba(0,212,255,0.03)'
                    : 'none',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                  minHeight: 0,
                }}
              >
                {/* Mini chart header with symbol/timeframe selectors */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 10px',
                  borderBottom: `1px solid ${C.cardBorder}`,
                  flexShrink: 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {/* Symbol selector */}
                    <select
                      value={slot.symbol}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleChangeSymbol(slot.id, e.target.value)}
                      style={{
                        background: 'rgba(0,212,255,0.08)',
                        border: '1px solid rgba(0,212,255,0.2)',
                        borderRadius: 4, color: C.cyan,
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 10, fontWeight: 700,
                        padding: '2px 6px', cursor: 'pointer',
                        outline: 'none', maxWidth: 90,
                      }}
                    >
                      {POPULAR_PAIRS.map(p => (
                        <option key={p} value={p} style={{ background: C.card, color: C.text }}>{p}</option>
                      ))}
                    </select>

                    {/* Timeframe selector */}
                    <select
                      value={slot.timeframe}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleChangeTimeframe(slot.id, e.target.value)}
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 4, color: C.textDim,
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 9, padding: '2px 4px',
                        cursor: 'pointer', outline: 'none',
                      }}
                    >
                      {TIMEFRAME_OPTIONS.map(tf => (
                        <option key={tf.value} value={tf.value} style={{ background: C.card, color: C.text }}>{tf.labelShort}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {state?.loading && (
                      <div style={{ width: 10, height: 10, border: `2px solid ${C.cardBorder}`, borderTopColor: C.cyan, borderRadius: '50%', animation: 'mtfSpin 1s linear infinite' }} />
                    )}

                    {state?.currentPrice != null && !state?.loading && (
                      <>
                        <span style={{ color: C.text, fontSize: 10, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
                          {formatPrice(state.currentPrice)}
                        </span>
                        {changePercent !== null && (
                          <span style={{
                            color: isPositive ? C.success : C.danger,
                            fontSize: 9, fontWeight: 700,
                            fontFamily: "'JetBrains Mono', monospace",
                            padding: '1px 4px', borderRadius: 3,
                            background: isPositive ? 'rgba(0,255,163,0.1)' : 'rgba(255,71,87,0.1)',
                          }}>
                            {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
                          </span>
                        )}
                      </>
                    )}

                    {state?.error && (
                      <span style={{ color: C.danger, fontSize: 9, fontFamily: "'Cairo', sans-serif" }}>
                        {state.error}
                      </span>
                    )}

                    {/* Remove button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemoveChart(slot.id); }}
                      style={{
                        background: 'rgba(255,71,87,0.1)',
                        border: '1px solid rgba(255,71,87,0.2)',
                        borderRadius: 4, color: C.danger,
                        width: 18, height: 18, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, padding: 0, transition: 'all 0.15s ease',
                        flexShrink: 0,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,71,87,0.25)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,71,87,0.1)'; }}
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Chart container */}
                <div
                  ref={setContainerRef(slot.id)}
                  style={{ flex: 1, minHeight: 0, width: '100%', position: 'relative' }}
                />

                {/* Mini toolbar - visible on each chart, highlighted when active */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '3px 8px',
                  borderTop: `1px solid ${C.cardBorder}`,
                  background: isActive ? 'rgba(0,212,255,0.04)' : 'rgba(0,0,0,0.2)',
                  flexShrink: 0,
                  transition: 'background 0.2s ease',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    {/* Candlestick chart type button */}
                    <button
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        background: isActive ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.04)',
                        border: isActive ? '1px solid rgba(0,212,255,0.25)' : '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 3,
                        color: isActive ? C.cyan : C.textMuted,
                        height: 18,
                        padding: '0 5px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 8,
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: 600,
                        transition: 'all 0.15s ease',
                        gap: 3,
                      }}
                    >
                      {/* Candlestick icon */}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="9" y1="4" x2="9" y2="20" /><rect x="6" y="8" width="6" height="8" rx="1" /><line x1="17" y1="2" x2="17" y2="10" /><rect x="14" y="6" width="6" height="8" rx="1" />
                      </svg>
                      شموع
                    </button>

                    {/* Indicators button (visual only) */}
                    <button
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        background: isActive ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.04)',
                        border: isActive ? '1px solid rgba(0,212,255,0.15)' : '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 3,
                        color: isActive ? 'rgba(0,212,255,0.7)' : C.textMuted,
                        height: 18,
                        padding: '0 5px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 8,
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: 600,
                        transition: 'all 0.15s ease',
                        gap: 3,
                      }}
                    >
                      {/* Indicator icon */}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
                      </svg>
                      مؤشرات
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    {/* Zoom out */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleZoomOut(); }}
                      style={{
                        background: isActive ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.04)',
                        border: isActive ? '1px solid rgba(0,212,255,0.15)' : '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 3,
                        color: isActive ? 'rgba(0,212,255,0.8)' : C.textMuted,
                        width: 18, height: 18,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>

                    {/* Fit content / Reset zoom */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleFitContent(); }}
                      style={{
                        background: isActive ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.04)',
                        border: isActive ? '1px solid rgba(0,212,255,0.15)' : '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 3,
                        color: isActive ? 'rgba(0,212,255,0.8)' : C.textMuted,
                        width: 18, height: 18,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" />
                      </svg>
                    </button>

                    {/* Zoom in */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleZoomIn(); }}
                      style={{
                        background: isActive ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.04)',
                        border: isActive ? '1px solid rgba(0,212,255,0.15)' : '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 3,
                        color: isActive ? 'rgba(0,212,255,0.8)' : C.textMuted,
                        width: 18, height: 18,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ScopedStyle>{`
        @keyframes mtfSpin { to { transform: rotate(360deg); } }
      `}</ScopedStyle>
    </div>
  );
}
