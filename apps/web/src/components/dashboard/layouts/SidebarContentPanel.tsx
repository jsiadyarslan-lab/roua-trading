'use client'

import { useMemo, useState } from 'react'
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
import { useScopedStyle } from '@/hooks/useScopedStyle'

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
  useScopedStyle(`
        @keyframes sidebarContentFadeIn {
          from { opacity: 0; transform: translateY(3px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `)
  const selectedSymbol = useSymbolStore((s) => s.selectedSymbol)
  // Only subscribe to the selected symbol's quote — prevents re-renders from other symbol updates
  const activeQuote = useMarketStore((s) => selectedSymbol ? s.quotes[selectedSymbol] : null)
  const quoteStatus = getDataStatus(activeQuote)
  const sourceLabel = getSourceLabel(activeQuote?.source)

  return (
    <section
      className="flex flex-col min-w-0 min-h-0"
      style={{
        background: `linear-gradient(180deg, #1E2233, #1A1D29)`,
        direction: 'rtl',
      }}
    >
      {/* Tab content — no header, full height for content */}
      <div
        className="flex-1 min-h-0 overflow-hidden"
        style={{ background: 'linear-gradient(180deg, rgba(8,13,20,0.92), rgba(6,10,16,0.98))' }}
      >
        <div
          className="h-full min-h-0 overflow-hidden rounded-lg border border-[rgba(0,212,255,0.10)]"
          style={{
            background: 'linear-gradient(180deg, rgba(14,20,30,0.98), rgba(8,12,19,0.98))',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02), 0 6px 14px rgba(0,0,0,0.12)',
          }}
        >
          <div
            className="w-full h-full overflow-hidden"
            style={{ animation: 'sidebarContentFadeIn 0.2s ease-out' }}
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
    </section>
  )
}
