// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Volume Profile
// Displays volume traded at each price level on the right side
// ═══════════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { CandleData } from '@/lib/charts/types';

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

    const dpr = window.devicePixelRatio || 1;
    const h = canvas.parentElement?.clientHeight || 400;
    canvas.width = width * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, h);

    const maxVol = Math.max(...profile.map(r => r.volume));
    if (maxVol === 0) return;

    const rowH = h / rows;

    profile.forEach((row, i) => {
      if (row.volume === 0) return;

      const totalW = (row.volume / maxVol) * (width - 4);
      const buyW = (row.buyVolume / row.volume) * totalW;
      const sellW = totalW - buyW;

      const y = i * rowH;

      // Buy volume (green)
      ctx.fillStyle = 'rgba(63,185,80,0.25)';
      ctx.fillRect(width - 2 - totalW, y, buyW, rowH - 1);

      // Sell volume (red)
      ctx.fillStyle = 'rgba(248,81,73,0.25)';
      ctx.fillRect(width - 2 - sellW, y, sellW, rowH - 1);

      // Border
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(width - 2 - totalW, y, totalW, rowH - 1);
    });
  }, [profile, width, rows, visible]);

  if (!visible) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      right: 80, // Offset to avoid overlapping with lightweight-charts price scale
      width: width,
      height: '100%',
      pointerEvents: 'none',
      zIndex: 2,
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
