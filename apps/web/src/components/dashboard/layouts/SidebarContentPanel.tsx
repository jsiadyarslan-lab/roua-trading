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

  const selectedSymbol = useSymbolStore((s) => s.selectedSymbol)
  const quotes = useMarketStore((s) => s.quotes)
  const activeQuote = selectedSymbol ? quotes[selectedSymbol] : null
  const quoteStatus = getDataStatus(activeQuote)
  const sourceLabel = getSourceLabel(activeQuote?.source)

  const [contentKey, setContentKey] = useState(activeTab)

  useMemo(() => {
    setContentKey(activeTab)
  }, [activeTab])

  return (
    <section
      className="flex flex-col min-w-0 min-h-0"
      style={{
        background: `linear-gradient(180deg, #1E2233, #1A1D29)`,
        direction: 'rtl',
      }}
    >
      {/* Compact Header — tab label + search icon only */}
      <div
        className="flex items-center justify-between px-2 py-1.5 border-b border-[rgba(0,212,255,0.08)]"
        style={{
          background: `linear-gradient(90deg, ${activeTabInfo.accent}08, rgba(255,255,255,0.01))`,
        }}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{
              background: activeTabInfo.accent,
              boxShadow: `0 0 6px ${activeTabInfo.accent}44`,
            }}
          />
          <span className="text-[10px] font-extrabold text-[var(--foreground)]" style={{ fontFamily: "'Cairo', sans-serif" }}>
            {activeTabInfo.label}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Search toggle icon */}
          {!showSearch ? (
            <button
              type="button"
              onClick={() => setShowSearch(true)}
              className="flex items-center justify-center border-none bg-transparent cursor-pointer p-0.5 text-[#6F849C] hover:text-[var(--foreground)] transition-colors"
            >
              <Search size={10} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { setShowSearch(false); setSearchQuery('') }}
              className="flex items-center justify-center border-none bg-transparent cursor-pointer p-0.5 text-[#6F849C] hover:text-[var(--foreground)] transition-colors"
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Search bar — only when toggled */}
      {showSearch && (
        <div className="flex items-center gap-1.5 px-2 py-1 border-b border-[rgba(0,212,255,0.06)] bg-[rgba(255,255,255,0.02)]">
          <Search size={9} color="#6F849C" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث..."
            className="flex-1 bg-transparent border-none outline-none text-[var(--foreground)] text-[9px] font-bold p-0"
            style={{ fontFamily: "'Cairo', sans-serif" }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="border-none bg-transparent cursor-pointer p-0 text-[#6F849C] hover:text-[var(--foreground)]"
            >
              <X size={9} />
            </button>
          )}
        </div>
      )}

      {/* Tab content */}
      <div
        className="flex-1 min-h-0 overflow-hidden p-1"
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
            key={contentKey}
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

      <style>{`
        @keyframes sidebarContentFadeIn {
          from { opacity: 0; transform: translateY(3px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  )
}
