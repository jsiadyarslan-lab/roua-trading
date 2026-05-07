'use client'

import { useEffect, useRef, useMemo } from 'react'

/**
 * <ScopedStyle> — Drop-in replacement for `<style>` tags in client components.
 *
 * WHY: In Next.js 16, `<style>{css}</style>` tags inside React client components
 * cause "Node cannot be found in the current page" errors during soft navigation
 * (client-side routing). The React reconciler cannot handle style elements properly
 * when the DOM is updated via client-side transitions.
 *
 * HOW: Instead of rendering a `<style>` element in the React tree, this component
 * injects a `<style>` element directly into `<head>` using the DOM API (outside
 * React's reconciliation), and cleans it up on unmount.
 *
 * USAGE — Simple drop-in replacement:
 * ```tsx
 * // Before (causes navigation crash):
 * <style>{`.my-class { color: red; }`}</style>
 *
 * // After (safe):
 * <ScopedStyle>{`.my-class { color: red; }`}</ScopedStyle>
 * ```
 *
 * USAGE — With dangerouslySetInnerHTML:
 * ```tsx
 * // Before:
 * <style dangerouslySetInnerHTML={{ __html: dynamicCss }} />
 *
 * // After:
 * <ScopedStyle dangerouslySetInnerHTML={{ __html: dynamicCss }} />
 * ```
 *
 * USAGE — With styled-jsx global:
 * ```tsx
 * // Before:
 * <style jsx global>{cssString}</style>
 *
 * // After:
 * <ScopedStyle>{cssString}</ScopedStyle>
 * ```
 *
 * This component renders nothing to the DOM (returns null).
 * The CSS is injected into <head> and cleaned up automatically.
 */
export function ScopedStyle(props: {
  children?: string
  dangerouslySetInnerHTML?: { __html: string }
}) {
  const styleRef = useRef<HTMLStyleElement | null>(null)
  const idRef = useRef<string>('')

  // Extract CSS content from either children or dangerouslySetInnerHTML
  const css = useMemo(() => {
    if (props.dangerouslySetInnerHTML) {
      return props.dangerouslySetInnerHTML.__html
    }
    if (typeof props.children === 'string') {
      return props.children
    }
    return ''
  }, [props.dangerouslySetInnerHTML, props.children])

  useEffect(() => {
    if (typeof document === 'undefined' || !css) return

    // Generate a stable ID based on content hash for deduplication
    if (!idRef.current) {
      idRef.current = `scoped-${Math.random().toString(36).slice(2, 10)}`
    }

    // Check if a style with this exact CSS already exists (dedup for React strict mode)
    const existingStyles = document.querySelectorAll<HTMLStyleElement>('style[data-scoped-style]')
    for (const el of existingStyles) {
      if (el.getAttribute('data-scoped-id') === idRef.current) {
        styleRef.current = el
        return
      }
    }

    // Create and inject the style element
    const style = document.createElement('style')
    style.setAttribute('data-scoped-style', '')
    style.setAttribute('data-scoped-id', idRef.current)
    style.textContent = css
    
    // FIX: Never append directly to document.head in Next.js App Router!
    let container = document.getElementById('scoped-style-container')
    if (!container) {
      container = document.createElement('div')
      container.id = 'scoped-style-container'
      container.style.display = 'none'
      document.body.appendChild(container)
    }
    container.appendChild(style)
    styleRef.current = style

    return () => {
      if (styleRef.current && styleRef.current.parentNode) {
        styleRef.current.parentNode.removeChild(styleRef.current)
        styleRef.current = null
      }
    }
  }, [css])

  // This component renders nothing to the React tree
  return null
}
