'use client'

import { useState, useEffect } from 'react'
import { useDashboardStore } from '@/lib/dashboard-store'
import { useSingleQuote } from '@/hooks/useMarketData'
import QuantumOrb from './QuantumOrb'

interface Signal {
  id: string
  pair: string
  action: 'BUY' | 'SELL' | 'WAIT'
  confidence: number
  entryPrice: number | null
  takeProfit: number | null
  stopLoss: number | null
  reason: string
  status: string
  createdAt: string
  expiresAt: string
}

interface BotLogEntry {
  time: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
}

export default function SidebarRight() {
  const {
    selectedPair,
    rightTab,
    setRightTab,
    tradeDirection,
    setTradeDirection,
    botEnabled,
    toggleBot,
  } = useDashboardStore()

  const { quote } = useSingleQuote(selectedPair, 6000)
  const [signals, setSignals] = useState<Signal[]>([])
  const [orderSize, setOrderSize] = useState('')
  const [slPrice, setSlPrice] = useState('')
  const [tpPrice, setTpPrice] = useState('')
  const [leverage, setLeverage] = useState('10')

  // Bot state
  const [botLogs, setBotLogs] = useState<BotLogEntry[]>([])
  const [botStats, setBotStats] = useState({ wins: 0, losses: 0, profit: 0, trades: 0 })

  // Fetch signals
  useEffect(() => {
    const fetchSignals = async () => {
      try {
        const res = await fetch('/api/signals/active')
        const data = await res.json()
        if (data.success && data.data) {
          setSignals(data.data)
        }
      } catch {
        // Use mock data on error
      }
    }
    fetchSignals()
    const iv = setInterval(fetchSignals, 15000)
    return () => clearInterval(iv)
  }, [])

  // Bot logs simulation
  useEffect(() => {
    if (!botEnabled) return
    const messages = [
      { message: 'فحص السوق...', type: 'info' as const },
      { message: 'تم رصد نمط صاعد على BTC', type: 'success' as const },
      { message: 'تحليل RSI: منطقة تشبع بيعي', type: 'info' as const },
      { message: 'إشارة شراء محتملة', type: 'success' as const },
      { message: 'مقاومة عند 68,500', type: 'warning' as const },
    ]
    const addLog = () => {
      const msg = messages[Math.floor(Math.random() * messages.length)]
      setBotLogs(prev => [
        { time: new Date().toLocaleTimeString('ar-EG'), ...msg },
        ...prev.slice(0, 19),
      ])
      setBotStats(prev => ({
        ...prev,
        trades: prev.trades + Math.floor(Math.random() * 2),
        wins: prev.wins + (Math.random() > 0.4 ? 1 : 0),
        losses: prev.losses + (Math.random() > 0.7 ? 1 : 0),
        profit: prev.profit + (Math.random() > 0.5 ? Math.random() * 5 : -Math.random() * 2),
      }))
    }
    addLog()
    const iv = setInterval(addLog, 4000)
    return () => clearInterval(iv)
  }, [botEnabled])

  // Execute order
  const handleExecuteOrder = async () => {
    try {
      const res = await fetch('/api/trading/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedPair,
          side: tradeDirection.toUpperCase(),
          type: 'MARKET',
          quantity: parseFloat(orderSize) || 0.01,
          stopLoss: parseFloat(slPrice) || undefined,
          takeProfit: parseFloat(tpPrice) || undefined,
          leverage: parseInt(leverage) || 10,
        }),
      })
      const data = await res.json()
      if (data.error) {
        alert(data.error)
      }
    } catch {
      // Handle error silently
    }
  }

  // Risk calculator
  const entryPrice = quote?.price ?? 0
  const sl = parseFloat(slPrice) || 0
  const tp = parseFloat(tpPrice) || 0
  const riskReward = entryPrice > 0 && sl > 0 && tp > 0
    ? Math.abs(tp - entryPrice) / Math.abs(entryPrice - sl)
    : 0
  const positionValue = (parseFloat(orderSize) || 0) * entryPrice * (parseInt(leverage) || 1)

  return (
    <div
      className="flex flex-col shrink-0 overflow-hidden"
      style={{
        width: 280,
        background: 'var(--bg2)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Tabs */}
      <div
        className="flex shrink-0"
        style={{
          background: 'var(--bg)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {[
          { id: 'trade' as const, label: 'التداول' },
          { id: 'signals' as const, label: 'الإشارات' },
          { id: 'bot' as const, label: 'البوت' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setRightTab(tab.id)}
            className="flex-1 py-2 cursor-pointer"
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '11px',
              fontWeight: rightTab === tab.id ? 700 : 500,
              color: rightTab === tab.id ? 'var(--blue)' : 'var(--text3)',
              background: rightTab === tab.id ? 'var(--blue3)' : 'transparent',
              borderBottom: rightTab === tab.id ? '2px solid var(--blue)' : '2px solid transparent',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
        {/* Trading Tab */}
        {rightTab === 'trade' && (
          <div className="flex flex-col gap-3">
            {/* Buy/Sell Toggle */}
            <div
              className="flex rounded-lg overflow-hidden"
              style={{ border: '1px solid var(--border)' }}
            >
              <button
                onClick={() => setTradeDirection('buy')}
                className="flex-1 py-2 cursor-pointer"
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: '12px',
                  fontWeight: 700,
                  background: tradeDirection === 'buy' ? 'var(--green2)' : 'var(--bg3)',
                  color: tradeDirection === 'buy' ? 'var(--green)' : 'var(--text3)',
                  border: tradeDirection === 'buy' ? '1px solid rgba(0,255,136,0.2)' : '1px solid transparent',
                }}
              >
                شراء
              </button>
              <button
                onClick={() => setTradeDirection('sell')}
                className="flex-1 py-2 cursor-pointer"
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: '12px',
                  fontWeight: 700,
                  background: tradeDirection === 'sell' ? 'var(--red2)' : 'var(--bg3)',
                  color: tradeDirection === 'sell' ? 'var(--red)' : 'var(--text3)',
                  border: tradeDirection === 'sell' ? '1px solid rgba(255,51,85,0.2)' : '1px solid transparent',
                }}
              >
                بيع
              </button>
            </div>

            {/* Pair */}
            <div>
              <label
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: '10px',
                  color: 'var(--text3)',
                  display: 'block',
                  marginBottom: 4,
                }}
              >
                الزوج
              </label>
              <div
                className="flex items-center px-2 rounded"
                style={{
                  height: 32,
                  background: 'var(--bg3)',
                  border: '1px solid var(--border)',
                }}
              >
                <span
                  className="price"
                  style={{ fontSize: '12px', color: 'var(--blue)', fontWeight: 700 }}
                  dir="ltr"
                >
                  {selectedPair}
                </span>
              </div>
            </div>

            {/* Size */}
            <div>
              <label
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: '10px',
                  color: 'var(--text3)',
                  display: 'block',
                  marginBottom: 4,
                }}
              >
                الحجم
              </label>
              <input
                type="number"
                value={orderSize}
                onChange={(e) => setOrderSize(e.target.value)}
                placeholder="0.01"
                className="w-full px-2 rounded outline-none"
                style={{
                  height: 32,
                  background: 'var(--bg3)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  direction: 'ltr',
                }}
              />
            </div>

            {/* SL / TP row */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: '10px',
                    color: 'var(--text3)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  وقف الخسارة
                </label>
                <input
                  type="number"
                  value={slPrice}
                  onChange={(e) => setSlPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-2 rounded outline-none"
                  style={{
                    height: 32,
                    background: 'var(--bg3)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    direction: 'ltr',
                  }}
                />
              </div>
              <div className="flex-1">
                <label
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: '10px',
                    color: 'var(--text3)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  جني الأرباح
                </label>
                <input
                  type="number"
                  value={tpPrice}
                  onChange={(e) => setTpPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-2 rounded outline-none"
                  style={{
                    height: 32,
                    background: 'var(--bg3)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    direction: 'ltr',
                  }}
                />
              </div>
            </div>

            {/* Leverage */}
            <div>
              <label
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: '10px',
                  color: 'var(--text3)',
                  display: 'block',
                  marginBottom: 4,
                }}
              >
                الرافعة المالية
              </label>
              <input
                type="number"
                value={leverage}
                onChange={(e) => setLeverage(e.target.value)}
                className="w-full px-2 rounded outline-none"
                style={{
                  height: 32,
                  background: 'var(--bg3)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  direction: 'ltr',
                }}
              />
            </div>

            {/* Risk Calculator */}
            <div
              className="p-2 rounded"
              style={{
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: '9px',
                  fontWeight: 700,
                  color: 'var(--text3)',
                  marginBottom: 6,
                  letterSpacing: '0.04em',
                }}
              >
                حاسبة المخاطر
              </div>
              <div className="flex justify-between mb-1">
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '10px', color: 'var(--text3)' }}>
                  نسبة الربح/الخسارة
                </span>
                <span
                  className="price"
                  style={{
                    fontSize: '10px',
                    color: riskReward >= 2 ? 'var(--green)' : riskReward >= 1 ? 'var(--amber)' : 'var(--red)',
                  }}
                  dir="ltr"
                >
                  {riskReward > 0 ? `${riskReward.toFixed(2)}:1` : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '10px', color: 'var(--text3)' }}>
                  قيمة الصفقة
                </span>
                <span
                  className="price"
                  style={{ fontSize: '10px', color: 'var(--text)' }}
                  dir="ltr"
                >
                  ${positionValue > 0 ? positionValue.toFixed(2) : '—'}
                </span>
              </div>
            </div>

            {/* Execute Button */}
            <button
              onClick={handleExecuteOrder}
              className="w-full py-2.5 rounded-lg cursor-pointer"
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: '13px',
                fontWeight: 800,
                background: tradeDirection === 'buy'
                  ? 'linear-gradient(135deg, rgba(0,255,136,0.2), rgba(0,255,136,0.08))'
                  : 'linear-gradient(135deg, rgba(255,51,85,0.2), rgba(255,51,85,0.08))',
                border: `1px solid ${tradeDirection === 'buy' ? 'rgba(0,255,136,0.3)' : 'rgba(255,51,85,0.3)'}`,
                color: tradeDirection === 'buy' ? 'var(--green)' : 'var(--red)',
                textShadow: tradeDirection === 'buy'
                  ? '0 0 12px rgba(0,255,136,0.3)'
                  : '0 0 12px rgba(255,51,85,0.3)',
                transition: 'all 0.2s',
              }}
            >
              {tradeDirection === 'buy' ? '⚡ تنفيذ شراء' : '⚡ تنفيذ بيع'}
            </button>
          </div>
        )}

        {/* Signals Tab */}
        {rightTab === 'signals' && (
          <div className="flex flex-col gap-2">
            {signals.length === 0 ? (
              // Demo signals when no real data
              <>
                {[
                  { pair: 'BTC/USD', action: 'BUY' as const, confidence: 87, entryPrice: 67450, takeProfit: 69200, stopLoss: 66500, reason: 'زخم صعودي قوي', status: 'ACTIVE', id: 'demo1', createdAt: '', expiresAt: '' },
                  { pair: 'ETH/USD', action: 'SELL' as const, confidence: 72, entryPrice: 3520, takeProfit: 3380, stopLoss: 3590, reason: 'ضغط بيعي', status: 'ACTIVE', id: 'demo2', createdAt: '', expiresAt: '' },
                  { pair: 'SOL/USD', action: 'BUY' as const, confidence: 65, entryPrice: 142.5, takeProfit: 155, stopLoss: 136, reason: 'اتجاه صعودي', status: 'ACTIVE', id: 'demo3', createdAt: '', expiresAt: '' },
                  { pair: 'XRP/USD', action: 'BUY' as const, confidence: 58, entryPrice: 0.523, takeProfit: 0.56, stopLoss: 0.50, reason: 'فرصة شراء', status: 'ACTIVE', id: 'demo4', createdAt: '', expiresAt: '' },
                ].map((sig, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded"
                    style={{
                      background: 'var(--bg3)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="price"
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            color: 'var(--text)',
                          }}
                          dir="ltr"
                        >
                          {sig.pair}
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '9px',
                            fontWeight: 700,
                            color: sig.action === 'BUY' ? 'var(--green)' : 'var(--red)',
                            background: sig.action === 'BUY' ? 'var(--green2)' : 'var(--red2)',
                            padding: '1px 6px',
                            borderRadius: 3,
                          }}
                        >
                          {sig.action === 'BUY' ? '▲ شراء' : '▼ بيع'}
                        </span>
                      </div>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: sig.confidence >= 75 ? 'var(--green)' : sig.confidence >= 60 ? 'var(--amber)' : 'var(--text2)',
                        }}
                      >
                        {sig.confidence}%
                      </span>
                    </div>
                    {/* Confidence bar */}
                    <div
                      className="mb-2"
                      style={{
                        height: 3,
                        background: 'var(--bg)',
                        borderRadius: 2,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${sig.confidence}%`,
                          background: sig.confidence >= 75
                            ? 'var(--green)'
                            : sig.confidence >= 60
                            ? 'var(--amber)'
                            : 'var(--text3)',
                          borderRadius: 2,
                          transition: 'width 0.5s',
                        }}
                      />
                    </div>
                    <div className="flex justify-between">
                      <span className="price" style={{ fontSize: '9px', color: 'var(--text3)' }} dir="ltr">
                        دخول: {sig.entryPrice}
                      </span>
                      <span className="price" style={{ fontSize: '9px', color: 'var(--green)' }} dir="ltr">
                        هدف: {sig.takeProfit}
                      </span>
                      <span className="price" style={{ fontSize: '9px', color: 'var(--red)' }} dir="ltr">
                        وقف: {sig.stopLoss}
                      </span>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              signals.map((sig) => (
                <div
                  key={sig.id}
                  className="p-2.5 rounded"
                  style={{
                    background: 'var(--bg3)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="price"
                        style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text)' }}
                        dir="ltr"
                      >
                        {sig.pair}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '9px',
                          fontWeight: 700,
                          color: sig.action === 'BUY' ? 'var(--green)' : 'var(--red)',
                          background: sig.action === 'BUY' ? 'var(--green2)' : 'var(--red2)',
                          padding: '1px 6px',
                          borderRadius: 3,
                        }}
                      >
                        {sig.action === 'BUY' ? '▲ شراء' : '▼ بيع'}
                      </span>
                    </div>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: sig.confidence >= 75 ? 'var(--green)' : 'var(--amber)',
                      }}
                    >
                      {sig.confidence}%
                    </span>
                  </div>
                  <div
                    style={{ height: 3, background: 'var(--bg)', borderRadius: 2, overflow: 'hidden' }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${sig.confidence}%`,
                        background: sig.confidence >= 75 ? 'var(--green)' : 'var(--amber)',
                        borderRadius: 2,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Bot Tab */}
        {rightTab === 'bot' && (
          <div className="flex flex-col gap-3">
            {/* On/Off Toggle */}
            <div
              className="flex items-center justify-between p-2.5 rounded"
              style={{
                background: botEnabled ? 'var(--green2)' : 'var(--bg3)',
                border: `1px solid ${botEnabled ? 'rgba(0,255,136,0.2)' : 'var(--border)'}`,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: botEnabled ? 'var(--green)' : 'var(--text2)',
                  }}
                >
                  روبوت التداول
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: '9px',
                    color: 'var(--text3)',
                  }}
                >
                  {botEnabled ? 'نشط - يراقب الأسواق' : 'متوقف'}
                </div>
              </div>
              <button
                onClick={toggleBot}
                className="px-3 py-1 rounded-lg cursor-pointer"
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: '10px',
                  fontWeight: 700,
                  background: botEnabled ? 'var(--green2)' : 'var(--blue2)',
                  border: `1px solid ${botEnabled ? 'rgba(0,255,136,0.3)' : 'var(--border2)'}`,
                  color: botEnabled ? 'var(--green)' : 'var(--blue)',
                }}
              >
                {botEnabled ? 'إيقاف' : 'تشغيل'}
              </button>
            </div>

            {/* Performance Stats */}
            <div
              className="grid grid-cols-2 gap-2"
            >
              {[
                { label: 'الصفقات', value: botStats.trades.toString(), color: 'var(--blue)' },
                { label: 'الأرباح', value: botStats.wins.toString(), color: 'var(--green)' },
                { label: 'الخسائر', value: botStats.losses.toString(), color: 'var(--red)' },
                { label: 'صافي الربح', value: `$${botStats.profit.toFixed(1)}`, color: botStats.profit >= 0 ? 'var(--green)' : 'var(--red)' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="p-2 rounded text-center"
                  style={{
                    background: 'var(--bg3)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div
                    className="price"
                    style={{ fontSize: '14px', fontWeight: 700, color: stat.color }}
                    dir="ltr"
                  >
                    {stat.value}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-ui)',
                      fontSize: '9px',
                      color: 'var(--text3)',
                    }}
                  >
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Quantum Orb */}
            <div className="flex justify-center py-2">
              <QuantumOrb
                priceChange={quote?.changePercent ?? 0}
                size={120}
              />
            </div>

            {/* Operation Log */}
            <div
              className="rounded overflow-hidden"
              style={{
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
              }}
            >
              <div
                className="px-2 py-1.5"
                style={{
                  background: 'var(--bg)',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: '9px',
                    fontWeight: 700,
                    color: 'var(--text3)',
                  }}
                >
                  سجل العمليات
                </span>
              </div>
              <div
                className="p-2 max-h-40 overflow-y-auto custom-scrollbar"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '9px' }}
              >
                {botLogs.length === 0 ? (
                  <div style={{ color: 'var(--text3)', textAlign: 'center', padding: '8px 0' }}>
                    قم بتشغيل البوت لعرض السجل
                  </div>
                ) : (
                  botLogs.map((log, i) => (
                    <div
                      key={i}
                      className="flex gap-2 py-0.5"
                      style={{
                        color: log.type === 'success'
                          ? 'var(--green)'
                          : log.type === 'warning'
                          ? 'var(--amber)'
                          : log.type === 'error'
                          ? 'var(--red)'
                          : 'var(--text2)',
                      }}
                    >
                      <span className="price shrink-0" style={{ color: 'var(--text4)' }} dir="ltr">
                        {log.time}
                      </span>
                      <span style={{ fontFamily: 'var(--font-ui)' }}>{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
