'use client'

import { useState } from 'react'
import {
  Wallet,
  Zap,
  BookOpen,
  Eye,
  Bell,
  Brain,
  Newspaper,
  CalendarDays,
  FlaskConical,
  GitBranch,
  type LucideIcon,
} from 'lucide-react'
import { T } from '@/lib/theme-tokens'

export interface TabConfig {
  id: string
  label: string
  helper: string
  accent: string
  icon: LucideIcon
}

const TAB_CONFIG: TabConfig[] = [
  { id: 'portfolio', label: 'المحفظة', helper: 'الرصيد والمراكز', accent: '#0A84FF', icon: Wallet },
  { id: 'execute', label: 'التنفيذ', helper: 'أمر سريع', accent: '#00FFA3', icon: Zap },
  { id: 'book', label: 'دفتر الأوامر', helper: 'العمق والسيولة', accent: '#FF4757', icon: BookOpen },
  { id: 'watch', label: 'قائمة السوق', helper: 'المراقبة الحية', accent: '#00D4FF', icon: Eye },
  { id: 'alerts', label: 'التنبيهات', helper: 'قواعد المتابعة', accent: '#FFB800', icon: Bell },
  { id: 'ai', label: 'رؤى AI', helper: 'الشرح والسياق', accent: '#B388FF', icon: Brain },
  { id: 'news', label: 'الأخبار', helper: 'تدفق السوق', accent: '#00D4FF', icon: Newspaper },
  { id: 'calendar', label: 'الأجندة', helper: 'أحداث مؤثرة', accent: '#FFB800', icon: CalendarDays },
  { id: 'backtest', label: 'المختبر', helper: 'اختبار سريع', accent: '#B388FF', icon: FlaskConical },
  { id: 'correlation', label: 'الارتباط', helper: 'ترابط الأصول', accent: '#00FFA3', icon: GitBranch },
]

interface SidebarIconRailProps {
  tabs?: TabConfig[]
  activeTab: string
  onTabChange: (tabId: string) => void
  collapsed: boolean
  badges?: Record<string, number>
}

export function SidebarIconRail({
  tabs = TAB_CONFIG,
  activeTab,
  onTabChange,
  collapsed,
  badges = {},
}: SidebarIconRailProps) {
  const [hoveredTab, setHoveredTab] = useState<string | null>(null)

  return (
    <aside
      style={{
        width: 32,
        minWidth: 32,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: `linear-gradient(180deg, #0A0D14, #0E1118)`,
        borderLeft: '1px solid rgba(0,212,255,0.12)',
        direction: 'rtl',
        position: 'relative',
      }}
    >
      {/* Icon buttons — compact */}
      <div
        className="custom-scrollbar"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '2px 0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0,
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab
          const isHovered = hoveredTab === tab.id
          const badgeCount = badges[tab.id]
          const Icon = tab.icon

          return (
            <div
              key={tab.id}
              style={{ position: 'relative', width: 28 }}
              onMouseEnter={() => setHoveredTab(tab.id)}
              onMouseLeave={() => setHoveredTab(null)}
            >
              <button
                type="button"
                onClick={() => onTabChange(tab.id)}
                aria-label={tab.label}
                style={{
                  width: 28,
                  height: 26,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  background: isActive
                    ? `linear-gradient(135deg, ${tab.accent}10, rgba(255,255,255,0.01))`
                    : isHovered
                      ? 'rgba(255,255,255,0.03)'
                      : 'transparent',
                  transition: 'all 0.15s ease',
                  borderRadius: 4,
                }}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '20%',
                      bottom: '20%',
                      width: 1.5,
                      borderRadius: '0 1px 1px 0',
                      background: tab.accent,
                      boxShadow: `0 0 4px ${tab.accent}55`,
                    }}
                  />
                )}

                <Icon
                  size={10}
                  color={isActive ? tab.accent : '#6F849C'}
                  style={{
                    transition: 'color 0.15s ease',
                    position: 'relative',
                    zIndex: 1,
                  }}
                />
              </button>

              {/* Badge */}
              {badgeCount !== undefined && badgeCount > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 1,
                    right: 1,
                    minWidth: 8,
                    height: 8,
                    borderRadius: 999,
                    background: tab.accent,
                    color: '#fff',
                    fontSize: 5,
                    fontWeight: 800,
                    fontFamily: "'JetBrains Mono', monospace",
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 1px',
                    boxShadow: `0 0 3px ${tab.accent}44`,
                    zIndex: 2,
                  }}
                >
                  {badgeCount > 99 ? '99+' : badgeCount}
                </div>
              )}

              {/* Tooltip — micro */}
              {isHovered && (
                <div
                  style={{
                    position: 'absolute',
                    left: -2,
                    top: '50%',
                    transform: 'translateX(-100%) translateY(-50%)',
                    background: '#1A1D29',
                    border: `1px solid ${tab.accent}20`,
                    borderRadius: 4,
                    padding: '2px 5px',
                    zIndex: 50,
                    boxShadow: `0 2px 6px rgba(0,0,0,0.3)`,
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span
                    style={{
                      fontSize: 8,
                      fontWeight: 800,
                      color: tab.accent,
                      fontFamily: "'Cairo', sans-serif",
                    }}
                  >
                    {tab.label}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

export { TAB_CONFIG }
