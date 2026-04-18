'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'

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

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001'

export function useWebSocketTicker({
  symbols,
  enabled = true,
  onTick,
  onError,
}: UseWebSocketTickerOptions): UseWebSocketTickerReturn {
  const [quotes, setQuotes] = useState<Map<string, TickerData>>(new Map())
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const subscribedRef = useRef<Set<string>>(new Set())

  // Stable callback refs
  const onTickRef = useRef(onTick)
  onTickRef.current = onTick
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  // Subscribe to a symbol
  const subscribe = useCallback((symbol: string) => {
    if (socketRef.current?.connected && !subscribedRef.current.has(symbol)) {
      socketRef.current.emit('subscribe', { symbol })
      subscribedRef.current.add(symbol)
    }
  }, [])

  // Unsubscribe from a symbol
  const unsubscribe = useCallback((symbol: string) => {
    if (socketRef.current?.connected && subscribedRef.current.has(symbol)) {
      socketRef.current.emit('unsubscribe', { symbol })
      subscribedRef.current.delete(symbol)
    }
  }, [])

  // Initialize WebSocket connection
  useEffect(() => {
    if (!enabled) return

    const socket = io(`${WS_URL}/exchange`, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      // Re-subscribe to all tracked symbols on reconnect
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

    return () => {
      socket.disconnect()
      socketRef.current = null
      setConnected(false)
    }
  }, [enabled])

  // Subscribe to initial symbols
  useEffect(() => {
    if (!enabled || !connected) return

    // Subscribe to new symbols
    for (const symbol of symbols) {
      if (!subscribedRef.current.has(symbol)) {
        subscribe(symbol)
      }
    }

    // Unsubscribe from symbols no longer in the list
    for (const symbol of subscribedRef.current) {
      if (!symbols.includes(symbol)) {
        unsubscribe(symbol)
      }
    }
  }, [symbols, connected, enabled, subscribe, unsubscribe])

  return { quotes, connected, subscribe, unsubscribe }
}
