// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Indicator Settings Panel
// Per-indicator settings (period, colors, opacity)
// ═══════════════════════════════════════════════════════════

'use client';

import { useState, useEffect } from 'react';
import type { ActiveIndicator } from '@/lib/charts/types';
import { INDICATOR_CONFIGS } from '@/lib/charts/types';

interface IndicatorSettingsProps {
  indicator: ActiveIndicator;
  onSave: (indicator: ActiveIndicator) => void;
  onClose: () => void;
}

export function IndicatorSettings({ indicator, onSave, onClose }: IndicatorSettingsProps) {
  const [params, setParams] = useState<Record<string, number>>({ ...indicator.params });
  const [color, setColor] = useState(indicator.color);
  const [opacity, setOpacity] = useState(indicator.opacity);

  const config = INDICATOR_CONFIGS.find(c => c.key === indicator.key);

  // Persist to localStorage
  useEffect(() => {
    try {
      const key = `roua-ind-settings-${indicator.key}`;
      localStorage.setItem(key, JSON.stringify({ params, color, opacity }));
    } catch { /* ignore */ }
  }, [params, color, opacity, indicator.key]);

  // Load from localStorage
  useEffect(() => {
    try {
      const key = `roua-ind-settings-${indicator.key}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.params) setParams(parsed.params);
        if (parsed.color) setColor(parsed.color);
        if (parsed.opacity !== undefined) setOpacity(parsed.opacity);
      }
    } catch { /* ignore */ }
  }, [indicator.key]);

  const handleSave = () => {
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
    textSecondary: '#8B92A8',
    textMuted: '#64748b',
    success: '#3fb950',
    bg: '#0B0E14',
  };

  const paramLabels: Record<string, string> = {
    period: 'الفترة',
    stdDev: 'الانحراف المعياري',
    step: 'الخطوة',
    max: 'الحد الأقصى',
    conversion: 'التحويل',
    base: 'القاعدة',
    spanB: 'امتداد B',
    multiplier: 'المضاعف',
    fast: 'سريع',
    slow: 'بطيء',
    signal: 'الإشارة',
    kPeriod: 'فترة K',
    dPeriod: 'فترة D',
  };

  return (
    <div style={{
      position: 'absolute',
      top: 40,
      right: 300,
      background: COLORS.card,
      border: '1px solid rgba(0,212,255,0.2)',
      borderRadius: 10,
      padding: 12,
      zIndex: 600,
      boxShadow: '0 15px 45px rgba(0,0,0,0.85)',
      backdropFilter: 'blur(10px)',
      width: 220,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
      }}>
        <span style={{
          fontSize: 11,
          color: COLORS.text,
          fontWeight: 700,
          fontFamily: "'Cairo', sans-serif",
        }}>
          إعدادات {config?.label || indicator.key}
        </span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
        >
          ✕
        </button>
      </div>

      {/* Parameters */}
      {Object.entries(params).map(([key, value]) => (
        <div key={key} style={{ marginBottom: 8 }}>
          <label style={{
            display: 'block',
            fontSize: 9,
            color: COLORS.textMuted,
            marginBottom: 3,
            fontFamily: "'Cairo', sans-serif",
          }}>
            {paramLabels[key] || key}
          </label>
          <input
            type="number"
            value={value}
            onChange={e => setParams(p => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))}
            step={key.includes('step') || key.includes('multiplier') ? 0.01 : 1}
            min={0}
            style={{
              width: '100%',
              padding: '4px 8px',
              background: COLORS.bg,
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 4,
              color: COLORS.text,
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              outline: 'none',
            }}
          />
        </div>
      ))}

      {/* Color */}
      <div style={{ marginBottom: 8 }}>
        <label style={{
          display: 'block',
          fontSize: 9,
          color: COLORS.textMuted,
          marginBottom: 3,
          fontFamily: "'Cairo', sans-serif",
        }}>
          اللون
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            style={{ width: 28, height: 22, padding: 0, border: 'none', borderRadius: 4, cursor: 'pointer' }}
          />
          <span style={{ fontSize: 10, color: COLORS.textSecondary, fontFamily: "'JetBrains Mono', monospace" }}>
            {color}
          </span>
        </div>
      </div>

      {/* Opacity */}
      <div style={{ marginBottom: 10 }}>
        <label style={{
          display: 'block',
          fontSize: 9,
          color: COLORS.textMuted,
          marginBottom: 3,
          fontFamily: "'Cairo', sans-serif",
        }}>
          الشفافية: {Math.round(opacity * 100)}%
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
          borderRadius: 6,
          color: '#000',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: "'Cairo', sans-serif",
          transition: 'all 0.15s',
        }}
      >
        حفظ الإعدادات
      </button>
    </div>
  );
}
