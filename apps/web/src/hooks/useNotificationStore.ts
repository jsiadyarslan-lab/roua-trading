import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type NotifSource = 'bot' | 'ai' | 'scanner' | 'trade' | 'system'
export type NotifPriority = 'urgent' | 'high' | 'medium' | 'low'
export type NotifAction = 'BUY' | 'SELL' | 'INFO' | 'WARN' | 'CLOSE'

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
}

interface NotifSettings {
  enabled: boolean
  soundEnabled: boolean
  botAlerts: boolean
  aiAlerts: boolean
  scannerAlerts: boolean
  tradeAlerts: boolean
  minConfidence: number
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

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      settings: {
        enabled: true,
        soundEnabled: true,
        botAlerts: true,
        aiAlerts: true,
        scannerAlerts: true,
        tradeAlerts: true,
        minConfidence: 60,
      },
      toasts: [],

      addNotification: (n) => {
        const { settings } = get()
        if (!settings.enabled) return
        if (n.source === 'bot' && !settings.botAlerts) return
        if (n.source === 'ai' && !settings.aiAlerts) return
        if (n.source === 'scanner' && !settings.scannerAlerts) return
        if (n.source === 'trade' && !settings.tradeAlerts) return
        if (n.confidence !== undefined && n.confidence < settings.minConfidence) return

        const notif: Notification = {
          ...n,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: Date.now(),
          read: false,
        }

        set((state) => ({
          notifications: [notif, ...state.notifications].slice(0, 100),
          toasts: [notif, ...state.toasts].slice(0, 5),
        }))

        // Play sound for urgent/high priority
        if (
          settings.soundEnabled && 
          (n.priority === 'urgent' || n.priority === 'high') &&
          typeof navigator !== 'undefined' && 
          // @ts-ignore
          (navigator.userActivation?.hasBeenActive ?? true)
        ) {
          try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.frequency.value = n.action === 'BUY' ? 880 : n.action === 'SELL' ? 660 : 440
            osc.type = 'sine'
            gain.gain.setValueAtTime(0.15, ctx.currentTime)
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
            osc.start()
            osc.stop(ctx.currentTime + 0.4)
          } catch {}
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
      name: 'roua-notifications',
      partialize: (state) => ({
        notifications: state.notifications.slice(0, 50),
        settings: state.settings,
      }),
    }
  )
)
