'use client'

import { create } from 'zustand'

/**
 * useRightPanelState — Zustand store مشترك (بدون persist)
 * V559: لا نستخدم persist لتجنب SSR hydration mismatch
 * لكن نستخدم Zustand لمشاركة الحالة بين page.tsx و RightPanelLayout.tsx
 *
 * المشكلة السابقة: كل component يستدعي useRightPanelState() يُنشئ state منفصل
 * الحل: Zustand store واحد مشترك
 */
interface RightPanelStore {
  collapsed: boolean
  setCollapsed: (value: boolean) => void
  toggleCollapse: () => void
}

export const useRightPanelStore = create<RightPanelStore>((set) => ({
  collapsed: false, // دائماً مفتوح في البداية (لا SSR mismatch)
  setCollapsed: (value) => set({ collapsed: value }),
  toggleCollapse: () => set((state) => ({ collapsed: !state.collapsed })),
}))

// Hook يستخدم Zustand store المشترك
export function useRightPanelState() {
  const collapsed = useRightPanelStore(s => s.collapsed)
  const setCollapsed = useRightPanelStore(s => s.setCollapsed)
  const toggleCollapse = useRightPanelStore(s => s.toggleCollapse)

  return { collapsed, setCollapsed, toggleCollapse }
}
