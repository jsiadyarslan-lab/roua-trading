import { useEffect, useId } from 'react'
import { useStyleStore } from '@/store/styleStore'

/**
 * useScopedStyle — Safely injects dynamic CSS in Next.js App Router.
 * 
 * Instead of manipulating the DOM directly (which causes "Node cannot be found"),
 * this registers the CSS in a central Zustand store. The `<GlobalStyleRegistry />`
 * in `layout.tsx` safely renders it using React.
 */
export function useScopedStyle(css: string) {
  const id = useId()
  const addStyle = useStyleStore(state => state.addStyle)
  const removeStyle = useStyleStore(state => state.removeStyle)

  useEffect(() => {
    if (!css) return
    addStyle(id, css)
    return () => removeStyle(id)
  }, [css, id, addStyle, removeStyle])
}
