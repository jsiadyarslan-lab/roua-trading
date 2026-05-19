'use client'

import { useEffect, useState, useCallback } from 'react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { TrendingUp, TrendingDown, X, Loader2 } from 'lucide-react'

export default function MobilePositionsPage() {
  const positions = usePositionsStore(s => s.positions)
  const fetchPositions = usePositionsStore(s => s.fetchPositions)
  const quotes = useMarketStore(s => s.quotes)
  const [closing, setClosing] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState<string | null>(null)

  useEffect(() => { fetchPositions() }, [fetchPositions])

  const handleClose = useCallback(async (pos: { id?: string; dbId?: string; symbol: string; side: string }) => {
    const id = pos.dbId || pos.id
    if (!id) return
    setClosing(id)
    try {
      const res = await fetch('/api/smart-executor/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId: id }),
      })
      const data = await res.json()
      if (data.success) {
        usePositionsStore.getState().refreshAfterTrade()
      }
    } catch { /* silent */ } finally {
      setClosing(null)
      setConfirmClose(null)
    }
  }, [])

  return (
    <div className="m-page">
      <MobilePageHeader title="المراكز المفتوحة" subtitle={`${positions.length} مركز`} />

      {positions.length === 0 ? (
        <IOSCard>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <TrendingUp size={40} color="#8B92A8" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 14, fontWeight: 800, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>لا توجد مراكز مفتوحة</div>
          </div>
        </IOSCard>
      ) : (
        positions.map(pos => {
          const pnl = pos.unrealizedPnl ?? 0
          const pnlPct = pos.unrealizedPnlPct ?? 0
          const isUp = pnl >= 0
          const isLong = pos.side === 'long' || pos.side === 'LONG' || pos.side === 'BUY'
          const posId = pos.dbId || pos.id || ''
          const isConfirming = confirmClose === posId
          const isClosing = closing === posId

          return (
            <IOSCard key={posId}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: isLong ? 'rgba(0,255,163,0.1)' : 'rgba(255,69,58,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isLong ? <TrendingUp size={14} color="#00FFA3" /> : <TrendingDown size={14} color="#FF453A" />}
                  </div>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{pos.symbol}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: isLong ? '#00FFA3' : '#FF453A', fontFamily: "'Cairo', sans-serif", marginRight: 6 }}>{isLong ? 'شراء' : 'بيع'}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: isUp ? '#00FFA3' : '#FF453A', fontFamily: "'JetBrains Mono', monospace" }}>
                    {isUp ? '+' : ''}${pnl.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: isUp ? '#00FFA3' : '#FF453A', fontFamily: "'JetBrains Mono', monospace" }}>
                    {isUp ? '+' : ''}{pnlPct.toFixed(2)}%
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", marginBottom: 8 }}>
                <span>الكمية: {pos.qty}</span>
                <span>•</span>
                <span>الدخول: ${Number(pos.avgEntryPrice).toFixed(2)}</span>
                <span>•</span>
                <span>الحالي: ${Number(pos.currentPrice).toFixed(2)}</span>
              </div>

              {isConfirming ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleClose(pos)} disabled={isClosing} style={{ flex: 1, padding: '8px 0', borderRadius: 10, background: '#FF453A', border: 'none', color: '#FFF', fontSize: 11, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', opacity: isClosing ? 0.6 : 1 }}>
                    {isClosing ? 'جارٍ الإغلاق...' : 'تأكيد الإغلاق'}
                  </button>
                  <button onClick={() => setConfirmClose(null)} style={{ flex: 1, padding: '8px 0', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: 'none', color: '#8B92A8', fontSize: 11, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>إلغاء</button>
                </div>
              ) : (
                <button onClick={() => setConfirmClose(posId)} style={{ width: '100%', padding: '8px 0', borderRadius: 10, background: 'rgba(255,69,58,0.06)', border: '0.5px solid rgba(255,69,58,0.15)', color: '#FF453A', fontSize: 11, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>إغلاق المركز</button>
              )}
            </IOSCard>
          )
        })
      )}
      <div style={{ height: 16 }} />
    </div>
  )
}
