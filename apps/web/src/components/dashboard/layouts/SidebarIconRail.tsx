'use client'

import { useState } from 'react'
import {
  Wallet,
  Zap,
  BookOpen,
  Eye,
  Bell,
  Brain,
  Bot,
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
        width: 40,
        minWidth: 40,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: `linear-gradient(180deg, #0A0D14, #0E1118)`,
        borderInlineStart: '1px solid rgba(0,212,255,0.12)',
        direction: 'rtl',
        position: 'relative',
        overflow: 'visible',
      }}
    >
      {/* Icon buttons — compact */}
      <div
        className="custom-scrollbar"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'visible',
          padding: '4px 0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
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
              style={{ position: 'relative', width: 34 }}
              onMouseEnter={() => setHoveredTab(tab.id)}
              onMouseLeave={() => setHoveredTab(null)}
            >
              <button
                type="button"
                onClick={() => onTabChange(tab.id)}
                aria-label={tab.label}
                title={tab.label}
                style={{
                  width: 34,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  background: isActive
                    ? `linear-gradient(135deg, ${tab.accent}15, rgba(255,255,255,0.01))`
                    : isHovered
                      ? 'rgba(255,255,255,0.08)'
                      : 'transparent',
                  transition: 'all 0.15s ease',
                  borderRadius: 6,
                }}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <div
                    style={{
                      position: 'absolute',
                      insetInlineEnd: 0,
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
                  size={isActive ? 15 : 14}
                  color={isActive ? tab.accent : isHovered ? '#A0B4CC' : '#6F849C'}
                  strokeWidth={isActive ? 2.5 : 2}
                  style={{
                    transition: 'all 0.15s ease',
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
                    top: 2,
                    right: 2,
                    minWidth: 12,
                    height: 12,
                    borderRadius: 999,
                    background: tab.accent,
                    color: '#000',
                    fontSize: 7,
                    fontWeight: 900,
                    fontFamily: FONT_MONO,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 2px',
                    boxShadow: `0 0 6px ${tab.accent}66`,
                    zIndex: 2,
                    border: '1.5px solid #0A0D14',
                  }}
                >
                  {badgeCount > 99 ? '99+' : badgeCount}
                </div>
              )}

              {/* Tooltip — appears on LEFT side in RTL (towards content area) */}
              {isHovered && !collapsed && (
                <div
                  style={{
                    position: 'fixed',
                    zIndex: 9999,
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                    background: 'rgba(26, 29, 41, 0.95)',
                    border: `1px solid ${tab.accent}30`,
                    borderRadius: 5,
                    padding: '3px 8px',
                    boxShadow: `0 4px 12px rgba(0,0,0,0.4), 0 0 8px ${tab.accent}15`,
                    backdropFilter: 'blur(8px)',
                    direction: 'rtl',
                    top: 'auto',
                    right: 'auto',
                    left: 'auto',
                    bottom: 'auto',
                  }}
                  ref={(el) => {
                    if (!el) return
                    // Position tooltip on the inline-start side (towards content area in RTL)
                    const parent = el.parentElement
                    if (parent) {
                      const rect = parent.getBoundingClientRect()
                      el.style.top = `${rect.top + rect.height / 2 - 12}px`
                      // In RTL, tooltip goes to the left (inline-start = left visually)
                      el.style.left = `${rect.left - el.offsetWidth - 6}px`
                    }
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: tab.accent,
                      fontFamily: "'Cairo', sans-serif",
                      letterSpacing: '0.3px',
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
