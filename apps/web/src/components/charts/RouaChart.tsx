// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Main Component
// Professional trading chart using lightweight-charts v5
// ═══════════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useChart } from '@/hooks/useChart';
import { useChartWebSocket } from '@/hooks/useChartWebSocket';
import { useSymbolStore } from '@/hooks/useSymbolStore';
import { usePositionsStore } from '@/hooks/usePositionsStore';
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore';
import type { CandleData, CrosshairData, ChartType, DrawingTool, ActiveIndicator, AIPattern, NewsMarker } from '@/lib/charts/types';
import { TIMEFRAMES, INDICATOR_CONFIGS } from '@/lib/charts/types';
import { ChartToolbar } from './ChartToolbar';
import { CrosshairOverlay } from './CrosshairOverlay';
import { DrawingPanel } from './DrawingPanel';
import { IndicatorPanel } from './IndicatorPanel';
import { IndicatorSettings } from './IndicatorSettings';
import { VolumeProfile } from './VolumeProfile';
import { NewsMarkers, createNewsChartMarkers } from './NewsMarkers';
import { WatchlistOverlay } from './WatchlistOverlay';
import { AIPatternPanel } from './AIPatternPanel';
import { ChartTrading } from './ChartTrading';
import { TemplateManager } from './TemplateManager';
import { ChartSettingsPanel } from './ChartSettingsPanel';

interface RouaChartProps {
  currentPrice?: number | null;
  mobile?: boolean;
  compact?: boolean;
  hideToolbar?: boolean;
  onExpand?: (() => void) | null;
  isChartFullscreen?: boolean;
  onToggleChartFullscreen?: () => void;
}

export default function RouaChart({
  currentPrice = null,
  mobile = false,
  compact = false,
  hideToolbar = false,
  onExpand = null,
  isChartFullscreen = false,
  onToggleChartFullscreen,
}: RouaChartProps) {
  const { selectedSymbol, timeframe, setTimeframe } = useSymbolStore();
  const [crosshairData, setCrosshairData] = useState<CrosshairData | null>(null);
  const [feedState, setFeedState] = useState<'live' | 'fallback' | 'waiting'>('waiting');
  const [candleCountdown, setCandleCountdown] = useState('—');
  const [lotSize, setLotSize] = useState(0.01);
  const [showDrawingPanel, setShowDrawingPanel] = useState(false);
  const [showIndicatorPanel, setShowIndicatorPanel] = useState(false);
  const [settingsIndicator, setSettingsIndicator] = useState<ActiveIndicator | null>(null);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);

  // ── New Panel States ──
  const [showVolumeProfile, setShowVolumeProfile] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showChartTrading, setShowChartTrading] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [showChartSettings, setShowChartSettings] = useState(false);
  const [aiPatterns, setAiPatterns] = useState<AIPattern[]>([]);
  const [newsMarkers, setNewsMarkers] = useState<NewsMarker[]>([]);
  const positionLineIdsRef = useRef<string[]>([]);

  const candlesRef = useRef<CandleData[]>([]);
  const prevPriceRef = useRef(currentPrice);
  const [pricePulse, setPricePulse] = useState(false);



  // ── Chart Hook ─────────────────────────────────────────
  const chart = useChart({
    symbol: selectedSymbol,
    timeframe,
    onCrosshairMove: setCrosshairData,
  });

  // ── WebSocket ──────────────────────────────────────────
  const ws = useChartWebSocket({
    symbol: selectedSymbol,
    timeframe,
    onCandleUpdate: (candle) => {
      // Update or add candle
      const idx = candlesRef.current.findIndex(c => c.time === candle.time);
      if (idx >= 0) {
        candlesRef.current[idx] = candle;
      } else {
        candlesRef.current.push(candle);
      }
      chart.setCandles(candlesRef.current);
    },
    onPriceUpdate: (price) => {
      chart.updateLastCandle(price);
    },
    enabled: !chart.isPaused,
  });

  // ── Fetch Historical Candles ───────────────────────────
  useEffect(() => {
    let cancelled = false; // Guard against stale responses after symbol change

    const fetchCandles = async () => {
      try {
        setFeedState('waiting');
        const res = await fetch(`/api/exchange/history/${encodeURIComponent(selectedSymbol)}?interval=${timeframe}`);
        const j = await res.json();

        if (cancelled) return; // Symbol changed while fetching — discard

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
          // Deduplicate by time
          const seen = new Set<number>();
          const unique = formatted.filter(c => {
            if (seen.has(c.time)) return false;
            seen.add(c.time);
            return true;
          });
          // Sort by time (lightweight-charts v5 requires strictly ascending time)
          unique.sort((a, b) => a.time - b.time);
          candlesRef.current = unique;
          chart.setCandles(unique);
        } else {
          if (cancelled) return;
          setFeedState('fallback');
          // Generate simulated data as fallback
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
      const isJPY = selectedSymbol.includes('JPY');
      const isBTC = selectedSymbol.includes('BTC');
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

      // Data is already sorted by construction (oldest → newest)
      candlesRef.current = candles;
      chart.setCandles(candles);
    };

    fetchCandles();

    return () => { cancelled = true; };
  }, [selectedSymbol, timeframe]);

  // ── Live Price Sync ────────────────────────────────────
  useEffect(() => {
    if (currentPrice && candlesRef.current.length) {
      chart.updateLastCandle(currentPrice);
    }
  }, [currentPrice]);

  // ── Price Pulse Animation ──────────────────────────────
  useEffect(() => {
    if (currentPrice && prevPriceRef.current && currentPrice !== prevPriceRef.current) {
      setPricePulse(true);
      const timer = setTimeout(() => setPricePulse(false), 420);
      prevPriceRef.current = currentPrice;
      return () => clearTimeout(timer);
    }
    prevPriceRef.current = currentPrice;
  }, [currentPrice]);

  // ── Candle Countdown ───────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const tf = TIMEFRAMES.find(t => t.value === timeframe);
      const minutes = tf?.minutes || 15;
      const intervalMs = minutes * 60 * 1000;
      const remaining = intervalMs - (Date.now() % intervalMs);
      const totalSeconds = Math.max(0, Math.floor(remaining / 1000));
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      setCandleCountdown(`${mins}:${secs.toString().padStart(2, '0')}`);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [timeframe]);



  // ── Position Overlay ───────────────────────────────────
  const positions = usePositionsStore(s => s.positions);
  const paperTrades = usePaperTradesStore(s => s.trades);

  // ── Helper: Normalize symbol for matching ──
  const normalizeSymbol = (s: string) => s.toUpperCase().replace(/[/\-_]/g, '');

  // ── Trade Overlay State ──
  interface TradeOverlay {
    key: string;
    y: number;
    price: number;
    type: 'entry' | 'sl' | 'tp';
    direction: 'long' | 'short';
    source: 'manual' | 'bot' | 'exchange';
    qty: number;
    pnl?: number;
  }

  const [tradeOverlays, setTradeOverlays] = useState<TradeOverlay[]>([]);
  const [fillZones, setFillZones] = useState<Array<{
    top: number; height: number; type: 'sl' | 'tp'; key: string;
  }>>([]);

  // Keep latest positions/trades in ref so the rAF callback always has fresh data
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const paperTradesRef = useRef(paperTrades);
  paperTradesRef.current = paperTrades;
  const selectedSymbolRef = useRef(selectedSymbol);
  selectedSymbolRef.current = selectedSymbol;

  // rAF deduplication — cancel previous frame before scheduling new one
  const rafIdRef = useRef<number>(0);
  const isMountedRef = useRef(true);

  // ── Recalculate overlay positions (runs on every scroll/zoom via rAF) ──
  const scheduleOverlayUpdate = useCallback(() => {
    cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      if (!isMountedRef.current) return;

      const chartSymbol = normalizeSymbol(selectedSymbolRef.current);
      const overlays: TradeOverlay[] = [];
      const zones: typeof fillZones = [];

      const processTrade = (
        entryPrice: number, direction: 'long' | 'short',
        sl?: number, tp?: number, qty = 0, pnl?: number,
        source: 'manual' | 'bot' | 'exchange' = 'manual', prefix = ''
      ) => {
        // Compute each line's Y coordinate independently so they don't
        // disappear when the entry scrolls off-screen
        const entryY = chart.getPriceCoordinate(entryPrice);
        const slY = sl && sl > 0 ? chart.getPriceCoordinate(sl) : null;
        const tpY = tp && tp > 0 ? chart.getPriceCoordinate(tp) : null;

        // Only add entry overlay if it's visible
        if (entryY !== null) {
          overlays.push({
            key: `${prefix}entry`, y: entryY, price: entryPrice,
            type: 'entry', direction, source, qty, pnl,
          });
        }

        // SL overlay — independent of entry visibility
        if (slY !== null) {
          overlays.push({
            key: `${prefix}sl`, y: slY, price: sl!,
            type: 'sl', direction, source, qty,
          });
        }

        // TP overlay — independent of entry visibility
        if (tpY !== null) {
          overlays.push({
            key: `${prefix}tp`, y: tpY, price: tp!,
            type: 'tp', direction, source, qty,
          });
        }

        // Fill zones: only draw when both boundary lines are visible
        if (slY !== null && entryY !== null) {
          zones.push({
            top: Math.min(entryY, slY),
            height: Math.abs(entryY - slY),
            type: 'sl', key: `${prefix}sl-zone`,
          });
        }
        if (tpY !== null && entryY !== null) {
          zones.push({
            top: Math.min(entryY, tpY),
            height: Math.abs(entryY - tpY),
            type: 'tp', key: `${prefix}tp-zone`,
          });
        }
      };

      // Exchange positions
      positionsRef.current.forEach(pos => {
        const posSymbol = normalizeSymbol(pos.symbol || '');
        if (!posSymbol.includes(chartSymbol) && !chartSymbol.includes(posSymbol)) return;
        const entryPrice = Number(pos.avgEntryPrice || 0);
        if (entryPrice <= 0) return;
        const slVal = Number(pos.sl || pos.stopLoss || 0);
        const tpVal = Number(pos.tp || pos.takeProfit || 0);
        processTrade(
          entryPrice,
          (pos.side || '').toLowerCase() === 'long' ? 'long' : 'short',
          slVal > 0 ? slVal : undefined,
          tpVal > 0 ? tpVal : undefined,
          pos.qty || 0, undefined, 'exchange',
          `pos-${pos.id}-`
        );
      });

      // Paper trades (including bot trades)
      paperTradesRef.current.forEach(trade => {
        const symbol = normalizeSymbol(trade.symbol || '');
        if (!symbol.includes(chartSymbol) && !chartSymbol.includes(symbol)) return;
        const entryPrice = Number(trade.entryPrice || 0);
        if (entryPrice <= 0) return;
        processTrade(
          entryPrice,
          (trade.side || '').toLowerCase() === 'long' ? 'long' : 'short',
          trade.sl ? Number(trade.sl) : undefined,
          trade.tp ? Number(trade.tp) : undefined,
          trade.qty || 0, trade.unrealizedPnl,
          trade.source === 'bot' ? 'bot' : 'manual',
          `trade-${trade.id}-`
        );
      });

      setTradeOverlays(overlays);
      setFillZones(zones);
    });
  }, [chart]);

  // ── Subscribe to chart scroll/zoom (horizontal + vertical) ──
  useEffect(() => {
    const unsubscribe = chart.onVisibleRangeChange(scheduleOverlayUpdate);
    // Initial calculation with a small delay to ensure chart is rendered
    const timer = setTimeout(scheduleOverlayUpdate, 200);

    // Periodic overlay refresh to catch vertical price-scale changes
    // (lightweight-charts v5 has no priceScale subscribeVisiblePriceRangeChange)
    const priceScaleInterval = setInterval(scheduleOverlayUpdate, 1000);

    return () => { unsubscribe(); clearTimeout(timer); clearInterval(priceScaleInterval); };
  }, [chart, scheduleOverlayUpdate]);

  // ── Mount guard for rAF callbacks ──
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  // ── Re-calculate overlays when trades change ──
  useEffect(() => {
    scheduleOverlayUpdate();
  }, [positions, paperTrades, scheduleOverlayUpdate]);

  // ── Apply Position Lines to Chart (price lines only, no labels) ──
  useEffect(() => {
    positionLineIdsRef.current.forEach(id => chart.removePriceLine(id));
    positionLineIdsRef.current = [];

    const chartSymbol = normalizeSymbol(selectedSymbol);

    const addLine = (id: string, price: number, color: string, lineWidth: number, lineStyle: number) => {
      chart.addPriceLine(id, price, color, '', lineWidth, lineStyle, false);
      positionLineIdsRef.current.push(id);
    };

    // Exchange positions
    positions.forEach(pos => {
      const posSymbol = normalizeSymbol(pos.symbol || '');
      if (!posSymbol.includes(chartSymbol) && !chartSymbol.includes(posSymbol)) return;
      const entryPrice = Number(pos.avgEntryPrice || 0);
      if (entryPrice > 0) {
        const isLong = (pos.side || '').toLowerCase() === 'long';
        addLine(`pos-entry-${pos.id || posSymbol}`, entryPrice, isLong ? '#3fb950' : '#f85149', 2, 0);
      }
      const sl = Number(pos.sl || pos.stopLoss || 0);
      if (sl > 0) addLine(`pos-sl-${pos.id || posSymbol}`, sl, '#f85149', 1, 2);
      const tp = Number(pos.tp || pos.takeProfit || 0);
      if (tp > 0) addLine(`pos-tp-${pos.id || posSymbol}`, tp, '#3fb950', 1, 2);
    });

    // Paper trades (including bot trades)
    paperTrades.forEach(trade => {
      const symbol = normalizeSymbol(trade.symbol || '');
      if (!symbol.includes(chartSymbol) && !chartSymbol.includes(symbol)) return;
      const entryPrice = Number(trade.entryPrice || 0);
      if (entryPrice > 0) {
        const isLong = (trade.side || '').toLowerCase() === 'long';
        addLine(`trade-entry-${trade.id}`, entryPrice, isLong ? '#3fb950' : '#f85149', 2, 0);
      }
      if (trade.sl && Number(trade.sl) > 0) addLine(`trade-sl-${trade.id}`, Number(trade.sl), '#f85149', 1, 2);
      if (trade.tp && Number(trade.tp) > 0) addLine(`trade-tp-${trade.id}`, Number(trade.tp), '#3fb950', 1, 2);
    });

    return () => {
      positionLineIdsRef.current.forEach(id => chart.removePriceLine(id));
      positionLineIdsRef.current = [];
    };
  }, [positions, paperTrades, selectedSymbol, chart]);



  // ── Indicator Management ───────────────────────────────
  const handleToggleIndicator = useCallback((key: string) => {
    const existing = chart.getActiveIndicators().find(i => i.key === key);
    if (existing) {
      chart.removeIndicator(key);
    } else {
      const config = INDICATOR_CONFIGS.find(c => c.key === key);
      if (!config) return;
      const indicator: ActiveIndicator = {
        key: config.key as any,
        params: { ...config.defaultParams },
        color: config.defaultColor,
        opacity: config.defaultOpacity,
        visible: true,
      };
      chart.addIndicator(indicator);
    }
  }, [chart]);

  const handleOpenSettings = useCallback((key: string) => {
    const existing = chart.getActiveIndicators().find(i => i.key === key);
    const config = INDICATOR_CONFIGS.find(c => c.key === key);
    if (!config) return;

    const indicator: ActiveIndicator = existing || {
      key: config.key as any,
      params: { ...config.defaultParams },
      color: config.defaultColor,
      opacity: config.defaultOpacity,
      visible: true,
    };
    setSettingsIndicator(indicator);
    setShowSettingsPanel(true);
  }, [chart]);

  const handleSaveSettings = useCallback((indicator: ActiveIndicator) => {
    chart.addIndicator(indicator);
    setShowSettingsPanel(false);
    setSettingsIndicator(null);
  }, [chart]);

  // ── AI Pattern Handler ─────────────────────────────────
  const handlePatternsDetected = useCallback((patterns: AIPattern[]) => {
    setAiPatterns(patterns);
  }, []);

  // ── News Markers Handler ───────────────────────────────
  const handleNewsUpdate = useCallback((markers: NewsMarker[]) => {
    setNewsMarkers(markers);
  }, []);

  // ── Chart Trading Order Handler ────────────────────────
  const [orderError, setOrderError] = useState<string | null>(null);
  
  const handlePlaceOrder = useCallback((order: any) => {
    // Validate SL/TP placement
    if (order.side === 'buy') {
      if (order.sl && order.sl >= order.entryPrice) {
        setOrderError('يجب أن يكون وقف الخسارة أقل من سعر الدخول للشراء');
        setTimeout(() => setOrderError(null), 3500);
        return;
      }
      if (order.tp && order.tp <= order.entryPrice) {
        setOrderError('يجب أن يكون جني الأرباح أعلى من سعر الدخول للشراء');
        setTimeout(() => setOrderError(null), 3500);
        return;
      }
    } else {
      if (order.sl && order.sl <= order.entryPrice) {
        setOrderError('يجب أن يكون وقف الخسارة أعلى من سعر الدخول للبيع');
        setTimeout(() => setOrderError(null), 3500);
        return;
      }
      if (order.tp && order.tp >= order.entryPrice) {
        setOrderError('يجب أن يكون جني الأرباح أقل من سعر الدخول للبيع');
        setTimeout(() => setOrderError(null), 3500);
        return;
      }
    }

    // Place order via paper trades store
    const { addTrade } = usePaperTradesStore.getState();
    addTrade({
      symbol: selectedSymbol,
      side: order.side === 'buy' ? 'long' : 'short',
      qty: order.quantity,
      entryPrice: order.entryPrice,
      currentPrice: order.entryPrice,
      sl: order.sl || undefined,
      tp: order.tp || undefined,
      entryTime: Date.now(),
      strategy: 'manual',
      source: 'manual',
    });

    console.log('Chart order placed:', order);
  }, [selectedSymbol]);

  // ── Apply Combined Markers (News + AI Patterns) to Chart ──
  useEffect(() => {
    const combinedMarkers: any[] = [];

    // Add news markers
    if (newsMarkers.length) {
      const newsChartMarkers = createNewsChartMarkers(newsMarkers);
      combinedMarkers.push(...newsChartMarkers);
    }

    // Add AI pattern markers
    if (aiPatterns.length) {
      aiPatterns.forEach(p => {
        combinedMarkers.push({
          time: p.time as any,
          position: (p.direction === 'bullish' ? 'belowBar' : 'aboveBar') as 'belowBar' | 'aboveBar',
          color: p.direction === 'bullish' ? '#3fb950' : p.direction === 'bearish' ? '#f85149' : '#fbbf24',
          shape: (p.direction === 'bullish' ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
          text: p.labelAr || p.type,
        });
      });
    }

    // Sort by time and apply
    combinedMarkers.sort((a, b) => (a.time as number) - (b.time as number));
    chart.setMarkers(combinedMarkers);
  }, [newsMarkers, aiPatterns, chart]);

  // ── Color Palette ──────────────────────────────────────
  const COLORS = {
    bg: '#0B0E14',
    card: '#151A22',
    border: '#2A313C',
    text: '#F0F2F5',
    textSecondary: '#8B92A8',
    textMuted: '#64748b',
    cyan: '#00D4FF',
    success: '#3fb950',
    danger: '#f85149',
    warning: '#fbbf24',
  };

  const toolbarHeight = hideToolbar ? 0 : mobile ? 32 : 38;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: COLORS.bg,
        position: 'relative',
      }}
      className="roua-chart-root"
    >
      {/* ── TOOLBAR ── */}
      {!hideToolbar && <ChartToolbar
        symbol={selectedSymbol}
        timeframe={timeframe}
        chartType={chart.settings.type}
        onSetTimeframe={setTimeframe}
        onSetChartType={chart.setChartType}
        onZoomIn={chart.zoomIn}
        onZoomOut={chart.zoomOut}
        onResetView={chart.resetView}
        onToggleDrawings={() => setShowDrawingPanel(!showDrawingPanel)}
        onToggleIndicators={() => setShowIndicatorPanel(!showIndicatorPanel)}
        onExportPNG={chart.exportPNG}
        onExportCSV={chart.exportCSV}
        onExportSVG={chart.exportSVG}
        onToggleFullscreen={onToggleChartFullscreen || chart.toggleFullscreen}
        isFullscreen={isChartFullscreen || chart.isFullscreen}
        activeTool={chart.activeTool}
        onSetTool={chart.setTool}
        onClearDrawings={chart.clearDrawings}
        isPaused={chart.isPaused}
        onTogglePause={chart.togglePause}
        mobile={mobile}
        height={toolbarHeight}
        // ── New Toolbar Props ──
        onToggleVolumeProfile={() => setShowVolumeProfile(!showVolumeProfile)}
        onToggleAIPanel={() => setShowAIPanel(!showAIPanel)}
        onToggleChartTrading={() => setShowChartTrading(!showChartTrading)}
        onToggleTemplateManager={() => setShowTemplateManager(!showTemplateManager)}
        onToggleWatchlist={() => setShowWatchlist(!showWatchlist)}
        onToggleChartSettings={() => setShowChartSettings(!showChartSettings)}
        showVolumeProfile={showVolumeProfile}
        showAIPanel={showAIPanel}
        showChartTrading={showChartTrading}
        showWatchlist={showWatchlist}
      />}

      {/* ── CHART AREA ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {/* OHLC Overlay */}
        <CrosshairOverlay
          symbol={selectedSymbol}
          currentPrice={currentPrice}
          crosshairData={crosshairData}
          pricePulse={pricePulse}
          candleCountdown={candleCountdown}
          feedState={feedState}
          connectionState={ws.connectionState}
          compact={compact}
          mobile={mobile}
          candles={candlesRef.current}
          showCandleTimer={chart.settings.showCandleTimer}
        />

        {/* Chart Wrapper — contains canvas + overlays */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>

          {/* Chart Canvas Container — lightweight-charts renders here ONLY */}
          <div
            ref={chart.containerRef as any}
            style={{
              position: 'absolute',
              inset: 0,
              background: COLORS.bg,
            }}
          />

          {/* Overlay Layer — sibling of canvas container, always on top */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>

            {/* Symbol Watermark — REMOVED: name already shown in toolbar/CrosshairOverlay */}

            {/* ── Fill Zones (colored bands between entry-SL/TP) ── */}
            {fillZones.map(zone => (
              <div
                key={zone.key}
                style={{
                  position: 'absolute',
                  top: zone.top,
                  left: 0,
                  right: 0,
                  height: Math.max(zone.height, 1),
                  background: zone.type === 'sl'
                    ? 'rgba(248, 81, 73, 0.08)'
                    : 'rgba(63, 185, 80, 0.08)',
                  pointerEvents: 'none',
                  zIndex: 2,
                }}
              />
            ))}

            {/* ── Trade Line Labels (HTML overlays like TradingView) ── */}
            {tradeOverlays.map(ov => {
              const fmt = (v: number) => v > 1000 ? v.toFixed(2) : v.toFixed(5);
              const isEntry = ov.type === 'entry';
              const isSL = ov.type === 'sl';
              const isTP = ov.type === 'tp';
              const isLong = ov.direction === 'long';
              const entryColor = isLong ? '#3fb950' : '#f85149';
              const lineColor = isSL ? '#f85149' : isTP ? '#3fb950' : entryColor;

              let labelText = '';
              let bg: string;
              let textColor: string;

              if (isEntry) {
                const dir = isLong ? 'Long' : 'Short';
                const src = ov.source === 'bot' ? '🤖 ' : '';
                const pnlStr = ov.pnl !== undefined && ov.pnl !== 0
                  ? ` ${ov.pnl >= 0 ? '+' : ''}${ov.pnl.toFixed(2)}` : '';
                labelText = `${src}${dir} ${ov.qty}${pnlStr}`;
                bg = isLong ? 'rgba(63,185,80,0.18)' : 'rgba(248,81,73,0.18)';
                textColor = lineColor;
              } else if (isSL) {
                labelText = `SL ${fmt(ov.price)}`;
                bg = 'rgba(248,81,73,0.18)';
                textColor = '#f85149';
              } else {
                labelText = `TP ${fmt(ov.price)}`;
                bg = 'rgba(63,185,80,0.18)';
                textColor = '#3fb950';
              }

              return (
                <div
                  key={ov.key}
                  style={{
                    position: 'absolute',
                    top: ov.y - 10,
                    left: 8,
                    zIndex: 10,
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: textColor,
                    background: bg,
                    padding: '2px 7px',
                    borderRadius: 3,
                    borderLeft: `2px solid ${lineColor}`,
                    whiteSpace: 'nowrap',
                    lineHeight: '18px',
                    letterSpacing: 0.3,
                  }}>
                    {labelText}
                  </span>
                </div>
              );
            })}

            {/* Volume Profile (overlaid on chart) */}
            {showVolumeProfile && (
              <VolumeProfile
                candles={candlesRef.current}
                width={80}
                rows={24}
                visible={showVolumeProfile}
              />
            )}

          {/* ── Quick Trade Buttons (top-left, simple) ── */}
          {!mobile && currentPrice && (
            <div className="absolute top-3 left-3 z-10 flex gap-2">
              <button
                onClick={() => {
                  const { addTrade } = usePaperTradesStore.getState();
                  addTrade({
                    symbol: selectedSymbol,
                    side: 'long',
                    qty: lotSize,
                    entryPrice: typeof currentPrice === 'number' ? currentPrice : 0,
                    currentPrice: typeof currentPrice === 'number' ? currentPrice : 0,
                    entryTime: Date.now(),
                    strategy: 'quick',
                    source: 'manual',
                  });
                }}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg text-sm font-bold"
                title="شراء سريع"
              >شراء</button>

              <button
                onClick={() => {
                  const { addTrade } = usePaperTradesStore.getState();
                  addTrade({
                    symbol: selectedSymbol,
                    side: 'short',
                    qty: lotSize,
                    entryPrice: typeof currentPrice === 'number' ? currentPrice : 0,
                    currentPrice: typeof currentPrice === 'number' ? currentPrice : 0,
                    entryTime: Date.now(),
                    strategy: 'quick',
                    source: 'manual',
                  });
                }}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded-lg text-sm font-bold"
                title="بيع سريع"
              >بيع</button>
            </div>
          )}

          {/* Candle countdown removed from chart — shown only in header via CrosshairOverlay */}
          </div>{/* ── Overlay Layer close ── */}
        </div>{/* ── Chart Wrapper close ── */}

        {/* Drawing Panel (floating) */}
        {showDrawingPanel && (
          <DrawingPanel
            activeTool={chart.activeTool}
            onSetTool={chart.setTool}
            onClose={() => setShowDrawingPanel(false)}
            onClearAll={chart.clearDrawings}
          />
        )}

        {/* Indicator Panel (floating) */}
        {showIndicatorPanel && (
          <IndicatorPanel
            activeIndicators={chart.getActiveIndicators().map(i => i.key)}
            onToggleIndicator={handleToggleIndicator}
            onOpenSettings={handleOpenSettings}
            onClose={() => setShowIndicatorPanel(false)}
          />
        )}

        {/* Indicator Settings Panel */}
        {showSettingsPanel && settingsIndicator && (
          <IndicatorSettings
            indicator={settingsIndicator}
            onSave={handleSaveSettings}
            onClose={() => { setShowSettingsPanel(false); setSettingsIndicator(null); }}
          />
        )}

        {/* AI Pattern Panel (floating) */}
        {showAIPanel && (
          <AIPatternPanel
            symbol={selectedSymbol}
            candles={candlesRef.current}
            onPatternsDetected={handlePatternsDetected}
            onClose={() => setShowAIPanel(false)}
          />
        )}

        {/* Chart Trading Panel (floating) */}
        {showChartTrading && currentPrice && (
          <ChartTrading
            symbol={selectedSymbol}
            currentPrice={typeof currentPrice === 'number' ? currentPrice : 0}
            onClose={() => setShowChartTrading(false)}
            onPlaceOrder={handlePlaceOrder}
          />
        )}

        {/* Template Manager (floating) */}
        {showTemplateManager && (
          <TemplateManager
            onLoadTemplate={chart.loadTemplate}
            onSaveTemplate={chart.saveTemplate}
            onClose={() => setShowTemplateManager(false)}
          />
        )}

        {/* Chart Settings Panel (floating) */}
        {showChartSettings && (
          <ChartSettingsPanel
            settings={chart.settings}
            onUpdateSettings={chart.updateSettings}
            onClose={() => setShowChartSettings(false)}
          />
        )}
      </div>{/* ── Chart Area close ── */}

      {/* ── Watchlist Overlay (bottom bar) ── */}
      {showWatchlist && (
        <WatchlistOverlay
          selectedSymbol={selectedSymbol}
          onSelectSymbol={(symbol) => {
            // Use the symbol store to change symbol
            const { setSelectedSymbol } = useSymbolStore.getState();
            setSelectedSymbol(symbol);
          }}
          visible={showWatchlist}
        />
      )}

      {/* ── News Markers (data provider — invisible) ── */}
      <NewsMarkers
        symbol={selectedSymbol}
        onMarkersUpdate={handleNewsUpdate}
      />

      {/* ── Global Styles ── */}
      <style jsx global>{`
        .roua-chart-root [class*="lightweight-charts"] {
          border-radius: 0 !important;
        }
        .roua-chart-root a#tv-attr-logo,
        .roua-chart-root [id*="tv-attr"],
        .roua-chart-root .tv-lightweight-charts a {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          width: 0 !important;
          height: 0 !important;
          overflow: hidden !important;
        }
        .roua-chart-root input[type=number]::-webkit-inner-spin-button,
        .roua-chart-root input[type=number]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .roua-chart-root input[type=number] {
          -moz-appearance: textfield;
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
      `}</style>

      {/* ── Order Error Toast ── */}
      {orderError && (
        <div style={{
          position: 'absolute',
          top: 50,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(248,81,73,0.15)',
          border: '1px solid rgba(248,81,73,0.4)',
          backdropFilter: 'blur(16px)',
          borderRadius: 10,
          padding: '10px 18px',
          zIndex: 600,
          animation: 'slideInRight 0.3s ease-out',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          maxWidth: '90%',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f85149" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <span style={{ fontSize: 12, color: '#f85149', fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>
            {orderError}
          </span>
        </div>
      )}
    </div>
  );
}
