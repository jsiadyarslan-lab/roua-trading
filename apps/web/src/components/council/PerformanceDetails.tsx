"use client";

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { COLORS, type TradingBrief } from '@/lib/council/types';
import { directionColor } from '@/lib/council/types';
import { hexToRgba } from '@/lib/council/format';
import { GlassCard } from './primitives';

interface PerformanceDetailsProps {
  briefs: TradingBrief[];
}

export function PerformanceDetails({ briefs }: PerformanceDetailsProps) {
  const stats = useMemo(() => {
    const total = briefs.length;
    if (total === 0) return null;

    const executed = briefs.filter(b => b.reviewStatus === 'EXECUTED');
    const cancelled = briefs.filter(b => b.reviewStatus === 'CANCELLED');
    const modified = briefs.filter(b => b.reviewStatus === 'MODIFIED');
    const active = briefs.filter(b => b.reviewStatus === 'ACTIVE');

    const buy = briefs.filter(b => b.direction === 'BUY');
    const sell = briefs.filter(b => b.direction === 'SELL');

    // By timeframe
    const byTf: Record<string, number> = {};
    for (const b of briefs) {
      byTf[b.timeframe] = (byTf[b.timeframe] || 0) + 1;
    }

    // By pair
    const byPair: Record<string, number> = {};
    for (const b of briefs) {
      byPair[b.pair] = (byPair[b.pair] || 0) + 1;
    }

    // Average confidence
    const avgConf = briefs.reduce((s, b) => s + b.confidence, 0) / total;

    // Outcome stats (if available)
    const withOutcome = briefs.filter(b => b.outcomePips !== undefined);
    const wins = withOutcome.filter(b => (b.outcomePips || 0) > 0);
    const losses = withOutcome.filter(b => (b.outcomePips || 0) < 0);
    const breakeven = withOutcome.filter(b => (b.outcomePips || 0) === 0);

    return {
      total, executed: executed.length, cancelled: cancelled.length,
      modified: modified.length, active: active.length,
      buy: buy.length, sell: sell.length,
      byTf, byPair, avgConf,
      withOutcome: withOutcome.length,
      wins: wins.length, losses: losses.length, breakeven: breakeven.length,
    };
  }, [briefs]);

  if (!stats) {
    return (
      <GlassCard padding={36} style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 4 }}>No analysis</div>
        <div style={{ fontSize: 12, color: COLORS.textMuted }}>Performance data will appear after briefs are issued</div>
      </GlassCard>
    );
  }

  const Bar = ({ label, value, total, color }: { label: string; value: number; total: number; color: string }) => {
    const pct = total > 0 ? (value / total) * 100 : 0;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, minWidth: 60, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
        <div style={{ flex: 1, height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
          <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} style={{ height: '100%', background: `linear-gradient(90deg, ${color}, ${hexToRgba(color, 0.6)})`, borderRadius: 999 }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textPrimary, fontFamily: "var(--font-mono)", minWidth: 40, textAlign: 'right' }}>{value}</span>
        <span style={{ fontSize: 11, color, fontFamily: "var(--font-mono)", minWidth: 36, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
      </div>
    );
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* Status distribution */}
      <GlassCard padding={20}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: COLORS.council, marginBottom: 14 }}>Status Distribution</div>
        <Bar label="Active" value={stats.active} total={stats.total} color={COLORS.buy} />
        <Bar label="Modified" value={stats.modified} total={stats.total} color={COLORS.hold} />
        <Bar label="Cancelled" value={stats.cancelled} total={stats.total} color={COLORS.sell} />
        <Bar label="Executed" value={stats.executed} total={stats.total} color={COLORS.info} />
      </GlassCard>

      {/* Direction distribution */}
      <GlassCard padding={20}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: COLORS.council, marginBottom: 14 }}>Direction Split</div>
        <Bar label="Buy" value={stats.buy} total={stats.total} color={COLORS.buy} />
        <Bar label="Sell" value={stats.sell} total={stats.total} color={COLORS.sell} />
        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 9, background: hexToRgba(COLORS.council, 0.08), border: `1px solid ${hexToRgba(COLORS.council, 0.2)}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Avg Confidence</span>
            <span style={{ fontSize: 18, fontWeight: 600, color: COLORS.council, fontFamily: "var(--font-mono)" }}>{stats.avgConf.toFixed(0)}%</span>
          </div>
        </div>
      </GlassCard>

      {/* By Timeframe */}
      <GlassCard padding={20}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: COLORS.council, marginBottom: 14 }}>By Timeframe</div>
        {Object.entries(stats.byTf).sort((a, b) => a[0].localeCompare(b[0])).map(([tf, count]) => (
          <Bar key={tf} label={tf} value={count} total={stats.total} color={COLORS.info} />
        ))}
      </GlassCard>

      {/* By Pair */}
      <GlassCard padding={20}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: COLORS.council, marginBottom: 14 }}>By Pair</div>
        {Object.entries(stats.byPair).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([pair, count]) => (
          <Bar key={pair} label={pair} value={count} total={stats.total} color={COLORS.council} />
        ))}
      </GlassCard>
    </div>
  );
}
