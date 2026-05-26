'use client'

import { useStyleStore } from '@/store/styleStore'

/**
 * Renders all dynamically registered CSS strings into a single `<style>` tag
 * completely managed by React. This prevents "Node cannot be found" Next.js crashes.
 */
export function GlobalStyleRegistry() {
  const styles = useStyleStore(state => state.styles)
  const allCss = Object.values(styles).join('\n')
  
  if (!allCss) return null
  
  return <style dangerouslySetInnerHTML={{ __html: allCss }} suppressHydrationWarning />
}
