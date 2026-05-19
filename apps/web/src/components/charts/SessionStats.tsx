// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Session Statistics Overlay
// Shows P&L, trades, win rate, best/worst, duration
// ═══════════════════════════════════════════════════════════

'use client';

import { useState, useEffect, useCallback } from 'react';

interface SessionStatsProps {
  symbol: string;
  onClose?: () => void;
}

interface SessionData {
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
  bestTrade: number;
  worstTrade: number;
  startTime: number;
}

const C = {
  bg: 'rgba(0,0,0,0.6)',
  card: '#111620',
  border: '#1E2530',
  text: '#F0F2F5',
  textDim: '#8B92A8',
  textMuted: '#4B5563',
  cyan: '#00D4FF',
  success: '#00FFA3',
  danger: '#FF4757',
  warning: '#fbbf24',
};

export function SessionStats({ symbol, onClose }: SessionStatsProps) {
  const [stats, setStats] = useState<SessionData>({
    pnl: 0,
    trades: 0,
    wins: 0,
    losses: 0,
    bestTrade: 0,
    worstTrade: 0,
    startTime: Date.now(),
  });

  // Fetch session stats periodically
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/portfolio/session-stats');
        if (res.ok) {
          const j = await res.json();
          if (j.data) {
            setStats(prev => ({
              ...prev,
              pnl: Number(j.data.pnl ?? prev.pnl),
              trades: Number(j.data.trades ?? prev.trades),
              wins: Number(j.data.wins ?? prev.wins),
              losses: Number(j.data.losses ?? prev.losses),
              bestTrade: Number(j.data.bestTrade ?? prev.bestTrade),
              worstTrade: Number(j.data.worstTrade ?? prev.worstTrade),
            }));
          }
        }
      } catch { /* not available */ }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    const tick = () => {
      const diff = Date.now() - stats.startTime;
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setElapsed(`${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };
    tick();
    // PERF: 5000ms — session elapsed timer doesn't need per-second accuracy
    const interval = setInterval(tick, 5000);
    return () => clearInterval(interval);
  }, [stats.startTime]);

  const winRate = stats.trades > 0 ? ((stats.wins / stats.trades) * 100).toFixed(1) : '0.0';
  const pnlColor = stats.pnl >= 0 ? C.success : C.danger;
  const pnlSign = stats.pnl >= 0 ? '+' : '';

  const handleReset = useCallback(() => {
    setStats({
      pnl: 0, trades: 0, wins: 0, losses: 0,
      bestTrade: 0, worstTrade: 0, startTime: Date.now(),
    });
  }, []);

  const StatItem = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
      <span style={{ fontSize: 9, color: C.textMuted, fontFamily: "'Cairo', sans-serif" }}>{label}</span>
      <span style={{ fontSize: 10, color: color || C.text, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
    </div>
  );

  return (
    <div style={{
      zIndex: 10,
      background: C.bg,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderRadius: 10,
      padding: 10,
      border: `1px solid ${C.border}`,
      minWidth: 170,
      direction: 'rtl',
    }}>
      {/* Header */}
      <div data-drag-handle style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 6, paddingBottom: 5,
        borderBottom: `1px solid ${C.border}`,
        cursor: 'grab',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 10 }}>⏱️</span>
          <span style={{ fontSize: 10, color: C.text, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>
            إحصائيات الجلسة
          </span>
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          <button
            onClick={handleReset}
            title="إعادة تعيين"
            style={{
              background: 'rgba(255,255,255,0.04)', border: 'none', borderRadius: 3,
              color: C.textMuted, width: 16, height: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, padding: 0,
            }}
          >
            🔄
          </button>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.04)', border: 'none', borderRadius: 3,
                color: C.textMuted, width: 16, height: 16, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, padding: 0,
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* P&L */}
      <div style={{
        textAlign: 'center', padding: '4px 0 6px',
      }}>
        <span style={{
          fontSize: 18, fontWeight: 900, color: pnlColor,
          fontFamily: "'JetBrains Mono', monospace",
          textShadow: `0 0 12px ${stats.pnl >= 0 ? 'rgba(0,255,163,0.3)' : 'rgba(255,71,87,0.3)'}`,
        }}>
          {pnlSign}{stats.pnl.toFixed(2)}
        </span>
      </div>

      <StatItem label="الصفقات" value={`${stats.trades}`} />
      <StatItem label="نسبة النجاح" value={`${winRate}%`} color={Number(winRate) >= 50 ? C.success : C.danger} />
      <StatItem label="أفضل صفقة" value={`${stats.bestTrade >= 0 ? '+' : ''}${stats.bestTrade.toFixed(2)}`} color={C.success} />
      <StatItem label="أسوأ صفقة" value={`${stats.worstTrade.toFixed(2)}`} color={C.danger} />
      <StatItem label="المدة" value={elapsed} color={C.cyan} />
    </div>
  );
}
