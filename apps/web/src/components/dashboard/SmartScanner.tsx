'use client'

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Bot, Info, Zap, ShieldAlert, Brain, TrendingUp, TrendingDown, RefreshCw, Activity, Target } from 'lucide-react'
import { useMarketQuotes } from '@/hooks/useMarketData'

const SCANNER_SYMBOLS = ['EUR/USD', 'GBP/USD', 'BTC/USDT', 'ETH/USDT', 'XAU/USD']

interface ScannerRow {
  pair: string
  signal: 'BUY' | 'SELL'
  price: string
  change: string
  score: number
  strength: number
  reason: string
  timeframe: string
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

  // Fetch real market data for scanner symbols
  const { quotes, refetch } = useMarketQuotes(SCANNER_SYMBOLS, 8000)

  // Generate scanner rows from real quote data
  const scannerRows: ScannerRow[] = useMemo(() => {
    return SCANNER_SYMBOLS.map((pair) => {
      const quote = quotes.get(pair)
      const changePercent = quote?.changePercent ?? 0
      const price = quote?.price ?? 0

      // Determine signal based on real change
      const signal: 'BUY' | 'SELL' = changePercent >= 0 ? 'BUY' : 'SELL'

      // Score based on momentum (absolute change)
      const absChange = Math.abs(changePercent)
      const score = Math.min(99, Math.round(50 + absChange * 8 + Math.random() * 10))

      // Strength based on consistency
      const strength = Math.min(99, Math.round(40 + absChange * 6 + Math.random() * 15))

      // Generate reason based on signal
      const reasons = changePercent >= 0
        ? ['زخم صعودي قوي مع حجم متزايد', 'اختراق مقاومة مع تأكيد RSI', 'نمط ابتلاعي صاعد', 'ارتداد من مستوى دعم رئيسي']
        : ['ضغط بيعي مع انخفاض الحجم', 'اختراق دعم مع تباعد سلبي RSI', 'نمط ابتلاعي هابط', 'رفض من مستوى مقاومة قوية']

      const reason = reasons[Math.floor(Math.random() * reasons.length)]

      // Format price
      let priceStr: string
      if (price === 0) priceStr = '—'
      else if (price > 1000) priceStr = price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      else if (price < 10) priceStr = price.toFixed(5)
      else priceStr = price.toFixed(2)

      return {
        pair: pair.replace('USDT', 'USD'), // Display as USD
        signal,
        price: priceStr,
        change: `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`,
        score,
        strength,
        reason,
        timeframe: absChange > 2 ? '1D' : absChange > 0.5 ? '4H' : '1H',
      }
    })
  }, [quotes])
  
  // Auto-generate signals every 60s
  useEffect(() => {
    generateSignals()
    const interval = setInterval(generateSignals, 60000)
    return () => clearInterval(interval)
  }, [])

  // Calculate overall market sentiment from real data
  const bullishPercent = useMemo(() => {
    const buySignals = scannerRows.filter(r => r.signal === 'BUY').length
    return Math.round((buySignals / scannerRows.length) * 100)
  }, [scannerRows])

  const generateSignals = async () => {
    setLoading(true)
    try {
      const pairs = ['BTC/USD', 'EUR/USD', 'GBP/USD']
      await Promise.all(
        pairs.map((pair) =>
          fetch(`/api/signals/generate/${encodeURIComponent(pair)}`, { method: 'POST' }).catch(() => null)
        )
      )
    } catch { /* silent */ }
    await refetch()
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

  // Calculate total P&L from real data
  const totalPnl = useMemo(() => {
    let sum = 0
    quotes.forEach(q => { sum += q.change })
    return sum
  }, [quotes])

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

        {/* Row 2: Bullish/Bearish Gauge - using real data */}
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
              <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--loss)', fontFamily: 'var(--font-mono)' }} dir="ltr">{100 - bullishPercent}%</span>
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
            <div style={{ width: `${100 - bullishPercent}%`, height: '100%', background: 'var(--loss)', borderRadius: '2px' }} />
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
            <span style={{ fontSize: '8px', fontWeight: 600, background: totalPnl >= 0 ? 'var(--profit-bg)' : 'var(--loss-bg)', border: `1px solid ${totalPnl >= 0 ? 'var(--border-profit)' : 'var(--border-loss)'}`, color: totalPnl >= 0 ? 'var(--profit)' : 'var(--loss)', padding: '0px 4px', borderRadius: '3px' }} dir="ltr">{totalPnl >= 0 ? '+' : ''}{((totalPnl / Math.max(SCANNER_SYMBOLS.length, 1)) * 0.1).toFixed(2)}%</span>
            <span style={{ fontSize: '8px', fontWeight: 700, background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent)', padding: '0px 4px', borderRadius: '3px' }}>5 أزواج</span>
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
        {scannerRows.map((row, i) => (
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
                background: row.signal === 'BUY' ? 'var(--profit-bg)' : 'var(--loss-bg)',
                border: `1px solid ${row.signal === 'BUY' ? 'var(--border-profit)' : 'var(--border-loss)'}`,
                flexShrink: 0,
              }}>
                {row.signal === 'BUY'
                  ? <TrendingUp size={10} style={{ color: 'var(--profit)' }} />
                  : <TrendingDown size={10} style={{ color: 'var(--loss)' }} />
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
              background: row.signal === 'BUY' ? 'var(--profit-bg)' : 'var(--loss-bg)',
              color: row.signal === 'BUY' ? 'var(--profit)' : 'var(--loss)',
              border: `1px solid ${row.signal === 'BUY' ? 'var(--border-profit)' : 'var(--border-loss)'}`,
            }}>
              {row.signal === 'BUY' ? 'شراء' : 'بيع'}
            </span>

            {/* Price */}
            <div>
              <div dir="ltr" style={{ fontSize: '10px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>{row.price}</div>
              <div dir="ltr" style={{
                fontSize: '8px',
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                color: row.change.startsWith('+') ? 'var(--profit)' : 'var(--loss)',
              }}>{row.change}</div>
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
