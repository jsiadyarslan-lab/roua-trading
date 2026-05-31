// ═══════════════════════════════════════════════════════════
// ROUA Trading — Chart State Persistence Store
// Zustand store with persist middleware for chart state.
// Local-first: saves to localStorage immediately, syncs to
// server API in the background (debounced).
//
// DATA ISOLATION: Uses dynamic localStorage key with userId
// to prevent data leakage between users on shared browsers.
// ═══════════════════════════════════════════════════════════

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ChartType, ChartSettings, ActiveIndicator, Drawing, DrawingTool } from '@/lib/charts/types'

// ── Serialized Indicator (config only, no computed data) ──

export interface SerializedIndicator {
  key: string;                         // 'sma' | 'rsi' | 'macd' | ...
  params: Record<string, number>;      // { period: 20, stdDev: 2 }
  color: string;                       // User-chosen color
  opacity: number;                     // User-chosen opacity
  visible: boolean;                    // Visibility toggle
}

// ── Per-Symbol-Timeframe Config ──

export interface ChartConfig {
  chartType: ChartType;
  settings: ChartSettings;
  indicators: SerializedIndicator[];
  drawings: Drawing[];                 // Serialized drawings (trend lines, fibs, etc.)
  visibleRange: { from: number; to: number } | null;
  activeTool: DrawingTool;
  lastSaved: number;                   // Timestamp for conflict resolution
}

// ── SmartGrid Config ──

export interface SmartGridCellConfig {
  id: string;
  symbol: string;
  timeframe: string;
  chartType: 'candle' | 'line' | 'area';
}

export interface SmartGridPersistConfig {
  activeLayout: string;                // '2x2' | '3x1' | '1x3' | '3x2' etc.
  cells: SmartGridCellConfig[];
}

// ── Store State ──

interface ChartStateStore {
  // Per-symbol-timeframe chart configuration
  // Key format: "BTC/USD:15min"
  configs: Record<string, ChartConfig>;

  // Last selected symbol + timeframe (global, not per-symbol)
  lastSymbol: string;
  lastTimeframe: string;

  // SmartGrid configuration
  smartGrid: SmartGridPersistConfig | null;

  // ── Actions ──

  /** Save chart config for a specific symbol+timeframe combination */
  saveChartConfig: (symbol: string, timeframe: string, config: Partial<ChartConfig>) => void;

  /** Get chart config for a specific symbol+timeframe combination */
  getChartConfig: (symbol: string, timeframe: string) => ChartConfig | null;

  /** Save the last selected symbol and timeframe */
  saveLastSymbolTimeframe: (symbol: string, timeframe: string) => void;

  /** Save SmartGrid layout configuration */
  saveSmartGridConfig: (config: SmartGridPersistConfig) => void;

  /** Clear all chart state (used on logout) */
  clearAllData: () => void;
}

// ── Dynamic Storage Key (User Isolation) ──

/**
 * Get a user-isolated localStorage key for chart state.
 * Uses userId from auth store if available, falls back to
 * localStorage cache for rehydration before auth loads.
 *
 * This prevents user A from seeing user B's chart data on
 * shared browsers (libraries, offices, kiosks).
 */
function getStorageKey(): string {
  // Priority 1: Read from auth store (most reliable)
  try {
    const { useAuthStore } = require('@/lib/auth-store')
    const user = useAuthStore.getState()?.user
    if (user?.id) return `roua-chart-state:${user.id}`
  } catch { /* Auth store not loaded yet */ }

  // Priority 2: Read from localStorage cache (available before Zustand hydrates)
  try {
    const cachedRaw = localStorage.getItem('roua_auth_user')
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw)
      if (cached?.id) return `roua-chart-state:${cached.id}`
    }
  } catch { /* Cache unavailable */ }

  // Priority 3: Guest/fallback
  return 'roua-chart-state:guest'
}

// ── Custom Storage with Dynamic Key ──

const dynamicStorage = {
  getItem: (name: string): string | null => {
    try {
      const key = getStorageKey()
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      const key = getStorageKey()
      localStorage.setItem(key, value)
    } catch {
      // localStorage full or unavailable
    }
  },
  removeItem: (name: string): void => {
    try {
      const key = getStorageKey()
      localStorage.removeItem(key)
    } catch { /* ignore */ }
  },
}

// ── Helper: Config Key ──

function configKey(symbol: string, timeframe: string): string {
  return `${symbol}:${timeframe}`
}

// ── Store Creation ──

export const useChartStateStore = create<ChartStateStore>()(
  persist(
    (set, get) => ({
      configs: {},
      lastSymbol: 'BTC/USD',
      lastTimeframe: '15min',
      smartGrid: null,

      saveChartConfig: (symbol, timeframe, config) => {
        set(state => ({
          configs: {
            ...state.configs,
            [configKey(symbol, timeframe)]: {
              ...(state.configs[configKey(symbol, timeframe)] || {}),
              ...config,
              lastSaved: Date.now(),
            },
          },
        }))
      },

      getChartConfig: (symbol, timeframe) => {
        return get().configs[configKey(symbol, timeframe)] ?? null
      },

      saveLastSymbolTimeframe: (symbol, timeframe) => {
        set({ lastSymbol: symbol, lastTimeframe: timeframe })
      },

      saveSmartGridConfig: (config) => {
        set({ smartGrid: config })
      },

      clearAllData: () => {
        set({
          configs: {},
          lastSymbol: 'BTC/USD',
          lastTimeframe: '15min',
          smartGrid: null,
        })
      },
    }),
    {
      name: 'roua-chart-state', // Base name — actual key includes userId
      storage: createJSONStorage(() => dynamicStorage),
      // Only persist these fields
      partialize: (state) => ({
        configs: state.configs,
        lastSymbol: state.lastSymbol,
        lastTimeframe: state.lastTimeframe,
        smartGrid: state.smartGrid,
      }),
      version: 1,
    }
  )
)
