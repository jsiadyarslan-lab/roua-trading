'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, RefreshCw, TrendingDown, TrendingUp, X } from 'lucide-react'
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
  `${value >= 0 ? '+' : ''}${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}$`

export function AlpacaPositions() {
  const { positions, loading, error, lastUpdate, fetchPositions, fetchAccount } = usePositionsStore()
  const { trades: paperTrades, removeTrade: removePaperTrade } = usePaperTradesStore()
  const [closing, setClosing] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState<string | null>(null)

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
        id: position.rawSymbol,
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
          !positions.some(position => position.rawSymbol.replace('/', '') === trade.symbol.replace('/', '')),
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
        unrealizedPct: trade.unrealizedPct,
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
      const response = await fetch(`/api/alpaca/positions/${encodeURIComponent(rawSymbol)}`, { method: 'DELETE' })
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

  const totalPnl = allPositions.reduce((sum, position) => sum + position.unrealizedPnl, 0)

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
          padding: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {allPositions.length === 0 && (
          <div
            style={{
              borderRadius: 14,
              border: `1px dashed ${T.border}`,
              background: 'rgba(255,255,255,0.025)',
              minHeight: 120,
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
          const sideTone = isLong ? T.success : T.danger

          return (
            <div
              key={position.id}
              style={{
                borderRadius: 14,
                border: `1px solid ${pnlUp ? 'rgba(0,200,83,0.18)' : 'rgba(255,90,84,0.18)'}`,
                background: `linear-gradient(180deg, ${T.card}, ${T.cardAlt})`,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.025), 0 8px 18px rgba(0,0,0,0.16)`,
                padding: '8px 10px',
                display: 'grid',
                gap: 6,
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 2.3fr) auto', gap: 8, alignItems: 'center' }}>
                <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 900,
                        color: T.text,
                        fontFamily: "'JetBrains Mono', monospace",
                        letterSpacing: '-0.02em',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {position.symbol}
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        padding: '1px 6px',
                        borderRadius: 999,
                        background: isLong ? 'rgba(0,200,83,0.14)' : 'rgba(255,90,84,0.14)',
                        border: `1px solid ${isLong ? 'rgba(0,200,83,0.28)' : 'rgba(255,90,84,0.28)'}`,
                        color: sideTone,
                        fontSize: 7.5,
                        fontWeight: 900,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isLong ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                      {isLong ? 'شراء' : 'بيع'}
                    </span>
                    {position.isPaper && (
                      <span
                        style={{
                          padding: '1px 5px',
                          borderRadius: 999,
                          background: 'rgba(0,229,255,0.10)',
                          border: '1px solid rgba(0,229,255,0.20)',
                          color: T.cyan,
                          fontSize: 7,
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
                          padding: '1px 5px',
                          borderRadius: 999,
                          background: 'rgba(245,185,66,0.12)',
                          border: '1px solid rgba(245,185,66,0.20)',
                          color: T.amber,
                          fontSize: 7,
                          fontWeight: 800,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        BOT
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', color: T.text3, fontSize: 7.5 }}>
                    <span>{position.entryTime ? new Date(position.entryTime).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : 'مركز تجميعي'}</span>
                    <span>{position.qty}</span>
                  </div>
                </div>

                <div
                  style={{
                    minWidth: 0,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                    gap: 6,
                  }}
                >
                  {[
                    { label: 'دخول', value: fmtPrice(position.avgEntryPrice), tone: T.text },
                    { label: 'حالي', value: fmtPrice(position.currentPrice), tone: T.text },
                    { label: 'TP', value: position.tp ? fmtPrice(position.tp) : '—', tone: position.tp ? T.success : T.text3 },
                    { label: 'SL', value: position.sl ? fmtPrice(position.sl) : '—', tone: position.sl ? T.danger : T.text3 },
                  ].map(item => (
                    <div
                      key={item.label}
                      style={{
                        minWidth: 0,
                        borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.06)',
                        background: 'rgba(255,255,255,0.028)',
                        padding: '5px 4px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: 6.5, color: T.text3, marginBottom: 3 }}>{item.label}</div>
                      <div
                        style={{
                          fontSize: 9.5,
                          fontWeight: 800,
                          color: item.tone,
                          fontFamily: "'JetBrains Mono', monospace",
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => closePosition(position.id, position.isPaper, position.rawSymbol)}
                  disabled={closing === position.id}
                  style={{
                    flexShrink: 0,
                    minWidth: 62,
                    height: 28,
                    padding: '0 8px',
                    borderRadius: 9,
                    border: `1px solid ${confirmClose === position.id ? 'rgba(255,90,84,0.42)' : 'rgba(255,90,84,0.22)'}`,
                    background: confirmClose === position.id ? 'rgba(255,90,84,0.16)' : 'rgba(255,90,84,0.08)',
                    color: T.danger,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    cursor: 'pointer',
                    fontSize: 8,
                    fontWeight: 900,
                    fontFamily: "'Cairo', sans-serif",
                  }}
                >
                  {closing === position.id ? (
                    <RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} />
                  ) : confirmClose === position.id ? (
                    'تأكيد'
                  ) : (
                    <>
                      <X size={10} />
                      إغلاق
                    </>
                  )}
                </button>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  borderRadius: 10,
                  border: `1px solid ${pnlUp ? 'rgba(0,200,83,0.18)' : 'rgba(255,90,84,0.18)'}`,
                  background: pnlUp ? 'rgba(0,200,83,0.06)' : 'rgba(255,90,84,0.06)',
                  padding: '6px 8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <div style={{ fontSize: 7.5, color: T.text3, whiteSpace: 'nowrap' }}>القيمة</div>
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 900,
                      color: T.text,
                      fontFamily: "'JetBrains Mono', monospace",
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {fmtPrice(position.marketValue)}$
                  </div>
                </div>
                <div
                  style={{
                    color: pnlUp ? T.success : T.danger,
                    fontSize: 10,
                    fontWeight: 900,
                    fontFamily: "'JetBrains Mono', monospace",
                    whiteSpace: 'nowrap',
                  }}
                >
                  {fmtPnl(position.unrealizedPnl)}
                </div>
                <div
                  style={{
                    padding: '3px 7px',
                    borderRadius: 999,
                    background: 'rgba(0,0,0,0.18)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: pnlUp ? T.success : T.danger,
                    fontSize: 9,
                    fontWeight: 900,
                    fontFamily: "'JetBrains Mono', monospace",
                    whiteSpace: 'nowrap',
                  }}
                >
                  {position.unrealizedPct >= 0 ? '+' : ''}
                  {position.unrealizedPct.toFixed(2)}%
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div
        style={{
          flexShrink: 0,
          padding: '9px 10px',
          borderTop: `1px solid ${T.border}`,
          background: 'rgba(255,255,255,0.025)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <AlertTriangle size={11} color={T.text3} />
          <span style={{ fontSize: 9, color: T.text3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {loading
              ? 'جاري تحديث المراكز...'
              : error
                ? 'تعذر تحميل المراكز'
                : `آخر تحديث ${lastUpdate ? new Date(lastUpdate).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '—'}`}
          </span>
        </div>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 900,
            color: totalPnl >= 0 ? T.success : T.danger,
            fontFamily: "'JetBrains Mono', monospace",
            whiteSpace: 'nowrap',
          }}
        >
          {fmtPnl(totalPnl)}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
