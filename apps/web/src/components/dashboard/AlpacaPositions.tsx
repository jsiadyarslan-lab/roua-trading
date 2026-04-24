'use client'

import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, RefreshCw, X, AlertTriangle } from 'lucide-react'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'

interface Position {
  symbol: string
  rawSymbol: string
  side: string
  qty: number
  avgEntryPrice: number
  currentPrice: number
  marketValue: number
  unrealizedPnl: number
  unrealizedPct: number
}

const T = {
  success: '#00C853',
  danger: '#FF3B30',
  text: '#E6EBF5',
  text2: '#8090A8',
  text3: '#A0AFC3',
  border: 'rgba(255,255,255,0.06)',
  card: '#111214',
  bg: '#0F1113',
}

export function AlpacaPositions() {
  const { positions, account, loading, error, lastUpdate, fetchPositions, fetchAccount } = usePositionsStore()
  const { trades: paperTrades, removeTrade: removePaperTrade } = usePaperTradesStore()
  const [closing, setClosing] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState<string | null>(null)

  // Merge Alpaca positions and Paper trades
  const allPositions: Array<Position & { id: string; isPaper: boolean; entryTime: number | null; tp: number | null; sl: number | null; source?: string }> = [
    ...positions.map(p => {
      const manualPt = paperTrades.find(pt => pt.symbol.replace('/', '') === p.symbol.replace('/', '') && pt.source === 'manual')
      return {
        ...p,
        id: p.rawSymbol,
        isPaper: false,
        entryTime: manualPt?.entryTime || null,
        tp: manualPt?.tp || null,
        sl: manualPt?.sl || null,
      }
    }),
    ...paperTrades
      .filter(pt => pt.source === 'bot' || !positions.some(p => p.rawSymbol.replace('/', '') === pt.symbol.replace('/', '')))
      .map(p => ({
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
        tp: p.tp ?? null,
        sl: p.sl ?? null,
        source: p.source,
      })),
  ]

  useEffect(() => {
    fetchPositions()
    fetchAccount()
    const interval = setInterval(() => {
      fetchPositions()
      fetchAccount()
    }, 10000)
    return () => clearInterval(interval)
  }, [fetchPositions, fetchAccount])

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
      return
    }

    try {
      const res = await fetch(`/api/alpaca/positions/${encodeURIComponent(rawSymbol)}`, { method: 'DELETE' })
      const j = await res.json()
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

  const totalPnl = allPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: T.bg }}>
      <div className="no-scrollbar" style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
        <table
          style={{
            width: '100%',
            minWidth: 920,
            borderCollapse: 'collapse',
            fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
              {['الزوج', 'التاريخ', 'الاتجاه', 'الكمية', 'دخول', 'حالي', 'TP', 'SL', 'P&L', ''].map((h, index) => (
                <th
                  key={h}
                  style={{
                    padding: '8px 10px',
                    textAlign: 'right',
                    fontWeight: 600,
                    color: T.text3,
                    whiteSpace: 'nowrap',
                    fontSize: 9,
                    position: index === 0 ? 'sticky' : 'static',
                    left: index === 0 ? 0 : undefined,
                    zIndex: index === 0 ? 3 : 1,
                    background: index === 0 ? 'rgba(17,18,20,0.98)' : 'rgba(255,255,255,0.03)',
                    boxShadow: index === 0 ? '1px 0 0 rgba(255,255,255,0.06)' : undefined,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allPositions.map((pos) => {
              const isLong = pos.side === 'long'
              const pnlPos = pos.unrealizedPnl >= 0

              return (
                <tr key={pos.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td
                    style={{
                      padding: '8px 10px',
                      fontWeight: 700,
                      color: T.text,
                      position: 'sticky',
                      left: 0,
                      zIndex: 2,
                      background: T.card,
                      boxShadow: '1px 0 0 rgba(255,255,255,0.06)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{pos.symbol}</span>
                      {pos.isPaper && (
                        <span
                          style={{
                            fontSize: 8,
                            padding: '1px 4px',
                            borderRadius: 2,
                            background: 'rgba(0,200,83,0.15)',
                            color: T.success,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          📄
                        </span>
                      )}
                      {pos.source === 'bot' && <span style={{ fontSize: 8 }}>🤖</span>}
                    </div>
                  </td>
                  <td style={{ padding: '8px 10px', color: T.text3, fontSize: 8, whiteSpace: 'nowrap' }}>
                    {pos.entryTime ? new Date(pos.entryTime).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : 'تجميعي'}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <span
                      style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        fontSize: 9,
                        fontWeight: 800,
                        background: isLong ? 'rgba(0,200,83,0.12)' : 'rgba(255,59,48,0.12)',
                        color: isLong ? T.success : T.danger,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isLong ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                      {isLong ? 'شراء' : 'بيع'}
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px', color: T.text, whiteSpace: 'nowrap' }}>{pos.qty}</td>
                  <td style={{ padding: '8px 10px', color: T.text2, whiteSpace: 'nowrap' }}>{pos.avgEntryPrice.toFixed(2)}</td>
                  <td style={{ padding: '8px 10px', color: T.text, whiteSpace: 'nowrap' }}>{pos.currentPrice.toFixed(2)}</td>
                  <td style={{ padding: '8px 10px', color: pos.tp ? T.success : T.text3, whiteSpace: 'nowrap' }}>{pos.tp ? pos.tp.toFixed(2) : '—'}</td>
                  <td style={{ padding: '8px 10px', color: pos.sl ? T.danger : T.text3, whiteSpace: 'nowrap' }}>{pos.sl ? pos.sl.toFixed(2) : '—'}</td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                    <span style={{ color: pnlPos ? T.success : T.danger, fontWeight: 700 }}>
                      {pnlPos ? '+' : ''}{pos.unrealizedPnl.toFixed(2)}$
                      <span style={{ fontSize: 9, opacity: 0.7, marginRight: 3 }}>
                        ({pnlPos ? '+' : ''}{pos.unrealizedPct.toFixed(2)}%)
                      </span>
                    </span>
                  </td>
                  <td style={{ padding: '8px 8px', whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => closePosition(pos.id, pos.isPaper, pos.rawSymbol)}
                      disabled={closing === pos.id}
                      className={confirmClose === pos.id ? 'btn-neon-sell' : ''}
                      title="إغلاق المركز"
                      style={{
                        background: confirmClose === pos.id ? T.danger : 'rgba(255,68,68,0.1)',
                        border: '1px solid rgba(255,68,68,0.25)',
                        color: confirmClose === pos.id ? '#fff' : T.danger,
                        borderRadius: 8,
                        cursor: 'pointer',
                        minHeight: 48,
                        minWidth: 48,
                        padding: '8px 10px',
                        fontSize: 9,
                        fontFamily: "'Cairo', sans-serif",
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        transition: 'all 0.15s',
                        fontWeight: confirmClose === pos.id ? 800 : 600,
                      }}
                    >
                      {closing === pos.id ? (
                        <RefreshCw size={9} style={{ animation: 'spin 1s linear infinite' }} />
                      ) : confirmClose === pos.id ? (
                        <>تأكيد؟</>
                      ) : (
                        <>
                          <X size={9} />
                          إغلاق
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 10px',
          borderTop: `1px solid ${T.border}`,
          background: 'rgba(255,255,255,0.02)',
          fontSize: 10,
          color: T.text3,
          fontFamily: "'Cairo', sans-serif",
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <AlertTriangle size={11} color={T.text3} />
          {loading ? 'جاري التحديث...' : error ? 'تعذر تحميل المراكز' : `آخر تحديث: ${lastUpdate ? new Date(lastUpdate).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '—'}`}
        </span>
        <span style={{ color: totalPnl >= 0 ? T.success : T.danger, fontWeight: 700 }}>
          {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}$
        </span>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
