'use client'

import { useEffect, useRef, useCallback } from 'react'

/**
 * useVisibleInterval — setInterval that pauses when the tab is hidden.
 *
 * When `document.visibilityState === 'hidden'`, the callback is skipped
 * and the interval keeps ticking but does nothing. When the tab becomes
 * visible again, the callback fires immediately to refresh stale data.
 *
 * This saves CPU, network, and battery when the user is on another tab.
 *
 * @param callback - Function to call on each interval tick
 * @param delayMs  - Interval delay in milliseconds (0 or negative = disabled)
 */
export function useVisibleInterval(
  callback: () => void,
  delayMs: number,
): void {
  const savedCallback = useRef(callback)
  const visibilityRef = useRef(true)

  // Keep the callback ref fresh without re-creating the interval
  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  // Track visibility state
  useEffect(() => {
    const onVisibilityChange = () => {
      const wasHidden = !visibilityRef.current
      visibilityRef.current = document.visibilityState === 'visible'

      // When tab becomes visible again, fire callback immediately
      // to refresh any stale data
      if (wasHidden && visibilityRef.current) {
        savedCallback.current()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  useEffect(() => {
    if (delayMs <= 0) return

    const id = setInterval(() => {
      // Skip callback when tab is hidden
      if (!visibilityRef.current) return
      savedCallback.current()
    }, delayMs)

    return () => clearInterval(id)
  }, [delayMs])
}

/**
 * useVisibleCountdown — countdown timer that pauses when tab is hidden.
 *
 * Unlike useVisibleInterval, this returns a countdown value that decrements
 * every second while visible. When hidden, the countdown freezes.
 * When visible again, it resumes from where it left off.
 *
 * @param onTick - Called every second with the new countdown value
 * @param resetDeps - Dependencies that trigger countdown reset
 */
export function useVisibleCountdown(
  onTick: (value: number) => void,
  resetDeps: readonly unknown[] = [],
): void {
  const savedOnTick = useRef(onTick)
  const visibilityRef = useRef(true)

  useEffect(() => {
    savedOnTick.current = onTick
  }, [onTick])

  useEffect(() => {
    const onVisibilityChange = () => {
      visibilityRef.current = document.visibilityState === 'visible'
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      if (!visibilityRef.current) return
      savedOnTick.current(1) // Signal tick
    }, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...resetDeps])
}
