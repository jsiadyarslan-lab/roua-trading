// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Drawing Panel (83+ tools with categories)
// ═══════════════════════════════════════════════════════════

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { DrawingTool } from '@/lib/charts/types';
import { DRAWING_CATEGORIES } from '@/lib/charts/types';
import { DrawingManager } from '@/lib/charts/DrawingManager'
import T from '@/lib/unified-tokens';

interface DrawingPanelProps {
  activeTool: DrawingTool;
  onSetTool: (tool: DrawingTool) => void;
  onClose: () => void;
  onClearAll: () => void;
}

export function DrawingPanel({ activeTool, onSetTool, onClose, onClearAll }: DrawingPanelProps) {
  const tc = useTranslations('dashboard.chart');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Build flat tool list for search
  const allTools: { key: DrawingTool; icon: string; labelAr: string; labelEn: string; shortcut?: string; category: string }[] = [];
  DRAWING_CATEGORIES.forEach(cat => {
    cat.tools.forEach(tool => {
      const label = DrawingManager.getToolLabel(tool);
      const icon = DrawingManager.getToolIcon(tool);
      const shortcuts: Partial<Record<DrawingTool, string>> = {
        'cursor': 'Esc', 'trendline': 'T', 'horizontal': 'H', 'fibonacci': 'F', 'rectangle': 'R', 'vertical': 'V',
        'arrow-line': 'A', 'measure': 'M', 'risk-reward': 'W', 'diamond': 'D',
      };
      allTools.push({
        key: tool,
        icon,
        labelAr: label.ar,
        labelEn: label.en,
        shortcut: shortcuts[tool],
        category: cat.key,
      });
    });
  });

  const filtered = search
    ? allTools.filter(t =>
        t.labelAr.includes(search) || t.labelEn.toLowerCase().includes(search.toLowerCase())
      )
    : (activeCategory
        ? allTools.filter(t => t.category === activeCategory)
        : allTools
      );

  const COLORS = {
    card: 'rgba(11, 14, 20, 0.98)',
    border: 'rgba(0, 212, 255, 0.3)',
    cyan: T.info,
    text: '#C8D4E4',
    textSecondary: T.text2,
    textMuted: T.text2,
    danger: T.danger,
    hoverBg: 'rgba(0,212,255,0.12)',
    activeBg: T.info,
    bg: 'rgba(0, 0, 0, 0.4)',
  };

  // Helper: select tool and close panel
  const selectTool = (tool: DrawingTool, e?: React.MouseEvent) => {
    // Stop event propagation to prevent chart from receiving the click
    e?.stopPropagation();
    e?.preventDefault();
    onSetTool(tool);
    // Close panel after selecting a tool so user can draw on chart
    // Use microtask to ensure state updates are properly batched
    queueMicrotask(() => {
      onClose();
    });
  };

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 12,
      padding: 0,
      zIndex: 500,
      boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 24px rgba(0,212,255,0.12)',
      backdropFilter: 'blur(20px)',
      width: 280,
      maxHeight: '80vh',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--font-ar)',
    }}>
      {/* Header — unified with chart context menu */}
      <div data-drag-handle style={{
        padding: '8px 12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        cursor: 'grab',
        background: 'linear-gradient(180deg, rgba(0,212,255,0.06), transparent)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'rgba(0,212,255,0.4)' }}>⠿</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: COLORS.cyan }}>
            {tc('drawingTools')} ({allTools.length})
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: COLORS.textMuted, fontSize: 14, lineHeight: 1, padding: '0 2px',
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
          background: COLORS.bg,
          border: '1px solid rgba(0,212,255,0.15)',
          borderRadius: 6,
          color: COLORS.text,
          fontSize: 10,
          fontFamily: "var(--font-ar)",
          outline: 'none',
          direction: 'inherit',
        }}
      />
      </div>

      {/* Cursor + Category Tabs */}
      {!search && (
        <div style={{
          padding: '4px 10px 6px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 3,
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}>
          {/* Cursor */}
          <button
            onClick={(e) => { selectTool('cursor', e); }}
            style={{
              padding: '3px 8px',
              background: activeTool === 'cursor' ? COLORS.activeBg : activeCategory === null ? 'rgba(0,212,255,0.1)' : 'none',
              border: `1px solid ${activeTool === 'cursor' ? COLORS.cyan : 'transparent'}`,
              borderRadius: 4,
              color: activeTool === 'cursor' ? '#000' : COLORS.textSecondary,
              cursor: 'pointer',
              fontSize: 9,
              fontWeight: 700,
              fontFamily: "var(--font-ar)",
              transition: 'all 0.12s',
            }}
          >
            ↖ {tc('cursor')}
          </button>

          {/* Category Tabs */}
          {DRAWING_CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(activeCategory === cat.key ? null : cat.key)}
              style={{
                padding: '3px 6px',
                background: activeCategory === cat.key ? 'rgba(0,212,255,0.15)' : 'none',
                border: `1px solid ${activeCategory === cat.key ? 'rgba(0,212,255,0.3)' : 'transparent'}`,
                borderRadius: 4,
                color: activeCategory === cat.key ? COLORS.cyan : COLORS.textSecondary,
                cursor: 'pointer',
                fontSize: 9,
                fontWeight: activeCategory === cat.key ? 700 : 400,
                fontFamily: "var(--font-ar)",
                transition: 'all 0.12s',
                whiteSpace: 'nowrap',
              }}
            >
              {cat.icon} {cat.labelAr}
            </button>
          ))}
        </div>
      )}

      {/* Tool Grid */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '6px 10px 10px',
      }}
      className="custom-scrollbar">
        {search ? (
          // Search results: flat grid
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 3,
          }}>
            {filtered.map(tool => renderToolButton(tool, activeTool, selectTool, COLORS))}
          </div>
        ) : (
          // Category view: grouped by category
          (activeCategory ? [DRAWING_CATEGORIES.find(c => c.key === activeCategory)!] : DRAWING_CATEGORIES)
            .filter(Boolean)
            .map(cat => (
              <div key={cat.key} style={{ marginBottom: 6 }}>
                <div style={{
                  fontSize: 9,
                  color: COLORS.textMuted,
                  fontWeight: 700,
                  fontFamily: "var(--font-ar)",
                  marginBottom: 4,
                  paddingInlineStart: 2,
                }}>
                  {cat.icon} {cat.labelAr} ({cat.labelEn})
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 3,
                }}>
                  {cat.tools.map(toolKey => {
                    const label = DrawingManager.getToolLabel(toolKey);
                    const icon = DrawingManager.getToolIcon(toolKey);
                    const tool = {
                      key: toolKey,
                      icon,
                      labelAr: label.ar,
                      labelEn: label.en,
                    };
                    return renderToolButton(tool, activeTool, selectTool, COLORS);
                  })}
                </div>
              </div>
            ))
        )}
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
          fontFamily: "var(--font-ar)",
          transition: 'all 0.12s',
          flexShrink: 0,
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(248,81,73,0.2)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(248,81,73,0.1)'}
      >
        {tc('clearAllDrawings')}
      </button>
    </div>
  );
}

// ── Tool Button Renderer ──────────────────────────────────
function renderToolButton(
  tool: { key: DrawingTool; icon: string; labelAr: string; labelEn: string; shortcut?: string },
  activeTool: DrawingTool,
  selectTool: (tool: DrawingTool, e?: React.MouseEvent) => void,
  COLORS: Record<string, string>,
) {
  const isActive = activeTool === tool.key;
  return (
    <button
      key={tool.key}
      onClick={(e) => {
        selectTool(tool.key, e);
      }}
      title={`${tool.labelAr} (${tool.labelEn})${tool.shortcut ? ` [${tool.shortcut}]` : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        padding: '6px 2px',
        background: isActive ? COLORS.activeBg : 'none',
        border: `1px solid ${isActive ? COLORS.cyan : 'transparent'}`,
        borderRadius: 5,
        color: isActive ? '#000' : COLORS.textSecondary,
        cursor: 'pointer',
        transition: 'all 0.12s',
        fontSize: 9,
        fontWeight: isActive ? 700 : 400,
        fontFamily: "var(--font-ar)",
      }}
      onMouseEnter={e => {
        if (!isActive) e.currentTarget.style.background = COLORS.hoverBg;
      }}
      onMouseLeave={e => {
        if (!isActive) e.currentTarget.style.background = 'none';
      }}
    >
      <span style={{ fontSize: 14 }}>{tool.icon}</span>
      <span style={{
        fontSize: 7,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '100%',
        lineHeight: '10px',
      }}>
        {tool.labelAr}
      </span>
    </button>
  );
}
