// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Volume Profile (Overlay v3)
// Renders INSIDE the chart plotting area, to the LEFT of
// the price scale. Uses priceToCoordinate() for Y-axis sync.
// ═══════════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useMemo } from 'react';
import type { CandleData } from '@/lib/charts/types';
import type { ISeriesApi, SeriesType } from 'lightweight-charts';

function safeMax(arr: number[]): number {
  if (arr.length === 0) return -Infinity;
  let max = arr[0];
  for (let i = 1; i < arr.length; i++) { if (arr[i] > max) max = arr[i]; }
  return max;
}

interface VolumeProfileProps {
  candles: CandleData[];
  candleSeries: ISeriesApi<SeriesType> | null;
  width?: number;
  rows?: number;
  visible?: boolean;
  containerHeight?: number;
  /** Width of the right price scale in px (default: 70) */
  priceScaleWidth?: number;
}

interface VolumeRow {
  priceLow: number;
  priceHigh: number;
  price: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
}

export function VolumeProfile({
  candles,
  candleSeries,
  width = 80,
  rows = 24,
  visible = true,
  containerHeight = 400,
  priceScaleWidth = 70,
}: VolumeProfileProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  // Calculate volume profile data
  const profile = useMemo((): VolumeRow[] => {
    if (!candles.length) return [];

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    candles.forEach(c => {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
    });

    if (minPrice === maxPrice) return [];

    const step = (maxPrice - minPrice) / rows;
    const rowMap: VolumeRow[] = Array.from({ length: rows }, (_, i) => ({
      priceLow: minPrice + step * i,
      priceHigh: minPrice + step * (i + 1),
      price: minPrice + step * (i + 0.5),
      volume: 0,
      buyVolume: 0,
      sellVolume: 0,
    }));

    candles.forEach(c => {
      const isBull = c.close >= c.open;
      const startIdx = Math.max(0, Math.floor((c.low - minPrice) / step));
      const endIdx = Math.min(rows - 1, Math.floor((c.high - minPrice) / step));

      for (let i = startIdx; i <= endIdx; i++) {
        const share = c.volume / (endIdx - startIdx + 1);
        rowMap[i].volume += share;
        if (isBull) {
          rowMap[i].buyVolume += share;
        } else {
          rowMap[i].sellVolume += share;
        }
      }
    });

    return rowMap;
  }, [candles, rows]);

  // Render using priceToCoordinate for perfect Y-axis alignment
  useEffect(() => {
    if (!visible || !profile.length || !candleSeries) return;

    const renderFrame = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const dpr = window.devicePixelRatio || 1;
      const w = width;
      const h = containerHeight;

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const maxVol = safeMax(profile.map(r => r.volume));
      if (maxVol === 0) return;

      // Semi-transparent background
      ctx.fillStyle = 'rgba(12, 14, 20, 0.40)';
      ctx.fillRect(0, 0, w, h);

      // Draw each row
      for (let i = 0; i < profile.length; i++) {
        const row = profile[i];
        if (row.volume === 0) continue;

        const yHigh = candleSeries.priceToCoordinate(row.priceHigh);
        const yLow = candleSeries.priceToCoordinate(row.priceLow);

        if (yHigh === null || yLow === null) continue;

        const rowTop = yHigh;
        const rowH = Math.max(1, yLow - yHigh);

        if (rowTop + rowH < 0 || rowTop > h) continue;

        // Bars grow from RIGHT edge toward center (left)
        const totalW = (row.volume / maxVol) * (w - 8);
        const buyW = (row.buyVolume / row.volume) * totalW;
        const sellW = totalW - buyW;

        const barX = w - 4 - totalW;

        // Buy volume (green)
        ctx.fillStyle = 'rgba(63,185,80,0.30)';
        ctx.fillRect(barX, rowTop, buyW, rowH);

        // Sell volume (red)
        ctx.fillStyle = 'rgba(248,81,73,0.30)';
        ctx.fillRect(barX + buyW, rowTop, sellW, rowH);

        // Border
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(barX, rowTop, totalW, rowH);

        // Price label on every 4th row
        if (i % 4 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.22)';
          ctx.font = `${Math.max(7, Math.min(rowH * 0.6, 9))}px 'JetBrains Mono', monospace`;
          ctx.textAlign = 'left';
          ctx.fillText(
            row.price.toFixed(row.price > 1000 ? 0 : 2),
            3,
            rowTop + rowH * 0.7
          );
        }
      }

      // POC line
      const pocRow = profile.reduce((a, b) => b.volume > a.volume ? b : a);
      const pocY = candleSeries.priceToCoordinate(pocRow.price);
      if (pocY !== null && pocY >= 0 && pocY <= h) {
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(0, pocY);
        ctx.lineTo(w, pocY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(255, 215, 0, 0.6)';
        ctx.font = "bold 8px 'JetBrains Mono', monospace";
        ctx.textAlign = 'left';
        ctx.fillText('POC', 3, pocY - 3);
      }
    };

    renderFrame();

    const intervalId = setInterval(renderFrame, 500);

    return () => {
      clearInterval(intervalId);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [profile, width, rows, visible, candleSeries, containerHeight]);

  if (!visible) return null;

  // Position to the LEFT of the price scale, not on top of it
  return (
    <div style={{
      position: 'absolute',
      right: `${priceScaleWidth}px`,
      top: 0,
      bottom: 0,
      width: `${width}px`,
      pointerEvents: 'none',
      overflow: 'hidden',
      zIndex: 4,
    }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />

      {/* Label */}
      <div style={{
        position: 'absolute',
        top: 4,
        left: 4,
        fontSize: 'var(--text-xs)',
        color: 'rgba(255,255,255,0.3)',
        fontFamily: "var(--font-mono)",
        letterSpacing: 0.5,
        pointerEvents: 'none',
      }}>
        VOL PROFILE
      </div>
    </div>
  );
}
