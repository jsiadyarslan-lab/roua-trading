'use client'

import { useMemo, useState } from 'react'
import { Activity, Bell, Bot, Brain, CalendarDays, ChartCandlestick, GitMerge, Newspaper, Search, Wallet } from 'lucide-react'
import { PortfolioMini } from '@/components/portfolio/PortfolioMini'
import { AlNarratorMini } from '@/components/ai/AlNarratorMini'
import { QuickExecutionMini } from '@/components/dashboard/QuickExecutionMini'
import { OrderBookMini } from '@/components/dashboard/OrderBookMini'
import { WatchlistMini } from '@/components/dashboard/WatchlistMini'
import { PriceAlertsPanel } from '@/components/dashboard/PriceAlertsPanel'
import {
  DesktopBacktestPanel,
  DesktopCalendarPanel,
  DesktopCorrelationPanel,
  DesktopNewsPanel,
} from '@/components/dashboard/DesktopContextPanels'

const T = {
  bg:      '#0F1113',
  bg2:     '#111214',
  bg3:     '#16181A',
  card:    '#111214',
  border:  'rgba(0, 229, 255, 0.08)',
  border2: 'rgba(0, 229, 255, 0.15)',
  primary: '#0A84FF',
  accent:  '#00E5FF',
  success: '#00C853',
  danger:  '#FF3B30',
  amber:   '#FFB800',
  purple:  '#B388FF',
  text:    '#E6EBF5',
  text2:   '#8090A8',
  text3:   '#A0AFC3',
}

export function LeftSidebarLayout() {
  const [tab, setTab] = useState<'portfolio'|'execute'|'book'|'watch'|'alerts'|'ai'|'news'|'calendar'|'backtest'|'correlation'>('portfolio')

  const TABS = [
    { id: 'portfolio', label: 'محفظة', short: 'مح', note: 'الملخص والمراكز', icon: Wallet, accent: T.primary, group: 'core' },
    { id: 'execute', label: 'تنفيذ', short: 'نف', note: 'التذكرة السريعة', icon: Bot, accent: T.success, group: 'core' },
    { id: 'book', label: 'أوردر', short: 'عم', note: 'دفتر السوق', icon: ChartCandlestick, accent: T.danger, group: 'core' },
    { id: 'watch', label: 'أسواق', short: 'سو', note: 'المراقبة الحية', icon: Search, accent: T.accent, group: 'core' },
    { id: 'alerts', label: 'تنبيهات', short: 'تن', note: 'شروط التنبيه', icon: Bell, accent: '#FFB800', group: 'core' },
    { id: 'ai', label: 'AI', short: 'AI', note: 'الرؤية التفسيرية', icon: Brain, accent: T.purple, group: 'core' },
    { id: 'news', label: 'الأخبار', short: 'خب', note: 'النبض الإخباري', icon: Newspaper, accent: T.accent, group: 'context' },
    { id: 'calendar', label: 'الأجندة', short: 'جد', note: 'الأحداث القادمة', icon: CalendarDays, accent: T.amber, group: 'context' },
    { id: 'backtest', label: 'المختبر', short: 'خت', note: 'اختبار سريع', icon: Activity, accent: T.purple, group: 'context' },
    { id: 'correlation', label: 'الارتباط', short: 'رب', note: 'تداخل الأصول', icon: GitMerge, accent: T.success, group: 'context' },
  ] as const

  const active = TABS.find(t => t.id === tab)!
  const groups = [
    { id: 'core', label: 'القيادة' },
    { id: 'context', label: 'السياق' },
  ] as const

  const groupedTabs = useMemo(
    () => groups.map(group => ({ ...group, items: TABS.filter(t => t.group === group.id) })),
    [groups]
  )

  return (
    <div style={{
      display: 'flex', height: '100%',
      minHeight: 0,
      background: 'linear-gradient(180deg, rgba(15,18,24,0.99), rgba(7,11,18,0.99))',
      border: `1px solid rgba(0, 229, 255, 0.16)`,
      borderRadius: 18,
      overflow: 'hidden',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 18px 42px rgba(0,0,0,0.24)',
    }}>
      <aside
        style={{
          width: 92,
          flexShrink: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(180deg, rgba(4,8,14,0.92), rgba(10,14,22,0.96))',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          padding: '10px 8px',
          gap: 10,
        }}
      >
        <div
          style={{
            padding: '6px 6px 8px',
            borderBottom: '1px solid rgba(0,229,255,0.10)',
            display: 'grid',
            gap: 4,
          }}
        >
          <div style={{ fontSize: 9, color: T.text, fontWeight: 900, fontFamily: "'Cairo', sans-serif" }}>محطة</div>
          <div style={{ fontSize: 7, color: T.text3, lineHeight: 1.5 }}>أدوات الحساب والسياق</div>
        </div>

        <div className="custom-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', gap: 10, paddingLeft: 2 }}>
          {groupedTabs.map(group => (
            <div key={group.id} style={{ display: 'grid', gap: 6 }}>
              <div
                style={{
                  fontSize: 8,
                  color: '#6F86A3',
                  fontWeight: 800,
                  textAlign: 'center',
                  letterSpacing: '0.04em',
                }}
              >
                {group.label}
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {group.items.map(item => {
                  const isActive = item.id === tab
                  const Icon = item.icon
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTab(item.id)}
                      title={item.label}
                      style={{
                        minHeight: 54,
                        padding: '7px 5px',
                        borderRadius: 14,
                        border: `1px solid ${isActive ? `${item.accent}66` : 'rgba(255,255,255,0.08)'}`,
                        background: isActive
                          ? `linear-gradient(180deg, ${item.accent}22, rgba(255,255,255,0.03))`
                          : 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        cursor: 'pointer',
                        boxShadow: isActive
                          ? `0 0 0 1px ${item.accent}18 inset, 0 0 20px ${item.accent}18`
                          : 'inset 0 1px 0 rgba(255,255,255,0.02)',
                        overflow: 'hidden',
                      }}
                    >
                      <Icon size={14} color={isActive ? item.accent : '#92A7C2'} />
                      <span
                        style={{
                          fontSize: 8,
                          color: isActive ? item.accent : '#D0DBEA',
                          fontWeight: 800,
                          lineHeight: 1,
                          fontFamily: "'Cairo', sans-serif",
                        }}
                      >
                        {item.short}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <section
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(180deg, rgba(8,16,24,0.98), rgba(7,12,18,0.99))',
        }}
      >
        <div
          style={{
            flexShrink: 0,
            padding: '12px 14px 10px',
            borderBottom: '1px solid rgba(0,229,255,0.10)',
            background: `linear-gradient(90deg, ${active.accent}14, rgba(255,255,255,0.01))`,
            display: 'grid',
            gap: 7,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: active.accent,
                  boxShadow: `0 0 12px ${active.accent}88`,
                  flexShrink: 0,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: T.text, fontWeight: 900, fontFamily: "'Cairo', sans-serif" }}>{active.label}</div>
                <div style={{ fontSize: 8, color: '#93A6BE', marginTop: 3 }}>{active.note}</div>
              </div>
            </div>
            <div
              style={{
                minWidth: 34,
                height: 26,
                borderRadius: 999,
                border: `1px solid ${active.accent}44`,
                background: `${active.accent}16`,
                color: active.accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 8,
                fontWeight: 900,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {active.short}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 8,
            }}
          >
            <div
              style={{
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
                padding: '8px 10px',
                fontSize: 9,
                color: '#C8D4E4',
                lineHeight: 1.7,
              }}
            >
              اختر وحدة من الشريط العمودي للتبديل السريع بين الأدوات والبحث والسياق.
            </div>
            <div
              style={{
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(0,0,0,0.18)',
                padding: '8px 10px',
                minWidth: 72,
              }}
            >
              <div style={{ fontSize: 7, color: '#6F86A3', marginBottom: 4 }}>الوضع</div>
              <div style={{ fontSize: 9, color: active.accent, fontWeight: 800 }}>Active</div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0, background: '#081018' }}>
          {tab === 'portfolio' && <PortfolioMini />}
          {tab === 'execute'   && <QuickExecutionMini />}
          {tab === 'book'      && <OrderBookMini />}
          {tab === 'watch'     && <WatchlistMini />}
          {tab === 'alerts'    && <PriceAlertsPanel />}
          {tab === 'ai'        && <AlNarratorMini />}
          {tab === 'news' && <DesktopNewsPanel />}
          {tab === 'calendar' && <DesktopCalendarPanel />}
          {tab === 'backtest' && <DesktopBacktestPanel />}
          {tab === 'correlation' && <DesktopCorrelationPanel />}
        </div>
      </section>
    </div>
  )
}
