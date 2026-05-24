'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useVisibleInterval } from '@/hooks/useVisibleInterval'
import { Brain, Shield, Zap, TrendingUp, TrendingDown, Minus, Info, RefreshCw, Layers, AlertCircle, Cpu, Wifi, WifiOff, Heart, Activity } from 'lucide-react'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { useTabAlertStore } from '@/hooks/useTabAlertStore'
import { T } from '@/lib/unified-tokens'
import { safeStr, safeNum } from '@/lib/utils'
import { useTranslations } from 'next-intl'

interface Analysis {
  role: string
  model: string
  vote: 'BUY' | 'SELL' | 'HOLD'
  confidence: number
  reason: string
}

interface KeepAliveInfo {
  lastPingAt?: number
  lastPingAgoMs?: number | null
  isUp?: boolean
}

interface ConsensusData {
  consensusScore: number
  recommendation: 'BUY' | 'SELL' | 'HOLD'
  analyses: Analysis[]
  masterStrategy: string
  conflictExplanation?: string
  meta?: { symbol: string; price: number; rsi: number; processingTimeMs: number; source?: string; freshness?: string; aiEngine?: string; modelsUsed?: string[]; modelsResponded?: number; modelsExpected?: number; timestamp?: string; cached?: boolean; cacheAgeSeconds?: number; connectionLayer?: string; keepAlive?: KeepAliveInfo; bedrockAvailable?: boolean; ollamaAttempted?: boolean; modelsWithKeys?: number }
}

/** Map model name to a short display name */
function getModelShortName(model: string): string {
  if (model.includes('Groq')) return 'Groq'
  if (model.includes('Gemini')) return 'Gemini'
  if (model.includes('GLM')) return 'GLM-4'
  if (model.includes('HuggingFace') || model.includes('HF')) return 'HF'
  if (model.includes('Ollama')) return 'Ollama'
  if (model.includes('Bedrock') || model.includes('Claude')) return 'Bedrock'
  if (model.includes('DeepSeek')) return 'DeepSeek'
  if (model.includes('Scanner')) return 'Scanner'
  if (model.includes('Risk')) return 'Risk'
  if (model.includes('MTF')) return 'MTF'
  if (model.includes('Execution')) return 'Exec'
  return model.split('/')[0] || model
}

/** Get a color for a model badge */
function getModelColor(model: string): string {
  if (model.includes('Groq')) return '#F97316' // orange
  if (model.includes('Gemini')) return '#3B82F6' // blue
  if (model.includes('GLM')) return '#10B981' // green
  if (model.includes('HuggingFace') || model.includes('HF')) return '#FBBF24' // yellow
  if (model.includes('Ollama')) return '#8B5CF6' // purple
  if (model.includes('Bedrock') || model.includes('Claude')) return '#EC4899' // pink
  if (model.includes('DeepSeek')) return '#06B6D4' // cyan
  return T.text2 // default
}

export function AICouncilPanel() {
  const { selectedSymbol } = useSymbolStore()
  const tai = useTranslations('dashboard.ai')
  const tc = useTranslations('common')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ConsensusData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)
  const [dataSource, setDataSource] = useState<'real-ai' | 'partial-ai' | 'scanner-rules' | 'fallback' | 'unknown'>('unknown')
  const [countdown, setCountdown] = useState(600) // refresh cycle in seconds
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const nextFetchAt = useRef<number>(Date.now() + 600_000) // target timestamp
  const failCountRef = useRef(0) // Track consecutive failures for exponential backoff
  const abortRef = useRef<AbortController | null>(null) // Cancel in-flight requests
  const lastGoodAIData = useRef<{ data: ConsensusData; source: string; timestamp: number } | null>(null) // Keep last good AI result
  const [loadingPhase, setLoadingPhase] = useState(0)
  const [keepAliveStatus, setKeepAliveStatus] = useState<{ lastPingAt: string | null; nestJSUp: boolean } | null>(null)
  const phases = [tai('collectingData'), tai('analyzingMomentum'), tai('discussingSignals'), tai('buildingConsensus')]
  
  const [currentTrendSymbol, setCurrentTrendSymbol] = useState('BTC/USDT')
  const TREND_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'EUR/USD', 'GBP/USD']
  const trendScanIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // ── Keep-alive ping ──
  const pingKeepAlive = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/keep-alive', { method: 'GET' })
      if (res.ok) {
        const j = await res.json()
        setKeepAliveStatus({
          lastPingAt: j.stats?.lastPingAt || null,
          nestJSUp: j.stats?.nestJSLastPingSuccess ?? false,
        })
      }
    } catch {
      // Silently fail — keep-alive is non-critical
    }
  }, [])

  // Deferred keep-alive ping — wait 5s after mount to avoid blocking initial load
  useEffect(() => {
    const t = setTimeout(() => pingKeepAlive(), 5000)
    return () => clearTimeout(t)
  }, [pingKeepAlive])
  // Periodic every 5 min — pauses when tab hidden
  useVisibleInterval(pingKeepAlive, 5 * 60 * 1000)

  const fetchConsensus = useCallback(async () => {
    setLoading(true)
    setError(null)
    setCountdown(180) // 3 min countdown
    // Cancel any previous in-flight request
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    try {
      const res = await fetch('/api/ai/consensus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: selectedSymbol }),
        signal: abortRef.current.signal, // 90s timeout handled by server
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`${tai('httpError', { status: res.status })}: ${text.slice(0, 100)}`)
      }

      const j = await res.json()
      if (j.success) {
        const newSource = j.source || 'unknown'
        const isAIResult = newSource === 'real-ai' || newSource === 'partial-ai'

        // FIX: If we got scanner-rules but have recent AI data (<5 min old), keep AI data
        if (!isAIResult && lastGoodAIData.current) {
          const ageMs = Date.now() - lastGoodAIData.current.timestamp
          if (ageMs < 5 * 60 * 1000) { // FIX: Reduced from 30 min to 5 min — stale data is worse than no data
            console.log('[AI Council] Got scanner-rules, but keeping last AI result (still fresh)')
            // Keep the last good AI data, just update the timestamp
            setData(lastGoodAIData.current.data)
            setDataSource(lastGoodAIData.current.source as 'real-ai' | 'partial-ai')
            setLastUpdate(new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
            failCountRef.current = 0
            return // Don't override with scanner-rules
          }
        }

        // Normal path: update with new data
        setData(j.data)
        setDataSource(newSource)
        setLastUpdate(new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
        failCountRef.current = 0 // Reset backoff on success

        // Save as last good AI result for future fallback
        if (isAIResult) {
          lastGoodAIData.current = { data: j.data, source: newSource, timestamp: Date.now() }
        }

        // Update keep-alive status from consensus response
        if (j.data?.meta?.keepAlive) {
          const ka = j.data.meta.keepAlive
          setKeepAliveStatus({
            lastPingAt: ka.lastPingAt ? new Date(ka.lastPingAt).toISOString() : null,
            nestJSUp: !!ka.isUp,
          })
        }

        // Push alert when council has a directional recommendation with high consensus
        if (j.data?.recommendation && j.data.recommendation !== 'HOLD' && j.data.consensusScore >= 60) {
          useTabAlertStore.getState().pushAlert('council', {
            action: j.data.recommendation,
            label: `${j.data.recommendation === 'BUY' ? `⬆ ${tc('buy')}` : `⬇ ${tc('sell')}`} ${j.data.consensusScore}%`,
            color: j.source === 'real-ai' ? '#B388FF' : '#FFB800',
          })
        }
      } else {
        throw new Error(j.error || tai('consensusFailed'))
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return // Cancelled — don't show error

      // FIX: On error, if we have recent AI data, keep showing it instead of error
      if (lastGoodAIData.current) {
        const ageMs = Date.now() - lastGoodAIData.current.timestamp
        if (ageMs < 5 * 60 * 1000) { // FIX: Reduced from 30 min to 5 min
          console.log('[AI Council] Fetch failed, keeping last AI result')
          setData(lastGoodAIData.current.data)
          setDataSource(lastGoodAIData.current.source as 'real-ai' | 'partial-ai')
          setLastUpdate(new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
          // Don't increment fail count if we have good data
          return
        }
      }

      failCountRef.current++
      // Exponential backoff: 600s → 900s → max 1800s
      const backoffSeconds = Math.min(600 * Math.pow(1.5, failCountRef.current - 1), 1800)
      setCountdown(Math.round(backoffSeconds))
      setError(e.message || tai('unexpectedError'))
    } finally {
      setLoading(false)
    }
  }, [selectedSymbol, tai, tc])

  // Initial fetch on symbol change
  useEffect(() => {
    nextFetchAt.current = Date.now() + 600_000
    fetchConsensus()
  }, [fetchConsensus])

  // Countdown Timer Logic
  useEffect(() => {
    if (loading) return // Pause countdown while fetching
    // PERFORMANCE: Update countdown every 10s instead of every 1s.
    // This reduces re-renders by 90% (6/min instead of 60/min).
    // The display rounds to nearest 10s — imperceptible to users.
    countdownRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.round((nextFetchAt.current - Date.now()) / 1000))
      if (remaining <= 0) {
        nextFetchAt.current = Date.now() + 600_000
        setCountdown(600)
        fetchConsensus()
      } else {
        setCountdown(remaining)
      }
    }, 10_000)

    // Visual-only trend symbol animation — paused when tab hidden
    const startTrendInterval = () => {
      if (trendScanIntervalRef.current) clearInterval(trendScanIntervalRef.current)
      trendScanIntervalRef.current = setInterval(() => {
        setCurrentTrendSymbol(prev => {
          const idx = TREND_SYMBOLS.indexOf(prev)
          return TREND_SYMBOLS[(idx + 1) % TREND_SYMBOLS.length]
        })
      }, 5000)
    }

    const handleTrendVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (trendScanIntervalRef.current) { clearInterval(trendScanIntervalRef.current); trendScanIntervalRef.current = null }
      } else {
        startTrendInterval()
      }
    }

    startTrendInterval()
    document.addEventListener('visibilitychange', handleTrendVisibility)

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (trendScanIntervalRef.current) clearInterval(trendScanIntervalRef.current)
      document.removeEventListener('visibilitychange', handleTrendVisibility)
    }
  }, [loading, fetchConsensus])

  // Dynamic Loading Phases Logic
  useEffect(() => {
    if (!loading) {
      setLoadingPhase(0)
      return
    }
    const phaseInterval = setInterval(() => {
      setLoadingPhase((p) => (p + 1) % phases.length)
    }, 4500)
    return () => clearInterval(phaseInterval)
  }, [loading, phases.length])

  const isRealAI = dataSource === 'real-ai' || dataSource === 'partial-ai'
  const isPartialAI = dataSource === 'partial-ai'
  const isCachedAI = isRealAI && data?.meta?.cached === true
  const connectionLayer = data?.meta?.connectionLayer || 'unknown'
  const recColor = data?.recommendation === 'BUY' ? T.green : data?.recommendation === 'SELL' ? T.red : T.amber
  const formatCountdown = `${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, '0')}`

  // Compute unique models that responded
  const respondedModels = data?.analyses
    ? [...new Set(data.analyses.map(a => a.model).filter(m => !m.includes('Scanner') && !m.includes('Risk/') && !m.includes('MTF/') && !m.includes('Execution/') && !m.includes('Fallback')))]
    : []
  const totalModels = data?.meta?.modelsExpected || 8

  return (
    <div className="flex flex-col h-full overflow-hidden custom-scrollbar" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))', fontFamily: "'Cairo', sans-serif", border: `1px solid ${isRealAI ? 'rgba(0,212,255,0.15)' : 'rgba(0,212,255,0.08)'}`, borderRadius: 16 }}>
      {/* Header */}
      <div className="p-3 border-b border-white/5 flex items-center justify-between" style={{ background: isRealAI ? 'linear-gradient(90deg, rgba(0,212,255,0.18), rgba(179,136,255,0.08), transparent)' : 'linear-gradient(90deg, rgba(0,212,255,0.12), transparent)' }}>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Brain size={16} color={isRealAI ? T.purple : T.accent} />
            {!loading && data && (
              <div className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${isRealAI ? 'bg-purple-500' : 'bg-green-500'} animate-ping`} />
            )}
          </div>
          <div>
            <h3 className="text-[11px] font-bold text-white">{tai('councilTitle')}</h3>
            {/* Trend Heartbeat */}
            <div style={{ 
              display: 'flex', alignItems: 'center', gap: 4, 
              background: 'rgba(179,136,255,0.05)', padding: '1px 6px', 
              borderRadius: 10, border: '1px solid rgba(179,136,255,0.1)',
              marginTop: 1, marginBottom: 1
            }}>
              <div style={{ 
                width: 4, height: 4, borderRadius: '50%', background: T.purple,
                boxShadow: `0 0 5px ${T.purple}`,
                animation: 'agentCtrlPulse 1s ease-in-out infinite'
              }} />
              <span style={{ fontSize: 7, color: T.purple, fontWeight: 700, fontFamily: 'monospace' }}>
                {tai('monitoringTrends')}: {currentTrendSymbol}
              </span>
            </div>
            <p className="text-[8px] font-mono" style={{ color: isRealAI ? T.purple + 'cc' : T.accent + '80' }}>
              {data?.meta ? (
                <>
                  {data.meta.symbol} • RSI: {data.meta.rsi} • {data.meta.processingTimeMs}ms
                  {isRealAI ? ` • ${tai('realAI')}` : data.meta.aiEngine ? ` • ${data.meta.aiEngine.includes('Scanner') ? tai('technicalAnalysis') : data.meta.aiEngine}` : ` • ${tai('technicalAnalysis')}`}
                </>
              ) : `${tai('councilTitle')} ${lastUpdate ? `· ${lastUpdate}` : ''}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Keep-Alive Status Indicator */}
          <div className="flex items-center gap-1" style={{
            padding: '1px 4px',
            borderRadius: 3,
            background: keepAliveStatus?.nestJSUp ? 'rgba(0,255,163,0.12)' : 'rgba(255,184,0,0.12)',
            border: `1px solid ${keepAliveStatus?.nestJSUp ? 'rgba(0,255,163,0.25)' : 'rgba(255,184,0,0.2)'}`,
          }} title={`Keep-alive: NestJS ${keepAliveStatus?.nestJSUp ? 'UP' : 'DOWN'} | Last ping: ${keepAliveStatus?.lastPingAt || 'never'}`}>
            <Heart size={7} color={keepAliveStatus?.nestJSUp ? T.green : T.amber} className={keepAliveStatus?.nestJSUp ? '' : 'animate-pulse'} />
            <span style={{ fontSize: 6, fontWeight: 700, color: keepAliveStatus?.nestJSUp ? T.green : T.amber, fontFamily: 'monospace' }}>
              {keepAliveStatus?.nestJSUp ? tai('up') : tai('ping')}
            </span>
          </div>
          {/* Data Source Badge */}
          <div className="flex items-center gap-1" style={{
            padding: '2px 6px',
            borderRadius: 4,
            background: isRealAI ? 'rgba(179,136,255,0.15)' : 'rgba(255,184,0,0.12)',
            border: `1px solid ${isRealAI ? 'rgba(179,136,255,0.3)' : 'rgba(255,184,0,0.2)'}`,
          }}>
            {isRealAI ? <Cpu size={8} color={T.purple} /> : <WifiOff size={8} color={T.amber} />}
            <span style={{ fontSize: 7, fontWeight: 700, color: isPartialAI ? T.accent : isRealAI ? T.purple : T.amber, fontFamily: 'monospace' }}>
              {isPartialAI ? `${data?.meta?.modelsResponded || '?'}/${data?.meta?.modelsExpected || 7} AI` : isRealAI ? `${data?.meta?.modelsResponded || 7}/${data?.meta?.modelsExpected || 7} AI` : dataSource === 'scanner-rules' ? tai('technicalAnalysis') : 'FB'}
            </span>
          </div>
          {/* Countdown */}
          <span style={{ fontSize: 7, color: T.text2, fontFamily: 'monospace', minWidth: 24, textAlign: 'center' }}>
            {formatCountdown}
          </span>
          <button
            onClick={fetchConsensus}
            disabled={loading}
            className="p-1.5 rounded-md transition-colors hover:bg-white/5"
            title={tai('refreshAnalysis')}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} color={T.text2} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 space-y-3">
        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <div className="relative">
              <Layers size={28} color={T.accent + '40'} className="animate-bounce" />
              <div className="absolute inset-0 animate-ping" style={{ background: T.accent + '10', borderRadius: '50%' }} />
            </div>
            <span className="text-[10px] animate-pulse" style={{ color: isRealAI ? T.purple + '90' : T.accent + '80', fontWeight: 'bold' }}>
              {isRealAI ? phases[loadingPhase] : tai('buildingTechnicalAnalysis')}
            </span>
            {isRealAI && (
              <div className="flex gap-1 mt-1 flex-wrap justify-center px-4">
                {['Gemini', 'Groq', 'GLM-4', 'HF', 'Ollama', 'Bedrock', 'OR', 'DS'].map((m, i) => {
                  const isActive = i % phases.length === loadingPhase
                  return (
                    <div 
                      key={m + '-' + i} 
                      className="transition-all duration-500" 
                      style={{ 
                        fontSize: 6, padding: '2px 5px', borderRadius: 3, 
                        background: isActive ? 'rgba(179,136,255,0.4)' : 'rgba(179,136,255,0.1)', 
                        color: isActive ? '#fff' : T.purple, 
                        fontFamily: 'monospace',
                        transform: isActive ? 'scale(1.1)' : 'scale(1)',
                        boxShadow: isActive ? '0 0 8px rgba(179,136,255,0.6)' : 'none'
                      }}>
                      {m}
                    </div>
                  )
                })}
              </div>
            )}
            {/* Tiny Progress Bar */}
            <div className="w-24 h-0.5 bg-white/5 rounded-full overflow-hidden mt-2">
              <div className="h-full bg-purple-500 transition-all duration-[4000ms] ease-linear" style={{ width: `${((loadingPhase + 1) / phases.length) * 100}%` }} />
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/5 flex items-start gap-2">
            <AlertCircle size={14} color={T.red} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-bold text-red-400 mb-1">{tai('analysisFailed')}</p>
              <p className="text-[9px] text-red-400/60">{error}</p>
              <button onClick={fetchConsensus} className="mt-2 text-[9px] text-red-400 underline">{tc('retry')}</button>
            </div>
          </div>
        )}

        {/* Data State */}
        {!loading && data && (
          <>
            {/* Data Source Indicator */}
            {!isRealAI && (
              <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.12)' }}>
                <Wifi size={10} color={T.amber} />
                <span className="text-[8px]" style={{ color: T.amber }}>
                  {dataSource === 'scanner-rules'
                    ? tai('aiOfflineFallback')
                    : tai('limitedDataFallback')}
                </span>
              </div>
            )}

            {isRealAI && !isPartialAI && (
              <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(179,136,255,0.06)', border: '1px solid rgba(179,136,255,0.15)' }}>
                <Cpu size={10} color={T.purple} />
                <span className="text-[8px]" style={{ color: T.purple }}>
                  {isCachedAI ? tai('cachedAnalysis') : tai('realAnalysisFrom', { count: data.meta?.modelsResponded || 0 }) + ` — ${data.meta?.processingTimeMs || 0}ms`}
                </span>
                {connectionLayer === 'direct' && (
                  <span style={{ fontSize: 6, padding: '1px 4px', borderRadius: 3, background: 'rgba(0,212,255,0.15)', color: T.accent, fontFamily: 'monospace', fontWeight: 700 }}>{tc('live')}</span>
                )}
                {connectionLayer === 'nestjs' && (
                  <span style={{ fontSize: 6, padding: '1px 4px', borderRadius: 3, background: 'rgba(179,136,255,0.15)', color: T.purple, fontFamily: 'monospace', fontWeight: 700 }}>NestJS</span>
                )}
              </div>
            )}
            {isPartialAI && (
              <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.15)' }}>
                <Cpu size={10} color={T.accent} />
                <span className="text-[8px]" style={{ color: T.accent }}>
                  {tai('partialAnalysis', { count: data.meta?.modelsResponded || '?' })}
                </span>
                {connectionLayer === 'direct' && (
                  <span style={{ fontSize: 6, padding: '1px 4px', borderRadius: 3, background: 'rgba(0,212,255,0.15)', color: T.accent, fontFamily: 'monospace', fontWeight: 700 }}>{tc('live')}</span>
                )}
              </div>
            )}

            {/* Models That Responded — Visual Indicator */}
            {isRealAI && respondedModels.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap p-2 rounded-lg" style={{ background: 'rgba(179,136,255,0.04)', border: '1px solid rgba(179,136,255,0.1)' }}>
                <Activity size={8} color={T.purple} />
                <span className="text-[7px] font-bold" style={{ color: T.purple + 'aa' }}>{tai('activeModelsLabel')}</span>
                {respondedModels.map((model, i) => {
                  const color = getModelColor(model)
                  const shortName = getModelShortName(model)
                  return (
                    <span
                      key={model}
                      style={{
                        fontSize: 6,
                        padding: '1px 5px',
                        borderRadius: 3,
                        background: `${color}20`,
                        color,
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        border: `1px solid ${color}30`,
                      }}
                    >
                      {shortName}
                    </span>
                  )
                })}
                {/* Show missing models as dimmed */}
                {Array.from({ length: totalModels - respondedModels.length }).map((_, i) => (
                  <span
                    key={`missing-${i}`}
                    style={{
                      fontSize: 6,
                      padding: '1px 5px',
                      borderRadius: 3,
                      background: 'rgba(255,255,255,0.03)',
                      color: 'rgba(255,255,255,0.15)',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    —
                  </span>
                ))}
              </div>
            )}

            {/* Consensus Gauge */}
            <div className="relative p-3 rounded-xl text-center overflow-hidden" style={{ 
              background: T.bg2, 
              border: `1px solid ${recColor}20`,
              boxShadow: `inset 0 0 40px ${recColor}08`
            }}>
              {/* Radial Glow Background */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full opacity-20 pointer-events-none" style={{
                background: `radial-gradient(circle at top, ${recColor} 0%, transparent 70%)`
              }} />

              <div className="absolute top-2 left-2 flex items-center gap-1 z-10">
                <div className={`w-1.5 h-1.5 rounded-full ${isRealAI ? 'bg-purple-500' : 'bg-green-500'} animate-ping`} />
                <span className={`text-[7px] ${isRealAI ? 'text-purple-500' : 'text-green-500'}/80 font-bold font-mono`}>
                  {isRealAI ? tai('aiLive') : tai('liveLabel')}
                </span>
              </div>

              <div className="text-[9px] mb-1 uppercase tracking-widest relative z-10" style={{ color: T.text2 }}>{tai('consensusScore')}</div>
              <div className="text-4xl font-black font-mono mb-2 relative z-10" style={{ color: recColor, textShadow: `0 0 20px ${recColor}60` }}>
                {data.consensusScore}%
              </div>

              {/* Gauge Bar */}
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mb-2 relative z-10">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{ width: `${data.consensusScore}%`, background: recColor, boxShadow: `0 0 12px ${recColor}80` }}
                />
              </div>

              <div
                className="inline-flex px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest relative z-10"
                style={{ background: `${recColor}15`, color: recColor, border: `1px solid ${recColor}30`, boxShadow: `0 0 10px ${recColor}20` }}
              >
                {data.recommendation === 'BUY' ? (data.consensusScore >= 75 ? tai('strongBuy') : tai('buy')) : data.recommendation === 'SELL' ? (data.consensusScore >= 75 ? tai('strongSell') : tai('sell')) : (data.consensusScore >= 75 ? tai('holdConsensus') : data.consensusScore >= 50 ? tai('holdLean') : tai('neutral'))}
              </div>
            </div>

            {/* Master Strategy */}
            <div className="card" style={{ padding: '10px 11px', border: `1px solid ${isRealAI ? T.purple + '20' : T.accent + '15'}` }}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Zap size={9} color={isRealAI ? T.purple : T.accent} />
                <span className="text-[9px] font-bold" style={{ color: isRealAI ? T.purple : T.accent }}>{tai('unifiedStrategy')}</span>
              </div>
              <p className="text-[10px] leading-5" style={{ color: T.text + 'cc' }}>
                {/* FIX React Error #31: AI may return objects instead of strings */}
                {safeStr(data.masterStrategy)}
              </p>
            </div>

            {data.conflictExplanation && (
              <div className="card" style={{ padding: '10px 11px', border: `1px solid ${T.amber}25`, background: 'linear-gradient(180deg, rgba(255,184,0,0.08), rgba(255,255,255,0.015))' }}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <AlertCircle size={9} color={T.amber} />
                  <span className="text-[9px] font-bold" style={{ color: T.amber }}>{tai('conflictInterpretation')}</span>
                </div>
                <p className="text-[9px] leading-5" style={{ color: T.text2 }}>
                  {/* FIX React Error #31: AI may return objects instead of strings */}
                  {safeStr(data.conflictExplanation)}
                </p>
              </div>
            )}

            {/* Vote Distribution */}
            <div className="space-y-1.5">
              <div className="text-[8px] font-bold px-1 uppercase tracking-widest" style={{ color: T.text2 }}>{tai('voteDistribution')}</div>
              {data.analyses.map((a, i) => {
                // FIX React Error #31: Sanitize AI vote data — AI may return objects instead of strings
                const safeVote = safeStr(a.vote) as 'BUY' | 'SELL' | 'HOLD'
                const safeConfidence = safeNum(a.confidence, 50)
                const voteColor = safeVote === 'BUY' ? T.green : safeVote === 'SELL' ? T.red : T.amber
                const isAIModel = isRealAI && !a.model.includes('Scanner') && !a.model.includes('Risk/') && !a.model.includes('MTF/') && !a.model.includes('Execution/') && !a.model.includes('Fallback')
                const modelColor = getModelColor(a.model)
                const modelShortName = getModelShortName(a.model)
                return (
                  <div
                    key={a.model + '-' + i}
                    className="card transition-colors group"
                    style={{
                      padding: '10px 11px',
                      border: `1px solid ${isAIModel ? 'rgba(179,136,255,0.15)' : 'rgba(255,255,255,0.05)'}`,
                      background: isAIModel ? 'rgba(179,136,255,0.03)' : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded-md flex items-center justify-center" style={{ background: `${voteColor}15` }}>
                          {safeVote === 'BUY'
                            ? <TrendingUp size={9} color={voteColor} />
                            : safeVote === 'SELL'
                            ? <TrendingDown size={9} color={voteColor} />
                            : <Minus size={9} color={voteColor} />}
                        </div>
                        <span className="text-[10px] font-bold text-white/90">{safeStr(a.role)}</span>
                        {isAIModel && (
                          <span style={{ fontSize: 6, padding: '1px 4px', borderRadius: 3, background: `${modelColor}20`, color: modelColor, fontFamily: 'monospace', fontWeight: 700, border: `1px solid ${modelColor}30` }}>{modelShortName}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[8px] font-bold px-1.5 py-px rounded" style={{ background: `${voteColor}15`, color: voteColor }}>
                          {safeStr(a.vote)}
                        </span>
                        <span className="text-[8px] font-mono" style={{ color: T.text2 }}>{safeNum(a.confidence, 0)}%</span>
                      </div>
                    </div>
                    <div className="w-full h-0.5 bg-white/5 rounded-full overflow-hidden mb-1.5">
                      <div
                        className="h-full transition-all duration-1000"
                        style={{ width: `${safeConfidence}%`, background: voteColor, boxShadow: `0 0 6px ${voteColor}40` }}
                      />
                    </div>
                    <p className="text-[8px] leading-relaxed" style={{ color: T.text2 }}>
                      {/* FIX React Error #31: AI may return objects instead of strings */}
                      {safeStr(a.reason)}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      <Cpu size={6} color={T.text2} style={{ opacity: 0.5 }} />
                      <span style={{ fontSize: 6, color: T.text2, opacity: 0.6, fontFamily: 'monospace' }}>{safeStr(a.model)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 flex items-center justify-between" style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: T.bg2 }}>
        <div className="flex items-center gap-1" style={{ opacity: 0.4 }}>
          <Shield size={9} />
          <span className="text-[7px] font-bold uppercase">{isRealAI ? tai('realAIEngine') : tai('quantumAIEngine')}</span>
        </div>
        <div className="flex items-center gap-1.5" style={{ opacity: 0.4 }}>
          <Heart size={7} color={keepAliveStatus?.nestJSUp ? T.green : T.amber} />
          <Info size={9} />
          <span className="text-[7px] font-bold">{tai('councilVersion')} — {isRealAI ? `${data?.meta?.modelsResponded || '?'}/${data?.meta?.modelsExpected || 8} AI` : tai('rolesCount', { count: 8 })}</span>
        </div>
      </div>
    </div>
  )
}
