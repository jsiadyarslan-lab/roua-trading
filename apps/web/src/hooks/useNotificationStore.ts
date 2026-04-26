import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/* ══════════════════════════════════════════════════════
   AudioContext Manager — Respects browser autoplay policy
   AudioContext is only created after user gesture (click/keydown)
   to prevent "AudioContext was not allowed to start" errors.
══════════════════════════════════════════════════════ */
let _audioCtx: AudioContext | null = null
let _audioResumed = false

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!_audioCtx) {
    try {
      _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    } catch {
      return null
    }
  }
  return _audioCtx
}

// Resume AudioContext on user interaction
// Re-attach listeners after each resume to handle Chrome's
// auto-suspend policy (AudioContext suspends after inactivity)
if (typeof window !== 'undefined') {
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

const DEFAULT_SETTINGS: NotifSettings = {
  enabled: true,
  soundEnabled: true,
  botAlerts: true,
  aiAlerts: true,
  scannerAlerts: true,
  tradeAlerts: true,
  minConfidence: 45,
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      settings: DEFAULT_SETTINGS,
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
      version: 2,
      migrate: (persistedState: any) => ({
        notifications: Array.isArray(persistedState?.notifications) ? persistedState.notifications.slice(0, 50) : [],
        settings: {
          ...DEFAULT_SETTINGS,
          ...(persistedState?.settings ?? {}),
          minConfidence: typeof persistedState?.settings?.minConfidence === 'number'
              ? persistedState.settings.minConfidence
              : DEFAULT_SETTINGS.minConfidence,
        },
      }),
      partialize: (state) => ({
        notifications: state.notifications.slice(0, 50),
        settings: state.settings,
      }),
    }
  )
)
