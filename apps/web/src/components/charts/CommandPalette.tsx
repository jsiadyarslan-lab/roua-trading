// ═══════════════════════════════════════════════════════════
// Command Palette — Ctrl+K search for any action, indicator, or tool
// Inspired by TradingView and VS Code command palette
// ═══════════════════════════════════════════════════════════

'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { isRtlLocale } from '@/lib/i18n-utils'

// ── Command Definition ───────────────────────────────────
export interface Command {
  id: string;
  label: string;           // Display label
  labelAr?: string;        // Arabic label
  category: string;        // Group: 'indicators' | 'tools' | 'patterns' | 'chart' | 'trading'
  categoryAr?: string;
  icon?: string;           // Emoji icon
  shortcut?: string;       // Keyboard shortcut hint
  action: () => void;      // What to execute
  keywords?: string[];     // Search keywords
}

interface CommandPaletteProps {
  commands: Command[];
  isOpen: boolean;
  onClose: () => void;
  onExecute?: (command: Command) => void;
}

const C = {
  bg: 'rgba(11,14,20,0.97)',
  card: '#151A22',
  border: '#2A313C',
  text: '#F0F2F5',
  textDim: '#9CA3B5',
  textMuted: '#6B7280',
  cyan: '#00D4FF',
  success: '#059669',
  gold: '#d4af37',
  hover: 'rgba(0,212,255,0.08)',
  active: 'rgba(0,212,255,0.15)',
};

export function CommandPalette({ commands, isOpen, onClose, onExecute }: CommandPaletteProps) {
  const t = useTranslations('commandPalette');
  const locale = typeof window !== 'undefined' ? document.documentElement.lang : 'ar';
  const isAr = isRtlLocale(locale);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter commands by search query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;

    const q = query.toLowerCase();
    return commands.filter(cmd => {
      const searchStr = [
        cmd.label,
        cmd.labelAr || '',
        cmd.category,
        cmd.categoryAr || '',
        ...(cmd.keywords || []),
      ].join(' ').toLowerCase();

      return searchStr.includes(q);
    });
  }, [commands, query]);

  // Group filtered commands by category
  const grouped = useMemo(() => {
    const groups = new Map<string, Command[]>();
    for (const cmd of filteredCommands) {
      const key = cmd.category;
      const list = groups.get(key) || [];
      list.push(cmd);
      groups.set(key, list);
    }
    return groups;
  }, [filteredCommands]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          const cmd = filteredCommands[selectedIndex];
          cmd.action();
          onExecute?.(cmd);
          onClose();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [filteredCommands, selectedIndex, onClose, onExecute]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.querySelector('[data-selected="true"]');
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  let flatIndex = 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: 520,
          maxHeight: '60vh',
          background: C.bg,
          border: `1px solid ${C.border}`,
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: "var(--font-ar)",
          direction: isAr ? 'rtl' : 'ltr',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: `1px solid ${C.border}`,
          gap: 10,
        }}>
          <span style={{ color: C.textDim, fontSize: 'var(--text-base)' }}>🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            placeholder={isAr ? 'ابحث عن أمر، مؤشر، أو أداة...' : 'Search commands, indicators, tools...'}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: C.text,
              fontSize: 'var(--text-base)',
              fontFamily: 'inherit',
            }}
          />
          <span style={{
            color: C.textMuted,
            fontSize: 'var(--text-xs)',
            background: C.card,
            padding: '2px 8px',
            borderRadius: 'var(--radius-sm)',
            border: `1px solid ${C.border}`,
          }}>ESC</span>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {filteredCommands.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: C.textMuted, fontSize: 'var(--text-sm)' }}>
              {isAr ? 'لا توجد نتائج' : 'No results found'}
            </div>
          )}

          {Array.from(grouped.entries()).map(([category, cmds]) => (
            <div key={category}>
              <div style={{
                padding: '6px 16px 4px',
                color: C.textMuted,
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}>
                {isAr && cmds[0]?.categoryAr ? cmds[0].categoryAr : category}
              </div>
              {cmds.map((cmd) => {
                const idx = flatIndex++;
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={cmd.id}
                    data-selected={isSelected}
                    onClick={() => { cmd.action(); onExecute?.(cmd); onClose(); }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px 16px',
                      gap: 10,
                      cursor: 'pointer',
                      background: isSelected ? C.active : 'transparent',
                      transition: 'background 0.1s',
                    }}
                  >
                    <span style={{ fontSize: 'var(--text-base)', width: 20, textAlign: 'center' }}>
                      {cmd.icon || '◦'}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: isSelected ? C.cyan : C.text, fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                        {isAr && cmd.labelAr ? cmd.labelAr : cmd.label}
                      </div>
                    </div>
                    {cmd.shortcut && (
                      <span style={{
                        color: C.textMuted,
                        fontSize: 'var(--text-xs)',
                        background: C.card,
                        padding: '1px 6px',
                        borderRadius: 'var(--radius-xs)',
                        border: `1px solid ${C.border}`,
                        fontFamily: "var(--font-mono)",
                      }}>
                        {cmd.shortcut}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderTop: `1px solid ${C.border}`,
          color: C.textMuted,
          fontSize: 'var(--text-xs)',
        }}>
          <span>↑↓ {isAr ? 'تنقل' : 'Navigate'}</span>
          <span>↵ {isAr ? 'تنفيذ' : 'Execute'}</span>
          <span>ESC {isAr ? 'إغلاق' : 'Close'}</span>
        </div>
      </div>
    </div>
  );
}

// ── Hook: Register Ctrl+K globally ──────────────────────
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return { isOpen, setIsOpen };
}

// ── Standard chart commands factory ──────────────────────
export function createChartCommands(params: {
  onToggleIndicator: (key: string) => void;
  onToggleTool: (tool: string) => void;
  onTogglePattern: (pattern: string) => void;
  onChartAction: (action: string) => void;
  onTradingAction: (action: string) => void;
  activeIndicators?: Set<string>;
}): Command[] {
  const { onToggleIndicator, onToggleTool, onTogglePattern, onChartAction, onTradingAction, activeIndicators } = params;

  return [
    // ── Indicators ──
    { id: 'ind-sma', label: 'SMA (Simple Moving Average)', labelAr: 'المتوسط المتحرك البسيط', category: 'indicators', categoryAr: 'المؤشرات', icon: '📈', action: () => onToggleIndicator('sma'), keywords: ['moving', 'average', 'simple', 'متوسط'] },
    { id: 'ind-ema', label: 'EMA (Exponential Moving Average)', labelAr: 'المتوسط الأسي', category: 'indicators', categoryAr: 'المؤشرات', icon: '📈', action: () => onToggleIndicator('ema'), keywords: ['exponential', 'moving', 'أسي'] },
    { id: 'ind-bb', label: 'Bollinger Bands', labelAr: 'بولينجر', category: 'indicators', categoryAr: 'المؤشرات', icon: '📊', action: () => onToggleIndicator('bb'), keywords: ['bollinger', 'bands', 'بولينجر'] },
    { id: 'ind-rsi', label: 'RSI (Relative Strength Index)', labelAr: 'مؤشر القوة النسبية', category: 'indicators', categoryAr: 'المؤشرات', icon: '📉', action: () => onToggleIndicator('rsi'), keywords: ['relative', 'strength', 'القوة'] },
    { id: 'ind-macd', label: 'MACD', labelAr: 'MACD', category: 'indicators', categoryAr: 'المؤشرات', icon: '📉', action: () => onToggleIndicator('macd'), keywords: ['convergence', 'divergence'] },
    { id: 'ind-ichimoku', label: 'Ichimoku Cloud', labelAr: 'إيشيموكو', category: 'indicators', categoryAr: 'المؤشرات', icon: '☁️', action: () => onToggleIndicator('ichimoku'), keywords: ['cloud', 'ichimoku', 'إيشيموكو'] },
    { id: 'ind-atr', label: 'ATR (Average True Range)', labelAr: 'ATR', category: 'indicators', categoryAr: 'المؤشرات', icon: '📏', action: () => onToggleIndicator('atr'), keywords: ['volatility', 'range', 'تقلب'] },
    { id: 'ind-vwap', label: 'VWAP', labelAr: 'VWAP', category: 'indicators', categoryAr: 'المؤشرات', icon: '⚖️', action: () => onToggleIndicator('vwap'), keywords: ['volume', 'weighted', 'حجم'] },
    { id: 'ind-supertrend', label: 'SuperTrend', labelAr: 'سوبر ترند', category: 'indicators', categoryAr: 'المؤشرات', icon: '📈', action: () => onToggleIndicator('supertrend'), keywords: ['trend', 'ترند'] },
    { id: 'ind-psar', label: 'Parabolic SAR', labelAr: 'SAR المكافئ', category: 'indicators', categoryAr: 'المؤشرات', icon: '🔸', action: () => onToggleIndicator('psar'), keywords: ['parabolic', 'sar'] },

    // ── Drawing Tools ──
    { id: 'tool-trendline', label: 'Trend Line', labelAr: 'خط اتجاه', category: 'tools', categoryAr: 'أدوات الرسم', icon: '📐', action: () => onToggleTool('trendline'), keywords: ['line', 'trend', 'اتجاه'] },
    { id: 'tool-horizontal', label: 'Horizontal Line', labelAr: 'خط أفقي', category: 'tools', categoryAr: 'أدوات الرسم', icon: '➖', action: () => onToggleTool('horizontal'), keywords: ['horizontal', 'level', 'أفقي'] },
    { id: 'tool-fibonacci', label: 'Fibonacci Retracement', labelAr: 'فيبوناتشي', category: 'tools', categoryAr: 'أدوات الرسم', icon: '📏', action: () => onToggleTool('fibonacci'), keywords: ['fib', 'retracement', 'فيبوناتشي'] },
    { id: 'tool-rectangle', label: 'Rectangle', labelAr: 'مستطيل', category: 'tools', categoryAr: 'أدوات الرسم', icon: '⬜', action: () => onToggleTool('rectangle'), keywords: ['rectangle', 'box', 'مستطيل'] },
    { id: 'tool-text', label: 'Text Annotation', labelAr: 'تعليق نصي', category: 'tools', categoryAr: 'أدوات الرسم', icon: '📝', action: () => onToggleTool('text-annotation'), keywords: ['text', 'note', 'نص'] },
    { id: 'tool-pitchfork', label: 'Andrews Pitchfork', labelAr: 'شوكة أندروز', category: 'tools', categoryAr: 'أدوات الرسم', icon: '🔱', action: () => onToggleTool('andrews-pitchfork'), keywords: ['pitchfork', 'andrews', 'شوكة'] },

    // ── Pattern Detection ──
    { id: 'pat-ai', label: 'AI Pattern Analysis', labelAr: 'تحليل الأنماط بالذكاء الاصطناعي', category: 'patterns', categoryAr: 'الأنماط', icon: '🧠', action: () => onTogglePattern('ai'), keywords: ['ai', 'pattern', 'analysis', 'ذكاء', 'نمط'] },
    { id: 'pat-smc', label: 'SMC (Smart Money)', labelAr: 'SMC الأموال الذكية', category: 'patterns', categoryAr: 'الأنماط', icon: '🏦', action: () => onTogglePattern('smc'), keywords: ['smc', 'smart', 'money', 'order', 'block', 'أموال'] },
    { id: 'pat-elliott', label: 'Elliott Wave', labelAr: 'موجة إليوت', category: 'patterns', categoryAr: 'الأنماط', icon: '🌊', action: () => onTogglePattern('elliott'), keywords: ['elliott', 'wave', 'موجة', 'إليوت'] },
    { id: 'pat-wyckoff', label: 'Wyckoff Analysis', labelAr: 'تحليل ويكوف', category: 'patterns', categoryAr: 'الأنماط', icon: '📊', action: () => onTogglePattern('wyckoff'), keywords: ['wyckoff', 'accumulation', 'ويكوف'] },
    { id: 'pat-harmonic', label: 'Harmonic Patterns', labelAr: 'الأنماط التوافقية', category: 'patterns', categoryAr: 'الأنماط', icon: '🔮', action: () => onTogglePattern('harmonic'), keywords: ['harmonic', 'gartley', 'bat', 'توافقية'] },
    { id: 'pat-geometric', label: 'Geometric Patterns', labelAr: 'الأنماط الهندسية', category: 'patterns', categoryAr: 'الأنماط', icon: '📐', action: () => onTogglePattern('geometric'), keywords: ['geometric', 'triangle', 'double', 'هندسية'] },
    { id: 'pat-heatmap', label: 'Signal Confidence Heatmap', labelAr: 'خريطة حرارة الثقة', category: 'patterns', categoryAr: 'الأنماط', icon: '🌡️', action: () => onTogglePattern('heatmap'), keywords: ['heatmap', 'confidence', 'حرارة'] },

    // ── Chart Actions ──
    { id: 'chart-screenshot', label: 'Take Screenshot', labelAr: 'لقطة شاشة', category: 'chart', categoryAr: 'الرسم البياني', icon: '📸', action: () => onChartAction('screenshot'), keywords: ['screenshot', 'capture', 'لقطة'] },
    { id: 'chart-reset', label: 'Reset Chart', labelAr: 'إعادة تعيين الرسم', category: 'chart', categoryAr: 'الرسم البياني', icon: '🔄', action: () => onChartAction('reset'), keywords: ['reset', 'clear', 'إعادة'] },
    { id: 'chart-fullscreen', label: 'Toggle Fullscreen', labelAr: 'ملء الشاشة', category: 'chart', categoryAr: 'الرسم البياني', icon: '⛶', action: () => onChartAction('fullscreen'), shortcut: 'F11', keywords: ['fullscreen', 'شاشة'] },
    { id: 'chart-template', label: 'Save as Template', labelAr: 'حفظ كقالب', category: 'chart', categoryAr: 'الرسم البياني', icon: '💾', action: () => onChartAction('save-template'), keywords: ['template', 'save', 'قالب'] },

    // ── Trading Actions ──
    { id: 'trade-buy', label: 'Quick Buy', labelAr: 'شراء سريع', category: 'trading', categoryAr: 'التداول', icon: '🟢', action: () => onTradingAction('quick-buy'), keywords: ['buy', 'long', 'شراء'] },
    { id: 'trade-sell', label: 'Quick Sell', labelAr: 'بيع سريع', category: 'trading', categoryAr: 'التداول', icon: '🔴', action: () => onTradingAction('quick-sell'), keywords: ['sell', 'short', 'بيع'] },
    { id: 'trade-alert', label: 'Set Price Alert', labelAr: 'تنبيه سعري', category: 'trading', categoryAr: 'التداول', icon: '🔔', action: () => onTradingAction('price-alert'), keywords: ['alert', 'price', 'تنبيه'] },
  ];
}
