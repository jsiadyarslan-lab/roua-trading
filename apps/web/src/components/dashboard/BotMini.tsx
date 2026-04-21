'use client'

import { useState, useEffect } from 'react'
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

export function BotMini() {
  const [isActive, setIsActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ pnl: 0, winRate: 0, trades: 0, strategy: '', name: '' })
  const [statusMsg, setStatusMsg] = useState('يرجى الانتظار...')

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
      }
    }
    load()
  }, [])

  const toggleBot = async () => {
    const newState = !isActive
    setIsActive(newState) // Optimistic
    setStatusMsg('جاري تحديث الخادم...')
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
    return <div style={{ color: T.text2, fontSize: 11, textAlign: 'center', padding: 30 }}>جارٍ تهيئة البوت...</div>
  }

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      padding: '16px 12px', boxSizing: 'border-box', background: T.bg
    }}>
      
      {/* ─── Top Header: Toggle (Left) & Title (Right) ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        
        {/* Toggle Switch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div 
            onClick={toggleBot}
            style={{ 
              width: 38, height: 20, borderRadius: 10, cursor: 'pointer',
              background: isActive ? `${T.cyan}30` : T.bg2,
              border: `1px solid ${isActive ? T.cyan : T.border}`,
              position: 'relative', transition: '0.3s ease'
             }}
          >
             <div style={{
               position: 'absolute', top: 2, bottom: 2, width: 14, borderRadius: '50%',
               background: isActive ? T.cyan : T.text3,
               left: isActive ? 'auto' : 3, right: isActive ? 3 : 'auto',
               transition: '0.3s ease', boxShadow: isActive ? `0 0 8px ${T.cyan}` : 'none'
             }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? T.cyan : T.text3, fontFamily: "'Cairo', sans-serif" }}>
             {isActive ? 'يعمل' : 'متوقف'} ●
          </span>
        </div>

        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: T.text, fontFamily: "'Cairo', sans-serif" }}>البوت</span>
          <Cpu size={16} color={isActive ? T.cyan : T.text2} style={{ filter: isActive ? `drop-shadow(0 0 6px ${T.cyan})` : 'none' }} />
        </div>
      </div>

      {/* ─── Strategy Selector Dropdown ─── */}
      <div style={{
        background: T.card, border: `0.5px solid ${T.border}`, borderRadius: 8,
        padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        cursor: 'pointer', marginBottom: 20, transition: '0.2s'
      }} onMouseEnter={e => e.currentTarget.style.borderColor = T.cyan} onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
         <ChevronDown size={14} color={T.text2} />
         <span style={{ fontSize: 12, fontWeight: 800, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>
           {stats.strategy || 'EMA Cross'} (68%) 📈
         </span>
      </div>

      {/* ─── Metrics Grid ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
        {/* Metric 1 */}
        <div style={{ background: T.bg2, padding: '10px', borderRadius: 8, border: `0.5px solid ${T.border}` }}>
          <div style={{ fontSize: 10, color: T.text3, marginBottom: 4, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>الربح (P&L)</div>
          <div style={{ fontSize: 14, fontWeight: 900, color: stats.pnl >= 0 ? T.green : T.red, fontFamily: "'JetBrains Mono', monospace" }}>
            {stats.pnl >= 0 ? '+' : ''}${stats.pnl.toFixed(2)}
          </div>
        </div>
        {/* Metric 2 */}
        <div style={{ background: T.bg2, padding: '10px', borderRadius: 8, border: `0.5px solid ${T.border}` }}>
          <div style={{ fontSize: 10, color: T.text3, marginBottom: 4, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>معدل الفوز</div>
          <div style={{ fontSize: 14, fontWeight: 900, color: T.text, fontFamily: "'JetBrains Mono', monospace" }}>{stats.winRate.toFixed(1)}%</div>
        </div>
      </div>

      {/* ─── Action Buttons ─── */}
      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        <button 
          onClick={toggleBot}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            height: 36, borderRadius: 6, border: `0.5px solid ${isActive ? T.red + '40' : T.green + '40'}`,
            background: isActive ? `${T.red}10` : `${T.green}10`,
            color: isActive ? T.red : T.green, cursor: 'pointer',
            fontSize: 11, fontWeight: 800, transition: '0.2s', fontFamily: "'Cairo', sans-serif"
          }}
        >
          {isActive ? <><Square size={12} fill="currentColor" /> إيقاف المحرك</> : <><Play size={12} fill="currentColor" /> تشغيل المحرك</>}
        </button>
        <button style={{
          width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 6, background: T.bg2, border: `0.5px solid ${T.border}`, color: T.text2,
          cursor: 'pointer', transition: '0.2s'
        }} onMouseEnter={e => e.currentTarget.style.color = T.cyan} onMouseLeave={e => e.currentTarget.style.color = T.text2}>
          <Settings2 size={14} />
        </button>
      </div>

      {/* ─── Status Logs ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, borderTop: `0.5px solid ${T.border}`, paddingTop: 8 }}>
        <span style={{ fontSize: 9, color: T.text3, fontFamily: "'JetBrains Mono', monospace" }}>{statusMsg}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
           <span style={{ fontSize: 9, color: isActive ? T.cyan : T.text3, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>متصل</span>
           <Activity size={10} color={isActive ? T.cyan : T.text3} />
        </div>
      </div>
    </div>
  )
}
