'use client'

import { useState, useEffect, useCallback } from 'react'

export type TabId =
  | 'portfolio'
  | 'execute'
  | 'book'
  | 'watch'
  | 'alerts'
  | 'ai'
  | 'trader'
  | 'news'
  | 'calendar'
  | 'backtest'
  | 'correlation'

const TAB_ORDER: TabId[] = [
  'portfolio',
  'execute',
  'book',
  'watch',
  'alerts',
  'ai',
  'trader',
  'news',
  'calendar',
  'backtest',
  'correlation',
]

const STORAGE_KEY = 'roua-sidebar-collapsed'

function getInitialCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'true'
  } catch {
    return false
  }
}

export function useSidebarState() {
  const [activeTab, setActiveTab] = useState<TabId>('portfolio')
  const [collapsed, setCollapsedState] = useState<boolean>(false)
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false)
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Hydrate from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved !== null) setCollapsedState(saved === 'true')
    } catch {
      // ignore storage errors
    }
  }, [])

  const setCollapsed = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setCollapsedState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(STORAGE_KEY, String(next))
        } catch {
          // ignore storage errors
        }
      }
      return next
    })
  }, [])

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => !prev)
  }, [setCollapsed])

  // Keyboard shortcuts
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleKeyDown = (e: KeyboardEvent) => {
      // 1-0 keys for tab switching (only when no input is focused)
      const target = e.target as HTMLElement
      const isInputFocused =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable

      if (!isInputFocused) {
        // Number keys 1-9 and 0 for tab switching
        const key = e.key
        if (key >= '1' && key <= '9') {
          const index = parseInt(key) - 1
          if (index < TAB_ORDER.length) {
            e.preventDefault()
            setActiveTab(TAB_ORDER[index])
          }
        } else if (key === '0') {
          // 0 maps to the 10th tab
          const index = 9
          if (index < TAB_ORDER.length) {
            e.preventDefault()
            setActiveTab(TAB_ORDER[index])
          }
        }
      }

      // Ctrl+B to toggle collapse
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault()
        toggleCollapse()
      }

      // Escape to close drawer
      if (e.key === 'Escape') {
        setDrawerOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleCollapse])

  return {
    activeTab,
    setActiveTab,
    collapsed,
    setCollapsed,
    toggleCollapse,
    drawerOpen,
    setDrawerOpen,
    searchQuery,
    setSearchQuery,
  }
}
