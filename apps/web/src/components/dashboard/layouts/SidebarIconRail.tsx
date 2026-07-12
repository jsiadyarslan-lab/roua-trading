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
  PanelRightClose,
  PanelRightOpen,
  type LucideIcon,
} from 'lucide-react'
import { T } from '@/lib/unified-tokens'
import { useTranslations, useLocale } from 'next-intl'
import { isRtlLocale } from '@/lib/i18n-utils'

const FONT_MONO = "'JetBrains Mono', monospace"

export interface TabConfig {
  id: string
  label: string
  helper: string
  accent: string
  icon: LucideIcon
}

const TAB_CONFIG: TabConfig[] = [
  { id: 'portfolio', label: '', helper: '', accent: '#0A84FF', icon: Wallet },
  { id: 'execute', label: '', helper: '', accent: '#00FFA3', icon: Zap },
  { id: 'book', label: '', helper: '', accent: '#FF4757', icon: BookOpen },
  { id: 'watch', label: '', helper: '', accent: '#00D4FF', icon: Eye },
  { id: 'alerts', label: '', helper: '', accent: '#FFB800', icon: Bell },
  { id: 'ai', label: '', helper: '', accent: '#B388FF', icon: Brain },
  { id: 'news', label: '', helper: '', accent: '#00D4FF', icon: Newspaper },
  { id: 'calendar', label: '', helper: '', accent: '#FFB800', icon: CalendarDays },
  { id: 'backtest', label: '', helper: '', accent: '#B388FF', icon: FlaskConical },
  { id: 'correlation', label: '', helper: '', accent: '#00FFA3', icon: GitBranch },
]

interface SidebarIconRailProps {
  tabs?: TabConfig[]
  activeTab: string
  onTabChange: (tabId: string) => void
  collapsed: boolean
  onToggleCollapse?: () => void
  badges?: Record<string, number>
}

export function SidebarIconRail({
  tabs = TAB_CONFIG,
  activeTab,
  onTabChange,
  collapsed,
  onToggleCollapse,
  badges = {},
}: SidebarIconRailProps) {
  const t = useTranslations('dashboard.sidebarTabs')
  const locale = useLocale()
  const isRtl = isRtlLocale(locale)
  const [hoveredTab, setHoveredTab] = useState<string | null>(null)

  // Resolve translated labels & helpers
  const translatedTabs = tabs.map(tab => ({
    ...tab,
    label: t(tab.id),
    helper: t(tab.id + 'Helper'),
  }))

  return (
    <aside
      style={{
        width: 40,
        minWidth: 40,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: `linear-gradient(180deg, #000000, #050508)`,
        borderInlineStart: '1px solid rgba(0,212,255,0.12)',
        direction: 'inherit',
        position: 'relative',
        overflow: 'visible',
      }}
    >
      {/* V561: زر الطي — أعلى الشريط، قبل الأيقونات */}
      {onToggleCollapse && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '6px 0 4px',
          borderBottom: '1px solid rgba(0,212,255,0.08)',
          flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand' : 'Collapse'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: '1px solid rgba(0,212,255,0.18)',
              background: 'rgba(0, 0, 0, 0.9)',
              color: T.text3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
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
            {collapsed ? <PanelRightOpen size={14} /> : <PanelRightClose size={14} />}
          </button>
        </div>
      )}
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
        {translatedTabs.map((tab) => {
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
                      borderStartEndRadius: 1,
                      borderEndEndRadius: 1,
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
                    insetInlineEnd: 2,
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
                    border: '1.5px solid #000000',
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
                    direction: 'inherit',
                    top: 'auto',
                    right: 'auto',
                    left: 'auto',
                    bottom: 'auto',
                  }}
                  ref={(el) => {
                    if (!el) return
                    const parent = el.parentElement
                    if (parent) {
                      const rect = parent.getBoundingClientRect()
                      el.style.top = `${rect.top + rect.height / 2 - 12}px`
                      if (isRtl) {
                        el.style.left = `${rect.left - el.offsetWidth - 6}px`
                      } else {
                        el.style.left = `${rect.right + 6}px`
                      }
                    }
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: tab.accent,
                      fontFamily: "var(--font-ar)",
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
