// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Indicator Panel
// ═══════════════════════════════════════════════════════════

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { IndicatorKey } from '@/lib/charts/types';
import { INDICATOR_CONFIGS } from '@/lib/charts/types'

interface IndicatorPanelProps {
  activeIndicators: IndicatorKey[];
  onToggleIndicator: (key: string) => void;
  onOpenSettings: (key: string) => void;
  onClose: () => void;
}

export function IndicatorPanel({
  activeIndicators,
  onToggleIndicator,
  onOpenSettings,
  onClose,
}: IndicatorPanelProps) {
  const tc = useTranslations('dashboard.chart');
  const [search, setSearch] = useState('');

  const overlayIndicators = INDICATOR_CONFIGS.filter(c => c.category === 'overlay');
  const oscillatorIndicators = INDICATOR_CONFIGS.filter(c => c.category === 'oscillator');

  const filteredOverlay = overlayIndicators.filter(c =>
    c.label.includes(search) || c.labelEn.toLowerCase().includes(search.toLowerCase())
  );
  const filteredOsc = oscillatorIndicators.filter(c =>
    c.label.includes(search) || c.labelEn.toLowerCase().includes(search.toLowerCase())
  );

  const COLORS = {
    card: 'rgba(11, 14, 20, 0.98)',
    border: 'rgba(0, 212, 255, 0.3)',
    cyan: '#00D4FF',
    text: '#9CA3B5',
    textSecondary: '#9CA3B5',
    textMuted: '#9CA3B5',
    success: '#00FFA3',
    danger: '#FF4757',
  };

  const renderItem = (config: typeof INDICATOR_CONFIGS[0]) => {
    const isActive = activeIndicators.includes(config.key);
    return (
      <div
        key={config.key}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 4px',
          borderBottom: '1px solid rgba(88,166,255,0.06)',
          cursor: 'pointer',
        }}
        onClick={() => onToggleIndicator(config.key)}
      >
        {/* Checkbox */}
        <div style={{
          width: 11,
          height: 11,
          borderRadius: 'var(--radius-xs)',
          border: `2px solid ${config.defaultColor}`,
          background: isActive ? config.defaultColor : 'transparent',
          flexShrink: 0,
          transition: 'background 0.15s',
        }} />

        {/* Label */}
        <span style={{
          fontSize: 'var(--text-xs)',
          color: isActive ? COLORS.text : COLORS.textSecondary,
          fontFamily: "var(--font-ar)",
          fontWeight: isActive ? 600 : 400,
          flex: 1,
        }}>
          {config.label}
          <span style={{ color: COLORS.textMuted, fontSize: 'var(--text-xs)', marginInlineEnd: 4 }}>({config.labelEn})</span>
        </span>

        {/* Color indicator */}
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: config.defaultColor,
          opacity: isActive ? 1 : 0.3,
        }} />

        {/* Settings gear */}
        {isActive && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenSettings(config.key); }}
            style={{
              background: 'none',
              border: 'none',
              color: COLORS.textMuted,
              cursor: 'pointer',
              fontSize: 'var(--text-sm)',
              padding: 2,
            }}
            title={tc('settings')}
          >
            ⚙
          </button>
        )}
      </div>
    );
  };

  return (
    <div style={{
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 'var(--radius-lg)',
      padding: 0,
      zIndex: 500,
      boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 24px rgba(0,212,255,0.12)',
      backdropFilter: 'blur(20px)',
      width: 230,
      fontFamily: 'var(--font-ar)',
    }}>
      {/* Header — unified */}
      <div data-drag-handle style={{
        padding: '8px 12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        cursor: 'grab',
        background: 'linear-gradient(180deg, rgba(0,212,255,0.06), transparent)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        marginBottom: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'rgba(0,212,255,0.4)' }}>⠿</span>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: COLORS.cyan }}>
            {tc('indicatorPanel')}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: COLORS.textMuted, fontSize: 'var(--text-base)', lineHeight: 1, padding: '0 2px',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.danger; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.textMuted; }}
        >
          ✕
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '8px 10px 4px' }}>
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={tc('search')}
        style={{
          width: '100%',
          padding: '5px 8px',
          background: 'rgba(0, 0, 0, 0.4)',
          border: '1px solid rgba(0,212,255,0.15)',
          borderRadius: 'var(--radius-sm)',
          color: COLORS.text,
          fontSize: 'var(--text-xs)',
          fontFamily: "var(--font-mono)",
          outline: 'none',
        }}
      />
      </div>

      {/* Scrollable list */}
      <div style={{ overflowY: 'auto', maxHeight: 320, padding: '4px 10px 10px' }}
        className="custom-scrollbar">
      {/* Overlay Section */}
      {filteredOverlay.length > 0 && (
        <>
          <div style={{
            fontSize: 'var(--text-xs)',
            color: COLORS.cyan,
            letterSpacing: 1,
            marginBottom: 4,
            fontWeight: 700,
            fontFamily: "var(--font-ar)",
          }}>
            {tc('overlayIndicators')}
          </div>
          {filteredOverlay.map(renderItem)}
        </>
      )}

      {/* Oscillator Section */}
      {filteredOsc.length > 0 && (
        <>
          <div style={{
            fontSize: 'var(--text-xs)',
            color: COLORS.cyan,
            letterSpacing: 1,
            marginTop: 8,
            marginBottom: 4,
            fontWeight: 700,
            fontFamily: "var(--font-ar)",
          }}>
            {tc('oscillatorIndicators')}
          </div>
          {filteredOsc.map(renderItem)}
        </>
      )}
      </div>
    </div>
  );
}
