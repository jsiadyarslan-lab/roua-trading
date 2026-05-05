// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Compare Overlay
// Overlays a second asset's price as a LineSeries on the main chart
// using a separate price scale for visual comparison.
// ═══════════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface CompareOverlayProps {
  chart: any; // IChartApi from lightweight-charts
  symbol: string; // The comparison symbol (e.g., 'ETH/USDT')
  onClose: () => void;
}

export function CompareOverlay({ chart, symbol, onClose }: CompareOverlayProps) {
  const seriesRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);

  // ── Fetch & overlay comparison data ─────────────────────
  const loadComparison = useCallback(async () => {
    if (!chart) return;

    try {
      setLoading(true);
      setError(null);

      const res = await fetch(
        `/api/exchange/history/${encodeURIComponent(symbol)}?interval=1h`
      );
      const j = await res.json();

      if (!j.success || !j.data || j.data.length === 0) {
        setError('لا توجد بيانات');
        setLoading(false);
        return;
      }

      // Format data for lightweight-charts LineSeries
      const lineData: { time: number; value: number }[] = j.data
        .map((c: any) => ({
          time: Math.floor(new Date(c.timestamp).getTime() / 1000),
          value: Number(c.close) || 0,
        }))
        .filter((d: any) => !isNaN(d.time) && d.time > 0 && !isNaN(d.value));

      // Deduplicate by time
      const seen = new Set<number>();
      const unique = lineData.filter((d) => {
        if (seen.has(d.time)) return false;
        seen.add(d.time);
        return true;
      });

      // Sort by time (lightweight-charts requires ascending)
      unique.sort((a, b) => a.time - b.time);

      if (unique.length === 0) {
        setError('لا توجد بيانات صالحة');
        setLoading(false);
        return;
      }

      // Remove previous series if it exists
      if (seriesRef.current) {
        try {
          chart.removeSeries(seriesRef.current);
        } catch { /* series may have been removed already */ }
        seriesRef.current = null;
      }

      // Dynamic import lightweight-charts for LineSeries
      const { LineSeries } = await import('lightweight-charts');

      // Create a secondary LineSeries with separate price scale
      const compareSeries = chart.addSeries(LineSeries, {
        color: '#d4af37',
        lineWidth: 2 as any,
        priceScaleId: 'compare-overlay',
        lastValueVisible: true,
        priceLineVisible: false,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 3,
      });

      // Configure the compare-overlay price scale on the left
      compareSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.1, bottom: 0.2 },
        borderVisible: true,
        borderColor: 'rgba(212,175,55,0.3)',
        visible: true,
      });

      compareSeries.setData(unique as any);
      seriesRef.current = compareSeries;

      // Set current price from last data point
      setCurrentPrice(unique[unique.length - 1]?.value ?? null);
      setLoading(false);
    } catch (err) {
      setError('فشل تحميل البيانات');
      setLoading(false);
    }
  }, [chart, symbol]);

  // ── Load on mount / when symbol changes ──────────────────
  useEffect(() => {
    loadComparison();
  }, [loadComparison]);

  // ── Cleanup: remove series when component unmounts ──────
  useEffect(() => {
    return () => {
      if (seriesRef.current && chart) {
        try {
          chart.removeSeries(seriesRef.current);
        } catch { /* ignore */ }
        seriesRef.current = null;
      }
    };
  }, [chart]);

  // ── Close handler: remove series then call onClose ──────
  const handleClose = useCallback(() => {
    if (seriesRef.current && chart) {
      try {
        chart.removeSeries(seriesRef.current);
      } catch { /* ignore */ }
      seriesRef.current = null;
    }
    onClose();
  }, [chart, onClose]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(8,10,18,0.88)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(212,175,55,0.3)',
        borderRadius: 8,
        padding: '4px 10px',
        zIndex: 100,
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        color: '#d4af37',
      }}
    >
      {/* Symbol label */}
      <span style={{ fontWeight: 700, letterSpacing: 0.4 }}>
        ≡ {symbol}
      </span>

      {/* Current price or loading/error state */}
      {loading && (
        <span style={{ color: 'rgba(212,175,55,0.6)' }}>...</span>
      )}
      {error && (
        <span style={{ color: '#f85149', fontSize: 9 }}>{error}</span>
      )}
      {currentPrice !== null && !loading && !error && (
        <span style={{ color: '#d4af37', fontWeight: 600 }}>
          {currentPrice > 1000
            ? currentPrice.toFixed(1)
            : currentPrice > 1
              ? currentPrice.toFixed(2)
              : currentPrice.toFixed(5)}
        </span>
      )}

      {/* Close button */}
      <button
        onClick={handleClose}
        style={{
          background: 'rgba(212,175,55,0.15)',
          border: 'none',
          borderRadius: 4,
          color: '#d4af37',
          width: 16,
          height: 16,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          lineHeight: 1,
          padding: 0,
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(212,175,55,0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(212,175,55,0.15)';
        }}
        title="إزالة المقارنة"
      >
        ✕
      </button>
    </div>
  );
}
