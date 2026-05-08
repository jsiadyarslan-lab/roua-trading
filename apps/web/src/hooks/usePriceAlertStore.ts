import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AlertCondition = 'above' | 'below' | 'change_up' | 'change_down'

export interface PriceAlert {
  id: string
  symbol: string
  condition: AlertCondition
  targetPrice: number
  triggered: boolean
  triggeredAt?: number
  createdAt: number
  note?: string
}

interface PriceAlertStore {
  alerts: PriceAlert[]
  addAlert: (a: Omit<PriceAlert, 'id' | 'createdAt' | 'triggered'>) => void
  removeAlert: (id: string) => void
  triggerAlert: (id: string) => void
  clearTriggered: () => void
  resetAlert: (id: string) => void
}

const DEFAULT_ALERTS: PriceAlert[] = []

function isValidCondition(condition: any): condition is AlertCondition {
  return condition === 'above' || condition === 'below' || condition === 'change_up' || condition === 'change_down'
}

function normalizeAlert(alert: any): PriceAlert | null {
  if (!alert || typeof alert !== 'object') return null
  const symbol = typeof alert.symbol === 'string' ? alert.symbol.trim().toUpperCase() : ''
  const condition = isValidCondition(alert.condition) ? alert.condition : null
  const targetPrice = Number(alert.targetPrice)

  if (!symbol || !condition || !Number.isFinite(targetPrice)) return null

  return {
    id: typeof alert.id === 'string' && alert.id ? alert.id : `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    symbol,
    condition,
    targetPrice,
    triggered: Boolean(alert.triggered),
    triggeredAt: typeof alert.triggeredAt === 'number' ? alert.triggeredAt : undefined,
    createdAt: typeof alert.createdAt === 'number' ? alert.createdAt : Date.now(),
    note: typeof alert.note === 'string' && alert.note.trim() ? alert.note : undefined,
  }
}

export const usePriceAlertStore = create<PriceAlertStore>()(
  persist(
    (set) => ({
      alerts: DEFAULT_ALERTS,

      addAlert: (a) =>
        set((state) => ({
          alerts: [
            ...state.alerts,
            {
              ...a,
              symbol: a.symbol.trim().toUpperCase(),
              targetPrice: Number(a.targetPrice),
              id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              createdAt: Date.now(),
              triggered: false,
            },
          ],
        })),

      removeAlert: (id) =>
        set((state) => ({ alerts: state.alerts.filter((a) => a.id !== id) })),

      triggerAlert: (id) =>
        set((state) => ({
          alerts: state.alerts.map((a) =>
            a.id === id ? { ...a, triggered: true, triggeredAt: Date.now() } : a
          ),
        })),

      clearTriggered: () =>
        set((state) => ({ alerts: state.alerts.filter((a) => !a.triggered) })),

      resetAlert: (id) =>
        set((state) => ({
          alerts: state.alerts.map((a) =>
            a.id === id ? { ...a, triggered: false, triggeredAt: undefined } : a
          ),
        })),
    }),
    {
      name: 'roua-price-alerts', // Base name — actual key resolved dynamically per user
      version: 2,
      storage: (() => {
        const getDynamicKey = (baseName: string): string => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { useAuthStore } = require('@/lib/auth-store')
            const user = useAuthStore.getState()?.user
            if (user?.id) return `${baseName}:${user.id}`
          } catch { /* Auth store not ready */ }
          try {
            let sid = sessionStorage.getItem('roua-guest-session-id')
            if (!sid) {
              sid = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
              sessionStorage.setItem('roua-guest-session-id', sid)
            }
            return `${baseName}:${sid}`
          } catch { return baseName }
        }
        return {
          getItem: (name: string) => {
            try { return localStorage.getItem(getDynamicKey(name)) } catch { return null }
          },
          setItem: (name: string, value: string) => {
            try { localStorage.setItem(getDynamicKey(name), value) } catch { /**/ }
          },
          removeItem: (name: string) => {
            try { localStorage.removeItem(getDynamicKey(name)) } catch { /**/ }
          },
        }
      })(),
      migrate: (persistedState: any) => ({
        alerts: Array.isArray(persistedState?.alerts)
          ? persistedState.alerts.map(normalizeAlert).filter(Boolean)
          : DEFAULT_ALERTS,
      }),
      partialize: (state) => ({
        alerts: state.alerts.map(normalizeAlert).filter(Boolean) as PriceAlert[],
      }),
    }
  )
)
