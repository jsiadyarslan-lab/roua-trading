'use client'

import { useScopedStyle } from '@/hooks/useScopedStyle'

/**
 * Client component that injects layout-level scoped CSS.
 * Used by dashboard/layout.tsx (a server component) to avoid
 * the "Node cannot be found" error during soft navigation.
 */
export function DashboardLayoutStyles() {
  useScopedStyle(`@media (max-width: 767px) {
                main { min-height: 100dvh !important; padding-bottom: 0 !important; overflow-y: auto !important; overflow-x: hidden !important; }
                main > div { min-height: 100% !important; }
              }`)
  return null
}
