'use client'

import { useMemo } from 'react'
import { PanelRightClose, PanelRightOpen, Pin, PinOff } from 'lucide-react'
import { SidebarIconRail, TAB_CONFIG } from './SidebarIconRail'
import { SidebarContentPanel } from './SidebarContentPanel'
import { useSidebarState, type TabId } from '@/hooks/useSidebarState'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { usePriceAlertStore } from '@/hooks/usePriceAlertStore'
import { T } from '@/lib/theme-tokens'

const TAB_TONES: Record<string, string> = {
  portfolio: 'المركز المالي',
  execute: 'أمر السوق',
  book: 'بنية السوق',
  watch: 'الرموز النشطة',
  alerts: 'الشروط والتنبيه',
  ai: 'القراءة التفسيرية',
  trader: 'التداول الآلي',
  news: 'السياق الإخباري',
  calendar: 'الماكرو القادم',
  backtest: 'صلاحية الفكرة',
  correlation: 'مخاطر التداخل',
}

export function LeftSidebarLayout() {
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
      label: active.label,
      helper: active.helper,
      accent: active.accent,
      tone: TAB_TONES[active.id] || '',
    }),
    [active]
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
        background: 'rgba(26, 29, 41, 0.65)',
        backdropFilter: 'blur(16px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
        transition: 'grid-template-columns 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        direction: 'rtl',
      }}
    >
      {/* Icon Rail */}
      <SidebarIconRail
        tabs={TAB_CONFIG}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabId)}
        collapsed={collapsed}
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

      {/* Collapse/Expand toggle — positioned inside sidebar */}
      <button
        type="button"
        onClick={toggleCollapse}
        title={collapsed ? 'توسيع السايدبار (Ctrl+B)' : 'تصغير السايدبار (Ctrl+B)'}
        aria-label={collapsed ? 'توسيع السايدبار' : 'تصغير السايدبار'}
        className="sidebar-collapse-btn"
        style={{
          position: 'absolute',
          top: 8,
          insetInlineStart: collapsed ? 10 : 8,
          zIndex: 10,
          width: 24,
          height: 24,
          borderRadius: 6,
          border: '1px solid rgba(0,212,255,0.18)',
          background: 'rgba(26, 29, 41, 0.85)',
          color: T.text3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          backdropFilter: 'blur(8px)',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.color = T.cyan
          e.currentTarget.style.borderColor = T.cyan
        }}
        onMouseLeave={e => {
          e.currentTarget.style.color = T.text3
          e.currentTarget.style.borderColor = 'rgba(0,212,255,0.18)'
        }}
      >
        {collapsed ? <PanelRightOpen size={13} /> : <PanelRightClose size={13} />}
      </button>
    </div>
  )
}
