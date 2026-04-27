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
        width: 56,
        minWidth: 56,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: `linear-gradient(180deg, #0A0D14, #0E1118)`,
        borderLeft: '1px solid rgba(0,212,255,0.12)',
        direction: 'rtl',
        position: 'relative',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '8px 5px 7px',
          borderBottom: '1px solid rgba(0,212,255,0.10)',
          display: 'grid',
          gap: 3,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: 8.5,
            color: T.text,
            fontWeight: 900,
            fontFamily: "'Cairo', sans-serif",
          }}
        >
          الأدوات
        </div>
        {!collapsed && (
          <div style={{ fontSize: 6, color: '#A2B4C8', lineHeight: 1.3 }}>أيقونات</div>
        )}
      </div>

      {/* Icon buttons */}
      <div
        className="custom-scrollbar"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '4px 0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
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
              style={{ position: 'relative', width: 48 }}
              onMouseEnter={() => setHoveredTab(tab.id)}
              onMouseLeave={() => setHoveredTab(null)}
            >
              <button
                type="button"
                onClick={() => onTabChange(tab.id)}
                aria-label={tab.label}
                style={{
                  width: 48,
                  height: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  background: isActive
                    ? `linear-gradient(135deg, ${tab.accent}15, rgba(255,255,255,0.03))`
                    : isHovered
                      ? 'rgba(255,255,255,0.04)'
                      : 'transparent',
                  transition: 'all 0.2s ease',
                  borderRadius: 8,
                }}
              >
                {/* Active indicator bar on RIGHT side (RTL layout) */}
                {isActive && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: '15%',
                      bottom: '15%',
                      width: 3,
                      borderRadius: '0 3px 3px 0',
                      background: tab.accent,
                      boxShadow: `0 0 10px ${tab.accent}66`,
                    }}
                  />
                )}

                {/* Subtle glow background when active */}
                {isActive && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 4,
                      borderRadius: 6,
                      background: `${tab.accent}08`,
                      boxShadow: `0 0 16px ${tab.accent}10`,
                    }}
                  />
                )}

                <Icon
                  size={20}
                  color={isActive ? tab.accent : '#6F849C'}
                  style={{
                    transition: 'color 0.2s ease',
                    position: 'relative',
                    zIndex: 1,
                  }}
                />
              </button>

              {/* Badge counter */}
              {badgeCount !== undefined && badgeCount > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    minWidth: 14,
                    height: 14,
                    borderRadius: 999,
                    background: tab.accent,
                    color: '#fff',
                    fontSize: 8,
                    fontWeight: 800,
                    fontFamily: "'JetBrains Mono', monospace",
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 3px',
                    boxShadow: `0 0 8px ${tab.accent}55`,
                    zIndex: 2,
                  }}
                >
                  {badgeCount > 99 ? '99+' : badgeCount}
                </div>
              )}

              {/* Tooltip on hover */}
              {isHovered && (
                <div
                  style={{
                    position: 'absolute',
                    left: -4,
                    top: '50%',
                    transform: 'translateX(-100%) translateY(-50%)',
                    background: '#1A1D29',
                    border: `1px solid ${tab.accent}30`,
                    borderRadius: 8,
                    padding: '6px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    zIndex: 50,
                    boxShadow: `0 4px 16px rgba(0,0,0,0.4), 0 0 12px ${tab.accent}15`,
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: tab.accent,
                      fontFamily: "'Cairo', sans-serif",
                    }}
                  >
                    {tab.label}
                  </span>
                  <span
                    style={{
                      fontSize: 8,
                      color: '#8B92A8',
                      fontFamily: "'Cairo', sans-serif",
                    }}
                  >
                    {tab.helper}
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
