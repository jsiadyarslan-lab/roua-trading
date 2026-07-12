// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Indicator Settings Panel
// Per-indicator settings (period, colors, opacity)
// ═══════════════════════════════════════════════════════════

'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import type { ActiveIndicator } from '@/lib/charts/types';
import { INDICATOR_CONFIGS } from '@/lib/charts/types'

interface IndicatorSettingsProps {
  indicator: ActiveIndicator;
  onSave: (indicator: ActiveIndicator) => void;
  onClose: () => void;
}

export function IndicatorSettings({ indicator, onSave, onClose }: IndicatorSettingsProps) {
  const tc = useTranslations('dashboard.chart');
  const [params, setParams] = useState<Record<string, number>>({ ...indicator.params });
  const [color, setColor] = useState(indicator.color);
  const [opacity, setOpacity] = useState(indicator.opacity);

  const config = INDICATOR_CONFIGS.find(c => c.key === indicator.key);

  // H12 FIX: Removed competing localStorage persistence.
  // Previously, IndicatorSettings saved its own copy of indicator settings to
  // `roua-ind-settings-${key}` in localStorage on every keystroke (no debounce),
  // while the main persistence mechanism is useChartStateStore (3-second debounce).
  // These two storage systems could conflict on page load.
  // Now, IndicatorSettings loads its initial state from the indicator prop
  // and relies solely on the onSave callback → addIndicator → debouncedSaveChartState.

  const handleSave = () => {
    // FIX: Validate params against constraints before saving
    const constraints = config?.paramConstraints;
    if (constraints) {
      const validated: Record<string, number> = {};
      for (const [key, value] of Object.entries(params)) {
        const c = constraints[key];
        if (c) {
          // Clamp value to [min, max] bounds
          let v = value;
          if (isNaN(v) || v < c.min) v = c.min;
          if (v > c.max) v = c.max;
          // Round to step precision
          if (c.step) v = Math.round(v / c.step) * c.step;
          validated[key] = v;
        } else {
          validated[key] = isNaN(value) ? (config?.defaultParams[key] ?? 1) : value;
        }
      }
      onSave({
        ...indicator,
        params: validated,
        color,
        opacity,
        visible: true,
      });
      return;
    }
    onSave({
      ...indicator,
      params,
      color,
      opacity,
      visible: true,
    });
  };

  const COLORS = {
    card: '#151A22',
    border: 'rgba(42,49,60,0.9)',
    cyan: '#00D4FF',
    text: '#F0F2F5',
    textSecondary: '#9CA3B5',
    textMuted: '#9CA3B5',
    success: '#00FFA3',
    bg: '#0B0E14',
  };

  const paramLabels: Record<string, string> = {
    period: tc('period'),
    stdDev: tc('stdDev'),
    step: tc('step'),
    max: tc('max'),
    conversion: tc('conversion'),
    base: tc('base'),
    spanB: tc('spanB'),
    multiplier: tc('multiplier'),
    fast: tc('fast'),
    slow: tc('slow'),
    signal: tc('signal'),
    kPeriod: tc('kPeriod'),
    dPeriod: tc('dPeriod'),
  };

  return (
    <div style={{
      background: COLORS.card,
      border: '1px solid rgba(0,212,255,0.2)',
      borderRadius: 'var(--radius-lg)',
      padding: 12,
      zIndex: 600,
      boxShadow: '0 15px 45px rgba(0,0,0,0.85)',
      backdropFilter: 'blur(10px)',
      width: 220,
    }}>
      {/* Header */}
      <div data-drag-handle style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
        cursor: 'grab',
      }}>
        <span style={{
          fontSize: 'var(--text-xs)',
          color: COLORS.text,
          fontWeight: 700,
          fontFamily: "var(--font-ar)",
        }}>
          {tc('settings')} {config?.label || indicator.key}
        </span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: 'var(--text-base)', lineHeight: 1 }}
        >
          ✕
        </button>
      </div>

      {/* Parameters */}
      {Object.entries(params).map(([key, value]) => {
        const constraint = config?.paramConstraints?.[key];
        return (
        <div key={key} style={{ marginBottom: 8 }}>
          <label style={{
            display: 'block',
            fontSize: 'var(--text-xs)',
            color: COLORS.textMuted,
            marginBottom: 3,
            fontFamily: "var(--font-ar)",
          }}>
            {paramLabels[key] || key}
            {constraint && <span style={{ fontSize: 'var(--text-xs)', color: COLORS.textMuted, marginRight: 4 }}>({constraint.min}–{constraint.max})</span>}
          </label>
          <input
            type="number"
            value={value}
            onChange={e => {
              const raw = parseFloat(e.target.value);
              // FIX: Don't silently convert NaN to 0; keep the input editable.
              // Validation is enforced on save via handleSave.
              setParams(p => ({ ...p, [key]: isNaN(raw) ? raw : raw }));
            }}
            step={constraint?.step ?? (key.includes('step') || key.includes('multiplier') ? 0.01 : 1)}
            min={constraint?.min ?? 0}
            max={constraint?.max}
            style={{
              width: '100%',
              padding: '4px 8px',
              background: COLORS.bg,
              border: `1px solid ${value < (constraint?.min ?? 0) || value > (constraint?.max ?? Infinity) ? 'rgba(248,81,73,0.6)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 'var(--radius-sm)',
              color: COLORS.text,
              fontSize: 'var(--text-xs)',
              fontFamily: "var(--font-mono)",
              outline: 'none',
            }}
          />
        </div>
        );
      })}

      {/* Color */}
      <div style={{ marginBottom: 8 }}>
        <label style={{
          display: 'block',
          fontSize: 'var(--text-xs)',
          color: COLORS.textMuted,
          marginBottom: 3,
          fontFamily: "var(--font-ar)",
        }}>
          {tc('color')}
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            style={{ width: 28, height: 22, padding: 0, border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
          />
          <span style={{ fontSize: 'var(--text-xs)', color: COLORS.textSecondary, fontFamily: "var(--font-mono)" }}>
            {color}
          </span>
        </div>
      </div>

      {/* Opacity */}
      <div style={{ marginBottom: 10 }}>
        <label style={{
          display: 'block',
          fontSize: 'var(--text-xs)',
          color: COLORS.textMuted,
          marginBottom: 3,
          fontFamily: "var(--font-ar)",
        }}>
          {tc('opacity')}: {Math.round(opacity * 100)}%
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={opacity}
          onChange={e => setOpacity(parseFloat(e.target.value))}
          style={{ width: '100%', accentColor: COLORS.cyan }}
        />
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        style={{
          width: '100%',
          padding: '7px 0',
          background: COLORS.cyan,
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          color: '#000',
          fontSize: 'var(--text-xs)',
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: "var(--font-ar)",
          transition: 'all 0.15s',
        }}
      >
        {tc('saveSettings')}
      </button>
    </div>
  );
}
