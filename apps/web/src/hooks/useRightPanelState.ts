'use client'

import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'roua-rightpanel-collapsed'

/**
 * useRightPanelState — حالة طي/فتح الـ Right Panel
 * نفس نمط useSidebarState لكن للوحة اليمنى
 */
export function useRightPanelState() {
  const [collapsed, setCollapsedState] = useState<boolean>(false)

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored !== null) {
        setCollapsedState(stored === 'true')
      }
    } catch {
      // ignore
    }
  }, [])

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value)
    try {
      localStorage.setItem(STORAGE_KEY, String(value))
    } catch {
      // ignore
    }
  }, [])

  const toggleCollapse = useCallback(() => {
    setCollapsedState(prev => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, String(next))
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  return {
    collapsed,
    setCollapsed,
    toggleCollapse,
  }
}
