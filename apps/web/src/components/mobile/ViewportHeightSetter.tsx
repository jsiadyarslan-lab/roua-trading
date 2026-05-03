'use client'

import { useEffect } from 'react'

/**
 * Sets a CSS custom property `--app-height` based on `window.innerHeight`.
 * This is more reliable than `100dvh` on iOS Safari where the dynamic
 * address bar causes `100dvh` to not correctly represent the actual
 * visible viewport.
 */
export default function ViewportHeightSetter() {
  useEffect(() => {
    const setHeight = () => {
      document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`)
    }
    setHeight()
    window.addEventListener('resize', setHeight)
    window.addEventListener('orientationchange', () => setTimeout(setHeight, 100))
    return () => {
      window.removeEventListener('resize', setHeight)
    }
  }, [])
  return null
}
