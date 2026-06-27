'use client'

import { useState, useEffect, useCallback } from 'react'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

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

// V553: Zustand store مشترك للـ sidebar state
// كان كل component يستدعي useSidebarState() يُنشئ state منفصل
// فالزر في PrimarySidebarLayout يحدّث state محلي لا يراه dashboard page
// الآن الكل يشارك نفس الحالة عبر Zustand
interface SidebarStore {
  activeTab: TabId
  collapsed: boolean
  drawerOpen: boolean
  searchQuery: string
  setActiveTab: (tab: TabId) => void
  setCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void
  toggleCollapse: () => void
  setDrawerOpen: (open: boolean) => void
  setSearchQuery: (q: string) => void
}

export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set, get) => ({
      activeTab: 'portfolio',
      collapsed: true,
      drawerOpen: false,
      searchQuery: '',
      setActiveTab: (tab) => set({ activeTab: tab }),
      setCollapsed: (value) => set((state) => ({
        collapsed: typeof value === 'function' ? value(state.collapsed) : value,
      })),
      toggleCollapse: () => set((state) => ({ collapsed: !state.collapsed })),
      setDrawerOpen: (open) => set({ drawerOpen: open }),
      setSearchQuery: (q) => set({ searchQuery: q }),
    }),
    {
      name: 'roua-sidebar-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ collapsed: state.collapsed }),
    }
  )
)

// V553: Hook يستخدم Zustand store المشترك
export function useSidebarState() {
  const activeTab = useSidebarStore(s => s.activeTab)
  const collapsed = useSidebarStore(s => s.collapsed)
  const drawerOpen = useSidebarStore(s => s.drawerOpen)
  const searchQuery = useSidebarStore(s => s.searchQuery)
  const setActiveTab = useSidebarStore(s => s.setActiveTab)
  const setCollapsed = useSidebarStore(s => s.setCollapsed)
  const toggleCollapse = useSidebarStore(s => s.toggleCollapse)
  const setDrawerOpen = useSidebarStore(s => s.setDrawerOpen)
  const setSearchQuery = useSidebarStore(s => s.setSearchQuery)

  // Keyboard shortcuts
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInputFocused =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable

      if (!isInputFocused) {
        const key = e.key
        if (key >= '1' && key <= '9') {
          const index = parseInt(key) - 1
          if (index < TAB_ORDER.length) {
            e.preventDefault()
            setActiveTab(TAB_ORDER[index])
          }
        } else if (key === '0') {
          const index = 9
          if (index < TAB_ORDER.length) {
            e.preventDefault()
            setActiveTab(TAB_ORDER[index])
          }
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault()
        toggleCollapse()
      }

      if (e.key === 'Escape') {
        setDrawerOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setActiveTab, toggleCollapse, setDrawerOpen])

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
