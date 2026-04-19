'use client'

import BrandBox from '@/components/dashboard/BrandBox'
import Sidebar from '@/components/dashboard/Sidebar'
import Header from '@/components/dashboard/Header'
import Watchlist from '@/components/dashboard/Watchlist'
import TradingViewChart from '@/components/charts/TradingViewChart'
import SmartScanner from '@/components/dashboard/SmartScanner'
import OrderPanel from '@/components/dashboard/OrderPanel'
import NewsTicker from '@/components/dashboard/NewsTicker'

export default function DashboardPage() {
  return (
    <div className="layout-shell">
      <BrandBox />
      <Header />
      <Sidebar />
      <TradingViewChart />
      <Watchlist />
      <SmartScanner />
      <OrderPanel />
      <NewsTicker />
    </div>
  )
}
