'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── Types matching backend ──
export enum AgentStatus {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  STOPPED = 'STOPPED',
  EMERGENCY_STOP = 'EMERGENCY_STOP',
  DAILY_LIMIT_REACHED = 'DAILY_LIMIT_REACHED',
}

export enum StrategyType {
  SCALPING = 'SCALPING',
  SWING = 'SWING',
  GRID = 'GRID',
}

export interface StrategyParams {
  scalpingTimeframe?: string
  scalpingTakeProfitPips?: number
  scalpingStopLossPips?: number
  scalpingMaxSpread?: number
  swingTimeframe?: string
  swingHoldingPeriodHours?: number
  swingTrendLookback?: number
  gridLevels?: number
  gridSpacingPercent?: number
  gridQuantityPerLevel?: number
  gridUpperBound?: number
  gridLowerBound?: number
}

export interface AgentConfig {
  userId: string
  strategy: StrategyType
  enabled: boolean
  maxPositionSizePercent: number
  maxDailyLossPercent: number
  maxOpenPositions: number
  riskPerTradePercent: number
  strategyParams: StrategyParams
  symbols: string[]
  credentialId: string
  createdAt: string
  updatedAt: string
}

export interface AgentState {
  status: AgentStatus
  config: AgentConfig
  startedAt?: string
  lastCycleAt?: string
  lastSignalAt?: string
  dailyPnL: number
  dailyTradesCount: number
  dailyResetAt?: string
  consecutiveLosses: number
  totalCycles: number
  lastError?: string
}

export interface PerformanceMetrics {
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  totalPnL: number
  averageWin: number
  averageLoss: number
  profitFactor: number
  maxDrawdown: number
  maxDrawdownPercent: number
  sharpeRatio: number
  averageHoldingTime: number
  bestTrade: number
  worstTrade: number
  consecutiveWins: number
  consecutiveLosses: number
  startDate: string
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ALL_TIME'
}

export interface AgentPosition {
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  quantity: number
  entryPrice: number
  currentPrice?: number
  unrealizedPnl: number
  stopLoss?: number
  takeProfit?: number
  strategy: StrategyType
  riskScore: number
  confidence: number
  reasoning: string
  openedAt: string
}

export interface AgentLog {
  time: string
  msg: string
  type: 'info' | 'success' | 'warning' | 'error' | 'trade'
}

// ── Store ──
interface AgentStore {
  // State
  agentState: AgentState | null
  performance: PerformanceMetrics | null
  positions: AgentPosition[]
  logs: AgentLog[]
  loading: boolean
  error: string | null
  isConfigured: boolean
  selectedCredentialId: string
  selectedSymbols: string[]

  // Actions
  setAgentState: (state: AgentState | null) => void
  setPerformance: (metrics: PerformanceMetrics | null) => void
  setPositions: (positions: AgentPosition[]) => void
  addLog: (msg: string, type?: AgentLog['type']) => void
  clearLogs: () => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setSelectedCredentialId: (id: string) => void
  setSelectedSymbols: (symbols: string[]) => void

  // API Actions
  fetchStatus: () => Promise<void>
  startAgent: (strategy: StrategyType) => Promise<void>
  stopAgent: (emergency?: boolean) => Promise<void>
  changeStrategy: (strategy: StrategyType, params?: StrategyParams) => Promise<void>
  updateRiskParams: (params: {
    maxPositionSizePercent?: number
    maxDailyLossPercent?: number
    maxOpenPositions?: number
    riskPerTradePercent?: number
  }) => Promise<void>
  fetchPerformance: () => Promise<void>
  fetchPositions: () => Promise<void>

  // Auto-refresh
  startAutoRefresh: () => void
  stopAutoRefresh: () => void
}

const DEFAULT_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT']

let _refreshInterval: ReturnType<typeof setInterval> | null = null

export const useAgentStore = create<AgentStore>()(
  persist(
    (set, get) => ({
      agentState: null,
      performance: null,
      positions: [],
      logs: [],
      loading: false,
      error: null,
      isConfigured: false,
      selectedCredentialId: '',
      selectedSymbols: DEFAULT_SYMBOLS,

      setAgentState: (agentState) => set({ agentState }),
      setPerformance: (performance) => set({ performance }),
      setPositions: (positions) => set({ positions }),
      addLog: (msg, type = 'info') => set((state) => ({
        logs: [{ time: new Date().toLocaleTimeString('ar-EG'), msg, type }, ...state.logs].slice(0, 100),
      })),
      clearLogs: () => set({ logs: [] }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),
      setSelectedCredentialId: (id) => set({ selectedCredentialId: id }),
      setSelectedSymbols: (symbols) => set({ selectedSymbols: symbols }),

      // ── API Actions ──
      fetchStatus: async () => {
        try {
          const res = await fetch('/api/agent/trader/status')
          const data = await res.json()
          if (data.success && data.data) {
            set({ agentState: data.data, error: null })
          } else {
            set({ agentState: null })
          }
        } catch {
          set({ agentState: null })
        }
      },

      startAgent: async (strategy) => {
        const { selectedCredentialId, selectedSymbols } = get()

        // Validate credential before making API call
        if (!selectedCredentialId || selectedCredentialId.trim() === '') {
          const errorMsg = 'يرجى ربط مفتاح API أولاً من إعدادات المحفظة'
          set({ error: errorMsg, loading: false })
          get().addLog(`❌ ${errorMsg}`, 'error')
          return
        }

        set({ loading: true, error: null })
        get().addLog(`جارٍ تفعيل الوكيل باستراتيجية ${strategy === StrategyType.SCALPING ? 'السكالبينغ' : strategy === StrategyType.SWING ? 'السوينغ' : 'الشبكة'}...`, 'info')
        try {
          const res = await fetch('/api/agent/trader/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              strategy,
              credentialId: selectedCredentialId,
              symbols: selectedSymbols,
            }),
          })
          const data = await res.json()
          if (data.success) {
            set({ agentState: data.data, loading: false, isConfigured: true })
            get().addLog('✅ تم تفعيل وكيل التداول بنجاح', 'success')
          } else {
            // Map common backend error messages to user-friendly Arabic
            let msg = data.message || 'فشل التفعيل'
            if (msg.includes('credentialId') || msg.includes('should not be empty')) {
              msg = 'يرجى ربط مفتاح API أولاً من إعدادات المحفظة'
            } else if (msg.includes('not valid') || msg.includes('غير صالحة')) {
              msg = 'مفتاح API غير صالح أو منتهي الصلاحية — تحقق من إعدادات المحفظة'
            }
            set({ error: msg, loading: false })
            get().addLog(`❌ فشل التفعيل: ${msg}`, 'error')
          }
        } catch (e: any) {
          set({ error: e.message, loading: false })
          get().addLog(`❌ خطأ في الاتصال: ${e.message}`, 'error')
        }
      },

      stopAgent: async (emergency = false) => {
        set({ loading: true, error: null })
        get().addLog(emergency ? '🚨 إيقاف طارئ...' : '⏹ إيقاف الوكيل...', emergency ? 'warning' : 'info')
        try {
          const res = await fetch('/api/agent/trader/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emergency }),
          })
          const data = await res.json()
          if (data.success) {
            set({ agentState: data.data, loading: false })
            get().addLog(emergency ? '🚨 تم الإيقاف الطارئ — أُغلقت جميع المراكز' : '⏹ تم إيقاف الوكيل', emergency ? 'warning' : 'success')
          } else {
            set({ error: data.message, loading: false })
            get().addLog(`❌ فشل الإيقاف: ${data.message}`, 'error')
          }
        } catch (e: any) {
          set({ error: e.message, loading: false })
          get().addLog(`❌ خطأ: ${e.message}`, 'error')
        }
      },

      changeStrategy: async (strategy, params) => {
        set({ loading: true, error: null })
        const strategyName = strategy === StrategyType.SCALPING ? 'السكالبينغ' : strategy === StrategyType.SWING ? 'السوينغ' : 'الشبكة'
        get().addLog(`🔄 تغيير الاستراتيجية إلى ${strategyName}...`, 'info')
        try {
          const res = await fetch('/api/agent/trader/strategy', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ strategy, strategyParams: params }),
          })
          const data = await res.json()
          if (data.success) {
            set({ agentState: data.data, loading: false })
            get().addLog(`✅ تم تغيير الاستراتيجية إلى ${strategyName}`, 'success')
          } else {
            set({ error: data.message, loading: false })
            get().addLog(`❌ فشل التغيير: ${data.message}`, 'error')
          }
        } catch (e: any) {
          set({ error: e.message, loading: false })
          get().addLog(`❌ خطأ: ${e.message}`, 'error')
        }
      },

      updateRiskParams: async (params) => {
        set({ loading: true, error: null })
        get().addLog('⚙ تحديث معلمات المخاطر...', 'info')
        try {
          const res = await fetch('/api/agent/trader/risk-params', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
          })
          const data = await res.json()
          if (data.success) {
            set({ agentState: data.data, loading: false })
            get().addLog('✅ تم تحديث معلمات المخاطر', 'success')
          } else {
            set({ error: data.message, loading: false })
            get().addLog(`❌ فشل التحديث: ${data.message}`, 'error')
          }
        } catch (e: any) {
          set({ error: e.message, loading: false })
          get().addLog(`❌ خطأ: ${e.message}`, 'error')
        }
      },

      fetchPerformance: async () => {
        try {
          const res = await fetch('/api/agent/trader/performance')
          const data = await res.json()
          if (data.success && data.data) {
            set({ performance: data.data })
          }
        } catch {
          // Silent fail for performance
        }
      },

      fetchPositions: async () => {
        try {
          const res = await fetch('/api/agent/trader/open-positions')
          const data = await res.json()
          if (data.success && data.data) {
            set({ positions: data.data })
          }
        } catch {
          // Silent fail for positions
        }
      },

      // ── Auto-refresh (every 15s when agent is running) ──
      startAutoRefresh: () => {
        if (_refreshInterval) return
        _refreshInterval = setInterval(() => {
          const { agentState } = get()
          if (agentState?.status === AgentStatus.RUNNING) {
            get().fetchStatus()
            get().fetchPositions()
            get().fetchPerformance()
          } else {
            get().fetchStatus()
          }
        }, 15000)
      },

      stopAutoRefresh: () => {
        if (_refreshInterval) {
          clearInterval(_refreshInterval)
          _refreshInterval = null
        }
      },
    }),
    {
      name: 'roua-agent-storage',
      version: 1,
      migrate: (persistedState: any) => ({
        ...persistedState,
        agentState: persistedState?.agentState ?? null,
        performance: persistedState?.performance ?? null,
        positions: [],
        logs: [],
        loading: false,
        error: null,
        isConfigured: persistedState?.isConfigured ?? false,
        selectedCredentialId: persistedState?.selectedCredentialId ?? '',
        selectedSymbols: persistedState?.selectedSymbols ?? DEFAULT_SYMBOLS,
      }),
      partialize: (state) => ({
        isConfigured: state.isConfigured,
        selectedCredentialId: state.selectedCredentialId,
        selectedSymbols: state.selectedSymbols,
      }),
    }
  )
)
