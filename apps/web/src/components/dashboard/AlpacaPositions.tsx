'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, TrendingDown, TrendingUp, X, History } from 'lucide-react'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { usePaperTradesStore, type ClosedPaperTrade } from '@/hooks/usePaperTradesStore'

interface Position {
  symbol: string
  rawSymbol: string
  side: string
  qty: number
  avgEntryPrice: number
  currentPrice: number
  marketValue: number
  unrealizedPnl: number
}

const T = {
  success: '#00C853',
  danger: '#FF5A54',
  cyan: '#00E5FF',
  amber: '#F5B942',
  text: '#E6EBF5',
  text2: '#8FA5BE',
  text3: '#6E839B',
  border: 'rgba(255,255,255,0.08)',
  panel: '#0A1118',
  card: '#111A24',
  cardAlt: '#0E1620',
}

const fmtPrice = (value: number) =>
  Number.isFinite(value)
    ? value.toLocaleString('en-US', { maximumFractionDigits: value > 100 ? 2 : 4 })
    : '—'

const fmtPnl = (value: number) =>
  `${value >= 0 ? '+' : '-'}${Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}$`

export function AlpacaPositions() {
  const { positions, fetchPositions, fetchAccount } = usePositionsStore()
  const { trades: paperTrades, closeTrade: closePaperTrade, closedTrades, clearClosedTrades } = usePaperTradesStore()
  const [closing, setClosing] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState<string | null>(null)
  const [showClosed, setShowClosed] = useState(false)

  const allPositions: Array<
    Position & {
      id: string
      isPaper: boolean
      entryTime: number | null
      tp: number | null
      sl: number | null
      source?: string
    }
  > = [
    ...positions.map(position => {
      const manualPaper = paperTrades.find(
        trade => trade.symbol.replace('/', '') === position.symbol.replace('/', '') && trade.source === 'manual',
      )
      return {
        ...position,
        id: position.rawSymbol ?? position.symbol,
        isPaper: false,
        entryTime: manualPaper?.entryTime || null,
        tp: manualPaper?.tp || null,
        sl: manualPaper?.sl || null,
      }
    }),
    ...paperTrades
      .filter(
        trade =>
          trade.source === 'bot' ||
          !positions.some(position => (position.rawSymbol ?? position.symbol).replace('/', '') === trade.symbol.replace('/', '')),
      )
      .map(trade => ({
        symbol: trade.symbol,
        rawSymbol: trade.symbol,
        side: trade.side,
        qty: trade.qty,
        avgEntryPrice: trade.entryPrice,
        currentPrice: trade.currentPrice,
        marketValue: trade.currentPrice * trade.qty,
        unrealizedPnl: trade.unrealizedPnl,
        id: trade.id,
        isPaper: true,
        entryTime: trade.entryTime,
        tp: trade.tp ?? null,
        sl: trade.sl ?? null,
        source: trade.source,
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

  const closePosition = async (id: string, isPaper: boolean, rawSymbol: string | undefined) => {
    if (confirmClose !== id) {
      setConfirmClose(id)
      setTimeout(() => setConfirmClose(null), 3000)
      return
    }

    setConfirmClose(null)
    setClosing(id)

    if (isPaper) {
      closePaperTrade(id)
      setClosing(null)
      return
    }

    try {
      const response = await fetch(`/api/alpaca/positions/${encodeURIComponent(rawSymbol ?? '')}`, { method: 'DELETE' })
      const json = await response.json()
      if (json.success) {
        await fetchPositions()
      } else {
        alert(`فشل الإغلاق: ${json.error}`)
      }
    } catch {
      alert('خطأ في إغلاق المركز')
    } finally {
      setClosing(null)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        background: T.panel,
      }}
    >
      <div
        className="custom-scrollbar"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {allPositions.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(120px,1.35fr) 88px 52px 76px 76px 68px 68px 88px 48px',
              gap: 6,
              alignItems: 'center',
              padding: '0 6px 2px',
              color: T.text3,
              fontSize: 6.5,
              fontWeight: 800,
              fontFamily: "'Cairo', sans-serif",
            }}
          >
            <div>العقد</div>
            <div style={{ textAlign: 'center' }}>الفتح</div>
            <div style={{ textAlign: 'center' }}>كمية</div>
            <div style={{ textAlign: 'center' }}>دخول</div>
            <div style={{ textAlign: 'center' }}>حالي</div>
            <div style={{ textAlign: 'center' }}>TP</div>
            <div style={{ textAlign: 'center' }}>SL</div>
            <div style={{ textAlign: 'center' }}>P&L</div>
            <div style={{ textAlign: 'center' }}>إغلاق</div>
          </div>
        )}

        {allPositions.length === 0 && (
          <div
            style={{
              borderRadius: 12,
              border: `1px dashed ${T.border}`,
              background: 'rgba(255,255,255,0.025)',
              minHeight: 110,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              color: T.text3,
              textAlign: 'center',
              padding: 16,
            }}
          >
            <div style={{ fontSize: 11, color: T.text }}>لا توجد صفقات مفتوحة الآن</div>
            <div style={{ fontSize: 9 }}>عند فتح مركز سيظهر هنا بشكل مضغوط مع زر إغلاق مباشر.</div>
          </div>
        )}

        {allPositions.map(position => {
          const isLong = position.side === 'long'
          const pnlUp = position.unrealizedPnl >= 0
          const openedAt = position.entryTime
            ? new Date(position.entryTime).toLocaleString('ar-SA', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'غير محدد'

          return (
            <div
              key={position.id}
              style={{
                borderRadius: 10,
                border: `1px solid ${pnlUp ? 'rgba(0,200,83,0.16)' : 'rgba(255,90,84,0.16)'}`,
                background: `linear-gradient(180deg, ${T.card}, ${T.cardAlt})`,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.02), 0 4px 10px rgba(0,0,0,0.12)`,
                padding: '5px 6px',
                display: 'grid',
                gridTemplateColumns: 'minmax(120px,1.35fr) 88px 52px 76px 76px 68px 68px 88px 48px',
                gap: 6,
                alignItems: 'center',
              }}
            >
              <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 900,
                    color: T.text,
                    fontFamily: "'JetBrains Mono', monospace",
                    whiteSpace: 'nowrap',
                  }}
                >
                  {position.symbol}
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 2,
                    padding: '1px 4px',
                    borderRadius: 999,
                    background: isLong ? 'rgba(0,200,83,0.14)' : 'rgba(255,90,84,0.14)',
                    border: `1px solid ${isLong ? 'rgba(0,200,83,0.28)' : 'rgba(255,90,84,0.28)'}`,
                    color: isLong ? T.success : T.danger,
                    fontSize: 6,
                    fontWeight: 900,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isLong ? <TrendingUp size={7} /> : <TrendingDown size={7} />}
                  {isLong ? 'شراء' : 'بيع'}
                </span>
                {position.isPaper && (
                  <span
                    style={{
                      padding: '1px 4px',
                      borderRadius: 999,
                      background: 'rgba(0,229,255,0.10)',
                      border: '1px solid rgba(0,229,255,0.20)',
                      color: T.cyan,
                      fontSize: 5.5,
                      fontWeight: 800,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    PAPER
                  </span>
                )}
                {position.source === 'bot' && (
                  <span
                    style={{
                      padding: '1px 4px',
                      borderRadius: 999,
                      background: 'rgba(245,185,66,0.12)',
                      border: '1px solid rgba(245,185,66,0.20)',
                      color: T.amber,
                      fontSize: 5.5,
                      fontWeight: 800,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    BOT
                  </span>
                )}
              </div>

              <div
                style={{
                  fontSize: 6.5,
                  fontWeight: 700,
                  color: T.text2,
                  fontFamily: "'JetBrains Mono', monospace",
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {openedAt}
              </div>

              <div style={{ fontSize: 8, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center', whiteSpace: 'nowrap' }}>
                {position.qty}
              </div>

              <div style={{ fontSize: 8, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center', whiteSpace: 'nowrap' }}>
                {fmtPrice(position.avgEntryPrice)}
              </div>

              <div style={{ fontSize: 8, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center', whiteSpace: 'nowrap' }}>
                {fmtPrice(position.currentPrice)}
              </div>

              <div style={{ fontSize: 7.5, fontWeight: 800, color: position.tp ? T.success : T.text3, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center', whiteSpace: 'nowrap' }}>
                {position.tp ? fmtPrice(position.tp) : '—'}
              </div>

              <div style={{ fontSize: 7.5, fontWeight: 800, color: position.sl ? T.danger : T.text3, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center', whiteSpace: 'nowrap' }}>
                {position.sl ? fmtPrice(position.sl) : '—'}
              </div>

              <div style={{ fontSize: 8.5, fontWeight: 900, color: pnlUp ? T.success : T.danger, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center', whiteSpace: 'nowrap' }}>
                {fmtPnl(position.unrealizedPnl)}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => closePosition(position.id, position.isPaper, position.rawSymbol ?? position.symbol)}
                  disabled={closing === position.id}
                  style={{
                    minWidth: 46,
                    height: 20,
                    padding: '0 5px',
                    borderRadius: 6,
                    border: `1px solid ${confirmClose === position.id ? 'rgba(255,90,84,0.42)' : 'rgba(255,90,84,0.22)'}`,
                    background: confirmClose === position.id ? 'rgba(255,90,84,0.16)' : 'rgba(255,90,84,0.08)',
                    color: T.danger,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                    cursor: 'pointer',
                    fontSize: 6,
                    fontWeight: 900,
                    fontFamily: "'Cairo', sans-serif",
                    whiteSpace: 'nowrap',
                  }}
                >
                  {closing === position.id ? (
                    <RefreshCw size={8} style={{ animation: 'spin 1s linear infinite' }} />
                  ) : confirmClose === position.id ? (
                    'تأكيد'
                  ) : (
                    <>
                      <X size={8} />
                      إغلاق
                    </>
                  )}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Closed Trades Section */}
      {closedTrades.length > 0 && (
        <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 4 }}>
          <button
            onClick={() => setShowClosed(!showClosed)}
            style={{
              width: '100%', padding: '8px 10px', background: 'transparent', border: 'none',
              color: T.text2, cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', fontFamily: "'Cairo', sans-serif", fontSize: 10, fontWeight: 700,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <History size={12} />
              الصفقات المغلقة ({closedTrades.length})
            </div>
            <span style={{ fontSize: 8, transform: showClosed ? 'rotate(180deg)' : 'rotate(0)', transition: '0.2s' }}>▼</span>
          </button>

          {showClosed && (
            <div className="custom-scrollbar" style={{ maxHeight: 200, overflowY: 'auto', padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {closedTrades.map((ct: ClosedPaperTrade) => {
                const isLong = ct.side === 'long'
                const pnlUp = ct.realizedPnl >= 0
                return (
                  <div key={ct.id} style={{
                    borderRadius: 8, border: `1px solid ${pnlUp ? 'rgba(0,200,83,0.12)' : 'rgba(255,90,84,0.12)'}`,
                    background: T.cardAlt, padding: '6px 8px', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', gap: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 9, fontWeight: 900, color: isLong ? T.success : T.danger, fontFamily: "'JetBrains Mono', monospace" }}>
                        {isLong ? '⬆' : '⬇'}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{ct.symbol}</span>
                      {ct.source === 'bot' && (
                        <span style={{ padding: '1px 4px', borderRadius: 999, background: 'rgba(245,185,66,0.12)', border: '1px solid rgba(245,185,66,0.20)', color: T.amber, fontSize: 5.5, fontWeight: 800 }}>BOT</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 7, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>
                        {fmtPrice(ct.entryPrice)} → {fmtPrice(ct.exitPrice)}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 900, color: pnlUp ? T.success : T.danger, fontFamily: "'JetBrains Mono', monospace" }}>
                        {fmtPnl(ct.realizedPnl)}
                      </span>
                    </div>
                  </div>
                )
              })}
              <button
                onClick={clearClosedTrades}
                style={{
                  padding: '4px 8px', background: 'transparent', border: `1px solid ${T.border}`,
                  color: T.text3, borderRadius: 6, cursor: 'pointer', fontSize: 7,
                  fontFamily: "'Cairo', sans-serif", fontWeight: 700, alignSelf: 'center',
                }}
              >
                مسح السجل
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
