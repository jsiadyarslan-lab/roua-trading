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

interface RouaChartProps {
  currentPrice?: number | null;
  mobile?: boolean;
  compact?: boolean;
  onExpand?: (() => void) | null;
}

export default function RouaChart({
  currentPrice = null,
  mobile = false,
  compact = false,
  onExpand = null,
}: RouaChartProps) {
  const { selectedSymbol, timeframe, setTimeframe } = useSymbolStore();
  const [crosshairData, setCrosshairData] = useState<CrosshairData | null>(null);
  const [feedState, setFeedState] = useState<'live' | 'fallback' | 'waiting'>('waiting');
  const [candleCountdown, setCandleCountdown] = useState('—');
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
  const [aiPatterns, setAiPatterns] = useState<AIPattern[]>([]);
  const [newsMarkers, setNewsMarkers] = useState<NewsMarker[]>([]);

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
  const handlePlaceOrder = useCallback((order: any) => {
    // Integrate with the trading system
    console.log('Chart order placed:', order);
    // TODO: Connect to actual order placement API
  }, []);

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
        onToggleFullscreen={chart.toggleFullscreen}
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
          {/* Volume Profile (overlaid on chart) */}
          {showVolumeProfile && (
            <VolumeProfile
              candles={candlesRef.current}
              width={80}
              rows={24}
              visible={showVolumeProfile}
            />
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
      `}</style>
    </div>
  );
}
