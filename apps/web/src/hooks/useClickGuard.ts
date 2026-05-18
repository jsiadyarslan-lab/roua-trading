'use client'

import { useRef, useCallback } from 'react'

/**
 * useClickGuard — Prevents double-clicks / rapid taps on critical buttons.
 *
 * After the guarded handler is called, subsequent calls are blocked for
 * `cooldownMs` milliseconds (default 1500ms). This prevents duplicate
 * order submissions, duplicate API calls, or any other action that should
 * only fire once per user intent.
 *
 * Usage:
 *   const guardedExecute = useClickGuard(handleExecute, 2000)
 *   <button onClick={guardedExecute}>تنفيذ</button>
 *
 * The hook returns undefined when the call is blocked (within cooldown),
 * so callers can check for undefined to show feedback if desired.
 */
export function useClickGuard<T extends (...args: any[]) => any>(
  handler: T,
  cooldownMs: number = 1500
): T {
  const isLocked = useRef(false)

  return useCallback(
    ((...args: any[]) => {
      if (isLocked.current) return undefined
      isLocked.current = true
      try {
        return handler(...args)
      } finally {
        setTimeout(() => { isLocked.current = false }, cooldownMs)
      }
    }) as T,
    [handler, cooldownMs]
  )
}
