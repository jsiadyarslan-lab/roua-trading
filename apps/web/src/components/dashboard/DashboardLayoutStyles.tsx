'use client'

import { useScopedStyle } from '@/hooks/useScopedStyle'

/**
 * Client component that injects layout-level scoped CSS.
 * Used by dashboard/layout.tsx (a server component) to avoid
 * the "Node cannot be found" error during soft navigation.
 */
export function DashboardLayoutStyles() {
  useScopedStyle(`@media (max-width: 767px) {
                main { height: 100dvh !important; min-height: 0 !important; padding-bottom: 0 !important; overflow: hidden !important; }
                /* Ensure sub-pages fill the viewport on mobile */
                main > div { height: 100% !important; min-height: 0 !important; }
              }`)
  return null
}
