// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PatternOverlay — Autochartist-style pattern list panel
// Shows detected patterns with quality scores + forecast
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
'use client';
import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { DetectedPattern } from '@/lib/charts/pattern-engine'

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
      background: '#0B0E14',
      border: `1px solid ${'#2A313C'}`,
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: 'var(--text-xs)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 10px', background: '#0B0E14',
        borderBottom: `1px solid ${'#2A313C'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 'var(--text-base)' }}>📊</span>
          <span style={{ fontWeight: 700, color: '#059669', letterSpacing: 0.5 }}>
            {tc('marketPatterns')}
          </span>
          <span style={{
            background: 'rgba(0,212,255,0.15)', borderRadius: 'var(--radius-md)',
            padding: '1px 6px', color: '#059669', fontSize: 'var(--text-xs)',
          }}>
            {filtered.length}
          </span>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: '#8B92A8',
          cursor: 'pointer', fontSize: 'var(--text-base)', padding: '0 4px',
        }}>×</button>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', gap: 4, padding: '6px 8px',
        borderBottom: `1px solid ${'#2A313C'}`,
      }}>
        {(['all', 'bullish', 'bearish'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            flex: 1, padding: '3px 0', borderRadius: 'var(--radius-sm)', border: 'none',
            fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer',
            background: filter === f
              ? f === 'bullish' ? 'rgba(0,255,163,0.2)'
              : f === 'bearish' ? 'rgba(255,71,87,0.2)'
              : 'rgba(0,212,255,0.15)'
              : 'rgba(255,255,255,0.05)',
            color: filter === f
              ? f === 'bullish' ? '#00FFA3'
              : f === 'bearish' ? '#FF4757'
              : '#059669'
              : '#8B92A8',
          }}>
            {f === 'all' ? tc('all') : f === 'bullish' ? tc('bullish') : tc('bearish')}
          </button>
        ))}
        <button onClick={() => setSortBy(s => s === 'quality' ? 'time' : 'quality')} style={{
          padding: '3px 8px', borderRadius: 'var(--radius-sm)', border: 'none',
          fontSize: 'var(--text-xs)', cursor: 'pointer',
          background: 'rgba(255,255,255,0.05)', color: '#8B92A8',
        }}>
          {sortBy === 'quality' ? '🏆' : '🕐'}
        </button>
      </div>

      {/* Pattern list */}
      <div style={{ maxHeight: 380, overflowY: 'auto', padding: '4px 0' }}
           className="custom-scrollbar">
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#8B92A8' }}>
            {tc('noData')}
          </div>
        )}
        {filtered.map((p, i) => {
          const col = p.direction === 'bullish' ? '#00FFA3' : '#FF4757';
          const statusCol = STATUS_COLOR[p.status] || '#8B92A8';
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
                  <span style={{ color: col, fontWeight: 800, fontSize: 'var(--text-xs)' }}>
                    {DIRECTION_ICON[p.direction]}
                  </span>
                  <span style={{ color: '#F0F2F5', fontWeight: 600 }}>{p.type}</span>
                </div>
                <span style={{ color: statusCol, fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                  {p.status === 'forming' ? tc('forming')
                   : p.status === 'breakout' ? tc('breakout')
                   : tc('completed')}
                </span>
              </div>

              {/* Row 2: quality bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ color: '#8B92A8', fontSize: 'var(--text-xs)' }}>{tc('quality')}</span>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 'var(--text-xs)',
                  color: p.quality.overall >= 7 ? '#00FFA3' : p.quality.overall >= 5 ? '#FFD700' : '#8B92A8',
                }}>
                  {QUALITY_BAR(p.quality.overall)}
                </span>
                <span style={{ color: '#059669', fontWeight: 700, fontSize: 'var(--text-xs)' }}>
                  {p.quality.overall}/10
                </span>
              </div>

              {/* Row 3: forecast */}
              {p.forecast && (
                <div style={{ display: 'flex', gap: 8, fontSize: 'var(--text-xs)' }}>
                  <div>
                    <span style={{ color: '#8B92A8' }}>{tc('target')}: </span>
                    <span style={{ color: col, fontWeight: 600 }}>
                      {p.forecast.priceMin.toLocaleString('en', { maximumFractionDigits: 2 })}
                      {' – '}
                      {p.forecast.priceMax.toLocaleString('en', { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#8B92A8' }}>{tc('probability')}: </span>
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
        padding: '5px 10px', borderTop: `1px solid ${'#2A313C'}`,
        display: 'flex', justifyContent: 'space-between',
        color: '#8B92A8', fontSize: 'var(--text-xs)',
      }}>
        <span>{tc('clickToNavigate')}</span>
        <span>Autochartist-style</span>
      </div>
    </div>
  );
}
