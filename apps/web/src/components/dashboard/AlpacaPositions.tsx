'use client'

import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, TrendingDown, RefreshCw, X } from 'lucide-react'

interface Position {
  symbol:        string
  side:          string
  qty:           number
  avgEntryPrice: number
  currentPrice:  number
  marketValue:   number
  unrealizedPnl: number
  unrealizedPct: number
}

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
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)
  const [closing, setClosing] = useState<string | null>(null)

  const fetchPositions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/alpaca/positions')
      const j   = await res.json()
      if (j.success) {
        setPositions(j.data)
        setLastUpdate(new Date().toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      } else {
        setError(j.error || 'فشل في جلب المراكز')
      }
    } catch {
      setError('خطأ في الشبكة')
    } finally {
      setLoading(false)
    }
  }, [])

  // جلب عند التحميل وتحديث كل 10 ثواني
  useEffect(() => {
    fetchPositions()
    const interval = setInterval(fetchPositions, 10000)
    return () => clearInterval(interval)
  }, [fetchPositions])

  // إغلاق مركز
  const closePosition = async (symbol: string) => {
    if (!confirm(`هل تريد إغلاق مركز ${symbol}؟`)) return
    setClosing(symbol)
    try {
      const res = await fetch(`/api/alpaca/positions/${encodeURIComponent(symbol)}`, { method: 'DELETE' })
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

  const totalPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0)

  // ─── Empty state ───
  if (!loading && positions.length === 0) {
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
        <button onClick={fetchPositions} style={{
          marginTop: 4, padding: '3px 10px', fontSize: 9,
          background: 'rgba(10,132,255,0.1)', border: '1px solid rgba(10,132,255,0.25)',
          color: '#0A84FF', borderRadius: 5, cursor: 'pointer',
          fontFamily: "'Cairo', sans-serif",
        }}>تحديث</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '4px 10px',
        borderBottom: `1px solid ${T.border}`, flexShrink: 0, gap: 8,
      }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: T.text2, flex: 1 }}>
          {positions.length} مركز مفتوح
          {lastUpdate && <> · <span style={{ color: T.text3 }}>{lastUpdate}</span></>}
        </span>
        {/* إجمالي الربح/الخسارة */}
        <span style={{
          fontSize: 11, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace",
          color: totalPnl >= 0 ? T.success : T.danger,
        }}>
          {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}$
        </span>
        <button
          onClick={fetchPositions}
          disabled={loading}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: T.text3, padding: 2, display: 'flex', alignItems: 'center',
          }}
        >
          <RefreshCw size={11} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Positions Table */}
      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
              {['الزوج', 'الاتجاه', 'الكمية', 'السعر دخول', 'السعر الحالي', 'P&L', ''].map(h => (
                <th key={h} style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600, color: T.text3, whiteSpace: 'nowrap', fontSize: 9 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => {
              const isLong  = pos.side === 'long'
              const pnlPos  = pos.unrealizedPnl >= 0
              return (
                <tr key={pos.symbol} style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: '5px 8px', fontWeight: 700, color: T.text }}>{pos.symbol}</td>
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
                  <td style={{ padding: '5px 8px', color: T.text2 }}>{pos.qty}</td>
                  <td style={{ padding: '5px 8px', color: T.text2 }}>{pos.avgEntryPrice.toFixed(2)}</td>
                  <td style={{ padding: '5px 8px', color: T.text }}>{pos.currentPrice.toFixed(2)}</td>
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
                      onClick={() => closePosition(pos.symbol)}
                      disabled={closing === pos.symbol}
                      title="إغلاق المركز"
                      style={{
                        background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.25)',
                        color: T.danger, borderRadius: 4, cursor: 'pointer',
                        padding: '1px 5px', fontSize: 9, fontFamily: "'Cairo', sans-serif",
                        display: 'flex', alignItems: 'center', gap: 2,
                      }}
                    >
                      <X size={9} /> {closing === pos.symbol ? '...' : 'إغلاق'}
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
