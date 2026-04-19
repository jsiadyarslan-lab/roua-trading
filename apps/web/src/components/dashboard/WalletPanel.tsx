'use client'

import { useState, useEffect } from 'react'
import { Wallet, ChevronDown, TrendingUp, TrendingDown, Shield, ArrowUpRight, ArrowDownRight, Eye, EyeOff, BarChart3, CreditCard, PiggyBank, Activity } from 'lucide-react'

// ── Types ──
interface WalletData {
  equity: number
  balance: number
  availableMargin: number
  usedMargin: number
  todayPnl: number
  todayPnlPercent: number
  totalPnl: number
  totalPnlPercent: number
  freeMargin: number
  marginLevel: number
  currency: string
}

// ── Stat Row Component ──
function StatRow({ label, value, color, icon }: {
  label: string
  value: string
  color?: string
  icon?: React.ReactNode
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '5px 0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {icon && <span style={{ opacity: 0.6 }}>{icon}</span>}
        <span style={{
          fontSize: '10px',
          fontWeight: 500,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-ar), Inter, sans-serif',
        }}>{label}</span>
      </div>
      <span dir="ltr" style={{
        fontSize: '10.5px',
        fontWeight: 700,
        fontFamily: 'var(--font-mono), monospace',
        color: color || 'var(--text-main)',
        letterSpacing: '-0.02em',
      }}>{value}</span>
    </div>
  )
}

// ── Mini Spark Line (SVG) ──
function MiniSparkline({ data, color, width = 60, height = 20 }: {
  data: number[]
  color: string
  width?: number
  height?: number
}) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const points = data.map((v, i) =>
    `${(i / (data.length - 1)) * width},${height - 2 - ((v - min) / range) * (height - 4)}`
  ).join(' ')

  return (
    <svg width={width} height={height} style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill={`url(#spark-${color.replace('#', '')})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ── Progress Bar Component ──
function ProgressBar({ value, max, color, bgColor, label }: {
  value: number
  max: number
  color: string
  bgColor: string
  label?: string
}) {
  const percent = Math.min((value / max) * 100, 100)
  return (
    <div>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar)' }}>{label}</span>
          <span dir="ltr" style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{percent.toFixed(1)}%</span>
        </div>
      )}
      <div style={{
        width: '100%',
        height: '4px',
        borderRadius: '2px',
        background: bgColor,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${percent}%`,
          height: '100%',
          borderRadius: '2px',
          background: `linear-gradient(90deg, ${color}, ${color}cc)`,
          boxShadow: `0 0 6px ${color}66`,
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  )
}

export default function WalletPanel() {
  const [expanded, setExpanded] = useState(true)
  const [showBalance, setShowBalance] = useState(true)
  const [wallet, setWallet] = useState<WalletData | null>(null)
  const [sparkData, setSparkData] = useState<number[]>([])

  // Fetch real wallet data from API
  useEffect(() => {
    let mounted = true

    const fetchWallet = async () => {
      try {
        const response = await fetch('/api/trading/positions/summary')
        if (!response.ok) return
        const data = await response.json()

        if (!mounted) return

        // The API returns portfolio summary data
        if (data.equity !== undefined) {
          setWallet({
            equity: data.equity || 0,
            balance: data.balance || data.equity || 0,
            availableMargin: data.availableMargin || data.freeMargin || 0,
            usedMargin: data.usedMargin || 0,
            todayPnl: data.todayPnl || data.unrealizedPnl || 0,
            todayPnlPercent: data.todayPnlPercent || 0,
            totalPnl: data.totalPnl || 0,
            totalPnlPercent: data.totalPnlPercent || 0,
            freeMargin: data.freeMargin || data.availableMargin || 0,
            marginLevel: data.marginLevel || 0,
            currency: data.currency || 'USD',
          })
        }
      } catch {
        // API not available or not authenticated — keep wallet null
      }
    }

    fetchWallet()
    const interval = setInterval(fetchWallet, 15000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  // Generate sparkline data when wallet data changes
  useEffect(() => {
    const equity = wallet?.equity ?? 25000
    const data = Array.from({ length: 20 }, (_, i) =>
      equity * (0.94 + Math.random() * 0.08 + i * 0.003)
    )
    setSparkData(data)
  }, [wallet?.equity])

  const formatValue = (val: number) => {
    if (!showBalance) return '••••••'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: wallet?.currency || 'USD',
      minimumFractionDigits: 2,
    }).format(val)
  }

  const isPositive = (wallet?.todayPnl ?? 0) >= 0

  return (
    <div style={{
      borderRadius: '10px',
      overflow: 'hidden',
      flexShrink: 0,
      border: '1px solid var(--border)',
      background: 'var(--bg-card)',
      transition: 'border-color 0.2s',
      position: 'relative',
    }}>
      {/* Subtle accent glow at top */}
      <div style={{
        position: 'absolute',
        top: '-1px',
        left: '20%',
        right: '20%',
        height: '1px',
        background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
        opacity: 0.6,
      }} />

      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 10px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <div style={{
          width: '24px',
          height: '24px',
          borderRadius: '7px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, var(--accent), var(--purple))',
          boxShadow: '0 0 8px var(--accent-bg)',
        }}>
          <Wallet size={11} stroke="#fff" strokeWidth={2.2} />
        </div>
        <span style={{
          flex: '1 1 0%',
          fontSize: '11px',
          fontWeight: 800,
          letterSpacing: '0.04em',
          fontFamily: 'var(--font-ar), Inter, sans-serif',
          textAlign: 'start',
          color: 'var(--text-main)',
        }}>المحفظة</span>
        <div style={{
          transform: expanded ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s',
          display: 'flex',
          alignItems: 'center',
        }}>
          <ChevronDown size={12} stroke="var(--text-muted)" strokeWidth={2} />
        </div>
      </button>

      {expanded && (
        <div style={{ padding: '0 10px 10px' }}>
          {/* ── Equity Hero Section ── */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(10,132,255,0.06), rgba(162,89,255,0.04))',
            border: '1px solid var(--accent-border)',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '8px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Background glow */}
            <div style={{
              position: 'absolute',
              top: '-20px',
              right: '-10px',
              width: '80px',
              height: '80px',
              background: 'var(--accent)',
              filter: 'blur(40px)',
              opacity: 0.08,
              pointerEvents: 'none',
            }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CreditCard size={11} stroke="var(--accent)" strokeWidth={2} />
                <span style={{
                  fontSize: '9.5px',
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-ar), Inter, sans-serif',
                }}>حقوق الملكية</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setShowBalance(!showBalance) }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showBalance
                  ? <Eye size={12} stroke="var(--text-muted)" strokeWidth={1.8} />
                  : <EyeOff size={12} stroke="var(--text-muted)" strokeWidth={1.8} />
                }
              </button>
            </div>

            <div style={{
              fontSize: '22px',
              fontWeight: 800,
              fontFamily: 'var(--font-mono), monospace',
              color: 'var(--text-main)',
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
            }} dir="ltr">
              {wallet ? formatValue(wallet.equity) : '—'}
            </div>

            {/* P&L Badge + Sparkline */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '8px',
            }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                borderRadius: '6px',
                background: isPositive ? 'var(--profit-bg)' : 'var(--loss-bg)',
                border: `1px solid ${isPositive ? 'var(--border-profit)' : 'var(--border-loss)'}`,
              }}>
                {isPositive
                  ? <ArrowUpRight size={10} style={{ color: 'var(--profit)' }} />
                  : <ArrowDownRight size={10} style={{ color: 'var(--loss)' }} />
                }
                <span style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono), monospace',
                  color: isPositive ? 'var(--profit)' : 'var(--loss)',
                }} dir="ltr">
                  {wallet ? `${isPositive ? '+' : ''}${formatValue(wallet.todayPnl).replace('$', '$')} (${isPositive ? '+' : ''}${wallet.todayPnlPercent}%)` : '—'}
                </span>
              </div>
              {sparkData.length > 0 && (
                <MiniSparkline data={sparkData} color={isPositive ? 'var(--profit)' : 'var(--loss)'} />
              )}
            </div>
          </div>

          {/* ── Quick Stats Grid ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px',
            marginBottom: '8px',
          }}>
            {/* Balance */}
            <div style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '7px',
              padding: '8px 10px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                <PiggyBank size={9} stroke="var(--warning)" strokeWidth={2} />
                <span style={{ fontSize: '8.5px', fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'var(--font-ar)' }}>الرصيد</span>
              </div>
              <div dir="ltr" style={{
                fontSize: '12px',
                fontWeight: 800,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-main)',
                letterSpacing: '-0.02em',
              }}>{wallet ? (showBalance ? formatValue(wallet.balance) : '••••') : '—'}</div>
            </div>

            {/* Free Margin */}
            <div style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '7px',
              padding: '8px 10px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                <Activity size={9} stroke="var(--profit)" strokeWidth={2} />
                <span style={{ fontSize: '8.5px', fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'var(--font-ar)' }}>الهامش المتاح</span>
              </div>
              <div dir="ltr" style={{
                fontSize: '12px',
                fontWeight: 800,
                fontFamily: 'var(--font-mono)',
                color: 'var(--profit)',
                letterSpacing: '-0.02em',
              }}>{wallet ? (showBalance ? formatValue(wallet.availableMargin) : '••••') : '—'}</div>
            </div>
          </div>

          {/* ── Detailed Stats ── */}
          <div style={{
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: '6px',
          }}>
            <StatRow
              label="الهامش المستخدم"
              value={wallet ? (showBalance ? formatValue(wallet.usedMargin) : '••••') : '—'}
              icon={<BarChart3 size={9} stroke="var(--accent)" strokeWidth={2} />}
            />
            <StatRow
              label="مستوى الهامش"
              value={wallet ? (showBalance ? `${wallet.marginLevel.toFixed(1)}%` : '••••') : '—'}
              color={wallet && wallet.marginLevel > 200 ? 'var(--profit)' : wallet && wallet.marginLevel > 100 ? 'var(--warning)' : 'var(--loss)'}
              icon={<Shield size={9} stroke="var(--purple)" strokeWidth={2} />}
            />
            <StatRow
              label="إجمالي الربح"
              value={wallet ? (showBalance ? `+${formatValue(wallet.totalPnl).replace('$', '$')}` : '••••') : '—'}
              color="var(--profit)"
              icon={<TrendingUp size={9} stroke="var(--profit)" strokeWidth={2} />}
            />
          </div>

          {/* ── Margin Usage Bar ── */}
          {wallet && (
            <div style={{ marginTop: '8px' }}>
              <ProgressBar
                value={wallet.usedMargin}
                max={wallet.equity}
                color="var(--accent)"
                bgColor="var(--bg-input)"
                label="استخدام الهامش"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
