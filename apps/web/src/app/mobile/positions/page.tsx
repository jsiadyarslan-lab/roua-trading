'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import MobilePageHeader from '@/components/mobile/MobilePageHeader'
import IOSCard from '@/components/mobile/IOSCard'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { TrendingUp, TrendingDown, X, Loader2, DollarSign, Activity, Shield, ArrowUpDown, Filter } from 'lucide-react'

type FilterTab = 'all' | 'long' | 'short'
type SortBy = 'pnl' | 'size' | 'time'

export default function MobilePositionsPage() {
  const positions = usePositionsStore(s => s.positions)
  const fetchPositions = usePositionsStore(s => s.fetchPositions)
  const fetchAccount = usePositionsStore(s => s.fetchAccount)
  const account = usePositionsStore(s => s.account)
  const quotes = useMarketStore(s => s.quotes)
  const [closing, setClosing] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState<string | null>(null)
  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [sortBy, setSortBy] = useState<SortBy>('pnl')

  useEffect(() => { fetchPositions(); fetchAccount() }, [fetchPositions, fetchAccount])

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

  // Filter and sort positions
  const filteredPositions = useMemo(() => {
    let filtered = positions
    if (filterTab === 'long') filtered = positions.filter(p => p.side === 'long' || p.side === 'LONG' || p.side === 'BUY')
    if (filterTab === 'short') filtered = positions.filter(p => p.side === 'short' || p.side === 'SHORT' || p.side === 'SELL')
    
    return [...filtered].sort((a, b) => {
      if (sortBy === 'pnl') return Math.abs(b.unrealizedPnl ?? 0) - Math.abs(a.unrealizedPnl ?? 0)
      if (sortBy === 'size') return (b.qty ?? 0) - (a.qty ?? 0)
      return 0 // time: default order
    })
  }, [positions, filterTab, sortBy])

  // Portfolio summary calculations
  const totalUnrealizedPnl = useMemo(() => positions.reduce((sum, p) => sum + (p.unrealizedPnl ?? 0), 0), [positions])
  const totalUnrealizedPnlPct = useMemo(() => {
    const totalValue = positions.reduce((sum, p) => sum + (Number(p.avgEntryPrice) * Number(p.qty)), 0)
    return totalValue > 0 ? (totalUnrealizedPnl / totalValue) * 100 : 0
  }, [positions, totalUnrealizedPnl])
  const longCount = positions.filter(p => p.side === 'long' || p.side === 'LONG' || p.side === 'BUY').length
  const shortCount = positions.filter(p => p.side === 'short' || p.side === 'SHORT' || p.side === 'SELL').length
  const isTotalUp = totalUnrealizedPnl >= 0
  const equity = Number(account?.equity ?? 0) || 0

  return (
    <div className="m-page">
      <MobilePageHeader title="المراكز المفتوحة" subtitle={`${positions.length} مركز`} />

      {/* Portfolio Summary Card */}
      <IOSCard highlight>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: isTotalUp ? 'linear-gradient(135deg, #00FFA3, #10B981)' : 'linear-gradient(135deg, #FF453A, #DC2626)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={20} color="#FFF" />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>إجمالي الربح/الخسارة</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: isTotalUp ? '#00FFA3' : '#FF4757', fontFamily: "'JetBrains Mono', monospace" }}>
                {isTotalUp ? '+' : ''}${totalUnrealizedPnl.toFixed(2)}
              </div>
            </div>
          </div>
          <div style={{ padding: '4px 10px', borderRadius: 8, background: isTotalUp ? 'rgba(0,255,163,0.08)' : 'rgba(255,69,58,0.08)', border: `0.5px solid ${isTotalUp ? 'rgba(0,255,163,0.15)' : 'rgba(255,69,58,0.15)'}` }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: isTotalUp ? '#00FFA3' : '#FF4757', fontFamily: "'JetBrains Mono', monospace" }}>
              {isTotalUp ? '+' : ''}{totalUnrealizedPnlPct.toFixed(2)}%
            </span>
          </div>
        </div>
        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          <div style={{ padding: '8px 6px', borderRadius: 10, textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.05)' }}>
            <Activity size={12} color="#00D4FF" style={{ margin: '0 auto 3px' }} />
            <div style={{ fontSize: 16, fontWeight: 800, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{positions.length}</div>
            <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>إجمالي</div>
          </div>
          <div style={{ padding: '8px 6px', borderRadius: 10, textAlign: 'center', background: 'rgba(0,255,163,0.03)', border: '0.5px solid rgba(0,255,163,0.08)' }}>
            <TrendingUp size={12} color="#00FFA3" style={{ margin: '0 auto 3px' }} />
            <div style={{ fontSize: 16, fontWeight: 800, color: '#00FFA3', fontFamily: "'JetBrains Mono', monospace" }}>{longCount}</div>
            <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>شراء</div>
          </div>
          <div style={{ padding: '8px 6px', borderRadius: 10, textAlign: 'center', background: 'rgba(255,69,58,0.03)', border: '0.5px solid rgba(255,69,58,0.08)' }}>
            <TrendingDown size={12} color="#FF453A" style={{ margin: '0 auto 3px' }} />
            <div style={{ fontSize: 16, fontWeight: 800, color: '#FF453A', fontFamily: "'JetBrains Mono', monospace" }}>{shortCount}</div>
            <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>بيع</div>
          </div>
        </div>
        {equity > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '6px 10px', borderRadius: 10, background: 'rgba(0,212,255,0.04)', border: '0.5px solid rgba(0,212,255,0.08)' }}>
            <Shield size={12} color="#00D4FF" />
            <span style={{ fontSize: 10, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>رأس المال:</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>${equity.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        )}
      </IOSCard>

      {/* Filter Tabs + Sort */}
      {positions.length > 0 && (
        <div style={{ padding: '0 16px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', direction: 'rtl' }}>
          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 2 }}>
            {([
              { key: 'all' as FilterTab, label: 'الكل', count: positions.length },
              { key: 'long' as FilterTab, label: 'شراء', count: longCount },
              { key: 'short' as FilterTab, label: 'بيع', count: shortCount },
            ]).map(tab => (
              <button key={tab.key} onClick={() => setFilterTab(tab.key)} style={{ padding: '5px 12px', borderRadius: 8, background: filterTab === tab.key ? 'rgba(0,212,255,0.12)' : 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: filterTab === tab.key ? 800 : 600, color: filterTab === tab.key ? '#00D4FF' : 'rgba(255,255,255,0.4)', fontFamily: "'Cairo', sans-serif" }}>{tab.label}</span>
                <span style={{ fontSize: 8, fontWeight: 800, color: filterTab === tab.key ? '#00D4FF' : 'rgba(255,255,255,0.25)', fontFamily: "'JetBrains Mono', monospace" }}>{tab.count}</span>
              </button>
            ))}
          </div>
          {/* Sort button */}
          <button onClick={() => { const next: Record<SortBy, SortBy> = { pnl: 'size', size: 'time', time: 'pnl' }; setSortBy(next[sortBy]) }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}>
            <ArrowUpDown size={10} color="#8B92A8" />
            <span style={{ fontSize: 9, fontWeight: 700, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>
              {sortBy === 'pnl' ? 'ربح' : sortBy === 'size' ? 'حجم' : 'وقت'}
            </span>
          </button>
        </div>
      )}

      {positions.length === 0 ? (
        <IOSCard>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <TrendingUp size={40} color="#8B92A8" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 14, fontWeight: 800, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>لا توجد مراكز مفتوحة</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: "'Cairo', sans-serif", marginTop: 4 }}>ابدأ التداول لرؤية مراكزك هنا</div>
          </div>
        </IOSCard>
      ) : filteredPositions.length === 0 ? (
        <IOSCard>
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <Filter size={28} color="#8B92A8" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: 13, fontWeight: 800, color: '#8B92A8', fontFamily: "'Cairo', sans-serif" }}>لا توجد مراكز {filterTab === 'long' ? 'شراء' : 'بيع'}</div>
          </div>
        </IOSCard>
      ) : (
        filteredPositions.map(pos => {
          const pnl = pos.unrealizedPnl ?? 0
          const pnlPct = pos.unrealizedPnlPct ?? 0
          const isUp = pnl >= 0
          const isLong = pos.side === 'long' || pos.side === 'LONG' || pos.side === 'BUY'
          const posId = pos.dbId || pos.id || ''
          const isConfirming = confirmClose === posId
          const isClosing = closing === posId
          const entryPrice = Number(pos.avgEntryPrice) || 0
          const currentPrice = Number(pos.currentPrice) || 0
          const qty = Number(pos.qty) || 0
          const positionValue = entryPrice * qty
          // P&L bar visualization
          const pnlBarWidth = Math.min(Math.abs(pnlPct) * 3, 100)

          return (
            <IOSCard key={posId} highlight={isUp && pnl > 0}>
              {/* Top row: Symbol + Side + P&L */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: isLong ? 'rgba(0,255,163,0.1)' : 'rgba(255,69,58,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `0.5px solid ${isLong ? 'rgba(0,255,163,0.2)' : 'rgba(255,69,58,0.2)'}` }}>
                    {isLong ? <TrendingUp size={18} color="#00FFA3" /> : <TrendingDown size={18} color="#FF453A" />}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 15, fontWeight: 900, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>{pos.symbol}</span>
                      <span style={{ fontSize: 9, fontWeight: 800, color: isLong ? '#00FFA3' : '#FF453A', fontFamily: "'Cairo', sans-serif", padding: '2px 6px', borderRadius: 5, background: isLong ? 'rgba(0,255,163,0.1)' : 'rgba(255,69,58,0.1)', border: `0.5px solid ${isLong ? 'rgba(0,255,163,0.15)' : 'rgba(255,69,58,0.15)'}` }}>{isLong ? 'شراء' : 'بيع'}</span>
                    </div>
                    <div style={{ fontSize: 10, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", marginTop: 2 }}>الكمية: {qty}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: isUp ? '#00FFA3' : '#FF453A', fontFamily: "'JetBrains Mono', monospace" }}>
                    {isUp ? '+' : ''}${pnl.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: isUp ? '#00FFA3' : '#FF453A', fontFamily: "'JetBrains Mono', monospace" }}>
                    {isUp ? '+' : ''}{pnlPct.toFixed(2)}%
                  </div>
                </div>
              </div>

              {/* P&L Bar Visualization */}
              <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.04)', marginBottom: 10, direction: 'ltr', overflow: 'hidden' }}>
                <div style={{ width: `${pnlBarWidth}%`, height: '100%', borderRadius: 2, background: isUp ? 'linear-gradient(90deg, #00FFA3, #10B981)' : 'linear-gradient(90deg, #FF453A, #DC2626)', transition: 'width 0.5s' }} />
              </div>

              {/* Price Details Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 10 }}>
                <div style={{ padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                  <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", fontWeight: 700, marginBottom: 2 }}>الدخول</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>${entryPrice.toFixed(entryPrice > 100 ? 2 : 4)}</div>
                </div>
                <div style={{ padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                  <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", fontWeight: 700, marginBottom: 2 }}>الحالي</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: isUp ? '#00FFA3' : '#FF453A', fontFamily: "'JetBrains Mono', monospace" }}>${currentPrice.toFixed(currentPrice > 100 ? 2 : 4)}</div>
                </div>
                <div style={{ padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                  <div style={{ fontSize: 8, color: '#8B92A8', fontFamily: "'Cairo', sans-serif", fontWeight: 700, marginBottom: 2 }}>القيمة</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#FFF', fontFamily: "'JetBrains Mono', monospace" }}>${positionValue.toFixed(positionValue > 100 ? 2 : 4)}</div>
                </div>
              </div>

              {/* Close button */}
              {isConfirming ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleClose(pos)} disabled={isClosing} style={{ flex: 1, padding: '10px 0', borderRadius: 10, background: '#FF453A', border: 'none', color: '#FFF', fontSize: 12, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', opacity: isClosing ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    {isClosing && <Loader2 size={14} className="animate-spin" />}
                    {isClosing ? 'جارٍ الإغلاق...' : 'تأكيد الإغلاق'}
                  </button>
                  <button onClick={() => setConfirmClose(null)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: 'none', color: '#8B92A8', fontSize: 12, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer' }}>إلغاء</button>
                </div>
              ) : (
                <button onClick={() => setConfirmClose(posId)} style={{ width: '100%', padding: '10px 0', borderRadius: 10, background: 'rgba(255,69,58,0.06)', border: '0.5px solid rgba(255,69,58,0.15)', color: '#FF453A', fontSize: 12, fontWeight: 800, fontFamily: "'Cairo', sans-serif", cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <X size={14} /> إغلاق المركز
                </button>
              )}
            </IOSCard>
          )
        })
      )}
      <div style={{ height: 16 }} />
    </div>
  )
}
