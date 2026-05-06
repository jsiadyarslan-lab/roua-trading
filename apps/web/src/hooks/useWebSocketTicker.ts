'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * useWebSocketTicker — Market data hook
 *
 * In the current deployment, the NestJS WebSocket server is not running,
 * so this hook gracefully falls back to polling mode only.
 * The market-ticker component already handles the polling fallback
 * when `connected` is false.
 *
 * To enable WebSocket in the future, set NEXT_PUBLIC_WS_URL env var
 * and deploy the NestJS API service alongside Next.js.
 */

interface TickerData {
  symbol: string
  name: string
  exchange: string
  currency: string
  price: number
  change: number
  changePercent: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  marketCap: number | null
  fiftyTwoWeekHigh: number | null
  fiftyTwoWeekLow: number | null
  timestamp: string
  source: string
}

interface UseWebSocketTickerOptions {
  symbols: string[]
  enabled?: boolean
  onTick?: (symbol: string, data: TickerData) => void
  onError?: (symbol: string, error: string) => void
}

interface UseWebSocketTickerReturn {
  quotes: Map<string, TickerData>
  connected: boolean
  subscribe: (symbol: string) => void
  unsubscribe: (symbol: string) => void
}

// WebSocket URL — use env var if set, otherwise fall back to same origin
// (Next.js rewrites proxy /socket.io/* to NestJS API on localhost:3001)
// Polling transport works through rewrites; WebSocket upgrade requires
// a separate API service or custom server proxy.
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || (typeof window !== 'undefined' ? window.location.origin : '')
const WS_ENABLED = !!WS_URL

export function useWebSocketTicker({
  symbols,
  enabled = true,
  onTick,
  onError,
}: UseWebSocketTickerOptions): UseWebSocketTickerReturn {
  const [quotes, setQuotes] = useState<Map<string, TickerData>>(new Map())
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<any>(null)
  const subscribedRef = useRef<Set<string>>(new Set())

  // Stable callback refs
  const onTickRef = useRef(onTick)
  onTickRef.current = onTick
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  // Subscribe to a symbol (no-op when WS disabled)
  const subscribe = useCallback((symbol: string) => {
    if (socketRef.current?.connected && !subscribedRef.current.has(symbol)) {
      socketRef.current.emit('subscribe', { symbol })
      subscribedRef.current.add(symbol)
    }
  }, [])

  // Unsubscribe from a symbol (no-op when WS disabled)
  const unsubscribe = useCallback((symbol: string) => {
    if (socketRef.current?.connected && subscribedRef.current.has(symbol)) {
      socketRef.current.emit('unsubscribe', { symbol })
      subscribedRef.current.delete(symbol)
    }
  }, [])

  // Initialize WebSocket connection only if WS_ENABLED
  useEffect(() => {
    if (!enabled || !WS_ENABLED) {
      // WebSocket not available — connected stays false,
      // which triggers polling fallback in market-ticker
      return
    }

    // Dynamically import socket.io-client only when WebSocket is enabled
    let socket: any = null
    let disposed = false // FIX: Track disposal state to prevent connection leak

    import('socket.io-client').then(({ io }) => {
      // FIX: Check if component was unmounted during async import
      if (disposed) {
        return
      }

      socket = io(`${WS_URL}/exchange`, {
        transports: ['polling', 'websocket'],  // polling first — Next.js rewrites can't proxy WS upgrade requests
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
      })

      socketRef.current = socket

      socket.on('connect', () => {
        if (disposed) {
          socket.disconnect()
          return
        }
        setConnected(true)
        for (const symbol of subscribedRef.current) {
          socket.emit('subscribe', { symbol })
        }
      })

      socket.on('disconnect', () => {
        setConnected(false)
      })

      socket.on('ticker', (payload: { symbol: string; data: TickerData }) => {
        const { symbol, data } = payload
        setQuotes((prev) => {
          const next = new Map(prev)
          next.set(symbol, data)
          return next
        })
        onTickRef.current?.(symbol, data)
      })

      socket.on('ticker:error', (payload: { symbol: string; error: string }) => {
        onErrorRef.current?.(payload.symbol, payload.error)
      })

      socket.on('connect_error', () => {
        setConnected(false)
      })
    }).catch(() => {
      // WebSocket initialization failed — polling fallback will be used
    })

    return () => {
      disposed = true // FIX: Mark as disposed BEFORE disconnecting
      if (socket) {
        socket.disconnect()
      }
      // FIX: Also disconnect from ref in case the socket was set via socketRef
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
      subscribedRef.current.clear() // FIX: Clear subscriptions on unmount
      setConnected(false)
    }
  }, [enabled])

  // Subscribe to initial symbols
  useEffect(() => {
    if (!enabled || !connected) return

    for (const symbol of symbols) {
      if (!subscribedRef.current.has(symbol)) {
        subscribe(symbol)
      }
    }

    for (const symbol of subscribedRef.current) {
      if (!symbols.includes(symbol)) {
        unsubscribe(symbol)
      }
    }
  }, [symbols, connected, enabled, subscribe, unsubscribe])

  return { quotes, connected, subscribe, unsubscribe }
}
