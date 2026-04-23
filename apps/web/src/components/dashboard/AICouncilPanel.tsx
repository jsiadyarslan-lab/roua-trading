'use client'

import { useState, useEffect } from 'react'
import { Brain, Shield, Zap, TrendingUp, TrendingDown, Minus, Info, RefreshCw, Layers } from 'lucide-react'
import { useSymbolStore } from '@/hooks/useSymbolStore'

const T = {
  bg: '#0F1113',
  card: '#16181A',
  border: 'rgba(0, 229, 255, 0.1)',
  accent: '#00E5FF',
  green: '#00C853',
  red: '#FF3B30',
  amber: '#FFB800',
  text: '#E6EBF5',
  text2: '#8090A8',
}

interface Analysis {
  role: string
  model: string
  vote: 'BUY' | 'SELL' | 'HOLD'
  confidence: number
  reason: string
}

export function AICouncilPanel() {
  const { selectedSymbol } = useSymbolStore()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<{
    consensusScore: number
    recommendation: 'BUY' | 'SELL' | 'HOLD'
    analyses: Analysis[]
    masterStrategy: string
  } | null>(null)

  const fetchConsensus = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ai/consensus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: selectedSymbol }),
      })
      const j = await res.json()
      if (j.success) setData(j.data)
    } catch (e) {
      console.error('Failed to fetch AI consensus', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchConsensus()
  }, [selectedSymbol])

  if (!data && !loading) return <div className="p-4 text-center text-xs opacity-40">جاري التحميل...</div>

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: T.bg, fontFamily: "'Cairo', sans-serif" }}>
      {/* Header with Pulse */}
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Brain size={18} color={T.accent} />
            <div className="absolute inset-0 bg-cyan-400/20 blur-md rounded-full animate-pulse" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">مجلس الذكاء الاصطناعي</h3>
            <p className="text-[9px] text-cyan-400/60 font-mono">AI COUNCIL CONSENSUS</p>
          </div>
        </div>
        <button 
          onClick={fetchConsensus} 
          disabled={loading}
          className="p-1.5 rounded-full hover:bg-white/5 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} color={T.text2} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-40 gap-4">
            <Layers size={32} className="animate-bounce text-cyan-500/30" />
            <span className="text-[10px] text-cyan-400/60 animate-pulse">جاري استشارة النماذج الستة...</span>
          </div>
        ) : data && (
          <>
            {/* Consensus Gauge */}
            <div className="relative p-4 rounded-xl border border-white/5 bg-white/[0.02] flex flex-col items-center text-center">
               <div className="absolute top-2 right-2 flex items-center gap-1">
                 <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping" />
                 <span className="text-[8px] text-green-500/80 font-bold">LIVE</span>
               </div>
               
               <div className="text-[10px] text-white/40 mb-1 uppercase tracking-tighter">درجة الإجماع</div>
               <div className="text-3xl font-black font-mono mb-1" style={{ color: data.recommendation === 'BUY' ? T.green : data.recommendation === 'SELL' ? T.red : T.amber }}>
                 {data.consensusScore}%
               </div>
               
               <div className="px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest" style={{ background: `${data.recommendation === 'BUY' ? T.green : data.recommendation === 'SELL' ? T.red : T.amber}20`, color: data.recommendation === 'BUY' ? T.green : data.recommendation === 'SELL' ? T.red : T.amber }}>
                 {data.recommendation === 'BUY' ? 'قوة شرائية' : data.recommendation === 'SELL' ? 'ضغط بيعي' : 'حياد'}
               </div>
            </div>

            {/* Strategy Summary */}
            <div className="p-3 rounded-lg border border-cyan-500/10 bg-cyan-500/5">
              <div className="flex items-center gap-2 mb-2">
                <Zap size={10} color={T.accent} />
                <span className="text-[10px] font-bold text-cyan-400">الاستراتيجية المقترحة</span>
              </div>
              <p className="text-[10px] leading-relaxed text-white/80">
                {data.masterStrategy}
              </p>
            </div>

            {/* Individual Votes */}
            <div className="space-y-2">
              <div className="text-[9px] font-bold text-white/30 uppercase px-1">توزيع الأصوات</div>
              {data.analyses.map((a, i) => (
                <div key={i} className="p-2 rounded-lg border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition-colors group">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-white/5 flex items-center justify-center">
                        {a.vote === 'BUY' ? <TrendingUp size={10} color={T.green} /> : a.vote === 'SELL' ? <TrendingDown size={10} color={T.red} /> : <Minus size={10} color={T.amber} />}
                      </div>
                      <span className="text-[10px] font-bold text-white/90">{a.role}</span>
                    </div>
                    <span className="text-[9px] font-mono text-white/40">{a.confidence}%</span>
                  </div>
                  <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full transition-all duration-1000" 
                      style={{ 
                        width: `${a.confidence}%`, 
                        background: a.vote === 'BUY' ? T.green : a.vote === 'SELL' ? T.red : T.amber,
                        boxShadow: `0 0 8px ${a.vote === 'BUY' ? T.green : a.vote === 'SELL' ? T.red : T.amber}40`
                      }} 
                    />
                  </div>
                  <div className="mt-1.5 text-[9px] text-white/40 leading-snug line-clamp-1 group-hover:line-clamp-none transition-all">
                    {a.reason}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-white/5 bg-black/20 flex items-center justify-between">
        <div className="flex items-center gap-1.5 opacity-40">
          <Shield size={10} />
          <span className="text-[8px] font-bold uppercase">Institutional Grade AI</span>
        </div>
        <div className="flex items-center gap-1 opacity-40">
          <Info size={10} />
          <span className="text-[8px] font-bold">Consensus V2.4</span>
        </div>
      </div>
    </div>
  )
}
