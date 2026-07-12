// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PatternOverlay — Autochartist-style pattern list panel
// Shows detected patterns with quality scores + forecast
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';
import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { DetectedPattern } from '@/lib/charts/pattern-engine'
import { T } from '@/lib/unified-tokens';

interface PatternOverlayProps {
  patterns: DetectedPattern[];
  onPatternClick: (pattern: DetectedPattern) => void;
  onClose: () => void;
}

const DIRECTION_ICON: Record<string, string> = {
  bullish: '▲',
  bearish: '▼',
};

const STATUS_COLOR: Record<string, string> = {
  forming:   'rgba(255,200,0,0.8)',
  completed: 'rgba(0,212,255,0.8)',
  breakout:  'rgba(0,255,163,0.8)',
};

const QUALITY_BAR = (score: number) => {
  const filled = Math.round(score);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
};

export function PatternOverlay({ patterns, onPatternClick, onClose }: PatternOverlayProps) {
  const tc = useTranslations('dashboard.chart');
  const [filter, setFilter] = useState<'all' | 'bullish' | 'bearish'>('all');
  const [sortBy, setSortBy] = useState<'quality' | 'time'>('quality');

  const filtered = patterns
    .filter(p => filter === 'all' || p.direction === filter)
    .sort((a, b) => sortBy === 'quality'
      ? b.quality.overall - a.quality.overall
      : b.timeEnd - a.timeEnd
    );

  ;

  return (
    <div style={{
      width: 280,
      background: T.bg,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      overflow: 'hidden',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: 11,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 10px', background: T.headerBg,
        borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>📊</span>
          <span style={{ fontWeight: 700, color: T.accent, letterSpacing: 0.5 }}>
            {tc('marketPatterns')}
          </span>
          <span style={{
            background: 'rgba(0,212,255,0.15)', borderRadius: 8,
            padding: '1px 6px', color: T.accent, fontSize: 9,
          }}>
            {filtered.length}
          </span>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: T.muted,
          cursor: 'pointer', fontSize: 14, padding: '0 4px',
        }}>×</button>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', gap: 4, padding: '6px 8px',
        borderBottom: `1px solid ${T.border}`,
      }}>
        {(['all', 'bullish', 'bearish'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            flex: 1, padding: '3px 0', borderRadius: 6, border: 'none',
            fontSize: 9, fontWeight: 600, cursor: 'pointer',
            background: filter === f
              ? f === 'bullish' ? 'rgba(0,255,163,0.2)'
              : f === 'bearish' ? 'rgba(255,71,87,0.2)'
              : 'rgba(0,212,255,0.15)'
              : 'rgba(255,255,255,0.05)',
            color: filter === f
              ? f === 'bullish' ? T.green
              : f === 'bearish' ? T.red
              : T.accent
              : T.muted,
          }}>
            {f === 'all' ? tc('all') : f === 'bullish' ? tc('bullish') : tc('bearish')}
          </button>
        ))}
        <button onClick={() => setSortBy(s => s === 'quality' ? 'time' : 'quality')} style={{
          padding: '3px 8px', borderRadius: 6, border: 'none',
          fontSize: 9, cursor: 'pointer',
          background: 'rgba(255,255,255,0.05)', color: T.muted,
        }}>
          {sortBy === 'quality' ? '🏆' : '🕐'}
        </button>
      </div>

      {/* Pattern list */}
      <div style={{ maxHeight: 380, overflowY: 'auto', padding: '4px 0' }}
           className="custom-scrollbar">
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: T.muted }}>
            {tc('noData')}
          </div>
        )}
        {filtered.map((p, i) => {
          const col = p.direction === 'bullish' ? T.green : T.red;
          const statusCol = STATUS_COLOR[p.status] || T.muted;
          return (
            <div key={p.id} onClick={() => onPatternClick(p)} style={{
              padding: '7px 10px', cursor: 'pointer',
              borderBottom: i < filtered.length - 1 ? `1px solid rgba(255,255,255,0.04)` : 'none',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {/* Row 1: type + direction + status */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: col, fontWeight: 800, fontSize: 10 }}>
                    {DIRECTION_ICON[p.direction]}
                  </span>
                  <span style={{ color: T.text, fontWeight: 600 }}>{p.type}</span>
                </div>
                <span style={{ color: statusCol, fontSize: 8, fontWeight: 700 }}>
                  {p.status === 'forming' ? tc('forming')
                   : p.status === 'breakout' ? tc('breakout')
                   : tc('completed')}
                </span>
              </div>

              {/* Row 2: quality bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ color: T.muted, fontSize: 8 }}>{tc('quality')}</span>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 8,
                  color: p.quality.overall >= 7 ? T.green : p.quality.overall >= 5 ? '#FFD700' : T.muted,
                }}>
                  {QUALITY_BAR(p.quality.overall)}
                </span>
                <span style={{ color: T.accent, fontWeight: 700, fontSize: 9 }}>
                  {p.quality.overall}/10
                </span>
              </div>

              {/* Row 3: forecast */}
              {p.forecast && (
                <div style={{ display: 'flex', gap: 8, fontSize: 9 }}>
                  <div>
                    <span style={{ color: T.muted }}>{tc('target')}: </span>
                    <span style={{ color: col, fontWeight: 600 }}>
                      {p.forecast.priceMin.toLocaleString('en', { maximumFractionDigits: 2 })}
                      {' – '}
                      {p.forecast.priceMax.toLocaleString('en', { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: T.muted }}>{tc('probability')}: </span>
                    <span style={{ color: '#FFD700', fontWeight: 600 }}>
                      {p.forecast.probability}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: '5px 10px', borderTop: `1px solid ${T.border}`,
        display: 'flex', justifyContent: 'space-between',
        color: T.muted, fontSize: 8,
      }}>
        <span>{tc('clickToNavigate')}</span>
        <span>Autochartist-style</span>
      </div>
    </div>
  );
}
