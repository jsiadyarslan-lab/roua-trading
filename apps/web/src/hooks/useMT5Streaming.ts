'use client'

import { useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { usePositionsStore } from '@/hooks/usePositionsStore'

/**
 * V196: MT5 Streaming Hook
 *
 * Connects to the NestJS /mt5 Socket.IO namespace and listens for
 * real-time MT5 events (balance, position, price, status).
 *
 * When events arrive, they update the usePositionsStore directly,
 * providing instant MT5 data without polling.
 *
 * FALLBACK: If Socket.IO is not connected, the existing polling
 * mechanism (fetchAccount every 8-20s) still works.
 */
export function useMT5Streaming() {
  const socketRef = useRef<Socket | null>(null)
  const activeCredentialId = usePositionsStore(s => s.activeCredentialId)

  const connect = useCallback(() => {
    // Don't connect if already connected
    if (socketRef.current?.connected) return

    // Get session token for auth
    const getToken = () => {
      if (typeof document === 'undefined') return null
      const match = document.cookie.match(/roua_session=([^;]+)/)
      return match?.[1] || null
    }

    const token = getToken()
    if (!token) return

    try {
      const socket = io('/mt5', {
        auth: { token },
        path: '/socket', // V399: Custom path (no dots) — Next.js was 404ing /socket.io/
        // V-PNL: Allow WebSocket upgrade (was polling-only).
        // If WS upgrade fails through Next.js proxy, Socket.IO falls back to polling.
        transports: ['polling', 'websocket'],
        upgrade: true,
        rememberUpgrade: true,
        reconnection: true,
        reconnectionAttempts: 20,
        reconnectionDelay: 3000,
        reconnectionDelayMax: 30000,
        timeout: 10000,
      })

      socket.on('connect', () => {
        console.log('[MT5 Stream] Connected to /mt5 namespace')

        // Subscribe to the active credential's updates
        const credId = usePositionsStore.getState().activeCredentialId
        if (credId) {
          socket.emit('mt5:subscribe', { credentialId: credId })
        }
      })

      // ─── Balance Updates ─────────────────────────────
      socket.on('mt5:balance', (update: {
        credentialId: string
        userId: string
        accountId: string
        balance: number
        equity: number
        margin: number
        freeMargin: number
        marginLevel: number
        currency: string
        leverage: number
        timestamp: number
      }) => {
        // V197 FIX: Use queueMicrotask to avoid React error #310
        // "Cannot update a component while rendering a different component"
        // Socket.IO callbacks can fire during React's render phase when
        // the component tree is being committed. Deferring the state update
        // to the next microtask ensures it happens outside the render cycle.
        queueMicrotask(() => {
          const state = usePositionsStore.getState()
          const activeCredId = state.activeCredentialId

          // Only update if this is the active credential
          if (activeCredId && update.credentialId === activeCredId && state.account) {
            const account = { ...state.account }

            // Update account values from real-time MetaAPI data
            account.equity = update.equity
            account.cash = update.balance
            account.buyingPower = Math.max(0, update.equity - update.margin)
            account.portfolioValue = update.equity
            account.initialMargin = update.margin
            account.unrealizedPnl = update.equity - update.balance

            // Clear stale/metaapiDown flags — streaming is working!
            ;(account as any).isStaleBalance = false
            ;(account as any).metaapiDown = false
            ;(account as any).metaapiError = undefined
            ;(account as any)._lastStreamUpdate = Date.now()

            // V203 FIX: Mark this as a real exchange account so updatePositionPrice()
            // and margin calculations trust the exchange-provided margin over client-side calc.
            // Without this, real-time price updates would recalculate margin using
            // paper-trading leverage formula instead of using MetaAPI's actual margin.
            ;(account as any).isRealExchangeMargin = true
            // V203: Also update _backendMargin so the margin priority system
            // in updatePositionPrice() uses the real exchange margin (TIER 1)
            ;(account as any)._backendMargin = update.margin
            ;(account as any)._marginVersion = Date.now()

            usePositionsStore.setState({ account })
          }

          // Also update the exchangeBalances entry
          const exBals = [...(state.exchangeBalances || [])]
          const idx = exBals.findIndex((e: any) => e.credentialId === update.credentialId)
          if (idx >= 0) {
            exBals[idx] = {
              ...exBals[idx],
              equity: update.equity,
              balance: update.balance,
              available: update.freeMargin,
              usedMargin: update.margin,
            }
            usePositionsStore.setState({ exchangeBalances: exBals })
          }
        })
      })

      // ─── Position Updates ────────────────────────────
      socket.on('mt5:position', (update: {
        credentialId: string
        action: 'updated' | 'removed' | 'added'
        position: {
          id: string
          symbol: string
          type: string
          volume: number
          openPrice: number
          currentPrice: number
          profit: number
          stopLoss?: number
          takeProfit?: number
          magic: number
          comment?: string
        }
        timestamp: number
      }) => {
        // V197: queueMicrotask to avoid React #310
        queueMicrotask(() => {
          const state = usePositionsStore.getState()

          // Only process for the active credential
          if (!state.activeCredentialId || update.credentialId !== state.activeCredentialId) return

          // For position additions/updates, trigger a positions refresh
          if (update.action === 'added' || update.action === 'removed') {
            // Debounced refresh — don't spam
            const now = Date.now()
            const lastRefresh = (state as any)._lastStreamRefresh || 0
            if (now - lastRefresh > 2000) {
              ;(state as any)._lastStreamRefresh = now
              // Trigger a soft refresh of positions
              if (state.fetchPositions) {
                state.fetchPositions()
              }
            }
          }
        })
      })

      // ─── Price Updates ───────────────────────────────
      socket.on('mt5:price', (update: {
        credentialId: string
        symbol: string
        bid: number
        ask: number
        equity: number
        margin: number
        freeMargin: number
        timestamp: number
      }) => {
        // V197: queueMicrotask to avoid React #310
        queueMicrotask(() => {
          const state = usePositionsStore.getState()

          // Update position prices for matching symbols
          if (state.activeCredentialId && update.credentialId === state.activeCredentialId) {
            const midPrice = (update.bid + update.ask) / 2
            // Use the existing updatePositionPrice for consistency
            // But only for positions belonging to this credential
            state.updatePositionPrice(update.symbol, midPrice)
          }
        })
      })

      // ─── Connection Status ───────────────────────────
      socket.on('mt5:status', (status: {
        credentialId: string
        connected: boolean
        connectedToBroker: boolean
        synchronized: boolean
        healthy: boolean
        message?: string
      }) => {
        // V197: queueMicrotask to avoid React #310
        queueMicrotask(() => {
          const state = usePositionsStore.getState()
          if (state.activeCredentialId && status.credentialId === state.activeCredentialId && state.account) {
            const account = { ...state.account }
            ;(account as any).mt5StreamHealthy = status.healthy
            ;(account as any).mt5StreamConnected = status.connected
            ;(account as any).mt5BrokerConnected = status.connectedToBroker
            usePositionsStore.setState({ account })
          }
        })
      })

      socket.on('disconnect', (reason) => {
        console.warn('[MT5 Stream] Disconnected:', reason)
      })

      socket.on('error', (err) => {
        console.error('[MT5 Stream] Error:', err)
      })

      socketRef.current = socket
    } catch (err) {
      console.error('[MT5 Stream] Connection failed:', err)
    }
  }, [])

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect()

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [connect])

  // Re-subscribe when activeCredentialId changes
  useEffect(() => {
    if (!socketRef.current?.connected || !activeCredentialId) return

    socketRef.current.emit('mt5:subscribe', { credentialId: activeCredentialId })
  }, [activeCredentialId])
}
