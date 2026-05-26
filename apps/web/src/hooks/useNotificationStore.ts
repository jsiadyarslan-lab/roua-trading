'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { useAuthStore } from '@/lib/auth-store'

/* ══════════════════════════════════════════════════════
   AudioContext Manager — Respects browser autoplay policy
   AudioContext is only created after user gesture (click/keydown)
   to prevent "AudioContext was not allowed to start" errors.
   
   NOTE: All browser APIs are lazily initialized to ensure
   SSR compatibility — no module-level side effects.
══════════════════════════════════════════════════════ */
let _audioCtx: AudioContext | null = null
let _audioResumed = false
let _audioListenersAttached = false

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!_audioCtx && _audioResumed) {
    try {
      _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    } catch {
      return null
    }
  }
  return _audioCtx
}

// Lazily attach AudioContext resume listeners on first user interaction.
// This avoids module-level side effects that break SSR.
function ensureAudioListeners() {
  if (typeof window === 'undefined' || _audioListenersAttached) return
  _audioListenersAttached = true

  const resumeAudio = () => {
    const ctx = getAudioContext()
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }
    _audioResumed = true
    // Re-attach listeners so that if Chrome suspends the context again
    // after a period of inactivity, the next interaction will resume it
    window.addEventListener('click', resumeAudio, { once: true })
    window.addEventListener('keydown', resumeAudio, { once: true })
    window.addEventListener('touchstart', resumeAudio, { once: true })
  }
  // Initial listeners — will re-attach after each resume
  window.addEventListener('click', resumeAudio, { once: true })
  window.addEventListener('keydown', resumeAudio, { once: true })
  window.addEventListener('touchstart', resumeAudio, { once: true })
}

// Attach listeners when module is loaded on the client
if (typeof window !== 'undefined') {
  // Use queueMicrotask to defer execution past SSR hydration
  queueMicrotask(ensureAudioListeners)
}

function playNotifSound(action: string) {
  const ctx = getAudioContext()
  if (!ctx) return

  // Try to resume if suspended (after user gesture)
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  gain.gain.value = 0.15
  osc.connect(gain)
  gain.connect(ctx.destination)

  if (action === 'BUY') {
    osc.frequency.value = 523.25
    osc.type = 'sine'
    osc.start()
    setTimeout(() => {
      osc.frequency.value = 659.25
      setTimeout(() => { osc.stop(); osc.disconnect(); gain.disconnect() }, 150)
    }, 150)
  } else if (action === 'SELL') {
    osc.frequency.value = 392
    osc.type = 'sine'
    osc.start()
    setTimeout(() => {
      osc.frequency.value = 329.63
      setTimeout(() => { osc.stop(); osc.disconnect(); gain.disconnect() }, 150)
    }, 150)
  } else {
    osc.frequency.value = 440
    osc.type = 'sine'
    osc.start()
    setTimeout(() => { osc.stop(); osc.disconnect(); gain.disconnect() }, 200)
  }
}

export type NotifSource = 'bot' | 'ai' | 'scanner' | 'trade' | 'system' | 'agent'
export type NotifPriority = 'urgent' | 'high' | 'medium' | 'low'
export type NotifAction = 'BUY' | 'SELL' | 'INFO' | 'WARN' | 'CLOSE' | 'CANCEL'

export interface Notification {
  id: string
  source: NotifSource
  priority: NotifPriority
  action: NotifAction
  title: string
  body: string
  pair?: string
  price?: number
  confidence?: number
  timestamp: number
  read: boolean
  /** i18n key — maps to notificationTypes.{notificationType}.title/body */
  notificationType?: string
  /** Parameters for i18n interpolation */
  params?: Record<string, string | number>
}

interface NotifSettings {
  enabled: boolean
  soundEnabled: boolean
  browserNotifications: boolean
  botAlerts: boolean
  aiAlerts: boolean
  scannerAlerts: boolean
  tradeAlerts: boolean
  minConfidence: number
  autoExecute: boolean
}

interface NotificationState {
  notifications: Notification[]
  settings: NotifSettings
  toasts: Notification[]     // ephemeral – not persisted
  addNotification: (n: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void
  markRead: (id: string) => void
  markAllRead: () => void
  dismiss: (id: string) => void
  clearAll: () => void
  dismissToast: (id: string) => void
  updateSettings: (s: Partial<NotifSettings>) => void
}

const DEFAULT_SETTINGS: NotifSettings = {
  enabled: true,
  soundEnabled: true,
  browserNotifications: true,
  botAlerts: true,
  aiAlerts: true,
  scannerAlerts: true,
  tradeAlerts: true,
  minConfidence: 60,
  autoExecute: false,
}

/**
 * SECURITY: Get a user-scoped localStorage key to prevent data leakage.
 * Without userId in the key, user B would see user A's notifications.
 *
 * FIX: Reads directly from localStorage cache first (roua_auth_user),
 * because useAuthStore may not be hydrated yet when Zustand persist
 * tries to rehydrate the notification store on page load.
 * This prevents the race condition where notifications disappear on refresh.
 */
function getStorageKey(): string {
  try {
    // Priority 1: Read from auth store (fast, but may not be hydrated yet)
    const user = useAuthStore.getState().user
    if (user?.id) return `roua-notifications:${user.id}`
  } catch { /* Auth store not yet initialized */ }

  try {
    // Priority 2: Read directly from localStorage cache (bypasses store hydration delay)
    const cachedRaw = localStorage.getItem('roua_auth_user')
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw)
      if (cached?.id) return `roua-notifications:${cached.id}`
    }
  } catch { /* Cache not available or invalid */ }

  try {
    let sessionId = sessionStorage.getItem('roua-guest-session-id')
    if (!sessionId) {
      sessionId = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      sessionStorage.setItem('roua-guest-session-id', sessionId)
    }
    return `roua-notifications:${sessionId}`
  } catch {
    return 'roua-notifications:guest'
  }
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      settings: DEFAULT_SETTINGS,
      toasts: [],

      addNotification: (n) => {
        const { settings, notifications } = get()
        if (!settings.enabled) return
        if (n.source === 'bot' && !settings.botAlerts) return
        if (n.source === 'ai' && !settings.aiAlerts) return
        if (n.source === 'scanner' && !settings.scannerAlerts) return
        if (n.source === 'trade' && !settings.tradeAlerts) return
        if (n.confidence !== undefined && n.confidence < settings.minConfidence) return

        // ── Deduplication: skip if same source + action + pair within last 10 minutes ──
        const DEDUP_WINDOW = 10 * 60 * 1000 // 10 minutes
        const isDuplicate = notifications.some(
          (existing) =>
            existing.source === n.source &&
            existing.action === n.action &&
            existing.pair === n.pair &&
            (Date.now() - existing.timestamp) < DEDUP_WINDOW
        )
        if (isDuplicate) return

        const notif: Notification = {
          ...n,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: Date.now(),
          read: false,
        }

        set((state) => ({
          notifications: [notif, ...state.notifications].slice(0, 100),
          toasts: [notif, ...state.toasts].slice(0, 10),
        }))

        // Play sound for urgent/high priority
        if (
          settings.soundEnabled &&
          (n.priority === 'urgent' || n.priority === 'high') &&
          typeof window !== 'undefined'
        ) {
          try {
            playNotifSound(n.action)
          } catch {
            // AudioContext not available — silent fallback
          }
        }

        // ── Fire native browser notification (appears outside app on mobile + desktop) ──
        if (
          settings.browserNotifications &&
          typeof window !== 'undefined' &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          try {
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
            const actionEmoji = n.action === 'BUY' ? '📈' : n.action === 'SELL' ? '📉' : n.action === 'WARN' ? '⚠️' : 'ℹ️'

            // Detect current locale for direction and language
            const currentPath = window.location.pathname
            const localeMatch = currentPath.match(/^\/(ar|en|fr|tr)\//)
            const currentLocale = localeMatch ? localeMatch[1] : 'ar'
            const isRtl = currentLocale === 'ar'

            const browserNotif = new Notification(`${actionEmoji} ${n.title}`, {
              body: n.body + (n.pair ? ` — ${n.pair}` : ''),
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              tag: notif.id,
              dir: isRtl ? 'rtl' : 'ltr',
              lang: currentLocale,
              vibrate: n.priority === 'urgent' ? [200, 100, 200] : [100],
              requireInteraction: n.priority === 'urgent' && !isMobile,
              silent: false,
              data: {
                source: n.source,
                action: n.action,
                pair: n.pair,
                price: n.price,
                url: n.pair
                  ? (isMobile ? `/mobile/chart?symbol=${n.pair}` : `/trading?symbol=${n.pair}`)
                  : (isMobile ? '/mobile' : '/dashboard'),
              },
            } as NotificationOptions)

            // Focus window and navigate on click
            browserNotif.onclick = () => {
              window.focus()
              const url = browserNotif.data?.url || '/dashboard'
              window.location.href = url
              browserNotif.close()
            }
          } catch {
            // Notification API not available — fallback silently
          }
        }
      },

      markRead: (id) => set((state) => ({
        notifications: state.notifications.map(n => n.id === id ? { ...n, read: true } : n)
      })),

      markAllRead: () => set((state) => ({
        notifications: state.notifications.map(n => ({ ...n, read: true }))
      })),

      dismiss: (id) => set((state) => ({
        notifications: state.notifications.filter(n => n.id !== id)
      })),

      clearAll: () => set({ notifications: [] }),

      dismissToast: (id) => set((state) => ({
        toasts: state.toasts.filter(n => n.id !== id)
      })),

      updateSettings: (s) => set((state) => ({
        settings: { ...state.settings, ...s }
      })),
    }),
    {
      name: 'roua-notifications', // Base name — actual key is resolved dynamically
      storage: (() => {
        const bs = createJSONStorage(() => localStorage)
        const baseStorage = bs as any
        return {
          getItem: (name: string): any => {
            const dynamicKey = getStorageKey()
            return baseStorage.getItem(dynamicKey)
          },
          setItem: (name: string, value: any) => {
            const dynamicKey = getStorageKey()
            baseStorage.setItem(dynamicKey, value as string)
          },
          removeItem: (name: string) => {
            const dynamicKey = getStorageKey()
            baseStorage.removeItem(dynamicKey)
          },
        }
      })(),
      version: 4,
      migrate: (persistedState: any) => {
        // V4 migration: Clear notifications that lack notificationType (Arabic-only text)
        // These old notifications cannot be translated and will show in Arabic forever.
        // Better to clear them so only new i18n-aware notifications remain.
        const rawNotifs = Array.isArray(persistedState?.notifications) ? persistedState.notifications : []
        const migratedNotifs = rawNotifs
          .slice(0, 50)
          .filter((n: any) => n.notificationType) // Keep only i18n-aware notifications
          .map((n: any) => ({
            ...n,
            // Ensure params is always an object
            params: n.params && typeof n.params === 'object' ? n.params : {},
          }))

        return {
          notifications: migratedNotifs,
          settings: {
            ...DEFAULT_SETTINGS,
            ...(persistedState?.settings ?? {}),
            minConfidence: typeof persistedState?.settings?.minConfidence === 'number'
                ? persistedState.settings.minConfidence
                : DEFAULT_SETTINGS.minConfidence,
            browserNotifications: typeof persistedState?.settings?.browserNotifications === 'boolean'
                ? persistedState.settings.browserNotifications
                : DEFAULT_SETTINGS.browserNotifications,
            autoExecute: typeof persistedState?.settings?.autoExecute === 'boolean'
                ? persistedState.settings.autoExecute
                : DEFAULT_SETTINGS.autoExecute,
          },
        }
      },
      partialize: (state) => ({
        notifications: state.notifications.slice(0, 50),
        settings: state.settings,
      }),
    }
  )
)

/**
 * FIX: Re-hydrate notification store when auth state changes.
 *
 * Problem: On page load, Zustand persist hydrates before the auth store is ready.
 * Even with the localStorage cache fallback, there's a brief window where
 * notifications may be loaded under the wrong key.
 *
 * Solution: Listen for auth store changes and re-hydrate from the correct
 * user-scoped key when the user ID becomes available or changes.
 */
let _lastKnownUserId: string | null = null

if (typeof window !== 'undefined') {
  // Subscribe to auth store changes
  useAuthStore.subscribe((state) => {
    const currentUserId = state.user?.id || null

    // Only re-hydrate when user ID actually changes (not on every auth state update)
    if (currentUserId !== _lastKnownUserId) {
      _lastKnownUserId = currentUserId

      if (currentUserId) {
        // User just logged in or auth store just hydrated — re-hydrate notifications
        try {
          const correctKey = `roua-notifications:${currentUserId}`
          const raw = localStorage.getItem(correctKey)
          if (raw) {
            const parsed = JSON.parse(raw)
            if (parsed?.state?.notifications) {
              const migrated = {
                notifications: Array.isArray(parsed.state.notifications)
                  ? parsed.state.notifications.slice(0, 50)
                  : [],
                settings: {
                  ...DEFAULT_SETTINGS,
                  ...(parsed.state.settings ?? {}),
                },
              }
              useNotificationStore.setState({
                notifications: migrated.notifications,
                settings: migrated.settings,
              })
            }
          } else {
            // No saved notifications for this user — clear any guest notifications
            const currentNotifs = useNotificationStore.getState().notifications
            if (currentNotifs.length > 0) {
              useNotificationStore.setState({ notifications: [] })
            }
          }
        } catch {
          // Re-hydration failed — keep current state
        }
      }
    }
  })

  // Also set initial userId from cache on first load
  try {
    const cachedRaw = localStorage.getItem('roua_auth_user')
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw)
      if (cached?.id) _lastKnownUserId = cached.id
    }
  } catch { /* ignore */ }
}
