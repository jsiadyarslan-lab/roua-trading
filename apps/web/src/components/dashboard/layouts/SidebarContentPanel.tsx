'use client'

import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { PortfolioMini } from '@/components/portfolio/PortfolioMini'
import { AlNarratorMini } from '@/components/ai/AlNarratorMini'
import { ExecutionPanel } from '@/components/dashboard/execution/ExecutionPanel'
import { OrderBookMini } from '@/components/dashboard/OrderBookMini'
import { WatchlistMini } from '@/components/dashboard/WatchlistMini'
import { PriceAlertsPanel } from '@/components/dashboard/PriceAlertsPanel'
import {
  DesktopBacktestPanel,
  DesktopCalendarPanel,
  DesktopCorrelationPanel,
  DesktopNewsPanel,
} from '@/components/dashboard/DesktopContextPanels'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { getDataStatus, getSourceLabel } from '@/lib/dashboard-live'
import { T } from '@/lib/theme-tokens'

export interface ActiveTabInfo {
  label: string
  helper: string
  accent: string
  tone: string
}

interface SidebarContentPanelProps {
  activeTab: string
  activeTabInfo: ActiveTabInfo
  searchQuery: string
  setSearchQuery: (q: string) => void
}

export function SidebarContentPanel({
  activeTab,
  activeTabInfo,
  searchQuery,
  setSearchQuery,
}: SidebarContentPanelProps) {
  const [showSearch, setShowSearch] = useState(false)

  // Get current symbol and derive data status from market store
  const selectedSymbol = useSymbolStore((s) => s.selectedSymbol)
  const quotes = useMarketStore((s) => s.quotes)
  const activeQuote = selectedSymbol ? quotes[selectedSymbol] : null
  const quoteStatus = getDataStatus(activeQuote)
  const sourceLabel = getSourceLabel(activeQuote?.source)

  const [contentKey, setContentKey] = useState(activeTab)

  // Track tab changes for smooth transition
  useMemo(() => {
    setContentKey(activeTab)
  }, [activeTab])

  return (
    <section
      style={{
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: `linear-gradient(180deg, #1E2233, #1A1D29)`,
        direction: 'rtl',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 11px 9px',
          borderBottom: '1px solid rgba(0,212,255,0.10)',
          display: 'grid',
          gap: 5,
          background: `linear-gradient(90deg, ${activeTabInfo.accent}10, rgba(255,255,255,0.01))`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minWidth: 0,
            }}
          >
            {/* Accent dot */}
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: activeTabInfo.accent,
                boxShadow: `0 0 10px ${activeTabInfo.accent}55`,
                flexShrink: 0,
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  color: T.text,
                  fontWeight: 900,
                  fontFamily: "'Cairo', sans-serif",
                }}
              >
                {activeTabInfo.label}
              </div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: 7.5,
                  color: '#A2B4C8',
                }}
              >
                {activeTabInfo.helper}
              </div>
            </div>
          </div>

          {/* Tone badge */}
          <div
            style={{
              flexShrink: 0,
              padding: '4px 7px',
              borderRadius: 999,
              border: `1px solid ${activeTabInfo.accent}35`,
              background: `${activeTabInfo.accent}12`,
              color: activeTabInfo.accent,
              fontSize: 6.5,
              fontWeight: 900,
              letterSpacing: '0.03em',
              fontFamily: "'Cairo', sans-serif",
            }}
          >
            {activeTabInfo.tone}
          </div>
        </div>

        {/* Search bar */}
        {showSearch && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px',
              borderRadius: 8,
              border: `1px solid rgba(0,212,255,0.18)`,
              background: 'rgba(255,255,255,0.03)',
            }}
          >
            <Search size={12} color="#6F849C" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: T.text,
                fontSize: 10,
                fontFamily: "'Cairo', sans-serif",
                padding: 0,
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={12} color="#6F849C" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowSearch(false)
                setSearchQuery('')
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={12} color="#6F849C" />
            </button>
          </div>
        )}

        {/* Show search toggle if not visible */}
        {!showSearch && (
          <button
            type="button"
            onClick={() => setShowSearch(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              color: '#6F849C',
              fontSize: 8,
              fontFamily: "'Cairo', sans-serif",
            }}
          >
            <Search size={10} />
            بحث في التبويب
          </button>
        )}
      </div>

      {/* Tab content */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          padding: 4,
          background:
            'linear-gradient(180deg, rgba(8,13,20,0.92), rgba(6,10,16,0.98))',
        }}
      >
        <div
          style={{
            height: '100%',
            minHeight: 0,
            overflow: 'hidden',
            borderRadius: 12,
            border: '1px solid rgba(0,212,255,0.12)',
            background:
              'linear-gradient(180deg, rgba(14,20,30,0.98), rgba(8,12,19,0.98))',
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.025), 0 10px 22px rgba(0,0,0,0.18)',
          }}
        >
          <div
            key={contentKey}
            style={{
              width: '100%',
              height: '100%',
              overflow: 'hidden',
              animation: 'sidebarContentFadeIn 0.25s ease-out',
            }}
          >
            {activeTab === 'portfolio' && (
              <PortfolioMini
                compact
                dataStatus={quoteStatus}
                lastUpdatedAt={activeQuote?.timestamp ?? null}
                sourceLabel={sourceLabel}
                selectedSymbol={selectedSymbol}
              />
            )}
            {activeTab === 'execute' && (
              <ExecutionPanel
                mobile
                dataStatus={quoteStatus}
                lastUpdatedAt={activeQuote?.timestamp ?? null}
                sourceLabel={sourceLabel}
              />
            )}
            {activeTab === 'book' && <OrderBookMini />}
            {activeTab === 'watch' && <WatchlistMini />}
            {activeTab === 'alerts' && <PriceAlertsPanel />}
            {activeTab === 'ai' && (
              <AlNarratorMini
                compact
                selectedSymbol={selectedSymbol}
                dataStatus={quoteStatus}
              />
            )}
            {activeTab === 'news' && <DesktopNewsPanel />}
            {activeTab === 'calendar' && <DesktopCalendarPanel />}
            {activeTab === 'backtest' && <DesktopBacktestPanel />}
            {activeTab === 'correlation' && <DesktopCorrelationPanel />}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes sidebarContentFadeIn {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </section>
  )
}
