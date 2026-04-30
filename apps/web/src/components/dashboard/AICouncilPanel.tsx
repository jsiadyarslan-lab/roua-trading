'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Brain, Shield, Zap, TrendingUp, TrendingDown, Minus, Info, RefreshCw, Layers, AlertCircle, Cpu, Wifi, WifiOff } from 'lucide-react'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { useTabAlertStore } from '@/hooks/useTabAlertStore'

const T = {
  bg: '#0F1113',
  accent: '#00E5FF',
  green: '#00C853',
  red: '#FF3B30',
  amber: '#FFB800',
  text: '#E6EBF5',
  text2: '#8090A8',
  purple: '#B388FF',
}

interface Analysis {
  role: string
  model: string
  vote: 'BUY' | 'SELL' | 'HOLD'
  confidence: number
  reason: string
}

interface ConsensusData {
  consensusScore: number
  recommendation: 'BUY' | 'SELL' | 'HOLD'
  analyses: Analysis[]
  masterStrategy: string
  conflictExplanation?: string
  meta?: { symbol: string; price: number; rsi: number; processingTimeMs: number; source?: string; freshness?: string; aiEngine?: string; modelsUsed?: string[]; timestamp?: string }
}

export function AICouncilPanel() {
  const { selectedSymbol } = useSymbolStore()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ConsensusData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)
  const [dataSource, setDataSource] = useState<'real-ai' | 'scanner-rules' | 'fallback' | 'unknown'>('unknown')
  const [countdown, setCountdown] = useState(180)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [loadingPhase, setLoadingPhase] = useState(0)
  const phases = ['جاري تجميع بيانات السوق الحية...', 'تحليل الزخم عبر النماذج الذكية...', 'مناقشة الإشارات الفنية...', 'بناء استراتيجية الإجماع النهائي...']

  const fetchConsensus = useCallback(async () => {
    setLoading(true)
    setError(null)
    setCountdown(180)
    try {
      const res = await fetch('/api/ai/consensus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: selectedSymbol }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`خطأ ${res.status}: ${text.slice(0, 100)}`)
      }

      const j = await res.json()
      if (j.success) {
        setData(j.data)
        setDataSource(j.source || 'unknown')
        setLastUpdate(new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))

        // Push alert when council has a directional recommendation with high consensus
        if (j.data?.recommendation && j.data.recommendation !== 'HOLD' && j.data.consensusScore >= 60) {
          useTabAlertStore.getState().pushAlert('council', {
            action: j.data.recommendation,
            label: `${j.data.recommendation === 'BUY' ? '⬆ شراء' : '⬇ بيع'} ${j.data.consensusScore}%`,
            color: j.source === 'real-ai' ? '#B388FF' : '#FFB800',
          })
        }
      } else {
        throw new Error(j.error || 'فشل في الحصول على الإجماع')
      }
    } catch (e: any) {
      setError(e.message || 'خطأ غير متوقع')
    } finally {
      setLoading(false)
    }
  }, [selectedSymbol])

  // Initial fetch on symbol change
  useEffect(() => {
    fetchConsensus()
  }, [fetchConsensus])

  // Countdown Timer Logic
  useEffect(() => {
    if (loading) return // Pause countdown while fetching
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          fetchConsensus()
          return 180
        }
        return c - 1
      })
    }, 1000)
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
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

  const isRealAI = dataSource === 'real-ai'
  const recColor = data?.recommendation === 'BUY' ? T.green : data?.recommendation === 'SELL' ? T.red : T.amber
  const formatCountdown = `${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, '0')}`

  return (
    <div className="flex flex-col h-full overflow-hidden custom-scrollbar" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01))', fontFamily: "'Cairo', sans-serif", direction: 'rtl', border: `1px solid ${isRealAI ? 'rgba(0,229,255,0.15)' : 'rgba(0,229,255,0.08)'}`, borderRadius: 16 }}>
      {/* Header */}
      <div className="p-3 border-b border-white/5 flex items-center justify-between" style={{ background: isRealAI ? 'linear-gradient(90deg, rgba(0,229,255,0.18), rgba(179,136,255,0.08), transparent)' : 'linear-gradient(90deg, rgba(0,229,255,0.12), transparent)' }}>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Brain size={16} color={isRealAI ? T.purple : T.accent} />
            {!loading && data && (
              <div className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${isRealAI ? 'bg-purple-500' : 'bg-green-500'} animate-ping`} />
            )}
          </div>
          <div>
            <h3 className="text-[11px] font-bold text-white">مجلس الذكاء الاصطناعي</h3>
            <p className="text-[8px] font-mono" style={{ color: isRealAI ? T.purple + 'cc' : T.accent + '80' }}>
              {data?.meta ? (
                <>
                  {data.meta.symbol} • RSI: {data.meta.rsi} • {data.meta.processingTimeMs}ms
                  {isRealAI ? ' • 🧠 AI حقيقي' : data.meta.aiEngine ? ` • ${data.meta.aiEngine.includes('Scanner') ? '📐 تحليل تقني' : data.meta.aiEngine}` : ' • 📐 تحليل تقني'}
                </>
              ) : `AI COUNCIL CONSENSUS ${lastUpdate ? `· ${lastUpdate}` : ''}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Data Source Badge */}
          <div className="flex items-center gap-1" style={{
            padding: '2px 6px',
            borderRadius: 4,
            background: isRealAI ? 'rgba(179,136,255,0.15)' : 'rgba(255,184,0,0.12)',
            border: `1px solid ${isRealAI ? 'rgba(179,136,255,0.3)' : 'rgba(255,184,0,0.2)'}`,
          }}>
            {isRealAI ? <Cpu size={8} color={T.purple} /> : <WifiOff size={8} color={T.amber} />}
            <span style={{ fontSize: 7, fontWeight: 700, color: isRealAI ? T.purple : T.amber, fontFamily: 'monospace' }}>
              {isRealAI ? '6 AI Models' : dataSource === 'scanner-rules' ? '📐 تقني' : 'FB'}
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
            title="تحديث التحليل"
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
              {isRealAI ? phases[loadingPhase] : 'جاري بناء التحليل التقني...'}
            </span>
            {isRealAI && (
              <div className="flex gap-1 mt-1 flex-wrap justify-center px-4">
                {['Gemini', 'Groq', 'GLM-4', 'HF', 'Ollama', 'Bedrock'].map((m, i) => {
                  const isActive = i % phases.length === loadingPhase
                  return (
                    <div 
                      key={i} 
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
              <p className="text-[10px] font-bold text-red-400 mb-1">فشل في التحليل</p>
              <p className="text-[9px] text-red-400/60">{error}</p>
              <button onClick={fetchConsensus} className="mt-2 text-[9px] text-red-400 underline">إعادة المحاولة</button>
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
                    ? 'خادم AI غير متصل — يُستخدم التحليل الفني كبديل'
                    : 'بيانات محدودة — وضع الانتظار الوقائي'}
                </span>
              </div>
            )}

            {isRealAI && (
              <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(179,136,255,0.06)', border: '1px solid rgba(179,136,255,0.15)' }}>
                <Cpu size={10} color={T.purple} />
                <span className="text-[8px]" style={{ color: T.purple }}>
                  تحليل AI حقيقي من {data.meta?.modelsUsed?.length || 6} نماذج — {data.meta?.processingTimeMs || 0}ms
                </span>
              </div>
            )}

            {/* Consensus Gauge */}
            <div className="relative p-3 rounded-xl text-center overflow-hidden" style={{ 
              background: '#0d0f12', 
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
                  {isRealAI ? 'AI LIVE' : 'LIVE'}
                </span>
              </div>

              <div className="text-[9px] mb-1 uppercase tracking-widest relative z-10" style={{ color: T.text2 }}>درجة الإجماع</div>
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
                {data.recommendation === 'BUY' ? '⬆ قوة شرائية' : data.recommendation === 'SELL' ? '⬇ ضغط بيعي' : '◆ حياد — انتظار'}
              </div>
            </div>

            {/* Master Strategy */}
            <div className="card" style={{ padding: '10px 11px', border: `1px solid ${isRealAI ? T.purple + '20' : T.accent + '15'}` }}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Zap size={9} color={isRealAI ? T.purple : T.accent} />
                <span className="text-[9px] font-bold" style={{ color: isRealAI ? T.purple : T.accent }}>الاستراتيجية الموحدة</span>
              </div>
              <p className="text-[10px] leading-5" style={{ color: T.text + 'cc' }}>
                {data.masterStrategy}
              </p>
            </div>

            {data.conflictExplanation && (
              <div className="card" style={{ padding: '10px 11px', border: `1px solid ${T.amber}25`, background: 'linear-gradient(180deg, rgba(255,184,0,0.08), rgba(255,255,255,0.015))' }}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <AlertCircle size={9} color={T.amber} />
                  <span className="text-[9px] font-bold" style={{ color: T.amber }}>تفسير التعارض</span>
                </div>
                <p className="text-[9px] leading-5" style={{ color: T.text2 }}>
                  {data.conflictExplanation}
                </p>
              </div>
            )}

            {/* Vote Distribution */}
            <div className="space-y-1.5">
              <div className="text-[8px] font-bold px-1 uppercase tracking-widest" style={{ color: T.text2 }}>توزيع أصوات المجلس</div>
              {data.analyses.map((a, i) => {
                const voteColor = a.vote === 'BUY' ? T.green : a.vote === 'SELL' ? T.red : T.amber
                const isAIModel = isRealAI && !a.model.includes('Scanner') && !a.model.includes('Risk/') && !a.model.includes('MTF/') && !a.model.includes('Execution/')
                return (
                  <div
                    key={i}
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
                          {a.vote === 'BUY'
                            ? <TrendingUp size={9} color={voteColor} />
                            : a.vote === 'SELL'
                            ? <TrendingDown size={9} color={voteColor} />
                            : <Minus size={9} color={voteColor} />}
                        </div>
                        <span className="text-[10px] font-bold text-white/90">{a.role}</span>
                        {isAIModel && (
                          <span style={{ fontSize: 6, padding: '1px 4px', borderRadius: 3, background: 'rgba(179,136,255,0.15)', color: T.purple, fontFamily: 'monospace', fontWeight: 700 }}>AI</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[8px] font-bold px-1.5 py-px rounded" style={{ background: `${voteColor}15`, color: voteColor }}>
                          {a.vote}
                        </span>
                        <span className="text-[8px] font-mono" style={{ color: T.text2 }}>{a.confidence}%</span>
                      </div>
                    </div>
                    <div className="w-full h-0.5 bg-white/5 rounded-full overflow-hidden mb-1.5">
                      <div
                        className="h-full transition-all duration-1000"
                        style={{ width: `${a.confidence}%`, background: voteColor, boxShadow: `0 0 6px ${voteColor}40` }}
                      />
                    </div>
                    <p className="text-[8px] leading-relaxed" style={{ color: T.text2 }}>
                      {a.reason}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      <Cpu size={6} color={T.text2} style={{ opacity: 0.5 }} />
                      <span style={{ fontSize: 6, color: T.text2, opacity: 0.6, fontFamily: 'monospace' }}>{a.model}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 flex items-center justify-between" style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: '#080a0c' }}>
        <div className="flex items-center gap-1" style={{ opacity: 0.4 }}>
          <Shield size={9} />
          <span className="text-[7px] font-bold uppercase">{isRealAI ? 'Real AI Engine' : 'Quantum AI Engine'}</span>
        </div>
        <div className="flex items-center gap-1" style={{ opacity: 0.4 }}>
          <Info size={9} />
          <span className="text-[7px] font-bold">Council v3.0 — {isRealAI ? '6 AI Models' : '6 Roles'}</span>
        </div>
      </div>
    </div>
  )
}
