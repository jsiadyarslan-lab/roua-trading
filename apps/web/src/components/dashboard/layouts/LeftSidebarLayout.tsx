'use client'

import { useState } from 'react'
import { PortfolioMini } from '@/components/portfolio/PortfolioMini'
import { AlNarratorMini } from '@/components/ai/AlNarratorMini'
import { QuickExecutionMini } from '@/components/dashboard/QuickExecutionMini'
import { OrderBookMini } from '@/components/dashboard/OrderBookMini'
import { WatchlistMini } from '@/components/dashboard/WatchlistMini'

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
  const [tab, setTab] = useState<'portfolio'|'execute'|'book'|'watch'|'ai'>('portfolio')

  const TABS = [
    { id: 'portfolio', label: 'محفظة',   icon: '💼', accent: T.primary },
    { id: 'execute',   label: 'تنفيذ',   icon: '⚡', accent: T.success },
    { id: 'book',      label: 'أوردر',   icon: '📊', accent: T.danger  },
    { id: 'watch',     label: 'أسواق',   icon: '🔍', accent: T.accent  },
    { id: 'ai',        label: 'AI',      icon: '🧠', accent: T.purple  },
  ] as const

  const active = TABS.find(t => t.id === tab)!

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: T.card, border: `1px solid ${T.border}`,
      borderRadius: 12, overflow: 'hidden',
    }}>
      {/* Tab Strip */}
      <div style={{
        display: 'flex', flexShrink: 0,
        background: T.bg2,
        borderBottom: `1px solid ${T.border}`,
      }}>
        {TABS.map(t => {
          const isActive = t.id === tab
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              title={t.label}
              style={{
                flex: 1, padding: '8px 2px 6px',
                background: 'transparent', border: 'none',
                borderBottom: `2.5px solid ${isActive ? t.accent : 'transparent'}`,
                cursor: 'pointer', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 2, transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>{t.icon}</span>
              <span style={{
                fontFamily: "'Cairo', sans-serif", fontSize: 9, fontWeight: isActive ? 800 : 500,
                color: isActive ? t.accent : T.text2, transition: 'color 0.15s',
              }}>{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* Panel Label */}
      <div style={{
        padding: '8px 12px 4px', flexShrink: 0,
        borderBottom: `1px solid ${T.border}`,
        background: `linear-gradient(90deg, ${active.accent}0a, transparent)`,
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
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {tab === 'portfolio' && <PortfolioMini />}
        {tab === 'execute'   && <QuickExecutionMini />}
        {tab === 'book'      && <OrderBookMini />}
        {tab === 'watch'     && <WatchlistMini />}
        {tab === 'ai'        && <AlNarratorMini />}
      </div>
    </div>
  )
}
