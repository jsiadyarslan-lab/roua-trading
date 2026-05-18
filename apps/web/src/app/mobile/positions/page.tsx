'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { TrendingUp, TrendingDown, X, AlertTriangle, Loader2, Activity } from 'lucide-react'

const C = { accent: '#00D4FF', success: '#00FFA3', danger: '#FF4757', amber: '#FFB800', text: '#F0F2F5', text2: '#8B92A8', bg: '#1A1D29', border: 'rgba(255,255,255,0.06)' }

export default function MobilePositionsPage() {
  const { positions, fetchPositions, fetchAccount, refreshAfterTrade } = usePositionsStore()
  const paperTrades = usePaperTradesStore(s => s.trades)
  const closePaperTrade = usePaperTradesStore(s => s.closeTrade)

  const [confirmClose, setConfirmClose] = useState<string | null>(null)
  const [closing, setClosing] = useState<string | null>(null)

  useEffect(() => {
    fetchPositions()
    fetchAccount()
  }, [fetchPositions, fetchAccount])

  const handleClose = useCallback(async (pos: any) => {
    const posId = pos.dbId || pos.id || `${pos.symbol}-${pos.side}`
    setClosing(posId)
    setConfirmClose(null)

    try {
      if (pos.source === 'nestjs' && pos.dbId) {
        const res = await fetch(`/api/trading/positions/${pos.dbId}`, { method: 'DELETE' })
        if (res.ok) {
          refreshAfterTrade()
        } else {
          const data = await res.json()
          console.error('Close failed:', data.message)
        }
      } else {
        // Try Alpaca or paper trade close
        try {
          const res = await fetch('/api/alpaca/positions', { method: 'DELETE' })
          refreshAfterTrade()
        } catch {
          // Fallback: close as paper trade if it's a paper position
          const paperTrade = paperTrades.find(t => t.symbol === pos.symbol && t.side === (pos.side === 'long' ? 'long' : 'short'))
          if (paperTrade) {
            closePaperTrade(paperTrade.id)
          }
        }
      }
    } catch (err) {
      console.error('Error closing position:', err)
    } finally {
      setClosing(null)
    }
  }, [refreshAfterTrade, paperTrades, closePaperTrade])

  const fmtPrice = (p: number) => {
    if (p > 100) return p.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    if (p > 10) return p.toFixed(3)
    return p.toFixed(4)
  }

  const fmtPnl = (pnl: number) => {
    const sign = pnl >= 0 ? '+' : ''
    return `${sign}$${Math.abs(pnl).toFixed(2)}`
  }

  const allPositions = positions.length > 0 ? positions : paperTrades.map(t => ({
    id: t.id,
    symbol: t.symbol,
    side: t.side,
    qty: t.qty,
    avgEntryPrice: t.entryPrice,
    currentPrice: t.currentPrice,
    marketValue: t.currentPrice * t.qty,
    unrealizedPnl: t.unrealizedPnl,
    unrealizedPnlPct: t.unrealizedPct,
    source: 'paper' as const,
  }))

  return (
    <div className="m-page">
      <MobilePageHeader title="المراكز المفتوحة" subtitle={`${allPositions.length} مركز`} />

      {allPositions.length === 0 ? (
        <div style={{ padding: '0 16px' }}>
          <IOSCard>
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Activity size={40} color={C.text2} style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text2, fontFamily: "'Cairo', sans-serif", marginBottom: 4 }}>لا توجد مراكز مفتوحة</div>
              <div style={{ fontSize: 11, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>ستظهر المراكز هنا عند فتح صفقات</div>
            </div>
          </IOSCard>
        </div>
      ) : (
        <div style={{ padding: '0 16px' }}>
          {allPositions.map((pos, i) => {
            const isLong = pos.side === 'long' || pos.side === 'LONG' || pos.side === 'BUY'
            const pnl = pos.unrealizedPnl || 0
            const pnlPct = pos.unrealizedPnlPct || 0
            const pnlColor = pnl >= 0 ? C.success : C.danger
            const posId = (pos as any).dbId || pos.id || `${pos.symbol}-${pos.side}`
            const isConfirming = confirmClose === posId
            const isClosing = closing === posId
            const entryPrice = pos.avgEntryPrice || pos.entryPrice || 0
            const currentPrice = pos.currentPrice || 0

            return (
              <div key={posId} style={{ marginBottom: 8 }}>
                <IOSCard>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: isLong ? 'rgba(0,255,163,0.08)' : 'rgba(255,71,87,0.08)',
                        border: `0.5px solid ${isLong ? 'rgba(0,255,163,0.15)' : 'rgba(255,71,87,0.15)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isLong ? <TrendingUp size={18} color={C.success} /> : <TrendingDown size={18} color={C.danger} />}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{pos.symbol}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: isLong ? C.success : C.danger, fontFamily: "'Cairo', sans-serif" }}>
                          {isLong ? 'شراء (Long)' : 'بيع (Short)'}
                          {(pos as any).tradeSource && <span style={{ color: C.text2, marginRight: 4 }}>· {(pos as any).tradeSource}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Close Button */}
                    {!isConfirming && !isClosing && (
                      <button onClick={() => setConfirmClose(posId)} style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: 'rgba(255,71,87,0.08)', border: '0.5px solid rgba(255,71,87,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer',
                      }}>
                        <X size={14} color={C.danger} />
                      </button>
                    )}
                    {isClosing && <Loader2 size={16} className="animate-spin" color={C.accent} />}
                  </div>

                  {/* Price Info */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif", marginBottom: 2 }}>الكمية</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{pos.qty}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif", marginBottom: 2 }}>سعر الدخول</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: "'JetBrains Mono', monospace", direction: 'ltr' }}>{fmtPrice(entryPrice)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 8, color: C.text2, fontFamily: "'Cairo', sans-serif", marginBottom: 2 }}>السعر الحالي</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: "'JetBrains Mono', monospace", direction: 'ltr' }}>{fmtPrice(currentPrice)}</div>
                    </div>
                  </div>

                  {/* P&L */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 10, background: `${pnlColor}08`, border: `0.5px solid ${pnlColor}18` }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.text2, fontFamily: "'Cairo', sans-serif" }}>ربح/خسارة</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 900, color: pnlColor, fontFamily: "'JetBrains Mono', monospace" }}>{fmtPnl(pnl)}</span>
                      <span style={{ fontSize: 10, fontWeight: 800, color: pnlColor, fontFamily: "'JetBrains Mono', monospace" }}>({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)</span>
                    </div>
                  </div>

                  {/* Close Confirmation */}
                  {isConfirming && (
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'rgba(255,71,87,0.06)', border: '0.5px solid rgba(255,71,87,0.15)' }}>
                      <AlertTriangle size={14} color={C.amber} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.text, fontFamily: "'Cairo', sans-serif", flex: 1 }}>تأكيد إغلاق المركز؟</span>
                      <button onClick={() => handleClose(pos)} style={{ padding: '4px 12px', borderRadius: 6, background: C.danger, color: '#FFF', fontSize: 9, fontWeight: 800, fontFamily: "'Cairo', sans-serif", border: 'none', cursor: 'pointer' }}>إغلاق</button>
                      <button onClick={() => setConfirmClose(null)} style={{ padding: '4px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', color: C.text2, fontSize: 9, fontWeight: 800, fontFamily: "'Cairo', sans-serif", border: `0.5px solid ${C.border}`, cursor: 'pointer' }}>إلغاء</button>
                    </div>
                  )}
                </IOSCard>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ height: 16 }} />
    </div>
  )
}
