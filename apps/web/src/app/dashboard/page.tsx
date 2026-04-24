'use client'

import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Brain, ChevronDown, ScanSearch, Wallet } from 'lucide-react'
import QuantumChart from '@/components/dashboard/QuantumChart'
import { AlpacaPositions } from '@/components/dashboard/AlpacaPositions'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { BotEngine } from '@/components/dashboard/BotEngine'
import { NotificationEngine } from '@/components/dashboard/NotificationEngine'
import { GlobalLogicEngine } from '@/components/dashboard/GlobalLogicEngine'
import { NotificationToasts } from '@/components/dashboard/NotificationCenter'
import { LeftSidebarLayout } from '@/components/dashboard/layouts/LeftSidebarLayout'
import { RightPanelLayout } from '@/components/dashboard/layouts/RightPanelLayout'
import { WatchlistMini } from '@/components/dashboard/WatchlistMini'
import { QuickExecutionMini } from '@/components/dashboard/QuickExecutionMini'
import OrderBookPanel from '@/components/dashboard/OrderBookPanel'
import { PortfolioMini } from '@/components/portfolio/PortfolioMini'
import { ScannerMini } from '@/components/dashboard/ScannerMini'
import { AlNarratorMini } from '@/components/ai/AlNarratorMini'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { getDataStatus, getSourceLabel, getStatusLabel, getStatusTone } from '@/lib/dashboard-live'

const DASHBOARD_SYMBOLS = ['BTC/USD', 'ETH/USD', 'EUR/USD', 'GBP/USD', 'XAU/USD', 'AAPL', 'TSLA']

/* ─── Design tokens ─── */
const T = {
  bg: '#0F1113',
  bg2: '#111214',
  card: '#111214',
  border: 'rgba(0, 229, 255, 0.08)',
  cyan: '#00E5FF',
  success: '#00C853',
  danger: '#FF3B30',
  text: '#E6EBF5',
  text3: '#A0AFC3',
}

const HEADER_H = 100
const PANEL_H = 30
const ANIM = 'height 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.22s ease'
type MobileView = 'execution' | 'market' | 'portfolio' | 'insight'

const formatMoney = (value: unknown) => {
  const num = Number(value)
  return Number.isFinite(num) ? num.toLocaleString() : '---'
}

const formatQuotePrice = (value: unknown) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  return num.toLocaleString('en-US', { maximumFractionDigits: num > 100 ? 2 : 4 })
}

/* ════════════════════════════════════════════
   DASHBOARD PAGE MAIN CONTAINER
════════════════════════════════════════════ */
export default function DashboardPage() {
  const globalQuotes = useMarketStore(state => state.quotes)
  const selectedSymbol = useSymbolStore(state => state.selectedSymbol)
  const setSelectedSymbol = useSymbolStore(state => state.setSelectedSymbol)
  const currentPrice = globalQuotes[selectedSymbol]?.price ?? null
  const activeQuote = globalQuotes[selectedSymbol] ?? null
  const account = usePositionsStore(state => state.account)
  const positions = usePositionsStore(state => state.positions)
  const fetchAccount = usePositionsStore(state => state.fetchAccount)
  const fetchPositions = usePositionsStore(state => state.fetchPositions)
  const [posOpen, setPosOpen] = useState(true)
  const [activeMobileView, setActiveMobileView] = useState<MobileView>('execution')
  const [chartExpanded, setChartExpanded] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const [isCompactDesktopViewport, setIsCompactDesktopViewport] = useState(false)

  useEffect(() => {
    fetchAccount()
    fetchPositions()
    const iv = setInterval(() => {
      fetchAccount()
      fetchPositions()
    }, 15000)
    return () => clearInterval(iv)
  }, [fetchAccount, fetchPositions])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mobileMedia = window.matchMedia('(max-width: 767px)')
    const compactDesktopMedia = window.matchMedia('(max-width: 1280px)')
    const syncViewport = () => {
      setIsMobileViewport(mobileMedia.matches)
      setIsCompactDesktopViewport(compactDesktopMedia.matches && !mobileMedia.matches)
    }
    syncViewport()
    mobileMedia.addEventListener('change', syncViewport)
    compactDesktopMedia.addEventListener('change', syncViewport)
    return () => {
      mobileMedia.removeEventListener('change', syncViewport)
      compactDesktopMedia.removeEventListener('change', syncViewport)
    }
  }, [])

  const quotes = useMemo(
    () =>
      new Map(
        DASHBOARD_SYMBOLS.map(s => (globalQuotes[s] ? [s, globalQuotes[s]] : [s, null])).filter(
          ([, v]) => v !== null,
        ) as [string, any][],
      ),
    [globalQuotes],
  )

  const mobileSymbols = useMemo(() => {
    const defaults = ['BTC/USD', 'ETH/USD', 'SOL/USD']
    const ordered = [selectedSymbol, ...defaults.filter(sym => sym !== selectedSymbol)]
    return ordered.slice(0, 3).map(sym => ({
      symbol: sym,
      quote: globalQuotes[sym] ?? null,
    }))
  }, [globalQuotes, selectedSymbol])

  const mobileSummaryCards = [
    { label: 'الرصيد', value: `$${formatMoney(account?.equity)}`, tone: T.text },
    { label: 'قوة الشراء', value: `$${formatMoney(account?.buyingPower)}`, tone: T.success },
    { label: 'المراكز', value: `${positions.length}`, tone: T.cyan },
  ]

  const quoteStatus = getDataStatus(activeQuote)
  const sourceLabel = getSourceLabel(activeQuote?.source)

  return (
    <>
      <style>{`
        @keyframes drop-pulse {
          0%,100% { opacity: 0.5 }
          50%      { opacity: 1   }
        }
        @keyframes ql-news {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @keyframes live-dot {
          0%,100% { transform: scale(1); opacity: 0.65; }
          50% { transform: scale(1.35); opacity: 1; }
        }
        .dash-grid {
          display: grid;
          grid-template-columns: minmax(240px, 280px) minmax(0, 1fr) minmax(300px, 350px);
          min-height: calc(100dvh - ${HEADER_H}px);
          background: ${T.bg};
          gap: 12px;
          padding: 12px;
          box-sizing: border-box;
          overflow: hidden;
          align-items: stretch;
          width: 100%;
        }

        .dash-col,
        .dash-col-left,
        .dash-col-center,
        .dash-col-right {
          min-width: 0;
          min-height: 0;
        }

        .dash-col-right-mobile {
          display: none !important;
        }

        .mobile-dashboard-shell {
          display: none;
        }

        .mobile-bottom-nav {
          display: none;
        }

        @media (max-width: 1500px) {
          .dash-grid { grid-template-columns: minmax(230px, 260px) minmax(0, 1fr) minmax(280px, 320px); }
        }

        @media (max-width: 1280px) {
          .dash-grid { grid-template-columns: minmax(220px, 250px) minmax(0, 1fr); }
          .dash-col-right { display: none !important; }
          .dash-col-right-mobile { display: block !important; }
        }

        @media (max-width: 767px) {
          .dash-grid {
            display: none !important;
          }

          .mobile-dashboard-shell {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 10px 10px calc(124px + env(safe-area-inset-bottom));
            background: ${T.bg};
            box-sizing: border-box;
            width: 100%;
            overflow-x: hidden;
          }

          .mobile-hero-trading-area {
            display: flex;
            flex-direction: column;
            gap: 10px;
            min-width: 0;
          }

          .mobile-market-strip {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
          }

          .mobile-market-pill {
            min-width: 0;
            padding: 10px 8px;
            border-radius: 14px;
            border: 1px solid rgba(0, 229, 255, 0.12);
            background: rgba(255,255,255,0.03);
            text-align: center;
          }

          .mobile-market-pill--active {
            border-color: rgba(0, 229, 255, 0.32);
            background: rgba(0, 229, 255, 0.08);
            box-shadow: 0 0 0 1px rgba(0,229,255,0.08) inset;
          }

          .mobile-hero-card {
            border-radius: 18px;
            overflow: hidden;
            border: 1px solid rgba(0, 229, 255, 0.10);
            background: linear-gradient(180deg, rgba(0,229,255,0.06), rgba(255,255,255,0.02));
          }

          .mobile-hero-card__header {
            min-height: 44px;
            padding: 0 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid rgba(0,229,255,0.08);
          }

          .mobile-hero-chart {
            height: 34dvh;
            min-height: 220px;
            max-height: 320px;
          }

          .mobile-hero-chart--expanded {
            height: 72dvh;
            max-height: none;
          }

          .mobile-summary-strip {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
            padding: 8px 10px;
            border-radius: 16px;
            background: rgba(255,255,255,0.02);
            border: 1px solid rgba(255,255,255,0.06);
          }

          .mobile-summary-card {
            min-width: 0;
            padding-inline: 2px;
            text-align: center;
          }

          .mobile-primary-ticket {
            border-radius: 18px;
            border: 1px solid rgba(0,229,255,0.10);
            background: rgba(255,255,255,0.02);
            overflow: hidden;
          }

          .mobile-panel-shell {
            border-radius: 18px;
            overflow: hidden;
            border: 1px solid rgba(0, 229, 255, 0.10);
            background: rgba(255,255,255,0.02);
            min-height: 240px;
          }

          .mobile-bottom-nav {
            display: block;
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 80;
            padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
            background: rgba(10, 12, 16, 0.94);
            border-top: 1px solid rgba(0, 229, 255, 0.12);
            backdrop-filter: blur(16px);
            box-sizing: border-box;
          }

          .mobile-bottom-nav__inner {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
          }

          .mobile-bottom-nav__button {
            min-height: 48px;
            padding: 8px 4px;
            border: 1px solid transparent;
            border-radius: 14px;
            background: rgba(255, 255, 255, 0.03);
            color: ${T.text3};
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4px;
            cursor: pointer;
            transition: all 0.18s ease;
            box-sizing: border-box;
            touch-action: manipulation;
          }

          .mobile-bottom-nav__button--active {
            background: rgba(0, 229, 255, 0.12);
            color: ${T.text};
            border-color: rgba(0, 229, 255, 0.2);
            box-shadow: 0 0 0 1px rgba(0, 229, 255, 0.08) inset;
          }

          .mobile-bottom-nav__label {
            font-size: 10px;
            font-weight: 700;
            font-family: 'Cairo', sans-serif;
            line-height: 1;
          }

          .mobile-section {
            min-width: 0;
            border-radius: 14px;
            overflow: hidden;
            background: ${T.card};
            border: 1px solid ${T.border};
            box-sizing: border-box;
          }

          .mobile-section__header {
            min-height: 48px;
            padding: 0 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            border-bottom: 1px solid ${T.border};
            background: linear-gradient(90deg, rgba(0, 229, 255, 0.06), transparent);
            box-sizing: border-box;
          }

          .mobile-section__title {
            font-family: 'Cairo', sans-serif;
            font-size: 12px;
            font-weight: 800;
            color: ${T.text};
          }

          .mobile-section__body {
            min-width: 0;
            overflow: hidden;
          }

          .mobile-chart-shell {
            height: min(74vh, 720px);
            min-height: 420px;
          }
        }

        @media (min-width: 768px) {
          .mobile-dashboard-shell,
          .mobile-bottom-nav {
            display: none !important;
          }
        }

        .dash-col::-webkit-scrollbar { width: 4px; }
        .dash-col::-webkit-scrollbar-track { background: transparent; }
        .dash-col::-webkit-scrollbar-thumb { background: #0A84FF22; border-radius: 10px; }
        .dash-col::-webkit-scrollbar-thumb:hover { background: #0A84FF44; }
        .live-status-dot {
          animation: live-dot 1.8s ease-in-out infinite;
        }
      `}</style>

      <BotEngine />
      <NotificationEngine quotes={quotes} />
      <GlobalLogicEngine />
      <NotificationToasts />

      {!isMobileViewport && <div className="dash-grid">
        {/* ══════════ COL 1 — Tabbed Left Sidebar ══════════ */}
        <div className="dash-col dash-col-left" style={{ minHeight: 0 }}>
          <LeftSidebarLayout />
        </div>

        {/* ══════════ COL 2 — Chart + Positions ══════════ */}
        <div className="dash-col dash-col-center" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
          <div
            style={{
              flex: 1,
              background: T.card,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              minWidth: 0,
            }}
          >
            <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
              <QuantumChart
                currentPrice={currentPrice}
                dataStatus={quoteStatus}
                lastUpdatedAt={activeQuote?.timestamp ?? null}
                sourceLabel={sourceLabel}
              />
            </div>
          </div>

          <div
            style={{
              flexShrink: 0,
              height: posOpen ? 220 : PANEL_H,
              transition: ANIM,
              background: T.card,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                height: PANEL_H,
                flexShrink: 0,
                background: `linear-gradient(90deg, ${T.success}08, transparent)`,
                borderBottom: posOpen ? `1px solid ${T.border}` : 'none',
                display: 'flex',
                alignItems: 'center',
                padding: '0 12px',
                gap: 16,
              }}
            >
              <div style={{ flex: 1, display: 'flex', gap: 24, fontSize: 11, fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ color: T.text3 }}>الرصيد:</span>
                  <span style={{ color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>${formatMoney(account?.equity)}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ color: T.text3 }}>الهامش الحر:</span>
                  <span style={{ color: T.success, fontFamily: "'JetBrains Mono', monospace" }}>${formatMoney(account?.buyingPower)}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ color: T.text3 }}>الهامش المستخدم:</span>
                  <span style={{ color: T.danger, fontFamily: "'JetBrains Mono', monospace" }}>${formatMoney((account?.equity ?? 0) - (account?.cash ?? 0))}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ color: T.text3 }}>كمية الهامش:</span>
                  <span style={{ color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>${formatMoney(account?.initialMargin)}</span>
                </div>
              </div>
              <button
                onClick={() => setPosOpen(p => !p)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: T.text3, padding: 4 }}
              >
                <ChevronDown size={14} style={{ transform: posOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.3s' }} />
              </button>
            </div>
            <div style={{ flex: 1, opacity: posOpen ? 1 : 0, transition: 'opacity 0.2s', overflow: 'hidden' }}>
              <AlpacaPositions />
            </div>
          </div>
        </div>

        {/* ══════════ COL 3 — Tabs Panel ══════════ */}
        {!isCompactDesktopViewport && (
          <div className="dash-col dash-col-right">
            <RightPanelLayout quotes={quotes} />
          </div>
        )}

        {/* Mobile Sidebar (Visible only on medium screens) */}
        {isCompactDesktopViewport && (
          <div className="dash-col dash-col-right-mobile" style={{ display: 'none', padding: '0 4px 20px' }}>
            <RightPanelLayout quotes={quotes} />
            <div style={{ height: 10 }} />
            <WatchlistMini />
          </div>
        )}
      </div>}

      {/* Mobile-first stacked dashboard */}
      {isMobileViewport && <div className="mobile-dashboard-shell">
        <div className="mobile-hero-trading-area">
          <div className="mobile-market-strip">
            {mobileSymbols.map(({ symbol, quote }) => {
              const active = symbol === selectedSymbol
              return (
                <button
                  key={symbol}
                  type="button"
                  onClick={() => setSelectedSymbol(symbol)}
                  className={`mobile-market-pill${active ? ' mobile-market-pill--active' : ''}`}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ fontSize: 10, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>{symbol}</div>
                  <div style={{ fontSize: 14, color: T.text, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>
                    {formatQuotePrice(quote?.price)}
                  </div>
                  <div style={{ fontSize: 9, color: getStatusTone(getDataStatus(quote)), marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                    {getStatusLabel(getDataStatus(quote))}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mobile-hero-card">
            <div className="mobile-hero-card__header">
              <span className="mobile-section__title">Chart</span>
              <button
                type="button"
                onClick={() => setChartExpanded(value => !value)}
                style={{ background: 'transparent', border: 'none', color: T.text3, cursor: 'pointer' }}
              >
                <ChevronDown size={16} style={{ transform: chartExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }} />
              </button>
            </div>
            <div className={`mobile-hero-chart${chartExpanded ? ' mobile-hero-chart--expanded' : ''}`}>
              <QuantumChart
                currentPrice={currentPrice}
                mobile
                compact={!chartExpanded}
                dataStatus={quoteStatus}
                lastUpdatedAt={activeQuote?.timestamp ?? null}
                sourceLabel={sourceLabel}
                onExpand={() => setChartExpanded(value => !value)}
              />
            </div>
          </div>

          <div className="mobile-primary-ticket">
            <QuickExecutionMini mobile dataStatus={quoteStatus} lastUpdatedAt={activeQuote?.timestamp ?? null} sourceLabel={sourceLabel} />
          </div>

          <div className="mobile-summary-strip">
            {mobileSummaryCards.map(card => (
              <div key={card.label} className="mobile-summary-card">
                <div style={{ fontSize: 9, color: T.text3, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.label}</div>
                <div style={{ fontSize: 11, color: card.tone, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mobile-panel-shell">
          {activeMobileView === 'execution' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 10, height: '100%' }}>
              <div className="mobile-section__header">
                <span className="mobile-section__title">الحساب والمراكز</span>
                <BarChart3 size={18} color={T.text3} />
              </div>
              <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${T.border}`, background: T.card }}>
                <PortfolioMini mobile compact dataStatus={quoteStatus} lastUpdatedAt={activeQuote?.timestamp ?? null} sourceLabel={sourceLabel} selectedSymbol={selectedSymbol} />
              </div>
            </div>
          )}

          {activeMobileView === 'market' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 10, height: '100%' }}>
              <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${T.border}`, background: T.card }}>
                <OrderBookPanel mobile collapsedByDefault dataStatus={quoteStatus} lastUpdatedAt={activeQuote?.timestamp ?? null} sourceLabel={sourceLabel} />
              </div>
              <div style={{ minHeight: 0, flex: 1, borderRadius: 14, overflow: 'hidden', border: `1px solid ${T.border}`, background: T.card }}>
                <WatchlistMini selectedSymbol={selectedSymbol} />
              </div>
            </div>
          )}

          {activeMobileView === 'portfolio' && (
            <div style={{ padding: 10, height: '100%' }}>
              <div style={{ height: '100%', borderRadius: 14, overflow: 'hidden', border: `1px solid ${T.border}`, background: T.card }}>
                <PortfolioMini mobile dataStatus={quoteStatus} lastUpdatedAt={activeQuote?.timestamp ?? null} sourceLabel={sourceLabel} selectedSymbol={selectedSymbol} />
              </div>
            </div>
          )}

          {activeMobileView === 'insight' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 10, height: '100%' }}>
              <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${T.border}`, background: T.card }}>
                <ScannerMini mobile compact selectedSymbol={selectedSymbol} />
              </div>
              <div style={{ minHeight: 0, flex: 1, borderRadius: 14, overflow: 'hidden', border: `1px solid ${T.border}`, background: T.card }}>
                <AlNarratorMini mobile compact selectedSymbol={selectedSymbol} dataStatus={quoteStatus} />
              </div>
            </div>
          )}
        </div>
      </div>}

      {/* Mobile bottom navigation */}
      {isMobileViewport && <nav className="mobile-bottom-nav" aria-label="Mobile dashboard navigation">
        <div className="mobile-bottom-nav__inner">
          {[
            { id: 'execution', label: 'تنفيذ', icon: BarChart3 },
            { id: 'market', label: 'السوق', icon: ScanSearch },
            { id: 'portfolio', label: 'المحفظة', icon: Wallet },
            { id: 'insight', label: 'رؤى', icon: Brain },
          ].map(item => {
            const Icon = item.icon
            const active = activeMobileView === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveMobileView(item.id as MobileView)}
                className={`mobile-bottom-nav__button${active ? ' mobile-bottom-nav__button--active' : ''}`}
              >
                <Icon size={18} />
                <span className="mobile-bottom-nav__label">{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>}
    </>
  )
}
