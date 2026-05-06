'use client'

import { useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { useAuthStore } from '@/lib/auth-store'

/**
 * useNotificationSocket — Real-time Notification Receiver
 *
 * Connects to the NestJS Notification Gateway (`/notifications` namespace)
 * and receives instant push notifications via Socket.IO.
 *
 * Architecture:
 * - Connects to `/notifications` namespace with session token auth
 * - Listens for `notification` events (new notifications)
 * - Listens for `auto_execute_signal` events (auto-execution triggers)
 * - Listens for `unread_count` events (on reconnect)
 * - Falls back gracefully if Socket.IO is unavailable
 *   (polling still works via NotificationEngine)
 *
 * UX Improvements:
 * - Instant notification delivery (no 60s polling delay)
 * - Real-time order fill/reject notifications
 * - Auto-execute signal support
 * - Unread count badge updates immediately
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

    // Determine Socket.IO URL
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || (typeof window !== 'undefined' ? window.location.origin : '')

    try {
      const socket = io(`${wsUrl}/notifications`, {
        auth: { token },
        transports: ['polling', 'websocket'],  // polling first — Next.js rewrites can't proxy WS upgrade requests
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        timeout: 10000,
      })

      socketRef.current = socket

      // ── Connection Events ──
      socket.on('connect', () => {
        reconnectAttemptRef.current = 0
      })

      socket.on('disconnect', (reason) => {
        // Server disconnected us — will auto-reconnect
      })

      socket.on('connect_error', (error) => {
        reconnectAttemptRef.current++
        // After 3 failed attempts, stop trying (polling will handle it)
        if (reconnectAttemptRef.current >= 3) {
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
        // Map backend priority to frontend priority
        const priorityMap: Record<string, 'urgent' | 'high' | 'medium' | 'low'> = {
          URGENT: 'urgent',
          HIGH: 'high',
          MEDIUM: 'medium',
          LOW: 'low',
        }

        // Push to notification store — triggers toast + sound + browser notification
        addNotification({
          source: (data.source || 'system') as any,
          priority: priorityMap[data.priority] || 'medium',
          action: (data.action || 'INFO') as any,
          title: data.title,
          body: data.body,
          pair: data.pair,
          price: data.data?.averagePrice || data.data?.entryPrice || data.data?.price,
          confidence: data.data?.confidence,
        })
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
        // Delegate to registered handler (from UI component)
        if (autoExecuteHandlerRef.current) {
          autoExecuteHandlerRef.current(data)
        }
      })

      // ── Unread Count Event ──
      socket.on('unread_count', (data: { count: number }) => {
        // Could update a badge count — for now, notification store handles it
      })

      // ── Error Event ──
      socket.on('error', (data: { message: string }) => {
        // Auth error — disconnect
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
