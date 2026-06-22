'use client'

import { useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { useAuthStore } from '@/lib/auth-store'
import { usePositionsStore } from '@/hooks/usePositionsStore'

/**
 * useNotificationSocket — Real-time Notification Receiver
 *
 * FIX: Added 'balance_update' and 'trade_executed' event handlers.
 * When the backend pushes a balance update (after automated trade execution),
 * the frontend now calls refreshAfterTrade() to update positions + account.
 *
 * Also: Removed the hard NEXT_PUBLIC_WS_ENABLED check. Now attempts to connect
 * if NEXT_PUBLIC_WS_URL is set, and falls back gracefully if connection fails.
 */
export function useNotificationSocket() {
  const socketRef = useRef<Socket | null>(null)
  const addNotification = useNotificationStore(state => state.addNotification)
  const user = useAuthStore(state => state.user)
  const reconnectAttemptRef = useRef(0)
  const autoExecuteHandlerRef = useRef<((data: any) => void) | null>(null)

  // Register auto-execute handler (called from UI components)
  const registerAutoExecuteHandler = useCallback((handler: (data: any) => void) => {
    autoExecuteHandlerRef.current = handler
  }, [])

  useEffect(() => {
    // Don't connect if no user
    if (!user?.id) return

    // Get session token for auth
    const getSessionToken = () => {
      if (typeof document === 'undefined') return null
      const match = document.cookie.match(/roua_session=([^;]+)/)
      return match ? match[1] : null
    }

    const token = getSessionToken()
    if (!token) return

    // FIX: Connect if WS URL is configured (removed strict NEXT_PUBLIC_WS_ENABLED check)
    // The old check prevented ALL WebSocket connections even when the backend was ready.
    // Now we attempt connection and fall back gracefully on failure.
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || ''
    if (!wsUrl) return

    // If WS is explicitly disabled, respect that
    if (process.env.NEXT_PUBLIC_WS_ENABLED === 'false') return

    try {
      const socket = io(`${wsUrl}/notifications`, {
        auth: { token },
        path: '/api/socket', // V399: Custom path (no dots) — Next.js was 404ing /socket.io/
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 30000,
        timeout: 10000,
      })

      socketRef.current = socket

      // ── Connection Events ──
      socket.on('connect', () => {
        reconnectAttemptRef.current = 0
      })

      socket.on('disconnect', () => {
        // Will auto-reconnect
      })

      socket.on('connect_error', () => {
        reconnectAttemptRef.current++
        // After 5 failed attempts, stop trying (polling will handle it)
        if (reconnectAttemptRef.current >= 5) {
          socket.disconnect()
        }
      })

      // ── Notification Event ──
      socket.on('notification', (data: {
        id: string
        type: string
        priority: string
        title: string
        body: string
        data: Record<string, any>
        source: string
        action: string
        pair?: string
        timestamp: string
        isRead: boolean
      }) => {
        const priorityMap: Record<string, 'urgent' | 'high' | 'medium' | 'low'> = {
          URGENT: 'urgent',
          HIGH: 'high',
          MEDIUM: 'medium',
          LOW: 'low',
        }

        // Resolve notificationType: prefer explicit value, fallback to converting type field
        const socketTypeToNotifType: Record<string, string> = {
          SIGNAL_GENERATED: 'signalGenerated',
          ORDER_FILLED: 'orderFilled',
          ORDER_REJECTED: 'orderRejected',
          ORDER_ACCEPTED: 'orderFilled',
          POSITION_OPENED: 'positionOpened',
          POSITION_CLOSED: 'positionClosed',
          RISK_WARNING: 'riskWarning',
          PRICE_ALERT: 'priceAlert',
          AI_INSIGHT: 'aiAnalysis',
          SYSTEM: 'systemUpdate',
        }

        addNotification({
          source: (data.source || 'system') as any,
          priority: priorityMap[data.priority] || 'medium',
          action: (data.action || 'INFO') as any,
          title: data.title,
          body: data.body,
          pair: data.pair,
          price: data.data?.averagePrice || data.data?.entryPrice || data.data?.price,
          confidence: data.data?.confidence,
          // i18n data for frontend translation — always set notificationType
          notificationType: data.data?.notificationType || socketTypeToNotifType[data.type] || undefined,
          params: data.data?.params || {},
        })

        // FIX: If the notification is about a trade execution, refresh positions + balance
        const isTradeNotification = data.type === 'ORDER_FILLED' ||
          data.type === 'POSITION_OPENED' ||
          data.type === 'POSITION_CLOSED' ||
          data.action === 'BUY' || data.action === 'SELL'
        if (isTradeNotification) {
          // FIX: For POSITION_CLOSED, immediately remove the position from cache
          // so the user sees it disappear right away — no need to click "Close All".
          // The positionId is sent in data.data.positionId by the Smart Executor.
          if (data.type === 'POSITION_CLOSED') {
            const positionId = data.data?.positionId
            if (positionId) {
              usePositionsStore.getState().removePosition(positionId)
            }
          }
          usePositionsStore.getState().refreshAfterTrade()
        }
      })

      // ── FIX: Balance Update Event ──
      // Backend pushes this after automated trade execution
      socket.on('balance_update', () => {
        usePositionsStore.getState().refreshAfterTrade()
      })

      // ── FIX: Trade Executed Event ──
      // Backend pushes this after Smart Executor or Agent executes a trade
      socket.on('trade_executed', () => {
        usePositionsStore.getState().refreshAfterTrade()
      })

      // ── Auto-Execute Signal Event ──
      socket.on('auto_execute_signal', (data: {
        notificationId: string
        signalId: string
        pair: string
        action: string
        confidence: number
        entryPrice?: number
        stopLoss?: number
        takeProfit?: number
        maxPositionSizePercent?: number
      }) => {
        if (autoExecuteHandlerRef.current) {
          autoExecuteHandlerRef.current(data)
        }
      })

      // ── Unread Count Event ──
      socket.on('unread_count', () => {
        // Badge count handled by notification store
      })

      // ── Error Event ──
      socket.on('error', (data: { message: string }) => {
        if (data.message.includes('Authentication') || data.message.includes('Session')) {
          socket.disconnect()
        }
      })
    } catch {
      // Socket.IO not available — polling fallback handles notifications
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [user?.id, addNotification])

  return {
    registerAutoExecuteHandler,
    isConnected: socketRef.current?.connected ?? false,
  }
}
