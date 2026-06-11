'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { formatFreshness, getStatusLabel, getStatusTone, type DataStatus } from '@/lib/dashboard-live'
import { PortfolioSparkline } from '@/components/portfolio/PortfolioSparkline'
import { PortfolioHeatMap } from '@/components/portfolio/PortfolioHeatMap'
import { QuickActionsBar } from '@/components/portfolio/QuickActionsBar'
import { PositionCard } from '@/components/portfolio/PositionCard'
import { T } from '@/lib/theme-tokens'
import { useTranslations } from 'next-intl'

/* ── Default Real Data State ── */
const DEFAULT: PortfolioSummary = {
  balance:       0,
  equity:        0,
  totalPnl:      0,
  pnlPercent:    0,
  totalPositions: 0,
  winRate:       0,
  margin:        0,
  freeMargin:    0,
  totalProfit:   0,
  totalLoss:     0,
  winCount:      0,
  lossCount:     0,
  totalTrades:   0,
  sharpe:        null,
}

interface PortfolioSummary {
  balance: number
  /** V189: Equity = balance + unrealized PnL (for MT5: different from balance) */
  equity?: number
  totalPnl: number
  pnlPercent: number
  totalPositions: number
  winRate: number
  margin: number
  freeMargin: number
  totalProfit: number
  totalLoss: number
  winCount: number
  lossCount: number
  totalTrades: number
  sharpe: number | null
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

import { usePaperTradesStore } from '@/hooks/usePaperTradesStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { closePositionUnified, isNestJsId } from '@/lib/api-fetch'
import { toast } from '@/hooks/use-toast'
import { getSymbolLeverage } from '@/lib/margin-calculator'

export function usePortfolioSummary() {
  // V189: Use getActivePositions to filter by active account
  const allPositions = usePositionsStore(s => s.positions)
  const activeCredentialId = usePositionsStore(s => s.activeCredentialId)
  const getActivePositions = usePositionsStore(s => s.getActivePositions)
  // V189: When activeCredentialId is set, show only positions from that account
  const positions = activeCredentialId ? getActivePositions() : allPositions
  const account = usePositionsStore(s => s.account)
  const fetchAccount = usePositionsStore(s => s.fetchAccount)
  const fetchPositions = usePositionsStore(s => s.fetchPositions)
  const paperTrades = usePaperTradesStore(s => s.trades)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // PERF: Initial fetch only — GlobalLogicEngine polls fetchAccount + fetchPositions
    // every 15 seconds. A separate 10s poll here causes double API calls.
    fetchAccount()
    fetchPositions()
    setLoading(false)
    // No interval here — let GlobalLogicEngine handle background refresh
  }, [fetchAccount, fetchPositions])

  const data = (() => {
    // V189: Use cash (which is now balance for MT5) instead of equity as the primary display
    const balance = Number(account?.cash) || 0
    const equity = Number(account?.equity) || 0
    // FIX: When real positions exist (from exchange), don't include paper trades
    // in the summary calculations. Paper trades are demo/fake and shouldn't
    // affect the real portfolio summary numbers.
    const hasRealPositions = positions.length > 0 && positions.some(p => (p as any).exchange || p.source === 'nestjs')
    const relevantPaperTrades = hasRealPositions ? [] : paperTrades.filter(pt => {
      // Filter out phantom trades with zero value or test symbols
      const tradeValue = Math.abs(pt.qty * (pt.currentPrice || pt.entryPrice || 0))
      if (tradeValue < 1) return false
      const base = pt.symbol.split('/')[0]
      if (/^\d+$/.test(base)) return false
      return true
    })

    // V152 FIX: Client-side margin is PRIMARY (always correct for all symbol formats).
    // Previously (V149-V151), account.initialMargin was primary but came from
    // the backend which returned WRONG leverage for no-slash symbols.
    const accountMargin = Number(account?.initialMargin) || 0
    const clientSideMargin = positions.length > 0
      ? (() => {
          let margin = 0
          for (const p of positions) {
            const qty = Number(p.qty) || 0
            // V173c: getSymbolLeverage reads user-configured leverage (set via setUserLeverage on mount)
            const entryPx = Number((p as any).entryPrice || p.currentPrice) || 0
            if (qty <= 0 || entryPx <= 0) continue
            const notional = Math.abs(qty * entryPx)
            const leverage = getSymbolLeverage(p.symbol || '') || 1
            margin += notional / leverage
          }
          return margin
        })()
      : 0
    // V152: Client-side margin takes PRIORITY (handles all symbol formats correctly)
    const margin = clientSideMargin > 0 ? clientSideMargin : accountMargin
    // positionsMarketValue is still computed for the Exposure display only (not margin)
    let positionsMarketValue = 0
    positions.forEach(p => {
      positionsMarketValue += Math.abs(Number(p.marketValue || 0))
    })
    relevantPaperTrades.forEach(pt => {
      positionsMarketValue += Math.abs(pt.qty * (pt.currentPrice || pt.entryPrice || 0))
    })

    let totalPnl = 0, totalPositions = 0, pnlPercent = 0
    let totalProfit = 0, totalLoss = 0
    let win = 0, loss = 0

    totalPositions += positions.length
    positions.forEach(p => {
      totalPnl += p.unrealizedPnl || 0
      if (p.unrealizedPnl > 0) {
        totalProfit += p.unrealizedPnl
        win++
      } else {
        totalLoss += Math.abs(p.unrealizedPnl)
        loss++
      }
    })

    totalPositions += relevantPaperTrades.length
    relevantPaperTrades.forEach(pt => {
      totalPnl += pt.unrealizedPnl
      if (pt.unrealizedPnl > 0) {
        totalProfit += pt.unrealizedPnl
        win++
      } else {
        totalLoss += Math.abs(pt.unrealizedPnl)
        loss++
      }
    })

    if (balance > 0) pnlPercent = (totalPnl / (balance - totalPnl)) * 100

    // V189: freeMargin = what's available for new positions
    // balance = cash = true wallet balance (margin included, without floating PnL)
    // equity = balance + unrealized PnL
    const freeMargin = Math.max(0, balance + totalPnl - margin)

    return {
      balance, // V189: balance = cash = true wallet balance (margin included, without floating PnL)
      equity,  // V189: equity = balance + floating PnL (for display comparison)
      margin,
      freeMargin,
      totalPnl,
      totalPositions,
      pnlPercent,
      totalProfit,
      totalLoss,
      winCount: win,
      lossCount: loss,
      totalTrades: win + loss,
      winRate: (win + loss) > 0 ? (win / (win + loss)) * 100 : 0,
      sharpe: null as number | null,
    }
  })()

  return { data, loading }
}

/* ── Generate simulated sparkline data from current balance ── */
function useSparklineData(balance: number, pnl: number): number[] {
  const [data, setData] = useState<number[]>([])

  useEffect(() => {
    // Generate a realistic sparkline based on current balance
    const base = balance || 100000
    const points = 24
    const volatility = base * 0.003 // 0.3% volatility per point
    const trend = pnl > 0 ? 1 : pnl < 0 ? -1 : 0
    const newData: number[] = []
    let current = base - (pnl * 0.5) // Start from half the P&L ago

    for (let i = 0; i < points; i++) {
      const noise = (Math.random() - 0.45) * volatility
      current += noise + (trend * volatility * 0.15)
      newData.push(Math.max(0, current))
    }

    // Ensure the last point is close to current balance
    newData[newData.length - 1] = base
    setData(newData)
  }, [balance, pnl])

  return data
}

/* ══ Mini Portfolio Widget (for dashboard sidebar panel) ══ */
export function PortfolioMini({
  mobile = false,
  compact = false,
  dataStatus = 'disconnected',
  lastUpdatedAt = null,
  sourceLabel = '',
  selectedSymbol,
}: {
  mobile?: boolean
  compact?: boolean
  dataStatus?: DataStatus
  lastUpdatedAt?: string | number | null
  sourceLabel?: string
  selectedSymbol?: string
}) {
  const { data } = usePortfolioSummary()
  const tp = useTranslations('portfolio')
  const tc = useTranslations('common')
  const positions = usePositionsStore(s => s.positions)
  const exchangeBalances = usePositionsStore(s => s.exchangeBalances)
  // V164: Read the exchangeUnavailable flag to show warning when real exchange fails
  const exchangeUnavailable = usePositionsStore(s => s.account?.exchangeUnavailable === true)
  // V175: Read the active exchange name — when set, dashboard shows this exchange's balance
  const activeExchangeName = usePositionsStore(s => s.account?.activeExchangeName as string | null)
  // V185: Check if the balance is stale (from cache, MetaAPI down)
  const isStaleBalance = usePositionsStore(s => s.account?.isStaleBalance === true)
  const [closingSymbol, setClosingSymbol] = useState<string | null>(null)
  const pnlUp = data.totalPnl > 0
  const cardGap = compact ? 6 : 8
  const pad = compact ? '10px 12px' : '8px 10px'
  const balanceSize = compact ? 16 : 18
  const statusTone = getStatusTone(dataStatus)
  const sparklineData = useSparklineData(data.balance, data.totalPnl)

  // Derive heatmap positions
  const heatmapPositions = useMemo(() =>
    positions.map(p => ({
      symbol: p.symbol || p.side || '—',
      unrealizedPnl: p.unrealizedPnl || 0,
      marketValue: Number(p.marketValue || p.currentPrice || 0),
    })),
    [positions]
  )

  return (
    <div style={{
      width: '100%', height: '100%',
      padding: pad,
      display: 'flex', flexDirection: 'column', gap: cardGap,
      overflow: 'auto',
      boxSizing: 'border-box',
    }}
    className="custom-scrollbar"
    >
      {/* Account Status */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
        borderRadius: 10,
        padding: compact ? '6px 8px' : '7px 10px',
        border: `1px solid ${statusTone}28`,
        background: 'rgba(255,255,255,0.025)',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 8.5, color: T.text3, marginBottom: 3 }}>{tp('accountStatus')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '2px 7px',
              borderRadius: 999,
              border: `1px solid ${statusTone}40`,
              background: `${statusTone}16`,
              color: statusTone,
              fontSize: 8.5,
              fontWeight: 800,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusTone }} />
              {getStatusLabel(dataStatus, tc)}
            </span>
            {selectedSymbol && <span style={{ fontSize: 9, color: T.text2, fontFamily: "'JetBrains Mono', monospace" }}>{selectedSymbol}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 8.5, color: T.text3 }}>{sourceLabel}</div>
          <div style={{ fontSize: 9, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{formatFreshness(lastUpdatedAt, tc)}</div>
        </div>
      </div>

      {/* V165: Exchange unavailable warning banner with IP whitelist fix */}
      {exchangeUnavailable && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 5,
          padding: '5px 8px', borderRadius: 8,
          background: 'rgba(255,184,0,0.12)',
          border: '1px solid rgba(255,184,0,0.3)',
          cursor: 'pointer',
        }}
        onClick={() => window.location.href = '/dashboard/settings/exchange'}
        >
          <span style={{ fontSize: 11 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 8.5, fontWeight: 800, color: T.amber, fontFamily: "'Cairo', sans-serif" }}>
              {tp('exchangeUnavailable')}
            </div>
            <div style={{ fontSize: 7, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>
              {tp('exchangeUnavailableHint')}
            </div>
          </div>
        </div>
      )}

      {/* Balance + Sparkline row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        gap: 8,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              fontFamily: "'Cairo', sans-serif",
              fontSize: 9, color: T.text2,
            }}>{tp('totalBalance')}</div>
            {/* V175: Show active exchange badge (e.g., "MT5") when active account succeeded */}
            {/* V164: Show "ورقي" badge only when falling back to paper balance */}
            {/* V185: Show "مخزّن" indicator when balance is from cache */}
            {activeExchangeName && !exchangeUnavailable ? (
              <span style={{
                fontSize: 6.5, padding: '1px 4px', borderRadius: 3,
                background: isStaleBalance ? 'rgba(245,158,11,0.15)' : 'rgba(0,255,163,0.15)',
                color: isStaleBalance ? T.amber : T.green,
                fontWeight: 800, fontFamily: "'JetBrains Mono', monospace",
                border: isStaleBalance ? '0.5px solid rgba(245,158,11,0.3)' : '0.5px solid rgba(0,255,163,0.3)',
              }}>
                {activeExchangeName.toUpperCase()}{isStaleBalance ? ' ⚠' : ''}
              </span>
            ) : exchangeUnavailable ? (
              <span style={{
                fontSize: 6.5, padding: '1px 4px', borderRadius: 3,
                background: 'rgba(0,212,255,0.15)', color: T.cyan,
                fontWeight: 800, fontFamily: "'Cairo', sans-serif",
                border: '0.5px solid rgba(0,212,255,0.3)',
              }}>
                {tp('paper')}
              </span>
            ) : null}
          </div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: balanceSize, fontWeight: 800,
            color: activeExchangeName && !exchangeUnavailable ? T.text : (exchangeUnavailable ? T.cyan : T.text),
            letterSpacing: '-0.02em',
          }}>${fmt(data.balance, 0)}</div>
        </div>
        <div style={{ flexShrink: 0, width: 80, height: 32 }}>
          <PortfolioSparkline
            data={sparklineData}
            color={data.totalPnl > 0 ? T.green : data.totalPnl < 0 ? T.red : T.text2}
            width={80}
            height={32}
          />
        </div>
      </div>

      {/* V193: Prominent stale balance warning for MT5/real trading accounts */}
      {isStaleBalance && activeExchangeName && !exchangeUnavailable && (
        <div style={{
          padding: '4px 8px', borderRadius: 6,
          background: 'rgba(245,158,11,0.12)',
          border: '1px solid rgba(245,158,11,0.3)',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <span style={{ fontSize: 10 }}>⚠️</span>
          <span style={{
            fontSize: 8, color: T.amber, fontFamily: "'Cairo', sans-serif",
            fontWeight: 700, lineHeight: 1.4,
          }}>
            بيانات مؤقتة — فشل الاتصال بـ MetaAPI. الرصيد معروض من ذاكرة التخزين المؤقت وقد لا يكون دقيقاً.
          </span>
        </div>
      )}
      {/* V193: MetaAPI completely down (TOKEN_MISSING) — critical warning */}
      {usePositionsStore(s => s.account?.metaapiDown === true) && !isStaleBalance && (
        <div style={{
          padding: '5px 8px', borderRadius: 6,
          background: 'rgba(239,68,68,0.12)',
          border: '1px solid rgba(239,68,68,0.35)',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <span style={{ fontSize: 10 }}>🔴</span>
          <span style={{
            fontSize: 8, color: '#f87171', fontFamily: "'Cairo', sans-serif",
            fontWeight: 700, lineHeight: 1.4,
          }}>
            MetaAPI غير متصل — لا يمكن جلب بيانات حساب MT5 الحقيقي. تأكد من ضبط مفتاح METAAPI_TOKEN.
          </span>
        </div>
      )}

      {/* V119: Per-Exchange Balance Breakdown */}
      {exchangeBalances.length > 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 3,
          padding: '5px 6px', borderRadius: 6,
          background: 'rgba(255,255,255,0.02)',
          border: '0.5px solid rgba(255,255,255,0.04)',
        }}>
          <div style={{ fontSize: 7.5, color: T.text3, fontFamily: "'Cairo', sans-serif", fontWeight: 700, marginBottom: 1 }}>
            {tp('exchangeBalances')}
          </div>
          {exchangeBalances.map((ex) => {
            const isPaper = ex.exchange === 'paper-trading'
            const exColor = isPaper ? T.cyan : ex.isTestnet ? T.amber : T.green
            const exLabel = isPaper ? tp('paper') : (() => {
              const exName = ex.exchange?.toLowerCase() || ''
              if (exName.includes('binance-direct') || exName.includes('binance_direct')) return tp('exchangeBinanceDirect')
              if (exName.includes('binance')) return tp('exchangeBinance')
              if (exName.includes('alpaca')) return tp('exchangeAlpaca')
              return ex.exchange.charAt(0).toUpperCase() + ex.exchange.slice(1)
            })()
            return (
              <div key={ex.credentialId || ex.exchange} style={{
                display: 'flex', alignItems: 'center', gap: 5, fontSize: 8,
              }}>
                <div style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: exColor,
                  boxShadow: `0 0 4px ${exColor}60`,
                }} />
                <span style={{ color: exColor, fontWeight: 700, fontFamily: "'Cairo', sans-serif", minWidth: 48 }}>
                  {exLabel}
                </span>
                <span style={{ color: T.text, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>
                  ${fmt((ex as any).balance ?? ex.equity, 2)}
                </span>
                {ex.error && (
                  <span style={{ fontSize: 6.5, color: T.red, fontFamily: "'Cairo', sans-serif" }} title={(ex as any).errorDetail || ex.error}>
                    ⚠ {(ex as any).errorDetail || ex.error?.length > 30 ? ex.error?.substring(0, 25) + '…' : ex.error}
                  </span>
                )}
                {!isPaper && !ex.isTestnet && (
                  <span style={{
                    fontSize: 5.5, padding: '0px 3px', borderRadius: 2,
                    background: 'rgba(0,255,163,0.1)', color: T.green,
                    fontWeight: 700,
                  }}>
                    {tp('real')}
                  </span>
                )}
                {ex.isTestnet && !isPaper && (
                  <span style={{
                    fontSize: 5.5, padding: '0px 3px', borderRadius: 2,
                    background: 'rgba(255,184,0,0.1)', color: T.amber,
                    fontWeight: 700,
                  }}>
                    {tp('testnet')}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* P&L Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 3,
          padding: '2px 7px', borderRadius: 12,
          background: `${data.totalPnl > 0 ? T.green : data.totalPnl < 0 ? T.red : T.text2}18`,
          border: `0.5px solid ${data.totalPnl > 0 ? T.green : data.totalPnl < 0 ? T.red : T.text2}44`,
        }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10, fontWeight: 700,
            color: data.totalPnl > 0 ? T.green : data.totalPnl < 0 ? T.red : T.text2,
          }}>
            {data.totalPnl > 0 ? '+' : data.totalPnl < 0 ? '-' : ''}{fmt(Math.abs(data.pnlPercent))}%
          </span>
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '5px 8px', borderRadius: 7,
          background: `${data.totalPnl > 0 ? T.green : data.totalPnl < 0 ? T.red : T.text2}0d`,
          border: `0.5px solid ${data.totalPnl > 0 ? T.green : data.totalPnl < 0 ? T.red : T.text2}22`,
        }}>
          <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 9.5, color: T.text2, marginInlineEnd: 6 }}>P/L</span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, fontWeight: 700,
            color: data.totalPnl > 0 ? T.green : data.totalPnl < 0 ? T.red : T.text2,
          }}>
            {data.totalPnl > 0 ? '+' : data.totalPnl < 0 ? '-' : ''}${fmt(Math.abs(data.totalPnl), 0)}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 4 }}>
        {[
          { label: tp('positions'), value: data.totalPositions, color: T.cyan },
          { label: tp('winPercent'), value: `${data.winRate}%`, color: T.green },
          { label: tp('exposure'), value: `${Math.min(100, Math.abs(data.margin) > 0 && data.balance > 0 ? Math.round((Math.abs(data.margin) / data.balance) * 100) : 0)}%`, color: T.amber },
        ].map((stat) => (
          <div key={stat.label} style={{
            flex: 1, textAlign: 'center',
            padding: '4px 2px', borderRadius: 6,
            background: `${stat.color}0d`,
            border: `0.5px solid ${stat.color}22`,
          }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, fontWeight: 700, color: stat.color,
            }}>{stat.value}</div>
            <div style={{
              fontFamily: "'Cairo', sans-serif",
              fontSize: 8, color: T.text3,
            }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Win rate bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 8.5, color: T.text3 }}>
            {data.winCount} {tp('winningTrades', { count: data.winCount })}
          </span>
          <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 8.5, color: T.text3 }}>
            {data.lossCount} {tp('losingTrades', { count: data.lossCount })}
          </span>
        </div>
        <div style={{
          height: 5, borderRadius: 3,
          background: `${T.red}30`, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', borderRadius: 3,
            width: `${data.winRate}%`,
            background: `linear-gradient(90deg, ${T.green}, ${T.cyan})`,
            transition: 'width 0.8s ease',
          }} />
        </div>
      </div>

      {/* Heatmap */}
      {heatmapPositions.length > 0 && (
        <PortfolioHeatMap positions={heatmapPositions} />
      )}

      {/* Quick Actions */}
      {!compact && <QuickActionsBar onAction={() => {}} />}

      {/* Position Cards */}
      {!compact && positions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflow: 'auto' }} className="custom-scrollbar">
          {positions.slice(0, 5).map((p, i) => (
            <PositionCard
              key={p.symbol || i}
              symbol={p.symbol || '—'}
              side={p.side || 'long'}
              qty={Number(p.qty) || 0}
              avgEntryPrice={Number(p.avgEntryPrice) || 0}
              currentPrice={Number(p.currentPrice) || 0}
              unrealizedPnl={p.unrealizedPnl || 0}
              marketValue={Number(p.marketValue) || 0}
              loading={closingSymbol === (p.symbol || '—')}
              onClose={async (symbol: string) => {
                const pos = positions.find(pp => pp.symbol === symbol)
                if (!pos) return
                setClosingSymbol(symbol)
                try {
                  const dbId = pos.dbId || (pos.id && isNestJsId(pos.id) ? pos.id : undefined)
                  const result = await closePositionUnified(
                    pos.id || symbol,
                    undefined,
                    {
                      dbId,
                      onClosed: () => {
                        usePositionsStore.getState().refreshAfterTrade()
                      },
                    },
                  )
                  if (result.success) {
                    usePositionsStore.getState().refreshAfterTrade()
                    toast({
                      title: tp('positionClosed'),
                      description: tp('positionClosedDesc', { symbol }),
                    })
                  } else {
                    toast({
                      title: tp('positionCloseFailed'),
                      description: result.error || tp('unknownError'),
                      variant: 'destructive',
                    })
                  }
                } catch (err) {
                  console.warn('[PortfolioMini] Close failed:', err)
                  toast({
                    title: tp('positionCloseFailed'),
                    description: err instanceof Error ? err.message : tp('positionCloseError'),
                    variant: 'destructive',
                  })
                } finally {
                  setClosingSymbol(null)
                }
              }}
            />
          ))}
          {positions.length > 5 && (
            <div style={{ textAlign: 'center', padding: '4px 0', fontSize: 8, color: T.text3, fontFamily: "'Cairo', sans-serif" }}>
              +{positions.length - 5} {tp('additionalPositions', { count: positions.length - 5 })}
            </div>
          )}
        </div>
      )}

      {/* V183: Full margin breakdown — Used Margin, Free Margin, Balance */}
      {!compact && <>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: `0.5px solid ${T.border}`, paddingTop: 4,
        }}>
          <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 8.5, color: T.text3 }}>{tp('marginUsed')}</span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9.5, color: T.amber,
          }}>${fmt(data.margin, 0)}</span>
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 2,
        }}>
          <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 8.5, color: T.text3 }}>{tp('freeMargin')}</span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9.5, color: T.green,
          }}>${fmt(data.freeMargin, 0)}</span>
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 2,
        }}>
          <span style={{ fontFamily: "'Cairo', sans-serif", fontSize: 8.5, color: T.text3 }}>{tp('balance')}</span>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9.5, color: T.text,
          }}>${fmt(data.balance, 0)}</span>
        </div>
      </>}
    </div>
  )
}
