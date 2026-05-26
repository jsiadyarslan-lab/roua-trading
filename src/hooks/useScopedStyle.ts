"use client"

import { useEffect, useRef } from "react"

/**
 * Injects scoped CSS into the document head.
 * Used by the chart component to apply theme-specific styles.
 * In Next.js 16, <style> tags in client components can cause
 * "Node cannot be found in the current page" errors during soft navigation,
 * so we use imperative DOM manipulation instead.
 */
export function useScopedStyle(css: string) {
  const styleRef = useRef<HTMLStyleElement | null>(null)

  useEffect(() => {
    if (!css) return

    const style = document.createElement("style")
    style.setAttribute("data-chart-scoped", "")
    style.textContent = css
    document.head.appendChild(style)
    styleRef.current = style

    return () => {
      if (styleRef.current && styleRef.current.parentNode) {
        styleRef.current.parentNode.removeChild(styleRef.current)
        styleRef.current = null
      }
    }
  }, [css])
}
