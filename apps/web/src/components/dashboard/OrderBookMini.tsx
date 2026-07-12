'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ArrowUp, ArrowDown } from 'lucide-react'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { useScopedStyle } from '@/hooks/useScopedStyle'
import { BINANCE_URLS, CRYPTO_BASES } from '@/lib/charts/config'
import { useTranslations } from 'next-intl'

interface OrderRow {
  price: number
  size:  number
  total: number
}

interface DepthData {
  asks: [string, string][]
  bids: [string, string][]
}

// Normalize symbol for Binance: BTC/USD → btcusdt
function toBinanceStream(symbol: string): string | null {
  const base = symbol.split('/')[0]
  if (!CRYPTO_BASES.has(base)) return null
  // BTC/USD → btcusdt, ETH/USDT → ethusdt
  const normalized = symbol.replace('/', '').replace(/USD$/, 'USDT').toLowerCase()
  return normalized
}

function buildRowsFromDepth(
  rawLevels: [string, string][],
  direction: 'ask' | 'bid',
  maxLevels = 10
): OrderRow[] {
  const levels = rawLevels.slice(0, maxLevels)
  let cumTotal = 0
  return levels.map(([p, s]) => {
    const price = parseFloat(p)
    const size  = parseFloat(s)
    cumTotal   += size
    return { price, size, total: cumTotal }
  })
}

export function OrderBookMini() {
  useScopedStyle(`@keyframes spin { to { transform: rotate(360deg); } }`)
  const { selectedSymbol, setSelectedSymbol } = useSymbolStore()
  const tc = useTranslations('common')
  const t = useTranslations('dashboard.execution')
  const tob = useTranslations('dashboard.orderBook')
  // Only subscribe to the selected symbol's quote — prevents re-renders from other symbol updates
  const selectedQuote = useMarketStore(state => state.quotes[selectedSymbol])

  const [asks, setAsks] = useState<OrderRow[]>([])
  const [bids, setBids] = useState<OrderRow[]>([])
  const [connected, setConnected] = useState(false)
  const [isCrypto, setIsCrypto] = useState(true)

  const wsRef = useRef<WebSocket | null>(null)
  // V594: track pending setTimeout IDs so we can clean them up on unmount
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connectDepth = useCallback((symbol: string) => {
    // Gracefully close any existing connection to prevent "Ping received after close"
    const oldWs = wsRef.current
    wsRef.current = null
    if (oldWs) {
      // Remove handlers before closing to prevent stale callbacks
      oldWs.onopen = null
      oldWs.onmessage = null
      oldWs.onerror = null
      oldWs.onclose = null
      if (oldWs.readyState === WebSocket.OPEN || oldWs.readyState === WebSocket.CONNECTING) {
        oldWs.close(1000, 'symbol-change')
      }
    }

    const streamId = toBinanceStream(symbol)
    if (!streamId) {
      // Non-crypto (Forex/Stocks) — use simulated depth based on quote
      setIsCrypto(false)
      setConnected(false)
      return
    }

    setIsCrypto(true)
    const wsUrl = `${BINANCE_URLS.ws}/ws/${streamId}@depth20@1000ms`

    // V594: clear any pending connect timeout before setting a new one
    if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current)
    // Small delay to ensure old connection is fully closed before opening new one
    connectTimeoutRef.current = setTimeout(() => {
      try {
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => setConnected(true)
        ws.onclose = () => {
          setConnected(false)
          // Auto-reconnect after delay if the component is still mounted
          if (wsRef.current === ws) {
            // V594: track reconnect timeout for cleanup
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
            reconnectTimeoutRef.current = setTimeout(() => {
              if (wsRef.current === ws) {
                connectDepth(symbol)
              }
            }, 5000)
          }
        }
        ws.onerror = () => {
          setConnected(false)
          // onclose will fire after onerror
        }

        ws.onmessage = (event) => {
          try {
            const data: DepthData = JSON.parse(event.data)
            if (!data.asks || !data.bids) return

            const newAsks = buildRowsFromDepth(data.asks, 'ask', 12).reverse()
            const newBids = buildRowsFromDepth(data.bids, 'bid', 12)

            setAsks(newAsks)
            setBids(newBids)
          } catch { /* ignore parse errors */ }
        }
      } catch {
        setConnected(false)
      }
    }, 100) // 100ms delay for clean handoff
  }, [])

  useEffect(() => {
    connectDepth(selectedSymbol)
    return () => {
      const ws = wsRef.current
      wsRef.current = null
      // V594: clear pending timeouts to prevent leaks and re-connect after unmount
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current)
        connectTimeoutRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      if (ws) {
        ws.onopen = null
        ws.onmessage = null
        ws.onerror = null
        ws.onclose = null
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, 'cleanup')
        }
      }
    }
  }, [selectedSymbol, connectDepth])

  // For non-crypto, simulate from quote data
  useEffect(() => {
    if (isCrypto) return
    if (!selectedQuote || selectedQuote.price === 0) return

    const basePrice = selectedQuote.price
    const spread = basePrice * 0.0005

    // V594: deterministic sizes based on price + level index
    // (previously Math.random() caused flickering on every quote update)
    const sizeForLevel = (level: number) => {
      // pseudo-deterministic size: varies by level but stable for same price
      const seed = Math.floor(basePrice * 1000) + level * 31
      const normalized = ((seed * 9301 + 49297) % 233280) / 233280
      return parseFloat((normalized * 0.5 + 0.01).toFixed(4))
    }

    const simAsks: OrderRow[] = []
    const simBids: OrderRow[] = []
    let cumA = 0, cumB = 0

    for (let i = 0; i < 12; i++) {
      const aSize = sizeForLevel(i)
      const bSize = sizeForLevel(i + 12) // different seed for bids
      cumA += aSize
      cumB += bSize
      simAsks.push({ price: basePrice + spread * (i + 1), size: aSize, total: cumA })
      simBids.push({ price: basePrice - spread * (i + 1), size: bSize, total: cumB })
    }

    setAsks(simAsks.reverse())
    setBids(simBids)
  }, [selectedQuote, selectedSymbol, isCrypto])

  const quote = selectedQuote
  const basePrice = quote?.price ?? 0
  const isPositive = (quote?.changePercent ?? 0) >= 0
  const maxTotal = Math.max(
    asks[0]?.total ?? 1,
    bids[bids.length - 1]?.total ?? 1,
    1
  )
  const maxSize = Math.max(
    ...asks.map(x => x.size),
    ...bids.map(x => x.size),
    1
  )

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
    }}>
      {/* Symbol Selection Tabs */}
      <div style={{
        display: 'flex', padding: '6px 12px', gap: 10, background: 'var(--surface)',
        borderBottom: '1px solid var(--card-border)', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div style={{ display: 'flex', gap: 10 }}>
          {['BTC/USD', 'ETH/USD', 'XAU/USD', 'EUR/USD'].map(s => {
            const active = s === selectedSymbol
            return (
              <button key={s} onClick={() => setSelectedSymbol(s)} style={{
                background: 'transparent', border: 'none',
                borderBottom: `2px solid ${active ? 'var(--success)' : 'transparent'}`,
                padding: '4px 0',
                color: active ? 'var(--foreground)' : 'var(--muted)',
                fontSize: 11, fontWeight: active ? 800 : 500, cursor: 'pointer',
                fontFamily: 'var(--mono)', transition: '0.2s'
              }}>
                {s.split('/')[0]}
              </button>
            )
          })}
        </div>
        {/* Connection status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: connected ? 'var(--success)' : (isCrypto ? 'var(--danger)' : 'var(--warning)'),
            boxShadow: connected ? '0 0 4px var(--success)' : 'none'
          }} />
          <span style={{ fontSize: 11, color: 'var(--foreground)', fontFamily: "var(--font-mono)" }}>
            {connected ? tob('live') : isCrypto ? tob('connecting') : tob('sim')}
          </span>
        </div>
      </div>

      {/* Header Labels */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', padding: '8px 16px',
        fontSize: 11, color: 'var(--foreground)', fontWeight: 800, textTransform: 'uppercase',
        letterSpacing: '0.05em'
      }}>
        <span>{tc('price')}</span>
        <span>{tc('quantity')}</span>
      </div>

      <div className="custom-scrollbar no-scrollbar" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {basePrice === 0 && asks.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
            <div style={{ width: 24, height: 24, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <span style={{ color: 'var(--foreground)', fontSize: 11 }}>{t('connecting')}</span>

          </div>
        ) : (
          <>
            {/* ASKS (Sells) */}
            <div style={{ display: 'flex', flexDirection: 'column-reverse' }}>
              {asks.map((ask, i) => (
                <OrderRowUI key={`ask-${i}`} row={ask} type="ask" maxTotal={maxTotal} maxSize={maxSize} index={i} />
              ))}
            </div>

            {/* Mid Price */}
            <div style={{
              margin: '2px 0', padding: '10px 16px',
              background: 'rgba(255,255,255,0.03)',
              borderTop: `1px solid ${isPositive ? 'var(--success)' : 'var(--danger)'}40`,
              borderBottom: `1px solid ${isPositive ? 'var(--success)' : 'var(--danger)'}40`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(12px)',
              boxShadow: `0 0 20px ${isPositive ? 'var(--success)' : 'var(--danger)'}15`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {isPositive ? <ArrowUp size={18} color="var(--success)" /> : <ArrowDown size={18} color="var(--danger)" />}
                <span className="price" style={{
                  fontSize: 19, color: isPositive ? 'var(--success)' : 'var(--danger)',
                  letterSpacing: '-0.02em', fontWeight: 900,
                  textShadow: `0 0 10px ${isPositive ? 'var(--success)' : 'var(--danger)'}60`
                }}>
                  {basePrice > 100
                    ? basePrice.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : basePrice.toFixed(5)}
                </span>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div className="number-data" style={{ fontSize: 11, color: isPositive ? 'var(--success)' : 'var(--danger)', fontWeight: 800 }}>
                  {isPositive ? '+' : ''}{(quote?.changePercent ?? 0).toFixed(2)}%
                </div>
                <div style={{ fontSize: 11, color: 'var(--foreground)', fontWeight: 700 }}>
                  {connected ? tob('liveDepth') : tob('lastPrice')}
                </div>
              </div>
            </div>

            {/* BIDS (Buys) */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {bids.map((bid, i) => (
                <OrderRowUI key={`bid-${i}`} row={bid} type="bid" maxTotal={maxTotal} maxSize={maxSize} index={i} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function OrderRowUI({ row, type, maxTotal, maxSize, index }: {
  row: OrderRow; type: 'ask' | 'bid'; maxTotal: number; maxSize: number; index: number
}) {
  const color = type === 'ask' ? 'var(--danger)' : 'var(--success)'
  const rawColor = type === 'ask' ? '255,71,87' : '0,255,163'

  const widthPct = Math.min((row.total / maxTotal) * 100, 100)
  const heatPct  = Math.min(row.size / maxSize, 1)
  const isWall   = heatPct > 0.75

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '4px 16px', position: 'relative', height: 26, cursor: 'pointer',
      background: isWall ? `rgba(${rawColor}, 0.10)` : (index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)'),
      borderInlineEnd: isWall ? `3px solid rgb(${rawColor})` : '3px solid transparent',
      transition: 'all 0.1s',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
      onMouseLeave={e => e.currentTarget.style.background = isWall ? `rgba(${rawColor}, 0.10)` : (index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)')}
    >
      {/* Cumulative Depth Bar */}
      <div style={{
        position: 'absolute', top: 1, bottom: 1, right: 0,
        width: `${widthPct}%`,
        background: `rgba(${rawColor}, 0.07)`,
        borderInlineStart: `1px solid rgba(${rawColor}, 0.25)`,
        zIndex: 0,
        transition: 'width 0.15s ease-out'
      }} />

      {/* Size Heatmap */}
      <div style={{
        position: 'absolute', top: 3, bottom: 3, left: 16,
        width: `${heatPct * 36}%`,
        background: `linear-gradient(to right, rgba(${rawColor}, ${heatPct * 0.8}), transparent)`,
        zIndex: 0, borderRadius: '4px 0 0 4px',
      }} />

      <span className="price" style={{
        color: isWall ? '#fff' : color, fontWeight: isWall ? 900 : 700,
        zIndex: 1, fontSize: 11,
        textShadow: isWall ? `0 0 6px rgba(${rawColor},0.7)` : 'none'
      }}>
        {row.price > 100
          ? row.price.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : row.price.toFixed(5)}
      </span>
      <span className="number-data" style={{
        color: isWall ? `rgb(${rawColor})` : 'var(--foreground)',
        fontWeight: isWall ? 900 : 600, zIndex: 1, fontSize: 11,
        textShadow: isWall ? `0 0 5px rgba(${rawColor},0.5)` : 'none'
      }}>
        {row.size < 0.001 ? row.size.toFixed(6) : row.size.toFixed(3)}
      </span>
    </div>
  )
}
