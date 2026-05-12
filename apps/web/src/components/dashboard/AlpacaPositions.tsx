'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, TrendingDown, TrendingUp, X as XIcon, History } from 'lucide-react'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { useScopedStyle } from '@/hooks/useScopedStyle'
import { usePaperTradesStore, type ClosedPaperTrade } from '@/hooks/usePaperTradesStore'
import { useAgentStore } from '@/hooks/useAgentStore'
import { fmtPriceLocale as fmtPrice, fmtPrice as fmtPricePlain, fmtPnl } from '@/lib/price-format'
import { isNestJsId } from '@/lib/api-fetch'

interface Position {
  symbol: string
  rawSymbol?: string
  side: string
  qty: number
  avgEntryPrice: number
  currentPrice: number
  marketValue: number
  unrealizedPnl: number
}

const T = {
  success: '#00FFA3',
  danger: '#FF4757',
  cyan: '#00D4FF',
  amber: '#FFB800',
  purple: '#A855F7',
  text: '#F0F2F5',
  text2: '#8B92A8',
  text3: '#8B92A8',
  border: 'rgba(255,255,255,0.06)',
  panel: '#0B0E14',
  card: '#1A1D29',
  cardAlt: '#1F2335',
}

/**
 * Normalize side field from any convention to 'long'/'short'.
 * The backend uses OrderSide enum (BUY/SELL), some frontends use 'long'/'short',
 * and some stores use 'BUY'/'SELL'. This function unifies them all.
 */
function normalizeSide(side: string | undefined): 'long' | 'short' {
  if (!side) return 'long' // default
  const s = side.toUpperCase()
  if (s === 'LONG' || s === 'BUY') return 'long'
  if (s === 'SHORT' || s === 'SELL') return 'short'
  // FIX: Previously defaulted unknown values to 'short', causing ALL trades
  // to show as "sell" (بيع) when side was an unexpected format. Now default to
  // 'long' since that's the most common trade direction and matches the
  // default when side is undefined.
  return 'long'
}

/**
 * Determine the trade source label for display.
 * Returns one of: 'ورقي' (paper), 'المنفذ' (executor), 'الوكيل' (agent), or null.
 */
function getTradeSourceLabel(
  isPaper: boolean,
  source?: string,
  tradeSource?: string,
  exchange?: string,
): { label: string; color: string; bg: string; border: string } | null {
  // Priority 1: Smart Executor source (check BEFORE agent to prevent mislabeling)
  if (source === 'bot' || source === 'executor' || source === 'smart_executor'
      || tradeSource === 'smart_executor' || tradeSource === 'auto_paper') {
    return {
      label: 'المنفذ',
      color: T.cyan,
      bg: 'rgba(0,212,255,0.12)',
      border: 'rgba(0,212,255,0.20)',
    }
  }
  // Priority 2: Agent source
  if (source === 'agent' || tradeSource === 'agent') {
    return {
      label: 'الوكيل',
      color: T.purple,
      bg: 'rgba(168,85,247,0.12)',
      border: 'rgba(168,85,247,0.20)',
    }
  }
  // Priority 3: Paper trading (from exchange name or isPaper flag)
  if (isPaper || exchange === 'paper-trading' || tradeSource === 'user_manual') {
    return {
      label: 'ورقي',
      color: T.amber,
      bg: 'rgba(255,184,0,0.12)',
      border: 'rgba(255,184,0,0.20)',
    }
  }
  return null
}

export function AlpacaPositions() {
  useScopedStyle(`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `)
  const { positions, fetchPositions, fetchAccount, setPositions } = usePositionsStore()
  const { trades: paperTrades, closeTrade: closePaperTrade, closedTrades, clearClosedTrades, clearAll: clearAllPaperTrades } = usePaperTradesStore()
  const agentPositions = useAgentStore(state => state.positions)
  const [closing, setClosing] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState<string | null>(null)
  const [showClosed, setShowClosed] = useState(false)

  // Collect symbols from all sources to avoid duplicates
  const seenSymbols = new Set<string>()

  const allPositions: Array<
    Position & {
      id: string
      isPaper: boolean
      entryTime: number | null
      tp: number | null
      sl: number | null
      source?: string
      tradeSource?: string
      dbId?: string
    }
  > = []

  // ── Source 1: API positions (from usePositionsStore) ──
  for (const position of positions) {
    if (!position || !position.symbol) continue
    const normalizedSide = normalizeSide(position.side)
    const manualPaper = paperTrades.find(
      trade => trade.symbol.replace('/', '') === position.symbol.replace('/', '') && trade.source === 'manual',
    )
    const key = position.symbol.replace('/', '').toUpperCase()
    seenSymbols.add(key)

    allPositions.push({
      ...position,
      side: normalizedSide,
      dbId: (position as any)?.dbId
        || ((position as any)?.id && isNestJsId((position as any).id)
          ? (position as any).id
          : undefined),
      id: position.rawSymbol ?? position.symbol,
      isPaper: false,
      entryTime: manualPaper?.entryTime || null,
      tp: (position as any)?.takeProfit || (position as any)?.tp || manualPaper?.tp || null,
      sl: (position as any)?.stopLoss || (position as any)?.sl || manualPaper?.sl || null,
      // FIX: Pass both source and tradeSource explicitly so getTradeSourceLabel
      // can correctly determine the trade origin. The position.source is 'nestjs'
      // (data source), while tradeSource is the actual trade source from DB.
      source: (position as any)?.source,
      tradeSource: (position as any)?.tradeSource || undefined,
    })
  }

  // ── Source 2: Agent positions (from useAgentStore) ──
  // FIX: Agent trades were NOT shown in the open positions list before.
  // They were only visible in the agent widget's log. Now they're merged
  // into the main positions display with the correct source badge.
  // CRITICAL FIX: Read the actual `source` from the position data instead
  // of hardcoding 'agent'. If a position has source='smart_executor' in the DB
  // but was fetched through the agent store (shouldn't happen normally, but
  // as a safeguard), we show the correct label.
  for (const ap of agentPositions) {
    if (!ap || !ap.symbol) continue
    const normalizedSide = normalizeSide(ap.side)
    const key = ap.symbol.replace('/', '').toUpperCase()
    // Skip if we already have this symbol from the API (avoid duplicates)
    if (seenSymbols.has(key)) continue
    seenSymbols.add(key)

    // FIX: Don't default to 'agent' — check multiple fields to determine the
    // actual source. The agent store may contain positions from the smart executor
    // if they share the same DB query. Check source, then tradeSource, then only
    // fall back to 'user_manual' as the safe default (NOT 'agent').
    // Previously defaulting to 'agent' caused ALL positions from this source to
    // show 'الوكيل' even if they were created by the Smart Executor.
    const actualSource = (ap as any)?.source
      || (ap as any)?.tradeSource
      || 'user_manual'

    allPositions.push({
      symbol: ap.symbol,
      side: normalizedSide,
      qty: ap.quantity,
      avgEntryPrice: ap.entryPrice,
      currentPrice: ap.currentPrice || ap.entryPrice,
      marketValue: (ap.currentPrice || ap.entryPrice) * ap.quantity,
      unrealizedPnl: ap.unrealizedPnl,
      id: ap.id,
      dbId: ap.id, // Agent positions have DB IDs
      isPaper: false,
      entryTime: ap.openedAt ? new Date(ap.openedAt).getTime() : null,
      tp: ap.takeProfit ?? null,
      sl: ap.stopLoss ?? null,
      source: actualSource,
      tradeSource: actualSource,
    })
  }

  // ── Source 3: Paper trades (from usePaperTradesStore) ──
  for (const trade of paperTrades) {
    // Filter out invalid trades
    if (!trade.entryPrice || trade.entryPrice <= 0) continue
    const tradeValue = Math.abs(trade.qty * trade.entryPrice)
    if (tradeValue < 1) continue
    const base = trade.symbol.split('/')[0]
    if (/^\d+$/.test(base)) continue
    // Skip if we already have this symbol from API or agent
    const normalizedSymbol = trade.symbol.replace('/', '').toUpperCase()
    if (seenSymbols.has(normalizedSymbol)) continue
    seenSymbols.add(normalizedSymbol)

    allPositions.push({
      symbol: trade.symbol,
      rawSymbol: trade.symbol,
      side: normalizeSide(trade.side),
      qty: trade.qty,
      avgEntryPrice: trade.entryPrice,
      currentPrice: trade.currentPrice,
      marketValue: trade.currentPrice * trade.qty,
      unrealizedPnl: trade.unrealizedPnl,
      id: trade.id,
      dbId: undefined,
      isPaper: true,
      entryTime: trade.entryTime,
      tp: trade.tp ?? null,
      sl: trade.sl ?? null,
      source: trade.source,
    })
  }

  useEffect(() => {
    fetchPositions()
    fetchAccount()
    // Poll every 30s — GlobalLogicEngine also polls, no need for 10s here
    const interval = setInterval(() => {
      fetchPositions()
      fetchAccount()
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchPositions, fetchAccount])

  const closePosition = async (pos: typeof allPositions[0]) => {
    const id = pos.id
    if (confirmClose !== id) {
      setConfirmClose(id)
      setTimeout(() => setConfirmClose(null), 3000)
      return
    }

    setConfirmClose(null)
    setClosing(id)

    // Paper trade (local BotEngine) — close in store
    if (pos.isPaper) {
      closePaperTrade(id)
      setClosing(null)
      return
    }

    try {
      // CRITICAL FIX: SmartExecutor positions live in NestJS DB, not Alpaca.
      // Use POST /api/trading/positions/close with the real DB position id.
      if (pos.dbId) {
        const response = await fetch('/api/trading/positions/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ positionId: pos.dbId }),
        })
        const json = await response.json()
        if (response.ok) {
          await fetchPositions()
          // If position was already closed (idempotent close), notify user
          if (json.alreadyClosed) {
            // Silently refresh — no error, position is now synced
          }
        } else {
          alert(`فشل الإغلاق: ${json.message || json.error || 'خطأ غير معروف'}`)
        }
      } else {
        // No DB id — try closePositionUnified which handles the full
        // NestJS → Alpaca fallback flow properly. Previously, this went
        // directly to Alpaca, causing "Alpaca Error 404" for positions
        // that only exist in the DB.
        const { closePositionUnified } = await import('@/lib/api-fetch')
        const result = await closePositionUnified(
          pos.rawSymbol ?? pos.symbol,
          undefined,
          // Pass dbId if it's a valid UUID (checked above)
          { dbId: pos.dbId || undefined }
        )
        if (result.success) {
          await fetchPositions()
        } else {
          alert(`فشل الإغلاق: ${result.error || 'خطأ غير معروف'}`)
        }
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
        direction: 'rtl',
        display: 'flex',
        flexDirection: 'column',
        height: 'auto',
        maxHeight: 180,
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
          // FIX: Normalize side for display - handles BUY/SELL and long/short
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

          // Determine source badge
          const sourceBadge = getTradeSourceLabel(
            position.isPaper,
            position.source,
            position.tradeSource,
            (position as any).exchange,
          )

          return (
            <div
              key={position.id}
              style={{
                borderRadius: 10,
                border: `1px solid ${pnlUp ? 'rgba(0,255,163,0.16)' : 'rgba(255,71,87,0.16)'}`,
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
                    background: isLong ? 'rgba(0,255,163,0.14)' : 'rgba(255,71,87,0.14)',
                    border: `1px solid ${isLong ? 'rgba(0,255,163,0.28)' : 'rgba(255,71,87,0.28)'}`,
                    color: isLong ? T.success : T.danger,
                    fontSize: 6,
                    fontWeight: 900,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isLong ? <TrendingUp size={7} /> : <TrendingDown size={7} />}
                  {isLong ? 'شراء' : 'بيع'}
                </span>
                {/* FIX: Show source badge for EVERY trade */}
                {sourceBadge && (
                  <span
                    style={{
                      padding: '1px 4px',
                      borderRadius: 999,
                      background: sourceBadge.bg,
                      border: `1px solid ${sourceBadge.border}`,
                      color: sourceBadge.color,
                      fontSize: 5.5,
                      fontWeight: 800,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {sourceBadge.label}
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
                {fmtPrice(position.avgEntryPrice, position.symbol)}
              </div>

              <div style={{ fontSize: 8, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center', whiteSpace: 'nowrap' }}>
                {fmtPrice(position.currentPrice, position.symbol)}
              </div>

              <div style={{ fontSize: 7.5, fontWeight: 800, color: position.tp ? T.success : T.text3, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center', whiteSpace: 'nowrap' }}>
                {position.tp ? fmtPrice(position.tp, position.symbol) : '—'}
              </div>

              <div style={{ fontSize: 7.5, fontWeight: 800, color: position.sl ? T.danger : T.text3, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center', whiteSpace: 'nowrap' }}>
                {position.sl ? fmtPrice(position.sl, position.symbol) : '—'}
              </div>

              <div style={{ fontSize: 8.5, fontWeight: 900, color: pnlUp ? T.success : T.danger, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center', whiteSpace: 'nowrap' }}>
                {fmtPnl(position.unrealizedPnl)}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => closePosition(position)}
                  disabled={closing === position.id}
                  style={{
                    minWidth: 46,
                    height: 20,
                    padding: '0 5px',
                    borderRadius: 6,
                    border: `1px solid ${confirmClose === position.id ? 'rgba(255,71,87,0.42)' : 'rgba(255,71,87,0.22)'}`,
                    background: confirmClose === position.id ? 'rgba(255,71,87,0.16)' : 'rgba(255,71,87,0.08)',
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
                      <XIcon size={8} />
                      إغلاق
                    </>
                  )}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Clear All + Closed Trades Section */}
      {allPositions.length > 0 && (
        <div style={{ padding: '0 8px 4px' }}>
          <button
            type="button"
            onClick={async () => {
              // Close all real positions via API
              for (const pos of allPositions) {
                if (pos.isPaper) {
                  closePaperTrade(pos.id)
                } else if (pos.dbId) {
                  try {
                    await fetch('/api/trading/positions/close', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ positionId: pos.dbId }),
                    })
                  } catch {}
                } else {
                  try {
                    const { closePositionUnified } = await import('@/lib/api-fetch')
                    await closePositionUnified(pos.rawSymbol ?? pos.symbol, undefined, { dbId: pos.dbId || undefined })
                  } catch {}
                }
              }
              // Clear all local state
              clearAllPaperTrades()
              setPositions([])
              // Refresh from API
              setTimeout(() => { fetchPositions(); fetchAccount() }, 500)
            }}
            style={{
              width: '100%',
              padding: '5px 8px',
              borderRadius: 8,
              border: `1px solid rgba(255,71,87,0.18)`,
              background: 'rgba(255,71,87,0.06)',
              color: T.danger,
              fontSize: 7.5,
              fontWeight: 800,
              fontFamily: "'Cairo', sans-serif",
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <XIcon size={9} />
            إغلاق وإزالة الكل
          </button>
        </div>
      )}

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
                // FIX: Show source badge for closed trades too
                const closedSourceBadge = getTradeSourceLabel(true, ct.source)
                return (
                  <div key={ct.id} style={{
                    borderRadius: 8, border: `1px solid ${pnlUp ? 'rgba(0,255,163,0.12)' : 'rgba(255,71,87,0.12)'}`,
                    background: T.cardAlt, padding: '6px 8px', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', gap: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 9, fontWeight: 900, color: isLong ? T.success : T.danger, fontFamily: "'JetBrains Mono', monospace" }}>
                        {isLong ? '⬆' : '⬇'}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{ct.symbol}</span>
                      {closedSourceBadge && (
                        <span style={{ padding: '1px 4px', borderRadius: 999, background: closedSourceBadge.bg, border: `1px solid ${closedSourceBadge.border}`, color: closedSourceBadge.color, fontSize: 5.5, fontWeight: 800 }}>{closedSourceBadge.label}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 7, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>
                        {fmtPricePlain(ct.entryPrice, ct.symbol)} → {fmtPricePlain(ct.exitPrice, ct.symbol)}
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

      {/* end */}
    </div>
  )
}
