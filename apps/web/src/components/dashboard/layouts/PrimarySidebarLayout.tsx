'use client'

import { useMemo } from 'react'
import { PanelRightClose, PanelRightOpen, Pin, PinOff } from 'lucide-react'
import { SidebarIconRail, TAB_CONFIG } from './SidebarIconRail'
import { SidebarContentPanel } from './SidebarContentPanel'
import { useSidebarState, type TabId } from '@/hooks/useSidebarState'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { usePriceAlertStore } from '@/hooks/usePriceAlertStore'
import { T } from '@/lib/unified-tokens'
import { useTranslations } from 'next-intl'

export function PrimarySidebarLayout() {
  const tsl = useTranslations('dashboard.sidebarTabs')
  const {
    activeTab,
    setActiveTab,
    collapsed,
    toggleCollapse,
    searchQuery,
    setSearchQuery,
  } = useSidebarState()

  const active = useMemo(
    () => TAB_CONFIG.find(t => t.id === activeTab) || TAB_CONFIG[0],
    [activeTab]
  )

  const activeTabInfo = useMemo(
    () => ({
      label: tsl(active.id),
      helper: tsl(active.id + 'Helper'),
      accent: active.accent,
      tone: tsl(active.id),
    }),
    [active, tsl]
  )

  // Badges: positions count for portfolio, alerts count for alerts
  const positions = usePositionsStore(s => s.positions)
  const alerts = usePriceAlertStore(s => s.alerts)
  const badges = useMemo(() => {
    const b: Record<string, number> = {}
    if (positions.length > 0) b.portfolio = positions.length
    if (alerts && alerts.length > 0) b.alerts = alerts.length
    return b
  }, [positions.length, alerts?.length])

  return (
    <div
      className="sidebar-shell"
      style={{
        display: 'grid',
        gridTemplateColumns: collapsed ? '40px' : '40px minmax(0, 1fr)',
        height: '100%',
        minHeight: 0,
        borderRadius: 14,
        overflow: 'hidden',
        border: `1px solid rgba(0,212,255,0.18)`,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(16px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
        transition: 'grid-template-columns 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        direction: 'inherit',
      }}
    >
      {/* Icon Rail */}
      <SidebarIconRail
        tabs={TAB_CONFIG}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabId)}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        badges={badges}
      />

      {/* Content Panel (hidden when collapsed) */}
      {!collapsed && (
        <SidebarContentPanel
          activeTab={activeTab}
          activeTabInfo={activeTabInfo}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />
      )}

      {/* V561: زر الطي نُقل إلى SidebarIconRail (أعلى الشريط) */}
    </div>
  )
}
