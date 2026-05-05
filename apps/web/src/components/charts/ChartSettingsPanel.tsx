// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Comprehensive Settings Panel
// All chart settings in one revolutionary interface
// ═══════════════════════════════════════════════════════════

'use client';

import { useState } from 'react';
import type { ChartSettings } from '@/lib/charts/types';

interface ChartSettingsPanelProps {
  settings: ChartSettings;
  onUpdateSettings: (updates: Partial<ChartSettings>) => void;
  onClose: () => void;
}

type SettingsTab = 'appearance' | 'chart' | 'grid' | 'crosshair' | 'behavior';

const TABS: { key: SettingsTab; label: string; icon: string }[] = [
  { key: 'appearance', label: 'المظهر', icon: '🎨' },
  { key: 'chart', label: 'الشارت', icon: '📊' },
  { key: 'grid', label: 'الشبكة', icon: '▦' },
  { key: 'crosshair', label: 'المؤشر', icon: '✛' },
  { key: 'behavior', label: 'السلوك', icon: '⚡' },
];

const PRESET_THEMES = [
  { name: 'ROUA Classic', bg: '#0B0E14', up: '#00FFA3', down: '#FF4757' },
  { name: 'Ocean', bg: '#0a1628', up: '#00d4ff', down: '#ff6b6b' },
  { name: 'Neon', bg: '#0d0221', up: '#00ff88', down: '#ff0055' },
  { name: 'Sunset', bg: '#1a0a2e', up: '#ffd700', down: '#ff4500' },
  { name: 'Arctic', bg: '#0a192f', up: '#64ffda', down: '#ff5555' },
  { name: 'Forest', bg: '#0a1a0a', up: '#39ff14', down: '#ff3333' },
];

export function ChartSettingsPanel({ settings, onUpdateSettings, onClose }: ChartSettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');

  const COLORS = {
    bg: '#0B0E14',
    card: '#151A22',
    cardHover: '#1a2030',
    border: 'rgba(42,49,60,0.9)',
    cyan: '#00D4FF',
    text: '#F0F2F5',
    textSecondary: '#8B92A8',
    textMuted: '#8B92A8',
    success: '#00FFA3',
    danger: '#FF4757',
    warning: '#fbbf24',
  };

  const switchStyle = (isOn: boolean): React.CSSProperties => ({
    width: 34,
    height: 18,
    borderRadius: 9,
    background: isOn ? COLORS.cyan : COLORS.border,
    position: 'relative',
    cursor: 'pointer',
    transition: 'all 0.2s',
    flexShrink: 0,
  });

  const switchKnobStyle = (isOn: boolean): React.CSSProperties => ({
    width: 14,
    height: 14,
    borderRadius: '50%',
    background: isOn ? '#000' : COLORS.textSecondary,
    position: 'absolute',
    top: 2,
    insetInlineStart: isOn ? 18 : 2,
    transition: 'all 0.2s',
  });

  const sectionTitle: React.CSSProperties = {
    fontSize: 9,
    color: COLORS.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
    fontFamily: "'Cairo', sans-serif",
    fontWeight: 700,
  };

  const settingRow: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '7px 0',
    borderBottom: '1px solid rgba(255,255,255,0.03)',
  };

  const settingLabel: React.CSSProperties = {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontFamily: "'Cairo', sans-serif",
  };

  const colorInputStyle: React.CSSProperties = {
    width: 28,
    height: 20,
    borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.1)',
    cursor: 'pointer',
    padding: 0,
    background: 'transparent',
  };

  return (
    <div style={{
      background: COLORS.card,
      border: '1px solid rgba(0,212,255,0.2)',
      borderRadius: 12,
      zIndex: 500,
      boxShadow: '0 20px 60px rgba(0,0,0,0.9), 0 0 30px rgba(0,212,255,0.05)',
      backdropFilter: 'blur(16px)',
      width: 300,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div data-drag-handle style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 14px',
        borderBottom: `1px solid ${COLORS.border}`,
        background: 'linear-gradient(90deg, rgba(0,212,255,0.08), transparent)',
        cursor: 'grab',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COLORS.cyan} strokeWidth="2">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          <span style={{ fontSize: 12, color: COLORS.text, fontWeight: 800, fontFamily: "'Cairo', sans-serif" }}>
            إعدادات الشارت
          </span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${COLORS.border}`, background: 'rgba(0,0,0,0.2)' }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              padding: '8px 0',
              background: activeTab === tab.key ? 'rgba(0,212,255,0.1)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid ' + COLORS.cyan : '2px solid transparent',
              color: activeTab === tab.key ? COLORS.cyan : COLORS.textMuted,
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <span style={{ fontSize: 12 }}>{tab.icon}</span>
            <span style={{ fontSize: 8, fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '10px 14px', maxHeight: 320, overflowY: 'auto' }}>
        {/* Appearance Tab */}
        {activeTab === 'appearance' && (
          <>
            <div style={sectionTitle}>سمات جاهزة</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 14 }}>
              {PRESET_THEMES.map(theme => (
                <button
                  key={theme.name}
                  onClick={() => {
                    onUpdateSettings({ bgColor: theme.bg, upColor: theme.up, downColor: theme.down });
                  }}
                  style={{
                    background: theme.bg,
                    border: `1px solid rgba(255,255,255,0.1)`,
                    borderRadius: 6,
                    padding: '6px 4px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = COLORS.cyan)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
                >
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 3, marginBottom: 3 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: theme.up }} />
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: theme.down }} />
                  </div>
                  <div style={{ fontSize: 7, color: COLORS.textSecondary, fontFamily: "'Cairo', sans-serif", fontWeight: 600 }}>{theme.name}</div>
                </button>
              ))}
            </div>

            <div style={sectionTitle}>الألوان</div>
            <div style={settingRow}>
              <span style={settingLabel}>لون الصعود</span>
              <input
                type="color"
                value={settings.upColor}
                onChange={e => onUpdateSettings({ upColor: e.target.value })}
                style={colorInputStyle}
              />
            </div>
            <div style={settingRow}>
              <span style={settingLabel}>لون الهبوط</span>
              <input
                type="color"
                value={settings.downColor}
                onChange={e => onUpdateSettings({ downColor: e.target.value })}
                style={colorInputStyle}
              />
            </div>
            <div style={settingRow}>
              <span style={settingLabel}>لون الخلفية</span>
              <input
                type="color"
                value={settings.bgColor}
                onChange={e => onUpdateSettings({ bgColor: e.target.value })}
                style={colorInputStyle}
              />
            </div>
          </>
        )}

        {/* Chart Tab */}
        {activeTab === 'chart' && (
          <>
            <div style={sectionTitle}>العرض</div>
            <div style={settingRow}>
              <span style={settingLabel}>خط السعر الحالي</span>
              <div style={switchStyle(settings.showPriceLine)} onClick={() => onUpdateSettings({ showPriceLine: !settings.showPriceLine })}>
                <div style={switchKnobStyle(settings.showPriceLine)} />
              </div>
            </div>
            <div style={settingRow}>
              <span style={settingLabel}>الحجم</span>
              <div style={switchStyle(settings.showVolume)} onClick={() => onUpdateSettings({ showVolume: !settings.showVolume })}>
                <div style={switchKnobStyle(settings.showVolume)} />
              </div>
            </div>
            <div style={settingRow}>
              <span style={settingLabel}>الجلسات</span>
              <div style={switchStyle(settings.showSessions)} onClick={() => onUpdateSettings({ showSessions: !settings.showSessions })}>
                <div style={switchKnobStyle(settings.showSessions)} />
              </div>
            </div>
            <div style={settingRow}>
              <span style={settingLabel}>مؤقت الشمعة</span>
              <div style={switchStyle(settings.showCandleTimer)} onClick={() => onUpdateSettings({ showCandleTimer: !settings.showCandleTimer })}>
                <div style={switchKnobStyle(settings.showCandleTimer)} />
              </div>
            </div>
          </>
        )}

        {/* Grid Tab */}
        {activeTab === 'grid' && (
          <>
            <div style={sectionTitle}>الشبكة</div>
            <div style={settingRow}>
              <span style={settingLabel}>إظهار الشبكة</span>
              <div style={switchStyle(settings.showGrid)} onClick={() => onUpdateSettings({ showGrid: !settings.showGrid })}>
                <div style={switchKnobStyle(settings.showGrid)} />
              </div>
            </div>
            <div style={settingRow}>
              <span style={settingLabel}>لون الشبكة</span>
              <input
                type="color"
                value={settings.gridColor?.startsWith('rgba') ? '#2A313C' : settings.gridColor}
                onChange={e => {
                  // Convert hex to rgba with 50% alpha
                  const hex = e.target.value;
                  const r = parseInt(hex.slice(1,3), 16);
                  const g = parseInt(hex.slice(3,5), 16);
                  const b = parseInt(hex.slice(5,7), 16);
                  onUpdateSettings({ gridColor: `rgba(${r},${g},${b},0.5)` });
                }}
                style={colorInputStyle}
              />
            </div>
          </>
        )}

        {/* Crosshair Tab */}
        {activeTab === 'crosshair' && (
          <>
            <div style={sectionTitle}>نوع المؤشر</div>
            {[
              { key: 'cross', label: 'صلب', icon: '✛' },
              { key: 'dot', label: 'نقطة', icon: '◉' },
              { key: 'none', label: 'بدون', icon: '—' },
            ].map(opt => (
              <div key={opt.key} style={settingRow}>
                <span style={{ ...settingLabel, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>{opt.icon}</span>
                  {opt.label}
                </span>
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    border: `2px solid ${settings.crosshairType === opt.key ? COLORS.cyan : COLORS.border}`,
                    cursor: 'pointer',
                    background: settings.crosshairType === opt.key ? COLORS.cyan : 'transparent',
                    transition: 'all 0.15s',
                  }}
                  onClick={() => onUpdateSettings({ crosshairType: opt.key as ChartSettings['crosshairType'] })}
                />
              </div>
            ))}
          </>
        )}

        {/* Behavior Tab */}
        {activeTab === 'behavior' && (
          <>
            <div style={sectionTitle}>اختصارات لوحة المفاتيح</div>
            <div style={{ fontSize: 9, color: COLORS.textMuted, lineHeight: 1.8, fontFamily: "'JetBrains Mono', monospace" }}>
              <div><span style={{ color: COLORS.cyan }}>Space</span> تشغيل/إيقاف التحديث</div>
              <div><span style={{ color: COLORS.cyan }}>+ / -</span> تكبير/تصغير</div>
              <div><span style={{ color: COLORS.cyan }}>R</span> إعادة ضبط العرض</div>
              <div><span style={{ color: COLORS.cyan }}>F</span> ملء الشاشة</div>
              <div><span style={{ color: COLORS.cyan }}>Esc</span> إلغاء الرسم</div>
              <div><span style={{ color: COLORS.cyan }}>Ctrl+S</span> حفظ القالب</div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 14px',
        borderTop: `1px solid ${COLORS.border}`,
        background: 'rgba(0,0,0,0.2)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: 8, color: COLORS.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
          ROUA Chart v5
        </span>
        <button
          onClick={() => {
            onUpdateSettings({
              type: 'candle',
              showGrid: true,
              showPriceLine: true,
              showVolume: true,
              showSessions: true,
              showCandleTimer: true,
              crosshairType: 'cross',
              upColor: '#00FFA3',
              downColor: '#FF4757',
              bgColor: '#0B0E14',
              gridColor: 'rgba(42,49,60,0.5)',
            });
          }}
          style={{
            padding: '3px 10px',
            background: 'transparent',
            border: `1px solid ${COLORS.danger}`,
            borderRadius: 4,
            color: COLORS.danger,
            fontSize: 9,
            cursor: 'pointer',
            fontFamily: "'Cairo', sans-serif",
            fontWeight: 700,
          }}
        >
          إعادة ضبط
        </button>
      </div>
    </div>
  );
}
