'use client'

import { TrendingUp } from 'lucide-react'

import { useAuth } from '@/hooks/useAuth'
import BrandBox from '@/components/dashboard/BrandBox'
import TopNav from '@/components/dashboard/TopNav'
import NewsBar from '@/components/dashboard/NewsBar'
import TickerBar from '@/components/dashboard/TickerBar'
import WalletPanel from '@/components/dashboard/WalletPanel'
import OrderBookPanel from '@/components/dashboard/OrderBookPanel'
import SmartScanner from '@/components/dashboard/SmartScanner'
import OrderPanel from '@/components/dashboard/OrderPanel'
import TradingViewChart from '@/components/charts/TradingViewChart'

export default function DashboardPage() {
  const { loading } = useAuth()

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #0A84FF, #A259FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', animation: 'pulse-glow 2s ease-in-out infinite' }}>
            <TrendingUp style={{ width: 24, height: 24, color: '#fff' }} />
          </div>
          <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-ar)' }}>جارٍ التحميل...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="layout-shell" dir="rtl">
      {/* Brand Box — grid-area: brand */}
      <BrandBox />

      {/* News Bar — grid-area: news */}
      <NewsBar />

      {/* Ticker Bar — grid-area: ticker */}
      <TickerBar />

      {/* Top Navigation — grid-area: topnav */}
      <TopNav />

      {/* Main Content Area — grid-area: content */}
      <div style={{ gridArea: 'content', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {/* Background effects — positioned absolute so they don't affect grid children */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
          <div style={{ position: 'absolute', top: '-18%', insetInlineStart: '-10%', width: '44%', height: '44%', background: 'radial-gradient(circle, rgba(10,132,255,0.043), transparent 70%)', filter: 'blur(80px)', borderRadius: '50%' }} />
          <div style={{ position: 'absolute', bottom: '-18%', insetInlineEnd: '-10%', width: '44%', height: '44%', background: 'radial-gradient(circle, rgba(0,255,198,0.03), transparent 70%)', filter: 'blur(80px)', borderRadius: '50%' }} />
          <div style={{ position: 'absolute', inset: 0, opacity: 0.013, backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 39px, #0A84FF 39px, #0A84FF 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, #0A84FF 39px, #0A84FF 40px)' }} />
        </div>

        <div className="dash-grid" style={{ position: 'relative', zIndex: 1 }}>
          {/* Right sidebar: Wallet + Order Book + Quick Trade */}
          <div style={{ gridArea: 'sidebar_r', minHeight: 0, overflow: 'hidden', padding: '4px 6px', display: 'flex', flexDirection: 'column', gap: '4px', scrollbarWidth: 'thin', scrollbarColor: 'var(--accent-bg) transparent' }}>
            <WalletPanel />
            <OrderBookPanel />
            <OrderPanel />
          </div>

          {/* Center: Chart */}
          <div style={{ gridArea: 'chart', minHeight: 0, minWidth: 0 }}>
            <TradingViewChart />
          </div>

          {/* Positions panel */}
          <div style={{ gridArea: 'positions', minHeight: 0 }}>
            <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, padding: 0 }}>
              <div className="panel-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="panel-title">المراكز المفتوحة</span>
                  <span style={{ fontSize: '9px', fontWeight: 800, background: 'rgba(10,132,255,0.15)', border: '1px solid rgba(10,132,255,0.3)', color: '#0A84FF', padding: '1px 6px', borderRadius: '12px' }}>0</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '9px', color: 'rgba(128,144,168,0.5)' }}>إجمالي P&L:</span>
                  <span style={{ fontSize: '11px', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--profit)', textShadow: '0 0 6px rgba(0,255,198,0.5)' }} dir="ltr">+$0.00</span>
                </div>
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                <p style={{ color: 'var(--text-faint)', fontSize: '12px', fontFamily: 'var(--font-ar)' }}>لا توجد مراكز مفتوحة</p>
              </div>
            </div>
          </div>

          {/* Left sidebar: Smart Scanner */}
          <div style={{ gridArea: 'sidebar_l', minHeight: 0, overflow: 'hidden' }}>
            <SmartScanner />
          </div>
        </div>
      </div>
    </div>
  )
}
