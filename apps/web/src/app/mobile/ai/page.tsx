'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { Header, Card, SkelCard, SkelLine } from '@/components/mobile/FluxComponents'
import { Brain, TrendingUp, TrendingDown, Minus, RefreshCw, ChevronDown } from 'lucide-react'

/* ═══ Types ═══ */
interface Analysis {
  role: string
  model: string
  vote: 'BUY' | 'SELL' | 'HOLD'
  confidence: number
  reason: string
  featuresUsed?: string[]
}

interface ConsensusData {
  consensusScore: number
  recommendation: 'BUY' | 'SELL' | 'HOLD'
  analyses: Analysis[]
  conflictExplanation?: string
  masterStrategy?: string
  meta?: {
    symbol?: string
    price?: number
    modelsResponded?: number
    modelsExpected?: number
    aiEngine?: string
    source?: string
    processingTimeMs?: number
  }
}

/* ═══ Symbol Selector ═══ */
const SYMBOLS = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'XAU/USD', 'EUR/USD']

function SymbolSelector({ selected, onChange }: { selected: string; onChange: (s: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative', margin: '0 var(--s4) var(--s2)' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '8px 12px', borderRadius: 10,
          background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)',
          color: '#FFF', fontSize: 13, fontWeight: 800, fontFamily: 'var(--f-cairo)',
          cursor: 'pointer', direction: 'rtl',
        }}
      >
        <span>{selected}</span>
        <ChevronDown size={14} color="rgba(255,255,255,0.5)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
          background: 'rgba(26,29,41,0.98)', borderRadius: 10,
          border: '0.5px solid rgba(0,212,255,0.15)', marginTop: 4, overflow: 'hidden',
        }}>
          {SYMBOLS.map(s => (
            <button
              key={s}
              onClick={() => { onChange(s); setOpen(false) }}
              style={{
                display: 'block', width: '100%', padding: '10px 12px', textAlign: 'right',
                background: s === selected ? 'rgba(0,212,255,0.08)' : 'transparent',
                border: 'none', color: s === selected ? '#00D4FF' : '#FFF',
                fontSize: 12, fontWeight: 800, fontFamily: 'var(--f-mono)', cursor: 'pointer',
                borderBottom: '0.5px solid rgba(255,255,255,0.04)',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══ Voting Bar ═══ */
function VotingBar({ analyses }: { analyses: Analysis[] }) {
  const buyCount = analyses.filter(a => a.vote === 'BUY').length
  const sellCount = analyses.filter(a => a.vote === 'SELL').length
  const holdCount = analyses.filter(a => a.vote === 'HOLD').length
  const total = analyses.length || 1
  const buyPct = (buyCount / total) * 100
  const sellPct = (sellCount / total) * 100
  const holdPct = (holdCount / total) * 100

  return (
    <Card>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-cairo)', marginBottom: 10 }}>
        توزيع الأصوات
      </div>
      {/* Bar */}
      <div style={{ display: 'flex', height: 24, borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
        {buyPct > 0 && (
          <div style={{ width: `${buyPct}%`, background: 'linear-gradient(90deg, #00FFA3, #00D68F)', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: buyPct > 8 ? undefined : 28 }}>
            <span style={{ fontSize: 9, fontWeight: 900, color: '#000', fontFamily: 'var(--f-mono)' }}>{buyCount}</span>
          </div>
        )}
        {holdPct > 0 && (
          <div style={{ width: `${holdPct}%`, background: 'linear-gradient(90deg, #FFB800, #FF9F43)', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: holdPct > 8 ? undefined : 28 }}>
            <span style={{ fontSize: 9, fontWeight: 900, color: '#000', fontFamily: 'var(--f-mono)' }}>{holdCount}</span>
          </div>
        )}
        {sellPct > 0 && (
          <div style={{ width: `${sellPct}%`, background: 'linear-gradient(90deg, #FF4757, #FF6B6B)', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: sellPct > 8 ? undefined : 28 }}>
            <span style={{ fontSize: 9, fontWeight: 900, color: '#FFF', fontFamily: 'var(--f-mono)' }}>{sellCount}</span>
          </div>
        )}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', justifyContent: 'space-around' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: '#00FFA3' }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: '#00FFA3', fontFamily: 'var(--f-cairo)' }}>شراء {buyCount}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: '#FFB800' }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: '#FFB800', fontFamily: 'var(--f-cairo)' }}>انتظار {holdCount}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: '#FF4757' }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: '#FF4757', fontFamily: 'var(--f-cairo)' }}>بيع {sellCount}</span>
        </div>
      </div>
    </Card>
  )
}

/* ═══ Model Analysis Card ═══ */
function ModelCard({ analysis }: { analysis: Analysis }) {
  const voteColor = analysis.vote === 'BUY' ? '#00FFA3' : analysis.vote === 'SELL' ? '#FF4757' : '#FFB800'
  const voteLabel = analysis.vote === 'BUY' ? 'شراء' : analysis.vote === 'SELL' ? 'بيع' : 'انتظار'
  const VoteIcon = analysis.vote === 'BUY' ? TrendingUp : analysis.vote === 'SELL' ? TrendingDown : Minus

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: `${voteColor}12`, border: `0.5px solid ${voteColor}25`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <VoteIcon size={16} color={voteColor} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#FFF', fontFamily: 'var(--f-cairo)' }}>{analysis.role}</div>
            <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--f-mono)' }}>{analysis.model}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: voteColor, fontFamily: 'var(--f-mono)' }}>{analysis.confidence}%</span>
          <div style={{ padding: '2px 8px', borderRadius: 6, background: `${voteColor}12`, border: `0.5px solid ${voteColor}25` }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: voteColor, fontFamily: 'var(--f-cairo)' }}>{voteLabel}</span>
          </div>
        </div>
      </div>
      {/* Confidence bar */}
      <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', marginBottom: 8 }}>
        <div style={{ height: '100%', borderRadius: 2, background: voteColor, width: `${analysis.confidence}%`, transition: 'width 500ms' }} />
      </div>
      <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--f-cairo)', lineHeight: 1.6 }}>
        {analysis.reason}
      </div>
    </Card>
  )
}

/* ═══ Main Page ═══ */
export default function AICouncilPage() {
  const { selectedSymbol, setSelectedSymbol } = useSymbolStore()
  const quotes = useMarketStore(s => s.quotes)
  const [consensus, setConsensus] = useState<ConsensusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchConsensus = useCallback(async (symbol: string, showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    try {
      const res = await fetch('/api/ai/consensus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success) setConsensus(data.data)
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchConsensus(selectedSymbol)
    const interval = setInterval(() => fetchConsensus(selectedSymbol), 120000)
    return () => clearInterval(interval)
  }, [selectedSymbol, fetchConsensus])

  const rec = consensus?.recommendation ?? 'HOLD'
  const score = consensus?.consensusScore ?? 0
  const analyses = consensus?.analyses ?? []
  const color = rec === 'BUY' ? '#00FFA3' : rec === 'SELL' ? '#FF4757' : '#FFB800'
  const recLabel = rec === 'BUY' ? 'شراء' : rec === 'SELL' ? 'بيع' : 'انتظار'
  const recStrength = score >= 80 ? 'قوي' : score >= 60 ? 'واضح' : 'محتمل'

  const quote = quotes[selectedSymbol]
  const price = quote?.price ?? null

  return (
    <div className="f-page">
      <Header title="مجلس الذكاء الاصطناعي" subtitle="تحليل متعدد النماذج" />

      <SymbolSelector selected={selectedSymbol} onChange={setSelectedSymbol} />

      {/* Main Recommendation */}
      {loading ? (
        <SkelCard lines={4} />
      ) : (
        <Card highlight>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 16, flexShrink: 0,
              background: `linear-gradient(135deg, ${color}20, ${color}08)`,
              border: `1.5px solid ${color}35`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Brain size={28} color={color} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 22, fontWeight: 900, color, fontFamily: 'var(--f-cairo)' }}>{recLabel}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>{recStrength}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 28, fontWeight: 900, color, fontFamily: 'var(--f-mono)' }}>{score}%</span>
                <span style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>ثقة</span>
              </div>
            </div>
            <button
              onClick={() => fetchConsensus(selectedSymbol, true)}
              disabled={refreshing}
              style={{
                width: 36, height: 36, borderRadius: 10, border: '0.5px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={16} color="rgba(255,255,255,0.5)" style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>

          {/* Price & meta */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
            <div>
              <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>السعر الحالي</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#FFF', fontFamily: 'var(--f-mono)' }}>
                {price ? price.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: price > 100 ? 2 : 4 }) : '—'}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>النماذج</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#FFF', fontFamily: 'var(--f-mono)' }}>
                {consensus?.meta?.modelsResponded ?? analyses.length}/{consensus?.meta?.modelsExpected ?? 7}
              </div>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 9, color: '#8B92A8', fontFamily: 'var(--f-cairo)' }}>المصدر</div>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#00D4FF', fontFamily: 'var(--f-cairo)' }}>
                {consensus?.meta?.aiEngine?.includes('Direct') ? 'AI مباشر' : consensus?.meta?.aiEngine?.includes('Merged') ? 'AI مدمج' : consensus?.meta?.aiEngine?.includes('Scanner') ? 'قواعد' : 'AI'}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Master Strategy */}
      {consensus?.masterStrategy && (
        <Card>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#B388FF', fontFamily: 'var(--f-cairo)', marginBottom: 6 }}>الاستراتيجية الرئيسية</div>
          <div style={{ fontSize: 11, color: '#F0F2F5', fontFamily: 'var(--f-cairo)', lineHeight: 1.7 }}>{consensus.masterStrategy}</div>
        </Card>
      )}

      {/* Conflict */}
      {consensus?.conflictExplanation && (
        <Card>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#FFB800', fontFamily: 'var(--f-cairo)', marginBottom: 6 }}>تحليل التعارض</div>
          <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: 'var(--f-cairo)', lineHeight: 1.6 }}>{consensus.conflictExplanation}</div>
        </Card>
      )}

      {/* Voting Bar */}
      {analyses.length > 0 && <VotingBar analyses={analyses} />}

      {/* Individual Models */}
      {analyses.length > 0 && (
        <div className="f-section__title" style={{ marginTop: 8 }}>تحليل النماذج الفردية</div>
      )}

      {loading ? (
        <>{[1, 2, 3].map(i => <SkelCard key={i} lines={3} />)}</>
      ) : (
        <div className="f-stagger">
          {analyses.map((a, i) => (
            <ModelCard key={`${a.role}-${i}`} analysis={a} />
          ))}
        </div>
      )}

      {!loading && analyses.length === 0 && (
        <div className="f-empty">
          <Brain size={40} color="rgba(255,255,255,0.1)" />
          <div className="f-empty__title">لا توجد تحليلات متاحة حالياً</div>
        </div>
      )}

      <div style={{ height: 80 }} />
    </div>
  )
}
