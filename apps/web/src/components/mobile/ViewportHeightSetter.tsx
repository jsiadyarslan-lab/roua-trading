'use client'

import { useEffect } from 'react'

/**
 * Sets a CSS custom property `--app-height` based on `window.innerHeight`.
 * This is more reliable than `100dvh` on iOS Safari where the dynamic
 * address bar causes `100dvh` to not correctly represent the actual
 * visible viewport.
 *
 * FIX: The orientationchange listener was never removed in the cleanup
 * function, causing a memory leak. Now both resize and orientationchange
 * listeners are properly stored and removed on unmount.
 */
export default function ViewportHeightSetter() {
  useEffect(() => {
    const setHeight = () => {
      document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`)
    }
    setHeight()

    const onOrientationChange = () => setTimeout(setHeight, 100)

    window.addEventListener('resize', setHeight)
    window.addEventListener('orientationchange', onOrientationChange)
    return () => {
      window.removeEventListener('resize', setHeight)
      window.removeEventListener('orientationchange', onOrientationChange)
    }
  }, [])
  return null
}
