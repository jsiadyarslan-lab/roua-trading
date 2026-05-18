'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { Brain, TrendingUp, TrendingDown, Minus, Loader2, RefreshCw, Users, ChevronDown } from 'lucide-react'

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }
const SYMBOLS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XAU/USD', 'EUR/USD', 'GBP/USD']

function safeConfidence(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val
  if (val && typeof val === 'object' && 'compositeScore' in (val as any)) return (val as any).compositeScore ?? 0
  return Number.isFinite(Number(val)) ? Number(val) : 0
}

export default function MobileAIPage() {
  const router = useRouter()
  const { selectedSymbol, setSelectedSymbol } = useSymbolStore()
  const [consensus, setConsensus] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [symbolMenuOpen, setSymbolMenuOpen] = useState(false)

  const fetchConsensus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ai/consensus?symbol=${selectedSymbol}`)
      if (res.ok) {
        const data = await res.json()
        if (data.success) setConsensus(data.data)
      }
    } catch { /* */ } finally { setLoading(false) }
  }, [selectedSymbol])

  useEffect(() => {
    fetchConsensus()
    const interval = setInterval(fetchConsensus, 120000)
    return () => clearInterval(interval)
  }, [fetchConsensus])

  const rec = consensus?.recommendation ?? 'HOLD'
  const score = safeConfidence(consensus?.consensusScore)
  const analyses = consensus?.analyses ?? []
  const masterStrategy = consensus?.masterStrategy ?? ''
  const conflictExplanation = consensus?.conflictExplanation ?? ''

  const recColor = rec === 'BUY' ? C.success : rec === 'SELL' ? C.danger : C.amber
  const recLabel = rec === 'BUY' ? 'شراء' : rec === 'SELL' ? 'بيع' : 'انتظار'
  const recIcon = rec === 'BUY' ? <TrendingUp size={20} /> : rec === 'SELL' ? <TrendingDown size={20} /> : <Minus size={20} />

  const votes = analyses.reduce((acc: { buy: number; sell: number; hold: number }, a: any) => {
    if (a.vote === 'BUY') acc.buy += 1
    else if (a.vote === 'SELL') acc.sell += 1
    else acc.hold += 1
    return acc
  }, { buy: 0, sell: 0, hold: 0 })
  const totalVotes = votes.buy + votes.sell + votes.hold

  return (
    <div className="m-page">
      <MobilePageHeader
        title="مجلس الذكاء الاصطناعي"
        subtitle="إجماع 6 نماذج AI"
        onBack={() => router.back()}
        right={
          <div style={{ position: 'relative' }}>
            <button onClick={() => setSymbolMenuOpen(!symbolMenuOpen)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, background: 'rgba(0,212,255,0.08)', border: '0.5px solid rgba(0,212,255,0.2)', cursor: 'pointer' }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: C.accent, fontFamily: "'JetBrains Mono', monospace" }}>{selectedSymbol}</span>
              <ChevronDown size={12} color={C.accent} />
            </button>
            {symbolMenuOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 60, minWidth: 140, maxHeight: 200, overflowY: 'auto', background: 'rgba(15,17,23,0.98)', backdropFilter: 'blur(20px)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 8, padding: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.7)' }}>
                {SYMBOLS.map(sym => (
                  <button key={sym} onClick={() => { setSelectedSymbol(sym); setSymbolMenuOpen(false) }} style={{ width: '100%', padding: '7px 8px', borderRadius: 4, background: selectedSymbol === sym ? 'rgba(0,212,255,0.12)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'right', display: 'block' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: selectedSymbol === sym ? C.accent : C.text, fontFamily: "'JetBrains Mono', monospace" }}>{sym}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        }
      />

      {/* Consensus Overview */}
      <IOSCard highlight>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: `${recColor}15`, border: `1px solid ${recColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: recColor }}>
              {recIcon}
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: recColor, fontFamily: "'Cairo', sans-serif" }}>توصية: {recLabel}</div>
              <div style={{ fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{selectedSymbol} — ثقة {score}%</div>
            </div>
          </div>
          <button onClick={fetchConsensus} disabled={loading} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <RefreshCw size={14} color={C.text2} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Vote distribution bar */}
        {totalVotes > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.success, fontFamily: "'Cairo', sans-serif" }}>شراء {votes.buy}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.amber, fontFamily: "'Cairo', sans-serif" }}>انتظار {votes.hold}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.danger, fontFamily: "'Cairo', sans-serif" }}>بيع {votes.sell}</span>
            </div>
            <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', direction: 'ltr' }}>
              <div style={{ width: `${(votes.buy / totalVotes) * 100}%`, background: C.success, borderRadius: 3, transition: 'width 0.5s' }} />
              <div style={{ width: `${(votes.hold / totalVotes) * 100}%`, background: C.amber, borderRadius: 3, transition: 'width 0.5s' }} />
              <div style={{ width: `${(votes.sell / totalVotes) * 100}%`, background: C.danger, borderRadius: 3, transition: 'width 0.5s' }} />
            </div>
          </div>
        )}

        {/* Score circle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 0' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', border: `3px solid ${recColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', background: `${recColor}08` }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: recColor, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{score}</span>
            <span style={{ fontSize: 8, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>ثقة %</span>
          </div>
        </div>
      </IOSCard>

      {/* Master Strategy */}
      {masterStrategy && (
        <IOSCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Brain size={14} color={C.accent} />
            <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>الاستراتيجية الرئيسية</span>
          </div>
          <p style={{ fontSize: 12, color: C.text2, fontFamily: "'Cairo', sans-serif", lineHeight: 1.7, margin: 0 }}>{masterStrategy}</p>
          {conflictExplanation && (
            <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 10, background: `${C.amber}08`, border: `0.5px solid ${C.amber}18` }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.amber, fontFamily: "'Cairo', sans-serif" }}>تعارض: </span>
              <span style={{ fontSize: 10, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>{conflictExplanation}</span>
            </div>
          )}
        </IOSCard>
      )}

      {/* Model Votes */}
      <div className="m-section">
        <div className="m-section__title">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={14} color={C.accent} />
            أصوات النماذج
          </div>
        </div>
      </div>

      {loading && !consensus ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <Loader2 size={24} className="animate-spin" color={C.accent} />
          <span style={{ fontSize: 12, color: C.text2, fontFamily: "'Cairo', sans-serif", marginRight: 8 }}>جارٍ تحليل المجلس...</span>
        </div>
      ) : (
        analyses.map((a: any, i: number) => {
          const voteColor = a.vote === 'BUY' ? C.success : a.vote === 'SELL' ? C.danger : C.amber
          const voteLabel = a.vote === 'BUY' ? 'شراء' : a.vote === 'SELL' ? 'بيع' : 'انتظار'
          const conf = safeConfidence(a.confidence)
          return (
            <IOSCard key={i}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: `${voteColor}10`, border: `0.5px solid ${voteColor}25`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 900, color: voteColor, fontFamily: "'JetBrains Mono', monospace" }}>{conf}%</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: "'Cairo', sans-serif" }}>{a.role}</div>
                    <div style={{ fontSize: 9, color: C.text2, fontFamily: "'JetBrains Mono', monospace" }}>{a.model}</div>
                  </div>
                </div>
                <div style={{ padding: '4px 12px', borderRadius: 8, background: `${voteColor}12`, border: `0.5px solid ${voteColor}25` }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: voteColor, fontFamily: "'Cairo', sans-serif" }}>{voteLabel}</span>
                </div>
              </div>
              {/* Confidence bar */}
              <div style={{ height: 3, background: 'rgba(255,255,255,0.04)', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ height: '100%', width: `${conf}%`, background: `linear-gradient(90deg, ${voteColor}, ${voteColor}60)`, borderRadius: 2, transition: 'width 0.5s' }} />
              </div>
              {/* Reasoning */}
              <p style={{ fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif", lineHeight: 1.7, margin: 0 }}>{a.reason}</p>
              {a.featuresUsed && a.featuresUsed.length > 0 && (
                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  {a.featuresUsed.map((f: string, fi: number) => (
                    <span key={fi} style={{ fontSize: 8, fontWeight: 700, color: C.text2, background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: 4, fontFamily: "'JetBrains Mono', monospace" }}>{f}</span>
                  ))}
                </div>
              )}
            </IOSCard>
          )
        })
      )}

      <div style={{ height: 20 }} />
    </div>
  )
}
