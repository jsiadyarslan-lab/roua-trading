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
import { T } from '@/lib/unified-tokens';
import { fmtPrice as unifiedFmtPrice } from '@/lib/price-format';

interface RouaChartProps {
  currentPrice?: number | null;
  mobile?: boolean;
  compact?: boolean;
  hideToolbar?: boolean;
  onExpand?: (() => void) | null;
  isChartFullscreen?: boolean;
  onToggleChartFullscreen?: () => void;
}

// ── Price-Synced Candle Timer Component ──
// Styled like a price-scale label: sits right below the last-price label
// on the right edge and changes color with candle direction (green/red).
function PriceSyncedTimer({ chart, currentPrice, countdown, isBull }: {
  chart: any; currentPrice: number; countdown: string; isBull: boolean;
}) {
  const [y, setY] = useState<number | null>(null);

  useEffect(() => {
    const update = () => {
      const coord = chart.getPriceCoordinate(currentPrice);
      setY(coord);
    };
    update();
    const unsub = chart.onVisibleRangeChange(update);
    const interval = setInterval(update, 500); // 500ms — sufficient for visual tracking without CPU overload
    return () => { unsub(); clearInterval(interval); };
  }, [chart, currentPrice]);

  if (y === null) return null;

  // Colors match the price-scale last-price label
  const bgColor = isBull ? '#3fb950' : '#f85149';

  return (
    <div
      style={{
        position: 'absolute',
        top: y + 11,        // directly below the price label (~20px tall + 1px gap)
        right: 0,
        zIndex: 5,
        pointerEvents: 'none',
        display: 'flex',
        justifyContent: 'flex-end',
        paddingRight: 2,    // flush with the price scale right edge
      }}
    >
      <div style={{
        background: bgColor,
        color: '#fff',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        fontWeight: 700,
        padding: '2px 7px',
        borderRadius: '0 0 3px 3px',   // rounded bottom only (top sits under price label)
        minWidth: 44,
        textAlign: 'center',
        letterSpacing: 0.4,
        lineHeight: '14px',
        boxShadow: `0 2px 8px ${isBull ? 'rgba(63,185,80,0.35)' : 'rgba(248,81,73,0.35)'}`,
        borderLeft: `3px solid ${bgColor}`,
      }}>
        {countdown}
      </div>
    </div>
  );
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
  const [tradePanelCollapsed, setTradePanelCollapsed] = useState(false);
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
      // Keep paper trades currentPrice in sync with live feed
      try {
        const { updatePrice } = usePaperTradesStore.getState();
        updatePrice(selectedSymbol, price);
      } catch { /* store may not be ready */ }
      // FIX: Also update exchange positions with live price from WebSocket
      // Previously only paper trades were updated — exchange positions showed stale prices
      try {
        const { updatePositionPrice } = usePositionsStore.getState();
        updatePositionPrice(selectedSymbol, price);
      } catch { /* store may not be ready */ }
      // Schedule overlay recalculation so trade markers stay aligned
      scheduleOverlayUpdateRef.current();
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

  // Ref for scheduleOverlayUpdate so the onPriceUpdate callback (defined earlier)
  // can call it without stale-closure issues — the ref is updated each render.
  const scheduleOverlayUpdateRef = useRef<() => void>(() => {});

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
        const entryPrice = Number(pos.entryPrice || pos.avgEntryPrice || 0);
        if (entryPrice <= 0) return;
        const slVal = Number(pos.stopLoss || pos.sl || 0);
        const tpVal = Number(pos.takeProfit || pos.tp || 0);
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

  // Keep the ref in sync with the latest scheduleOverlayUpdate callback
  scheduleOverlayUpdateRef.current = scheduleOverlayUpdate;

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
      const entryPrice = Number(pos.entryPrice || pos.avgEntryPrice || 0);
      if (entryPrice > 0) {
        const isLong = (pos.side || '').toLowerCase() === 'long';
        addLine(`pos-entry-${pos.id || posSymbol}`, entryPrice, isLong ? '#00FFA3' : '#FF4757', 2, 0);
      }
      const sl = Number(pos.stopLoss || pos.sl || 0);
      if (sl > 0) addLine(`pos-sl-${pos.id || posSymbol}`, sl, '#FF4757', 1, 2);
      const tp = Number(pos.takeProfit || pos.tp || 0);
      if (tp > 0) addLine(`pos-tp-${pos.id || posSymbol}`, tp, '#00FFA3', 1, 2);
    });

    // Paper trades (including bot trades)
    paperTrades.forEach(trade => {
      const symbol = normalizeSymbol(trade.symbol || '');
      if (!symbol.includes(chartSymbol) && !chartSymbol.includes(symbol)) return;
      const entryPrice = Number(trade.entryPrice || 0);
      if (entryPrice > 0) {
        const isLong = (trade.side || '').toLowerCase() === 'long';
        addLine(`trade-entry-${trade.id}`, entryPrice, isLong ? '#00FFA3' : '#FF4757', 2, 0);
      }
      if (trade.sl && Number(trade.sl) > 0) addLine(`trade-sl-${trade.id}`, Number(trade.sl), '#FF4757', 1, 2);
      if (trade.tp && Number(trade.tp) > 0) addLine(`trade-tp-${trade.id}`, Number(trade.tp), '#00FFA3', 1, 2);
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

  // ── Fetch Active Trading Signals for Chart Markers ──
  const [signalMarkers, setSignalMarkers] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    const fetchSignals = async () => {
      try {
        const res = await fetch('/api/signals/active');
        if (!res.ok) return;
        const data = await res.json();
        const signals = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
        if (cancelled) return;

        // Convert active signals to chart markers for the current symbol
        const chartSymbol = normalizeSymbol(selectedSymbol);
        const markers: any[] = [];

        signals.forEach((signal: any) => {
          const sigSymbol = normalizeSymbol(signal.pair || signal.symbol || '');
          // Only show signals matching the current chart symbol
          if (!sigSymbol.includes(chartSymbol) && !chartSymbol.includes(sigSymbol)) return;

          // Determine marker properties based on signal action
          const action = (signal.action || signal.type || '').toUpperCase();
          const isBuy = action === 'BUY' || action === 'LONG';
          const isSell = action === 'SELL' || action === 'SHORT';
          const isWait = action === 'WAIT' || action === 'HOLD';

          if (!isBuy && !isSell && !isWait) return;

          // Use signal's timestamp (converted to unix seconds for lightweight-charts)
          const signalTime = signal.createdAt
            ? Math.floor(new Date(signal.createdAt).getTime() / 1000)
            : signal.timestamp
              ? Math.floor(new Date(signal.timestamp).getTime() / 1000)
              : Math.floor(Date.now() / 1000);

          // Use entryPrice if available, otherwise use signal price
          const signalPrice = Number(signal.entryPrice || signal.price || 0);

          // Build marker text with confidence if available
          const confidence = signal.confidence ? ` (${signal.confidence}%)` : '';
          const label = isBuy ? `شراء${confidence}` : isSell ? `بيع${confidence}` : `انتظار${confidence}`;

          markers.push({
            time: signalTime as any,
            position: (isBuy ? 'belowBar' : 'aboveBar') as 'belowBar' | 'aboveBar',
            color: isBuy ? '#00FFA3' : isSell ? '#FF4757' : '#fbbf24',
            shape: (isBuy ? 'arrowUp' : isSell ? 'arrowDown' : 'circle') as 'arrowUp' | 'arrowDown' | 'circle',
            text: label,
            // Store original signal data for interactivity
            _signalData: signal,
          });

          // Add SL/TP price lines for the signal if available
          const sl = Number(signal.stopLoss || 0);
          const tp = Number(signal.takeProfit || 0);
          if (sl > 0) {
            markers.push({
              time: signalTime as any,
              position: 'aboveBar' as const,
              color: '#FF4757',
              shape: 'circle' as const,
              text: `SL ${sl.toFixed(sl > 100 ? 1 : 5)}`,
            });
          }
          if (tp > 0) {
            markers.push({
              time: signalTime as any,
              position: 'belowBar' as const,
              color: '#00FFA3',
              shape: 'circle' as const,
              text: `TP ${tp.toFixed(tp > 100 ? 1 : 5)}`,
            });
          }
        });

        setSignalMarkers(markers);
      } catch {
        // Signals not available — don't block chart rendering
      }
    };

    fetchSignals();
    // Refresh signals every 60 seconds
    const interval = setInterval(fetchSignals, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [selectedSymbol]);

  // ── Apply Combined Markers (News + AI Patterns + Trading Signals) to Chart ──
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
          color: p.direction === 'bullish' ? '#00FFA3' : p.direction === 'bearish' ? '#FF4757' : '#fbbf24',
          shape: (p.direction === 'bullish' ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
          text: p.labelAr || p.type,
        });
      });
    }

    // Add trading signal markers (BUY/SELL/WAIT)
    if (signalMarkers.length) {
      combinedMarkers.push(...signalMarkers);
    }

    // Sort by time and apply
    combinedMarkers.sort((a, b) => (a.time as number) - (b.time as number));
    chart.setMarkers(combinedMarkers);
  }, [newsMarkers, aiPatterns, signalMarkers, chart]);

  const toolbarHeight = hideToolbar ? 0 : mobile ? 32 : 38;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: T.bg,
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
        <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>

          {/* Chart Canvas Container — lightweight-charts renders here ONLY */}
          <div
            ref={chart.containerRef as any}
            style={{
              width: '100%',
              flex: 1,
              minHeight: 0,
              background: T.bg,
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
              const fmt = (v: number) => unifiedFmtPrice(v, selectedSymbol);
              const isEntry = ov.type === 'entry';
              const isSL = ov.type === 'sl';
              const isTP = ov.type === 'tp';
              const isLong = ov.direction === 'long';
              const entryColor = isLong ? '#00FFA3' : '#FF4757';
              const lineColor = isSL ? '#FF4757' : isTP ? '#00FFA3' : entryColor;

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
                textColor = '#FF4757';
              } else {
                labelText = `TP ${fmt(ov.price)}`;
                bg = 'rgba(63,185,80,0.18)';
                textColor = '#00FFA3';
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

          {/* ── Quick Trade Controls — Left Side ── */}
          {!mobile && currentPrice && (
            <div
              className="roua-quick-trade"
              style={{
                position: 'absolute',
                top: 32,
                left: 10,
                zIndex: 100,
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                borderRadius: 10,
                background: 'rgba(8,10,18,0.88)',
                backdropFilter: 'blur(24px) saturate(2)',
                border: '1px solid rgba(255,255,255,0.07)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset, 0 1px 0 rgba(255,255,255,0.06) inset',
                padding: '3px 4px',
                pointerEvents: 'auto',
                overflow: 'hidden',
                maxWidth: tradePanelCollapsed ? 26 : 400,
                transition: 'max-width 0.25s cubic-bezier(0.4, 0, 0.2, 1), padding 0.25s ease',
              }}
            >
              {/* Collapse Toggle — icon only */}
              <button
                onClick={() => setTradePanelCollapsed(!tradePanelCollapsed)}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: 'none',
                  borderRadius: 5,
                  color: 'rgba(255,255,255,0.45)',
                  width: 20,
                  height: 20,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  outline: 'none',
                  padding: 0,
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.45)';
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.25s ease', transform: tradePanelCollapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>

              {/* Trade Buttons (collapsible) */}
              {!tradePanelCollapsed && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  {/* Buy Button */}
                  <button
                    className="roua-btn-buy"
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
                      position: 'relative',
                      background: 'linear-gradient(135deg, #00E676 0%, #00C853 40%, #00FFA3 100%)',
                      border: '1px solid rgba(0,255,163,0.35)',
                      borderRadius: 7,
                      color: '#000',
                      padding: '4px 8px',
                      fontSize: 8.7,
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                      letterSpacing: 0.3,
                      fontFamily: "'Cairo', sans-serif",
                      boxShadow: '0 0 10px rgba(0,255,163,0.18), 0 1px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3)',
                      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      overflow: 'hidden',
                      outline: 'none',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: '45%',
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, transparent 100%)',
                      borderRadius: '7px 7px 0 0',
                      pointerEvents: 'none',
                    }} />
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.2))' }}>
                      <polyline points="18 15 12 9 6 15" />
                    </svg>
                    <span style={{ textShadow: '0 1px 1px rgba(0,0,0,0.12)' }}>شراء</span>
                  </button>

                  {/* LOT Size Control with +/- buttons */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.06)',
                    padding: '1px 2px',
                    gap: 0,
                  }}>
                    {/* Decrease Lot */}
                    <button
                      onClick={() => setLotSize(prev => Math.max(0.01, +(prev - 0.01).toFixed(2)))}
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: 'none',
                        borderRadius: 4,
                        color: 'rgba(255,255,255,0.6)',
                        width: 18,
                        height: 18,
                        fontSize: 10,
                        fontWeight: 900,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: "'JetBrains Mono', monospace",
                        transition: 'all 0.15s ease',
                        outline: 'none',
                        padding: 0,
                        lineHeight: 1,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,71,87,0.2)';
                        e.currentTarget.style.color = '#FF4757';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                        e.currentTarget.style.color = 'rgba(255,255,255,0.6)';
                      }}
                    >
                      −
                    </button>

                    {/* Lot Value Display */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '1px 3px',
                      minWidth: 30,
                      gap: 0,
                    }}>
                      <span style={{ fontSize: 4.7, color: 'rgba(255,255,255,0.35)', fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', lineHeight: 1 }}>LOT</span>
                      <span style={{
                        color: '#fff',
                        fontSize: 9.4,
                        fontWeight: 900,
                        fontFamily: "'JetBrains Mono', monospace",
                        lineHeight: 1.2,
                        textAlign: 'center',
                      }}>
                        {lotSize.toFixed(2)}
                      </span>
                    </div>

                    {/* Increase Lot */}
                    <button
                      onClick={() => setLotSize(prev => +(prev + 0.01).toFixed(2))}
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: 'none',
                        borderRadius: 4,
                        color: 'rgba(255,255,255,0.6)',
                        width: 18,
                        height: 18,
                        fontSize: 10,
                        fontWeight: 900,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: "'JetBrains Mono', monospace",
                        transition: 'all 0.15s ease',
                        outline: 'none',
                        padding: 0,
                        lineHeight: 1,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(0,255,163,0.2)';
                        e.currentTarget.style.color = '#00FFA3';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                        e.currentTarget.style.color = 'rgba(255,255,255,0.6)';
                      }}
                    >
                      +
                    </button>
                  </div>

                  {/* Sell Button */}
                  <button
                    className="roua-btn-sell"
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
                      position: 'relative',
                      background: 'linear-gradient(135deg, #FF1744 0%, #FF5252 40%, #FF6B81 100%)',
                      border: '1px solid rgba(255,71,87,0.35)',
                      borderRadius: 7,
                      color: '#fff',
                      padding: '4px 8px',
                      fontSize: 8.7,
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                      letterSpacing: 0.3,
                      fontFamily: "'Cairo', sans-serif",
                      boxShadow: '0 0 10px rgba(255,71,87,0.18), 0 1px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
                      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      overflow: 'hidden',
                      outline: 'none',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: '45%',
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 100%)',
                      borderRadius: '7px 7px 0 0',
                      pointerEvents: 'none',
                    }} />
                    <span style={{ textShadow: '0 1px 1px rgba(0,0,0,0.25)' }}>بيع</span>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.2))' }}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Price-Synced Candle Timer (Desktop Only) ── */}
          {!mobile && currentPrice && candleCountdown && (
            <PriceSyncedTimer
              chart={chart}
              currentPrice={currentPrice}
              countdown={candleCountdown}
              isBull={(() => {
                const lc = candlesRef.current[candlesRef.current.length - 1];
                return lc ? currentPrice >= lc.open : true;
              })()}
            />
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
        @keyframes rouaGlowPulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        /* ── Quick Trade Button Styles — Premium Trading UI ── */
        .roua-btn-buy:hover {
          box-shadow: 0 0 28px rgba(0,255,163,0.45), 0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.45) !important;
          transform: translateY(-1px) scale(1.03);
          filter: brightness(1.12);
          border-color: rgba(0,255,163,0.6) !important;
        }
        .roua-btn-buy:active {
          transform: translateY(0) scale(0.97);
          box-shadow: 0 0 10px rgba(0,255,163,0.3), inset 0 2px 6px rgba(0,0,0,0.25) !important;
          filter: brightness(0.92);
        }
        .roua-btn-buy:hover .roua-buy-glow {
          opacity: 1 !important;
          animation: rouaGlowSpin 2s linear infinite;
        }
        .roua-btn-sell:hover {
          box-shadow: 0 0 28px rgba(255,71,87,0.45), 0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.3) !important;
          transform: translateY(-1px) scale(1.03);
          filter: brightness(1.12);
          border-color: rgba(255,71,87,0.6) !important;
        }
        .roua-btn-sell:active {
          transform: translateY(0) scale(0.97);
          box-shadow: 0 0 10px rgba(255,71,87,0.3), inset 0 2px 6px rgba(0,0,0,0.25) !important;
          filter: brightness(0.92);
        }
        .roua-btn-sell:hover .roua-sell-glow {
          opacity: 1 !important;
          animation: rouaGlowSpin 2s linear infinite;
        }
        .roua-quick-trade {
          animation: rouaSlideInLeft 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes rouaSlideInLeft {
          from { transform: translateX(-20px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes rouaGlowSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF4757" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <span style={{ fontSize: 12, color: '#FF4757', fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>
            {orderError}
          </span>
        </div>
      )}
    </div>
  );
}
