'use client'

import { useEffect, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useVisibleInterval } from '@/hooks/useVisibleInterval'
import { RefreshCw, TrendingDown, TrendingUp, X as XIcon, History } from 'lucide-react'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { useScopedStyle } from '@/hooks/useScopedStyle'
import { usePaperTradesStore, type ClosedPaperTrade } from '@/hooks/usePaperTradesStore'
import { useAgentStore } from '@/hooks/useAgentStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { useMarketStore } from '@/hooks/useMarketStore'
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
  t: (key: string) => string = () => '',
): { label: string; color: string; bg: string; border: string } | null {
  // Priority 1: Smart Executor source (check BEFORE agent to prevent mislabeling)
  if (source === 'bot' || source === 'executor' || source === 'smart_executor'
      || tradeSource === 'smart_executor' || tradeSource === 'auto_paper') {
    return {
      label: t('sourceExecutor'),
      color: T.cyan,
      bg: 'rgba(0,212,255,0.12)',
      border: 'rgba(0,212,255,0.20)',
    }
  }
  // Priority 2: Agent source
  if (source === 'agent' || tradeSource === 'agent') {
    return {
      label: t('sourceAgent'),
      color: T.purple,
      bg: 'rgba(168,85,247,0.12)',
      border: 'rgba(168,85,247,0.20)',
    }
  }
  // Priority 3: Paper trading (from exchange name or isPaper flag)
  if (isPaper || exchange === 'paper-trading' || tradeSource === 'user_manual') {
    return {
      label: t('sourcePaper'),
      color: T.amber,
      bg: 'rgba(255,184,0,0.12)',
      border: 'rgba(255,184,0,0.20)',
    }
  }
  return null
}

export function AlpacaPositions() {
  const t = useTranslations('dashboard.alpacaPositions')
  const tc = useTranslations('common')
  const locale = useLocale()
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
  // V141: Closed positions from the database API (not just localStorage paper trades)
  const [dbClosedPositions, setDbClosedPositions] = useState<any[]>([])
  const [closedLoading, setClosedLoading] = useState(false)

  // V141: Fetch closed positions from the database API when the user opens the section
  const fetchClosedPositions = async () => {
    if (closedLoading) return
    setClosedLoading(true)
    try {
      // V205: Pass credentialId to API for server-side filtering by active account
      const activeCredId = usePositionsStore.getState().activeCredentialId
      const credParam = activeCredId ? `&credentialId=${encodeURIComponent(activeCredId)}` : ''
      const res = await fetch(`/api/trading/positions/history?limit=0${credParam}`)
      if (res.ok) {
        const data = await res.json()
        const positions = Array.isArray(data) ? data : (data.data || data.positions || [])
        setDbClosedPositions(positions)
      }
    } catch { /* silent */ }
    setClosedLoading(false)
  }

  // V141: Translate closeReason to Arabic for display
  // V213: Added TIME_EXPIRED, AUTO_CLOSE, EMERGENCY_STOP translations
  function getCloseReasonLabel(reason: string | null | undefined): { label: string; color: string } | null {
    if (!reason) return null
    const r = reason.toUpperCase()
    if (r.includes('STOP_LOSS') || r === 'STOP_LOSS_HIT') return { label: t('reasonStopLoss'), color: T.danger }
    if (r.includes('TAKE_PROFIT') || r === 'TAKE_PROFIT_HIT') return { label: t('reasonTakeProfit'), color: T.success }
    if (r === 'MANUAL' || r === 'USER_MANUAL') return { label: t('reasonManual'), color: T.text2 }
    if (r.includes('TIME_EXPIRED')) return { label: t('reasonAuto'), color: T.amber }
    if (r === 'AUTO_CLOSE') return { label: t('reasonAuto'), color: T.amber }
    if (r.includes('STALE') || r.includes('AUTO')) return { label: t('reasonAuto'), color: T.amber }
    if (r.includes('STRATEGY') || r.includes('MAX_HOLDING')) return { label: t('reasonStrategic'), color: T.purple }
    if (r.includes('EXCHANGE_SYNC')) return { label: t('reasonSync'), color: T.cyan }
    if (r === 'FORCE_CLOSE') return { label: t('reasonForce'), color: T.danger }
    if (r.includes('EMERGENCY')) return { label: t('reasonForce'), color: T.danger }
    return { label: reason, color: T.text3 }
  }

  // V141: Format duration between two dates
  function formatDuration(openedAt: string | Date, closedAt: string | Date): string {
    const start = new Date(openedAt).getTime()
    const end = new Date(closedAt).getTime()
    if (isNaN(start) || isNaN(end)) return '—'
    const diffMs = end - start
    const hours = Math.floor(diffMs / 3600000)
    const minutes = Math.floor((diffMs % 3600000) / 60000)
    if (hours > 24) return `${Math.floor(hours / 24)}${t('durationDayShort')} ${hours % 24}${t('durationHourShort')}`
    if (hours > 0) return `${hours}${t('durationHourShort')} ${minutes}${t('durationMinShort')}`
    return `${minutes}${t('durationMinShort')}`
  }

  // V235: Removed `seenSymbols` deduplication.
  //
  // ROOT FIX for "trades stacking in one position" bug:
  //   Previously, this code deduplicated positions by symbol — if 3 BTC
  //   positions existed in the DB, only 1 was shown. When the user closed
  //   it, the next one appeared, then the next — the "phantom" behavior.
  //
  //   The root cause was that `usePaperTradesStore` (local Zustand) was
  //   adding trades optimistically, creating duplicates that were hidden
  //   by this dedup. Now that usePaperTradesStore is a transparent proxy
  //   (V235 — all no-ops, returns empty arrays), there are no local
  //   duplicates. Each DB position has a unique ID and should be displayed
  //   independently — exactly like Binance/Bybit show multiple positions
  //   on the same symbol (e.g., grid trading creates many small positions).
  //
  //   The backend (V234) now blocks duplicate positions on the same symbol
  //   for manual trades, so in practice there will only be 1 position per
  //   symbol. But if the backend ever allows multiple (e.g., for grid
  //   strategies), the UI will display them correctly without hiding any.

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

  // ── Source 1: API positions (from usePositionsStore — DB is the source of truth) ──
  // V235: paperTrades is always [] now (usePaperTradesStore is a proxy).
  // We keep the `manualPaper` lookup for backward compat, but it will
  // always be undefined since paperTrades is empty.
  for (const position of positions) {
    if (!position || !position.symbol) continue
    const normalizedSide = normalizeSide(position.side)
    // V235: paperTrades is always [] — this find() always returns undefined
    const manualPaper = paperTrades.find(
      trade => trade.symbol.replace('/', '') === position.symbol.replace('/', '') && trade.source === 'manual',
    )

    allPositions.push({
      ...position,
      side: normalizedSide,
      dbId: (position as any)?.dbId
        || ((position as any)?.id && isNestJsId((position as any).id)
          ? (position as any).id
          : undefined),
      id: position.rawSymbol ?? position.symbol,
      isPaper: false,
      entryTime: (position as any)?.entryTime
        || (() => {
          const d = (position as any)?.openedAt
          if (!d) return null
          try {
            const ts = new Date(d).getTime()
            return isNaN(ts) ? null : ts
          } catch { return null }
        })()
        || manualPaper?.entryTime
        || null,
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
  // V235: Removed seenSymbols dedup — each position displays independently.
  // The agent store may contain positions that overlap with the DB query
  // (agent positions are also in the DB). To avoid showing the SAME DB
  // position twice (once from positions[], once from agentPositions[]),
  // we skip agent positions that have the same ID as an already-added
  // DB position. This is ID-based dedup (correct), not symbol-based (wrong).
  const addedIds = new Set<string>(positions.map(p => (p as any)?.id).filter(Boolean))
  for (const ap of agentPositions) {
    if (!ap || !ap.symbol) continue
    // V235: Skip if this exact position ID was already added from DB
    if (ap.id && addedIds.has(ap.id)) continue
    addedIds.add(ap.id)
    const normalizedSide = normalizeSide(ap.side)

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
      entryTime: (() => {
        if (!ap.openedAt) return null
        try {
          const ts = new Date(ap.openedAt).getTime()
          return isNaN(ts) ? null : ts
        } catch { return null }
      })(),
      tp: ap.takeProfit ?? null,
      sl: ap.stopLoss ?? null,
      source: actualSource,
      tradeSource: actualSource,
    })
  }

  // ── Source 3: Paper trades (from usePaperTradesStore) ──
  // V235: usePaperTradesStore.trades is always [] (transparent proxy).
  // This loop will never execute — kept for backward compatibility.
  // Once all callers are migrated to usePositionsStore, this block
  // and the paperTrades dependency can be removed entirely.
  for (const trade of paperTrades) {
    // V235: This loop is dead code — paperTrades is always []
    // Kept to avoid breaking the type contract. Will never execute.
    if (!trade.entryPrice || trade.entryPrice <= 0) continue
    const tradeValue = Math.abs(trade.qty * trade.entryPrice)
    if (tradeValue < 1) continue
    const base = trade.symbol.split('/')[0]
    if (/^\d+$/.test(base)) continue
    // V235: Use ID-based dedup (consistent with Source 2), not symbol-based
    if (trade.id && addedIds.has(trade.id)) continue
    addedIds.add(trade.id)

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
  }, [fetchPositions, fetchAccount])
  // Poll every 30s — pauses when tab hidden
  useVisibleInterval(() => { fetchPositions(); fetchAccount() }, 30000)
  // FIX: Auto-refresh closed positions every 30s to catch agent/automated closes
  useVisibleInterval(() => { fetchClosedPositions() }, 30000)

  const refreshAfterTrade = usePositionsStore(state => state.refreshAfterTrade)
  const addNotification = useNotificationStore(state => state.addNotification)

  const closePosition = async (pos: typeof allPositions[0]) => {
    const id = pos.id
    setClosing(id)

    // V173e: Optimistic removal — remove position from UI IMMEDIATELY
    // before API responds. Restore if API fails.
    const prevPositions = positions
    setPositions(positions.filter(p => p.id !== id))

    // ═══════════════════════════════════════════════════════════════
    // FIX: PROBLEM 3 — Use LATEST market price when closing.
    // Previously, the close notification used the stale `pos.currentPrice`
    // from the last API fetch (could be 15-30 seconds old for volatile
    // assets). Now we fetch the real-time price from the market store
    // before executing the close, ensuring accurate P&L display.
    // ═══════════════════════════════════════════════════════════════
    let livePrice = pos.currentPrice
    try {
      const quotes = useMarketStore.getState().quotes
      const quoteKey = Object.keys(quotes).find(k =>
        k.toUpperCase().replace('/', '') === pos.symbol.toUpperCase().replace('/', '')
      )
      if (quoteKey && Number(quotes[quoteKey]?.price) > 0) {
        livePrice = Number(quotes[quoteKey].price)
      }
    } catch { /* market store not ready */ }

    // Paper trade (local BotEngine) — close in store
    if (pos.isPaper) {
      closePaperTrade(id, 'MANUAL') // V227: Pass closeReason for proper tracking
      // FIX: Refresh account balance after closing paper trade
      refreshAfterTrade()
      addNotification({
        source: 'trade',
        priority: 'medium',
        action: 'CLOSE',
        title: t('closedPaperPosition', { symbol: pos.symbol }),
        body: `${pos.side === 'long' ? tc('buy') : tc('sell')} ${pos.qty} ${pos.symbol}`,
        pair: pos.symbol,
        price: livePrice,
      })
      setClosing(null)
      return
    }

    try {
      let closeSuccess = false
      let closeError = ''

      // CRITICAL FIX: SmartExecutor positions live in NestJS DB, not Alpaca.
      // Use POST /api/trading/positions/close with the real DB position id.
      // V230: Controller sends source:'USER' + closeReason:'USER_MANUAL', so
      // V214 defense allows the close. No need for force-close fallback.
      if (pos.dbId) {
        const response = await fetch('/api/trading/positions/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ positionId: pos.dbId }),
        })
        const json = await response.json()
        if (response.ok && !json.blockedByV214) {
          closeSuccess = true
        } else if (json.blockedByV214) {
          // V230: This should NOT happen — controller sends source:'USER'.
          // But handle defensively — try force-close with USER prefix in reason.
          try {
            const forceRes = await fetch('/api/trading/positions/force-close', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                positionId: pos.dbId,
                reason: `USER_FORCE_CLOSE: ${json.reason || 'blocked'}`,
              }),
            })
            if (forceRes.ok) {
              closeSuccess = true
            } else {
              closeError = json.reason || 'Close blocked'
            }
          } catch {
            closeError = json.reason || 'Close blocked'
          }
        } else {
          // Close failed for other reason (not found, already closed, API error)
          if (json.message?.includes('not found') || json.message?.includes('already closed')) {
            closeSuccess = true
          } else {
            closeError = json.message || json.error || t('unknownError')
          }
        }
      } else {
        // No DB id — try closePositionUnified which handles the full
        // NestJS → Alpaca fallback flow properly.
        const { closePositionUnified } = await import('@/lib/api-fetch')
        const result = await closePositionUnified(
          pos.rawSymbol ?? pos.symbol,
          undefined,
          { dbId: pos.dbId || undefined }
        )
        if (result.success) {
          closeSuccess = true
        } else {
          closeError = result.error || t('unknownError')
        }
      }

      if (closeSuccess) {
        refreshAfterTrade()
        addNotification({
          source: 'trade',
          priority: 'high',
          action: 'CLOSE',
          title: t('closedPosition', { symbol: pos.symbol }),
          body: `${pos.side === 'long' ? tc('buy') : tc('sell')} ${pos.qty} ${pos.symbol} @ $${livePrice.toFixed(2)}`,
          pair: pos.symbol,
          price: livePrice,
        })
      } else {
        // Restore position if close failed
        setPositions(prevPositions)
        alert(t('closeFailed', { error: closeError }))
      }
    } catch {
      alert(t('closeError'))
    } finally {
      setClosing(null)
    }
  }

  return (
    <div
      style={{
        direction: 'inherit',
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
            <div>{t('contract')}</div>
            <div style={{ textAlign: 'center' }}>{t('opening')}</div>
            <div style={{ textAlign: 'center' }}>{t('qty')}</div>
            <div style={{ textAlign: 'center' }}>{t('entry')}</div>
            <div style={{ textAlign: 'center' }}>{t('current')}</div>
            <div style={{ textAlign: 'center' }}>{t('tp')}</div>
            <div style={{ textAlign: 'center' }}>{t('sl')}</div>
            <div style={{ textAlign: 'center' }}>{t('pnl')}</div>
            <div style={{ textAlign: 'center' }}>{t('closeBtn')}</div>
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
            <div style={{ fontSize: 11, color: T.text }}>{t('noOpenTrades')}</div>
            <div style={{ fontSize: 9 }}>{t('noOpenTradesHint')}</div>
          </div>
        )}

        {allPositions.map(position => {
          // FIX: Normalize side for display - handles BUY/SELL and long/short
          const isLong = position.side === 'long'
          const pnlUp = position.unrealizedPnl >= 0
          const openedAt = position.entryTime
            ? new Date(position.entryTime).toLocaleString(locale === 'ar' ? 'ar-SA' : locale === 'fr' ? 'fr-FR' : locale === 'tr' ? 'tr-TR' : 'en-US', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })
            : t('undefined')

          // Determine source badge
          const sourceBadge = getTradeSourceLabel(
            position.isPaper,
            position.source,
            position.tradeSource,
            (position as any).exchange,
            t,
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
                  {isLong ? tc('buy') : tc('sell')}
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
                    tc('confirm')
                  ) : (
                    <>
                      <XIcon size={8} />
                      {t('closeBtn')}
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
              // V173e: Parallel close + optimistic removal
              // OLD: sequential for-loop + 200ms delay = ~3s for 8 positions
              // NEW: Promise.all = all close in parallel = ~350ms
              const prevPositions = positions
              setPositions([])
              clearAllPaperTrades()

              const results = await Promise.all(allPositions.map(async (pos) => {
                try {
                  if (pos.isPaper) return { ok: true }
                  if (pos.dbId) {
                    const res = await fetch('/api/trading/positions/close', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ positionId: pos.dbId }),
                    })
                    if (res.ok) return { ok: true }
                    // V230: Try force-close with USER prefix as fallback
                    const forceRes = await fetch('/api/trading/positions/force-close', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ positionId: pos.dbId, reason: 'USER_CLOSE_ALL' }),
                    })
                    return { ok: forceRes.ok }
                  }
                  const { closePositionUnified } = await import('@/lib/api-fetch')
                  const r = await closePositionUnified(pos.rawSymbol ?? pos.symbol, undefined, { dbId: pos.dbId || undefined })
                  return { ok: r.success }
                } catch { return { ok: false } }
              }))

              const closedCount = results.filter(r => r.ok).length
              const failedCount = results.filter(r => !r.ok).length
              if (failedCount > 0) setPositions(prevPositions)
              refreshAfterTrade()
              if (failedCount > 0) {
                addNotification({
                  source: 'trade',
                  priority: 'high',
                  action: 'CLOSE',
                  title: t('closedPositionsCount', { count: closedCount }),
                  body: t('closeFailedPositions', { count: failedCount }),
                  pair: '',
                  price: 0,
                })
              }
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
            {t('closeAndRemoveAll')}
          </button>
        </div>
      )}

      {/* V141: Closed Trades Section — now fetches from DATABASE, not just localStorage */}
      {(dbClosedPositions.length > 0 || closedTrades.length > 0) && (
        <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 4 }}>
          <button
            onClick={() => {
              const newShow = !showClosed
              setShowClosed(newShow)
              // V141: Fetch from database when opening the section
              if (newShow && dbClosedPositions.length === 0) fetchClosedPositions()
            }}
            style={{
              width: '100%', padding: '8px 10px', background: 'transparent', border: 'none',
              color: T.text2, cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', fontFamily: "'Cairo', sans-serif", fontSize: 10, fontWeight: 700,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <History size={12} />
              {t('closedTrades')} ({dbClosedPositions.length + closedTrades.length})
            </div>
            <span style={{ fontSize: 8, transform: showClosed ? 'rotate(180deg)' : 'rotate(0)', transition: '0.2s' }}>▼</span>
          </button>

          {showClosed && (
            <div className="custom-scrollbar" style={{ maxHeight: 300, overflowY: 'auto', padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* V141: Database closed positions — the PRIMARY source */}
              {dbClosedPositions.map((cp: any) => {
                const isLong = cp.side === 'BUY'
                const entryPrice = Number(cp.entryPrice) || 0
                const exitPrice = Number(cp.exitPrice) || 0
                const realizedPnl = Number(cp.realizedPnl) || 0
                const stopLoss = Number(cp.stopLoss) || 0
                const takeProfit = Number(cp.takeProfit) || 0
                const quantity = Number(cp.quantity) || 0
                const pnlUp = realizedPnl >= 0
                const sourceBadge = getTradeSourceLabel(cp.exchange === 'paper-trading', cp.source, undefined, cp.exchange, t)
                const closeReasonBadge = getCloseReasonLabel(cp.closeReason)
                const duration = cp.openedAt && cp.closedAt ? formatDuration(cp.openedAt, cp.closedAt) : '—'
                const closedDate = cp.closedAt
                  ? new Date(cp.closedAt).toLocaleDateString(locale === 'ar' ? 'ar-SA' : locale === 'fr' ? 'fr-FR' : locale === 'tr' ? 'tr-TR' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : ''

                return (
                  <div key={cp.id} style={{
                    borderRadius: 8, border: `1px solid ${pnlUp ? 'rgba(0,255,163,0.12)' : 'rgba(255,71,87,0.12)'}`,
                    background: T.cardAlt, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4,
                  }}>
                    {/* Row 1: Symbol, Direction, Source, Close Reason, PnL */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 9, fontWeight: 900, color: isLong ? T.success : T.danger, fontFamily: "'JetBrains Mono', monospace" }}>
                          {isLong ? '⬆' : '⬇'}
                        </span>
                        <span style={{ fontSize: 9, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{cp.symbol}</span>
                        {sourceBadge && (
                          <span style={{ padding: '1px 4px', borderRadius: 999, background: sourceBadge.bg, border: `1px solid ${sourceBadge.border}`, color: sourceBadge.color, fontSize: 5.5, fontWeight: 800 }}>{sourceBadge.label}</span>
                        )}
                        {/* V141: Close Reason Badge */}
                        {closeReasonBadge && (
                          <span style={{ padding: '1px 4px', borderRadius: 999, background: `${closeReasonBadge.color}18`, border: `1px solid ${closeReasonBadge.color}30`, color: closeReasonBadge.color, fontSize: 5.5, fontWeight: 800 }}>{closeReasonBadge.label}</span>
                        )}
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 900, color: pnlUp ? T.success : T.danger, fontFamily: "'JetBrains Mono', monospace" }}>
                        {fmtPnl(realizedPnl)}
                      </span>
                    </div>
                    {/* Row 2: Entry → Exit, SL, TP, Qty, Duration */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 7, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>
                      <span>
                        {t('entry')} {fmtPricePlain(entryPrice, cp.symbol)} → {t('exit')} {exitPrice > 0 ? fmtPricePlain(exitPrice, cp.symbol) : '—'}
                      </span>
                      {stopLoss > 0 && <span style={{ color: T.danger }}>{t('sl')} {fmtPricePlain(stopLoss, cp.symbol)}</span>}
                      {takeProfit > 0 && <span style={{ color: T.success }}>{t('tp')} {fmtPricePlain(takeProfit, cp.symbol)}</span>}
                      <span>{quantity}</span>
                      <span>{duration}</span>
                      <span>{closedDate}</span>
                    </div>
                  </div>
                )
              })}

              {/* V141: Also show localStorage paper trades (for backwards compatibility) */}
              {closedTrades.map((ct: ClosedPaperTrade) => {
                // FIX: Skip localStorage trades that are already in DB
                // Improved deduplication: match by symbol + entryPrice + side (more precise)
                const alreadyInDb = dbClosedPositions.some((cp: any) => {
                  const sameSymbol = (cp.symbol || '').replace('/', '') === ct.symbol.replace('/', '')
                  const sameEntry  = Math.abs(Number(cp.entryPrice) - ct.entryPrice) < 0.0001
                  const sameSide   = (cp.side || '').toLowerCase() === ct.side
                  return sameSymbol && sameEntry && sameSide
                })
                if (alreadyInDb) return null

                const isLong = ct.side === 'long'
                const pnlUp = ct.realizedPnl >= 0
                const closedSourceBadge = getTradeSourceLabel(true, ct.source, undefined, undefined, t)
                // V227: Show closeReason badge for paper trades (STOP_LOSS, TAKE_PROFIT, MANUAL)
                const paperCloseReasonBadge = getCloseReasonLabel(ct.closeReason)
                return (
                  <div key={ct.id} style={{
                    borderRadius: 8, border: `1px solid ${pnlUp ? 'rgba(0,255,163,0.12)' : 'rgba(255,71,87,0.12)'}`,
                    background: T.cardAlt, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 9, fontWeight: 900, color: isLong ? T.success : T.danger, fontFamily: "'JetBrains Mono', monospace" }}>
                          {isLong ? '⬆' : '⬇'}
                        </span>
                        <span style={{ fontSize: 9, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{ct.symbol}</span>
                        {closedSourceBadge && (
                          <span style={{ padding: '1px 4px', borderRadius: 999, background: closedSourceBadge.bg, border: `1px solid ${closedSourceBadge.border}`, color: closedSourceBadge.color, fontSize: 5.5, fontWeight: 800 }}>{closedSourceBadge.label}</span>
                        )}
                        {/* V227: Close Reason Badge for paper trades */}
                        {paperCloseReasonBadge && (
                          <span style={{ padding: '1px 4px', borderRadius: 999, background: `${paperCloseReasonBadge.color}18`, border: `1px solid ${paperCloseReasonBadge.color}30`, color: paperCloseReasonBadge.color, fontSize: 5.5, fontWeight: 800 }}>{paperCloseReasonBadge.label}</span>
                        )}
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 900, color: pnlUp ? T.success : T.danger, fontFamily: "'JetBrains Mono', monospace" }}>
                        {fmtPnl(ct.realizedPnl)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 7, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>
                      <span>
                        {t('entry')} {fmtPricePlain(ct.entryPrice, ct.symbol)} → {t('exit')} {fmtPricePlain(ct.exitPrice, ct.symbol)}
                      </span>
                      {ct.sl ? <span style={{ color: T.danger }}>{t('sl')} {fmtPricePlain(ct.sl, ct.symbol)}</span> : null}
                      {ct.tp ? <span style={{ color: T.success }}>{t('tp')} {fmtPricePlain(ct.tp, ct.symbol)}</span> : null}
                      <span>{ct.qty}</span>
                    </div>
                  </div>
                )
              })}

              <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                <button
                  onClick={fetchClosedPositions}
                  disabled={closedLoading}
                  style={{
                    padding: '4px 8px', background: 'transparent', border: `1px solid ${T.border}`,
                    color: T.text3, borderRadius: 6, cursor: closedLoading ? 'wait' : 'pointer', fontSize: 7,
                    fontFamily: "'Cairo', sans-serif", fontWeight: 700,
                  }}
                >
                  {closedLoading ? t('updating') : t('update')}
                </button>
                <button
                  onClick={clearClosedTrades}
                  style={{
                    padding: '4px 8px', background: 'transparent', border: `1px solid ${T.border}`,
                    color: T.text3, borderRadius: 6, cursor: 'pointer', fontSize: 7,
                    fontFamily: "'Cairo', sans-serif", fontWeight: 700,
                  }}
                >
                  {t('clearLocal')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* end */}
    </div>
  )
}
