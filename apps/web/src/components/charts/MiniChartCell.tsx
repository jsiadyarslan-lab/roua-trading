// ═══════════════════════════════════════════════════════════
// ROUA Trading — MiniChartCell (Compact Chart for Multi-Chart Grid)
// ═══════════════════════════════════════════════════════════
// Replaces the old ChartPanel which manually created chart
// instances and was broken (wrong candles, infinite labels,
// closing broke main chart, no drawing support).
//
// This component reuses the SAME useChart hook as RouaChart,
// so ALL features work: drawing, indicators, overlays, price
// lines, trade markers, etc.
// ═══════════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useChart } from '@/hooks/useChart';
import { useChartWebSocket } from '@/hooks/useChartWebSocket';
import { usePositionsStore } from '@/hooks/usePositionsStore';
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore';
import {
  registerChartInstance,
  unregisterChartInstance,
  registerChartControl,
  unregisterChartControl,
} from '@/hooks/multi-chart-registry';
import type { ChartCellConfig, ChartControlAPI } from '@/hooks/multi-chart-registry';
import { useMultiChartStore } from '@/hooks/useMultiChartStore';
import type { CandleData, ChartType, DrawingTool } from '@/lib/charts/types';
import { TIMEFRAMES } from '@/lib/charts/types';

interface MiniChartCellProps {
  chartId: string;
  symbol: string;
  timeframe: string;
  chartType: ChartType;
  isActive: boolean;
  onActivate: () => void;
  onClose?: () => void;
  canClose?: boolean;
}

// ── Colors (same as old ChartPanel for consistency) ──
const C = {
  bg: '#0B0E14',
  card: '#111620',
  cardBorder: '#1E2530',
  text: '#F0F2F5',
  textDim: '#8B92A8',
  textMuted: '#4B5563',
  cyan: '#00D4FF',
  success: '#3fb950',
  danger: '#f85149',
};

const POPULAR_SYMBOLS = [
  'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'XRP/USDT', 'SOL/USDT',
  'ADA/USDT', 'DOGE/USDT', 'EUR/USD', 'GBP/USD', 'XAU/USD',
  'USD/JPY', 'AUD/USD', 'USD/CAD', 'US30', 'NAS100',
];

const TIMEFRAME_OPTIONS = [
  { value: '1min', label: '1m' },
  { value: '5min', label: '5m' },
  { value: '15min', label: '15m' },
  { value: '30min', label: '30m' },
  { value: '1h', label: '1H' },
  { value: '2h', label: '2H' },
  { value: '4h', label: '4H' },
  { value: '1day', label: '1D' },
  { value: '1week', label: '1W' },
];

export function MiniChartCell({
  chartId,
  symbol,
  timeframe,
  chartType,
  isActive,
  onActivate,
  onClose,
  canClose = true,
}: MiniChartCellProps) {
  // ── Chart hook (same engine as RouaChart) ──
  const chart = useChart({
    symbol,
    timeframe,
    mobile: true, // smaller UI elements
  });

  const updateChartConfig = useMultiChartStore(s => s.updateChartConfig);

  // ── Refs for candle data ──
  const candlesRef = useRef<CandleData[]>([]);
  const setCandlesRef = useRef(chart.setCandles);
  useEffect(() => { setCandlesRef.current = chart.setCandles; }, [chart.setCandles]);
  const updateCandleRef = useRef(chart.updateCandle);
  useEffect(() => { updateCandleRef.current = chart.updateCandle; }, [chart.updateCandle]);
  const resetViewRef = useRef(chart.resetView);
  useEffect(() => { resetViewRef.current = chart.resetView; }, [chart.resetView]);

  // ── Timeframe seconds ref (for candle alignment) ──
  const tfSecondsRef = useRef(15 * 60);
  useEffect(() => {
    const tf = TIMEFRAMES.find(t => t.value === timeframe);
    tfSecondsRef.current = (tf?.minutes || 15) * 60;
  }, [timeframe]);

  // ── Track candle clearing for WebSocket guard ──
  const candlesClearedAtRef = useRef(0);

  // ── UI State ──
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [changePercent, setChangePercent] = useState<number | null>(null);
  const [feedState, setFeedState] = useState<'live' | 'fallback' | 'waiting'>('waiting');
  // FIX: Ref for feedState to avoid stale closure in WebSocket callback
  const feedStateRef = useRef(feedState);
  useEffect(() => { feedStateRef.current = feedState; }, [feedState]);

  // ── Position/Trade price lines ──
  const positions = usePositionsStore(s => s.positions);
  const paperTrades = usePaperTradesStore(s => s.trades);
  const positionLineIdsRef = useRef<string[]>([]);

  // ── WebSocket: Live data (same as RouaChart) ──
  useChartWebSocket({
    symbol,
    timeframe,
    onCandleUpdate: (candle) => {
      if (candlesRef.current.length === 0) {
        const timeSinceClear = Date.now() - candlesClearedAtRef.current;
        if (timeSinceClear < 10_000) return;
      }

      // Align candle timestamp to timeframe interval
      const alignedTime = Math.floor(candle.time / tfSecondsRef.current) * tfSecondsRef.current;
      const alignedCandle = { ...candle, time: alignedTime };

      const idx = candlesRef.current.findIndex(c => c.time === alignedTime);
      const isLastCandle = idx === candlesRef.current.length - 1;

      if (idx >= 0) {
        // Update existing candle
        const existing = candlesRef.current[idx];
        const merged = {
          ...existing,
          high: Math.max(existing.high, alignedCandle.high),
          low: Math.min(existing.low, alignedCandle.low),
          close: alignedCandle.close,
          volume: alignedCandle.volume || existing.volume,
        };
        candlesRef.current[idx] = merged;

        if (isLastCandle) {
          updateCandleRef.current(merged);
        } else {
          setCandlesRef.current([...candlesRef.current], { skipIndicatorRebuild: true });
        }
      } else {
        // New candle
        candlesRef.current.push(alignedCandle);
        setCandlesRef.current([...candlesRef.current], { skipIndicatorRebuild: true });
      }

      // Update price display
      setCurrentPrice(alignedCandle.close);
      if (candlesRef.current.length > 1) {
        const prev = candlesRef.current[candlesRef.current.length - 2].close;
        if (prev > 0) {
          setChangePercent(((alignedCandle.close - prev) / prev) * 100);
        }
      }

      // Switch from fallback to live if WebSocket delivers data
      if (feedStateRef.current === 'fallback' && candlesRef.current.length >= 2) {
        setFeedState('live');
      }
    },
    onPriceUpdate: (price) => {
      chart.updateLastCandle(price);
      setCurrentPrice(prev => prev !== price ? price : prev);

      // Update position prices
      try {
        const { updatePositionPrice } = usePositionsStore.getState();
        updatePositionPrice(symbol, price);
      } catch {}
      try {
        const { updatePrice } = usePaperTradesStore.getState();
        updatePrice(symbol, price);
      } catch {}
    },
    enabled: !chart.isPaused,
  });

  // ── Clear candles on symbol/timeframe change ──
  useEffect(() => {
    candlesRef.current = [];
    candlesClearedAtRef.current = Date.now();
  }, [symbol, timeframe]);

  // ── Fetch Historical Candles ──
  useEffect(() => {
    let cancelled = false;

    const fetchCandles = async () => {
      try {
        setFeedState('waiting');
        const res = await fetch(`/api/exchange/history/${encodeURIComponent(symbol)}?interval=${timeframe}`);
        const j = await res.json();

        if (cancelled) return;

        if (j.success && j.data && j.data.length > 0) {
          setFeedState('live');
          const formatted: CandleData[] = j.data
            .map((c: any) => ({
              time: Math.floor(new Date(c.timestamp).getTime() / 1000),
              open: Number(c.open) || 0,
              high: Number(c.high) || 0,
              low: Number(c.low) || 0,
              close: Number(c.close) || 0,
              volume: Number(c.volume) || 0,
            }))
            .filter(c => !isNaN(c.time) && c.time > 0 && !isNaN(c.open) && !isNaN(c.close));

          // Deduplicate
          const seen = new Set<number>();
          const unique = formatted.filter(c => {
            if (seen.has(c.time)) return false;
            seen.add(c.time);
            return true;
          });
          unique.sort((a, b) => a.time - b.time);

          candlesRef.current = unique;
          setCandlesRef.current(unique, { clearExternal: true });

          // Set price display
          if (unique.length > 0) {
            setCurrentPrice(unique[unique.length - 1].close);
            if (unique.length > 1) {
              const prev = unique[unique.length - 2].close;
              if (prev > 0) {
                setChangePercent(((unique[unique.length - 1].close - prev) / prev) * 100);
              }
            }
          }

          // Auto-fit chart
          requestAnimationFrame(() => {
            if (!cancelled) resetViewRef.current();
          });
        } else {
          if (cancelled) return;
          setFeedState('fallback');
          // Generate simulated data
          generateSimulatedData();
        }
      } catch {
        if (cancelled) return;
        setFeedState('fallback');
        generateSimulatedData();
      }
    };

    const generateSimulatedData = () => {
      const price = currentPrice || 65000;
      const isJPY = symbol.includes('JPY');
      const isBTC = symbol.includes('BTC');
      const dp = isJPY ? 3 : isBTC ? 1 : 5;
      const tf = TIMEFRAMES.find(t => t.value === timeframe);
      const tfMinutes = tf?.minutes || 15;

      const candles: CandleData[] = [];
      let p = price * (0.985 + Math.random() * 0.03);
      const now = Math.floor(Date.now() / 1000);
      const count = 300;

      for (let i = 0; i < count; i++) {
        const t = now - (count - i) * tfMinutes * 60;
        const rng = p * 0.003 * (0.5 + Math.random() * 1.5);
        const o = p;
        const c = p + (Math.random() - 0.485) * rng;
        const h = Math.max(o, c) + Math.random() * rng * 0.5;
        const l = Math.min(o, c) - Math.random() * rng * 0.5;
        const v = Math.round((500 + Math.random() * 2000));
        candles.push({
          time: t,
          open: +o.toFixed(dp),
          high: +h.toFixed(dp),
          low: +l.toFixed(dp),
          close: +c.toFixed(dp),
          volume: v,
        });
        p = c;
      }

      candlesRef.current = candles;
      setCandlesRef.current(candles, { clearExternal: true });

      if (candles.length > 0) {
        setCurrentPrice(candles[candles.length - 1].close);
        if (candles.length > 1) {
          const prev = candles[candles.length - 2].close;
          if (prev > 0) {
            setChangePercent(((candles[candles.length - 1].close - prev) / prev) * 100);
          }
        }
      }

      requestAnimationFrame(() => {
        if (!cancelled) resetViewRef.current();
      });
    };

    fetchCandles();

    return () => { cancelled = true; };
  }, [symbol, timeframe]);

  // ── Register chart instance + control API with multi-chart registry ──
  // Uses a ref-based approach to avoid dependency array issues that could
  // cause React error #185 (Cannot update a component while rendering)
  const chartRef = chart.chartRef;
  const mainSeriesRef = chart.candleSeriesRef;

  useEffect(() => {
    const chartApi = chartRef.current;
    const mainSeries = mainSeriesRef?.current;

    if (chartApi && mainSeries) {
      registerChartInstance(chartId, chartApi, mainSeries);
    }

    // Register ChartControlAPI for toolbar routing
    const controlApi: ChartControlAPI = {
      zoomIn: chart.zoomIn,
      zoomOut: chart.zoomOut,
      resetView: chart.resetView,
      setChartType: (type: ChartType) => {
        updateChartConfig(chartId, { chartType: type });
      },
      setTool: chart.setTool,
      togglePause: chart.togglePause,
      get isPaused() { return chart.isPaused; },
      get activeTool() { return chart.activeTool; },
      clearDrawings: chart.clearDrawings,
      exportPNG: chart.exportPNG,
      exportCSV: chart.exportCSV,
      exportSVG: chart.exportSVG,
      toggleFullscreen: () => {},
      isFullscreen: false,
      addPriceLine: chart.addPriceLine,
      removePriceLine: chart.removePriceLine,
      setCrosshairMode: chart.setCrosshairMode,
    };

    registerChartControl(chartId, controlApi);

    return () => {
      unregisterChartInstance(chartId);
      unregisterChartControl(chartId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartId]);

  // ── Re-register chart instance when it becomes available ──
  // useChart creates the chart asynchronously, so the first effect might run
  // before the chart is created. This effect watches for the chart becoming
  // available and registers it then.
  const [chartReady, setChartReady] = useState(false);

  useEffect(() => {
    const check = () => {
      if (chartRef.current && mainSeriesRef?.current) {
        registerChartInstance(chartId, chartRef.current, mainSeriesRef.current);
        setChartReady(true);
      }
    };
    check();
    // Poll for up to 5 seconds (chart usually appears within 100ms)
    const interval = setInterval(check, 100);
    const timeout = setTimeout(() => clearInterval(interval), 5000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [chartId, chartRef, mainSeriesRef]);

  // ── Position/Trade price lines ──
  const normalizeSymbol = (s: string) => s.toUpperCase().replace(/[/\-_]/g, '');

  useEffect(() => {
    const series = chart.candleSeriesRef?.current;
    if (!series) return;

    // Remove old lines
    positionLineIdsRef.current.forEach(id => {
      try { chart.removePriceLine(id); } catch {}
    });
    positionLineIdsRef.current = [];

    const chartSymbol = normalizeSymbol(symbol);

    const addLine = (id: string, price: number, color: string, label: string = '', lineWidth: number = 1, lineStyle: number = 2, axisLabelVisible: boolean = true) => {
      chart.addPriceLine(id, price, color, label, lineWidth, lineStyle, axisLabelVisible);
      positionLineIdsRef.current.push(id);
    };

    // Exchange positions
    positions.forEach(pos => {
      const posSymbol = normalizeSymbol(pos.symbol || '');
      if (!posSymbol.includes(chartSymbol) && !chartSymbol.includes(posSymbol)) return;
      const entryPrice = Number(pos.entryPrice || pos.avgEntryPrice || 0);
      const isLong = (pos.side || '').toLowerCase() === 'long';
      if (entryPrice > 0) {
        addLine(`pos-entry-${pos.id || posSymbol}`, entryPrice, '#00D4FF', isLong ? 'Entry' : 'Entry', 2, 2, true);
      }
      const sl = Number(pos.stopLoss || pos.sl || 0);
      if (sl > 0) {
        addLine(`pos-sl-${pos.id || posSymbol}`, sl, '#FF4757', `SL`, 1, 2, true);
      }
      const tp = Number(pos.takeProfit || pos.tp || 0);
      if (tp > 0) {
        addLine(`pos-tp-${pos.id || posSymbol}`, tp, '#00FFA3', `TP`, 1, 2, true);
      }
    });

    // Paper trades
    const groupedLines = new Map<string, any>();
    paperTrades.forEach(trade => {
      const tradeSymbol = normalizeSymbol(trade.symbol || '');
      if (!tradeSymbol.includes(chartSymbol) && !chartSymbol.includes(tradeSymbol)) return;
      const entryPrice = Number(trade.entryPrice || 0);
      if (entryPrice <= 0) return;
      const key = `${trade.side}-${entryPrice}-${trade.sl}-${trade.tp}`;
      if (groupedLines.has(key)) {
        groupedLines.get(key)!.count += 1;
      } else {
        groupedLines.set(key, { ...trade, count: 1 });
      }
    });

    groupedLines.forEach((trade, key) => {
      const entryPrice = Number(trade.entryPrice || 0);
      const isLong = (trade.side || '').toLowerCase() === 'long';
      addLine(`trade-entry-${key}`, entryPrice, '#00D4FF', isLong ? 'Entry' : 'Entry', 2, 2, true);
      if (trade.sl && Number(trade.sl) > 0) {
        addLine(`trade-sl-${key}`, Number(trade.sl), '#FF4757', `SL`, 1, 2, true);
      }
      if (trade.tp && Number(trade.tp) > 0) {
        addLine(`trade-tp-${key}`, Number(trade.tp), '#00FFA3', `TP`, 1, 2, true);
      }
    });

    return () => {
      positionLineIdsRef.current.forEach(id => {
        try { chart.removePriceLine(id); } catch {}
      });
      positionLineIdsRef.current = [];
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, paperTrades, symbol, chartReady]);

  // ── Symbol/timeframe change handlers ──
  const handleSymbolChange = useCallback((newSymbol: string) => {
    updateChartConfig(chartId, { symbol: newSymbol });
  }, [chartId, updateChartConfig]);

  const handleTimeframeChange = useCallback((newTimeframe: string) => {
    updateChartConfig(chartId, { timeframe: newTimeframe });
  }, [chartId, updateChartConfig]);

  // ── Price formatting ──
  const formatPrice = (price: number | null): string => {
    if (price === null) return '—';
    if (price > 10000) return price.toFixed(0);
    if (price > 100) return price.toFixed(1);
    if (price > 1) return price.toFixed(2);
    return price.toFixed(5);
  };

  const isPositive = changePercent !== null && changePercent >= 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: 6,
        border: isActive
          ? '1.5px solid rgba(0,212,255,0.5)'
          : `1px solid ${C.cardBorder}`,
        boxShadow: isActive
          ? '0 0 16px rgba(0,212,255,0.15), inset 0 0 8px rgba(0,212,255,0.05)'
          : 'none',
        background: C.card,
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        minHeight: 0,
        cursor: 'default',
      }}
      onMouseDown={onActivate}
    >
      {/* ── Mini Header (28px) ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        height: 28,
        padding: '0 6px',
        borderBottom: `1px solid ${C.cardBorder}`,
        background: isActive ? 'rgba(0,212,255,0.04)' : 'rgba(17,22,32,0.95)',
        flexShrink: 0,
        gap: 4,
        direction: 'ltr',
      }}>
        {/* Symbol selector */}
        <select
          value={symbol}
          onClick={e => e.stopPropagation()}
          onChange={e => handleSymbolChange(e.target.value)}
          style={{
            background: 'rgba(0,212,255,0.08)',
            border: '1px solid rgba(0,212,255,0.2)',
            borderRadius: 3,
            color: C.cyan,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            fontWeight: 700,
            padding: '1px 4px',
            cursor: 'pointer',
            outline: 'none',
            maxWidth: 90,
            flexShrink: 0,
          }}
        >
          {POPULAR_SYMBOLS.map(p => (
            <option key={p} value={p} style={{ background: C.card, color: C.text }}>{p}</option>
          ))}
        </select>

        {/* Timeframe buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden' }}>
          {TIMEFRAME_OPTIONS.slice(0, 6).map(tf => {
            const isActiveTf = timeframe === tf.value;
            return (
              <button
                key={tf.value}
                onClick={e => { e.stopPropagation(); handleTimeframeChange(tf.value); }}
                style={{
                  background: isActiveTf ? 'rgba(0,212,255,0.15)' : 'transparent',
                  border: isActiveTf ? '1px solid rgba(0,212,255,0.3)' : '1px solid transparent',
                  borderRadius: 2,
                  color: isActiveTf ? C.cyan : C.textMuted,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 8,
                  fontWeight: isActiveTf ? 700 : 500,
                  padding: '0 3px',
                  height: 18,
                  cursor: 'pointer',
                  transition: 'all 0.1s',
                  whiteSpace: 'nowrap',
                }}
              >
                {tf.label}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        {/* Feed state indicator */}
        {feedState === 'waiting' && (
          <div style={{
            width: 10, height: 10,
            border: `2px solid ${C.cardBorder}`,
            borderTopColor: C.cyan,
            borderRadius: '50%',
            animation: 'mcSpin 1s linear infinite',
          }} />
        )}

        {chart.isPaused && feedState !== 'waiting' && (
          <span style={{ color: '#fbbf24', fontSize: 8, fontWeight: 700 }}>||</span>
        )}

        {currentPrice !== null && feedState !== 'waiting' && (
          <>
            <span style={{
              color: C.text,
              fontSize: 10,
              fontWeight: 600,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {formatPrice(currentPrice)}
            </span>
            {changePercent !== null && (
              <span style={{
                color: isPositive ? C.success : C.danger,
                fontSize: 8,
                fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                padding: '0 3px',
                borderRadius: 2,
                background: isPositive ? 'rgba(63,185,80,0.1)' : 'rgba(248,81,73,0.1)',
              }}>
                {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
              </span>
            )}
          </>
        )}

        {feedState === 'fallback' && (
          <span style={{ color: '#fbbf24', fontSize: 7, fontWeight: 600 }}>SIM</span>
        )}

        {canClose && onClose && (
          <button
            onClick={e => { e.stopPropagation(); onClose(); }}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 2,
              color: C.textMuted,
              width: 18,
              height: 18,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              transition: 'all 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,71,87,0.15)';
              (e.currentTarget as HTMLElement).style.color = C.danger;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
              (e.currentTarget as HTMLElement).style.color = C.textMuted;
            }}
            title="Close chart"
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Chart Canvas — useChart renders here ── */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', background: C.bg }}>
        <div
          ref={chart.containerRef as any}
          style={{
            width: '100%',
            height: '100%',
            position: 'absolute',
            inset: 0,
          }}
        />
      </div>
    </div>
  );
}
