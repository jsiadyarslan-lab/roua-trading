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
  onExpand?: (() => void) | null;
  isChartFullscreen?: boolean;
  onToggleChartFullscreen?: () => void;
}

export default function RouaChart({
  currentPrice = null,
  mobile = false,
  compact = false,
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
    const fetchCandles = async () => {
      try {
        setFeedState('waiting');
        const res = await fetch(`/api/exchange/history/${encodeURIComponent(selectedSymbol)}?interval=${timeframe}`);
        const j = await res.json();

        if (j.success && j.data && j.data.length > 0) {
          setFeedState('live');
          const formatted: CandleData[] = j.data.map((c: any) => ({
            time: Math.floor(new Date(c.timestamp).getTime() / 1000),
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume || 0,
          }));
          // Deduplicate by time
          const seen = new Set<number>();
          const unique = formatted.filter(c => {
            if (seen.has(c.time)) return false;
            seen.add(c.time);
            return true;
          });
          candlesRef.current = unique;
          chart.setCandles(unique);
        } else {
          setFeedState('fallback');
          // Generate simulated data as fallback
          generateSimulatedData();
        }
      } catch {
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

      candlesRef.current = candles;
      chart.setCandles(candles);
    };

    fetchCandles();
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

  // ── Apply Position Lines to Chart ──
  useEffect(() => {
    // Clear existing lines
    positionLineIdsRef.current.forEach(id => chart.removePriceLine(id));
    positionLineIdsRef.current = [];

    // Add lines for positions
    positions.forEach(pos => {
      const posSymbol = pos.symbol || '';
      if (!posSymbol.includes(selectedSymbol.replace('/', ''))) return;

      const entryPrice = Number(pos.avgEntryPrice || 0);
      if (entryPrice > 0) {
        const entryId = `pos-entry-${pos.id || posSymbol}`;
        chart.addPriceLine(entryId, entryPrice, '#00D4FF', `دخول ${pos.side || ''}`, 1);
        positionLineIdsRef.current.push(entryId);
      }
    });

    // Add lines for paper trades
    paperTrades.forEach(trade => {
      const symbol = trade.symbol || '';
      if (!symbol.includes(selectedSymbol.replace('/', ''))) return;

      const entryPrice = Number(trade.entryPrice || 0);
      if (entryPrice > 0) {
        const entryId = `trade-entry-${trade.id}`;
        chart.addPriceLine(entryId, entryPrice, '#00D4FF', `دخول ${trade.side || ''}`, 1);
        positionLineIdsRef.current.push(entryId);
      }

      if (trade.sl && Number(trade.sl) > 0) {
        const slId = `trade-sl-${trade.id}`;
        chart.addPriceLine(slId, Number(trade.sl), '#f85149', 'SL', 1);
        positionLineIdsRef.current.push(slId);
      }

      if (trade.tp && Number(trade.tp) > 0) {
        const tpId = `trade-tp-${trade.id}`;
        chart.addPriceLine(tpId, Number(trade.tp), '#3fb950', 'TP', 1);
        positionLineIdsRef.current.push(tpId);
      }
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

  const toolbarHeight = mobile ? 32 : 38;

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
      <ChartToolbar
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
      />

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

        {/* Chart Container */}
        <div
          ref={chart.containerRef as any}
          style={{
            flex: 1,
            minHeight: 0,
            background: COLORS.bg,
            position: 'relative',
          }}
        >
          {/* Symbol Watermark */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 1,
            opacity: 0.04,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: Math.min(120, Math.max(48, 80)),
            fontWeight: 900,
            color: COLORS.text,
            whiteSpace: 'nowrap',
            letterSpacing: -2,
            userSelect: 'none',
          }}>
            {selectedSymbol.replace('/', '')}
          </div>

          {/* Volume Profile (overlaid on chart) */}
          {showVolumeProfile && (
            <VolumeProfile
              candles={candlesRef.current}
              width={80}
              rows={24}
              visible={showVolumeProfile}
            />
          )}



          {/* ── Quick Trade Panel (floating top-left over chart) ── */}
          {!mobile && currentPrice && (
            <div style={{
              position: 'absolute',
              top: 10,
              left: 10,
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 0,
              pointerEvents: 'auto',
              background: 'rgba(11,14,20,0.88)',
              border: '1px solid rgba(42,49,60,0.45)',
              borderRadius: 8,
              padding: '3px 4px',
              backdropFilter: 'blur(14px)',
            }}>
              {/* Buy Button */}
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
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                  padding: '5px 14px 4px',
                  background: 'rgba(63,185,80,0.12)',
                  border: '1px solid rgba(63,185,80,0.25)',
                  borderRadius: '6px 0 0 6px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  borderRight: 'none',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(63,185,80,0.28)';
                  e.currentTarget.style.boxShadow = '0 0 12px rgba(63,185,80,0.2)';
                  e.currentTarget.style.borderColor = 'rgba(63,185,80,0.45)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(63,185,80,0.12)';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = 'rgba(63,185,80,0.25)';
                }}
                title="شراء سريع"
              >
                <span style={{
                  color: '#3fb950',
                  fontWeight: 800,
                  fontSize: 11,
                  fontFamily: "'Cairo', sans-serif",
                  lineHeight: 1.2,
                }}>شراء</span>
                <span style={{
                  color: 'rgba(63,185,80,0.5)',
                  fontSize: 8,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 600,
                  lineHeight: 1,
                }}>{typeof currentPrice === 'number' ? currentPrice.toFixed(currentPrice > 1000 ? 2 : 5) : '—'}</span>
              </button>

              {/* Lot Size Input (center, between buttons) */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                height: '100%',
                border: '1px solid rgba(42,49,60,0.6)',
                borderRadius: 0,
                background: 'rgba(21,26,34,0.7)',
                overflow: 'hidden',
              }}>
                <button
                  onClick={() => setLotSize(prev => Math.max(0.001, +(prev - (selectedSymbol.includes('BTC') ? 0.001 : 0.01)).toFixed(3)))}
                  style={{
                    width: 22,
                    height: 34,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(42,49,60,0.4)',
                    border: 'none',
                    color: '#8B92A8',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    lineHeight: 1,
                    padding: 0,
                    transition: 'all 0.12s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(42,49,60,0.8)';
                    e.currentTarget.style.color = '#F0F2F5';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(42,49,60,0.4)';
                    e.currentTarget.style.color = '#8B92A8';
                  }}
                >−</button>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 6px',
                  minWidth: 48,
                }}>
                  <input
                    type="number"
                    value={lotSize}
                    onChange={e => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v > 0) setLotSize(+v.toFixed(3));
                    }}
                    step={selectedSymbol.includes('BTC') ? 0.001 : 0.01}
                    min={0.001}
                    style={{
                      width: 44,
                      textAlign: 'center',
                      background: 'transparent',
                      border: 'none',
                      color: '#F0F2F5',
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: "'JetBrains Mono', monospace",
                      outline: 'none',
                      padding: 0,
                      lineHeight: 1.3,
                      MozAppearance: 'textfield' as any,
                    }}
                  />
                  <span style={{
                    fontSize: 7,
                    color: '#64748b',
                    fontFamily: "'Cairo', sans-serif",
                    fontWeight: 600,
                    lineHeight: 1,
                    marginTop: 1,
                  }}>حجم</span>
                </div>
                <button
                  onClick={() => setLotSize(prev => +(prev + (selectedSymbol.includes('BTC') ? 0.001 : 0.01)).toFixed(3))}
                  style={{
                    width: 22,
                    height: 34,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(42,49,60,0.4)',
                    border: 'none',
                    color: '#8B92A8',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    lineHeight: 1,
                    padding: 0,
                    transition: 'all 0.12s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(42,49,60,0.8)';
                    e.currentTarget.style.color = '#F0F2F5';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(42,49,60,0.4)';
                    e.currentTarget.style.color = '#8B92A8';
                  }}
                >+</button>
              </div>

              {/* Sell Button */}
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
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                  padding: '5px 14px 4px',
                  background: 'rgba(248,81,73,0.12)',
                  border: '1px solid rgba(248,81,73,0.25)',
                  borderRadius: '0 6px 6px 0',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  borderLeft: 'none',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(248,81,73,0.28)';
                  e.currentTarget.style.boxShadow = '0 0 12px rgba(248,81,73,0.2)';
                  e.currentTarget.style.borderColor = 'rgba(248,81,73,0.45)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(248,81,73,0.12)';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = 'rgba(248,81,73,0.25)';
                }}
                title="بيع سريع"
              >
                <span style={{
                  color: '#f85149',
                  fontWeight: 800,
                  fontSize: 11,
                  fontFamily: "'Cairo', sans-serif",
                  lineHeight: 1.2,
                }}>بيع</span>
                <span style={{
                  color: 'rgba(248,81,73,0.5)',
                  fontSize: 8,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 600,
                  lineHeight: 1,
                }}>{typeof currentPrice === 'number' ? currentPrice.toFixed(currentPrice > 1000 ? 2 : 5) : '—'}</span>
              </button>
            </div>
          )}

          {/* ── Candle Countdown Timer (bottom-left corner, small transparent) ── */}
          {candleCountdown && (
            <div style={{
              position: 'absolute',
              bottom: 8,
              left: 8,
              zIndex: 10,
              fontSize: 10,
              color: '#64748b',
              background: 'rgba(0,0,0,0.5)',
              padding: '2px 8px',
              borderRadius: 4,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600,
              pointerEvents: 'none',
            }}>
              {candleCountdown}
            </div>
          )}
        </div>

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
      </div>

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
