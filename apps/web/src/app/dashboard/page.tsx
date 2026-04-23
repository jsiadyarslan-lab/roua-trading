'use client'

import { useState, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import QuantumChart from '@/components/dashboard/QuantumChart'
import { AlpacaPositions } from '@/components/dashboard/AlpacaPositions'
import { useMarketStore } from '@/hooks/useMarketStore'
import { BotEngine } from '@/components/dashboard/BotEngine'
import { NotificationEngine } from '@/components/dashboard/NotificationEngine'
import { GlobalLogicEngine } from '@/components/dashboard/GlobalLogicEngine'
import { NotificationToasts } from '@/components/dashboard/NotificationCenter'

import { LeftSidebarLayout } from '@/components/dashboard/layouts/LeftSidebarLayout'
import { RightPanelLayout } from '@/components/dashboard/layouts/RightPanelLayout'
import { WatchlistMini } from '@/components/dashboard/WatchlistMini'

const DASHBOARD_SYMBOLS = [
  'BTC/USD', 'ETH/USD', 'EUR/USD', 'GBP/USD', 'XAU/USD', 'AAPL', 'TSLA'
]

/* ─── Design tokens ─── */
const T = {
  bg:      '#0F1113',
  bg2:     '#111214',
  card:    '#111214',
  border:  'rgba(0, 229, 255, 0.08)',
  success: '#00C853',
  text:    '#E6EBF5',
  text3:   '#A0AFC3',
}

const HEADER_H = 100
const PANEL_H = 30
const ANIM    = 'height 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.22s ease'

import { usePositionsStore } from '@/hooks/usePositionsStore'

/* ════════════════════════════════════════════
   DASHBOARD PAGE MAIN CONTAINER
════════════════════════════════════════════ */
export default function DashboardPage() {
  const globalQuotes = useMarketStore(state => state.quotes)
  const account = usePositionsStore(state => state.account)
  const fetchAccount = usePositionsStore(state => state.fetchAccount)
  const fetchPositions = usePositionsStore(state => state.fetchPositions)

  useEffect(() => {
    fetchAccount()
    fetchPositions()
    const iv = setInterval(() => {
      fetchAccount()
      fetchPositions()
    }, 15000)
    return () => clearInterval(iv)
  }, [fetchAccount, fetchPositions])

  const quotes = new Map(
    DASHBOARD_SYMBOLS.map(s => globalQuotes[s] ? [s, globalQuotes[s]] : [s, null]).filter(([,v]) => v !== null) as [string, any][]
  )
  /* Positions open — collapsible separately */
  const [posOpen, setPosOpen] = useState(true)

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
          grid-template-columns: 280px 1fr 350px;
          height: calc(100vh - ${HEADER_H}px);
          background: ${T.bg};
          gap: 12px;
          padding: 12px;
          box-sizing: border-box;
          overflow: hidden;
        }
        @media (max-width: 1280px) {
          .dash-grid { grid-template-columns: 260px 1fr; }
          .dash-col-right { display: none !important; }
        }
        @media (max-width: 900px) {
          .dash-grid { 
            grid-template-columns: 1fr; 
            height: auto; 
            overflow-y: auto;
          }
          .dash-col-left { display: none !important; }
          .dash-col-right-mobile { display: block !important; }
        }
        .dash-col::-webkit-scrollbar { width: 4px; }
        .dash-col::-webkit-scrollbar-track { background: transparent; }
        .dash-col::-webkit-scrollbar-thumb { background: #0A84FF22; border-radius: 10px; }
        .dash-col::-webkit-scrollbar-thumb:hover { background: #0A84FF44; }
      `}</style>

      <BotEngine quotes={quotes} />
      <NotificationEngine quotes={quotes} />
      <GlobalLogicEngine />
      <NotificationToasts />

      <div className="dash-grid">

        {/* ══════════ COL 1 — Tabbed Left Sidebar ══════════ */}
        <div className="dash-col dash-col-left" style={{ minHeight: 0 }}>
          <LeftSidebarLayout />
        </div>

        {/* ══════════ COL 2 — Chart + Positions ══════════ */}
        <div className="dash-col dash-col-center" style={{ overflow: 'hidden', gap: 12 }}>
          {/* Chart — Fixed, non-draggable */}
          <div style={{
            flex: 1,
            background: T.card,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <QuantumChart />
            </div>
          </div>

          {/* Open Trades — Collapsible */}
          <div style={{
            flexShrink: 0,
            height: posOpen ? 220 : PANEL_H,
            transition: ANIM,
            background: T.card,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              height: PANEL_H, flexShrink: 0,
              background: `linear-gradient(90deg, ${T.success}08, transparent)`,
              borderBottom: posOpen ? `1px solid ${T.border}` : 'none',
              display: 'flex', alignItems: 'center', padding: '0 12px', gap: 16,
            }}>
              <div style={{ flex: 1, display: 'flex', gap: 24, fontSize: 11, fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>
                 <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ color: T.text3 }}>الرصيد:</span>
                    <span style={{ color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>${account ? (account.equity || 0).toLocaleString() : '---'}</span>
                 </div>
                 <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ color: T.text3 }}>الهامش الحر:</span>
                    <span style={{ color: T.success, fontFamily: "'JetBrains Mono', monospace" }}>${account ? (account.buyingPower || 0).toLocaleString() : '---'}</span>
                 </div>
                 <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ color: T.text3 }}>الهامش المستخدم:</span>
                    <span style={{ color: T.danger, fontFamily: "'JetBrains Mono', monospace" }}>${account ? ((account.equity || 0) - (account.cash || 0)).toLocaleString() : '---'}</span>
                 </div>
                 <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ color: T.text3 }}>كمية الهامش:</span>
                    <span style={{ color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>${account ? (account.initialMargin || 0).toLocaleString() : '---'}</span>
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

        {/* Mobile Sidebar (Visible only on mobile) */}
        <div className="dash-col dash-col-right-mobile" style={{ display: 'none', padding: '0 4px 20px' }}>
             <RightPanelLayout quotes={quotes} />
             <div style={{ height: 10 }} />
             <WatchlistMini />
        </div>

      </div>
    </>
  )
}
