'use client'

import { useState, useEffect, useRef } from 'react'
import { Play, Square, Settings2, Activity, Cpu, ChevronDown } from 'lucide-react'

const T = {
  bg:      '#04050C',
  bg2:     '#0D1117',
  card:    '#08090F',
  border:  'rgba(10,132,255,0.12)',
  blue:    '#0A84FF',
  cyan:    '#00C8FF',
  green:   '#00FFC6',
  red:     '#FF4D4D',
  purple:  '#B388FF',
  text:    '#E6EBF5',
  text2:   '#8090A8',
  text3:   '#A0AFC3',
}

const FAKE_LOGS = [
  "Initializing Alpha-Scalp...",
  "Loading market matrix...",
  "OrderBook synchronized.",
  "Liquidity pool at $64,200 detected.",
  "Awaiting momentum trigger...",
  "Spread variance within bounds.",
  "RSI convergence verified.",
  "Executing shadow-ping test...",
  "All systems nominal."
]

const FAKE_ACTIVE_LOGS = [
  "Bids clustered at VWAP...",
  "Executing microscopic BUY 0.05...",
  "Filled @ market.",
  "Setting stop-loss -10 pips.",
  "Trailing activated.",
  "Volume spike detected...",
  "Closing position. +1.2 pips.",
  "Re-evaluating trend..."
]

export function BotMini() {
  const [isActive, setIsActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ pnl: 0, winRate: 0, trades: 0, strategy: '', name: '' })
  const [statusMsg, setStatusMsg] = useState('يرجى الانتظار...')
  
  const [logs, setLogs] = useState<string[]>([])
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/trading/bot')
        const j = await res.json()
        if (j.success && j.data) {
          setIsActive(j.data.isActive)
          setStats({
            pnl: j.data.dailyPnl,
            winRate: j.data.winRate,
            trades: j.data.totalTrades,
            strategy: j.data.strategy,
            name: j.data.name
          })
          setStatusMsg(j.data.statusMessage)
        }
      } catch (e) {
        setStatusMsg('خطأ في الاتصال')
      } finally {
        setLoading(false)
        setLogs(["[SYSTEM] Engine connected to backend."])
      }
    }
    load()
  }, [])

  // Terminal Log Generator Effect
  useEffect(() => {
    if (loading) return
    const interval = setInterval(() => {
      const source = isActive ? FAKE_ACTIVE_LOGS : FAKE_LOGS
      const newLog = source[Math.floor(Math.random() * source.length)]
      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false })
      
      setLogs(prev => {
        const next = [...prev, `[${timestamp}] ${newLog}`]
        if (next.length > 20) next.shift() // Keep array small
        return next
      })
    }, isActive ? 1500 : 4000) // Much faster if active

    return () => clearInterval(interval)
  }, [isActive, loading])

  // Scroll to bottom of logs
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

  const toggleBot = async () => {
    const newState = !isActive
    setIsActive(newState)
    setStatusMsg('جاري تحديث الخادم...')
    setLogs(prev => [...prev, `[USER] Bot state change requested -> ${newState ? 'START' : 'STOP'}`])
    try {
      const res = await fetch('/api/trading/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newState })
      })
      const j = await res.json()
      if (j.success) {
        setStatusMsg(newState ? 'المحرك نشط' : 'نظام متوقف')
      } else {
        setIsActive(!newState)
        setStatusMsg('فشل في التعديل')
      }
    } catch {
      setIsActive(!newState)
      setStatusMsg('خطأ شبكة')
    }
  }

  if (loading) {
    return <div style={{ color: T.text2, fontSize: 10, textAlign: 'center', padding: 30 }}>Initiating Bot Core...</div>
  }

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      padding: '12px', boxSizing: 'border-box', background: T.bg
    }}>
      
      {/* ─── Top Header: Minimalist ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        
        {/* Toggle Switch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div 
            onClick={toggleBot}
            style={{ 
              width: 32, height: 16, borderRadius: 8, cursor: 'pointer',
              background: isActive ? `${T.cyan}20` : T.bg2,
              border: `0.5px solid ${isActive ? T.cyan : T.border}`,
              position: 'relative', transition: '0.3s ease'
             }}
          >
             <div style={{
               position: 'absolute', top: 1, bottom: 1, width: 12, borderRadius: '50%',
               background: isActive ? T.cyan : T.text3,
               left: isActive ? 'auto' : 2, right: isActive ? 2 : 'auto',
               transition: '0.3s ease', boxShadow: isActive ? `0 0 6px ${T.cyan}` : 'none'
             }} />
          </div>
          <span style={{ fontSize: 9, fontWeight: 700, color: isActive ? T.cyan : T.text3, fontFamily: "'Cairo', sans-serif" }}>
             {isActive ? 'يعمل' : 'متوقف'}
          </span>
        </div>

        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 900, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{stats.name || 'HFT-Bot'}</span>
          <Cpu size={12} color={isActive ? T.cyan : T.text2} style={{ filter: isActive ? `drop-shadow(0 0 4px ${T.cyan})` : 'none' }} />
        </div>
      </div>

      {/* ─── Strategy Selector Dropdown (Sleek) ─── */}
      <div style={{
        background: T.bg2, border: `0.5px solid ${T.border}`, borderRadius: 4,
        padding: '6px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        cursor: 'pointer', marginBottom: 12, transition: '0.2s'
      }} onMouseEnter={e => e.currentTarget.style.borderColor = T.cyan} onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
         <ChevronDown size={12} color={T.text2} />
         <span style={{ fontSize: 10, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
           {stats.strategy || 'EMA_CROSS_V2'} <span style={{color: T.purple}}>[68%]</span>
         </span>
      </div>

      {/* ─── Metrics Grid (Institutional Style) ─── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, borderLeft: `2px solid ${stats.pnl >= 0 ? T.green : T.red}`, paddingLeft: 6 }}>
          <div style={{ fontSize: 9, color: T.text3, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>P&L اليومي</div>
          <div style={{ fontSize: 12, fontWeight: 900, color: stats.pnl >= 0 ? T.green : T.red, fontFamily: "'JetBrains Mono', monospace" }}>
            {stats.pnl >= 0 ? '+' : ''}${stats.pnl.toFixed(2)}
          </div>
        </div>
        <div style={{ flex: 1, borderLeft: `2px solid ${T.blue}`, paddingLeft: 6 }}>
          <div style={{ fontSize: 9, color: T.text3, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>معدل الفوز</div>
          <div style={{ fontSize: 12, fontWeight: 900, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{stats.winRate.toFixed(1)}%</div>
        </div>
      </div>

      {/* ─── Action Buttons (Small & Professional) ─── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button 
          onClick={toggleBot}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            height: 24, borderRadius: 4, border: `0.5px solid ${isActive ? T.red + '40' : T.green + '40'}`,
            background: isActive ? `${T.red}0A` : `${T.green}0A`,
            color: isActive ? T.red : T.green, cursor: 'pointer',
            fontSize: 9, fontWeight: 800, transition: '0.2s', fontFamily: "'Cairo', sans-serif"
          }}
        >
          {isActive ? <><Square size={10} fill="currentColor" /> إيقاف المحرك</> : <><Play size={10} fill="currentColor" /> تشغيل المحرك</>}
        </button>
        <button style={{
          width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 4, background: T.bg2, border: `0.5px solid ${T.border}`, color: T.text2,
          cursor: 'pointer', transition: '0.2s'
        }} onMouseEnter={e => e.currentTarget.style.color = T.cyan} onMouseLeave={e => e.currentTarget.style.color = T.text2}>
          <Settings2 size={12} />
        </button>
      </div>

      {/* ─── Live ExecTerminal (The "Alive" Component) ─── */}
      <div 
        ref={logRef}
        style={{ 
          flex: 1, background: '#020204', border: `0.5px solid ${T.border}`, 
          borderRadius: 4, padding: '8px', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 4,
          boxShadow: 'inset 0 0 10px rgba(0,0,0,0.8)'
        }}>
         <style>{`
           .terminal-text {
             font-family: 'JetBrains Mono', monospace;
             font-size: 8px;
             line-height: 1.3;
             color: ${T.text3};
             word-break: break-all;
           }
           .terminal-text:last-child {
             color: ${isActive ? T.cyan : T.text2};
             font-weight: bold;
           }
         `}</style>
         {logs.map((log, i) => (
           <div key={i} className="terminal-text">
             <span style={{ color: T.green, marginRight: 4 }}>►</span> {log}
           </div>
         ))}
      </div>

      {/* ─── Minimal Bottom Status ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: 8, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>{statusMsg}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
           <span style={{ fontSize: 8, color: isActive ? T.cyan : T.text3, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>متصل</span>
           <Activity size={8} color={isActive ? T.cyan : T.text3} style={{ animation: isActive ? 'pulse 2s infinite' : 'none' }} />
        </div>
      </div>
    </div>
  )
}
