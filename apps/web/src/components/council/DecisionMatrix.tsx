"use client";

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { COLORS, type TradingBrief, type Timeframe } from '@/lib/council/types';
import { directionColor, directionSoft } from '@/lib/council/types';
import { hexToRgba } from '@/lib/council/format';

const TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

interface DecisionMatrixProps {
  briefs: TradingBrief[];
  onSelect?: (pair: string, timeframe: string) => void;
  selectedPair?: string;
  selectedTf?: string;
}

export function DecisionMatrix({ briefs, onSelect, selectedPair, selectedTf }: DecisionMatrixProps) {
  // Group briefs by pair × timeframe
  const matrix = useMemo(() => {
    const map = new Map<string, TradingBrief>();
    for (const b of briefs) {
      const key = `${b.pair}:${b.timeframe}`;
      // Keep the highest-confidence brief per cell
      const existing = map.get(key);
      if (!existing || b.confidence > existing.confidence) {
        map.set(key, b);
      }
    }
    return map;
  }, [briefs]);

  // Get unique pairs sorted
  const pairs = useMemo(() => {
    const set = new Set(briefs.map(b => b.pair));
    return Array.from(set).sort();
  }, [briefs]);

  if (briefs.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted, fontSize: 13 }}>
        No briefs to display
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto', padding: '4px 0' }}>
      <div style={{ minWidth: 580 }}>
        {/* Header row */}
        <div style={{ display: 'grid', gridTemplateColumns: `120px repeat(${TIMEFRAMES.length}, 1fr)`, gap: 4, marginBottom: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: COLORS.textMuted, padding: '8px 10px' }}>
            Pair / TF
          </div>
          {TIMEFRAMES.map(tf => (
            <div key={tf} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: COLORS.textMuted, padding: '8px 4px', textAlign: 'center', fontFamily: "var(--font-mono)" }}>
              {tf}
            </div>
          ))}
        </div>
        {/* Data rows */}
        {pairs.map((pair, pi) => (
          <div key={pair} style={{ display: 'grid', gridTemplateColumns: `120px repeat(${TIMEFRAMES.length}, 1fr)`, gap: 4, marginBottom: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textPrimary, padding: '8px 10px', fontFamily: "var(--font-mono)", display: 'flex', alignItems: 'center' }}>
              {pair}
            </div>
            {TIMEFRAMES.map(tf => {
              const brief = matrix.get(`${pair}:${tf}`);
              if (!brief) {
                return <div key={tf} style={{ padding: '8px 4px', textAlign: 'center', fontSize: 11, color: COLORS.textDim, borderRadius: 6, background: 'rgba(255,255,255,0.015)' }}>·</div>;
              }
              const dc = directionColor(brief.direction);
              const isSelected = selectedPair === pair && selectedTf === tf;
              return (
                <motion.button
                  key={tf}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: Math.min(pi * 0.03 + TIMEFRAMES.indexOf(tf) * 0.01, 0.5) }}
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => onSelect?.(pair, tf)}
                  style={{
                    padding: '8px 4px', textAlign: 'center', borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${isSelected ? hexToRgba(dc, 0.6) : hexToRgba(dc, 0.2)}`,
                    background: directionSoft(brief.direction),
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    {brief.direction === 'BUY' ? <TrendingUp size={10} color={dc} strokeWidth={2.5} /> : <TrendingDown size={10} color={dc} strokeWidth={2.5} />}
                    <span style={{ fontSize: 11, fontWeight: 700, color: dc, fontFamily: "var(--font-mono)" }}>{brief.confidence}</span>
                  </div>
                </motion.button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
