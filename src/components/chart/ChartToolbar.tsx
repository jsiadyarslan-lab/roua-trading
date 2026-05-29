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
  // FIX: إضافة isMobile لتكييف التخطيط
  isMobile?: boolean;
}

export function ChartToolbar({
  symbol,
  timeframe,
  onTimeframeChange,
  onToggleFullscreen,
  isFullscreen = false,
  isMobile = false,
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

  // FIX: على الجوال نعرض الفئات الأربع في عمودين بدلاً من قائمة طويلة
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

  // FIX: حجم هدف اللمس — 44px حد أدنى وفق Apple HIG وGoogle Material
  const touchTarget: React.CSSProperties = isMobile
    ? { minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }
    : {};

  return (
    <div
      className="flex items-center justify-between select-none"
      style={{
        background: CHART_COLORS.card,
        borderBottom: `1px solid ${CHART_COLORS.cardBorder}`,
        direction: 'rtl',
        minHeight: isMobile ? 48 : 38,
        padding: isMobile ? '0 8px' : '0 8px',
        gap: 4,
      }}
    >
      {/* Symbol + Timeframe */}
      <div className="flex items-center gap-2 min-w-0 flex-1">

        {/* FIX: اقتطاع اسم الرمز الطويل على الجوال */}
        <span
          className="font-bold text-sm rounded"
          style={{
            color: CHART_COLORS.text,
            background: 'rgba(255,255,255,0.04)',
            padding: '2px 8px',
            maxWidth: isMobile ? 80 : 'none',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
          title={symbol}
        >
          {symbol}
        </span>

        {/* Timeframe dropdown */}
        <div ref={tfDropdownRef} className="relative" style={{ flexShrink: 0 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setTfDropdownOpen((prev) => !prev);
            }}
            className="flex items-center gap-1 rounded text-xs font-semibold transition-colors"
            style={{
              background: tfDropdownOpen ? 'rgba(5,150,105,0.15)' : 'rgba(255,255,255,0.04)',
              color: tfDropdownOpen ? CHART_COLORS.primary : CHART_COLORS.text,
              border: tfDropdownOpen
                ? `1px solid ${CHART_COLORS.primary}`
                : `1px solid ${CHART_COLORS.cardBorder}`,
              // FIX: هدف لمس أكبر على الجوال
              padding: isMobile ? '10px 12px' : '4px 10px',
              minHeight: isMobile ? 44 : 'auto',
            }}
          >
            {currentTf?.label || timeframe}
            <ChevronDown
              size={12}
              className="transition-transform"
              style={{ transform: tfDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>

          {/* Dropdown panel */}
          {tfDropdownOpen && (
            <div
              className="absolute top-full right-0 mt-1 rounded-lg shadow-2xl overflow-hidden overflow-y-auto"
              style={{
                background: CHART_COLORS.card,
                border: `1px solid ${CHART_COLORS.cardBorder}`,
                zIndex: 9999,
                minWidth: isMobile ? 160 : 140,
                // FIX: تحديد ارتفاع أقصى لتجنب الخروج من حدود الشاشة
                maxHeight: 'min(80vh, 360px)',
              }}
            >
              {Object.entries(categories).map(([cat, tfs]) => (
                <div key={cat}>
                  <div
                    className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider"
                    style={{
                      color: CHART_COLORS.text2,
                      background: 'rgba(255,255,255,0.02)',
                    }}
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
                      className="w-full text-right px-3 text-xs font-medium transition-colors"
                      style={{
                        color: tf.value === timeframe ? CHART_COLORS.primary : CHART_COLORS.text,
                        background: tf.value === timeframe ? 'rgba(5,150,105,0.1)' : 'transparent',
                        // FIX: ارتفاع صف أكبر على الجوال لسهولة اللمس
                        padding: isMobile ? '12px 12px' : '6px 12px',
                        minHeight: isMobile ? 44 : 'auto',
                        display: 'flex',
                        alignItems: 'center',
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
      <div className="flex items-center gap-0.5" style={{ flexShrink: 0 }}>

        {/* FIX: إخفاء الأيقونات الزخرفية على الجوال — توفير مساحة */}
        {!isMobile && (
          <>
            <button
              className="p-1.5 rounded transition-colors"
              style={{ color: CHART_COLORS.text2 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              aria-label="وضع التقاطع"
            >
              <Crosshair size={14} />
            </button>

            <button
              className="p-1.5 rounded transition-colors"
              style={{ color: CHART_COLORS.text2 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              aria-label="الإعدادات"
            >
              <Settings size={14} />
            </button>
          </>
        )}

        {/* FIX: زر ملء الشاشة بهدف لمس 44px على الجوال */}
        <button
          onClick={onToggleFullscreen}
          className="rounded transition-colors"
          style={{
            color: CHART_COLORS.gold,
            ...touchTarget,
            padding: isMobile ? undefined : '6px',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(212,175,55,0.1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          title={isFullscreen ? 'تصغير' : 'ملء الشاشة'}
          aria-label={isFullscreen ? 'تصغير' : 'ملء الشاشة'}
        >
          {isFullscreen ? <Minimize2 size={isMobile ? 16 : 14} /> : <Maximize2 size={isMobile ? 16 : 14} />}
        </button>
      </div>
    </div>
  );
}
