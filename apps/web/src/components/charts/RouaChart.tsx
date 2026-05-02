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
  const [orderBias, setOrderBias] = useState<'buy' | 'sell'>('buy');
  const [layoutPreset, setLayoutPreset] = useState<'Scalp' | 'Swing' | 'Analysis' | 'Execution'>('Execution');
  const [replayMode, setReplayMode] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);
  const [candlesVersion, setCandlesVersion] = useState(0);
  const [marketLayers, setMarketLayers] = useState({
    sessions: true,
    supportResistance: true,
    smartAlerts: true,
    aiCopilot: true,
    riskOverlay: true,
  });
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
  const marketLineIdsRef = useRef<string[]>([]);

  const candlesRef = useRef<CandleData[]>([]);
  const replaySourceRef = useRef<CandleData[]>([]);
  const prevPriceRef = useRef(currentPrice);
  const [pricePulse, setPricePulse] = useState(false);
  const COLORS = {
    bg: '#0B0E14',
    card: '#121722',
    border: 'rgba(148,163,184,0.16)',
    text: '#F0F2F5',
    textSecondary: '#8B92A8',
    textMuted: '#64748b',
    cyan: '#38BDF8',
    success: '#3fb950',
    danger: '#f85149',
    warning: '#fbbf24',
  };
  const [priceAnchors, setPriceAnchors] = useState<{
    current: number | null;
    bid: number | null;
    ask: number | null;
    sl: number | null;
    tp: number | null;
    support: number | null;
    resistance: number | null;
    alertHigh: number | null;
    alertLow: number | null;
  }>({
    current: null,
    bid: null,
    ask: null,
    sl: null,
    tp: null,
    support: null,
    resistance: null,
    alertHigh: null,
    alertLow: null,
  });



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
      setCandlesVersion(v => v + 1);
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
          replaySourceRef.current = unique;
          chart.setCandles(unique);
          setReplayIndex(unique.length);
          setCandlesVersion(v => v + 1);
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
      replaySourceRef.current = candles;
      chart.setCandles(candles);
      setReplayIndex(candles.length);
      setCandlesVersion(v => v + 1);
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

  const latestCandle = useMemo(() => {
    void candlesVersion;
    return candlesRef.current[candlesRef.current.length - 1] || null;
  }, [candlesVersion]);

  const marketPrice = useMemo(() => {
    return typeof currentPrice === 'number' && currentPrice > 0
      ? currentPrice
      : latestCandle?.close || null;
  }, [currentPrice, latestCandle]);

  const priceDecimals = useMemo(() => {
    const price = marketPrice || 0;
    if (selectedSymbol.includes('JPY')) return 3;
    if (selectedSymbol.includes('BTC') || price > 1000) return 2;
    if (price > 1) return 5;
    return 6;
  }, [marketPrice, selectedSymbol]);

  const spreadSize = useMemo(() => {
    if (!marketPrice) return 0;
    const candleSpread = latestCandle ? Math.max(0, latestCandle.high - latestCandle.low) : 0;
    return Math.max(candleSpread * 0.04, marketPrice * 0.00008);
  }, [latestCandle, marketPrice]);

  const buildRiskModel = useCallback((side: 'buy' | 'sell') => {
    if (!marketPrice) return null;
    const baseDistance = Math.max(spreadSize * 2.5, marketPrice * 0.004);
    const rewardDistance = baseDistance * 1.8;
    const sl = side === 'buy' ? marketPrice - baseDistance : marketPrice + baseDistance;
    const tp = side === 'buy' ? marketPrice + rewardDistance : marketPrice - rewardDistance;
    const expectedLoss = Math.abs(marketPrice - sl) * lotSize;
    return {
      side,
      entry: marketPrice,
      sl,
      tp,
      rr: rewardDistance / baseDistance,
      riskAmount: expectedLoss,
      expectedLoss,
    };
  }, [lotSize, marketPrice, spreadSize]);

  const activeRisk = useMemo(() => buildRiskModel(orderBias), [buildRiskModel, orderBias]);

  const marketStructure = useMemo(() => {
    void candlesVersion;
    const sample = candlesRef.current.slice(-64);
    if (!sample.length) return null;
    const highs = sample.map(c => c.high);
    const lows = sample.map(c => c.low);
    const resistance = Math.max(...highs);
    const support = Math.min(...lows);
    const highAlert = marketPrice ? marketPrice + Math.max(spreadSize * 7, marketPrice * 0.006) : null;
    const lowAlert = marketPrice ? marketPrice - Math.max(spreadSize * 7, marketPrice * 0.006) : null;
    return { support, resistance, highAlert, lowAlert };
  }, [candlesVersion, marketPrice, spreadSize]);

  const multiTimeframeTrend = useMemo(() => {
    void candlesVersion;
    const candles = candlesRef.current;
    const windows = [
      { label: '1m', bars: 3 },
      { label: '5m', bars: 8 },
      { label: '15m', bars: 18 },
      { label: '1h', bars: 48 },
      { label: '4h', bars: 96 },
    ];
    return windows.map(item => {
      const last = candles[candles.length - 1];
      const previous = candles[Math.max(0, candles.length - 1 - item.bars)];
      const delta = last && previous ? last.close - previous.close : 0;
      return {
        ...item,
        direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
        change: previous?.close ? (delta / previous.close) * 100 : 0,
      };
    });
  }, [candlesVersion]);

  const copilotIdea = useMemo(() => {
    void candlesVersion;
    if (!marketPrice) return null;
    const latestPattern = aiPatterns[aiPatterns.length - 1];
    const direction = latestPattern?.direction === 'bearish' ? 'sell' : 'buy';
    const confidence = latestPattern ? Math.round(latestPattern.confidence * 100) : Math.min(86, 58 + Math.abs(multiTimeframeTrend.filter(t => t.direction === 'up').length - 2) * 7);
    const probability = Math.min(91, confidence + 7);
    const reason = latestPattern?.labelAr || (direction === 'buy' ? 'زخم صاعد مع دعم قريب' : 'ضغط بيعي قرب مقاومة');
    const entry = marketPrice;
    const exit = direction === 'buy'
      ? marketPrice + Math.max(spreadSize * 8, marketPrice * 0.008)
      : marketPrice - Math.max(spreadSize * 8, marketPrice * 0.008);
    return { direction, confidence, probability, reason, entry, exit };
  }, [aiPatterns, candlesVersion, marketPrice, multiTimeframeTrend, spreadSize]);



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
      setPriceAnchors({
        current: marketPrice ? chart.getPriceCoordinate(marketPrice) : null,
        bid: marketPrice ? chart.getPriceCoordinate(marketPrice - spreadSize / 2) : null,
        ask: marketPrice ? chart.getPriceCoordinate(marketPrice + spreadSize / 2) : null,
        sl: activeRisk ? chart.getPriceCoordinate(activeRisk.sl) : null,
        tp: activeRisk ? chart.getPriceCoordinate(activeRisk.tp) : null,
        support: marketStructure ? chart.getPriceCoordinate(marketStructure.support) : null,
        resistance: marketStructure ? chart.getPriceCoordinate(marketStructure.resistance) : null,
        alertHigh: marketStructure?.highAlert ? chart.getPriceCoordinate(marketStructure.highAlert) : null,
        alertLow: marketStructure?.lowAlert ? chart.getPriceCoordinate(marketStructure.lowAlert) : null,
      });
    });
  }, [activeRisk, chart, marketPrice, marketStructure, spreadSize]);

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

  useEffect(() => {
    marketLineIdsRef.current.forEach(id => chart.removePriceLine(id));
    marketLineIdsRef.current = [];
    const addMarketLine = (id: string, price: number | null | undefined, color: string, width = 1, style = 2, axis = false) => {
      if (!price || price <= 0) return;
      chart.addPriceLine(id, price, color, '', width, style, axis);
      marketLineIdsRef.current.push(id);
    };

    addMarketLine('market-current', marketPrice, pricePulse ? COLORS.warning : COLORS.success, 2, 0, true);
    if (marketPrice && spreadSize > 0) {
      addMarketLine('market-bid', marketPrice - spreadSize / 2, 'rgba(248,81,73,0.68)', 1, 2, false);
      addMarketLine('market-ask', marketPrice + spreadSize / 2, 'rgba(63,185,80,0.68)', 1, 2, false);
    }
    if (marketLayers.riskOverlay && activeRisk) {
      addMarketLine('risk-sl', activeRisk.sl, 'rgba(248,81,73,0.78)', 1, 2, false);
      addMarketLine('risk-tp', activeRisk.tp, 'rgba(63,185,80,0.78)', 1, 2, false);
    }
    if (marketLayers.supportResistance && marketStructure) {
      addMarketLine('structure-support', marketStructure.support, 'rgba(63,185,80,0.42)', 1, 3, false);
      addMarketLine('structure-resistance', marketStructure.resistance, 'rgba(248,81,73,0.42)', 1, 3, false);
    }
    if (marketLayers.smartAlerts && marketStructure) {
      addMarketLine('smart-alert-high', marketStructure.highAlert, 'rgba(251,191,36,0.58)', 1, 4, false);
      addMarketLine('smart-alert-low', marketStructure.lowAlert, 'rgba(251,191,36,0.58)', 1, 4, false);
    }

    return () => {
      marketLineIdsRef.current.forEach(id => chart.removePriceLine(id));
      marketLineIdsRef.current = [];
    };
  }, [COLORS.success, COLORS.warning, activeRisk, chart, marketLayers, marketPrice, marketStructure, pricePulse, spreadSize]);



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

  const toggleMarketTool = useCallback((key: 'volume' | 'vwap' | 'ema' | 'rsi' | 'sessions' | 'supportResistance') => {
    if (key === 'volume') {
      chart.updateSettings({ showVolume: !chart.settings.showVolume });
      return;
    }
    if (key === 'sessions') {
      setMarketLayers(prev => ({ ...prev, sessions: !prev.sessions }));
      chart.updateSettings({ showSessions: !chart.settings.showSessions });
      return;
    }
    if (key === 'supportResistance') {
      setMarketLayers(prev => ({ ...prev, supportResistance: !prev.supportResistance }));
      return;
    }
    handleToggleIndicator(key);
  }, [chart, handleToggleIndicator]);

  const applyLayoutPreset = useCallback((preset: 'Scalp' | 'Swing' | 'Analysis' | 'Execution') => {
    setLayoutPreset(preset);
    if (preset === 'Scalp') {
      setTimeframe('1min');
      chart.updateSettings({ showVolume: true, showGrid: true, crosshairType: 'cross' });
      setMarketLayers({ sessions: true, supportResistance: true, smartAlerts: true, aiCopilot: true, riskOverlay: true });
      return;
    }
    if (preset === 'Swing') {
      setTimeframe('1h');
      chart.updateSettings({ showVolume: true, showGrid: true, crosshairType: 'cross' });
      setMarketLayers({ sessions: true, supportResistance: true, smartAlerts: true, aiCopilot: true, riskOverlay: false });
      return;
    }
    if (preset === 'Analysis') {
      setShowAIPanel(true);
      chart.updateSettings({ showVolume: true, showGrid: true, crosshairType: 'cross' });
      setMarketLayers({ sessions: true, supportResistance: true, smartAlerts: true, aiCopilot: true, riskOverlay: false });
      return;
    }
    setShowChartTrading(true);
    chart.updateSettings({ showVolume: true, showGrid: true, crosshairType: 'cross' });
    setMarketLayers({ sessions: true, supportResistance: true, smartAlerts: true, aiCopilot: true, riskOverlay: true });
  }, [chart, setTimeframe]);

  const toggleReplayMode = useCallback(() => {
    if (replayMode) {
      const source = replaySourceRef.current.length ? replaySourceRef.current : candlesRef.current;
      candlesRef.current = source;
      chart.setCandles(source);
      setReplayIndex(source.length);
      setIsReplayPlaying(false);
      setReplayMode(false);
      setCandlesVersion(v => v + 1);
      return;
    }
    replaySourceRef.current = candlesRef.current.length ? [...candlesRef.current] : replaySourceRef.current;
    setReplayIndex(Math.max(1, Math.floor((replaySourceRef.current.length || 1) * 0.65)));
    setIsReplayPlaying(false);
    setReplayMode(true);
  }, [chart, replayMode]);

  useEffect(() => {
    if (!replayMode) return;
    const source = replaySourceRef.current;
    if (!source.length) return;
    const safeIndex = Math.max(1, Math.min(replayIndex, source.length));
    const visible = source.slice(0, safeIndex);
    candlesRef.current = visible;
    chart.setCandles(visible);
    setCandlesVersion(v => v + 1);
  }, [chart, replayIndex, replayMode]);

  useEffect(() => {
    if (!replayMode || !isReplayPlaying) return;
    const interval = setInterval(() => {
      setReplayIndex(idx => {
        const next = Math.min(idx + 1, replaySourceRef.current.length);
        if (next >= replaySourceRef.current.length) setIsReplayPlaying(false);
        return next;
      });
    }, 650);
    return () => clearInterval(interval);
  }, [isReplayPlaying, replayMode]);

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

  const saveTradeJournalSnapshot = useCallback((order: any) => {
    if (typeof window === 'undefined') return;
    try {
      const canvas = chart.containerRef.current?.querySelector('canvas');
      const snapshot = canvas instanceof HTMLCanvasElement ? canvas.toDataURL('image/png') : null;
      const existing = JSON.parse(window.localStorage.getItem('roua-chart-journal') || '[]');
      const entry = {
        id: `journal-${Date.now()}`,
        symbol: selectedSymbol,
        timeframe,
        side: order.side,
        quantity: order.quantity,
        entryPrice: order.entryPrice,
        sl: order.sl || null,
        tp: order.tp || null,
        reason: copilotIdea?.reason || 'manual chart execution',
        confidence: copilotIdea?.confidence || null,
        result: 'open',
        indicators: chart.getActiveIndicators().map(ind => ind.key),
        snapshot,
        createdAt: new Date().toISOString(),
      };
      window.localStorage.setItem('roua-chart-journal', JSON.stringify([entry, ...existing].slice(0, 50)));
    } catch {
      // Journal snapshots are best-effort and must never block order entry.
    }
  }, [chart, copilotIdea, selectedSymbol, timeframe]);
  
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

    saveTradeJournalSnapshot(order);
    console.log('Chart order placed:', order);
  }, [saveTradeJournalSnapshot, selectedSymbol]);

  const handleQuickOrder = useCallback((side: 'buy' | 'sell') => {
    const risk = buildRiskModel(side);
    if (!risk) return;
    setOrderBias(side);
    handlePlaceOrder({
      side,
      type: 'market',
      quantity: lotSize,
      entryPrice: risk.entry,
      sl: risk.sl,
      tp: risk.tp,
    });
  }, [buildRiskModel, handlePlaceOrder, lotSize]);

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

  const toolbarHeight = hideToolbar ? 0 : mobile ? 32 : 38;
  const activeIndicatorKeys = chart.getActiveIndicators().map(ind => ind.key);
  const replayIconButtonStyle: React.CSSProperties = {
    width: 24,
    height: 24,
    border: '1px solid rgba(148,163,184,0.14)',
    borderRadius: 4,
    background: 'rgba(15,23,42,0.74)',
    color: COLORS.textSecondary,
    fontSize: 15,
    lineHeight: 1,
    cursor: 'pointer',
  };
  const replayButtonStyle = (active: boolean, color: string): React.CSSProperties => ({
    height: 24,
    padding: '0 8px',
    border: `1px solid ${active ? color : 'rgba(148,163,184,0.14)'}`,
    borderRadius: 4,
    background: active ? `${color}22` : 'rgba(15,23,42,0.74)',
    color: active ? color : COLORS.textSecondary,
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 900,
    cursor: 'pointer',
  });

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

            {!mobile && marketPrice && (
              <>
                {/* Preset layouts */}
                <div style={{
                  position: 'absolute',
                  top: 34,
                  left: 14,
                  zIndex: 18,
                  pointerEvents: 'auto',
                  display: 'flex',
                  gap: 4,
                  direction: 'ltr',
                  background: 'rgba(10,13,19,0.72)',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 6,
                  padding: 4,
                  backdropFilter: 'blur(12px)',
                }}>
                  {(['Scalp', 'Swing', 'Analysis', 'Execution'] as const).map(preset => (
                    <button
                      key={preset}
                      onClick={() => applyLayoutPreset(preset)}
                      style={{
                        height: 24,
                        padding: '0 8px',
                        border: `1px solid ${layoutPreset === preset ? 'rgba(56,189,248,0.34)' : 'transparent'}`,
                        borderRadius: 4,
                        background: layoutPreset === preset ? 'rgba(56,189,248,0.14)' : 'transparent',
                        color: layoutPreset === preset ? COLORS.cyan : COLORS.textSecondary,
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 10,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                      title={`Preset ${preset}`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                {/* New execution controls, anchored top-right under session times */}
                <div style={{
                  position: 'absolute',
                  top: 34,
                  right: 64,
                  zIndex: 24,
                  pointerEvents: 'auto',
                  display: 'grid',
                  gridTemplateColumns: '58px 70px 58px',
                  alignItems: 'center',
                  gap: 5,
                  direction: 'ltr',
                  background: 'rgba(10,13,19,0.82)',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 7,
                  padding: 5,
                  boxShadow: '0 14px 34px rgba(0,0,0,0.36)',
                  backdropFilter: 'blur(14px)',
                }}>
                  <button
                    onClick={() => handleQuickOrder('sell')}
                    onMouseEnter={() => setOrderBias('sell')}
                    style={{
                      height: 30,
                      border: '1px solid rgba(248,81,73,0.5)',
                      borderRadius: 5,
                      background: 'linear-gradient(180deg, rgba(248,81,73,0.95), rgba(185,28,28,0.92))',
                      color: '#fff',
                      fontFamily: "'Cairo', sans-serif",
                      fontSize: 12,
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                    title="بيع سريع مع Risk Overlay"
                  >
                    بيع
                  </button>
                  <label style={{
                    display: 'grid',
                    gap: 2,
                    color: COLORS.textMuted,
                    fontSize: 8,
                    fontFamily: "'Cairo', sans-serif",
                    textAlign: 'center',
                  }}>
                    حجم العقد
                    <input
                      type="number"
                      min={0.01}
                      step={0.01}
                      value={lotSize}
                      onChange={e => setLotSize(Math.max(0.01, Number(e.target.value) || 0.01))}
                      style={{
                        height: 18,
                        border: '1px solid rgba(148,163,184,0.18)',
                        borderRadius: 4,
                        background: 'rgba(15,23,42,0.8)',
                        color: COLORS.text,
                        textAlign: 'center',
                        fontSize: 10,
                        fontFamily: "'JetBrains Mono', monospace",
                        outline: 'none',
                      }}
                    />
                  </label>
                  <button
                    onClick={() => handleQuickOrder('buy')}
                    onMouseEnter={() => setOrderBias('buy')}
                    style={{
                      height: 30,
                      border: '1px solid rgba(63,185,80,0.5)',
                      borderRadius: 5,
                      background: 'linear-gradient(180deg, rgba(63,185,80,0.95), rgba(21,128,61,0.92))',
                      color: '#fff',
                      fontFamily: "'Cairo', sans-serif",
                      fontSize: 12,
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                    title="شراء سريع مع Risk Overlay"
                  >
                    شراء
                  </button>
                </div>

                {/* Price readout lines and candle countdown attached below current price */}
                <PriceLineBadge
                  y={priceAnchors.current}
                  right={8}
                  label={formatChartPrice(marketPrice, priceDecimals)}
                  subLabel={chart.settings.showCandleTimer ? candleCountdown : undefined}
                  color={pricePulse ? COLORS.warning : COLORS.success}
                  title="السعر الحالي"
                />
                <PriceLineBadge
                  y={priceAnchors.ask}
                  right={8}
                  label={`ASK ${formatChartPrice(marketPrice + spreadSize / 2, priceDecimals)}`}
                  color="rgba(63,185,80,0.76)"
                  compact
                />
                <PriceLineBadge
                  y={priceAnchors.bid}
                  right={8}
                  label={`BID ${formatChartPrice(marketPrice - spreadSize / 2, priceDecimals)}`}
                  color="rgba(248,81,73,0.76)"
                  compact
                />

                {marketLayers.riskOverlay && activeRisk && (
                  <>
                    <PriceLineBadge y={priceAnchors.sl} right={8} label={`SL ${formatChartPrice(activeRisk.sl, priceDecimals)}`} color={COLORS.danger} compact />
                    <PriceLineBadge y={priceAnchors.tp} right={8} label={`TP ${formatChartPrice(activeRisk.tp, priceDecimals)}`} color={COLORS.success} compact />
                  </>
                )}

                {marketLayers.supportResistance && marketStructure && (
                  <>
                    <PriceLineBadge y={priceAnchors.support} right={8} label="Support" color="rgba(63,185,80,0.48)" compact />
                    <PriceLineBadge y={priceAnchors.resistance} right={8} label="Resistance" color="rgba(248,81,73,0.48)" compact />
                  </>
                )}

                {marketLayers.smartAlerts && marketStructure && (
                  <>
                    <PriceLineBadge y={priceAnchors.alertHigh} right={8} label="Smart alert" color={COLORS.warning} compact />
                    <PriceLineBadge y={priceAnchors.alertLow} right={8} label="Smart alert" color={COLORS.warning} compact />
                  </>
                )}

                <div style={{
                  position: 'absolute',
                  top: 76,
                  right: 64,
                  zIndex: 19,
                  display: 'flex',
                  gap: 4,
                  pointerEvents: 'auto',
                  direction: 'ltr',
                }}>
                  {multiTimeframeTrend.map(tf => (
                    <div key={tf.label} title={`${tf.label} ${tf.change.toFixed(2)}%`} style={{
                      minWidth: 42,
                      height: 24,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      borderRadius: 5,
                      background: 'rgba(10,13,19,0.74)',
                      border: '1px solid rgba(148,163,184,0.13)',
                      color: tf.direction === 'up' ? COLORS.success : tf.direction === 'down' ? COLORS.danger : COLORS.textMuted,
                      fontSize: 10,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: 800,
                      backdropFilter: 'blur(10px)',
                    }}>
                      <span>{tf.direction === 'up' ? '▲' : tf.direction === 'down' ? '▼' : '•'}</span>
                      {tf.label}
                    </div>
                  ))}
                </div>

                {marketLayers.aiCopilot && copilotIdea && (
                  <div style={{
                    position: 'absolute',
                    left: 14,
                    top: 72,
                    width: 238,
                    zIndex: 16,
                    background: 'rgba(10,13,19,0.78)',
                    border: '1px solid rgba(148,163,184,0.15)',
                    borderLeft: `3px solid ${copilotIdea.direction === 'buy' ? COLORS.success : COLORS.danger}`,
                    borderRadius: 7,
                    padding: '8px 10px',
                    pointerEvents: 'auto',
                    backdropFilter: 'blur(14px)',
                    boxShadow: '0 14px 32px rgba(0,0,0,0.32)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <span style={{ color: COLORS.text, fontSize: 11, fontWeight: 900, fontFamily: "'Cairo', sans-serif" }}>AI Chart Copilot</span>
                      <span style={{ color: copilotIdea.direction === 'buy' ? COLORS.success : COLORS.danger, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>
                        {copilotIdea.direction.toUpperCase()} {copilotIdea.probability}%
                      </span>
                    </div>
                    <div style={{ color: COLORS.textSecondary, fontSize: 10, lineHeight: 1.45, fontFamily: "'Cairo', sans-serif" }}>
                      {copilotIdea.reason}، ثقة {copilotIdea.confidence}%، دخول {formatChartPrice(copilotIdea.entry, priceDecimals)} وخروج {formatChartPrice(copilotIdea.exit, priceDecimals)}
                    </div>
                  </div>
                )}

                {marketLayers.riskOverlay && activeRisk && (
                  <div style={{
                    position: 'absolute',
                    right: 64,
                    top: 108,
                    zIndex: 18,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, auto)',
                    gap: 6,
                    pointerEvents: 'auto',
                    direction: 'ltr',
                    background: 'rgba(10,13,19,0.76)',
                    border: '1px solid rgba(148,163,184,0.14)',
                    borderRadius: 7,
                    padding: 6,
                    backdropFilter: 'blur(12px)',
                  }}>
                    {[
                      ['SL', formatChartPrice(activeRisk.sl, priceDecimals), COLORS.danger],
                      ['TP', formatChartPrice(activeRisk.tp, priceDecimals), COLORS.success],
                      ['R:R', activeRisk.rr.toFixed(2), COLORS.warning],
                      ['Risk', `$${activeRisk.expectedLoss.toFixed(2)}`, COLORS.text],
                    ].map(([label, value, color]) => (
                      <div key={label} style={{ display: 'grid', gap: 1, minWidth: 52 }}>
                        <span style={{ color: COLORS.textMuted, fontSize: 8, fontFamily: "'Cairo', sans-serif" }}>{label}</span>
                        <span style={{ color, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 900 }}>{value}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{
                  position: 'absolute',
                  left: 14,
                  bottom: 14,
                  zIndex: 20,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  pointerEvents: 'auto',
                  direction: 'ltr',
                  background: 'rgba(10,13,19,0.80)',
                  border: `1px solid ${replayMode ? 'rgba(251,191,36,0.34)' : COLORS.border}`,
                  borderRadius: 7,
                  padding: 6,
                  backdropFilter: 'blur(12px)',
                }}>
                  <button onClick={toggleReplayMode} style={replayButtonStyle(replayMode, COLORS.warning)} title="Replay Mode">
                    Replay
                  </button>
                  <button onClick={() => setIsReplayPlaying(v => !v)} disabled={!replayMode} style={replayButtonStyle(isReplayPlaying, COLORS.success)} title="تشغيل/إيقاف replay">
                    {isReplayPlaying ? 'Pause' : 'Play'}
                  </button>
                  <button onClick={() => setReplayIndex(i => Math.max(1, i - 1))} disabled={!replayMode} style={replayIconButtonStyle} title="شمعة للخلف">‹</button>
                  <input
                    type="range"
                    min={1}
                    max={Math.max(1, replaySourceRef.current.length || candlesRef.current.length)}
                    value={replayIndex || 1}
                    disabled={!replayMode}
                    onChange={e => setReplayIndex(Number(e.target.value))}
                    style={{ width: 120, accentColor: COLORS.warning }}
                  />
                  <button onClick={() => setReplayIndex(i => Math.min(replaySourceRef.current.length || i + 1, i + 1))} disabled={!replayMode} style={replayIconButtonStyle} title="شمعة للأمام">›</button>
                </div>

                <div style={{
                  position: 'absolute',
                  right: 64,
                  bottom: 14,
                  zIndex: 20,
                  display: 'flex',
                  gap: 4,
                  pointerEvents: 'auto',
                  direction: 'ltr',
                  background: 'rgba(10,13,19,0.78)',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 7,
                  padding: 5,
                  backdropFilter: 'blur(12px)',
                }}>
                  {[
                    { key: 'volume', label: 'Vol', active: chart.settings.showVolume, action: () => toggleMarketTool('volume') },
                    { key: 'vwap', label: 'VWAP', active: activeIndicatorKeys.includes('vwap'), action: () => toggleMarketTool('vwap') },
                    { key: 'ema', label: 'EMA', active: activeIndicatorKeys.includes('ema'), action: () => toggleMarketTool('ema') },
                    { key: 'rsi', label: 'RSI', active: activeIndicatorKeys.includes('rsi'), action: () => toggleMarketTool('rsi') },
                    { key: 'sessions', label: 'Sessions', active: marketLayers.sessions, action: () => toggleMarketTool('sessions') },
                    { key: 'sr', label: 'S/R', active: marketLayers.supportResistance, action: () => toggleMarketTool('supportResistance') },
                  ].map(item => (
                    <button key={item.key} onClick={item.action} style={{
                      height: 24,
                      minWidth: 36,
                      border: `1px solid ${item.active ? 'rgba(56,189,248,0.30)' : 'rgba(148,163,184,0.10)'}`,
                      borderRadius: 4,
                      background: item.active ? 'rgba(56,189,248,0.12)' : 'transparent',
                      color: item.active ? COLORS.cyan : COLORS.textSecondary,
                      fontSize: 9,
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: 800,
                      cursor: 'pointer',
                    }} title={item.label}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
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

function PriceLineBadge({
  y,
  right,
  label,
  subLabel,
  color,
  compact = false,
  title,
}: {
  y: number | null;
  right: number;
  label: string;
  subLabel?: string;
  color: string;
  compact?: boolean;
  title?: string;
}) {
  if (y === null || Number.isNaN(y)) return null;
  return (
    <div
      title={title}
      style={{
        position: 'absolute',
        top: Math.max(0, y - (compact ? 8 : 11)),
        right,
        zIndex: compact ? 13 : 22,
        pointerEvents: 'none',
        display: 'grid',
        justifyItems: 'end',
        gap: 2,
      }}
    >
      <span style={{
        minWidth: compact ? 66 : 92,
        textAlign: 'right',
        color,
        background: 'rgba(10,13,19,0.88)',
        border: `1px solid ${color}`,
        borderRadius: 4,
        padding: compact ? '1px 5px' : '2px 7px',
        fontSize: compact ? 9 : 11,
        fontFamily: "'JetBrains Mono', monospace",
        fontWeight: 900,
        lineHeight: 1.2,
        boxShadow: compact ? 'none' : `0 0 18px ${color}22`,
      }}>
        {label}
      </span>
      {subLabel && (
        <span style={{
          color,
          background: 'rgba(10,13,19,0.88)',
          border: `1px solid ${color}`,
          borderRadius: 4,
          padding: '1px 6px',
          fontSize: 9,
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 900,
          transform: 'translateY(1px)',
        }}>
          {subLabel}
        </span>
      )}
    </div>
  );
}

function formatChartPrice(price: number, decimals: number) {
  return Number.isFinite(price) ? price.toFixed(decimals) : '—';
}
