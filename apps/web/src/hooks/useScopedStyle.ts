'use client'

import { useEffect, useRef } from 'react'

/**
 * useScopedStyle — Injects scoped CSS into the document head.
 *
 * Replaces `<style>{css}</style>` in client components, which causes
 * "Node cannot be found in the current page" errors in Next.js 16
 * during soft navigation (client-side routing).
 *
 * How it works:
 * - Creates a <style> element in <head> on mount
 * - Removes it on unmount (cleanup)
 * - Uses a unique data attribute for each instance to avoid conflicts
 * - Re-applies CSS if the content changes
 *
 * Usage:
 * ```tsx
 * // Instead of:
 * <style>{`.my-class { color: red; }`}</style>
 *
 * // Use:
 * useScopedStyle(`.my-class { color: red; }`)
 * ```
 */
export function useScopedStyle(css: string) {
  const styleRef = useRef<HTMLStyleElement | null>(null)

  useEffect(() => {
    if (typeof document === 'undefined' || !css) return

    // Create or reuse the style element
    if (!styleRef.current) {
      const style = document.createElement('style')
      style.setAttribute('data-scoped-style', '')
      style.textContent = css
      
      // FIX: Never append directly to document.head in Next.js App Router!
      // React's concurrent reconciler strictly manages <head> and will crash
      // with "Node cannot be found" during client-side navigation if it finds
      // unaccounted DOM nodes. We use a dedicated container instead.
      let container = document.getElementById('scoped-style-container')
      if (!container) {
        container = document.createElement('div')
        container.id = 'scoped-style-container'
        container.style.display = 'none'
        document.body.appendChild(container)
      }
      
      container.appendChild(style)
      styleRef.current = style
    } else {
      styleRef.current.textContent = css
    }

    return () => {
      if (styleRef.current && styleRef.current.parentNode) {
        styleRef.current.parentNode.removeChild(styleRef.current)
        styleRef.current = null
      }
    }
  }, [css])
}
