'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { GripVertical, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { PortfolioMini } from '@/components/portfolio/PortfolioMini'
import { AlNarratorMini } from '@/components/ai/AlNarratorMini'
import { QuickExecutionMini } from '@/components/dashboard/QuickExecutionMini'
import { OrderBookMini } from '@/components/dashboard/OrderBookMini'
import { WatchlistMini } from '@/components/dashboard/WatchlistMini'
import { ScannerMini } from '@/components/dashboard/ScannerMini'
import { BotMini } from '@/components/dashboard/BotMini'
import QuantumChart from '@/components/dashboard/QuantumChart'
import { AlpacaPositions } from '@/components/dashboard/AlpacaPositions'
import { useMarketQuotes } from '@/hooks/useMarketData'
import { BotEngine } from '@/components/dashboard/BotEngine'
import { NotificationToaster } from '@/components/dashboard/NotificationToaster'
import { NotificationCenterMini } from '@/components/dashboard/NotificationCenterMini'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import SidebarLeft from '@/components/dashboard/SidebarLeft'
import { SettingsView } from '@/components/dashboard/SettingsView'
import { useDashboardStore } from '@/lib/dashboard-store'

const DASHBOARD_SYMBOLS = [
  'BTC/USD', 'ETH/USD', 'EUR/USD', 'GBP/USD', 'XAU/USD', 'AAPL', 'TSLA'
]

/* ─── Design tokens ─── */
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

const HEADER_H = 100
const PANEL_H = 30
const ANIM    = 'height 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.22s ease'

export default function DashboardPage() {
  const { quotes } = useMarketQuotes(DASHBOARD_SYMBOLS, 8000)
  const { activePage } = useDashboardStore()
  const [posOpen, setPosOpen] = useState(true)

  return (
    <>
      <style>{`
        @keyframes drop-pulse {
          0%,100% { opacity: 0.5 }
          50%      { opacity: 1   }
        }
        .dash-col::-webkit-scrollbar { width: 4px; }
        .dash-col::-webkit-scrollbar-track { background: transparent; }
        .dash-col::-webkit-scrollbar-thumb { background: #0A84FF22; border-radius: 10px; }
        .dash-col::-webkit-scrollbar-thumb:hover { background: #0A84FF44; }
      `}</style>

      <BotEngine quotes={quotes} />
      <NotificationToaster />

      <div className="dash-grid" style={{
        height: `calc(100vh - ${HEADER_H}px)`,
        background: T.bg,
        gap: 12,
        padding: 12
      }}>

        <div className="dash-col dash-col-left" style={{ minHeight: 0 }}>
          <SidebarLeft />
        </div>

        {activePage === 'settings' ? (
          <div style={{ flex: 1, height: '100%', overflow: 'hidden' }}>
            <SettingsView />
          </div>
        ) : (
          <>
            <div className="dash-col dash-col-center" style={{ overflow: 'hidden', gap: 12 }}>
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

              <div style={{
                flexShrink: 0,
                height: posOpen ? 120 : PANEL_H,
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
                  display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8,
                }}>
                  <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 13, fontWeight: 800, color: T.text, flex: 1 }}>الصفقات المفتوحة</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, color: T.success, opacity: 0.8 }}>OPEN TRADES</span>
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

            <div className="dash-col dash-col-right">
              <Col3TabbedPanel quotes={quotes} />
            </div>
          </>
        )}

        <div className="dash-col dash-col-right-mobile" style={{ display: 'none', padding: '0 4px 20px' }}>
             <Col3TabbedPanel quotes={quotes} />
             <div style={{ height: 10 }} />
             <WatchlistMini />
        </div>
      </div>
    </>
  )
}

function Col3TabbedPanel({ quotes }: { quotes: any }) {
  const [active, setActive] = useState('bot')
  const { unreadCount } = useNotificationStore()
  
  const TABS = [
    { id: 'bot', label: 'البوت', accent: T.cyan },
    { id: 'scanner', label: 'السكانر', accent: T.amber },
    { id: 'alerts', label: `تنبيهات ${unreadCount > 0 ? `(${unreadCount})` : ''}`, accent: T.purple },
    { id: 'multi-tf', label: 'متعدد الأطر', accent: T.green },
  ]

  return (
    <div className="dash-col" style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: T.card, border: `0.5px solid ${T.border}`,
      borderRadius: 10, overflow: 'hidden'
    }}>
      <div style={{
        display: 'flex', background: T.bg, borderBottom: `0.5px solid ${T.border}`,
        padding: '6px 6px 0', gap: 6, flexShrink: 0
      }}>
        {TABS.map(t => {
           const isActive = active === t.id
           return (
             <button key={t.id} onClick={() => setActive(t.id)} style={{
               flex: 1, padding: '6px 0', background: 'transparent',
               border: 'none', borderBottom: isActive ? `2px solid ${t.accent}` : 'none',
               color: isActive ? t.accent : T.text2, fontSize: 10, fontWeight: 800,
               cursor: 'pointer', transition: 'all 0.2s', fontFamily: "'Cairo', sans-serif"
             }}>
               {t.label}
             </button>
           )
        })}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {active === 'bot' && <BotMini />}
        {active === 'scanner' && <ScannerMini />}
        {active === 'alerts' && <NotificationCenterMini />}
        {active === 'multi-tf' && <div style={{ padding: 40, textAlign: 'center', opacity: 0.3 }}>تحليل متعدد الأطر قيد التطوير...</div>}
      </div>
    </div>
  )
}
