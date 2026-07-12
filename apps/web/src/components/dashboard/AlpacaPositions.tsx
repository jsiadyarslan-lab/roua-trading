'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { useVisibleInterval } from '@/hooks/useVisibleInterval'
import { RefreshCw, TrendingDown, TrendingUp, X as XIcon, History } from 'lucide-react'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { useScopedStyle } from '@/hooks/useScopedStyle'
import { usePaperTradesStore, type ClosedPaperTrade } from '@/hooks/usePaperTradesStore'
import { useAgentStore } from '@/hooks/useAgentStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { fmtPriceLocale as fmtPrice, fmtPrice as fmtPricePlain, fmtPnl } from '@/lib/price-format'
import { isNestJsId } from '@/lib/api-fetch'
import { PositionModal, type PositionModalData } from './PositionModal'

// Fix: تحويل الوحدات الخام إلى لوتات للعرض
// للكريبتو: contractSize=1, فاللوتات = الوحدات (0.01 BTC = 0.01 لوت)
// للفوركس: contractSize=100000, فاللوتات = وحدات ÷ 100000 (1000 وحدة = 0.01 لوت)
function unitsToLotsDisplay(qty: number, symbol: string): string {
  if (!qty || qty <= 0) return '—'
  const isCrypto = symbol.includes('/USDT') || symbol.includes('/BTC') || symbol.includes('/USD')
  // للكريبتو: اعرض كما هو (0.01 BTC)
  if (isCrypto) {
    return qty >= 1 ? qty.toFixed(2) : qty.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
  }
  // للفوركس: حوّل وحدات → لوتات (100,000 وحدة = 1 لوت)
  const lots = qty / 100000
  if (lots >= 0.01) return lots.toFixed(2)
  // لو أقل من 0.01 لوت، اعرض بالوحدات
  return qty >= 100 ? Math.round(qty).toString() : qty.toFixed(0)
}

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
 * Returns one of: 'اللاسع' (lasic), 'المنفّذ' (executor), 'الوكيل' (agent), 'ورقي' (paper), or null.
 */
function getTradeSourceLabel(
  isPaper: boolean,
  source?: string,
  tradeSource?: string,
  exchange?: string,
  t: (key: string) => string = () => '',
): { label: string; color: string; bg: string; border: string } | null {
  // Priority 0: Lasic scalper (must be BEFORE paper check — Lasic often trades paper)
  if (source === 'lazic' || source === 'lasic' || tradeSource === 'lazic' || tradeSource === 'lasic') {
    return {
      label: t('sourceLasic'),
      color: '#FF6B35',  // Lasic brand orange
      bg: 'rgba(255,107,53,0.12)',
      border: 'rgba(255,107,53,0.25)',
    }
  }
  // Priority 1: Smart Executor source (check BEFORE agent to prevent mislabeling)
  if (source === 'bot' || source === 'executor' || source === 'smart_executor'
      || tradeSource === 'smart_executor' || tradeSource === 'auto_paper') {
    return {
      label: t('sourceExecutor'),
      color: '#00D4FF',
      bg: 'rgba(0,212,255,0.12)',
      border: 'rgba(0,212,255,0.20)',
    }
  }
  // Priority 2: Agent source
  if (source === 'agent' || tradeSource === 'agent') {
    return {
      label: t('sourceAgent'),
      color: '#B388FF',
      bg: 'rgba(168,85,247,0.12)',
      border: 'rgba(168,85,247,0.20)',
    }
  }
  // Priority 3: Paper trading (from exchange name or isPaper flag)
  if (isPaper || exchange === 'paper-trading' || tradeSource === 'user_manual') {
    return {
      label: t('sourcePaper'),
      color: '#FFB800',
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
  const router = useRouter()
  const { setSelectedSymbol } = useSymbolStore()
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

  // ── Context Menu State (right-click on position card) ──
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number;
    positionId: string;
    symbol: string;
    side: 'long' | 'short';
    entryPrice: number;
    qty: number;
    stopLoss?: number;
    takeProfit?: number;
    source: string;
  } | null>(null)

  // ── Modal State (professional dialog) ──
  const [modal, setModal] = useState<PositionModalData | null>(null)

  // ── Resize State (drag to resize positions panel) ──
  // الارتفاع الافتراضي 180px، محفوظ في localStorage
  const DEFAULT_HEIGHT = 180
  const MIN_HEIGHT = 80
  const MAX_HEIGHT = 600
  const [panelHeight, setPanelHeight] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_HEIGHT
    const saved = localStorage.getItem('alpacaPositionsHeight')
    return saved ? Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, parseInt(saved))) : DEFAULT_HEIGHT
  })
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartY = useRef(0)
  const resizeStartHeight = useRef(0)

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    resizeStartY.current = e.clientY
    resizeStartHeight.current = panelHeight
  }, [panelHeight])

  useEffect(() => {
    if (!isResizing) return
    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - resizeStartY.current
      // السحب لأعلى (deltaY سالب) = زيادة الارتفاع (البطاقة تتمدد لأعلى)
      // السحب لأسفل (deltaY موجب) = تقليل الارتفاع (البطاقة تتقلص لأسفل)
      const newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, resizeStartHeight.current - deltaY))
      setPanelHeight(newHeight)
    }
    const handleMouseUp = () => {
      setIsResizing(false)
      // احفظ الارتفاع في localStorage
      try { localStorage.setItem('alpacaPositionsHeight', String(panelHeight)) } catch {}
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    // cursor عام أثناء السحب
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      // احفظ الارتفاع النهائي
      try { localStorage.setItem('alpacaPositionsHeight', String(panelHeight)) } catch {}
    }
  }, [isResizing, panelHeight])
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
    if (r.includes('STOP_LOSS') || r === 'STOP_LOSS_HIT') return { label: t('reasonStopLoss'), color: '#FF4757' }
    if (r.includes('TAKE_PROFIT') || r === 'TAKE_PROFIT_HIT') return { label: t('reasonTakeProfit'), color: '#00FFA3' }
    if (r === 'MANUAL' || r === 'USER_MANUAL') return { label: t('reasonManual'), color: '#9CA3B5' }
    if (r.includes('TIME_EXPIRED')) return { label: t('reasonAuto'), color: '#FFB800' }
    if (r === 'AUTO_CLOSE') return { label: t('reasonAuto'), color: '#FFB800' }
    if (r.includes('STALE') || r.includes('AUTO')) return { label: t('reasonAuto'), color: '#FFB800' }
    if (r.includes('STRATEGY') || r.includes('MAX_HOLDING')) return { label: t('reasonStrategic'), color: '#B388FF' }
    if (r.includes('EXCHANGE_SYNC')) return { label: t('reasonSync'), color: '#00D4FF' }
    if (r === 'FORCE_CLOSE') return { label: t('reasonForce'), color: '#FF4757' }
    if (r.includes('EMERGENCY')) return { label: t('reasonForce'), color: '#FF4757' }
    return { label: reason, color: '#6B7280' }
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
        height: panelHeight,
        minHeight: MIN_HEIGHT,
        maxHeight: MAX_HEIGHT,
        overflow: 'hidden',
        background: '#151A22',
        position: 'relative',
        transition: isResizing ? 'none' : 'height 0.15s ease',
      }}
    >
      {/* ── Resize Zone — الحافة العلوية بأكملها قابلة للسحب ──
          المستخدم يضغط على أي مكان في الحافة العلوية ويسحب.
          المؤشر البصري: شريط مضيء دائماً + grip dots + tooltip.
          السحب لأعلى = تمدد، السحب لأسفل = تقلص. */}
      <div
        onMouseDown={handleResizeStart}
        title="اسحب لتغيير الحجم"
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 8,
          cursor: 'ns-resize',
          background: isResizing
            ? 'rgba(0,212,255,0.25)'
            : 'rgba(0,212,255,0.04)',
          borderBottom: isResizing
            ? '1px solid rgba(0,212,255,0.4)'
            : '1px solid rgba(0,212,255,0.15)',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          transition: 'background 0.15s, border-color 0.15s',
        }}
        onMouseEnter={(e) => {
          if (!isResizing) {
            e.currentTarget.style.background = 'rgba(0,212,255,0.12)'
            e.currentTarget.style.borderBottomColor = 'rgba(0,212,255,0.3)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isResizing) {
            e.currentTarget.style.background = 'rgba(0,212,255,0.04)'
            e.currentTarget.style.borderBottomColor = 'rgba(0,212,255,0.15)'
          }
        }}
      >
        {/* grip dots — 4 نقاط للإشارة إلى قابلية السحب */}
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            width: 3, height: 3, borderRadius: '50%',
            background: isResizing ? 'rgba(0,212,255,0.7)' : 'rgba(0,212,255,0.35)',
            transition: 'background 0.15s',
          }} />
        ))}
      </div>
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
              gridTemplateColumns: 'minmax(140px,1.4fr) 56px minmax(70px,80px) minmax(70px,80px) minmax(82px,92px) minmax(110px,120px) 76px 44px',
              gap: 8,
              alignItems: 'center',
              padding: '6px 8px 4px',
              color: '#6B7280',
              fontSize: 10,
              fontWeight: 800,
              fontFamily: "var(--font-ar)",
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              marginBottom: 4,
            }}
          >
            <div>{t('contract')}</div>
            <div style={{ textAlign: 'center' }}>{t('qty')}</div>
            <div style={{ textAlign: 'center' }}>{t('entry')}</div>
            <div style={{ textAlign: 'center' }}>{t('current')}</div>
            <div style={{ textAlign: 'center' }}>{t('pnl')}</div>
            <div style={{ textAlign: 'center' }}>{t('sl')} / {t('tp')}</div>
            <div style={{ textAlign: 'center' }}>{t('opening')}</div>
            <div style={{ textAlign: 'center' }}>{t('closeBtn')}</div>
          </div>
        )}

        {allPositions.length === 0 && (
          <div
            style={{
              borderRadius: 'var(--radius-lg)',
              border: `1px dashed ${'#2A313C'}`,
              background: 'rgba(255,255,255,0.025)',
              minHeight: 110,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              color: '#6B7280',
              textAlign: 'center',
              padding: 16,
            }}
          >
            <div style={{ fontSize: 11, color: '#F0F2F5' }}>{t('noOpenTrades')}</div>
            <div style={{ fontSize: 11 }}>{t('noOpenTradesHint')}</div>
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
              onContextMenu={(e) => {
                e.preventDefault()
                setContextMenu({
                  x: e.clientX,
                  y: e.clientY,
                  positionId: position.id,
                  symbol: position.symbol,
                  side: (position.side === 'long' ? 'long' : 'short') as 'long' | 'short',
                  entryPrice: Number(position.avgEntryPrice || (position as any).entryPrice) || 0,
                  qty: Number((position as any).qty || (position as any).quantity) || 0,
                  stopLoss: (position as any).stopLoss ? Number((position as any).stopLoss) : (position.sl ? Number(position.sl) : undefined),
                  takeProfit: (position as any).takeProfit ? Number((position as any).takeProfit) : (position.tp ? Number(position.tp) : undefined),
                  source: position.source || position.tradeSource || '',
                })
              }}
              style={{
                borderRadius: 'var(--radius-lg)',
                border: `1px solid ${pnlUp ? 'rgba(0,255,163,0.20)' : 'rgba(255,71,87,0.20)'}`,
                background: `linear-gradient(180deg, ${'#151A22'}, ${'#1A1D29'})`,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.03), 0 4px 12px rgba(0,0,0,0.18)`,
                padding: '8px 8px',
                display: 'grid',
                gridTemplateColumns: 'minmax(140px,1.4fr) 56px minmax(70px,80px) minmax(70px,80px) minmax(82px,92px) minmax(110px,120px) 76px 44px',
                gap: 8,
                alignItems: 'center',
                transition: 'border-color 0.15s',
              }}
            >
              {/* Contract + Buy/Sell badge — prominent */}
              <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 900,
                    color: '#F0F2F5',
                    fontFamily: "var(--font-mono)",
                    whiteSpace: 'nowrap',
                    letterSpacing: 0.2,
                  }}
                >
                  {position.symbol}
                </span>
                {/* Buy/Sell badge — أكبر وأوضح */}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 2,
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-xs)',
                    background: isLong ? 'rgba(0,255,163,0.20)' : 'rgba(255,71,87,0.20)',
                    border: `1px solid ${isLong ? 'rgba(0,255,163,0.45)' : 'rgba(255,71,87,0.45)'}`,
                    color: isLong ? '#00FFA3' : '#FF4757',
                    fontSize: 10,
                    fontWeight: 900,
                    whiteSpace: 'nowrap',
                    letterSpacing: 0.4,
                  }}
                >
                  {isLong ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                  {isLong ? 'BUY' : 'SELL'}
                </span>
                {/* Source badge */}
                {sourceBadge && (
                  <span
                    style={{
                      padding: '1px 5px',
                      borderRadius: 'var(--radius-2xl)',
                      background: sourceBadge.bg,
                      border: `1px solid ${sourceBadge.border}`,
                      color: sourceBadge.color,
                      fontSize: 10,
                      fontWeight: 800,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {sourceBadge.label}
                  </span>
                )}
              </div>

              {/* Qty */}
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3B5', fontFamily: "var(--font-mono)", textAlign: 'center', whiteSpace: 'nowrap' }}>
                {Number((position as any).qty ?? (position as any).quantity ?? 0).toFixed(2)}
              </div>

              {/* Entry */}
              <div style={{ fontSize: 12, fontWeight: 700, color: '#E6EDF3', fontFamily: "var(--font-mono)", textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {fmtPrice(position.avgEntryPrice, position.symbol)}
              </div>

              {/* Current */}
              <div style={{ fontSize: 12, fontWeight: 800, color: '#F0F2F5', fontFamily: "var(--font-mono)", textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {fmtPrice(position.currentPrice, position.symbol)}
              </div>

              {/* P&L — bold, prominent */}
              <div style={{ fontSize: 12, fontWeight: 900, color: pnlUp ? '#00FFA3' : '#FF4757', fontFamily: "var(--font-mono)", textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {fmtPnl(position.unrealizedPnl)}
              </div>

              {/* SL / TP — combined column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center', minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11, fontFamily: "var(--font-mono)", whiteSpace: 'nowrap' }}>
                  <span style={{ color: '#FF4757', fontWeight: 800, fontSize: 9 }}>SL</span>
                  <span style={{ color: position.sl ? '#FF4757' : '#6B7280', fontWeight: 700 }}>
                    {position.sl ? fmtPrice(position.sl, position.symbol) : '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11, fontFamily: "var(--font-mono)", whiteSpace: 'nowrap' }}>
                  <span style={{ color: '#00FFA3', fontWeight: 800, fontSize: 9 }}>TP</span>
                  <span style={{ color: position.tp ? '#00FFA3' : '#6B7280', fontWeight: 700 }}>
                    {position.tp ? fmtPrice(position.tp, position.symbol) : '—'}
                  </span>
                </div>
              </div>

              {/* Time */}
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#6B7280',
                  fontFamily: "var(--font-mono)",
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {openedAt}
              </div>

              {/* Close button */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => closePosition(position)}
                  disabled={closing === position.id}
                  style={{
                    minWidth: 38,
                    height: 24,
                    padding: '0 6px',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${confirmClose === position.id ? 'rgba(255,71,87,0.50)' : 'rgba(255,71,87,0.28)'}`,
                    background: confirmClose === position.id ? 'rgba(255,71,87,0.20)' : 'rgba(255,71,87,0.10)',
                    color: '#FF4757',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 900,
                    fontFamily: "var(--font-ar)",
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s',
                  }}
                >
                  {closing === position.id ? (
                    <RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} />
                  ) : confirmClose === position.id ? (
                    tc('confirm')
                  ) : (
                    <XIcon size={11} />
                  )}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* end */}

      {/* ── Context Menu (right-click on position card) ── */}
      {contextMenu && typeof document !== 'undefined' && createPortal(
        <>
          {/* Backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'transparent' }}
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
          />
          {/* Menu */}
          <div style={{
            position: 'fixed',
            left: Math.min(contextMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 220),
            top: Math.min(contextMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 9999) - 320),
            zIndex: 9999,
            minWidth: 200,
            background: 'rgba(11, 14, 20, 0.98)',
            border: '1px solid rgba(0, 212, 255, 0.25)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 16px rgba(0,212,255,0.1)',
            backdropFilter: 'blur(12px)',
            padding: '4px 0',
            fontFamily: 'var(--font-ar)',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              padding: '6px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{
                fontSize: 11, fontWeight: 800,
                color: contextMenu.side === 'long' ? '#00FFA3' : '#FF4757',
                padding: '1px 5px', borderRadius: 'var(--radius-xs)',
                background: contextMenu.side === 'long' ? 'rgba(0,255,163,0.12)' : 'rgba(255,71,87,0.12)',
              }}>
                {contextMenu.side === 'long' ? 'BUY' : 'SELL'}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#F0F2F5', fontFamily: 'var(--font-mono)' }}>
                {contextMenu.symbol || '—'}
              </span>
              <span style={{ fontSize: 11, color: '#6B7280', marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>
                {contextMenu.qty} @ {contextMenu.entryPrice.toFixed(contextMenu.entryPrice > 100 ? 2 : 5)}
              </span>
              <button
                onClick={() => setContextMenu(null)}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: '#6B7280', fontSize: 15, lineHeight: 1, padding: '0 2px', marginLeft: 4,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#FF4757'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#6B7280'; }}
                title="إغلاق"
              >
                ✕
              </button>
            </div>

            {/* Menu items */}
            {([
              { icon: '✎', label: 'تعديل SL/TP', color: '#00D4FF', action: 'modify_sltp' },
              { icon: '✕', label: 'إغلاق الصفقة', color: '#FF4757', action: 'close' },
              { icon: '⇄', label: 'عكس الصفقة', color: '#FFB800', action: 'reverse' },
              { divider: true },
              { icon: '📊', label: 'فتح الشارت', color: '#00FFA3', action: 'focus_chart' },
              { icon: '🔔', label: 'تنبيه على السعر', color: '#B388FF', action: 'alert' },
              { divider: true },
              { icon: 'ℹ', label: 'تفاصيل الصفقة', color: '#9CA3B5', action: 'details' },
              { icon: '📋', label: 'نسخ معرف الصفقة', color: '#9CA3B5', action: 'copy_id' },
            ] as Array<{ icon?: string; label?: string; color?: string; action?: string; divider?: boolean }>).map((item, i) => item.divider ? (
              <div key={`div-${i}`} style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
            ) : (
              <div
                key={item.action}
                onClick={() => {
                  const cm = contextMenu
                  if (!cm) return
                  setContextMenu(null)

                  const posData = {
                    positionId: cm.positionId,
                    symbol: cm.symbol,
                    side: cm.side,
                    entryPrice: cm.entryPrice,
                    qty: cm.qty,
                    stopLoss: cm.stopLoss,
                    takeProfit: cm.takeProfit,
                    source: cm.source,
                  }

                  switch (item.action) {
                    case 'modify_sltp':
                      setModal({ type: 'modify_sltp', title: 'تعديل SL/TP', positionData: posData,
                        inputValue: cm.stopLoss?.toString() || '', inputValue2: cm.takeProfit?.toString() || '' })
                      break
                    case 'close':
                      setModal({ type: 'close', title: 'تأكيد الإغلاق', positionData: posData })
                      break
                    case 'reverse':
                      setModal({ type: 'reverse', title: 'تأكيد العكس', positionData: posData })
                      break
                    case 'focus_chart':
                      // انتقل لصفحة الـ dashboard وحدد الزوج
                      setSelectedSymbol(cm.symbol)
                      router.push('/dashboard')
                      break
                    case 'alert':
                      setModal({ type: 'alert', title: 'تنبيه على السعر', positionData: posData,
                        inputValue: cm.entryPrice.toString() })
                      break
                    case 'details':
                      setModal({ type: 'details', title: 'تفاصيل الصفقة', positionData: posData })
                      break
                    case 'copy_id':
                      try { navigator.clipboard.writeText(cm.positionId) } catch {}
                      break
                  }
                }}
                style={{
                  padding: '7px 12px',
                  display: 'flex', alignItems: 'center', gap: 8,
                  cursor: 'pointer',
                  color: '#9CA3B5',
                  fontSize: 11,
                  fontWeight: 600,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `${item.color || '#9CA3B5'}15`
                  e.currentTarget.style.color = item.color || '#9CA3B5'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = '#9CA3B5'
                }}
              >
                <span style={{ fontSize: 13, width: 16, textAlign: 'center' }}>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </>,
        document.body
      )}

      {/* ── Professional Side Panel Modal ── */}
      <PositionModal modal={modal} setModal={setModal} onRefresh={fetchPositions} />
    </div>
  )
}
