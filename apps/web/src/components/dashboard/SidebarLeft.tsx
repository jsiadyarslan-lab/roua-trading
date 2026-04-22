'use client'

import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  TrendingUp,
  ArrowLeftRight,
  Globe,
  ChevronLeft,
  ChevronRight,
  Activity,
  Wifi,
  Database,
  Cpu,
} from 'lucide-react'
import { useDashboardStore } from '@/lib/dashboard-store'
import { useMarketQuotes, type QuoteData } from '@/hooks/useMarketData'

const NAV_SECTIONS = [
  {
    label: 'الرئيسي',
    items: [
      { icon: LayoutDashboard, label: 'لوحة القيادة', id: 'dashboard' },
    ],
  },
  {
    label: 'التحليل',
    items: [
      { icon: TrendingUp, label: 'التحليل الفني', id: 'analysis' },
    ],
  },
  {
    label: 'التداول',
    items: [
      { icon: ArrowLeftRight, label: 'التداول السريع', id: 'trading' },
    ],
  },
  {
    label: 'الأسواق',
    items: [
      { icon: Globe, label: 'الأسواق العالمية', id: 'markets' },
    ],
  },
]

const MARKET_PAIRS = [
  'BTC/USD', 'ETH/USD', 'XRP/USD', 'SOL/USD',
  'BNB/USD', 'ADA/USD', 'DOGE/USD', 'AAPL',
  'TSLA', 'GOLD', 'EUR/USD', 'GBP/USD',
]

export default function SidebarLeft() {
  const { sidebarCollapsed, toggleSidebar, selectedPair, setSelectedPair } = useDashboardStore()
  const [activeNav, setActiveNav] = useState('dashboard')
  const { quotes } = useMarketQuotes(MARKET_PAIRS, 8000)

  return (
    <div
      className="flex flex-col shrink-0 overflow-hidden"
      style={{
        width: sidebarCollapsed ? 56 : 220,
        background: 'var(--bg2)',
        borderLeft: '1px solid var(--border)',
        transition: 'width 0.2s ease',
      }}
    >
      {/* Navigation */}
      <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-1">
            {/* Section header */}
            {!sidebarCollapsed && (
              <div
                className="px-3 py-1.5"
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: '9px',
                  fontWeight: 700,
                  color: 'var(--text3)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                {section.label}
              </div>
            )}
            {section.items.map((item) => {
              const isActive = activeNav === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveNav(item.id)}
                  className="flex items-center gap-2 w-full cursor-pointer"
                  style={{
                    padding: sidebarCollapsed ? '8px 0' : '6px 12px',
                    justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                    background: isActive ? 'var(--blue2)' : 'transparent',
                    borderInlineStart: isActive ? '2px solid var(--blue)' : '2px solid transparent',
                    color: isActive ? 'var(--blue)' : 'var(--text2)',
                    transition: 'all 0.15s',
                  }}
                >
                  <item.icon size={15} />
                  {!sidebarCollapsed && (
                    <span
                      style={{
                        fontFamily: 'var(--font-ui)',
                        fontSize: '11px',
                        fontWeight: isActive ? 700 : 500,
                      }}
                    >
                      {item.label}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}

        {/* Market Pairs List */}
        {!sidebarCollapsed && (
          <div className="mt-3 px-3">
            <div
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: '9px',
                fontWeight: 700,
                color: 'var(--text3)',
                letterSpacing: '0.08em',
                marginBottom: 6,
              }}
            >
              أزواج السوق
            </div>
            <div className="flex flex-col gap-0.5 max-h-72 overflow-y-auto custom-scrollbar">
              {MARKET_PAIRS.map((pair) => {
                const quote = quotes.get(pair)
                const isSelected = selectedPair === pair
                const change = quote?.changePercent ?? 0
                const isPositive = change >= 0
                return (
                  <button
                    key={pair}
                    onClick={() => setSelectedPair(pair)}
                    className="flex items-center justify-between px-2 py-1.5 rounded cursor-pointer"
                    style={{
                      background: isSelected ? 'var(--blue2)' : 'transparent',
                      border: isSelected ? '1px solid var(--border2)' : '1px solid transparent',
                      transition: 'all 0.12s',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        fontWeight: isSelected ? 700 : 500,
                        color: isSelected ? 'var(--blue)' : 'var(--text)',
                      }}
                      dir="ltr"
                    >
                      {pair}
                    </span>
                    {quote && (
                      <div className="flex flex-col items-end">
                        <span
                          className="price"
                          style={{
                            fontSize: '10px',
                            color: 'var(--text)',
                            lineHeight: 1.2,
                          }}
                          dir="ltr"
                        >
                          {quote.price >= 100
                            ? quote.price.toFixed(2)
                            : quote.price.toFixed(6)}
                        </span>
                        <span
                          className="price"
                          style={{
                            fontSize: '9px',
                            color: isPositive ? 'var(--green)' : 'var(--red)',
                            lineHeight: 1.2,
                          }}
                          dir="ltr"
                        >
                          {isPositive ? '+' : ''}{change.toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* System Health Bar */}
      {!sidebarCollapsed && (
        <div
          className="shrink-0 px-3 py-2"
          style={{
            borderTop: '1px solid var(--border)',
            background: 'var(--bg)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '9px',
              fontWeight: 700,
              color: 'var(--text3)',
              letterSpacing: '0.06em',
              marginBottom: 6,
            }}
          >
            صحة النظام
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Wifi size={10} style={{ color: 'var(--green)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--text2)' }}>API</span>
            </div>
            <div className="flex items-center gap-1">
              <Database size={10} style={{ color: 'var(--green)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--text2)' }}>DB</span>
            </div>
            <div className="flex items-center gap-1">
              <Cpu size={10} style={{ color: 'var(--amber)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--text2)' }}>WS</span>
            </div>
          </div>
        </div>
      )}

      {/* Collapse Toggle */}
      <button
        onClick={toggleSidebar}
        className="flex items-center justify-center shrink-0 cursor-pointer"
        style={{
          height: 32,
          background: 'var(--bg)',
          borderTop: '1px solid var(--border)',
          color: 'var(--text3)',
        }}
      >
        {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </div>
  )
}
