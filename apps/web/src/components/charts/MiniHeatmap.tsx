// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Mini Heatmap Widget
// Grid of mini price change heatmaps for popular symbols
// ═══════════════════════════════════════════════════════════

'use client';

import { useState, useEffect, useCallback, useRef } from 'react'

// ── Types ─────────────────────────────────────────────────
interface HeatmapItem {
  symbol: string;
  change: number; // % change
  volume?: number;
  price?: number;
}

type SortMode = 'name' | 'change' | 'volume';

interface MiniHeatmapProps {
  /** Currently selected symbol */
  selectedSymbol: string;
  /** Callback when user clicks a symbol to switch the chart */
  onSelectSymbol: (symbol: string) => void;
  /** Close the panel */
  onClose: () => void;
}

// ── Color Palette ─────────────────────────────────────────
const C = {
  bg: 'rgba(11,14,20,0.97)',
  card: '#151A22',
  border: '#151A22',
  cyan: '#00D4FF',
  text: '#F0F2F5',
  textDim: '#9CA3B5',
  textMuted: '#6B7280',
  success: '#00FFA3',
  danger: '#FF4757',
  warning: '#FFB800',
};

// ── Simulated data (used when API fails) ──────────────────
const SIMULATED_SYMBOLS: HeatmapItem[] = [
  { symbol: 'BTC/USDT', change: 2.45, volume: 1_250_000_000, price: 67500 },
  { symbol: 'ETH/USDT', change: -1.23, volume: 680_000_000, price: 3520 },
  { symbol: 'BNB/USDT', change: 0.87, volume: 320_000_000, price: 595 },
  { symbol: 'SOL/USDT', change: 5.67, volume: 450_000_000, price: 178 },
  { symbol: 'XRP/USDT', change: -0.45, volume: 280_000_000, price: 0.62 },
  { symbol: 'ADA/USDT', change: -2.34, volume: 150_000_000, price: 0.45 },
  { symbol: 'DOGE/USDT', change: 3.21, volume: 220_000_000, price: 0.165 },
  { symbol: 'AVAX/USDT', change: -1.89, volume: 180_000_000, price: 35.5 },
  { symbol: 'DOT/USDT', change: 0.34, volume: 95_000_000, price: 7.25 },
  { symbol: 'MATIC/USDT', change: -3.12, volume: 110_000_000, price: 0.72 },
  { symbol: 'LINK/USDT', change: 1.56, volume: 165_000_000, price: 14.8 },
  { symbol: 'UNI/USDT', change: -0.78, volume: 75_000_000, price: 9.35 },
  { symbol: 'ATOM/USDT', change: 2.10, volume: 88_000_000, price: 8.92 },
  { symbol: 'LTC/USDT', change: 0.92, volume: 125_000_000, price: 82.5 },
  { symbol: 'NEAR/USDT', change: -4.23, volume: 140_000_000, price: 6.12 },
  { symbol: 'APT/USDT', change: 1.78, volume: 92_000_000, price: 9.45 },
  { symbol: 'AR/USDT', change: 6.89, volume: 55_000_000, price: 35.2 },
  { symbol: 'OP/USDT', change: -1.56, volume: 72_000_000, price: 2.85 },
  { symbol: 'ARB/USDT', change: 0.45, volume: 88_000_000, price: 1.12 },
  { symbol: 'SUI/USDT', change: 4.12, volume: 110_000_000, price: 1.78 },
];

// ── Color interpolation based on % change ─────────────────
function getHeatmapColor(change: number, opacity: number = 1): string {
  const maxChange = 5; // Clamp at 5% for color intensity
  const clamped = Math.max(-maxChange, Math.min(maxChange, change));
  const intensity = Math.abs(clamped) / maxChange;

  if (clamped >= 0) {
    // Green gradient: darker to brighter
    const r = Math.round(0 + (0 - 0) * intensity);
    const g = Math.round(80 + (255 - 80) * intensity);
    const b = Math.round(40 + (163 - 40) * intensity);
    return `rgba(${r},${g},${b},${0.15 + intensity * 0.55 * opacity})`;
  } else {
    // Red gradient: darker to brighter
    const r = Math.round(80 + (255 - 80) * intensity);
    const g = Math.round(30 + (71 - 30) * intensity);
    const b = Math.round(40 + (87 - 40) * intensity);
    return `rgba(${r},${g},${b},${0.15 + intensity * 0.55 * opacity})`;
  }
}

function getTextColor(change: number): string {
  if (Math.abs(change) < 0.3) return C.textDim;
  return change >= 0 ? C.success : C.danger;
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(1)}B`;
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(0)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(0)}K`;
  return vol.toString();
}

// ── Main Component ────────────────────────────────────────
export function MiniHeatmap({ selectedSymbol, onSelectSymbol, onClose }: MiniHeatmapProps) {
  const [items, setItems] = useState<HeatmapItem[]>(SIMULATED_SYMBOLS);
  const [sortMode, setSortMode] = useState<SortMode>('change');
  const [loading, setLoading] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch real data from API ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/exchange/quotes');
      const j = await res.json();

      if (j.success && j.data && Array.isArray(j.data) && j.data.length > 0) {
        const mapped: HeatmapItem[] = j.data.map((q: any) => ({
          symbol: q.symbol || q.pair || '',
          change: Number(q.changePercent || q.change || q.percentChange || 0),
          volume: Number(q.volume || 0),
          price: Number(q.price || q.lastPrice || 0),
        })).filter((item: HeatmapItem) => item.symbol);

        if (mapped.length > 0) {
          setItems(mapped);
        }
        // Else keep simulated data
      }
    } catch {
      // Keep simulated data on error
    }
    setLoading(false);
  }, []);

  // ── Initial fetch + auto-refresh every 30s ──
  useEffect(() => {
    fetchData();
    refreshTimerRef.current = setInterval(fetchData, 30000);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [fetchData]);

  // ── Sort items ──
  const sortedItems = [...items].sort((a, b) => {
    switch (sortMode) {
      case 'name':
        return a.symbol.localeCompare(b.symbol);
      case 'change':
        return Math.abs(b.change) - Math.abs(a.change);
      case 'volume':
        return (b.volume || 0) - (a.volume || 0);
      default:
        return 0;
    }
  });

  const activeAlertCount = items.filter(i => Math.abs(i.change) >= 3).length;

  return (
    <div style={{
      width: 340,
      background: C.bg,
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      borderLeft: `1px solid ${C.border}`,
      zIndex: 500,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      boxShadow: '-10px 0 40px rgba(0,0,0,0.5)',
    }}>
      {/* Header */}
      <div data-drag-handle style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: `1px solid ${C.border}`,
        background: `linear-gradient(180deg, ${C.card} 0%, rgba(17,22,32,0.6) 100%)`,
        direction: 'inherit',
        cursor: 'grab',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 24, height: 24, borderRadius: 'var(--radius-sm)',
            background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
          }}>
            🔲
          </div>
          <div>
            <div style={{ fontSize: 13, color: C.text, fontWeight: 700, fontFamily: "var(--font-ar)" }}>
              Heatmap
            </div>
            <div style={{ fontSize: 11, color: C.textDim, fontFamily: "var(--font-mono)" }}>
              {items.length} symbols • {activeAlertCount} hot
            </div>
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.04)', border: 'none', borderRadius: 'var(--radius-sm)',
          color: C.textMuted, width: 22, height: 22, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, padding: 0,
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      {/* Sort controls */}
      <div style={{ padding: '6px 14px', display: 'flex', gap: 3 }}>
        {([
          { mode: 'change' as SortMode, label: '% Change' },
          { mode: 'volume' as SortMode, label: 'Volume' },
          { mode: 'name' as SortMode, label: 'Name' },
        ]).map(s => (
          <button
            key={s.mode}
            onClick={() => setSortMode(s.mode)}
            style={{
              flex: 1, padding: '4px 0',
              background: sortMode === s.mode ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${sortMode === s.mode ? 'rgba(0,212,255,0.25)' : C.border}`,
              borderRadius: 'var(--radius-sm)', color: sortMode === s.mode ? C.cyan : C.textDim,
              fontSize: 11, fontWeight: sortMode === s.mode ? 700 : 500,
              cursor: 'pointer', fontFamily: "var(--font-mono)",
            }}
          >
            {s.label}
          </button>
        ))}

        {/* Refresh button */}
        <button
          onClick={fetchData}
          style={{
            width: 24, height: 24, borderRadius: 'var(--radius-sm)',
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${C.border}`,
            color: C.textDim, fontSize: 11, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            transition: 'transform 0.3s ease',
            transform: loading ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
          title="Refresh data"
        >
          ↻
        </button>
      </div>

      {/* Heatmap Grid */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '6px 8px 8px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
        gap: 3,
        alignContent: 'start',
      }}>
        {sortedItems.map(item => {
          const isSelected = item.symbol === selectedSymbol;
          const bgColor = getHeatmapColor(item.change);
          const textColor = getTextColor(item.change);
          const isHot = Math.abs(item.change) >= 3;

          return (
            <button
              key={item.symbol}
              onClick={() => onSelectSymbol(item.symbol)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px 4px',
                minHeight: 52,
                background: bgColor,
                border: `1px solid ${isSelected ? 'rgba(0,212,255,0.5)' : isHot ? (item.change >= 0 ? 'rgba(0,255,163,0.2)' : 'rgba(255,71,87,0.2)') : 'rgba(255,255,255,0.04)'}`,
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                outline: 'none',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'scale(1.04)';
                e.currentTarget.style.zIndex = '1';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.zIndex = '0';
              }}
              title={`${item.symbol}: ${item.change >= 0 ? '+' : ''}${item.change.toFixed(2)}%${item.volume ? ` | Vol: ${formatVolume(item.volume)}` : ''}`}
            >
              {/* Symbol name */}
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: isSelected ? C.cyan : C.text,
                fontFamily: "var(--font-mono)",
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
              }}>
                {item.symbol.replace('/USDT', '')}
              </span>

              {/* Change % */}
              <span style={{
                fontSize: 11,
                fontWeight: 900,
                color: textColor,
                fontFamily: "var(--font-mono)",
                lineHeight: 1.3,
              }}>
                {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}%
              </span>

              {/* Hot indicator */}
              {isHot && (
                <div style={{
                  position: 'absolute', top: 2, right: 2,
                  width: 4, height: 4, borderRadius: '50%',
                  background: item.change >= 0 ? C.success : C.danger,
                  boxShadow: `0 0 4px ${item.change >= 0 ? C.success : C.danger}`,
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{
        padding: '6px 14px 8px',
        borderTop: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        fontSize: 11,
        fontFamily: "var(--font-mono)",
        color: C.textMuted,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <div style={{ width: 12, height: 8, borderRadius: 'var(--radius-xs)', background: getHeatmapColor(4) }} />
          <span>+5%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <div style={{ width: 12, height: 8, borderRadius: 'var(--radius-xs)', background: getHeatmapColor(1) }} />
          <span>+1%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <div style={{ width: 12, height: 8, borderRadius: 'var(--radius-xs)', background: 'rgba(255,255,255,0.06)' }} />
          <span>0%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <div style={{ width: 12, height: 8, borderRadius: 'var(--radius-xs)', background: getHeatmapColor(-1) }} />
          <span>-1%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <div style={{ width: 12, height: 8, borderRadius: 'var(--radius-xs)', background: getHeatmapColor(-4) }} />
          <span>-5%</span>
        </div>
      </div>
    </div>
  );
}
