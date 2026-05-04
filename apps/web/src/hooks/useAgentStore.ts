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
  AUTO = 'AUTO',
  SCALPING = 'SCALPING',
  SWING = 'SWING',
  GRID = 'GRID',
  MEAN_REVERSION = 'MEAN_REVERSION',
  MOMENTUM_BREAKOUT = 'MOMENTUM_BREAKOUT',
  DCA = 'DCA',
  VWAP_RSI = 'VWAP_RSI',
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
  // Mean Reversion
  meanReversionRsiOversold?: number
  meanReversionRsiOverbought?: number
  meanReversionBbLower?: number
  meanReversionBbUpper?: number
  meanReversionDeviation?: number
  // Momentum Breakout
  momentumBreakoutAtrMultiplier?: number
  momentumBreakoutVolumeThreshold?: number
  // DCA
  dcaBaseMultiplier?: number
  dcaDiscountRsi?: number
  dcaSkipRsi?: number
  // VWAP + RSI
  vwapRsiBuyMin?: number
  vwapRsiBuyMax?: number
  vwapRsiSellMin?: number
  vwapRsiSellMax?: number
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

// ── Regime Info (AUTO Strategy) ──

export enum MarketRegime {
  TRENDING_UP = 'TRENDING_UP',
  TRENDING_DOWN = 'TRENDING_DOWN',
  RANGING = 'RANGING',
  VOLATILE = 'VOLATILE',
  TRANSITIONAL = 'TRANSITIONAL',
}

export interface StrategyScore {
  strategy: StrategyType
  score: number
  regimeMatch: number
  recentPerformance: number
  drawdownPenalty: number
  winRateTrend: number
  reason: string
}

export interface RegimeInfo {
  regime: MarketRegime
  confidence: number
  indicators: {
    trendStrength: number
    volatilityLevel: string
    emaAlignment: 'BULLISH' | 'BEARISH' | 'MIXED'
    bbBandwidth: number
    adxProxy: number
    momentumDirection: 'UP' | 'DOWN' | 'FLAT'
  }
  recommendedStrategies: StrategyType[]
  currentStrategy: StrategyType | null
  strategyScores: Array<{
    strategy: StrategyType
    score: number
    reason: string
  }>
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
  regimeInfo: RegimeInfo | null

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
  fetchRegimeInfo: (symbol?: string) => Promise<void>

  // Auto-refresh
  startAutoRefresh: () => void
  stopAutoRefresh: () => void
}

const DEFAULT_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT']

let _refreshInterval: ReturnType<typeof setInterval> | null = null
let _nestjsReady: boolean | null = null  // null = unknown, true = ready, false = offline

/**
 * Check if NestJS backend is ready by hitting the public health endpoint.
 * Returns true if NestJS is up and agent routes are registered.
 */
async function checkNestJSReady(): Promise<boolean> {
  try {
    const res = await fetch('/api/agent/trader/health', {
      signal: AbortSignal.timeout(5000), // 5s timeout
    })
    if (res.ok) {
      _nestjsReady = true
      return true
    }
    _nestjsReady = false
    return false
  } catch {
    _nestjsReady = false
    return false
  }
}

/**
 * Wait for NestJS to become ready, with retries.
 * Returns true if NestJS became ready within the timeout.
 */
async function waitForNestJS(maxRetries = 5, delayMs = 2000): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    if (await checkNestJSReady()) return true
    if (i < maxRetries - 1) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
  return false
}

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
      regimeInfo: null,

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
              // Clear stale credential if it's no longer in the valid list
              const currentId = get().selectedCredentialId
              if (currentId) {
                const stillValid = validCreds.some((c: any) => c.id === currentId)
                if (!stillValid) {
                  set({ selectedCredentialId: '' })
                }
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
        const validStrategies = [StrategyType.AUTO, StrategyType.SCALPING, StrategyType.SWING, StrategyType.GRID, StrategyType.MEAN_REVERSION, StrategyType.MOMENTUM_BREAKOUT, StrategyType.DCA, StrategyType.VWAP_RSI]
        const safeStrategy = validStrategies.includes(strategy) ? strategy : StrategyType.AUTO

        // Auto-fetch credentials if not set
        if (!selectedCredentialId || selectedCredentialId.trim() === '') {
          await get().fetchCredentials()
        }

        // Re-read after potential fetch
        const currentCredentialId = get().selectedCredentialId

        // Build payload — if no credential, start in paper trading mode
        const isPaperMode = !currentCredentialId || currentCredentialId.trim() === ''

        set({ loading: true, error: null })
        const strategyNameMap: Record<string, string> = {
          AUTO: 'تلقائي (تكيفي)',
          SCALPING: 'السكالبينغ',
          SWING: 'السوينغ',
          GRID: 'الشبكة',
          MEAN_REVERSION: 'عودة للمتوسط',
          MOMENTUM_BREAKOUT: 'اختراق الزخم',
          DCA: 'متوسط التكلفة',
          VWAP_RSI: 'VWAP + RSI',
        }
        const strategyLabel = strategyNameMap[strategy] || strategy
        if (isPaperMode) {
          get().addLog(`جارٍ تفعيل الوكيل باستراتيجية ${strategyLabel} (تداول ورقي)...`, 'info')
        } else {
          get().addLog(`جارٍ تفعيل الوكيل باستراتيجية ${strategyLabel}...`, 'info')
        }

        // Check if NestJS is ready before attempting to start the agent.
        // If NestJS is offline (cold start or crash), wait for it with retries.
        if (_nestjsReady !== true) {
          get().addLog('⏳ جارٍ التحقق من جاهزية خدمة التداول...', 'info')
          const isReady = await waitForNestJS(5, 2000)
          if (!isReady) {
            set({ error: 'خدمة التداول غير متاحة حالياً — يرجى إعادة تحميل الصفحة بعد بضع ثوان', loading: false })
            get().addLog('❌ خدمة التداول غير متاحة بعد إعادة المحاولة', 'error')
            return
          }
          get().addLog('✅ خدمة التداول جاهزة', 'info')
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

          // Handle non-JSON responses (NestJS offline / 502 / 404)
          let data: any
          try {
            data = await res.json()
          } catch {
            // NestJS is offline — show clear message
            set({ error: 'خدمة التداول غير متاحة حالياً — يرجى المحاولة بعد بضع ثوان', loading: false })
            get().addLog('❌ خدمة التداول غير متاحة — يرجى المحاولة لاحقاً', 'error')
            return
          }

          // Handle 502 Bad Gateway (NestJS offline/crashed)
          if (res.status === 502 || data.offline) {
            set({ error: 'خدمة التداول غير متاحة حالياً — يرجى المحاولة بعد بضع ثوان', loading: false })
            get().addLog('❌ خدمة التداول غير متاحة — يرجى المحاولة لاحقاً', 'error')
            return
          }

          // Handle 404 (route not found in NestJS — module failed to load)
          if (res.status === 404) {
            set({ error: 'خدمة وكيل التداول غير مسجلة — يرجى إعادة تحميل الصفحة أو المحاولة لاحقاً', loading: false })
            get().addLog('❌ مسار الوكيل غير موجود — قد يكون NestJS لم يكتمل بعد', 'error')
            return
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
              // Only map to API key errors when user actually has a credential selected
              if (isPaperMode) {
                // Paper trading mode — don't show API key errors
                if (msg.includes('credentialId') || msg.includes('should not be empty')) {
                  msg = 'فشل تفعيل وضع التداول الورقي — يرجى المحاولة لاحقاً'
                } else if (msg.includes('already running') || msg.includes('يعمل بالفعل')) {
                  msg = 'الوكيل يعمل بالفعل — أوقفه أولاً ثم أعد تشغيله'
                }
                // For all other errors in paper mode, don't map to API key error
                if (msg.includes('not valid') || msg.includes('غير صالحة') || msg.includes('not found') || msg.includes('غير موجودة')) {
                  msg = 'فشل تفعيل وكيل التداول — يرجى المحاولة لاحقاً'
                }
              } else {
                // Real credential mode — show API key errors
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
        const strategyNameMap: Record<string, string> = {
          AUTO: 'تلقائي (تكيفي)',
          SCALPING: 'السكالبينغ',
          SWING: 'السوينغ',
          GRID: 'الشبكة',
          MEAN_REVERSION: 'عودة للمتوسط',
          MOMENTUM_BREAKOUT: 'اختراق الزخم',
          DCA: 'متوسط التكلفة',
          VWAP_RSI: 'VWAP + RSI',
        }
        const strategyName = strategyNameMap[strategy] || strategy
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

      fetchRegimeInfo: async (symbol?: string) => {
        try {
          const params = symbol ? `?symbol=${encodeURIComponent(symbol)}` : ''
          const res = await fetch(`/api/agent/trader/regime-info${params}`)
          const data = await res.json()
          if (data.success && data.data) {
            set({ regimeInfo: data.data })
          }
        } catch {
          // Silent fail for regime info
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
            // Fetch regime info if AUTO strategy is active
            if (agentState?.config?.strategy === StrategyType.AUTO) {
              const firstSymbol = agentState?.config?.symbols?.[0] || 'BTC/USDT'
              get().fetchRegimeInfo(firstSymbol)
            }
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
      /**
       * SECURITY FIX: Dynamic storage key to prevent data leakage.
       * Old version used hard-coded 'roua-agent-storage' — all users shared one key.
       * Now we resolve the key dynamically based on current auth state.
       */
      name: 'roua-agent-storage', // Base name — actual key resolved dynamically
      version: 1,
      storage: (() => {
        const baseStorage = (() => {
          // Minimal createJSONStorage equivalent for persist middleware
          return {
            getItem: (name: string) => {
              const value = localStorage.getItem(name)
              return value
            },
            setItem: (name: string, value: string) => {
              localStorage.setItem(name, value)
            },
            removeItem: (name: string) => {
              localStorage.removeItem(name)
            },
          }
        })()

        // Resolve user-scoped key
        const getDynamicKey = (baseName: string): string => {
          try {
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
          } catch {
            return baseName
          }
        }

        return {
          getItem: (name: string): any => {
            return baseStorage.getItem(getDynamicKey(name))
          },
          setItem: (name: string, value: any) => {
            baseStorage.setItem(getDynamicKey(name), value as string)
          },
          removeItem: (name: string) => {
            baseStorage.removeItem(getDynamicKey(name))
          },
        }
      })(),
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
