// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Indicator Panel
// ═══════════════════════════════════════════════════════════

'use client';

import { useState } from 'react';
import type { IndicatorKey } from '@/lib/charts/types';
import { INDICATOR_CONFIGS } from '@/lib/charts/types';

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
    card: '#151A22',
    border: 'rgba(42,49,60,0.9)',
    cyan: '#00D4FF',
    text: '#F0F2F5',
    textSecondary: '#8B92A8',
    textMuted: '#8B92A8',
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
          borderRadius: 2,
          border: `2px solid ${config.defaultColor}`,
          background: isActive ? config.defaultColor : 'transparent',
          flexShrink: 0,
          transition: 'background 0.15s',
        }} />

        {/* Label */}
        <span style={{
          fontSize: 11,
          color: isActive ? COLORS.text : COLORS.textSecondary,
          fontFamily: "'Cairo', sans-serif",
          fontWeight: isActive ? 600 : 400,
          flex: 1,
        }}>
          {config.label}
          <span style={{ color: COLORS.textMuted, fontSize: 9, marginInlineEnd: 4 }}>({config.labelEn})</span>
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
              fontSize: 12,
              padding: 2,
            }}
            title="إعدادات"
          >
            ⚙
          </button>
        )}
      </div>
    );
  };

  return (
    <div style={{
      position: 'absolute',
      top: 40,
      right: 80,
      background: COLORS.card,
      border: '1px solid rgba(0,212,255,0.2)',
      borderRadius: 10,
      padding: 10,
      zIndex: 500,
      boxShadow: '0 15px 45px rgba(0,0,0,0.85)',
      backdropFilter: 'blur(10px)',
      width: 230,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
      }}>
        <span style={{
          fontSize: 10,
          color: COLORS.textMuted,
          letterSpacing: 1,
          fontWeight: 700,
          fontFamily: "'Cairo', sans-serif",
        }}>
          المؤشرات
        </span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
        >
          ✕
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="بحث..."
        style={{
          width: '100%',
          padding: '5px 8px',
          background: '#0B0E14',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 6,
          color: COLORS.text,
          fontSize: 10,
          fontFamily: "'JetBrains Mono', monospace",
          marginBottom: 8,
          outline: 'none',
        }}
      />

      {/* Overlay Section */}
      {filteredOverlay.length > 0 && (
        <>
          <div style={{
            fontSize: 9,
            color: COLORS.cyan,
            letterSpacing: 1,
            marginBottom: 4,
            fontWeight: 700,
            fontFamily: "'Cairo', sans-serif",
          }}>
            مؤشرات فوق الشارت
          </div>
          {filteredOverlay.map(renderItem)}
        </>
      )}

      {/* Oscillator Section */}
      {filteredOsc.length > 0 && (
        <>
          <div style={{
            fontSize: 9,
            color: COLORS.cyan,
            letterSpacing: 1,
            marginTop: 8,
            marginBottom: 4,
            fontWeight: 700,
            fontFamily: "'Cairo', sans-serif",
          }}>
            مؤشرات مذبذبة
          </div>
          {filteredOsc.map(renderItem)}
        </>
      )}
    </div>
  );
}
