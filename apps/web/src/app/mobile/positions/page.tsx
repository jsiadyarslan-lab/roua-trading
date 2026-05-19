'use client'
import { useEffect, useState } from 'react'
import { PageHeader, Card } from '@/components/mobile/Card'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useRouter } from 'next/navigation'
import { Activity, TrendingUp, TrendingDown, X, Loader2, ShieldAlert } from 'lucide-react'

export default function MobilePositionsPage() {
  const router = useRouter()
  const { positions, fetchPositions, refreshAfterTrade } = usePositionsStore()
  const quotes = useMarketStore(s => s.quotes)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState<string | null>(null)
  useEffect(() => { fetchPositions() }, [fetchPositions])

  const handleClose = async (posId: string) => {
    setClosingId(posId)
    try {
      const res = await fetch('/api/smart-executor/close', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId: posId }),
      })
      if (res.ok) refreshAfterTrade()
    } catch { /* */ }
    finally { setClosingId(null); setConfirmClose(null) }
  }

  return (
    <div className="r-page">
      <PageHeader title="المراكز المفتوحة" subtitle={`${positions.length} مركز`} />
      {positions.length === 0 ? (
        <Card>
          <div className="r-empty">
            <Activity size={32} color="#8B92A8" />
            <div className="r-empty__title">لا توجد مراكز مفتوحة</div>
          </div>
        </Card>
      ) : positions.map(pos => {
        const isLong = pos.side === 'long'
        const pnl = pos.unrealizedPnl ?? 0
        const isUp = pnl >= 0
        return (
          <Card key={pos.id}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: isLong ? 'rgba(0,255,163,0.1)' : 'rgba(255,69,58,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isLong ? <TrendingUp size={16} color="#00FFA3" /> : <TrendingDown size={16} color="#FF4757" />}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#FFF', fontFamily: 'var(--font-mono)' }}>{pos.symbol}</div>
                  <div style={{ fontSize: 9, color: isLong ? '#00FFA3' : '#FF4757', fontFamily: 'var(--font-cairo)', fontWeight: 700 }}>{isLong ? 'شراء' : 'بيع'} × {pos.qty}</div>
                </div>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: isUp ? '#00FFA3' : '#FF4757', fontFamily: 'var(--font-mono)' }}>{isUp ? '+' : ''}{Number(pnl).toFixed(2)}</div>
              </div>
            </div>
            {confirmClose === pos.id ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px', borderRadius: 8, background: 'rgba(255,69,58,0.06)', border: '0.5px solid rgba(255,69,58,0.15)' }}>
                <ShieldAlert size={14} color="#FF4757" />
                <span style={{ fontSize: 10, color: '#FF4757', fontFamily: 'var(--font-cairo)', fontWeight: 700, flex: 1 }}>تأكيد الإغلاق؟</span>
                <button onClick={() => handleClose(pos.dbId || pos.id)} disabled={closingId === (pos.dbId || pos.id)} style={{ padding: '4px 12px', borderRadius: 6, background: '#FF4757', color: '#FFF', fontSize: 9, fontWeight: 800, fontFamily: 'var(--font-cairo)', border: 'none', cursor: 'pointer' }}>
                  {closingId === (pos.dbId || pos.id) ? <Loader2 size={12} className="r-anim-spin" /> : 'إغلاق'}
                </button>
                <button onClick={() => setConfirmClose(null)} style={{ padding: '4px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: '#8B92A8', fontSize: 9, fontWeight: 700, border: 'none', cursor: 'pointer' }}>إلغاء</button>
              </div>
            ) : (
              <button onClick={() => setConfirmClose(pos.dbId || pos.id)} style={{ width: '100%', padding: '6px', borderRadius: 8, background: 'rgba(255,69,58,0.06)', border: '0.5px solid rgba(255,69,58,0.15)', color: '#FF4757', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-cairo)', cursor: 'pointer' }}>إغلاق المركز</button>
            )}
          </Card>
        )
      })}
      <div style={{ height: 80 }} />
    </div>
  )
}
