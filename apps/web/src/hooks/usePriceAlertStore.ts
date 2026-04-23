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

export const usePriceAlertStore = create<PriceAlertStore>()(
  persist(
    (set) => ({
      alerts: [],

      addAlert: (a) =>
        set((state) => ({
          alerts: [
            ...state.alerts,
            {
              ...a,
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
    { name: 'roua-price-alerts' }
  )
)
