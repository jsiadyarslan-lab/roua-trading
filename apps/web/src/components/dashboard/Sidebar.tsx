'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDashboardStore } from '@/lib/dashboard-store'

const navItems = [
  { id: 'dashboard', label: 'لوحة التحكم', emoji: '📊' },
  { id: 'markets', label: 'الأسواق', emoji: '📈' },
  { id: 'signals', label: 'إشارات رؤى', emoji: '🤖' },
  { id: 'portfolio', label: 'ملاذ المحفظة', emoji: '🛡️' },
  { id: 'settings', label: 'الإعدادات', emoji: '⚙️' },
]

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useDashboardStore()
  const [activeId, setActiveId] = useState('dashboard')

  return (
    <motion.div
      style={{
        gridArea: 'sidebar',
        background: 'var(--bg-sidebar)',
        borderInlineStart: '1px solid var(--border-subtle)',
      }}
      className="flex flex-col overflow-hidden"
      animate={{ width: sidebarCollapsed ? 64 : 200 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      {/* Toggle button */}
      <div className="flex items-center justify-end p-3">
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-md transition-colors hover:bg-[var(--bg-card-hover)]"
          style={{ color: 'var(--text-secondary)' }}
        >
          <span className="text-sm">{sidebarCollapsed ? '◀' : '▶'}</span>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-1 px-2 custom-scrollbar overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activeId === item.id

          return (
            <motion.button
              key={item.id}
              className="relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full text-right"
              style={{
                background: isActive ? 'var(--accent-bg)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                border: isActive ? '1px solid var(--accent-border)' : '1px solid transparent',
              }}
              whileHover={{ background: isActive ? 'var(--accent-bg)' : 'var(--bg-card-hover)' }}
              onClick={() => setActiveId(item.id)}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <span className="text-lg shrink-0">{item.emoji}</span>
              <AnimatePresence>
                {!sidebarCollapsed && (
                  <motion.span
                    className="text-sm font-medium whitespace-nowrap"
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
              {isActive && (
                <motion.div
                  className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
                  style={{ background: 'var(--accent)' }}
                  layoutId="activeIndicator"
                />
              )}
            </motion.button>
          )
        })}
      </nav>

      {/* Bottom section */}
      <div className="p-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
          >
            م
          </div>
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.div
                className="flex flex-col"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
              >
                <span className="text-xs font-medium" style={{ color: 'var(--text-main)' }}>
                  محمد طارق
                </span>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  حساب احترافي
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}
