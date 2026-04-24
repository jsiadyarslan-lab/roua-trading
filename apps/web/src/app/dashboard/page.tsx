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

const DASHBOARD_SYMBOLS = ['BTC/USD', 'ETH/USD', 'EUR/USD', 'GBP/USD', 'XAU/USD', 'AAPL', 'TSLA']

/* ─── Design tokens ─── */
const T = {
  bg: '#0F1113',
  bg2: '#111214',
  card: '#111214',
  border: 'rgba(0, 229, 255, 0.08)',
  success: '#00C853',
  danger: '#FF3B30',
  text: '#E6EBF5',
  text3: '#A0AFC3',
}

const HEADER_H = 100
const PANEL_H = 30
const ANIM = 'height 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.22s ease'

const formatMoney = (value: unknown) => {
  const num = Number(value)
  return Number.isFinite(num) ? num.toLocaleString() : '---'
}

/* ════════════════════════════════════════════
   DASHBOARD PAGE MAIN CONTAINER
════════════════════════════════════════════ */
export default function DashboardPage() {
  const globalQuotes = useMarketStore(state => state.quotes)
  const selectedSymbol = useSymbolStore(state => state.selectedSymbol)
  const currentPrice = globalQuotes[selectedSymbol]?.price ?? null
  const account = usePositionsStore(state => state.account)
  const fetchAccount = usePositionsStore(state => state.fetchAccount)
  const fetchPositions = usePositionsStore(state => state.fetchPositions)
  const [posOpen, setPosOpen] = useState(true)
  const [activeMobileSection, setActiveMobileSection] = useState<'portfolio' | 'chart' | 'scanner' | 'ai'>('chart')

  useEffect(() => {
    fetchAccount()
    fetchPositions()
    const iv = setInterval(() => {
      fetchAccount()
      fetchPositions()
    }, 15000)
    return () => clearInterval(iv)
  }, [fetchAccount, fetchPositions])

  const quotes = useMemo(
    () =>
      new Map(
        DASHBOARD_SYMBOLS.map(s => (globalQuotes[s] ? [s, globalQuotes[s]] : [s, null])).filter(
          ([, v]) => v !== null,
        ) as [string, any][],
      ),
    [globalQuotes],
  )

  const scrollToSection = (id: string, section: 'portfolio' | 'chart' | 'scanner' | 'ai') => {
    setActiveMobileSection(section)
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

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

        .dash-mobile-stack {
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

          .dash-mobile-stack {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 10px 10px 104px;
            background: ${T.bg};
            box-sizing: border-box;
            width: 100%;
            overflow-x: hidden;
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
          .dash-mobile-stack,
          .mobile-bottom-nav {
            display: none !important;
          }
        }

        .dash-col::-webkit-scrollbar { width: 4px; }
        .dash-col::-webkit-scrollbar-track { background: transparent; }
        .dash-col::-webkit-scrollbar-thumb { background: #0A84FF22; border-radius: 10px; }
        .dash-col::-webkit-scrollbar-thumb:hover { background: #0A84FF44; }
      `}</style>

      <BotEngine />
      <NotificationEngine quotes={quotes} />
      <GlobalLogicEngine />
      <NotificationToasts />

      <div className="dash-grid">
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
              <QuantumChart currentPrice={currentPrice} />
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
        <div className="dash-col dash-col-right">
          <RightPanelLayout quotes={quotes} />
        </div>

        {/* Mobile Sidebar (Visible only on medium screens) */}
        <div className="dash-col dash-col-right-mobile" style={{ display: 'none', padding: '0 4px 20px' }}>
          <RightPanelLayout quotes={quotes} />
          <div style={{ height: 10 }} />
          <WatchlistMini />
        </div>
      </div>

      {/* Mobile-first stacked dashboard */}
      <div className="dash-mobile-stack">
        <section id="portfolio" className="mobile-section">
          <div className="mobile-section__header">
            <span className="mobile-section__title">Portfolio</span>
            <Wallet size={18} color={T.text3} />
          </div>
          <div className="mobile-section__body">
            <PortfolioMini />
          </div>
        </section>

        <section id="chart" className="mobile-section">
          <div className="mobile-section__header">
            <span className="mobile-section__title">Chart</span>
            <BarChart3 size={18} color={T.text3} />
          </div>
          <div className="mobile-section__body mobile-chart-shell">
            <QuantumChart currentPrice={currentPrice} />
          </div>
        </section>

        <section id="execution" className="mobile-section">
          <div className="mobile-section__header">
            <span className="mobile-section__title">Order Execution</span>
            <ChevronDown size={18} color={T.text3} style={{ transform: 'rotate(-90deg)' }} />
          </div>
          <div className="mobile-section__body">
            <QuickExecutionMini />
          </div>
        </section>

        <section id="orderbook" className="mobile-section">
          <div className="mobile-section__header">
            <span className="mobile-section__title">Order Book / Watchlist</span>
            <ScanSearch size={18} color={T.text3} />
          </div>
          <div className="mobile-section__body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <OrderBookPanel />
            <WatchlistMini />
          </div>
        </section>

        <section id="scanner" className="mobile-section">
          <div className="mobile-section__header">
            <span className="mobile-section__title">Scanner</span>
            <ScanSearch size={18} color={T.text3} />
          </div>
          <div className="mobile-section__body">
            <ScannerMini />
          </div>
        </section>

        <section id="ai" className="mobile-section">
          <div className="mobile-section__header">
            <span className="mobile-section__title">AI</span>
            <Brain size={18} color={T.text3} />
          </div>
          <div className="mobile-section__body">
            <AlNarratorMini />
          </div>
        </section>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="mobile-bottom-nav" aria-label="Mobile dashboard navigation">
        <div className="mobile-bottom-nav__inner">
          {[
            { id: 'portfolio', label: 'Portfolio', icon: Wallet },
            { id: 'chart', label: 'Chart', icon: BarChart3 },
            { id: 'scanner', label: 'Scanner', icon: ScanSearch },
            { id: 'ai', label: 'AI', icon: Brain },
          ].map(item => {
            const Icon = item.icon
            const active = activeMobileSection === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToSection(item.id, item.id as 'portfolio' | 'chart' | 'scanner' | 'ai')}
                className={`mobile-bottom-nav__button${active ? ' mobile-bottom-nav__button--active' : ''}`}
              >
                <Icon size={18} />
                <span className="mobile-bottom-nav__label">{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
