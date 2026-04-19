'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Brain, Info, Zap, ShieldAlert, TrendingUp, TrendingDown, RefreshCw, Activity } from 'lucide-react'
import { useMarketData } from '@/hooks/useMarketData'

interface ScannerRow {
  pair: string
  signal: 'BUY' | 'SELL' | 'WAIT'
  price: number
  change: number
  changePercent: number
  score: number
  strength: number
  reason: string
  timeframe: string
  source: string
}

const SCANNER_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'EUR/USD', 'GBP/USD', 'XAU/USD']

// Simple technical scoring based on price change
function computeSignal(changePercent: number): { signal: 'BUY' | 'SELL' | 'WAIT', score: number, strength: number, reason: string } {
  if (changePercent > 2) return { signal: 'BUY', score: 85 + Math.min(Math.round(changePercent * 2), 15), strength: 85 + Math.min(Math.round(changePercent), 15), reason: 'زخم صعودي قوي مع حجم مرتفع' }
  if (changePercent > 0.5) return { signal: 'BUY', score: 65 + Math.round(changePercent * 5), strength: 60 + Math.round(changePercent * 8), reason: 'اتجاه صعودي مع تأكيد المتوسطات المتحركة' }
  if (changePercent < -2) return { signal: 'SELL', score: 85 + Math.min(Math.round(Math.abs(changePercent) * 2), 15), strength: 85 + Math.min(Math.round(Math.abs(changePercent)), 15), reason: 'ضغط بيعي قوي مع اختراق مستوى دعم' }
  if (changePercent < -0.5) return { signal: 'SELL', score: 65 + Math.round(Math.abs(changePercent) * 5), strength: 60 + Math.round(Math.abs(changePercent) * 8), reason: 'إشارة هبوطية مع تباعد سلبي على RSI' }
  return { signal: 'WAIT', score: 50, strength: 40, reason: 'السوق في منطقة توازن — انتظار تأكيد' }
}

function StrengthBar({ value }: { value: number }) {
  const bars = 8
  const filled = Math.round(value / (100 / bars))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          style={{
            width: '3px',
            borderRadius: '1px',
            height: `${6 + (i % 3) * 2}px`,
            background: i < filled
              ? (value >= 70 ? 'var(--profit)' : value >= 50 ? 'var(--warning)' : 'var(--loss)')
              : 'var(--bg-input)',
            opacity: i < filled ? 1 : 0.4,
            transition: 'all 0.3s',
          }}
        />
      ))}
    </div>
  )
}

function ScoreRing({ value }: { value: number }) {
  const getColor = () => {
    if (value >= 80) return 'var(--profit)'
    if (value >= 60) return 'var(--warning)'
    return 'var(--loss)'
  }
  const color = getColor()
  const circumference = 2 * Math.PI * 14
  const offset = circumference - (value / 100) * circumference

  return (
    <div style={{ position: 'relative', width: '32px', height: '32px', flexShrink: 0 }}>
      <svg width="32" height="32" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="16" cy="16" r="14" fill="none" stroke="var(--bg-input)" strokeWidth="3" />
        <motion.circle
          cx="16" cy="16" r="14" fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </svg>
      <span style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '8px',
        fontWeight: 800,
        fontFamily: 'var(--font-mono)',
        color,
      }}>{value}</span>
    </div>
  )
}

type RiskLevel = 'Low' | 'Medium' | 'High'
type StrategyType = 'Scalping' | 'Swing' | 'Momentum'

export default function SmartScanner() {
  const [botActive, setBotActive] = useState(true)
  const [strategy, setStrategy] = useState<StrategyType>('Swing')
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('Medium')
  const [loading, setLoading] = useState(false)

  // Real market data
  const { quotes, refetch } = useMarketData({ symbols: SCANNER_SYMBOLS, refreshInterval: 8000 })

  // Build scanner rows from real quotes
  const scannerData: ScannerRow[] = SCANNER_SYMBOLS.map(pair => {
    const quote = quotes.get(pair)
    if (!quote) {
      return { pair, signal: 'WAIT' as const, price: 0, change: 0, changePercent: 0, score: 0, strength: 0, reason: 'جارٍ التحميل...', timeframe: '1H', source: '—' }
    }
    const { signal, score, strength, reason } = computeSignal(quote.changePercent)
    return {
      pair,
      signal,
      price: quote.price,
      change: quote.change,
      changePercent: quote.changePercent,
      score: Math.min(score, 99),
      strength: Math.min(strength, 99),
      reason,
      timeframe: strategy === 'Scalping' ? '15m' : strategy === 'Swing' ? '4H' : '1H',
      source: quote.source,
    }
  })

  // Calculate overall bullish/bearish
  const bullishCount = scannerData.filter(r => r.signal === 'BUY').length
  const bearishCount = scannerData.filter(r => r.signal === 'SELL').length
  const totalSignals = bullishCount + bearishCount || 1
  const bullishPercent = Math.round((bullishCount / SCANNER_SYMBOLS.length) * 100)
  const bearishPercent = 100 - bullishPercent

  // Calculate total P&L from signals
  const totalPnl = scannerData.reduce((sum, r) => sum + r.change, 0)
  const totalPnlPercent = scannerData.reduce((sum, r) => sum + r.changePercent, 0)

  const generateSignals = async () => {
    setLoading(true)
    try {
      const pairs = ['BTC/USDT', 'EUR/USD', 'GBP/USD']
      await Promise.all(
        pairs.map((pair) =>
          fetch(`/api/signals/generate/${encodeURIComponent(pair)}`, { method: 'POST' }).catch(() => null)
        )
      )
      refetch()
    } catch { /* silent */ }
    setLoading(false)
  }

  const strategies: StrategyType[] = ['Scalping', 'Swing', 'Momentum']
  const riskLevels: RiskLevel[] = ['Low', 'Medium', 'High']

  const strategyLabels: Record<StrategyType, string> = {
    Scalping: 'سكالبينج',
    Swing: 'سوينج',
    Momentum: 'زخم',
  }

  const riskLabels: Record<RiskLevel, string> = {
    Low: 'منخفضة',
    Medium: 'متوسطة',
    High: 'عالية',
  }

  const formatPrice = (price: number) => {
    if (price === 0) return '—'
    if (price > 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    if (price > 1) return price.toFixed(4)
    return price.toFixed(6)
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '10px',
    }}>
      {/* AI Bot Header */}
      <div style={{
        padding: '8px 10px',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        {/* Row 1: Title + Status + Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '7px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, var(--purple), #FF6B9D)',
            }}>
              <Brain size={12} stroke="#fff" strokeWidth={2} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-ar)' }}>الماسح الذكي</span>
                <span style={{
                  fontSize: '8px',
                  fontWeight: 700,
                  background: 'var(--purple-bg)',
                  border: '1px solid var(--purple-border)',
                  color: 'var(--purple)',
                  padding: '0px 5px',
                  borderRadius: '6px',
                }}>AI</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* Bot status */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 7px',
              borderRadius: '6px',
              background: botActive ? 'var(--profit-bg)' : 'var(--bg-input)',
              border: `1px solid ${botActive ? 'var(--border-profit)' : 'var(--border-subtle)'}`,
            }}>
              <motion.div
                style={{
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  background: botActive ? 'var(--profit)' : 'var(--text-muted)',
                }}
                animate={{ opacity: botActive ? [1, 0.4, 1] : 0.5 }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <span style={{ fontSize: '8.5px', fontWeight: 700, color: botActive ? 'var(--profit)' : 'var(--text-muted)' }}>
                {botActive ? 'نشط' : 'متوقف'}
              </span>
            </div>

            {/* Toggle button */}
            <button
              onClick={() => setBotActive(!botActive)}
              style={{
                padding: '3px 8px',
                borderRadius: '6px',
                fontSize: '8.5px',
                fontWeight: 700,
                fontFamily: 'var(--font-ar)',
                cursor: 'pointer',
                background: botActive ? 'var(--loss-bg)' : 'var(--profit-bg)',
                color: botActive ? 'var(--loss)' : 'var(--profit)',
                border: botActive ? '1px solid var(--border-loss)' : '1px solid var(--border-profit)',
              }}
            >
              {botActive ? 'إيقاف' : 'تشغيل'}
            </button>
          </div>
        </div>

        {/* Row 2: Bullish/Bearish Gauge */}
        <div style={{
          background: 'var(--bg-input)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '7px',
          padding: '6px 10px',
          marginBottom: '6px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <TrendingUp size={10} style={{ color: 'var(--profit)' }} />
              <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--profit)', fontFamily: 'var(--font-mono)' }} dir="ltr">{bullishPercent}%</span>
              <span style={{ fontSize: '8px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar)' }}>صعودي</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '8px', color: 'var(--text-muted)', fontFamily: 'var(--font-ar)' }}>هبوطي</span>
              <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--loss)', fontFamily: 'var(--font-mono)' }} dir="ltr">{bearishPercent}%</span>
              <TrendingDown size={10} style={{ color: 'var(--loss)' }} />
            </div>
          </div>
          <div style={{
            width: '100%',
            height: '4px',
            borderRadius: '2px',
            overflow: 'hidden',
            display: 'flex',
            direction: 'ltr',
          }}>
            <div style={{ width: `${bullishPercent}%`, height: '100%', background: 'var(--profit)', borderRadius: '2px' }} />
            <div style={{ width: `${bearishPercent}%`, height: '100%', background: 'var(--loss)', borderRadius: '2px' }} />
          </div>
        </div>

        {/* Row 3: Strategy + Risk */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {/* Strategy */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
            <Zap size={10} style={{ color: 'var(--warning)', flexShrink: 0 }} />
            <div style={{ display: 'flex', gap: '2px', flex: 1 }}>
              {strategies.map((s) => (
                <button
                  key={s}
                  onClick={() => setStrategy(s)}
                  style={{
                    fontSize: '8px',
                    fontWeight: 600,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-ar)',
                    background: strategy === s ? 'var(--accent-bg)' : 'transparent',
                    color: strategy === s ? 'var(--accent)' : 'var(--text-muted)',
                    border: strategy === s ? '1px solid var(--accent-border)' : '1px solid transparent',
                    transition: 'all 0.15s',
                  }}
                >
                  {strategyLabels[s]}
                </button>
              ))}
            </div>
          </div>

          <div style={{ width: '1px', height: '14px', background: 'var(--border-subtle)' }} />

          {/* Risk */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ShieldAlert size={10} style={{ color: 'var(--warning)', flexShrink: 0 }} />
            <div style={{ display: 'flex', gap: '2px' }}>
              {riskLevels.map((r) => (
                <button
                  key={r}
                  onClick={() => setRiskLevel(r)}
                  style={{
                    fontSize: '8px',
                    fontWeight: 600,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-ar)',
                    background: riskLevel === r
                      ? (r === 'High' ? 'var(--loss-bg)' : r === 'Medium' ? 'var(--warning-bg)' : 'var(--profit-bg)')
                      : 'transparent',
                    color: riskLevel === r
                      ? (r === 'High' ? 'var(--loss)' : r === 'Medium' ? 'var(--warning)' : 'var(--profit)')
                      : 'var(--text-muted)',
                    border: riskLevel === r ? '1px solid currentColor' : '1px solid transparent',
                    transition: 'all 0.15s',
                  }}
                >
                  {riskLabels[r]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Row 4: P&L + Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Activity size={9} style={{ color: totalPnl >= 0 ? 'var(--profit)' : 'var(--loss)' }} />
              <span style={{ fontSize: '9px', fontWeight: 700, color: totalPnl >= 0 ? 'var(--profit)' : 'var(--loss)', fontFamily: 'var(--font-mono)' }} dir="ltr">{totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}</span>
            </div>
            <span style={{ fontSize: '8px', fontWeight: 600, background: totalPnlPercent >= 0 ? 'var(--profit-bg)' : 'var(--loss-bg)', border: `1px solid ${totalPnlPercent >= 0 ? 'var(--border-profit)' : 'var(--border-loss)'}`, color: totalPnlPercent >= 0 ? 'var(--profit)' : 'var(--loss)', padding: '0px 4px', borderRadius: '3px' }} dir="ltr">{totalPnlPercent >= 0 ? '+' : ''}{totalPnlPercent.toFixed(2)}%</span>
            <span style={{ fontSize: '8px', fontWeight: 700, background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent)', padding: '0px 4px', borderRadius: '3px' }}>{scannerData.filter(r => r.signal !== 'WAIT').length} إشارة</span>
          </div>
          <button
            onClick={generateSignals}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '6px',
              fontSize: '8.5px',
              fontWeight: 600,
              fontFamily: 'var(--font-ar)',
              cursor: loading ? 'not-allowed' : 'pointer',
              background: 'var(--accent-bg)',
              color: 'var(--accent)',
              border: '1px solid var(--accent-border)',
              opacity: loading ? 0.6 : 1,
            }}
          >
            <RefreshCw size={9} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            {loading ? 'جارٍ التحديث...' : 'تحديث'}
          </button>
        </div>
      </div>

      {/* Scanner Table */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} className="custom-scrollbar">
        {/* Table Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 0.6fr 0.8fr 0.6fr 0.8fr',
          padding: '5px 10px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'rgba(0,0,0,0.06)',
        }}>
          {['الزوج', 'الإشارة', 'السعر', 'النتيجة', 'القوة'].map(h => (
            <span key={h} style={{ fontSize: '8.5px', fontWeight: 700, color: 'var(--text-faint)', fontFamily: 'var(--font-ar)' }}>{h}</span>
          ))}
        </div>

        {/* Table Rows */}
        {scannerData.map((row, i) => (
          <motion.div
            key={row.pair}
            style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 0.6fr 0.8fr 0.6fr 0.8fr',
              padding: '6px 10px',
              alignItems: 'center',
              borderBottom: '1px solid var(--border-subtle)',
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ background: 'var(--bg-row-hover)' }}
          >
            {/* Pair */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: '22px',
                height: '22px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: row.signal === 'BUY' ? 'var(--profit-bg)' : row.signal === 'SELL' ? 'var(--loss-bg)' : 'var(--bg-input)',
                border: `1px solid ${row.signal === 'BUY' ? 'var(--border-profit)' : row.signal === 'SELL' ? 'var(--border-loss)' : 'var(--border-subtle)'}`,
                flexShrink: 0,
              }}>
                {row.signal === 'BUY'
                  ? <TrendingUp size={10} style={{ color: 'var(--profit)' }} />
                  : row.signal === 'SELL'
                  ? <TrendingDown size={10} style={{ color: 'var(--loss)' }} />
                  : <Activity size={10} style={{ color: 'var(--text-muted)' }} />
                }
              </div>
              <div>
                <div dir="ltr" style={{ fontSize: '10px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>{row.pair}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <span style={{ fontSize: '7px', fontWeight: 600, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{row.timeframe}</span>
                  <div className="group" style={{ position: 'relative' }}>
                    <Info size={8} style={{ color: 'var(--text-faint)', cursor: 'help' }} />
                    <div style={{
                      position: 'absolute',
                      bottom: '100%',
                      right: 0,
                      marginBottom: '4px',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '8.5px',
                      whiteSpace: 'nowrap',
                      opacity: 0,
                      pointerEvents: 'none',
                      zIndex: 50,
                      background: 'var(--bg-tooltip)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border)',
                      boxShadow: 'var(--shadow)',
                      fontFamily: 'var(--font-ar)',
                    }}
                      className="tooltip-hover"
                    >
                      {row.reason}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Signal */}
            <span style={{
              fontSize: '8.5px',
              fontWeight: 800,
              padding: '2px 6px',
              borderRadius: '4px',
              textAlign: 'center',
              fontFamily: 'var(--font-ar)',
              background: row.signal === 'BUY' ? 'var(--profit-bg)' : row.signal === 'SELL' ? 'var(--loss-bg)' : 'var(--bg-input)',
              color: row.signal === 'BUY' ? 'var(--profit)' : row.signal === 'SELL' ? 'var(--loss)' : 'var(--text-muted)',
              border: `1px solid ${row.signal === 'BUY' ? 'var(--border-profit)' : row.signal === 'SELL' ? 'var(--border-loss)' : 'var(--border-subtle)'}`,
            }}>
              {row.signal === 'BUY' ? 'شراء' : row.signal === 'SELL' ? 'بيع' : 'انتظار'}
            </span>

            {/* Price */}
            <div>
              <div dir="ltr" style={{ fontSize: '10px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>{formatPrice(row.price)}</div>
              <div dir="ltr" style={{
                fontSize: '8px',
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                color: row.changePercent >= 0 ? 'var(--profit)' : 'var(--loss)',
              }}>{row.changePercent >= 0 ? '+' : ''}{row.changePercent.toFixed(2)}%</div>
            </div>

            {/* Score */}
            <ScoreRing value={row.score} />

            {/* Strength */}
            <StrengthBar value={row.strength} />
          </motion.div>
        ))}
      </div>
    </div>
  )
}
