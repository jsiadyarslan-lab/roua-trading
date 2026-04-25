'use client'

import { useState } from 'react'
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
    { id: 'portfolio', label: 'محفظة', icon: Wallet, accent: T.primary, group: 'core' },
    { id: 'execute', label: 'تنفيذ', icon: Bot, accent: T.success, group: 'core' },
    { id: 'book', label: 'أوردر', icon: ChartCandlestick, accent: T.danger, group: 'core' },
    { id: 'watch', label: 'أسواق', icon: Search, accent: T.accent, group: 'core' },
    { id: 'alerts', label: 'تنبيهات', icon: Bell, accent: '#FFB800', group: 'core' },
    { id: 'ai', label: 'AI', icon: Brain, accent: T.purple, group: 'core' },
    { id: 'news', label: 'الأخبار', icon: Newspaper, accent: T.accent, group: 'context' },
    { id: 'calendar', label: 'الأجندة', icon: CalendarDays, accent: T.amber, group: 'context' },
    { id: 'backtest', label: 'المختبر', icon: Activity, accent: T.purple, group: 'context' },
    { id: 'correlation', label: 'الارتباط', icon: GitMerge, accent: T.success, group: 'context' },
  ] as const

  const active = TABS.find(t => t.id === tab)!
  const groups = [
    { id: 'core', label: 'القيادة' },
    { id: 'context', label: 'السياق' },
  ] as const

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      minHeight: 0,
      background: 'linear-gradient(180deg, rgba(17,18,20,0.98), rgba(8,12,18,0.98))', border: `1px solid rgba(0, 229, 255, 0.14)`,
      borderRadius: 12, overflow: 'hidden',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 14px 30px rgba(0,0,0,0.18)',
    }}>
      <div style={{ flexShrink: 0, background: '#0b1017', borderBottom: `1px solid rgba(0, 229, 255, 0.12)`, padding: '7px 7px 6px', display: 'grid', gap: 7 }}>
        {groups.map(group => (
          <div key={group.id} style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 9, color: T.text3, fontWeight: 800, paddingInline: 4 }}>{group.label}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
              {TABS.filter(t => t.group === group.id).map(t => {
                const isActive = t.id === tab
                const Icon = t.icon
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    title={t.label}
                    style={{
                      minWidth: 0,
                      minHeight: 28,
                      padding: '3px 3px',
                      background: isActive ? `${t.accent}18` : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isActive ? `${t.accent}66` : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: 9,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 2,
                      transition: 'all 0.16s ease',
                      boxShadow: isActive ? `0 0 0 1px ${t.accent}20 inset, 0 0 16px ${t.accent}18` : 'inset 0 1px 0 rgba(255,255,255,0.02)',
                      overflow: 'hidden',
                    }}
                  >
                    <Icon size={10} color={isActive ? t.accent : '#8FA2BC'} />
                    <span style={{
                      fontFamily: "'Cairo', sans-serif", fontSize: 7, fontWeight: isActive ? 800 : 700,
                      color: isActive ? t.accent : '#A7B6C9', transition: 'color 0.15s',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
                      lineHeight: 1,
                    }}>{t.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Panel Label */}
      <div style={{
        padding: '8px 12px 4px', flexShrink: 0,
        borderBottom: `1px solid rgba(0, 229, 255, 0.10)`,
        background: `linear-gradient(90deg, ${active.accent}12, rgba(255,255,255,0.01))`,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: active.accent,
          boxShadow: `0 0 8px ${active.accent}`,
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: "'Cairo', sans-serif", fontSize: 11,
          fontWeight: 800, color: T.text,
        }}>{active.label}</span>
      </div>

      {/* Tab Content */}
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
    </div>
  )
}
