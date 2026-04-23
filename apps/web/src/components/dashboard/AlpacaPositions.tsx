'use client'

import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, TrendingDown, RefreshCw, X, AlertTriangle } from 'lucide-react'

interface Position {
  symbol:        string
  rawSymbol:     string
  side:          string
  qty:           number
  avgEntryPrice: number
  currentPrice:  number
  marketValue:   number
  unrealizedPnl: number
  unrealizedPct: number
}

import { usePositionsStore } from '@/hooks/usePositionsStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'

const T = {
  success: '#00C853',
  danger:  '#FF3B30',
  text:    '#E6EBF5',
  text2:   '#8090A8',
  text3:   '#A0AFC3',
  border:  'rgba(255,255,255,0.06)',
  card:    '#111214',
  bg:      '#0F1113',
}

export function AlpacaPositions() {
  const { positions, loading, error, lastUpdate, fetchPositions } = usePositionsStore()
  const { trades: paperTrades, removeTrade: removePaperTrade } = usePaperTradesStore()
  const [closing, setClosing] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState<string | null>(null)
  const [account, setAccount] = useState<any>(null)

  // Merge Alpaca positions and Paper trades
  const allPositions = [
    ...positions.map(p => {
      // Alpaca might return BTCUSD, but paper trade has BTC/USD
      const manualPt = paperTrades.find(pt => pt.symbol.replace('/', '') === p.symbol.replace('/', '') && pt.source === 'manual')
      return {
        ...p,
        id: p.rawSymbol,
        isPaper: false,
        entryTime: manualPt?.entryTime || null,
        tp: manualPt?.tp || null,
        sl: manualPt?.sl || null
      }
    }),
    ...paperTrades.filter(pt => pt.source === 'bot' || !positions.some(p => p.rawSymbol.replace('/', '') === pt.symbol.replace('/', ''))).map(p => ({
      symbol: p.symbol,
      rawSymbol: p.symbol,
      side: p.side,
      qty: p.qty,
      avgEntryPrice: p.entryPrice,
      currentPrice: p.currentPrice,
      marketValue: p.currentPrice * p.qty,
      unrealizedPnl: p.unrealizedPnl,
      unrealizedPct: p.unrealizedPct,
      id: p.id,
      isPaper: true,
      entryTime: p.entryTime,
      tp: p.tp,
      sl: p.sl,
      source: p.source
    }))
  ]

  const syncAccount = useCallback(async () => {
    try {
      const accRes = await fetch('/api/alpaca/account')
      const accJ   = await accRes.json()
      if (accJ.success) setAccount(accJ.data)
    } catch {}
  }, [])

  // جلب عند التحميل وتحديث كل 10 ثواني
  useEffect(() => {
    fetchPositions()
    syncAccount()
    const interval = setInterval(() => {
      fetchPositions()
      syncAccount()
    }, 10000)
    return () => clearInterval(interval)
  }, [fetchPositions, syncAccount])

  // إغلاق مركز
  const closePosition = async (id: string, isPaper: boolean, rawSymbol: string) => {
    if (confirmClose !== id) {
      setConfirmClose(id)
      setTimeout(() => setConfirmClose(null), 3000)
      return
    }

    setConfirmClose(null)
    setClosing(id)
    
    if (isPaper) {
      removePaperTrade(id)
      setClosing(null)
    } else {
      try {
        const res = await fetch(`/api/alpaca/positions/${encodeURIComponent(rawSymbol)}`, { method: 'DELETE' })
        const j   = await res.json()
        if (j.success) {
          await fetchPositions()
        } else {
          alert(`فشل الإغلاق: ${j.error}`)
        }
      } catch {
        alert('خطأ في إغلاق المركز')
      } finally {
        setClosing(null)
      }
    }
  }

  const totalPnl = allPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0)

  // ─── Empty state ───
  if (!loading && allPositions.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center', gap: 6, color: T.text2 }}>
        {error ? (
          <span style={{ fontSize: 11, color: T.danger, fontFamily: "'Cairo', sans-serif", textAlign: 'center', padding: '0 12px' }}>
            ⚠️ {error}
          </span>
        ) : (
          <>
            <span style={{ fontSize: 20 }}>📭</span>
            <span style={{ fontSize: 11, fontFamily: "'Cairo', sans-serif" }}>لا توجد مراكز مفتوحة</span>
            {lastUpdate && (
              <span style={{ fontSize: 9, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>
                آخر تحديث: {lastUpdate}
              </span>
            )}
          </>
        )}
        <button onClick={fetchPositions} className="btn-cyan-active" style={{
          marginTop: 4, padding: '3px 12px', fontSize: 10,
          borderRadius: 'var(--radius)', cursor: 'pointer',
          fontFamily: "'Cairo', sans-serif",
        }}>تحديث</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '6px 10px',
        borderBottom: `1px solid ${T.border}`, flexShrink: 0, gap: 12, overflowX: 'auto', whiteSpace: 'nowrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 11, fontWeight: 700, color: T.text }}>المراكز ({allPositions.length})</span>
          {lastUpdate && <span style={{ fontSize: 9, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>{lastUpdate}</span>}
        </div>
        
        <div style={{ width: 1, height: 12, background: T.border }} />

        {/* Account Info */}
        <div style={{ display: 'flex', gap: 12, flex: 1, fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <span style={{ color: T.text2 }}>PNL:</span>
            <span style={{ fontWeight: 800, color: totalPnl >= 0 ? T.success : T.danger }}>
              {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}$
            </span>
          </div>
          {account && (
            <>
              <div style={{ display: 'flex', gap: 4 }}>
                <span style={{ color: T.text2 }}>الرصيد:</span>
                <span style={{ color: T.text }}>${account.equity.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <span style={{ color: T.text2 }}>متاح:</span>
                <span style={{ color: T.success }}>${account.buyingPower.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <span style={{ color: T.text2 }}>مستخدم:</span>
                <span style={{ color: T.danger }}>${(account.equity - account.cash).toLocaleString()}</span>
              </div>
            </>
          )}
        </div>

        <button
          onClick={fetchPositions}
          disabled={loading}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: T.text3, padding: 2, display: 'flex', alignItems: 'center',
          }}
        >
          <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Positions Table */}
      <div className="no-scrollbar" style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
              {['الزوج', 'التاريخ', 'الاتجاه', 'الكمية', 'دخول', 'حالي', 'TP', 'SL', 'P&L', ''].map(h => (
                <th key={h} style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600, color: T.text3, whiteSpace: 'nowrap', fontSize: 9 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allPositions.map((pos) => {
              const isLong  = pos.side === 'long'
              const pnlPos  = pos.unrealizedPnl >= 0
              return (
                <tr key={pos.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: '5px 8px', fontWeight: 700, color: T.text }}>
                    {pos.symbol}
                    {pos.isPaper && <span style={{ marginLeft: 4, fontSize: 8, padding: '1px 4px', borderRadius: 2, background: 'rgba(0,200,83,0.15)', color: '#00C853' }}>📄</span>}
                    {pos.source === 'bot' && <span style={{ marginLeft: 2, fontSize: 8 }}>🤖</span>}
                  </td>
                  <td style={{ padding: '5px 8px', color: T.text3, fontSize: 8 }}>
                    {pos.entryTime ? new Date(pos.entryTime).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : 'تجميعي'}
                  </td>
                  <td style={{ padding: '5px 8px' }}>
                    <span style={{
                      padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 800,
                      background: isLong ? 'rgba(0,200,83,0.12)' : 'rgba(255,59,48,0.12)',
                      color: isLong ? T.success : T.danger,
                      display: 'flex', alignItems: 'center', gap: 3, width: 'fit-content',
                    }}>
                      {isLong ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                      {isLong ? 'شراء' : 'بيع'}
                    </span>
                  </td>
                  <td style={{ padding: '5px 8px', color: T.text }}>{pos.qty}</td>
                  <td style={{ padding: '5px 8px', color: T.text2 }}>{pos.avgEntryPrice.toFixed(2)}</td>
                  <td style={{ padding: '5px 8px', color: T.text }}>{pos.currentPrice.toFixed(2)}</td>
                  <td style={{ padding: '5px 8px', color: pos.tp ? T.success : T.text3 }}>{pos.tp ? pos.tp.toFixed(2) : '—'}</td>
                  <td style={{ padding: '5px 8px', color: pos.sl ? T.danger : T.text3 }}>{pos.sl ? pos.sl.toFixed(2) : '—'}</td>
                  <td style={{ padding: '5px 8px' }}>
                    <span style={{ color: pnlPos ? T.success : T.danger, fontWeight: 700 }}>
                      {pnlPos ? '+' : ''}{pos.unrealizedPnl.toFixed(2)}$
                      <span style={{ fontSize: 9, opacity: 0.7, marginRight: 3 }}>
                        ({pnlPos ? '+' : ''}{pos.unrealizedPct.toFixed(2)}%)
                      </span>
                    </span>
                  </td>
                  <td style={{ padding: '5px 6px' }}>
                    <button
                      onClick={() => closePosition(pos.id, pos.isPaper, pos.rawSymbol)}
                      disabled={closing === pos.id}
                      className={confirmClose === pos.id ? 'btn-neon-sell' : ''}
                      title="إغلاق المركز"
                      style={{
                        background: confirmClose === pos.id ? 'var(--danger)' : 'rgba(255,68,68,0.1)',
                        border: '1px solid rgba(255,68,68,0.25)',
                        color: confirmClose === pos.id ? '#fff' : 'var(--danger)',
                        borderRadius: 'var(--radius)', cursor: 'pointer',
                        padding: '2px 8px', fontSize: 9, fontFamily: "'Cairo', sans-serif",
                        display: 'flex', alignItems: 'center', gap: 4,
                        transition: 'all 0.15s', fontWeight: confirmClose === pos.id ? 800 : 600
                      }}
                    >
                      {closing === pos.id ? (
                        <RefreshCw size={9} style={{ animation: 'spin 1s linear infinite' }} />
                      ) : confirmClose === pos.id ? (
                        <>تأكيد؟</>
                      ) : (
                        <><X size={9} /> إغلاق</>
                      )}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
