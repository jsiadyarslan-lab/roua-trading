'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Maximize2, Minimize2, Settings, Crosshair } from 'lucide-react';
import { TIMEFRAMES, CHART_COLORS } from '@/lib/chart-types';
import type { TimeframeOption } from '@/lib/chart-types';

interface ChartToolbarProps {
  symbol: string;
  timeframe: string;
  onTimeframeChange: (tf: string) => void;
  onSymbolChange?: (symbol: string) => void;
  onToggleFullscreen: () => void;
  isFullscreen?: boolean;
}

export function ChartToolbar({
  symbol,
  timeframe,
  onTimeframeChange,
  onToggleFullscreen,
  isFullscreen = false,
}: ChartToolbarProps) {
  const [tfDropdownOpen, setTfDropdownOpen] = useState(false);
  const tfDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (tfDropdownRef.current && !tfDropdownRef.current.contains(e.target as Node)) {
        setTfDropdownOpen(false);
      }
    };
    if (tfDropdownOpen) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [tfDropdownOpen]);

  const currentTf = TIMEFRAMES.find(t => t.value === timeframe);

  const categories = {
    intraday: TIMEFRAMES.filter(t => t.category === 'intraday'),
    daily: TIMEFRAMES.filter(t => t.category === 'daily'),
    weekly: TIMEFRAMES.filter(t => t.category === 'weekly'),
    monthly: TIMEFRAMES.filter(t => t.category === 'monthly'),
  };

  const categoryLabels: Record<string, string> = {
    intraday: 'داخل اليوم',
    daily: 'يومي',
    weekly: 'أسبوعي',
    monthly: 'شهري',
  };

  return (
    <div
      className="flex items-center justify-between px-2 py-1.5 select-none"
      style={{
        background: CHART_COLORS.card,
        borderBottom: `1px solid ${CHART_COLORS.cardBorder}`,
        direction: 'rtl',
        minHeight: 38,
      }}
    >
      {/* Symbol + Timeframe */}
      <div className="flex items-center gap-2">
        {/* Symbol display */}
        <span
          className="font-bold text-sm px-2 py-0.5 rounded"
          style={{ color: CHART_COLORS.text, background: 'rgba(255,255,255,0.04)' }}
        >
          {symbol}
        </span>

        {/* Timeframe dropdown — FIX: Proper click handler and z-index */}
        <div ref={tfDropdownRef} className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setTfDropdownOpen((prev) => !prev);
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors"
            style={{
              background: tfDropdownOpen ? 'rgba(5,150,105,0.15)' : 'rgba(255,255,255,0.04)',
              color: tfDropdownOpen ? CHART_COLORS.primary : CHART_COLORS.text,
              border: tfDropdownOpen ? `1px solid ${CHART_COLORS.primary}` : `1px solid ${CHART_COLORS.cardBorder}`,
            }}
          >
            {currentTf?.label || timeframe}
            <ChevronDown
              size={12}
              className="transition-transform"
              style={{ transform: tfDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>

          {/* Dropdown panel — FIX: High z-index and proper positioning */}
          {tfDropdownOpen && (
            <div
              className="absolute top-full right-0 mt-1 rounded-lg shadow-2xl overflow-hidden"
              style={{
                background: CHART_COLORS.card,
                border: `1px solid ${CHART_COLORS.cardBorder}`,
                zIndex: 9999,
                minWidth: 140,
              }}
            >
              {Object.entries(categories).map(([cat, tfs]) => (
                <div key={cat}>
                  <div
                    className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: CHART_COLORS.text2, background: 'rgba(255,255,255,0.02)' }}
                  >
                    {categoryLabels[cat] || cat}
                  </div>
                  {tfs.map((tf: TimeframeOption) => (
                    <button
                      key={tf.value}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTimeframeChange(tf.value);
                        setTfDropdownOpen(false);
                      }}
                      className="w-full text-right px-3 py-1.5 text-xs font-medium transition-colors"
                      style={{
                        color: tf.value === timeframe ? CHART_COLORS.primary : CHART_COLORS.text,
                        background: tf.value === timeframe ? 'rgba(5,150,105,0.1)' : 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        if (tf.value !== timeframe) {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (tf.value !== timeframe) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tools + Fullscreen */}
      <div className="flex items-center gap-1">
        {/* Crosshair icon (decorative) */}
        <button
          className="p-1.5 rounded transition-colors"
          style={{ color: CHART_COLORS.text2 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <Crosshair size={14} />
        </button>

        {/* Settings icon (decorative) */}
        <button
          className="p-1.5 rounded transition-colors"
          style={{ color: CHART_COLORS.text2 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <Settings size={14} />
        </button>

        {/* FIX: Fullscreen button — RESTORED */}
        <button
          onClick={onToggleFullscreen}
          className="p-1.5 rounded transition-colors"
          style={{ color: CHART_COLORS.gold }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(212,175,55,0.1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          title={isFullscreen ? 'تصغير' : 'ملء الشاشة'}
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>
    </div>
  );
}
