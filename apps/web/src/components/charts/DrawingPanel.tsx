// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Drawing Panel (15 tools)
// ═══════════════════════════════════════════════════════════

'use client';

import { useState } from 'react';
import type { DrawingTool } from '@/lib/charts/types';
import { DrawingManager } from '@/lib/charts/DrawingManager';

interface DrawingPanelProps {
  activeTool: DrawingTool;
  onSetTool: (tool: DrawingTool) => void;
  onClose: () => void;
  onClearAll: () => void;
}

const ALL_TOOLS: { key: DrawingTool; icon: string; labelAr: string; labelEn: string; shortcut?: string }[] = [
  { key: 'cursor',        icon: '↖',  labelAr: 'مؤشر',           labelEn: 'Cursor',          shortcut: 'Esc' },
  { key: 'trendline',     icon: '╱',  labelAr: 'خط اتجاه',        labelEn: 'Trend Line',      shortcut: 'T' },
  { key: 'horizontal',    icon: '━',  labelAr: 'خط أفقي',         labelEn: 'Horizontal',      shortcut: 'H' },
  { key: 'vertical',      icon: '┃',  labelAr: 'خط رأسي',         labelEn: 'Vertical' },
  { key: 'fibonacci',     icon: '⬡',  labelAr: 'فيبوناتشي',       labelEn: 'Fibonacci',       shortcut: 'F' },
  { key: 'rectangle',     icon: '▭',  labelAr: 'مستطيل',          labelEn: 'Rectangle',       shortcut: 'R' },
  { key: 'channel',       icon: '║',  labelAr: 'قناة متوازية',     labelEn: 'Channel' },
  { key: 'triangle',      icon: '△',  labelAr: 'مثلث',            labelEn: 'Triangle' },
  { key: 'circle',        icon: '○',  labelAr: 'دائرة',           labelEn: 'Circle' },
  { key: 'arc',           icon: '⌒',  labelAr: 'قوس',             labelEn: 'Arc' },
  { key: 'x-marker',      icon: '✕',  labelAr: 'علامة X',         labelEn: 'X Mark' },
  { key: 'arrow',         icon: '→',  labelAr: 'سهم',             labelEn: 'Arrow' },
  { key: 'extended-line', icon: '⟶',  labelAr: 'خط ممتد',         labelEn: 'Extended Line' },
  { key: 'ray',           icon: '⟋',  labelAr: 'شعاع',            labelEn: 'Ray' },
  { key: 'price-range',   icon: '⇳',  labelAr: 'نطاق سعري',       labelEn: 'Price Range' },
];

export function DrawingPanel({ activeTool, onSetTool, onClose, onClearAll }: DrawingPanelProps) {
  const [search, setSearch] = useState('');

  const filtered = ALL_TOOLS.filter(t =>
    t.labelAr.includes(search) || t.labelEn.toLowerCase().includes(search.toLowerCase())
  );

  const COLORS = {
    card: '#151A22',
    border: 'rgba(42,49,60,0.9)',
    cyan: '#00D4FF',
    text: '#F0F2F5',
    textSecondary: '#8B92A8',
    textMuted: '#64748b',
    danger: '#f85149',
    hoverBg: 'rgba(0,212,255,0.08)',
    activeBg: '#00D4FF',
  };

  return (
    <div style={{
      position: 'absolute',
      top: 40,
      right: 8,
      background: COLORS.card,
      border: `1px solid rgba(0,212,255,0.2)`,
      borderRadius: 10,
      padding: 10,
      zIndex: 500,
      boxShadow: '0 15px 45px rgba(0,0,0,0.85)',
      backdropFilter: 'blur(10px)',
      width: 220,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        paddingBottom: 6,
        borderBottom: '1px solid rgba(0,212,255,0.1)',
      }}>
        <span style={{
          fontSize: 10,
          color: COLORS.textMuted,
          letterSpacing: 1,
          fontWeight: 700,
          fontFamily: "'Cairo', sans-serif",
        }}>
          أدوات الرسم
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: COLORS.textMuted,
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {/* Tool Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 4,
      }}>
        {filtered.map(tool => {
          const isActive = activeTool === tool.key;
          return (
            <button
              key={tool.key}
              onClick={() => onSetTool(tool.key)}
              title={`${tool.labelAr} (${tool.labelEn})${tool.shortcut ? ` [${tool.shortcut}]` : ''}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                padding: '8px 4px',
                background: isActive ? COLORS.activeBg : 'none',
                border: `1px solid ${isActive ? COLORS.cyan : 'transparent'}`,
                borderRadius: 6,
                color: isActive ? '#000' : COLORS.textSecondary,
                cursor: 'pointer',
                transition: 'all 0.12s',
                fontSize: 10,
                fontWeight: isActive ? 700 : 400,
                fontFamily: "'Cairo', sans-serif",
              }}
              onMouseEnter={e => {
                if (!isActive) e.currentTarget.style.background = COLORS.hoverBg;
              }}
              onMouseLeave={e => {
                if (!isActive) e.currentTarget.style.background = 'none';
              }}
            >
              <span style={{ fontSize: 16 }}>{tool.icon}</span>
              <span style={{ fontSize: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                {tool.labelAr}
              </span>
            </button>
          );
        })}
      </div>

      {/* Clear All */}
      <button
        onClick={onClearAll}
        style={{
          width: '100%',
          marginTop: 8,
          padding: '6px 0',
          background: 'rgba(248,81,73,0.1)',
          border: '1px solid rgba(248,81,73,0.2)',
          borderRadius: 6,
          color: COLORS.danger,
          fontSize: 10,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: "'Cairo', sans-serif",
          transition: 'all 0.12s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(248,81,73,0.2)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(248,81,73,0.1)'}
      >
        مسح جميع الرسومات
      </button>
    </div>
  );
}
