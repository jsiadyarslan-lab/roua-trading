'use client'

import TopBar from './TopBar'
import SidebarLeft from './SidebarLeft'
import ChartArea from './ChartArea'
import SidebarRight from './SidebarRight'
import BottomPanel from './BottomPanel'
import { useDashboardStore } from '@/lib/dashboard-store'
import { BotEngine } from './BotEngine'

export default function QuantumDashboard() {
  const { chartFullscreen } = useDashboardStore()

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        width: '100vw',
        height: '100vh',
        background: 'var(--bg)',
        direction: 'rtl',
      }}
    >
      <BotEngine />
      {/* TopBar */}
      <TopBar />

      {/* Main Content Area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar Left */}
        {!chartFullscreen && <SidebarLeft />}

        {/* Center: Chart + Bottom */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Chart Area */}
          <div className="flex-1 min-h-0 p-1">
            <ChartArea />
          </div>

          {/* Bottom Panel */}
          {!chartFullscreen && <BottomPanel />}
        </div>

        {/* Sidebar Right */}
        {!chartFullscreen && <SidebarRight />}
      </div>
    </div>
  )
}
