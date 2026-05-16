'use client'

import { useEffect, useId, useMemo } from 'react'
import { useStyleStore } from '@/store/styleStore'

/**
 * <ScopedStyle> — Drop-in replacement for `<style>` tags in client components.
 *
 * This version uses a centralized Zustand store to manage styles safely,
 * completely avoiding the "Node cannot be found in the current page" error
 * caused by direct DOM manipulation in Next.js 14+ App Router.
 */
export function ScopedStyle(props: {
  children?: string
  dangerouslySetInnerHTML?: { __html: string }
}) {
  const id = useId()
  const addStyle = useStyleStore(state => state.addStyle)
  const removeStyle = useStyleStore(state => state.removeStyle)

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
    if (!css) return
    addStyle(id, css)
    return () => removeStyle(id)
  }, [css, id, addStyle, removeStyle])

  // This component renders nothing to the React tree directly.
  return null
}
