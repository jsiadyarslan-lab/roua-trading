// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Volume Profile
// Displays volume traded at each price level on the right side
// ═══════════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { CandleData } from '@/lib/charts/types';

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

interface VolumeProfileProps {
  candles: CandleData[];
  width?: number;
  rows?: number;
  visible?: boolean;
}

interface VolumeRow {
  price: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
}

export function VolumeProfile({ candles, width = 80, rows = 24, visible = true }: VolumeProfileProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
      price: minPrice + step * (i + 0.5),
      volume: 0,
      buyVolume: 0,
      sellVolume: 0,
    }));

    candles.forEach(c => {
      const isBull = c.close >= c.open;
      // Distribute volume across the candle's range
      const startIdx = Math.max(0, Math.floor((c.low - minPrice) / step));
      const endIdx = Math.min(rows - 1, Math.floor((c.high - minPrice) / step));

      for (let i = startIdx; i <= endIdx; i++) {
        rowMap[i].volume += c.volume / (endIdx - startIdx + 1);
        if (isBull) {
          rowMap[i].buyVolume += c.volume / (endIdx - startIdx + 1);
        } else {
          rowMap[i].sellVolume += c.volume / (endIdx - startIdx + 1);
        }
      }
    });

    return rowMap;
  }, [candles, rows]);

  // Render on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible || !profile.length) return;

    const renderCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const h = Math.max(canvas.parentElement?.clientHeight || 0, canvas.parentElement?.offsetHeight || 0, 400);
      canvas.width = width * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${h}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, h);

      const maxVol = safeMax(profile.map(r => r.volume));
      if (maxVol === 0) return;

      const rowH = h / rows;

      profile.forEach((row, i) => {
        if (row.volume === 0) return;

        const totalW = (row.volume / maxVol) * (width - 4);
        const buyW = (row.buyVolume / row.volume) * totalW;
        const sellW = totalW - buyW;

        const y = i * rowH;

        // Buy volume (green) — starts from left edge of the bar
        ctx.fillStyle = 'rgba(63,185,80,0.25)';
        ctx.fillRect(width - 2 - totalW, y, buyW, rowH - 1);

        // Sell volume (red) — starts right after buy volume
        ctx.fillStyle = 'rgba(248,81,73,0.25)';
        ctx.fillRect(width - 2 - totalW + buyW, y, sellW, rowH - 1);

        // Border
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(width - 2 - totalW, y, totalW, rowH - 1);

        // Price label (small, right-aligned inside bar)
        if (i % 4 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.font = `${Math.max(7, rowH * 0.5)}px 'JetBrains Mono', monospace`;
          ctx.textAlign = 'right';
          ctx.fillText(row.price.toFixed(row.price > 1000 ? 0 : 2), width - 4, y + rowH * 0.75);
        }
      });
    };

    renderCanvas();

    // ResizeObserver to re-render on container resize
    const parent = canvas.parentElement;
    if (parent) {
      const ro = new ResizeObserver(() => {
        renderCanvas();
      });
      ro.observe(parent);
      return () => ro.disconnect();
    }
  }, [profile, width, rows, visible]);

  if (!visible) return null;

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      pointerEvents: 'auto',
    }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />

      {/* Label */}
      <div style={{
        position: 'absolute',
        top: 4,
        left: 4,
        fontSize: 8,
        color: 'rgba(255,255,255,0.3)',
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: 0.5,
      }}>
        VOL PROFILE
      </div>
    </div>
  );
}
