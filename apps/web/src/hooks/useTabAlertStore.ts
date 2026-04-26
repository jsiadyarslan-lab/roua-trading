import { create } from 'zustand'

/**
 * Tab Alert Store — Tracks unread alert counts and latest alert info per sidebar tab.
 *
 * Each sidebar tab (bot, council, scanner, multi-tf, signals) can push alerts.
 * The tab buttons display a pulsing badge with the count when there are unread alerts.
 * Clicking a tab clears its alerts (mark as read).
 */

export type TabId = 'bot' | 'council' | 'scanner' | 'multi-tf' | 'signals'

export interface TabAlert {
  count: number
  lastAction: 'BUY' | 'SELL' | 'HOLD' | 'INFO' | 'WARN' | 'SIGNAL' | 'ALIGNMENT'
  lastLabel: string   // short Arabic label like "شراء BTC" or "إجماع 85%"
  lastTime: number    // timestamp
  color: string       // the accent color to flash
}

interface TabAlertState {
  alerts: Record<TabId, TabAlert | null>
  pushAlert: (tab: TabId, info: { action: TabAlert['lastAction']; label: string; color?: string }) => void
  clearAlert: (tab: TabId) => void
  clearAll: () => void
  getCount: (tab: TabId) => number
  hasAlert: (tab: TabId) => boolean
}

const DEFAULT_COLORS: Record<TabId, string> = {
  'bot':      '#00E5FF',
  'council':  '#B388FF',
  'scanner':  '#FFB800',
  'multi-tf': '#B388FF',
  'signals':  '#00C853',
}

export const useTabAlertStore = create<TabAlertState>()((set, get) => ({
  alerts: {
    'bot': null,
    'council': null,
    'scanner': null,
    'multi-tf': null,
    'signals': null,
  },

  pushAlert: (tab, info) => set((state) => {
    const existing = state.alerts[tab]
    return {
      alerts: {
        ...state.alerts,
        [tab]: {
          count: (existing?.count || 0) + 1,
          lastAction: info.action,
          lastLabel: info.label,
          lastTime: Date.now(),
          color: info.color || DEFAULT_COLORS[tab],
        },
      },
    }
  }),

  clearAlert: (tab) => set((state) => ({
    alerts: { ...state.alerts, [tab]: null }
  })),

  clearAll: () => set({
    alerts: { 'bot': null, 'council': null, 'scanner': null, 'multi-tf': null, 'signals': null }
  }),

  getCount: (tab) => get().alerts[tab]?.count || 0,

  hasAlert: (tab) => {
    const alert = get().alerts[tab]
    return alert !== null && alert.count > 0
  },
}))
