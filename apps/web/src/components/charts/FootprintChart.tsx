// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Footprint Super Chart
// Shows actual trading volume inside each candle (bid x ask)
// ═══════════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl'

function safeMax(arr: number[]): number {
  if (arr.length === 0) return -Infinity;
  let max = arr[0];
  for (let i = 1; i < arr.length; i++) { if (arr[i] > max) max = arr[i]; }
  return max;
}
function safeMin(arr: number[]): number {
  if (arr.length === 0) return Infinity;
  let min = arr[0];
  for (let i = 1; i < arr.length; i++) { if (arr[i] < min) min = arr[i]; }
  return min;
}

interface FootprintChartProps {
  symbol: string;
  onClose?: () => void;
}

interface PriceLevel {
  price: number;
  bidVol: number;
  askVol: number;
}

interface FootprintCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  levels: PriceLevel[];
  pocPrice: number;
  totalBid: number;
  totalAsk: number;
}

type FootprintMode = 'bidask' | 'delta' | 'volume';
type FootprintTimeframe = '1min' | '5min' | '15min' | '1h';

const C = {
  bg: '#0B0E14',
  card: '#151A22',
  border: '#151A22',
  text: '#F0F2F5',
  textDim: '#9CA3B5',
  textMuted: '#6B7280',
  cyan: '#00D4FF',
  success: '#00FFA3',
  danger: '#FF4757',
  warning: '#FFB800',
};

const TF_OPTIONS: { value: FootprintTimeframe; label: string }[] = [
  { value: '1min', label: '1m' },
  { value: '5min', label: '5m' },
  { value: '15min', label: '15m' },
  { value: '1h', label: '1H' },
];

function generateSimulatedFootprint(symbol: string, tf: FootprintTimeframe): FootprintCandle[] {
  const basePrice = symbol.includes('BTC') ? 67000 : symbol.includes('ETH') ? 3500 : symbol.includes('JPY') ? 150 : 1.1;
  const dp = basePrice > 100 ? 2 : basePrice > 1 ? 5 : 3;
  const tfMinutes = tf === '1min' ? 1 : tf === '5min' ? 5 : tf === '15min' ? 15 : 60;
  const now = Math.floor(Date.now() / 1000);
  const count = 40;
  const candles: FootprintCandle[] = [];
  let p = basePrice;

  for (let i = 0; i < count; i++) {
    const t = now - (count - i) * tfMinutes * 60;
    const rng = p * 0.004;
    const o = p;
    const c = p + (Math.random() - 0.48) * rng;
    const h = Math.max(o, c) + Math.random() * rng * 0.4;
    const l = Math.min(o, c) - Math.random() * rng * 0.4;

    const levels: PriceLevel[] = [];
    const step = (h - l) / 8;
    let maxVol = 0;
    let pocPrice = l;
    let totalBid = 0;
    let totalAsk = 0;

    for (let j = 0; j < 8; j++) {
      const price = l + step * j;
      const bidVol = Math.round(50 + Math.random() * 400);
      const askVol = Math.round(50 + Math.random() * 400);
      totalBid += bidVol;
      totalAsk += askVol;
      const total = bidVol + askVol;
      if (total > maxVol) { maxVol = total; pocPrice = price; }
      levels.push({ price: +price.toFixed(dp), bidVol, askVol });
    }

    candles.push({
      time: t,
      open: +o.toFixed(dp),
      high: +h.toFixed(dp),
      low: +l.toFixed(dp),
      close: +c.toFixed(dp),
      levels,
      pocPrice: +pocPrice.toFixed(dp),
      totalBid,
      totalAsk,
    });
    p = c;
  }

  return candles;
}

export function FootprintChart({ symbol, onClose }: FootprintChartProps) {
  const t = useTranslations('dashboard.chartFootprint');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<FootprintMode>('bidask');
  const [tf, setTf] = useState<FootprintTimeframe>('5min');
  const [data, setData] = useState<FootprintCandle[]>([]);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [imbalances, setImbalances] = useState(true);

  const CANDLE_W = 120;
  const LEVEL_H = 18;
  const HEADER_H = 28;
  const PRICE_COL_W = 70;

  const loadData = useCallback(() => {
    const candles = generateSimulatedFootprint(symbol, tf);
    setData(candles);
  }, [symbol, tf]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto refresh
  useEffect(() => {
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const container = containerRef.current;
    if (!container) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // Find global price range
    let globalMin = Infinity, globalMax = -Infinity;
    data.forEach(c => { globalMin = Math.min(globalMin, c.low); globalMax = Math.max(globalMax, c.high); });
    const priceRange = globalMax - globalMin || 1;

    // Determine number of price levels to display
    const numLevels = Math.min(Math.floor((H - HEADER_H) / LEVEL_H), 25);
    const levelStep = priceRange / numLevels;

    // Header
    ctx.fillStyle = C.card;
    ctx.fillRect(0, 0, W, HEADER_H);
    ctx.strokeStyle = C.border;
    ctx.beginPath();
    ctx.moveTo(0, HEADER_H);
    ctx.lineTo(W, HEADER_H);
    ctx.stroke();

    // Draw price column
    ctx.fillStyle = C.textDim;
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i < numLevels; i++) {
      const price = globalMax - i * levelStep;
      const y = HEADER_H + i * LEVEL_H;
      ctx.fillText(price.toFixed(price > 100 ? 2 : 5), PRICE_COL_W - 8, y + LEVEL_H / 2 + 3);
    }

    // Draw candles
    const visibleCandles = Math.min(data.length, Math.floor((W - PRICE_COL_W) / CANDLE_W));
    const startIdx = Math.max(0, data.length - visibleCandles - scrollOffset);

    for (let ci = 0; ci < visibleCandles && startIdx + ci < data.length; ci++) {
      const candle = data[startIdx + ci];
      const x = PRICE_COL_W + ci * CANDLE_W;

      // Column separator
      ctx.strokeStyle = C.border;
      ctx.beginPath();
      ctx.moveTo(x, HEADER_H);
      ctx.lineTo(x, H);
      ctx.stroke();

      // Column header (time)
      ctx.fillStyle = C.textMuted;
      ctx.font = '8px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      const timeStr = new Date(candle.time * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      ctx.fillText(timeStr, x + CANDLE_W / 2, HEADER_H - 8);

      // Candle outline
      const bullColor = '#00FFA3';
      const bearColor = '#FF4757';
      const isBull = candle.close >= candle.open;

      // Draw volume at each level
      for (let li = 0; li < numLevels; li++) {
        const levelPrice = globalMax - li * levelStep;
        const y = HEADER_H + li * LEVEL_H;

        // Find matching level in candle data
        let bidVol = 0, askVol = 0;
        for (const lvl of candle.levels) {
          if (Math.abs(lvl.price - levelPrice) < levelStep) {
            bidVol += lvl.bidVol;
            askVol += lvl.askVol;
          }
        }

        const maxVol = Math.max(candle.totalBid, candle.totalAsk, 1);
        const cellW = CANDLE_W - 8;

        if (mode === 'bidask') {
          // Bid on right (red), Ask on left (green)
          const bidW = (bidVol / maxVol) * cellW * 0.45;
          const askW = (askVol / maxVol) * cellW * 0.45;

          ctx.fillStyle = 'rgba(255,71,87,0.35)';
          ctx.fillRect(x + CANDLE_W / 2 + 2, y + 1, bidW, LEVEL_H - 2);
          ctx.fillStyle = 'rgba(0,255,163,0.35)';
          ctx.fillRect(x + CANDLE_W / 2 - askW - 2, y + 1, askW, LEVEL_H - 2);

          // Volume text
          if (bidVol > 0 || askVol > 0) {
            ctx.fillStyle = C.textDim;
            ctx.font = '7px JetBrains Mono, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${bidVol}×${askVol}`, x + CANDLE_W / 2, y + LEVEL_H / 2 + 2);
          }
        } else if (mode === 'delta') {
          const delta = askVol - bidVol;
          const maxDelta = maxVol;
          const deltaW = Math.min(Math.abs(delta) / maxDelta * cellW * 0.7, cellW * 0.7);
          if (delta > 0) {
            ctx.fillStyle = `rgba(0,255,163,${Math.min(0.6, delta / maxDelta + 0.15)})`;
            ctx.fillRect(x + CANDLE_W / 2 - deltaW / 2, y + 1, deltaW, LEVEL_H - 2);
          } else if (delta < 0) {
            ctx.fillStyle = `rgba(255,71,87,${Math.min(0.6, Math.abs(delta) / maxDelta + 0.15)})`;
            ctx.fillRect(x + CANDLE_W / 2 - deltaW / 2, y + 1, deltaW, LEVEL_H - 2);
          }
          if (delta !== 0) {
            ctx.fillStyle = C.textDim;
            ctx.font = '7px JetBrains Mono, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${delta > 0 ? '+' : ''}${delta}`, x + CANDLE_W / 2, y + LEVEL_H / 2 + 2);
          }
        } else {
          const total = bidVol + askVol;
          const totalW = (total / (maxVol * 2)) * cellW * 0.7;
          ctx.fillStyle = `rgba(0,212,255,${Math.min(0.5, total / (maxVol * 2) + 0.1)})`;
          ctx.fillRect(x + CANDLE_W / 2 - totalW / 2, y + 1, totalW, LEVEL_H - 2);
          if (total > 0) {
            ctx.fillStyle = C.textDim;
            ctx.font = '7px JetBrains Mono, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${total}`, x + CANDLE_W / 2, y + LEVEL_H / 2 + 2);
          }
        }

        // Imbalance highlight
        if (imbalances && (bidVol > 0 || askVol > 0)) {
          const ratio = askVol > 0 ? bidVol / askVol : bidVol > 0 ? 999 : 0;
          if (ratio > 3) {
            ctx.fillStyle = 'rgba(255,71,87,0.12)';
            ctx.fillRect(x + 2, y, CANDLE_W - 4, LEVEL_H);
          } else if (ratio < 0.33 && askVol > 0) {
            ctx.fillStyle = 'rgba(0,255,163,0.12)';
            ctx.fillRect(x + 2, y, CANDLE_W - 4, LEVEL_H);
          }
        }

        // POC marker
        if (Math.abs(levelPrice - candle.pocPrice) < levelStep) {
          ctx.fillStyle = C.warning;
          ctx.fillRect(x + 2, y + LEVEL_H - 3, CANDLE_W - 4, 2);
        }
      }

      // Delta bar at bottom
      const delta = candle.totalAsk - candle.totalBid;
      const maxTotal = Math.max(candle.totalBid, candle.totalAsk, 1);
      const deltaBarW = Math.abs(delta) / maxTotal * (CANDLE_W - 8);
      const barY = H - 6;
      ctx.fillStyle = delta > 0 ? 'rgba(0,255,163,0.5)' : 'rgba(255,71,87,0.5)';
      ctx.fillRect(x + 4, barY, deltaBarW, 4);
    }
  }, [data, mode, scrollOffset, imbalances]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.deltaX !== 0) {
      setScrollOffset(prev => Math.max(0, Math.min(data.length - 5, prev + (e.deltaX > 0 ? 1 : -1))));
    }
  }, [data.length]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: 250, background: C.bg,
      borderTop: `1px solid ${C.border}`,
    }}>
      {/* Header bar */}
      <div data-drag-handle style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 10px', background: C.card,
        borderBottom: `1px solid ${C.border}`,
        direction: 'inherit',
        cursor: 'grab',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: C.cyan, fontWeight: 700, fontFamily: "var(--font-ar)" }}>
            👣 {t('footprint')}
          </span>
          <span style={{ fontSize: 11, color: C.textMuted, fontFamily: "var(--font-mono)" }}>
            {symbol}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Mode buttons */}
          {(['bidask', 'delta', 'volume'] as FootprintMode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                background: mode === m ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${mode === m ? 'rgba(0,212,255,0.3)' : C.border}`,
                borderRadius: 'var(--radius-sm)', color: mode === m ? C.cyan : C.textDim,
                fontSize: 11, fontWeight: mode === m ? 700 : 400,
                padding: '2px 6px', cursor: 'pointer',
                fontFamily: "var(--font-mono)",
                transition: 'all 0.15s ease',
              }}
            >
              {m === 'bidask' ? t('bidAsk') : m === 'delta' ? t('delta') : t('vol')}
            </button>
          ))}

          <div style={{ width: 1, height: 14, background: C.border, margin: '0 2px' }} />

          {/* TF buttons */}
          {TF_OPTIONS.map(t => (
            <button
              key={t.value}
              onClick={() => setTf(t.value)}
              style={{
                background: tf === t.value ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${tf === t.value ? 'rgba(0,212,255,0.3)' : C.border}`,
                borderRadius: 'var(--radius-sm)', color: tf === t.value ? C.cyan : C.textDim,
                fontSize: 11, fontWeight: tf === t.value ? 700 : 400,
                padding: '2px 5px', cursor: 'pointer',
                fontFamily: "var(--font-mono)",
                transition: 'all 0.15s ease',
              }}
            >
              {t.label}
            </button>
          ))}

          <div style={{ width: 1, height: 14, background: C.border, margin: '0 2px' }} />

          {/* Imbalance toggle */}
          <button
            onClick={() => setImbalances(!imbalances)}
            style={{
              background: imbalances ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${imbalances ? 'rgba(251,191,36,0.3)' : C.border}`,
              borderRadius: 'var(--radius-sm)', color: imbalances ? C.warning : C.textDim,
              fontSize: 11, fontWeight: 700,
              padding: '2px 6px', cursor: 'pointer',
              fontFamily: "var(--font-mono)",
            }}
          >
            {t('imbalance')}
          </button>

          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.04)', border: 'none', borderRadius: 'var(--radius-xs)',
                color: C.textMuted, width: 18, height: 18, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, padding: 0,
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} style={{ flex: 1, position: 'relative' }} onWheel={handleWheel}>
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />
      </div>
    </div>
  );
}
