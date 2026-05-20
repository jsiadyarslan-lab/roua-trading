'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { Brain, ChevronLeft } from 'lucide-react'

export default function AIPage() {
  const router = useRouter()
  const { selectedSymbol } = useSymbolStore()
  const [consensus, setConsensus] = useState<Record<string, any> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchConsensus() {
      try { const res = await fetch(`/api/ai/consensus?symbol=${selectedSymbol}`); if (res.ok) { const data = await res.json(); if (data.success) setConsensus(data.data) } } catch {} finally { setLoading(false) }
    }
    fetchConsensus()
    const interval = setInterval(fetchConsensus, 60000)
    return () => clearInterval(interval)
  }, [selectedSymbol])

  const rec = (consensus?.recommendation as string) ?? 'HOLD'
  const score = typeof consensus?.consensusScore === 'number' ? consensus.consensusScore : 0
  const color = rec === 'BUY' ? '#00FFA3' : rec === 'SELL' ? '#FF4757' : '#FFB800'
  const recLabel = rec === 'BUY' ? 'شراء' : rec === 'SELL' ? 'بيع' : 'انتظار'

  return (
    <div className="m-page" style={{ direction: 'rtl' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={() => router.back()} style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronLeft size={18} color="rgba(255,255,255,0.6)" /></button>
        <span style={{ fontSize: 20, fontWeight: 900, color: '#FFF', fontFamily: 'var(--cairo)' }}>مجلس الذكاء الاصطناعي</span>
      </div>
      <div className="m-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #B388FF, #A259FF)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Brain size={20} color="#FFF" /></div>
          <div><div style={{ fontSize: 15, fontWeight: 800, color: '#FFF', fontFamily: 'var(--cairo)' }}>6 نماذج AI</div><div style={{ fontSize: 10, color: '#B388FF', fontFamily: 'var(--cairo)' }}>{selectedSymbol}</div></div>
        </div>
        {!loading && consensus && (
          <div style={{ padding: '10px 14px', borderRadius: 12, background: `${color}08`, border: `0.5px solid ${color}18` }}>
            <div style={{ fontSize: 14, fontWeight: 800, color, fontFamily: 'var(--cairo)' }}>توصية: {recLabel}</div>
            <div style={{ fontSize: 11, color: '#8B92A8', fontFamily: 'var(--cairo)' }}>ثقة {score}%</div>
          </div>
        )}
        {loading && <div style={{ color: '#8B92A8', fontSize: 12, fontFamily: 'var(--cairo)' }}>جارٍ التحميل...</div>}
      </div>
    </div>
  )
}
