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
  isPaperTrading?: boolean
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

// ── Agent Settings (per-user persistent config) ──

export interface AgentSettingsData {
  id: string
  userId: string
  autoTradingEnabled: boolean
  paperBalance: number
  maxPositionSizePercent: number
  maxDailyLossPercent: number
  maxOpenPositions: number
  riskPerTradePercent: number
  defaultStrategy: string
  scalpingTimeframe: string
  scalpingTakeProfitPips: number
  scalpingStopLossPips: number
  scalpingMaxSpread: number
  swingTimeframe: string
  swingHoldingPeriodHours: number
  swingTrendLookback: number
  gridLevels: number
  gridSpacingPercent: number
  gridQuantityPerLevel: number | null
  defaultSymbols: string[]
  createdAt: string
  updatedAt: string
}

export interface SystemStatusData {
  autoTradingEnabled: boolean
  globalAutoTradingEnabled: boolean
  source?: 'database' | 'env_var'
  defaultPaperBalance: number
  nodeEnv: string
  message: string
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
  availableCredentials: Array<{ id: string; exchange: string; label?: string; isValid: boolean }>
  settings: AgentSettingsData | null
  systemStatus: SystemStatusData | null

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
  fetchCredentials: () => Promise<void>
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
  fetchSettings: () => Promise<void>
  updateSettings: (settings: Partial<AgentSettingsData>) => Promise<void>
  fetchSystemStatus: () => Promise<void>
  updateSystemSettings: (settings: { autoTradingEnabled?: boolean }) => Promise<void>
  fetchPublicStatus: () => Promise<void>

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
      availableCredentials: [],
      settings: null,
      systemStatus: null,

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
      fetchCredentials: async () => {
        try {
          const res = await fetch('/api/portfolio/credentials')
          if (res.ok) {
            const data = await res.json()
            if (data.success && Array.isArray(data.data) && data.data.length > 0) {
              const validCreds = data.data.filter((c: any) => c.isValid !== false)
              set({ availableCredentials: validCreds })
              // Auto-select first valid credential if none selected
              const { selectedCredentialId } = get()
              if (!selectedCredentialId && validCreds.length > 0) {
                set({ selectedCredentialId: validCreds[0].id })
              }
            }
          }
        } catch {
          // Silent — credentials may not be configured yet
        }
      },

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

        // Ensure strategy is valid
        const validStrategies = [StrategyType.SCALPING, StrategyType.SWING, StrategyType.GRID]
        const safeStrategy = validStrategies.includes(strategy) ? strategy : StrategyType.SCALPING

        // Auto-fetch credentials if not set
        if (!selectedCredentialId || selectedCredentialId.trim() === '') {
          await get().fetchCredentials()
        }

        // Re-read after potential fetch
        const currentCredentialId = get().selectedCredentialId

        // Build payload — if no credential, start in paper trading mode
        const isPaperMode = !currentCredentialId || currentCredentialId.trim() === ''

        set({ loading: true, error: null })
        if (isPaperMode) {
          get().addLog(`جارٍ تفعيل الوكيل باستراتيجية ${safeStrategy === StrategyType.SCALPING ? 'السكالبينغ' : safeStrategy === StrategyType.SWING ? 'السوينغ' : 'الشبكة'} (تداول ورقي)...`, 'info')
        } else {
          get().addLog(`جارٍ تفعيل الوكيل باستراتيجية ${safeStrategy === StrategyType.SCALPING ? 'السكالبينغ' : safeStrategy === StrategyType.SWING ? 'السوينغ' : 'الشبكة'}...`, 'info')
        }
        try {
          const payload: Record<string, any> = {
            strategy: safeStrategy,
            symbols: selectedSymbols,
          }
          // Only include credentialId if we have a real one
          // Empty/missing credentialId triggers paper trading mode on the backend
          if (!isPaperMode) {
            payload.credentialId = currentCredentialId
          }

          const res = await fetch('/api/agent/trader/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          const data = await res.json()

          if (!res.ok) {
            // Silently log for debugging — not shown to user
          }

          if (data.success) {
            set({ agentState: data.data, loading: false, isConfigured: true })
            const isPaper = data.data?.config?.isPaperTrading || isPaperMode
            get().addLog(isPaper ? '✅ تم تفعيل وكيل التداول بنجاح (وضع ورقي — بدون أموال حقيقية)' : '✅ تم تفعيل وكيل التداول بنجاح', 'success')
          } else {
            // Map common backend error messages to user-friendly Arabic
            let msg = data.message || 'فشل التفعيل'
            // Handle array messages from ValidationPipe
            if (Array.isArray(msg)) {
              msg = msg.join('; ')
            }
            if (typeof msg === 'string') {
              if (msg.includes('credentialId') || msg.includes('should not be empty')) {
                msg = 'يرجى ربط مفتاح API أولاً من إعدادات المحفظة'
              } else if (msg.includes('not valid') || msg.includes('غير صالحة') || msg.includes('not found') || msg.includes('غير موجودة')) {
                msg = 'مفتاح API غير صالح أو منتهي الصلاحية — تحقق من إعدادات المحفظة'
              } else if (msg.includes('already running') || msg.includes('يعمل بالفعل')) {
                msg = 'الوكيل يعمل بالفعل — أوقفه أولاً ثم أعد تشغيله'
              } else if (msg.includes('trade permission') || msg.includes('صلاحية التداول')) {
                msg = 'مفتاح API لا يملك صلاحية التداول — تحقق من إعدادات البورصة'
              } else if (msg.includes('must be one of') || msg.includes('strategy')) {
                msg = 'استراتيجية غير صالحة — يرجى اختيار سكالبينغ، سوينغ، أو شبكة'
              }
            }
            set({ error: String(msg), loading: false })
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

      fetchSettings: async () => {
        try {
          const res = await fetch('/api/agent/trader/settings')
          const data = await res.json()
          if (data.success && data.data) {
            set({ settings: data.data })
          }
        } catch {
          // Silent fail for settings
        }
      },

      updateSettings: async (newSettings) => {
        set({ loading: true, error: null })
        get().addLog('⚙ تحديث إعدادات الوكيل...', 'info')
        try {
          const res = await fetch('/api/agent/trader/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSettings),
          })
          const data = await res.json()
          if (data.success) {
            set({ settings: data.data, loading: false })
            get().addLog('✅ تم تحديث إعدادات الوكيل', 'success')
          } else {
            set({ error: data.message, loading: false })
            get().addLog(`❌ فشل التحديث: ${data.message}`, 'error')
          }
        } catch (e: any) {
          set({ error: e.message, loading: false })
          get().addLog(`❌ خطأ: ${e.message}`, 'error')
        }
      },

      fetchSystemStatus: async () => {
        try {
          const res = await fetch('/api/agent/trader/system-status')
          const data = await res.json()
          if (data.success && data.data) {
            set({ systemStatus: data.data })
          }
        } catch {
          // Silent fail for system status
        }
      },

      updateSystemSettings: async (newSystemSettings) => {
        try {
          const res = await fetch('/api/agent/trader/system-settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSystemSettings),
          })
          const data = await res.json()
          if (data.success) {
            // Refresh system status after update
            await get().fetchSystemStatus()
            get().addLog(`✅ تم تحديث إعدادات النظام`, 'success')
          } else {
            get().addLog(`❌ فشل تحديث إعدادات النظام: ${data.message}`, 'error')
          }
        } catch (e: any) {
          get().addLog(`❌ خطأ في تحديث إعدادات النظام: ${e.message}`, 'error')
        }
      },

      fetchPublicStatus: async () => {
        try {
          const res = await fetch('/api/agent/trader/public-status')
          const data = await res.json()
          if (data.success && data.data) {
            // Update systemStatus with public data if we don't have full status yet
            if (!get().systemStatus) {
              set({ systemStatus: { ...data.data, globalAutoTradingEnabled: data.data.autoTradingEnabled, defaultPaperBalance: 10000, nodeEnv: 'unknown', message: '' } })
            }
          }
        } catch {
          // Silent fail for public status
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
        // Only persist credentialId if it's a valid non-empty string
        selectedCredentialId: (typeof persistedState?.selectedCredentialId === 'string' && persistedState.selectedCredentialId.trim() !== '')
          ? persistedState.selectedCredentialId
          : '',
        selectedSymbols: Array.isArray(persistedState?.selectedSymbols) ? persistedState.selectedSymbols : DEFAULT_SYMBOLS,
        availableCredentials: [],
      }),
      partialize: (state) => ({
        isConfigured: state.isConfigured,
        selectedCredentialId: state.selectedCredentialId,
        selectedSymbols: state.selectedSymbols,
        // Don't persist availableCredentials — always fetch fresh
      }),
    }
  )
)
