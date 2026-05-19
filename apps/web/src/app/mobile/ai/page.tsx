'use client'

import { useEffect, useState } from 'react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { Brain } from 'lucide-react'

function safeConfidence(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val
  if (val && typeof val === 'object' && 'compositeScore' in (val as Record<string, unknown>)) return (val as { compositeScore: number }).compositeScore ?? 0
  return Number.isFinite(Number(val)) ? Number(val) : 0
}

export default function MobileAIPage() {
  const { selectedSymbol } = useSymbolStore()
  const [consensus, setConsensus] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchConsensus() {
      try {
        const res = await fetch(`/api/ai/consensus?symbol=${selectedSymbol}`)
        if (res.ok) { const data = await res.json(); if (data.success) setConsensus(data.data) }
      } catch { /* */ } finally { setLoading(false) }
    }
    fetchConsensus()
    const interval = setInterval(fetchConsensus, 60000)
    return () => clearInterval(interval)
  }, [selectedSymbol])

  const rec = (consensus?.recommendation as string) ?? 'HOLD'
  const score = safeConfidence(consensus?.consensusScore)
  const analyses = (consensus?.analyses as Array<Record<string, unknown>>) ?? []
  const masterStrategy = (consensus?.masterStrategy as string) ?? ''

  const recColor = rec === 'BUY' ? '#00FFA3' : rec === 'SELL' ? '#FF4757' : '#FFB800'
  const recLabel = rec === 'BUY' ? 'شراء' : rec === 'SELL' ? 'بيع' : 'انتظار'

  const votes = analyses.reduce((acc: { buy: number; sell: number; hold: number }, a: Record<string, unknown>) => {
    if (a.vote === 'BUY') acc.buy += 1; else if (a.vote === 'SELL') acc.sell += 1; else acc.hold += 1; return acc
  }, { buy: 0, sell: 0, hold: 0 })
  const total = votes.buy + votes.sell + votes.hold

  return (
    <div className="m-page">
      <MobilePageHeader title="مجلس الذكاء الاصطناعي" subtitle="تحليل من 6 نماذج AI" />

      {/* Consensus overview */}
      <IOSCard highlight>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: `${recColor}12`, border: `1.5px solid ${recColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: recColor, fontFamily: "'JetBrains Mono', monospace" }}>{score}%</span>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: recColor, fontFamily: "'Cairo', sans-serif" }}>توصية: {recLabel}</div>
            <div style={{ fontSize: 12, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>{selectedSymbol}</div>
          </div>
        </div>
        {total > 0 && (
          <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', direction: 'ltr' }}>
            <div style={{ width: `${(votes.buy / total) * 100}%`, background: '#00FFA3', borderRadius: 4 }} />
            <div style={{ width: `${(votes.hold / total) * 100}%`, background: '#FFB800', borderRadius: 4 }} />
            <div style={{ width: `${(votes.sell / total) * 100}%`, background: '#FF4757', borderRadius: 4 }} />
          </div>
        )}
        {total > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>
            <span style={{ color: '#00FFA3' }}>شراء {votes.buy}</span>
            <span style={{ color: '#FFB800' }}>انتظار {votes.hold}</span>
            <span style={{ color: '#FF4757' }}>بيع {votes.sell}</span>
          </div>
        )}
      </IOSCard>

      {/* Master strategy */}
      {masterStrategy && (
        <IOSCard>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>الاستراتيجية الرئيسية</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#00D4FF', fontFamily: "'Cairo', sans-serif" }}>{masterStrategy}</div>
        </IOSCard>
      )}

      {/* Model votes */}
      {analyses.length > 0 && (
        <IOSCard>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#FFF', fontFamily: "'Cairo', sans-serif", marginBottom: 10 }}>تصويت النماذج</div>
          {analyses.map((a: Record<string, unknown>, i: number) => {
            const vote = (a.vote as string) ?? 'HOLD'
            const confidence = Number(a.confidence ?? 0)
            const model = (a.model as string) ?? `نموذج ${i + 1}`
            const vColor = vote === 'BUY' ? '#00FFA3' : vote === 'SELL' ? '#FF4757' : '#FFB800'
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < analyses.length - 1 ? '0.5px solid rgba(255,255,255,0.06)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Brain size={14} color="#B388FF" />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#FFF', fontFamily: "'Cairo', sans-serif" }}>{model}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 60, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, confidence)}%`, height: '100%', background: vColor, borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: vColor, fontFamily: "'JetBrains Mono', monospace", minWidth: 40, textAlign: 'left' }}>{confidence}%</span>
                </div>
              </div>
            )
          })}
        </IOSCard>
      )}

      {loading && !consensus && (
        <IOSCard>
          <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 12, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>جارٍ تحميل التحليلات...</div>
        </IOSCard>
      )}
      <div style={{ height: 16 }} />
    </div>
  )
}
